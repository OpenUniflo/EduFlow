from __future__ import annotations

import json
from pathlib import Path

import pytest
from docling.document_converter import DocumentConverter
from docling.exceptions import ConversionError

from eduflow_parser.adapter import adapt_docling_artifact

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "fixtures" / "phase4-agentic-ai"
SOURCE_GOLD = json.loads((FIXTURES / "gold" / "parsing" / "source-locations.json").read_text())


def gold_case(case_id: str) -> dict[str, object]:
    return next(case for case in SOURCE_GOLD["cases"] if case["id"] == case_id)


@pytest.fixture(scope="session")
def parsed() -> dict[str, tuple[dict[str, object], dict[str, object]]]:
    converter = DocumentConverter()
    values: dict[str, tuple[dict[str, object], dict[str, object]]] = {}
    for source_type in ("pdf", "pptx", "docx"):
        source = FIXTURES / "fixtures" / f"representative-agent-course.{source_type}"
        raw = converter.convert(source).document.export_to_dict()
        normalized = adapt_docling_artifact(raw, f"fixture-{source_type}").to_dict()
        values[source_type] = (raw, normalized)
    return values


def find_block(material: dict[str, object], text: str) -> dict[str, object]:
    return next(block for block in material["blocks"] if text in block["text"])  # type: ignore[index,union-attr]


def test_real_pdf_structure_and_page_provenance(parsed: dict[str, tuple[dict[str, object], dict[str, object]]]) -> None:
    raw, material = parsed["pdf"]
    assert sorted(map(int, raw["pages"])) == [1, 2, 3]  # type: ignore[arg-type]
    assert {block["kind"] for block in material["blocks"]} >= {"heading", "paragraph", "table", "picture"}  # type: ignore[index,union-attr]
    code_block = find_block(material, "def react_loop(task)")
    # Docling 2.119 labels this visual block as code on macOS and paragraph on Ubuntu CPU.
    # Content, provenance, and chunk membership are the stable CourseMaterial contract.
    assert code_block["kind"] in {"code", "paragraph"}
    assert code_block["source"]["page"] == 2
    assert any(code_block["id"] in chunk["blockIds"] for chunk in material["chunks"])  # type: ignore[index,union-attr]
    case = gold_case("small-pdf-table")
    assert find_block(material, str(case["expectedTextContains"]))["source"]["page"] == case["source"]["pdfPage"]  # type: ignore[index]
    assert all(block["source"]["page"] in {1, 2, 3} for block in material["blocks"])  # type: ignore[index,union-attr]


def test_real_pptx_structure_and_slide_provenance(parsed: dict[str, tuple[dict[str, object], dict[str, object]]]) -> None:
    raw, material = parsed["pptx"]
    assert sorted(map(int, raw["pages"])) == [1, 2, 3, 4, 5]  # type: ignore[arg-type]
    assert len(material["sections"]) == 5  # type: ignore[arg-type]
    case = gold_case("small-pptx-slide-3")
    assert find_block(material, str(case["expectedTextContains"]))["source"]["slide"] == case["source"]["slide"]  # type: ignore[index]
    assert not any("5C22544A" in block["text"] for block in material["blocks"])  # type: ignore[index,union-attr]


def test_real_docx_hierarchy_without_fake_pages(parsed: dict[str, tuple[dict[str, object], dict[str, object]]]) -> None:
    raw, material = parsed["docx"]
    assert raw["pages"] == {}
    assert [section["level"] for section in material["sections"][:4]] == [0, 1, 2, 3]  # type: ignore[index,union-attr]
    case = gold_case("small-docx-section")
    block = find_block(material, str(case["expectedTextContains"]))
    assert "page" not in block["source"]
    assert "slide" not in block["source"]
    assert block["source"]["sectionPath"][-1] == case["source"]["heading"]  # type: ignore[index]


def test_normalization_is_deterministic_and_raw_reusable(parsed: dict[str, tuple[dict[str, object], dict[str, object]]]) -> None:
    for source_type, (raw, expected) in parsed.items():
        first = adapt_docling_artifact(json.loads(json.dumps(raw)), f"fixture-{source_type}").to_dict()
        second = adapt_docling_artifact(json.loads(json.dumps(raw)), f"fixture-{source_type}").to_dict()
        assert first == second == expected
        assert all(chunk["blockIds"] and chunk["sources"] for chunk in first["chunks"])


def test_split_heading_is_merged_only_with_matching_page_geometry() -> None:
    raw = {
        "schema_name": "DoclingDocument",
        "version": "1.10.0",
        "origin": {"filename": "book.pdf"},
        "body": {"children": [{"$ref": "#/texts/0"}, {"$ref": "#/texts/1"}]},
        "texts": [
            {
                "self_ref": "#/texts/0",
                "label": "section_header",
                "text": "第 章 模型后训练",
                "parent": {"$ref": "#/body"},
                "prov": [{"page_no": 202, "bbox": {"l": 230.0, "t": 756.0, "r": 377.0, "b": 742.0}}],
            },
            {
                "self_ref": "#/texts/1",
                "label": "section_header",
                "text": "7",
                "parent": {"$ref": "#/body"},
                "prov": [{"page_no": 202, "bbox": {"l": 253.0, "t": 758.0, "r": 262.0, "b": 741.0}}],
            },
        ],
    }

    material = adapt_docling_artifact(raw, "book").to_dict()

    assert [section["title"] for section in material["sections"]] == ["第 7 章 模型后训练"]
    assert [block["text"] for block in material["blocks"]] == ["第 7 章 模型后训练"]
    assert material["blocks"][0]["source"]["rawBlockId"] == "#/texts/0"


def test_invalid_pdf_fails_without_success() -> None:
    with pytest.raises(ConversionError):
        DocumentConverter().convert(FIXTURES / "invalid" / "not-a-real-pdf.pdf")
