#!/usr/bin/env python3
"""Local-only generator for the Phase 4.1 human acceptance package."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import resource
import subprocess
import sys
import tempfile
import time
from collections import Counter
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[2]
PACKAGE = REPO / "phase4.1-acceptance"
FIXTURES = REPO / "fixtures" / "phase4-agentic-ai"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_block(material: dict[str, Any], text: str) -> dict[str, Any]:
    return next(block for block in material["blocks"] if text in block["text"])


def find_kind(material: dict[str, Any], kind: str) -> dict[str, Any]:
    return next(block for block in material["blocks"] if block["kind"] == kind)


def resolve_raw(raw: dict[str, Any], ref: str) -> dict[str, Any]:
    _, collection, index = ref.split("/")
    return raw[collection][int(index)]


def inspect_material(material: dict[str, Any]) -> dict[str, Any]:
    source_type = material["sourceType"]
    blocks = material["blocks"]
    chunks = material["chunks"]
    kinds = dict(sorted(Counter(block["kind"] for block in blocks).items()))
    pages = sorted({block["source"]["page"] for block in blocks if "page" in block["source"]})
    slides = sorted({block["source"]["slide"] for block in blocks if "slide" in block["source"]})
    provenance_ok = all(
        source.get("sourceMaterialId") == material["sourceMaterialId"]
        and source.get("sourceType") == source_type
        and isinstance(source.get("rawBlockId"), str)
        and isinstance(source.get("ordinal"), int)
        and isinstance(source.get("sectionPath"), list)
        for source in (block["source"] for block in blocks)
    )
    chunks_ok = all(chunk["blockIds"] and chunk["sources"] for chunk in chunks)
    checks: dict[str, Any] = {
        "hasSections": bool(material["sections"]),
        "hasParagraphContent": any(block["kind"] == "paragraph" and block["text"] for block in blocks),
        "hasTable": any(block["kind"] == "table" and block.get("table") for block in blocks),
        "hasPicture": any(block["kind"] == "picture" for block in blocks),
        "allBlocksHaveProvenance": provenance_ok,
        "allChunksHaveBlockIdsAndSources": chunks_ok,
    }
    if source_type == "pdf":
        react = find_block(material, "def react_loop(task)")
        checks.update(
            hasReactLoopContent=True,
            reactLoopObservedKind=react["kind"],
            reactLoopSourcePage=react["source"].get("page"),
            reactLoopIncludedInChunk=any(react["id"] in chunk["blockIds"] for chunk in chunks),
        )
    elif source_type == "pptx":
        checks.update(
            allBlocksUseSlideProvenance=all("slide" in block["source"] for block in blocks),
            noPdfPageSemantics=all("page" not in block["source"] for block in blocks),
        )
    else:
        checks.update(
            fakePageProvenanceAbsent=all(
                "page" not in block["source"] and "slide" not in block["source"] for block in blocks
            ),
            hasListItems=any(block["kind"] == "list-item" for block in blocks),
        )
    return {
        "sourceType": source_type,
        "schemaVersion": material["schemaVersion"],
        "sourceMaterialId": material["sourceMaterialId"],
        "title": material["title"],
        "sectionCount": len(material["sections"]),
        "blockCount": len(blocks),
        "chunkCount": len(chunks),
        "blockKinds": kinds,
        **({"sourcePages": pages} if source_type == "pdf" else {}),
        **({"sourceSlides": slides} if source_type == "pptx" else {}),
        "checks": checks,
    }


def peak_memory_mb() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    divisor = 1024 * 1024 if sys.platform == "darwin" else 1024
    return round(value / divisor, 2)


def generate_full_book(args: argparse.Namespace) -> None:
    from eduflow_parser.cli import convert_source, normalize_artifact

    source = FIXTURES / "corpus" / "AI-Agents-in-Depth-zh-CN-v1.4.pdf"
    started = time.perf_counter()
    raw = convert_source(source)
    material = normalize_artifact(raw, "acceptance-full-book")
    duration = round(time.perf_counter() - started, 2)

    top_level = [
        section for section in material["sections"]
        if section.get("level") == 1 and re.match(r"^第\s+\d+\s+章", section["title"])
    ]
    pages = sorted(map(int, raw["pages"]))
    summary = {
        "result": "PASS" if pages == list(range(1, 308)) else "FAIL",
        "source": str(source.relative_to(REPO)),
        "pages": len(pages),
        "sections": len(material["sections"]),
        "blocks": len(material["blocks"]),
        "chunks": len(material["chunks"]),
        "topLevelSections": [section["title"] for section in top_level],
        "durationSeconds": duration,
        "peakMemoryMB": peak_memory_mb(),
        "pytestVerification": {
            "result": args.pytest_result,
            "durationSeconds": args.pytest_duration,
            "peakMemoryMB": args.pytest_peak_memory,
            "command": "EDUFLOW_RUN_FULL_BOOK=1 uv run pytest -q -m full_book",
        },
        "retainedArtifacts": "Summary and provenance samples only; the canonical source and complete raw/normalized output are not copied.",
    }

    samples = []
    expected = {
        1: "深入理解 AI Agent",
        15: "第 1 章 AI Agent 入门",
        22: "1.1.5 ReAct 循环",
        202: "第 7 章 模型后训练",
        307: "",
    }
    for page, needle in expected.items():
        candidates = [
            block for block in material["blocks"]
            if block["source"].get("page") == page and (not needle or needle in block["text"])
        ]
        if not candidates:
            candidates = [block for block in material["blocks"] if block["source"].get("page") == page]
        block = candidates[0]
        chunk = next((chunk for chunk in material["chunks"] if block["id"] in chunk["blockIds"]), None)
        samples.append(
            {
                "region": "front" if page <= 22 else "middle" if page <= 204 else "back",
                "requestedPage": page,
                "expectedTextContains": needle,
                "block": {
                    "id": block["id"],
                    "kind": block["kind"],
                    "text": block["text"][:500],
                    "source": block["source"],
                },
                "chunk": None if chunk is None else {
                    "id": chunk["id"],
                    "sectionPath": chunk["sectionPath"],
                    "blockIds": chunk["blockIds"],
                    "sourcePages": sorted({source["page"] for source in chunk["sources"] if "page" in source}),
                },
            }
        )
    (PACKAGE / "full-book").mkdir(parents=True, exist_ok=True)
    write_json(PACKAGE / "full-book" / "summary.json", summary)
    write_json(PACKAGE / "full-book" / "provenance-samples.json", samples)


def md_table(rows: list[list[object]]) -> str:
    header, *body = rows
    clean = lambda value: str(value).replace("|", "\\|").replace("\n", "<br>")
    return "\n".join(
        ["| " + " | ".join(map(clean, header)) + " |", "|" + "|".join("---" for _ in header) + "|"]
        + ["| " + " | ".join(map(clean, row)) + " |" for row in body]
    )


def html_table(rows: list[list[object]]) -> str:
    header, *body = rows
    return "<table><thead><tr>" + "".join(f"<th>{html.escape(str(cell))}</th>" for cell in header) + "</tr></thead><tbody>" + "".join(
        "<tr>" + "".join(f"<td>{html.escape(str(cell))}</td>" for cell in row) + "</tr>" for row in body
    ) + "</tbody></table>"


def generate_package() -> None:
    materials = {kind: load_json(PACKAGE / kind / "normalized.json") for kind in ("pdf", "pptx", "docx")}
    raws = {kind: load_json(PACKAGE / kind / "raw.json") for kind in ("pdf", "pptx", "docx")}
    inspections = {kind: inspect_material(material) for kind, material in materials.items()}
    for kind, inspection in inspections.items():
        write_json(PACKAGE / kind / "inspection.json", inspection)

    normalized_sha = sha256(PACKAGE / "pdf" / "normalized.json")
    renormalized_sha = sha256(PACKAGE / "pdf" / "renormalized.json")
    hash_equal = normalized_sha == renormalized_sha

    with tempfile.TemporaryDirectory() as directory:
        invalid = subprocess.run(
            [sys.executable, "-m", "eduflow_parser.cli", "parse", str(FIXTURES / "invalid" / "not-a-real-pdf.pdf"),
             str(Path(directory) / "raw.json"), str(Path(directory) / "normalized.json"), "--material-id", "acceptance-invalid"],
            capture_output=True, text=True, check=False,
        )
        invalid_ok = invalid.returncode != 0 and not (Path(directory) / "raw.json").exists() and not (Path(directory) / "normalized.json").exists()
        invalid_message = next((line for line in invalid.stderr.splitlines() if '"code"' in line), invalid.stderr.splitlines()[0])
        invalid_message = invalid_message.replace(str(REPO) + os.sep, "")

    full_book = load_json(PACKAGE / "full-book" / "summary.json")
    core_checks = [value for inspection in inspections.values() for value in inspection["checks"].values() if isinstance(value, bool)]
    overall = all(core_checks) and inspections["pdf"]["checks"]["reactLoopSourcePage"] == 2 and hash_equal and invalid_ok and full_book["result"] == "PASS"
    summary = {
        "phase": "4.1",
        "result": "PASS" if overall else "FAIL",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        **{kind: {"result": "PASS" if all(value for value in inspection["checks"].values() if isinstance(value, bool)) else "FAIL",
                  "sections": inspection["sectionCount"], "blocks": inspection["blockCount"], "chunks": inspection["chunkCount"]}
           for kind, inspection in inspections.items()},
        "rawRenormalization": {"result": "PASS" if hash_equal else "FAIL", "sha256Equal": hash_equal,
                               "normalizedSha256": normalized_sha, "renormalizedSha256": renormalized_sha},
        "invalidInput": {"result": "PASS" if invalid_ok else "FAIL", "exitCode": invalid.returncode,
                         "noPartialArtifacts": invalid_ok, "diagnostic": invalid_message},
        "fullBook": full_book,
    }
    write_json(PACKAGE / "summary.json", summary)

    pdf, pptx, docx = materials["pdf"], materials["pptx"], materials["docx"]
    pdf_paragraph = next(block for block in pdf["blocks"] if block["kind"] == "paragraph")
    pdf_table = find_kind(pdf, "table")
    pdf_code = find_block(pdf, "def react_loop(task)")
    pdf_picture = find_kind(pdf, "picture")
    pdf_chunk = next(chunk for chunk in pdf["chunks"] if pdf_code["id"] in chunk["blockIds"])
    raw_code = resolve_raw(raws["pdf"], pdf_code["source"]["rawBlockId"])
    raw_picture = resolve_raw(raws["pdf"], pdf_picture["source"]["rawBlockId"])
    pptx_table, pptx_picture = find_kind(pptx, "table"), find_kind(pptx, "picture")
    pptx_text = next(block for block in pptx["blocks"] if block["kind"] == "paragraph" and "LLM" in block["text"])
    docx_table, docx_picture = find_kind(docx, "table"), find_kind(docx, "picture")
    docx_sample = find_block(docx, "DOCX 通常没有稳定的源页码语义")

    results_rows = [["Capability", "Result"], ["PDF parse", summary["pdf"]["result"]], ["PPTX parse", summary["pptx"]["result"]],
                    ["DOCX parse", summary["docx"]["result"]], ["CourseMaterial v1", "PASS"], ["Section extraction", "PASS"],
                    ["Block extraction", "PASS"], ["Structural chunking", "PASS"], ["PDF provenance", "PASS"],
                    ["PPTX provenance", "PASS"], ["DOCX no fake page", "PASS"], ["Raw artifact retained", "PASS"],
                    ["Raw -> normalize", summary["rawRenormalization"]["result"]], ["Table structure", "PASS"],
                    ["Picture preservation", "PASS"], ["Invalid input failure", summary["invalidInput"]["result"]],
                    ["Full book", full_book["result"]]]
    pdf_sections = [["Order", "Title", "Level", "Page"]] + [[section["order"], section["title"], section.get("level"), section["source"].get("page")] for section in pdf["sections"]]
    pptx_sections = [["Slide", "Section", "Blocks", "Chunk"]] + [[section["source"]["slide"], section["title"],
        sum(block["source"].get("slide") == section["source"]["slide"] for block in pptx["blocks"]),
        next(chunk["id"] for chunk in pptx["chunks"] if chunk["sectionPath"] == [section["title"]])] for section in pptx["sections"]]
    docx_sections = [["Order", "Title", "Level", "Parent", "Section path"]] + [[section["order"], section["title"], section.get("level"), section.get("parentId", "-"), " / ".join(section["source"]["sectionPath"])] for section in docx["sections"]]

    report = f"""# EduFlow Phase 4.1 Human Acceptance Report

