"""EduFlow-owned structured course material contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

SourceType = Literal["pdf", "pptx", "docx"]
BlockKind = Literal["title", "heading", "paragraph", "list-item", "table", "picture", "code"]


@dataclass(frozen=True)
class SourceLocation:
    source_material_id: str
    source_type: SourceType
    raw_block_id: str
    ordinal: int
    section_path: tuple[str, ...] = ()
    page: int | None = None
    slide: int | None = None


@dataclass(frozen=True)
class ContentBlock:
    id: str
    kind: BlockKind
    text: str
    source: SourceLocation
    table: tuple[tuple[str, ...], ...] | None = None


@dataclass(frozen=True)
class MaterialSection:
    id: str
    title: str
    order: int
    level: int | None
    parent_id: str | None
    source: SourceLocation


@dataclass(frozen=True)
class MaterialChunk:
    id: str
    order: int
    text: str
    block_ids: tuple[str, ...]
    sources: tuple[SourceLocation, ...]
    section_path: tuple[str, ...]


@dataclass(frozen=True)
class CourseMaterial:
    schema_version: Literal["course-material-v1"]
    source_material_id: str
    source_type: SourceType
    title: str
    sections: tuple[MaterialSection, ...]
    blocks: tuple[ContentBlock, ...]
    chunks: tuple[MaterialChunk, ...]
    metadata: dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        def source(value: SourceLocation) -> dict[str, object]:
            result: dict[str, object] = {
                "sourceMaterialId": value.source_material_id,
                "sourceType": value.source_type,
                "rawBlockId": value.raw_block_id,
                "ordinal": value.ordinal,
                "sectionPath": list(value.section_path),
            }
            if value.page is not None:
                result["page"] = value.page
            if value.slide is not None:
                result["slide"] = value.slide
            return result

        return {
            "schemaVersion": self.schema_version,
            "sourceMaterialId": self.source_material_id,
            "sourceType": self.source_type,
            "title": self.title,
            "sections": [
                {"id": value.id, "title": value.title, "order": value.order, **({"level": value.level} if value.level is not None else {}),
                 **({"parentId": value.parent_id} if value.parent_id is not None else {}), "source": source(value.source)}
                for value in self.sections
            ],
            "blocks": [
                {"id": value.id, "kind": value.kind, "text": value.text, **({"table": [list(row) for row in value.table]} if value.table is not None else {}), "source": source(value.source)}
                for value in self.blocks
            ],
            "chunks": [
                {"id": value.id, "order": value.order, "text": value.text, "blockIds": list(value.block_ids),
                 "sources": [source(item) for item in value.sources], "sectionPath": list(value.section_path)}
                for value in self.chunks
            ],
            "metadata": self.metadata,
        }
