# Phase 4.1 Acceptance — Material Parsing

## Baseline

- Phase: 4.1
- Main merge commit: `777d5087fc8035a7db821ef3e3322a14786d2b96`
- PR: #6
- Issue: #5
- CourseMaterial schema: `course-material-v1`
- Docling: `2.119.0`

## Acceptance result

| Check | Result |
|---|---|
| PDF parsing | PASS |
| PPTX parsing | PASS |
| DOCX parsing | PASS |
| Source provenance | PASS |
| Structural chunking | PASS |
| Raw artifact re-normalization | PASS |
| Invalid input failure | PASS |
| 307-page canonical book | PASS |
| Overall | PASS |

## Representative result

| Source | Result |
|---|---|
| PDF | 6 sections, 19 blocks, 6 chunks |
| PPTX | 5 slides/sections, 29 blocks, 5 chunks |
| DOCX | 7 sections, 20 blocks, 7 chunks |
| Canonical book | 307 pages, 669 sections, 4,133 blocks, 695 chunks, 10 top-level chapters |

## Important invariants

- PDF uses page provenance; PPTX uses slide provenance.
- DOCX does not fabricate page or slide provenance.
- A saved raw artifact can be normalized again without the source binary.
- `def react_loop(task)` remains present, belongs to a structural chunk, and traces to PDF page 2.
- Docling visual classification such as `code` versus `paragraph` is not a cross-platform business invariant.

## Known limitations

- Docling visual labels may vary by platform or ML environment.
- PPTX style classification is not a stable contract.
- DOCX has no reliable page provenance.
- PDF heading hierarchy may depend on source layout.
- A picture may remain a structural placeholder in CourseMaterial v1.

## Reproducing acceptance

See [`scripts/acceptance/README.md`](../../scripts/acceptance/README.md).
