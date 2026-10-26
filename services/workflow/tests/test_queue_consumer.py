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