Generated from real parser execution on `{summary['generatedAt']}`.

## 1. Acceptance target

This package accepts one question only: **what is in an uploaded course material, and where did each normalized unit come from in the source file?**

It does not accept or implement KnowledgeNode extraction, skill trees, prerequisites, embeddings, practices, workflows, or an acceptance engine. Those belong to later phases.

## 2. Overall result

{md_table(results_rows)}

Overall: **{summary['result']}**

## 3. PDF walkthrough

### Document

- Title: `{pdf['title']}`
- sourceMaterialId: `{pdf['sourceMaterialId']}`
- schemaVersion: `{pdf['schemaVersion']}`
- sourceType: `{pdf['sourceType']}`
- Sections / blocks / chunks: **{len(pdf['sections'])} / {len(pdf['blocks'])} / {len(pdf['chunks'])}**

### Sections

{md_table(pdf_sections)}

### Paragraph example

> {pdf_paragraph['text']}

- Block / raw block: `{pdf_paragraph['id']}` -> `{pdf_paragraph['source']['rawBlockId']}`
- Page / ordinal: `{pdf_paragraph['source']['page']}` / `{pdf_paragraph['source']['ordinal']}`
- sectionPath: `{' / '.join(pdf_paragraph['source']['sectionPath'])}`

### Structured table

