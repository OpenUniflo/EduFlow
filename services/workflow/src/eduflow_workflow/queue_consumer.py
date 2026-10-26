"""Vercel Queues push consumer for exactly one claimed Workflow Run.

The queue message carries only ``runId``. It never enters the shared PGMQ ``claim``
rotation: ``claim_run`` is fenced to the named Run so a Preview consumer cannot take a
Production/older-deployment Run. At-least-once delivery is safe because a terminal,
already-running or waiting Run is acknowledged without executing it again.
"""
import asyncio
import json
import os
import time
import uuid
from datetime import datetime, timezone

from vercel.queue import Message, RetryAfter, accept_and_handle, send as send_message, subscribe

TOPIC = "workflow-runs"
# A file-based Function has no generated Python subscriber metadata, so the trigger and
# the SDK subscriber must share an explicit consumer group. v1beta accepts `consumer`;
# v2beta derives it from the generated subscriber instead.
CONSUMER_GROUP = "workflow-runs"
DEFAULT_BUDGET_SECONDS = 270
MAX_BUDGET_SECONDS = 290
MAX_DELAY_SECONDS = 604800  # Vercel Queues maximum delay/retention.
WAIT_DELIVERY_MARGIN_SECONDS = 60


def _run_id(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def _budget_seconds():
    try:
        value = int(os.environ.get("WORKFLOW_QUEUE_FUNCTION_BUDGET_SECONDS", DEFAULT_BUDGET_SECONDS))
    except ValueError:
        value = DEFAULT_BUDGET_SECONDS
    return max(30, min(value, MAX_BUDGET_SECONDS))


def _remaining_seconds(expires_at):
    if not isinstance(expires_at, str):
        return 0.0
    try:
        parsed = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except ValueError:
        return 0.0
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return (parsed - datetime.now(timezone.utc)).total_seconds()


async def _send_wait(run_id, delay_seconds):
    delay = max(1, min(int(delay_seconds), MAX_DELAY_SECONDS - WAIT_DELIVERY_MARGIN_SECONDS))
    retention = min(MAX_DELAY_SECONDS, max(3600, delay + WAIT_DELIVERY_MARGIN_SECONDS))
    # The idempotency key makes a retried pause/wake publish safe; Vercel deduplicates within
    # the retention window. The consumer still treats a duplicate as a no-op.
    await send_message(
        TOPIC,
        {"runId": run_id, "kind": "wait"},
        delay=delay,
        retention=retention,
        idempotency_key=f"run:{run_id}:wait",
    )


async def _schedule_existing_wait(storage, run_id, claim):
    remaining = _remaining_seconds(claim.get("waitExpiresAt"))
    if remaining <= 0:
        result = await storage.call("expire_wait", run_id)
        # A clock/lease race can report the wait as still live at the exact boundary.
        if isinstance(result, dict) and result.get("expired") is False and result.get("waitExpiresAt"):
            await _send_wait(run_id, max(1, _remaining_seconds(result["waitExpiresAt"])))
            return "wait_scheduled"
        return "wait_expired"
    await _send_wait(run_id, remaining)
    return "wait_scheduled"


async def consume_run(run_id):
    """Claim and execute one Run; return a bounded outcome label."""
    from .server import refresh, registry
    from .storage import Storage
    from .cli import execute_claim

    storage = Storage(os.environ["WORKFLOW_DATABASE_URL"])
    refresh()
    worker_id = "queue:" + uuid.uuid4().hex
    claim = await storage.call("claim_run", run_id, worker_id)
    if not claim:
        return "missing"
    kind = claim.get("kind")
    if kind == "busy":
        raise RetryAfter(5)
    if kind in {"terminal", "running", "sealed", "expired", "unsupported"}:
        return kind
    if kind == "waiting":
        return await _schedule_existing_wait(storage, run_id, claim)
    result = await execute_claim(
        claim,
        registry,
        storage,
        signal_role=None,
        failure_code="QUEUE_EXECUTION_FAILED",
        budget_seconds=_budget_seconds(),
    )
    if result.get("status") == "paused":
        await _send_wait(run_id, max(1, int(result.get("waitMs", 1000) / 1000)))
        return "paused"
    return result.get("status", "failed")


@subscribe(topic=TOPIC, consumer_group=CONSUMER_GROUP)
async def consume(message: Message[dict[str, object]]) -> None:
    payload = message.payload if isinstance(message.payload, dict) else {}
    run_id = _run_id(payload.get("runId"))
    if not run_id:
        # A malformed message is not worth redelivering; return so the SDK acknowledges it.
        print(json.dumps({"event": "workflow.queue.consumer", "outcome": "invalid"}), flush=True)
        return
    started = time.monotonic()
    try:
        outcome = await consume_run(run_id)
    except Exception:
        print(json.dumps({"event": "workflow.queue.consumer", "runId": run_id, "outcome": "retry", "durationMs": int((time.monotonic() - started) * 1000)}), flush=True)
        raise
    print(json.dumps({"event": "workflow.queue.consumer", "runId": run_id, "outcome": outcome, "durationMs": int((time.monotonic() - started) * 1000)}), flush=True)


async def _respond(send, status, body):
    await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json")]})
    await send({"type": "http.response.body", "body": body})


async def app(scope, receive, send):
    """Minimal ASGI entry so a file-based Python Function can receive queue callbacks."""
    if scope.get("type") != "http" or scope.get("method") != "POST":
        await _respond(send, 405, b'{"error":"method_not_allowed"}')
        return
    body = bytearray()
    while True:
        event = await receive()
        if event.get("type") != "http.request":
            break
        body.extend(event.get("body", b""))
        if not event.get("more_body", False):
            break
    headers = {
        key.decode("latin-1").lower(): value.decode("latin-1")
        for key, value in scope.get("headers", [])
    }
    await accept_and_handle(bytes(body), headers, lease_duration=_budget_seconds())
    await _respond(send, 200, b'{"ok":true}')
