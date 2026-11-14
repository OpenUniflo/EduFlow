import json

import pytest

from eduflow_workflow import evaluation


def payload(**overrides):
    data = {
        "evaluationId": "11111111-1111-4111-8111-111111111111",
        "ownerId": "22222222-2222-4222-8222-222222222222",
        "runId": "33333333-3333-4333-8333-333333333333",
        "workflowId": "workflow",
        "revision": 1,
        "triggerKind": "automatic",
        "attempt": 1,
        "maxAttempts": 3,
        "config": {
            "schemaVersion": 1, "enabled": True, "mode": "rules", "goal": "", "criteria": [],
            "rubricVersion": 0, "configVersion": 0, "providerRef": None, "modelRef": None,
            "environmentRef": None,
        },
        "run": {
            "status": "success",
            "output": {"result": "A1001", "answer": "42"},
            "input": {"query": "A1001"},
            "error": None,
            "environmentRef": "local",
        },
        "definition": {
            "name": "Synthetic evaluation fixture",
            "outputSchema": {"type": "object", "required": ["result"], "properties": {"result": {"type": "string"}}, "additionalProperties": True},
            "nodes": [
                {"id": "start", "type": "core.start", "label": "开始"},
                {"id": "lookup", "type": "core.llm", "label": "查询"},
                {"id": "end", "type": "core.end", "label": "结束"},
            ],
        },
        "steps": [
            {"nodeId": "lookup", "invocation": 1, "status": "completed", "error": None, "inputExcerpt": '{"query":"A1001"}', "outputExcerpt": '{"result":"A1001"}'},
        ],
        "events": [
            {"type": "tool.completed", "nodeId": "lookup", "stepId": "step", "payload": json.dumps({"toolRef": "order_lookup", "callId": "call-1"})},
        ],
    }
    for key, value in overrides.items():
        if key == "config":
            data["config"] = {**data["config"], **value}
        elif key == "run":
            data["run"] = {**data["run"], **value}
        else:
            data[key] = value
    return data


def semantic_payload(**overrides):
    data = payload(**overrides)
    data["config"].update({
        "enabled": True,
        "mode": "semantic",
        "goal": "回答用户的问题并返回订单号",
        "criteria": ["给出订单号", "不编造未记录的信息"],
        "rubricVersion": 4,
        "configVersion": 4,
        "providerRef": "p4:owner:provider:1",
        "modelRef": "fixture-model",
        "environmentRef": "local",
    })
    return data


def test_rules_pass_with_real_step_and_tool_evidence():
    result = evaluation.evaluate_rules(payload())
    assert result["outcome"] == "rules_passed"
    assert result["hardFailures"] == []
    assert result["trace"]["complete"] is True
    assert result["trace"]["expectedNodeCount"] == 1
    assert result["trace"]["stepCount"] == 1
    assert result["trace"]["failedStepCount"] == 0
    assert result["trace"]["toolEventCount"] == 1
    assert result["trace"]["toolFailureCount"] == 0
    assert result["trace"]["stepsTruncated"] is False
    assert result["trace"]["toolEventsTruncated"] is False
    dimensions = {item["key"]: item for item in result["dimensions"]}
    assert dimensions["execution"]["status"] == "passed"
    assert dimensions["output_schema"]["status"] == "passed"
    assert dimensions["steps"]["status"] == "passed"
    assert dimensions["tools"]["status"] == "passed"
    assert "order_lookup" in str(dimensions["tools"]["evidence"])


def test_failed_run_hard_fails_and_never_reaches_semantic_model():
    result = evaluation.evaluate_rules(payload(run={"status": "failed", "output": None, "error": {"code": "MODEL_TIMEOUT", "message": "Model response exceeded the node time limit"}}))
    assert result["outcome"] == "failed"
    assert any(item["code"] == "RUN_FAILED" for item in result["hardFailures"])

    class Registry:
        def environment(self, *args):
            raise AssertionError("semantic model must not be resolved after a hard failure")

    import asyncio
    finished = asyncio.run(evaluation.evaluate_claim(payload(
        config={"mode": "semantic", "goal": "g", "criteria": ["c"], "providerRef": "p", "modelRef": "m", "configVersion": 1},
        run={"status": "failed", "output": None, "error": {"code": "MODEL_TIMEOUT", "message": "timeout"}},
    ), Registry()))
    assert finished["status"] == "completed"
    assert finished["outcome"] == "failed"
    assert finished["semantic_status"] == "skipped_hard_failure"
    assert finished["report"]["semantic"]["metrics"] == []