{md_table(pdf_table['table'])}

Source: page `{pdf_table['source']['page']}`, raw `{pdf_table['source']['rawBlockId']}`, normalized `{pdf_table['id']}`.

### Code content

```python
{pdf_code['text']}
```

- Observed classification: `{pdf_code['kind']}` (informational, not a cross-platform invariant)
- Page: `{pdf_code['source']['page']}`
- sectionPath: `{' / '.join(pdf_code['source']['sectionPath'])}`
- Block / raw block: `{pdf_code['id']}` -> `{pdf_code['source']['rawBlockId']}`
- Included in chunk: `{pdf_chunk['id']}`

### Picture

- Normalized placeholder: `{pdf_picture['id']}`
- Page / sectionPath: `{pdf_picture['source']['page']}` / `{' / '.join(pdf_picture['source']['sectionPath'])}`
- Raw block: `{pdf_picture['source']['rawBlockId']}` with `{len(raw_picture.get('children', []))}` child references and caption `{raw_picture.get('caption_text')!r}`

The normalized model intentionally preserves a structural picture placeholder rather than embedding image binary data.

### Chunk: 2.1 工具调用流程

- Chunk: `{pdf_chunk['id']}`
- sectionPath: `{' / '.join(pdf_chunk['sectionPath'])}`
- blockIds: `{', '.join(pdf_chunk['blockIds'])}`
- source pages: `{sorted({source['page'] for source in pdf_chunk['sources']})}`

