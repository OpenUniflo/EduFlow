"""Offline tests for the queue push consumer boundary (no network, no database)."""
from datetime import datetime, timedelta, timezone

import pytest

from eduflow_workflow import queue_consumer


@pytest.mark.parametrize("value", ["not-a-uuid", "", None, 42, {"runId": "x"}])
def test_run_id_rejects_non_identities(value):
    assert queue_consumer._run_id(value) is None


def test_run_id_normalizes_a_uuid():
    assert queue_consumer._run_id("11111111-1111-4111-8111-111111111111") == "11111111-1111-4111-8111-111111111111"


def test_remaining_seconds_handles_naive_past_and_future_values():
    assert queue_consumer._remaining_seconds(None) == 0.0
    assert queue_consumer._remaining_seconds("not-a-timestamp") == 0.0
    assert queue_consumer._remaining_seconds((datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()) <= 0
    assert 50 < queue_consumer._remaining_seconds((datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()) <= 60


@pytest.mark.asyncio
async def test_asgi_app_rejects_non_post_callbacks_without_touching_the_queue():
    sent = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    await queue_consumer.app({"type": "http", "method": "GET", "headers": []}, receive, send)
    assert sent[0]["status"] == 405
    assert sent[1]["type"] == "http.response.body"


def test_subscriber_is_registered_for_the_workflow_runs_topic_and_consumer_group():
    from vercel.queue import get_subscriptions

    assert any(
        subscription.topic == queue_consumer.TOPIC and subscription.consumer_group == queue_consumer.CONSUMER_GROUP
        for subscription in get_subscriptions()
    )


def test_function_budget_defaults_and_caps(monkeypatch):
    monkeypatch.delenv("WORKFLOW_QUEUE_FUNCTION_BUDGET_SECONDS", raising=False)
    assert queue_consumer._budget_seconds() == 250
    monkeypatch.setenv("WORKFLOW_QUEUE_FUNCTION_BUDGET_SECONDS", "9999")
    assert queue_consumer._budget_seconds() == 270
    monkeypatch.setenv("WORKFLOW_QUEUE_FUNCTION_BUDGET_SECONDS", "1")
    assert queue_consumer._budget_seconds() == 30


@pytest.mark.asyncio
async def test_timeout_message_runs_one_bounded_sweep_without_claiming(monkeypatch):
    from eduflow_workflow import sandbox, server, storage

    calls = []

    class Store:
        def __init__(self, url):
            assert url == "synthetic-database"

        async def call(self, name, *args):
            calls.append(name)
            if name == "evaluation_pending":
                return {"pending": False}
            return 0

    async def reap():
        calls.append("reap")

    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "synthetic-database")
    monkeypatch.setattr(storage, "Storage", Store)
    monkeypatch.setattr(server, "refresh", lambda: None)
    monkeypatch.setattr(sandbox, "reap", reap)
    assert await queue_consumer.consume_run("11111111-1111-4111-8111-111111111111", kind="timeout") == "timeout_swept"
    assert calls == ["watchdog", "p5_sweep", "reap", "evaluation_pending"]


@pytest.mark.asyncio
async def test_timeout_watchdog_failure_retries_instead_of_silently_acking(monkeypatch):
    from eduflow_workflow import sandbox, server, storage

    calls = []

    class Store:
        def __init__(self, url):
            pass

        async def call(self, name, *args):
            calls.append(name)
            raise RuntimeError("database unavailable")

    async def reap():
        calls.append("reap")

    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "synthetic-database")
    monkeypatch.setattr(storage, "Storage", Store)
    monkeypatch.setattr(server, "refresh", lambda: None)
    monkeypatch.setattr(sandbox, "reap", reap)
    with pytest.raises(RuntimeError):
        await queue_consumer.consume_run("11111111-1111-4111-8111-111111111111", kind="timeout")
    assert calls == ["watchdog"]


