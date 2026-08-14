# Phase acceptance tooling

## Phase 4.1

`phase4_1.py` derives the local human-acceptance reports and inspection summaries from real PDF, PPTX, and DOCX artifacts produced by the existing Phase 4.1 parser. Run it with the Python 3.12 `uv` environment under `services/parser`; it adds no dependencies.

The default output is `phase4.1-acceptance/`. That directory is reproducible and ignored by Git. The pinned canonical book must remain `fixtures/phase4-agentic-ai/corpus/AI-Agents-in-Depth-zh-CN-v1.4.pdf`; the book itself remains ignored and must not be committed.

From `services/parser`, prepare the representative artifacts before generating the report:

```bash
uv sync --locked
mkdir -p ../../phase4.1-acceptance/{pdf,pptx,docx,full-book}
cp ../../fixtures/phase4-agentic-ai/fixtures/representative-agent-course.pdf ../../phase4.1-acceptance/pdf/source.pdf
cp ../../fixtures/phase4-agentic-ai/fixtures/representative-agent-course.pptx ../../phase4.1-acceptance/pptx/source.pptx
cp ../../fixtures/phase4-agentic-ai/fixtures/representative-agent-course.docx ../../phase4.1-acceptance/docx/source.docx
uv run eduflow-parser parse ../../fixtures/phase4-agentic-ai/fixtures/representative-agent-course.pdf ../../phase4.1-acceptance/pdf/raw.json ../../phase4.1-acceptance/pdf/normalized.json --material-id acceptance-pdf
uv run eduflow-parser parse ../../fixtures/phase4-agentic-ai/fixtures/representative-agent-course.pptx ../../phase4.1-acceptance/pptx/raw.json ../../phase4.1-acceptance/pptx/normalized.json --material-id acceptance-pptx
uv run eduflow-parser parse ../../fixtures/phase4-agentic-ai/fixtures/representative-agent-course.docx ../../phase4.1-acceptance/docx/raw.json ../../phase4.1-acceptance/docx/normalized.json --material-id acceptance-docx
uv run eduflow-parser normalize ../../phase4.1-acceptance/pdf/raw.json ../../phase4.1-acceptance/pdf/renormalized.json --material-id acceptance-pdf
```

Run the opt-in full-book pytest and record its duration and peak memory, then generate full-book summaries with those measured values. The numbers below are the measured Phase 4.1 acceptance baseline; replace them after a new full run:

```bash
EDUFLOW_RUN_FULL_BOOK=1 /usr/bin/time -l uv run pytest -q -m full_book
uv run python ../../scripts/acceptance/phase4_1.py full-book --pytest-result PASS --pytest-duration 575.69 --pytest-peak-memory 1946.08
uv run python ../../scripts/acceptance/phase4_1.py package
```

Use `--output-dir /absolute/path` before `full-book` or `package` to write to a different directory.

## Phase 4.2

`pnpm acceptance:phase4.2:live` is the opt-in network acceptance. It uploads and parses the canonical PDF through the formal Phase 4.1 worker, scopes the resulting `CourseMaterial` to PDF pages 15–35, calls the configured DeepSeek model, persists the validated graph and Curriculum, reloads them through the real APIs, and hands them to the existing Course Skill Tree projection. It evaluates against the read-only Chapter 1 Gold package and writes `phase4.2-acceptance/summary.json`; the ignored report contains metrics and match decisions, never raw model responses or secrets.

For prompt iteration without reparsing the full book, reuse the IDs printed by a kept local run:

```bash
pnpm acceptance:phase4.2:live -- --job-id <completed-job-uuid> --owner-id <local-user-uuid> --keep
```

This command is guarded to Local Supabase. `pnpm verify:knowledge-generation:local` independently verifies atomic persistence, reload, idempotent rerun, and rollback without a live model call.