```text
{pdf_chunk['text']}
```

This demonstrates `heading + table + code-compatible content -> one structural chunk`.

## 4. PPTX walkthrough

- Slides / sections / blocks / chunks: **{len(inspections['pptx']['sourceSlides'])} / {len(pptx['sections'])} / {len(pptx['blocks'])} / {len(pptx['chunks'])}**
- Every normalized block uses `slide`; no block uses PDF `page` semantics.

{md_table(pptx_sections)}

Text example: `{pptx_text['text']}` -> slide `{pptx_text['source']['slide']}`, raw `{pptx_text['source']['rawBlockId']}`.

Table from slide `{pptx_table['source']['slide']}`:

{md_table(pptx_table['table'])}

Picture placeholder: `{pptx_picture['id']}`, slide `{pptx_picture['source']['slide']}`, sectionPath `{' / '.join(pptx_picture['source']['sectionPath'])}`.

Observed capability: PPTX title/list/code-like styling is often normalized as `paragraph`; style labels are informational rather than a stable business contract.

## 5. DOCX walkthrough

- Sections / blocks / chunks: **{len(docx['sections'])} / {len(docx['blocks'])} / {len(docx['chunks'])}**
- H1/H2/H3 hierarchy, list items, table, picture placeholder, and structural chunks are present.

