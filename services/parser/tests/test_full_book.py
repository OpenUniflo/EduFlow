from __future__ import annotations

import os
import json
from pathlib import Path

import pytest
from docling.document_converter import DocumentConverter

from eduflow_parser.adapter import adapt_docling_artifact

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "fixtures" / "phase4-agentic-ai" / "corpus" / "AI-Agents-in-Depth-zh-CN-v1.4.pdf"
GOLD = ROOT / "fixtures" / "phase4-agentic-ai" / "gold" / "parsing"


@pytest.mark.full_book
@pytest.mark.skipif(os.getenv("EDUFLOW_RUN_FULL_BOOK") != "1", reason="opt-in 307-page verification")
def test_canonical_full_book_structure_and_provenance() -> None:
    structure_gold = json.loads((GOLD / "document-structure.json").read_text())
    locations_gold = json.loads((GOLD / "source-locations.json").read_text())
    raw = DocumentConverter().convert(SOURCE).document.export_to_dict()
    material = adapt_docling_artifact(raw, "canonical-agent-book").to_dict()
    expected_pages = structure_gold["canonicalCorpus"]["expectedPdfPages"]
    assert sorted(map(int, raw["pages"])) == list(range(1, expected_pages + 1))

    section_titles = {section["title"] for section in material["sections"]}
    expected_chapters = {
        f"第 {chapter['number']} 章 {chapter['title']}"
        for chapter in structure_gold["canonicalCorpus"]["expectedTopLevelChapters"]
    }
    assert expected_chapters <= section_titles

    for case in locations_gold["cases"]:
        if not case["file"].startswith("corpus/"):
            continue
        block = next(block for block in material["blocks"] if case["expectedTextContains"] in block["text"])
        assert block["source"]["page"] == case["source"]["pdfPage"]

    kinds_by_third = []
    for start, end in ((1, 102), (103, 204), (205, 307)):
        kinds_by_third.append({
            block["kind"] for block in material["blocks"]
            if start <= block["source"].get("page", 0) <= end
        })
    assert all({"heading", "paragraph", "picture"} <= kinds for kinds in kinds_by_third)
    assert {"table", "code"} <= {block["kind"] for block in material["blocks"]}
    assert material["chunks"]
