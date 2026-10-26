"""Readable provider/tool failure context stays bounded and credential-free."""
import asyncio
import httpx
import pytest
from langchain_core.messages import AIMessageChunk
from eduflow_workflow.contracts import ExecutionError
from test_llm_v2 import llm_config, llm_node, llm_run


class ModelStatusError(Exception):
    status_code = 401


async def failing_model(*args, **kwargs):
    raise ModelStatusError("provider said no")


def test_execution_error_dto_carries_only_safe_identity_fields():
    error = ExecutionError("MODEL_REQUEST_FAILED", "Model request failed", "auth", external_status=401, reason="auth_failed", provider="DeepSeek", model="deepseek-chat", host="api.deepseek.com")
    dto = error.dto()
    assert dto["code"] == "MODEL_REQUEST_FAILED"
    assert dto["reason"] == "auth_failed" and dto["httpStatus"] == 401
    assert dto["provider"] == "DeepSeek" and dto["model"] == "deepseek-chat" and dto["host"] == "api.deepseek.com"
    assert "api.deepseek.com/chat" not in str(dto)


async def test_model_auth_failure_adds_reason_provider_model_and_host(monkeypatch):
    run, _ = llm_run(monkeypatch)
    run.env["providers"] = [{"ref": "provider", "name": "DeepSeek", "modelRefs": ["model-a"], "secretRef": "MODEL_KEY", "baseUrl": "https://api.deepseek.com"}]
    run.env["adapter"] = "deepseek"
    monkeypatch.setattr("eduflow_workflow.session_memory_history.stream_model", failing_model)
    with pytest.raises(ExecutionError) as caught:
        await run.llm(llm_node(llm_config(), {}), {})
    dto = caught.value.dto()
    assert dto["code"] == "MODEL_REQUEST_FAILED"
    assert dto["reason"] == "auth_failed"
    assert dto["httpStatus"] == 401
    assert dto["provider"] == "DeepSeek"
    assert dto["model"] == "model-a"
    assert dto["host"] == "api.deepseek.com"
    assert "provider said no" not in str(dto)


async def test_model_connection_failure_is_connection_refused(monkeypatch):
    run, _ = llm_run(monkeypatch)
    run.env["providers"] = [{"ref": "provider", "name": "DeepSeek", "modelRefs": ["model-a"], "secretRef": "MODEL_KEY", "baseUrl": "https://api.deepseek.com"}]

    async def refuse(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr("eduflow_workflow.session_memory_history.stream_model", refuse)
    with pytest.raises(ExecutionError) as caught:
        await run.llm(llm_node(llm_config(), {}), {})
    assert caught.value.dto()["reason"] == "connection_refused"


async def test_stream_stall_is_reported_as_stream_interrupted(monkeypatch):
    import eduflow_workflow.session_memory_history as history

    class StallingModel:
        async def astream(self, messages, stream_usage=True):
            yield AIMessageChunk(content="partial", response_metadata={"finish_reason": None})
            await asyncio.sleep(10)

    run, _ = llm_run(monkeypatch)
    run.env["providers"] = [{"ref": "provider", "name": "DeepSeek", "modelRefs": ["model-a"], "secretRef": "MODEL_KEY", "baseUrl": "https://api.deepseek.com"}]
    monkeypatch.setattr("eduflow_workflow.runtime.ChatDeepSeek", lambda **kwargs: StallingModel())
    monkeypatch.setattr(history, "STREAM_IDLE_SECONDS", 0.01)
    with pytest.raises(ExecutionError) as caught:
        await run.llm(llm_node(llm_config(), {}), {})
    dto = caught.value.dto()
    assert dto["code"] == "MODEL_STREAM_INTERRUPTED"
    assert dto["reason"] == "stream_interrupted"
    assert dto["provider"] == "DeepSeek" and dto["model"] == "model-a"
    assert dto["elapsedMs"] >= 0


async def test_llm_node_timeout_is_reported_as_a_model_timeout(monkeypatch):
    run, _ = llm_run(monkeypatch)
    run.env["providers"] = [{"ref": "provider", "name": "DeepSeek", "modelRefs": ["model-a"], "secretRef": "MODEL_KEY", "baseUrl": "https://api.deepseek.com"}]

    async def slow(*args, **kwargs):
        await asyncio.sleep(10)

    run.definition["policy"] = {**run.definition["policy"], "timeoutMs": 5000, "nodeTimeoutMs": 10}
    monkeypatch.setattr(run, "llm", slow)
    node = llm_node(llm_config(), {})
    with pytest.raises(ExecutionError) as caught:
        await run._process_node(node, {}, {}, {})
    dto = caught.value.dto()
    assert dto["code"] == "MODEL_TIMEOUT"
    assert dto["reason"] == "timeout"
    assert dto["provider"] == "DeepSeek" and dto["model"] == "model-a"
    assert dto["timeoutMs"] > 0 and dto["elapsedMs"] >= 0


def test_tool_context_strips_path_and_query():
    from eduflow_workflow.tools import _status_reason, _tool_context
    assert _status_reason(401) == "auth_failed"
    assert _status_reason(429) == "rate_limited"
    assert _status_reason(500) == "provider_error"
    context = _tool_context({"name": "Hacker News 搜索", "baseUrl": "https://hn.algolia.com/api/v1/search?query=secret"})
    assert context == {"provider": "Hacker News 搜索", "tool": "Hacker News 搜索", "host": "hn.algolia.com"}