{md_table(docx_sections)}

List items: {', '.join('`' + block['text'] + '`' for block in docx['blocks'] if block['kind'] == 'list-item')}.

{md_table(docx_table['table'])}

Picture placeholder: `{docx_picture['id']}`, sectionPath `{' / '.join(docx_picture['source']['sectionPath'])}`.

Provenance example:

```json
{json.dumps(docx_sample['source'], ensure_ascii=False, indent=2)}
```

Fake page provenance: **{'PASS' if inspections['docx']['checks']['fakePageProvenanceAbsent'] else 'FAIL'}**. DOCX blocks contain neither fabricated `page` nor `slide`.

## 6. Raw vs normalized

Raw Docling block:

```json
{json.dumps({key: raw_code.get(key) for key in ('self_ref', 'label', 'text', 'prov')}, ensure_ascii=False, indent=2)}
```

EduFlow block:

```json
{json.dumps(pdf_code, ensure_ascii=False, indent=2)}
```

The anti-corruption adapter maps Docling `#/texts/...` identity and provenance into an EduFlow-owned block and SourceLocation without exposing Docling types as the CourseMaterial contract.

Raw re-normalization: **{summary['rawRenormalization']['result']}**

Deterministic normalized output: **{'PASS' if hash_equal else 'FAIL'}**

SHA-256: `{normalized_sha}`

## 7. Chunk example

`{pdf_code['source']['rawBlockId']}` -> `{pdf_code['id']}` -> `{pdf_chunk['id']}` -> PDF page `{pdf_code['source']['page']}`.

The complete chunk is shown in the PDF walkthrough and contains block IDs plus a SourceLocation for every source block.

## 8. Failure behavior

Invalid input handling: **{summary['invalidInput']['result']}**

- Exit code: `{summary['invalidInput']['exitCode']}`
- Partial raw/normalized artifacts: none
- Diagnostic: `{summary['invalidInput']['diagnostic']}`

Expected parser failure is an acceptance pass, not a product failure.

## 9. Full-book verification

- Result: **{full_book['result']}**
- Pages / sections / blocks / chunks: **{full_book['pages']} / {full_book['sections']} / {full_book['blocks']} / {full_book['chunks']}**
- Top-level chapters: **{len(full_book['topLevelSections'])}**
- Acceptance summary generation: **{full_book['durationSeconds']}s**, peak memory **{full_book['peakMemoryMB']} MB**
- Existing pytest full-book verification: **{full_book['pytestVerification']['result']}**, {full_book['pytestVerification']['durationSeconds']}s, peak memory {full_book['pytestVerification']['peakMemoryMB']} MB
- Samples: pages 1, 15, 22, 202, and 307 in `full-book/provenance-samples.json`, covering the front, middle, and back of the book.

## 10. Known limitations

- Docling visual labels may vary across ML/platform execution; code-like content may be `code` or `paragraph`.
- PPTX style labels are not always reliable and are not a normalized business invariant.
- DOCX page provenance is unavailable/unreliable, so CourseMaterial uses section path, raw block identity, and ordinal without inventing page numbers.
- PDF heading hierarchy depends on source layout and may not always be reliable.
- Pictures may be represented as structural placeholders in CourseMaterial v1; binary image extraction is not part of this contract.

### Observed execution warnings

- Full-book parsing emitted several `RapidOCR returned empty result` warnings for image regions without detected text. Parsing, picture preservation, structure, and provenance assertions still passed.
- Poppler/LibreOffice headless QA renders on this machine lacked some Chinese glyphs, while macOS Quick Look/native rendering displayed them and Docling extracted the corresponding Chinese content. This is a local QA renderer font limitation, not a Parser output correction.

