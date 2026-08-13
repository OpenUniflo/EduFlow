"""Anti-corruption adapter from saved Docling artifacts to CourseMaterial."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterator
from typing import Any, cast

from .model import BlockKind, ContentBlock, CourseMaterial, MaterialChunk, MaterialSection, SourceLocation, SourceType

_NUMBERED_HEADING = re.compile(r"^(?:第\s*)?(\d+(?:\.\d+)*)")
_SPLIT_CHAPTER_HEADING = re.compile(r"^(第)\s*(章\b.*)$")


class InvalidRawArtifact(ValueError):
    pass


def _clean_text(value: object) -> str:
    return "\n".join(line.strip() for line in unicodedata.normalize("NFKC", str(value or "")).splitlines()).strip()


def _source_type(filename: str) -> SourceType:
    suffix = filename.rsplit(".", 1)[-1].lower()
    if suffix not in {"pdf", "pptx", "docx"}:
        raise InvalidRawArtifact(f"Unsupported source extension: {suffix}")
    return cast(SourceType, suffix)


def _resolve(raw: dict[str, Any], ref: str) -> dict[str, Any]:
    if ref == "#/body":
        return raw["body"]
    parts = ref.split("/")
    if len(parts) != 3 or parts[0] != "#":
        raise InvalidRawArtifact(f"Invalid Docling reference: {ref}")
    return raw[parts[1]][int(parts[2])]


def _walk(raw: dict[str, Any], ref: str = "#/body") -> Iterator[tuple[str, dict[str, Any]]]:
    item = _resolve(raw, ref)
    if ref != "#/body":
        yield ref, item
    for child in item.get("children", []):
        yield from _walk(raw, child["$ref"])


def _page_and_bbox(item: dict[str, Any]) -> tuple[int, dict[str, float]] | None:
    provenance = item.get("prov") or []
    if not provenance or not isinstance(provenance[0].get("bbox"), dict):
        return None
    return int(provenance[0]["page_no"]), provenance[0]["bbox"]


def _split_heading_merges(items: list[tuple[str, dict[str, Any]]]) -> tuple[dict[str, str], set[str]]:
    """Repair a Docling heading split only when its page geometry proves adjacency."""
    replacements: dict[str, str] = {}
    suppressed: set[str] = set()
    for (heading_ref, heading), (number_ref, number) in zip(items, items[1:], strict=False):
        heading_text = _clean_text(heading.get("text"))
        number_text = _clean_text(number.get("text"))
        match = _SPLIT_CHAPTER_HEADING.match(heading_text)
        heading_geometry = _page_and_bbox(heading)
        number_geometry = _page_and_bbox(number)
        if (
            heading.get("label") != "section_header"
            or number.get("label") != "section_header"
            or match is None
            or not number_text.isdigit()
            or heading_geometry is None
            or number_geometry is None
            or heading_geometry[0] != number_geometry[0]
        ):
            continue
        heading_bbox, number_bbox = heading_geometry[1], number_geometry[1]
        horizontally_inside = heading_bbox["l"] <= number_bbox["l"] <= number_bbox["r"] <= heading_bbox["r"]
        vertically_overlapping = min(heading_bbox["t"], number_bbox["t"]) > max(heading_bbox["b"], number_bbox["b"])
        if horizontally_inside and vertically_overlapping:
            replacements[heading_ref] = f"{match.group(1)} {number_text} {match.group(2)}"
            suppressed.add(number_ref)
    return replacements, suppressed


def _heading_level(text: str, explicit: object) -> int | None:
    if isinstance(explicit, int) and explicit > 0:
        return explicit
    match = _NUMBERED_HEADING.match(text)
    return match.group(1).count(".") + 1 if match else None


def _table_rows(item: dict[str, Any]) -> tuple[tuple[str, ...], ...]:
    data = item.get("data", {})
    rows = [[""] * int(data.get("num_cols", 0)) for _ in range(int(data.get("num_rows", 0)))]
    for cell in data.get("table_cells", []):
        row, column = int(cell["start_row_offset_idx"]), int(cell["start_col_offset_idx"])
        if row < len(rows) and column < len(rows[row]):
            rows[row][column] = _clean_text(cell.get("text"))
    return tuple(tuple(row) for row in rows)


def _location(material_id: str, source_type: SourceType, ref: str, ordinal: int, section_path: tuple[str, ...], item: dict[str, Any]) -> SourceLocation:
    provenance = item.get("prov") or []
    page_no = provenance[0].get("page_no") if provenance else None
    return SourceLocation(material_id, source_type, ref, ordinal, section_path, page_no if source_type == "pdf" else None, page_no if source_type == "pptx" else None)


def adapt_docling_artifact(raw: dict[str, Any], source_material_id: str) -> CourseMaterial:
    if raw.get("schema_name") != "DoclingDocument" or not isinstance(raw.get("body"), dict):
        raise InvalidRawArtifact("Expected a DoclingDocument artifact")
    origin = raw.get("origin") or {}
    filename = str(origin.get("filename") or "")
    source_type = _source_type(filename)
    sections: list[MaterialSection] = []
    blocks: list[ContentBlock] = []
    section_stack: list[tuple[int, str, str]] = []
    items = list(_walk(raw))
    heading_replacements, suppressed_refs = _split_heading_merges(items)

    for ref, item in items:
        if ref in suppressed_refs:
            continue
        label = str(item.get("label") or "")
        if label in {"chapter", "list", "key_value_area", "unspecified", "caption"}:
            continue
        parent_ref = (item.get("parent") or {}).get("$ref")
        if isinstance(parent_ref, str) and parent_ref.startswith("#/pictures/"):
            continue
        text = heading_replacements.get(ref, _clean_text(item.get("text")))

        if source_type == "pptx" and isinstance(parent_ref, str) and parent_ref.startswith("#/groups/"):
            group = _resolve(raw, parent_ref)
            if group.get("label") == "chapter":
                slide = int(group["name"].split("-")[-1]) + 1
                section_id = f"section-slide-{slide}"
                if not any(section.id == section_id for section in sections):
                    first_ref = group["children"][0]["$ref"]
                    first = _resolve(raw, first_ref)
                    title = _clean_text(first.get("text")) or f"Slide {slide}"
                    location = _location(source_material_id, source_type, first_ref, len(blocks), (title,), first)
                    sections.append(MaterialSection(section_id, title, len(sections), 1, None, location))
                section_stack = [(1, section_id, next(section.title for section in sections if section.id == section_id))]

        if label in {"title", "section_header"} and source_type != "pptx":
            level = 0 if label == "title" else _heading_level(text, item.get("level"))
            stack_level = level if level is not None else (section_stack[-1][0] if section_stack else 1)
            while section_stack and section_stack[-1][0] >= stack_level:
                section_stack.pop()
            section_id = f"section-{len(sections)}"
            parent_id = section_stack[-1][1] if section_stack else None
            path = tuple(entry[2] for entry in section_stack) + (text,)
            location = _location(source_material_id, source_type, ref, len(blocks), path, item)
            sections.append(MaterialSection(section_id, text, len(sections), level, parent_id, location))
            section_stack.append((stack_level, section_id, text))

        section_path = tuple(entry[2] for entry in section_stack)
        rows = _table_rows(item) if label == "table" else None
        if rows is not None:
            text = "\n".join(" | ".join(row) for row in rows)
        kind_value = {"title": "title", "section_header": "heading", "paragraph": "paragraph", "text": "paragraph", "list_item": "list-item", "table": "table", "picture": "picture", "code": "code"}.get(label)
        if kind_value is None or (not text and kind_value != "picture"):
            continue
        block_id = f"block-{len(blocks)}"
        blocks.append(ContentBlock(block_id, cast(BlockKind, kind_value), text, _location(source_material_id, source_type, ref, len(blocks), section_path, item), rows))

    chunks: list[MaterialChunk] = []
    current: list[ContentBlock] = []
    current_path: tuple[str, ...] | None = None
    for block in blocks:
        path = block.source.section_path
        if current and (path != current_path or sum(len(value.text) for value in current) + len(block.text) > 1800):
            chunks.append(_make_chunk(chunks, current, current_path or ()))
            current = []
        current_path = path
        current.append(block)
    if current:
        chunks.append(_make_chunk(chunks, current, current_path or ()))

    title = next((section.title for section in sections if section.level == 0), None) or (sections[0].title if sections else filename)
    return CourseMaterial("course-material-v1", source_material_id, source_type, title, tuple(sections), tuple(blocks), tuple(chunks), {"sourceFilename": filename, "doclingSchemaVersion": raw.get("version"), "doclingBinaryHash": origin.get("binary_hash")})


def _make_chunk(existing: list[MaterialChunk], blocks: list[ContentBlock], section_path: tuple[str, ...]) -> MaterialChunk:
    return MaterialChunk(f"chunk-{len(existing)}", len(existing), "\n\n".join(block.text for block in blocks if block.text), tuple(block.id for block in blocks), tuple(block.source for block in blocks), section_path)