@pytest.mark.asyncio
@pytest.mark.parametrize("claim_kind", ["terminal", "running", "unsupported"])
async def test_duplicate_delivery_acks_without_executing(monkeypatch, claim_kind):
    from eduflow_workflow import cli, server, storage

    executed = []

    class Store:
        def __init__(self, url):
            pass

        async def call(self, name, *args):
            if name == "evaluation_pending":
                return {"pending": False}
            assert name == "claim_run"
            return {"kind": claim_kind}

    async def execute_claim(*args, **kwargs):
        executed.append(1)

    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "synthetic-database")
    monkeypatch.setattr(storage, "Storage", Store)
    monkeypatch.setattr(server, "refresh", lambda: None)
    monkeypatch.setattr(cli, "execute_claim", execute_claim)
    assert await queue_consumer.consume_run("11111111-1111-4111-8111-111111111111") == claim_kind
    assert executed == []


@pytest.mark.asyncio
async def test_sealed_stale_lease_is_acknowledged_and_swept(monkeypatch):
    from eduflow_workflow import cli, sandbox, server, storage

    calls = []

    class Store:
        def __init__(self, url):
            pass

        async def call(self, name, *args):
            calls.append(name)
            if name == "claim_run":
                return {"kind": "sealed"}
            if name == "evaluation_pending":
                return {"pending": False}
            return 0

    async def execute_claim(*args, **kwargs):
        raise AssertionError("sealed work must never execute")

    async def reap():
        calls.append("reap")

    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "synthetic-database")
    monkeypatch.setattr(storage, "Storage", Store)
    monkeypatch.setattr(server, "refresh", lambda: None)
    monkeypatch.setattr(cli, "execute_claim", execute_claim)
    monkeypatch.setattr(sandbox, "reap", reap)
    assert await queue_consumer.consume_run("11111111-1111-4111-8111-111111111111") == "sealed"
    assert calls == ["claim_run", "watchdog", "p5_sweep", "reap", "evaluation_pending"]


@pytest.mark.asyncio
async def test_execute_claim_finishes_a_budget_timeout_as_run_timeout(monkeypatch):
    import asyncio
    from eduflow_workflow import cli, runtime

    finished = []

    class SlowExecution:
        def __init__(self, claim, registry, storage):
            self.deadline = 0

        async def run_graph(self):
            await asyncio.sleep(30)

    class Store:
        async def check(self, run, token, extend=False):
            return {"cancelled": False}

        async def call(self, name, *args):
            finished.append((name, args))
            return True

    monkeypatch.setattr(runtime, "RunExecution", SlowExecution)
    result = await cli.execute_claim(
        {"run": {"run_id": "run-timeout"}, "token": 7},
        {},
        Store(),
        budget_seconds=0.05,
    )
    assert result == {"status": "failed", "error": "RUN_TIMEOUT"}
    assert finished[0][0] == "finish"
    assert finished[0][1][2] == "failed"
    error = finished[0][1][4]
    assert error["code"] == "RUN_TIMEOUT"
    assert error["reason"] == "timeout"
    assert error["timeoutMs"] == 50
    assert error["effect"] == "unknown"


@pytest.mark.asyncio
async def test_evaluation_message_drains_one_job_and_schedules_a_pending_sweep(monkeypatch):
    from eduflow_workflow import evaluation_worker, server, storage

    drained = []
    scheduled = []

    async def evaluate_pending(limit, budget_seconds):
        drained.append((limit, budget_seconds))
        return 1

    async def send_message(topic, payload, **kwargs):
        scheduled.append((topic, payload, kwargs))

    class Store:
        def __init__(self, url):
            pass

        async def call(self, name, *args):
            assert name == "evaluation_pending"
            return {"queued": 1, "running": 0, "staleRunning": 0, "pending": True}

    class Message:
        payload = {"kind": "evaluation"}

    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "synthetic-database")
    monkeypatch.setattr(storage, "Storage", Store)
    monkeypatch.setattr(server, "refresh", lambda: None)
    monkeypatch.setattr(evaluation_worker, "evaluate_pending", evaluate_pending)
    monkeypatch.setattr(queue_consumer, "send_message", send_message)
    await queue_consumer.consume(Message())
    assert drained == [(1, 90)]
    assert [item[1] for item in scheduled] == [{"kind": "evaluation"}]
    assert [item[2]["delay"] for item in scheduled] == [5]


