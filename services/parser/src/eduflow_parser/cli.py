"""Single-shot parser worker and raw-artifact renormalizer."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from docling.document_converter import DocumentConverter
from docling.exceptions import ConversionError

from .adapter import InvalidRawArtifact, adapt_docling_artifact


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def parse(source: Path, raw_output: Path, normalized_output: Path, material_id: str) -> None:
    raw = DocumentConverter().convert(source).document.export_to_dict()
    _write_json(raw_output, raw)
    normalized = adapt_docling_artifact(raw, material_id)
    _write_json(normalized_output, normalized.to_dict())


def normalize(raw_input: Path, normalized_output: Path, material_id: str) -> None:
    raw = json.loads(raw_input.read_text(encoding="utf-8"))
    _write_json(normalized_output, adapt_docling_artifact(raw, material_id).to_dict())


def main() -> None:
    parser = argparse.ArgumentParser(prog="eduflow-parser")
    commands = parser.add_subparsers(dest="command", required=True)
    parse_command = commands.add_parser("parse")
    parse_command.add_argument("source", type=Path)
    parse_command.add_argument("raw_output", type=Path)
    parse_command.add_argument("normalized_output", type=Path)
    parse_command.add_argument("--material-id", required=True)
    normalize_command = commands.add_parser("normalize")
    normalize_command.add_argument("raw_input", type=Path)
    normalize_command.add_argument("normalized_output", type=Path)
    normalize_command.add_argument("--material-id", required=True)
    args = parser.parse_args()
    try:
        if args.command == "parse":
            parse(args.source, args.raw_output, args.normalized_output, args.material_id)
        else:
            normalize(args.raw_input, args.normalized_output, args.material_id)
    except (ConversionError, InvalidRawArtifact, OSError, json.JSONDecodeError) as error:
        print(json.dumps({"code": "material_parse_failed", "message": str(error).splitlines()[0]}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
