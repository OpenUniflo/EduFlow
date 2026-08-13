from __future__ import annotations

import json
from typing import Any

import pytest

from eduflow_parser import job_worker
from eduflow_parser.adapter import adapt_docling_artifact


class FakeBoundary:
    def __init__(self) -> None:
        self.status = "pending"
        self.attempt = 0
        self.raw_path: str | None = None
        self.normalized_path: str | None = None
        self.artifacts: dict[str, bytes] = {}
        self.events: list[str] = []

    def json_request(self, path: str, body: dict[str, object]) -> object:
        if path.endswith("claim_material_parsing_job"):
            assert self.status == "pending"
            self.status = "running"
            self.attempt += 1
            self.raw_path = None
            self.normalized_path = None
            self.events.append("claim")
            return {
                "attempt": self.attempt,
                "material_id": "material-1",
                "source_storage_path": "shared/course/material.pdf",
            }
        if path.endswith("complete_material_parsing_job"):
            assert self.status == "running"
            assert body["expected_attempt"] == self.attempt
            self.status = "completed"
            self.raw_path = str(body["raw_path"])
            self.normalized_path = str(body["normalized_path"])
            self.events.append("complete")
            return None
        if path.endswith("fail_material_parsing_job"):
            assert self.status == "running"
            assert body["expected_attempt"] == self.attempt
            self.status = "failed"
            self.raw_path = body["raw_path"] if isinstance(body["raw_path"], str) else None
            self.normalized_path = None
            self.events.append("fail")
            return None
        raise AssertionError(path)

    def download_source(self, path: str) -> bytes:
        assert path == "shared/course/material.pdf"
        self.events.append("download")
        return b"source"

    def upload_artifact(self, path: str, content: bytes) -> None:
        self.events.append(f"upload:{path.rsplit('/', 1)[-1]}")
        self.artifacts[path] = content

    def retry(self) -> None:
        assert self.status in {"completed", "failed"}
        self.status = "pending"
        self.raw_path = None
        self.normalized_path = None


def install_parser(monkeypatch: pytest.MonkeyPatch, *, fail_normalize: bool) -> None:
    def convert_source(_: object) -> dict[str, Any]:
        return {"schema_name": "DoclingDocument", "body": {}, "origin": {"filename": "material.pdf"}}

    def normalize_artifact(_: object, __: str) -> dict[str, object]:
        if fail_normalize:
            raise ValueError("adapter failed")
        return {"schemaVersion": "course-material-v1"}

    monkeypatch.setattr(job_worker, "convert_source", convert_source)
    monkeypatch.setattr(job_worker, "normalize_artifact", normalize_artifact)


def test_adapter_failure_preserves_uploaded_raw_artifact(monkeypatch: pytest.MonkeyPatch) -> None:
    boundary = FakeBoundary()
    install_parser(monkeypatch, fail_normalize=True)

    with pytest.raises(ValueError, match="adapter failed"):
        job_worker.run_job("job-1", boundary)  # type: ignore[arg-type]

    assert boundary.status == "failed"
    assert boundary.raw_path == "jobs/job-1/attempt-1/raw.json"
    assert boundary.raw_path in boundary.artifacts
    assert boundary.normalized_path is None
    assert not any(path.endswith("normalized.json") for path in boundary.artifacts)
    assert boundary.events.index("upload:raw.json") < boundary.events.index("fail")
    saved_raw = json.loads(boundary.artifacts[boundary.raw_path])
    assert adapt_docling_artifact(saved_raw, "material-1").schema_version == "course-material-v1"


def test_failed_retry_never_points_to_previous_completed_normalized_artifact(monkeypatch: pytest.MonkeyPatch) -> None:
    boundary = FakeBoundary()
    install_parser(monkeypatch, fail_normalize=False)
    job_worker.run_job("job-1", boundary)  # type: ignore[arg-type]
    previous_normalized = boundary.normalized_path
    assert boundary.status == "completed"
    assert previous_normalized == "jobs/job-1/attempt-1/normalized.json"

    boundary.retry()
    install_parser(monkeypatch, fail_normalize=True)
    with pytest.raises(ValueError, match="adapter failed"):
        job_worker.run_job("job-1", boundary)  # type: ignore[arg-type]

    assert boundary.status == "failed"
    assert boundary.raw_path == "jobs/job-1/attempt-2/raw.json"
    assert boundary.normalized_path is None
    assert previous_normalized in boundary.artifacts
