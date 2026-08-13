# EduFlow parser

This Python 3.12 project is the Phase 4.1 boundary around Docling. `uv.lock` is authoritative; do not install Docling with Conda or pip.

```bash
uv sync --locked
uv run pytest -q
uv run eduflow-parser parse SOURCE RAW_JSON NORMALIZED_JSON --material-id MATERIAL_ID
uv run eduflow-parser normalize RAW_JSON NORMALIZED_JSON --material-id MATERIAL_ID
```

The first command writes the raw Docling artifact before adapting it. The second command proves that adapter changes can produce a new `CourseMaterial` without reading the source binary.

The 307-page canonical verification is intentionally excluded from ordinary tests and CI:

```bash
EDUFLOW_RUN_FULL_BOOK=1 uv run pytest -q -m full_book
```

`eduflow-parser-job JOB_ID` claims exactly one pending Supabase job. It requires server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, downloads the existing source from private Storage, and uploads raw and normalized artifacts separately. Invocation and production scheduling are outside this service boundary.
