"""Vercel entrypoint for the Workflow V2 compiler Function (merged into ``edu-flow``).

The authoritative implementation stays under ``services/workflow`` so Local development
(``pnpm workflow:local``), tests and the Worker image keep one source of truth. Vercel
bundles that source with this Function (``includeFiles`` in ``vercel.json``); this entry
adds it to ``sys.path``, applies the same fail-closed Hosted configuration assertion as
``services/workflow/main.py``, and mounts the existing authenticated FastAPI app under the
``/api/workflow-compiler`` prefix so ``/api/workflow-compiler/v1/...`` reaches the original
``/v1/...`` routes.
"""
import sys
from pathlib import Path

_CANDIDATES = (
    Path(__file__).resolve().parent.parent / "services" / "workflow" / "src",
    Path(__file__).resolve().parent / "services" / "workflow" / "src",
    Path.cwd() / "services" / "workflow" / "src",
)
_SOURCE = next((candidate for candidate in _CANDIDATES if candidate.is_dir()), None)
if _SOURCE is None:
    raise RuntimeError("WORKFLOW_SOURCE_MISSING: services/workflow/src is not bundled with this Function")
if str(_SOURCE) not in sys.path:
    sys.path.insert(0, str(_SOURCE))

from eduflow_workflow.operations import assert_hosted_configuration

assert_hosted_configuration()

from fastapi import FastAPI
from eduflow_workflow.server import app as compiler_app

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api/workflow-compiler", compiler_app)