@pytest.mark.asyncio
async def test_evaluation_send_failure_is_retried_before_any_drain(monkeypatch):
    from vercel.queue import RetryAfter
    from eduflow_workflow import evaluation_worker, server, storage

    drained = []

    async def evaluate_pending(limit, budget_seconds):
        drained.append(limit)
        return 1

    async def send_message(topic, payload, **kwargs):
        raise RuntimeError("queue unavailable")

    class Store:
        def __init__(self, url):
            pass

        async def call(self, name, *args):
            assert name == "evaluation_pending"
            return {"pending": True}

    class Message:
        payload = {"kind": "evaluation"}

    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "synthetic-database")
    monkeypatch.setattr(storage, "Storage", Store)
    monkeypatch.setattr(server, "refresh", lambda: None)
    monkeypatch.setattr(evaluation_worker, "evaluate_pending", evaluate_pending)
    monkeypatch.setattr(queue_consumer, "send_message", send_message)
    with pytest.raises(RetryAfter):
        await queue_consumer.consume(Message())
    assert drained == []


@pytest.mark.asyncio
async def test_pending_read_failure_is_not_acked(monkeypatch):
    from vercel.queue import RetryAfter
    from eduflow_workflow import server, storage

    class Store:
        def __init__(self, url):
            pass

        async def call(self, name, *args):
            raise RuntimeError("pending read failed")

    class Message:
        payload = {"kind": "evaluation"}

    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "synthetic-database")
    monkeypatch.setattr(storage, "Storage", Store)
    monkeypatch.setattr(server, "refresh", lambda: None)
    with pytest.raises(RetryAfter):
        await queue_consumer.consume(Message())


@pytest.mark.asyncio
async def test_sweep_is_scheduled_before_the_drain_can_crash(monkeypatch):
    from eduflow_workflow import evaluation_worker, storage

    order = []

    async def evaluate_pending(limit, budget_seconds):
        order.append("drain")
        raise RuntimeError("worker died")

    async def send_message(topic, payload, **kwargs):
        order.append("schedule")

    class Store:
        def __init__(self, url):
            pass

        async def call(self, name, *args):
            return {"pending": True}

    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "synthetic-database")
    monkeypatch.setattr(storage, "Storage", Store)
    monkeypatch.setattr(evaluation_worker, "evaluate_pending", evaluate_pending)
    monkeypatch.setattr(queue_consumer, "send_message", send_message)
    with pytest.raises(RuntimeError):
        await queue_consumer._ensure_evaluation_wakeup(Store("x"), budget_seconds=10)
    assert order == ["schedule", "drain"]


@pytest.mark.asyncio
async def test_terminal_redelivery_checks_pending_instead_of_acking_early(monkeypatch):
    from eduflow_workflow import cli, server, storage

    ensured = []

    class Store:
        def __init__(self, url):
            pass

        async def call(self, name, *args):
            assert name == "claim_run"
            return {"kind": "terminal", "status": "success"}

    async def ensure(storage, budget_seconds):
        ensured.append(budget_seconds)
        return 1

    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "synthetic-database")
    monkeypatch.setattr(storage, "Storage", Store)
    monkeypatch.setattr(server, "refresh", lambda: None)
    monkeypatch.setattr(queue_consumer, "_ensure_evaluation_wakeup", ensure)
    assert await queue_consumer.consume_run("11111111-1111-4111-8111-111111111111") == "terminal"
    assert ensured == [60]


@pytest.mark.asyncio
async def test_each_pending_round_schedules_exactly_one_linear_successor(monkeypatch):
    from eduflow_workflow import evaluation_worker, storage

    sends = []
    drains = []

    async def evaluate_pending(limit, budget_seconds):
        drains.append(limit)
        return 0

    async def send_message(topic, payload, **kwargs):
        sends.append(kwargs["idempotency_key"])

    class Store:
        def __init__(self, url):
            pass

        async def call(self, name, *args):
            return {"pending": True, "queued": 1, "running": 0}

    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "synthetic-database")
    monkeypatch.setattr(storage, "Storage", Store)
    monkeypatch.setattr(evaluation_worker, "evaluate_pending", evaluate_pending)
    monkeypatch.setattr(queue_consumer, "send_message", send_message)
    for _ in range(5):
        await queue_consumer._ensure_evaluation_wakeup(Store("x"), budget_seconds=8)
    assert len(sends) == 5
    assert len(drains) == 5
    assert len(set(sends)) == 5