def test_output_schema_mismatch_is_a_deterministic_failure():
    result = evaluation.evaluate_rules(payload(run={"output": {"answer": "missing result"}}))
    assert result["outcome"] == "failed"
    assert any(item["code"] == "OUTPUT_SCHEMA_MISMATCH" for item in result["hardFailures"])
    output = next(item for item in result["dimensions"] if item["key"] == "output_schema")
    assert output["status"] == "failed"
    assert output["evidence"]


def test_missing_trace_is_insufficient_evidence_not_a_fake_pass():
    result = evaluation.evaluate_rules(payload(steps=[], events=[]))
    assert result["outcome"] == "insufficient_evidence"
    assert result["hardFailures"] == [{"code": "TRACE_INCOMPLETE", "reason": "流程包含可执行节点，但运行记录中没有实际步骤；不能把最终文本当作执行轨迹，也不能据此评价目标完成。", "evidence": "expected=1 steps=0"}]
    assert result["trace"]["complete"] is False
    assert result["dimensions"][2]["status"] == "failed"


def test_rules_only_report_explains_missing_semantic_configuration():
    import asyncio
    finished = asyncio.run(evaluation.evaluate_claim(payload(), None))
    assert finished["status"] == "completed"
    assert finished["outcome"] == "rules_passed"
    assert finished["semantic_status"] == "not_configured"
    assert "未设置评价目标" in finished["report"]["semantic"]["reason"]
    assert finished["report"]["rubric"]["version"] == 0
    assert "评价" in finished["report"]["limitations"][0]