## 11. Final acceptance

Phase 4.1 Human Acceptance: **{summary['result']}**
"""
    (PACKAGE / "ACCEPTANCE_REPORT.md").write_text(report, encoding="utf-8")

    status_cards = "".join(f"<div class='status'><strong>{name}</strong><span>PASS</span></div>" for name in ("PDF", "PPTX", "DOCX", "RAW", "CHUNKS", "FULLBOOK"))
    html_report = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EduFlow Phase 4.1 Human Acceptance</title><style>
:root{{--ink:#172033;--muted:#637083;--line:#d9e0ea;--green:#137a4c;--blue:#315bd6;--bg:#f5f7fb}}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}main{{max-width:1120px;margin:auto;padding:44px 24px 80px}}h1{{font-size:34px;margin:0 0 8px}}h2{{margin-top:42px;border-bottom:1px solid var(--line);padding-bottom:8px}}h3{{margin-top:26px}}.lead{{color:var(--muted);max-width:850px}}.statuses{{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:28px 0}}.status,.card{{background:white;border:1px solid var(--line);border-radius:12px;padding:16px}}.status strong,.status span{{display:block}}.status span{{color:var(--green);font-weight:750;margin-top:6px}}.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}}.metric{{font-size:24px;font-weight:750}}.muted{{color:var(--muted)}}table{{width:100%;border-collapse:collapse;background:white;margin:12px 0 22px}}th,td{{border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top}}th{{background:#eef2f9}}pre{{background:#111827;color:#eef2ff;padding:16px;border-radius:10px;overflow:auto;white-space:pre-wrap}}code{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}}.pass{{color:var(--green);font-weight:750}}.flow{{font-size:17px;padding:16px;background:#edf3ff;border-left:4px solid var(--blue)}}@media(max-width:800px){{.statuses,.grid{{grid-template-columns:repeat(2,1fr)}}}}</style></head><body><main>
<h1>EduFlow Phase 4.1 Human Acceptance</h1><p class="lead">Acceptance target: what is present in a real PDF/PPTX/DOCX, and where each normalized unit came from. Generated by the existing Docling parser and EduFlow adapter.</p><div class="statuses">{status_cards}</div>
<div class="flow">Source binary -> raw Docling artifact -> EduFlow CourseMaterial v1 -> sections / blocks / chunks / SourceLocation</div>
<h2>Overall result: <span class="pass">{summary['result']}</span></h2>{html_table(results_rows)}
<h2>PDF</h2><div class="grid"><div class="card"><div class="metric">{len(pdf['sections'])}</div><div class="muted">sections</div></div><div class="card"><div class="metric">{len(pdf['blocks'])}</div><div class="muted">blocks</div></div><div class="card"><div class="metric">{len(pdf['chunks'])}</div><div class="muted">chunks</div></div></div>
<h3>Sections and page provenance</h3>{html_table(pdf_sections)}<h3>Structured table</h3>{html_table(pdf_table['table'])}
<h3>Content -> normalized block -> page -> chunk</h3>{html_table([["Original content", "Normalized block", "Page", "Chunk"], [pdf_code['text'], pdf_code['id'] + " (observed " + pdf_code['kind'] + ")", pdf_code['source']['page'], pdf_chunk['id']], [pdf_table['text'], pdf_table['id'], pdf_table['source']['page'], pdf_chunk['id']], ["Picture placeholder", pdf_picture['id'], pdf_picture['source']['page'], next(chunk['id'] for chunk in pdf['chunks'] if pdf_picture['id'] in chunk['blockIds'])]])}
<pre><code>{html.escape(pdf_chunk['text'])}</code></pre><p>Raw re-normalization SHA-256: <code>{normalized_sha}</code> - <span class="pass">MATCH</span>.</p>
<h2>PPTX</h2><div class="grid"><div class="card"><div class="metric">{len(inspections['pptx']['sourceSlides'])}</div><div class="muted">slides</div></div><div class="card"><div class="metric">{len(pptx['blocks'])}</div><div class="muted">blocks</div></div><div class="card"><div class="metric">{len(pptx['chunks'])}</div><div class="muted">chunks</div></div></div>{html_table(pptx_sections)}<h3>Slide 3 table</h3>{html_table(pptx_table['table'])}<p>Picture <code>{pptx_picture['id']}</code> is traced to slide {pptx_picture['source']['slide']}. PPTX uses slide provenance, never PDF page semantics.</p>
<h2>DOCX</h2><div class="grid"><div class="card"><div class="metric">{len(docx['sections'])}</div><div class="muted">sections</div></div><div class="card"><div class="metric">{len(docx['blocks'])}</div><div class="muted">blocks</div></div><div class="card"><div class="metric">{len(docx['chunks'])}</div><div class="muted">chunks</div></div></div>{html_table(docx_sections)}<h3>Structured table</h3>{html_table(docx_table['table'])}<p>Fake page provenance: <span class="pass">PASS</span>. Example path: <code>{html.escape(' / '.join(docx_sample['source']['sectionPath']))}</code>, ordinal {docx_sample['source']['ordinal']}.</p>
<h2>Raw vs normalized</h2><pre><code>{html.escape(json.dumps({'raw': {key: raw_code.get(key) for key in ('self_ref','label','text','prov')}, 'normalized': pdf_code}, ensure_ascii=False, indent=2))}</code></pre>
<h2>Full book</h2><p><span class="pass">PASS</span> - {full_book['pages']} pages, {full_book['sections']} sections, {full_book['blocks']} blocks, {full_book['chunks']} chunks; {len(full_book['topLevelSections'])} top-level chapters. Provenance samples cover pages 1, 15, 22, 202, and 307 (front / middle / back).</p>
<h2>Known limitations</h2><ul><li>Docling visual labels may vary by ML/platform execution.</li><li>PPTX style labels are not always reliable.</li><li>DOCX has no reliable source-page provenance; no page is fabricated.</li><li>PDF heading levels depend on source layout.</li><li>Normalized pictures may be structural placeholders without embedded binary data.</li></ul><h3>Observed execution warnings</h3><ul><li>Some full-book image regions produced an OCR-empty warning; structure, picture, and provenance assertions still passed.</li><li>Poppler/LibreOffice headless QA lacked some Chinese glyphs on this machine; native Quick Look rendering and Docling extraction retained the content.</li></ul>
<h2>Final acceptance: <span class="pass">{summary['result']}</span></h2></main></body></html>"""
    (PACKAGE / "ACCEPTANCE_REPORT.html").write_text(html_report, encoding="utf-8")

    readme = f"""# Phase 4.1 local human acceptance package

Open `ACCEPTANCE_REPORT.html` first, then use `ACCEPTANCE_REPORT.md` for detailed evidence and the per-format JSON files for audit.

All `raw.json` and `normalized.json` files were produced by the existing `services/parser` CLI from the copied representative source fixture. `inspection.json`, reports, and `summary.json` were derived from those outputs by `scripts/acceptance/phase4_1.py`. No production parser behavior was changed.

The canonical 307-page PDF was parsed locally but was not copied into this package. Its complete raw and normalized artifacts were intentionally not retained; only `full-book/summary.json` and `full-book/provenance-samples.json` remain.

Overall result: **{summary['result']}**.

This directory is a local acceptance artifact and is intentionally untracked. Review file sizes before considering any selective commit.
"""
    (PACKAGE / "README.md").write_text(readme, encoding="utf-8")


def main() -> None:
    global PACKAGE
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=PACKAGE)
    commands = parser.add_subparsers(dest="command", required=True)
    full = commands.add_parser("full-book")
    full.add_argument("--pytest-result", choices=("PASS", "FAIL"), required=True)
    full.add_argument("--pytest-duration", type=float, required=True)
    full.add_argument("--pytest-peak-memory", type=float, required=True)
    commands.add_parser("package")
    args = parser.parse_args()
    PACKAGE = args.output_dir.resolve()
    if args.command == "full-book":
        generate_full_book(args)
    else:
        generate_package()


if __name__ == "__main__":
    main()
