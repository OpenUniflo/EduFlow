"""Single-job Supabase worker boundary; no scheduler or polling framework."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import os
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from .cli import parse


class WorkerError(RuntimeError):
    pass


class SupabaseBoundary:
    def __init__(self, url: str, secret: str) -> None:
        self.url = url.rstrip("/")
        self.headers = {"apikey": secret, "Authorization": f"Bearer {secret}"}

    def json_request(self, path: str, body: dict[str, object]) -> object:
        request = urllib.request.Request(
            f"{self.url}{path}", data=json.dumps(body).encode(), method="POST",
            headers={**self.headers, "Content-Type": "application/json"},
        )
        return json.loads(self._open(request).decode() or "null")

    def download_source(self, path: str) -> bytes:
        encoded = urllib.parse.quote(path, safe="/")
        return self._open(urllib.request.Request(f"{self.url}/storage/v1/object/authenticated/course-materials/{encoded}", headers=self.headers))

    def upload_artifact(self, path: str, content: bytes) -> None:
        encoded = urllib.parse.quote(path, safe="/")
        request = urllib.request.Request(
            f"{self.url}/storage/v1/object/material-parser-artifacts/{encoded}", data=content, method="POST",
            headers={**self.headers, "Content-Type": "application/json", "x-upsert": "true"},
        )
        self._open(request)

    @staticmethod
    def _open(request: urllib.request.Request) -> bytes:
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")[:500]
            raise WorkerError(f"Supabase request failed ({error.code}): {detail}") from None


def _safe_message(error: Exception) -> str:
    message = str(error).splitlines()[0]
    message = re.sub(r"(?:/[^\s:]+)+", "<internal-path>", message)
    return message[:1000] or type(error).__name__


def run_job(job_id: str, boundary: SupabaseBoundary) -> None:
    claimed = boundary.json_request("/rest/v1/rpc/claim_material_parsing_job", {"target_id": job_id})
    if not isinstance(claimed, dict):
        raise WorkerError("Claim RPC returned an invalid job")
    attempt = int(claimed["attempt"])
    try:
        source = boundary.download_source(str(claimed["source_storage_path"]))
        source_hash = hashlib.sha256(source).hexdigest()
        suffix = Path(str(claimed["source_storage_path"])).suffix
        with tempfile.TemporaryDirectory(prefix="eduflow-parser-") as directory:
            root = Path(directory)
            source_path = root / f"source{suffix}"
            raw_path = root / "raw.json"
            normalized_path = root / "normalized.json"
            source_path.write_bytes(source)
            # Docling may log temporary local paths before raising. The worker emits only its sanitized result.
            with contextlib.redirect_stderr(io.StringIO()):
                parse(source_path, raw_path, normalized_path, str(claimed["material_id"]))
            artifact_root = f"jobs/{job_id}/attempt-{attempt}"
            raw_artifact = f"{artifact_root}/raw.json"
            normalized_artifact = f"{artifact_root}/normalized.json"
            boundary.upload_artifact(raw_artifact, raw_path.read_bytes())
            boundary.upload_artifact(normalized_artifact, normalized_path.read_bytes())
        boundary.json_request("/rest/v1/rpc/complete_material_parsing_job", {
            "target_id": job_id, "expected_attempt": attempt, "parsed_source_sha256": source_hash,
            "raw_path": raw_artifact, "normalized_path": normalized_artifact,
        })
    except Exception as error:
        boundary.json_request("/rest/v1/rpc/fail_material_parsing_job", {
            "target_id": job_id, "expected_attempt": attempt, "failure_code": "material_parse_failed", "failure_message": _safe_message(error),
        })
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("job_id")
    args = parser.parse_args()
    url, secret = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SECRET_KEY")
    if not url or not secret:
        raise SystemExit("SUPABASE_URL and SUPABASE_SECRET_KEY are required")
    try:
        run_job(args.job_id, SupabaseBoundary(url, secret))
    except Exception as error:
        print(json.dumps({"code": "material_parse_failed", "message": _safe_message(error)}, ensure_ascii=False))
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