def test_semantic_hard_failure_never_calls_model(monkeypatch):
    called = False

    async def fail_if_called(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("model must not be called")

    monkeypatch.setattr(evaluation, "_run_semantic", fail_if_called)
    payload_data = semantic_payload(run={"status": "failed", "output": None, "error": {"code": "RUN_FAILED", "message": "boom"}})
    import asyncio
    finished = asyncio.run(evaluation.evaluate_claim(payload_data, object()))
    assert called is False
    assert finished["semantic_status"] == "skipped_hard_failure"
    assert finished["outcome"] == "failed"


def test_semantic_success_builds_evidence_report(monkeypatch):
    async def fake_semantic(payload, rules, registry):
        return {
            "model": "fixture-model", "provider": "Fixture", "semanticStatus": "completed",
            "metrics": [
                {"key": "goal_completion", "label": "目标完成", "status": "passed", "source": "semantic", "score": 0.9, "threshold": 0.7, "passed": True, "reason": "输出包含订单号 A1001。", "evidence": [{"label": "GEval 评分", "value": "0.90"}]},
                {"key": "output_quality", "label": "输出质量", "status": "passed", "source": "semantic", "score": 0.8, "threshold": 0.7, "passed": True, "reason": "输出清晰。", "evidence": [{"label": "GEval 评分", "value": "0.80"}]},
            ],
        }

    monkeypatch.setattr(evaluation, "_run_semantic", fake_semantic)
    import asyncio
    finished = asyncio.run(evaluation.evaluate_claim(semantic_payload(), object()))
    assert finished["status"] == "completed"
    assert finished["outcome"] == "passed"
    assert finished["semantic_status"] == "completed"
    assert [item["key"] for item in finished["report"]["dimensions"]][-2:] == ["goal_completion", "output_quality"]
    assert finished["report"]["rubric"] == {"version": 4, "goal": "回答用户的问题并返回订单号", "criteria": ["给出订单号", "不编造未记录的信息"]}
    assert finished["report"]["semantic"]["adapter"] == "deepeval-geval"


def test_model_timeout_is_a_retryable_evaluation_failure(monkeypatch):
    async def timeout(*args, **kwargs):
        raise evaluation.EvaluationModelFailure("EVALUATION_MODEL_TIMEOUT", "目标完成评价超过时间限制。", retryable=True)

    monkeypatch.setattr(evaluation, "_run_semantic", timeout)
    import asyncio
    finished = asyncio.run(evaluation.evaluate_claim(semantic_payload(), object()))
    assert finished["status"] == "failed"
    assert finished["error_code"] == "EVALUATION_MODEL_TIMEOUT"
    assert finished["retryable"] is True
    assert finished["semantic_status"] == "failed"
    assert finished["report"]["dimensions"][0]["status"] == "passed"


def test_model_unavailable_is_reported_as_not_evaluated_not_failed(monkeypatch):
    async def unavailable(*args, **kwargs):
        raise evaluation.EvaluationUnavailable("EVALUATION_MODEL_UNAVAILABLE", "所选评估模型连接在当前环境不可用；未调用模型。")

    monkeypatch.setattr(evaluation, "_run_semantic", unavailable)
    import asyncio
    finished = asyncio.run(evaluation.evaluate_claim(semantic_payload(), object()))
    assert finished["status"] == "completed"
    assert finished["outcome"] == "rules_passed"
    assert finished["semantic_status"] == "not_evaluated"
    assert "不可用" in finished["report"]["semantic"]["reason"]


def test_secret_values_are_redacted_and_output_is_bounded():
    text = evaluation._bounded_json({"apiKey": "sk-secret", "authorization": "Bearer abc", "nested": {"password": "p", "safe": "value"}}, 500)
    parsed = json.loads(text)
    assert parsed["apiKey"] == "[REDACTED]"
    assert parsed["authorization"] == "[REDACTED]"
    assert parsed["nested"]["password"] == "[REDACTED]"
    assert parsed["nested"]["safe"] == "value"
    bounded = evaluation._bounded_json({"value": "x" * 5000}, 100)
    assert len(bounded) <= 120
    assert bounded.endswith("[truncated]")


def test_deepeval_configuration_disables_telemetry(monkeypatch):
    monkeypatch.delenv("DEEPEVAL_TELEMETRY_OPT_OUT", raising=False)
    monkeypatch.setenv("NO_PROXY", "[::1],localhost,127.0.0.1")
    evaluation._configure_deepeval()
    import os
    assert os.environ["DEEPEVAL_TELEMETRY_OPT_OUT"] == "1"
    assert os.environ["DEEPEVAL_DISABLE_DOTENV"] == "1"
    assert "[" not in os.environ["NO_PROXY"]


def test_truncated_steps_are_insufficient_evidence():
    data = payload(aggregates={"stepTotal": 100, "stepReturned": 1, "stepsTruncated": True, "stepErrorCount": 0})
    result = evaluation.evaluate_rules(data)
    assert result["outcome"] == "insufficient_evidence"
    assert result["trace"]["complete"] is False
    assert result["trace"]["stepCount"] == 100
    assert result["trace"]["stepReturned"] == 1
    assert any(item["code"] == "STEPS_TRUNCATED" for item in result["hardFailures"])
    steps = next(item for item in result["dimensions"] if item["key"] == "steps")
    assert steps["status"] == "not_evaluated"
    assert "不能据此声称完整" in steps["reason"]

    import asyncio
    class Registry:
        def environment(self, *args):
            raise AssertionError("truncated evidence must not call a semantic model")
    finished = asyncio.run(evaluation.evaluate_claim(semantic_payload(aggregates={"stepTotal": 100, "stepReturned": 1, "stepsTruncated": True}), Registry()))
    assert finished["semantic_status"] == "insufficient_evidence"
    assert finished["outcome"] == "insufficient_evidence"


def test_truncated_tool_events_never_claim_complete_tools():
    data = payload(aggregates={"stepTotal": 1, "stepReturned": 1, "stepsTruncated": False, "toolEventTotal": 100, "toolEventReturned": 1, "toolEventsTruncated": True})
    result = evaluation.evaluate_rules(data)
    assert result["outcome"] == "insufficient_evidence"
    assert result["trace"]["complete"] is False
    assert any(item["code"] == "TOOL_TRACE_TRUNCATED" for item in result["hardFailures"])
    tools = next(item for item in result["dimensions"] if item["key"] == "tools")
    assert tools["status"] == "not_evaluated"


def test_tool_recovery_and_final_failure_are_distinguished():
    data = payload(aggregates={
        "stepTotal": 1, "stepReturned": 1, "stepsTruncated": False,
        "toolEventTotal": 4, "toolEventReturned": 4, "toolEventsTruncated": False,
        "toolCallCount": 2, "toolStartedCount": 2, "toolCompletedCount": 1,
        "toolFailedEventCount": 2, "toolSkippedEventCount": 0,
        "toolRecoveredCount": 1, "toolFinalFailureCount": 1, "toolIncompleteCount": 0,
    }, events=[
        {"type": "tool.failed", "nodeId": "lookup", "payload": {"toolRef": "retryable", "callId": "a", "error": {"code": "TOOL_TIMEOUT"}}},
        {"type": "tool.completed", "nodeId": "lookup", "payload": {"toolRef": "retryable", "callId": "a"}},
        {"type": "tool.failed", "nodeId": "lookup", "payload": {"toolRef": "final", "callId": "b", "error": {"code": "TOOL_FORBIDDEN"}}},
        {"type": "tool.skipped", "nodeId": "lookup", "payload": {"toolRef": "skipped", "toolCallId": "b", "reason": "previous_tool_failed"}},
    ])
    result = evaluation.evaluate_rules(data)
    tools = next(item for item in result["dimensions"] if item["key"] == "tools")
    assert tools["status"] == "failed"
    assert "1 个最终失败" in tools["reason"]
    assert "1 个在重试后完成" in tools["reason"]
    assert result["trace"]["toolRecoveredCount"] == 1
    assert result["trace"]["toolFinalFailureCount"] == 1
    assert result["outcome"] == "needs_improvement"


def test_semantic_success_cannot_override_a_soft_rule_failure(monkeypatch):
    async def fake_semantic(payload, rules, registry):
        return {
            "model": "fixture-model", "provider": "Fixture", "semanticStatus": "completed",
            "metrics": [
                {"key": "goal_completion", "label": "目标完成", "status": "passed", "source": "semantic", "score": 0.9, "threshold": 0.7, "passed": True, "reason": "ok", "evidence": []},
                {"key": "output_quality", "label": "输出质量", "status": "passed", "source": "semantic", "score": 0.9, "threshold": 0.7, "passed": True, "reason": "ok", "evidence": []},
            ],
        }
    monkeypatch.setattr(evaluation, "_run_semantic", fake_semantic)
    import asyncio
    finished = asyncio.run(evaluation.evaluate_claim(semantic_payload(aggregates={
        "stepTotal": 1, "stepReturned": 1, "stepsTruncated": False,
        "toolEventTotal": 1, "toolEventReturned": 1, "toolEventsTruncated": False,
        "toolCallCount": 1, "toolStartedCount": 1, "toolCompletedCount": 0,
        "toolFailedEventCount": 1, "toolSkippedEventCount": 0,
        "toolRecoveredCount": 0, "toolFinalFailureCount": 1, "toolIncompleteCount": 0,
    }), object()))
    assert finished["semantic_status"] == "completed"
    assert finished["outcome"] == "needs_improvement"


def test_structured_event_payload_is_not_flattened_to_a_string():
    events = evaluation._tool_events({"events": [{"type": "tool.failed", "nodeId": "n", "payload": {"toolRef": "t", "callId": "c", "error": {"code": "TOOL_TIMEOUT", "message": "late"}}}]})
    assert events[0]["toolRef"] == "t"
    assert events[0]["callId"] == "c"
    assert events[0]["errorCode"] == "TOOL_TIMEOUT"


def test_evaluation_uses_the_frozen_config_environment(monkeypatch):
    monkeypatch.setenv("P2_EVAL_SECRET", "fixture-secret")
    calls = []
    environment = {
        "ref": "evaluation-env",
        "providers": [{"ref": "chosen-provider", "name": "Chosen", "adapter": "deepseek", "modelRefs": ["chosen-model"], "baseUrl": "https://api.deepseek.com", "secretRef": "P2_EVAL_SECRET"}],
    }
    class Registry:
        def environment(self, ref, owner):
            calls.append((ref, owner))
            return environment
    data = semantic_payload(run={"environmentRef": "run-env"})
    data["config"]["environmentRef"] = "evaluation-env"
    data["config"]["providerRef"] = "chosen-provider"
    data["config"]["modelRef"] = "chosen-model"
    assert evaluation._evaluation_environment_ref(data) == "evaluation-env"
    model, provider, model_ref = evaluation._resolve_model(data, Registry())
    assert calls == [("evaluation-env", data["ownerId"])]
    assert provider == "Chosen"
    assert model_ref == "chosen-model"
    assert model.get_model_name() == "eduflow:Chosen/chosen-model"


def test_evaluation_reports_unavailable_when_the_selected_environment_is_revoked():
    class Registry:
        def environment(self, ref, owner):
            raise RuntimeError("not authorized")
    data = semantic_payload()
    data["config"]["environmentRef"] = "revoked-env"
    try:
        evaluation._resolve_model(data, Registry())
    except evaluation.EvaluationUnavailable as unavailable:
        assert unavailable.code == "EVALUATION_ENVIRONMENT_UNAVAILABLE"
        assert "无权" in unavailable.message or "不可用" in unavailable.message
    else:
        raise AssertionError("revoked environment must not resolve a model")


def test_failure_report_keeps_deterministic_base_checks():
    data = payload()
    report = evaluation.failure_report(data, "EVALUATION_TIMEOUT", "timeout", True)
    assert report["status"] == "failed"
    assert report["retryable"] is True
    assert report["report"]["dimensions"][0]["status"] == "passed"
    assert report["report"]["dimensions"][1]["status"] == "passed"
    assert report["report"]["semantic"]["status"] == "failed"
    assert report["report"]["semantic"]["errorCode"] == "EVALUATION_TIMEOUT"
    assert report["report"]["outcome"] == "rules_passed"
