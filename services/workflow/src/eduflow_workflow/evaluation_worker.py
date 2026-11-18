"""Durable evaluation worker loop; shares the Worker process and SQL lease model."""
from __future__ import annotations

import asyncio
import json
import os
import time
import uuid

from .contracts import ExecutionError
from .storage import Storage

EVALUATION_TIMEOUT_SECONDS = 118
HEARTBEAT_SECONDS = 20
IDLE_SECONDS = 1.0


def _log(event: str, **fields):
    print(json.dumps({"event": event, **fields}, ensure_ascii=False), flush=True)


async def _heartbeat(storage: Storage, evaluation_id: str, worker_id: str):
    while True:
        await asyncio.sleep(HEARTBEAT_SECONDS)
        if not await storage.call("evaluation_heartbeat", evaluation_id, worker_id):
            raise ExecutionError("LEASE_LOST", "Evaluation lease was lost", "infrastructure", effect="none")


async def execute_evaluation(payload, registry, storage: Storage, worker_id: str):
    from .evaluation import evaluate_claim, failure_report

    evaluation_id = str(payload["evaluationId"])
    run_id = str(payload.get("runId") or "")
    started = time.monotonic()
    beat = asyncio.create_task(_heartbeat(storage, evaluation_id, worker_id))
    try:
        result = await asyncio.wait_for(evaluate_claim(payload, registry), timeout=EVALUATION_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        result = failure_report(payload, "EVALUATION_TIMEOUT", "Evaluation exceeded its execution budget", True)
    except Exception as error:
        result = failure_report(payload, "EVALUATION_WORKER_FAILED", (str(error) or "Evaluation failed")[:500], True)
    finally:
        beat.cancel()
        await asyncio.gather(beat, return_exceptions=True)
    try:
        receipt = await storage.call(
            "evaluation_finish",
            evaluation_id,
            worker_id,
            result["status"],
            result.get("outcome"),
            result.get("semantic_status") or "failed",
            result.get("report"),
            result.get("error_code"),
            result.get("error_message"),
            bool(result.get("retryable")),
        )
    except ExecutionError as error:
        _log("workflow.evaluation.finish", evaluationId=evaluation_id, runId=run_id, outcome="lease_lost" if error.code == "LEASE_LOST" else "failed", code=error.code)
        return {"status": "lost"}
    outcome = result.get("outcome") or receipt.get("status")
    _log(
        "workflow.evaluation",
        evaluationId=evaluation_id,
        runId=run_id,
        status=result["status"],
        outcome=outcome,
        semanticStatus=result.get("semantic_status"),
        attempt=payload.get("attempt"),
        durationMs=int((time.monotonic() - started) * 1000),
        receipt=receipt.get("status"),
    )
    return {"status": result["status"], "outcome": outcome, "receipt": receipt}


async def evaluation_worker(stop=None):
    """Poll and execute one evaluation at a time; safe to restart at any point."""
    from .server import refresh, registry

    stop = stop or asyncio.Event()
    storage = Storage(os.environ["WORKFLOW_DATABASE_URL"])
    worker_id = "eval:" + uuid.uuid4().hex
    while not stop.is_set():
        try:
            refresh()
            payload = await storage.call("evaluation_claim", worker_id)
            if not payload:
                await asyncio.sleep(IDLE_SECONDS)
                continue
            await execute_evaluation(payload, registry, storage, worker_id)
        except Exception as error:
            # A storage outage must not stop the daemon; the claimed row lease will
            # recover after its deadline, and another round can claim it.
            _log("workflow.evaluation.worker", outcome="retry", code=getattr(error, "code", "EVALUATION_STORAGE_FAILED"))
            await asyncio.sleep(2)
    _log("workflow.evaluation.worker", outcome="stopped")


async def evaluate_pending(limit: int = 1, budget_seconds: float | None = None) -> int:
    """Bounded drain used by the hosted queue consumer after a Run finishes."""
    from .evaluation import evaluate_claim
    from .server import refresh, registry

    storage = Storage(os.environ["WORKFLOW_DATABASE_URL"])
    worker_id = "eval:" + uuid.uuid4().hex
    completed = 0
    deadline = time.monotonic() + (budget_seconds if budget_seconds is not None else 60)
    while completed < limit and time.monotonic() < deadline:
        try:
            refresh()
            payload = await storage.call("evaluation_claim", worker_id)
            if not payload:
                break
            remaining = max(1, int(deadline - time.monotonic()))
            beat = asyncio.create_task(_heartbeat(storage, str(payload["evaluationId"]), worker_id))
            try:
                result = await asyncio.wait_for(evaluate_claim(payload, registry), timeout=min(EVALUATION_TIMEOUT_SECONDS, remaining))
            except asyncio.TimeoutError:
                result = failure_report(payload, "EVALUATION_TIMEOUT", "Evaluation exceeded the function budget", True)
            except Exception as error:
                result = failure_report(payload, "EVALUATION_WORKER_FAILED", str(error)[:500], True)
            finally:
                beat.cancel()
                await asyncio.gather(beat, return_exceptions=True)
            await storage.call(
                "evaluation_finish", payload["evaluationId"], worker_id, result["status"], result.get("outcome"),
                result.get("semantic_status") or "failed", result.get("report"), result.get("error_code"),
                result.get("error_message"), bool(result.get("retryable")),
            )
            completed += 1
        except Exception:
            break
    return completed
