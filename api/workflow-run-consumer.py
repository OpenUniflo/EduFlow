"""Vercel entrypoint for the Workflow V2 queue push consumer.

Vercel Queues invokes this private Function with a ``runId``-only message (and, for the
delayed watchdog check, ``kind=timeout``). The Function adds the authoritative
``services/workflow`` source (bundled with ``includeFiles``), applies the same fail-closed
Hosted configuration assertion as the compiler, and exposes the ASGI app from
``eduflow_workflow.queue_consumer``. The consumer claims exactly that Run; it never uses the
shared PGMQ ``claim`` rotation. A finished Run or a timeout check performs one bounded
watchdog/p5_sweep/reap pass, so no standing daemon is required.
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

from eduflow_workflow.queue_consumer import app
