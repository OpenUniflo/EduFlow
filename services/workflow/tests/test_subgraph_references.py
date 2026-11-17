"""Fixed independent Workflow references: authoring, frozen execution and guards."""
import asyncio
import copy
import time
import uuid
import pytest
from eduflow_workflow.compiler import compile_definition, validate_structure, CHILD_BUDGETS_METADATA_KEY
from eduflow_workflow.contracts import ExecutionError, DEFAULT_POLICY
from eduflow_workflow.interrupts import RunPaused
from eduflow_workflow.references import build_frozen_references, ReferenceSet
from eduflow_workflow.registry import Registry, obj
from eduflow_workflow.runtime import InvocationBudget, RunExecution
from test_contracts import sample
from test_runtime import MemoryStorage


def registry():
    reg = Registry({"environments": [{"ref": "test", "ownerIds": ["a"]}]})
    return reg


def literal(value):
    return {"source": "literal", "value": value}


def input_binding(field):
    return {"source": "input", "pointer": "/" + field, "onMissing": {"mode": "error"}}


def state_binding(field):
    return {"source": "state", "pointer": "/" + field, "onMissing": {"mode": "error"}}


def child_definition(workflow_id="child", revision=1, add=37):
    return {
        "schemaVersion": "2.0", "workflowId": workflow_id, "revision": revision, "name": workflow_id, "description": "",
        "inputSchema": obj({"value": {"type": "number"}}),
        "outputSchema": obj({"answer": {"type": "number"}}),
        "state": {
            "schema": obj({"value": {"type": "number"}, "answer": {"type": "number"}}),
            "initial": {"value": 0, "answer": 0}, "inputBindings": {"value": input_binding("value")}, "reducers": {},
        },
        "entryNodeId": "s",
        "nodes": [
            {"id": "s", "label": "Start", "type": "core.start", "typeVersion": 1, "config": {}, "inputs": {}, "writes": {}},
            {"id": "a", "label": "Add", "type": "core.transform", "typeVersion": 1, "config": {"operationRef": "core.add", "operationVersion": 1}, "inputs": {"left": input_binding("value"), "right": literal(add)}, "writes": {"answer": "/value"}},
            {"id": "e", "label": "End", "type": "core.end", "typeVersion": 1, "config": {}, "inputs": {}, "writes": {}},
        ],
        "transitions": [{"id": "sa", "from": "s", "outlet": "next", "to": "a"}, {"id": "ae", "from": "a", "outlet": "next", "to": "e"}],
        "outputBindings": {"answer": state_binding("answer")},
        "policy": dict(DEFAULT_POLICY), "requiredCapabilities": [],
    }


def reference_node(node_id, workflow_id="child", revision=1, environment="test", value=5):
    return {
        "id": node_id, "label": node_id, "type": "core.subgraph", "typeVersion": 1,
        "config": {"workflowRef": {"workflowId": workflow_id, "revision": revision}, "environmentRef": environment},
        "inputs": {"value": literal(value)}, "writes": {"answer": "/answer"},
    }


def parent_definition(workflow_id="parent", revision=1):
    return {
        "schemaVersion": "2.0", "workflowId": workflow_id, "revision": revision, "name": workflow_id, "description": "",
        "inputSchema": obj({}), "outputSchema": obj({"answer": {"type": "number"}}),
        "state": {"schema": obj({"answer": {"type": "number"}}), "initial": {"answer": 0}, "inputBindings": {}, "reducers": {}},
        "entryNodeId": "s",
        "nodes": [
            {"id": "s", "label": "Start", "type": "core.start", "typeVersion": 1, "config": {}, "inputs": {}, "writes": {}},
            reference_node("call"),
            {"id": "e", "label": "End", "type": "core.end", "typeVersion": 1, "config": {}, "inputs": {}, "writes": {}},
        ],
        "transitions": [{"id": "sc", "from": "s", "outlet": "next", "to": "call"}, {"id": "ce", "from": "call", "outlet": "next", "to": "e"}],
        "outputBindings": {"answer": state_binding("answer")},
        "policy": dict(DEFAULT_POLICY), "requiredCapabilities": [],
    }


def frozen(reg, definitions, root="parent", root_environment="test"):
    resolved = {
        "root": {"workflowId": root, "revision": 1},
        "targets": [
            {"workflowId": item["workflowId"], "revision": item["revision"], "environmentRef": root_environment, "definition": item}
            for item in definitions
        ],
    }
    return build_frozen_references(reg, resolved, "a", root_environment, None)


def execution_with_references(definition, references, reg=None, storage=None):
    reg = reg or registry()
    env = reg.environment("test", "a")
    snapshot = reg.snapshot(env)
    compiled = compile_definition(definition, snapshot, references)
    assert compiled["valid"], compiled["diagnostics"]
    run = {
        "run_id": "00000000-0000-0000-0000-000000000001", "owner_user_id": "a", "input": {},
        "environment_ref": "test", "environment_revision": env["revision"],
        "compile_fingerprint": compiled["compileFingerprint"],
        "registry_snapshot": {**snapshot, **({"workflowReferences": references} if references else {})},
    }
    return RunExecution({"run": run, "definition": definition, "token": 1}, reg, storage or MemoryStorage())


def test_save_shape_accepts_reference_and_execution_requires_a_resolved_closure():
    definition = parent_definition()
    reg = registry()
    assert validate_structure(definition, reg.nodes, reg.snapshot(reg.environment("test", "a"))["operations"])["valid"]
    compiled = compile_definition(definition, reg.snapshot(reg.environment("test", "a")))
    assert compiled["valid"] is False
    assert any(item["code"] == "WORKFLOW_REFERENCE_UNAVAILABLE" for item in compiled["diagnostics"])


def test_reference_executes_with_independent_state_and_maps_5_to_42():
    reg = registry()
    references = frozen(reg, [child_definition()])
    run = execution_with_references(parent_definition(), references, reg)
    import asyncio
    output = asyncio.run(run.run_graph())
    assert output == {"answer": 42}
    assert run.invocations == 6
    identities = [args[-1] for name, args in run.storage.calls if name == "step_start" and args and isinstance(args[-1], dict)]
    child_identity = next(item for item in identities if item.get("workflowId") == "child")
    assert child_identity["revision"] == 1
    assert child_identity["workflowPath"][-1]["workflowId"] == "child"
    assert child_identity["workflowPath"][-1]["nodeId"] == "call"


def test_same_target_twice_has_isolated_state():
    definition = parent_definition()
    definition["state"] = {"schema": obj({"answer1": {"type": "number"}, "answer2": {"type": "number"}}), "initial": {"answer1": 0, "answer2": 0}, "inputBindings": {}, "reducers": {}}
    definition["nodes"] = [
        definition["nodes"][0],
        reference_node("call1", value=5),
        reference_node("call2", value=10),
        definition["nodes"][2],
    ]
    definition["nodes"][1]["writes"] = {"answer1": "/answer"}
    definition["nodes"][2]["writes"] = {"answer2": "/answer"}
    definition["transitions"] = [
        {"id": "s1", "from": "s", "outlet": "next", "to": "call1"},
        {"id": "12", "from": "call1", "outlet": "next", "to": "call2"},
        {"id": "2e", "from": "call2", "outlet": "next", "to": "e"},
    ]
    definition["outputBindings"] = {"answer1": state_binding("answer1"), "answer2": state_binding("answer2")}
    definition["outputSchema"] = obj({"answer1": {"type": "number"}, "answer2": {"type": "number"}})
    run = execution_with_references(definition, frozen(registry(), [child_definition()]))
    import asyncio
    assert asyncio.run(run.run_graph()) == {"answer1": 42, "answer2": 47}


def test_parallel_reference_calls_do_not_share_child_state():
    definition = parent_definition()
    definition["state"] = {"schema": obj({"a": {"type": "number"}, "b": {"type": "number"}}), "initial": {"a": 0, "b": 0}, "inputBindings": {}, "reducers": {}}
    definition["nodes"] = [
        definition["nodes"][0], reference_node("call1", value=5), reference_node("call2", value=10),
        {"id": "j", "label": "join", "type": "control.join", "typeVersion": 1, "config": {"waitFor": ["call1", "call2"], "strategy": "all"}, "inputs": {}, "writes": {}},
        definition["nodes"][2],
    ]
    definition["nodes"][1]["writes"] = {"a": "/answer"}; definition["nodes"][2]["writes"] = {"b": "/answer"}
    definition["transitions"] = [
        {"id": "s1", "from": "s", "outlet": "next", "to": "call1"},
        {"id": "s2", "from": "s", "outlet": "next", "to": "call2"},
        {"id": "1j", "from": "call1", "outlet": "next", "to": "j"},
        {"id": "2j", "from": "call2", "outlet": "next", "to": "j"},
        {"id": "je", "from": "j", "outlet": "next", "to": "e"},
    ]
    definition["outputBindings"] = {"a": state_binding("a"), "b": state_binding("b")}
    definition["outputSchema"] = obj({"a": {"type": "number"}, "b": {"type": "number"}})
    run = execution_with_references(definition, frozen(registry(), [child_definition()]))
    import asyncio
    assert asyncio.run(run.run_graph()) == {"a": 42, "b": 47}


def test_nested_references_and_pinned_old_revision():
    reg = registry()
    leaf = child_definition("leaf")
    middle = child_definition("middle", add=0)
    middle["inputSchema"] = obj({"value": {"type": "number"}})
    middle["state"]["inputBindings"] = {"value": input_binding("value")}
    middle["nodes"] = [middle["nodes"][0], reference_node("leafcall", workflow_id="leaf", value=5), middle["nodes"][2]]
    middle["nodes"][1]["writes"] = {"answer": "/answer"}
    middle["transitions"] = [{"id": "sc", "from": "s", "outlet": "next", "to": "leafcall"}, {"id": "ce", "from": "leafcall", "outlet": "next", "to": "e"}]
    middle["outputBindings"] = {"answer": state_binding("answer")}
    references = frozen(reg, [leaf, middle], root="parent")
    parent = parent_definition(); parent["nodes"][1]["config"]["workflowRef"] = {"workflowId": "middle", "revision": 1}
    run = execution_with_references(parent, references, reg)
    import asyncio
    assert asyncio.run(run.run_graph()) == {"answer": 42}
    # Saving leaf@2 does not change the already frozen definition.
    newer = child_definition("leaf", revision=2, add=100)
    assert references["targets"][0]["revision"] == 1
    assert references["targets"][0]["definition"]["revision"] == 1
    assert newer["revision"] == 2


def test_reference_mapping_and_type_errors_are_rejected():
    reg = registry(); snapshot = reg.snapshot(reg.environment("test", "a")); references = frozen(reg, [child_definition()])
    definition = parent_definition(); definition["nodes"][1]["inputs"] = {}
    result = compile_definition(definition, snapshot, references)
    assert not result["valid"] and any(item["code"] == "WORKFLOW_REFERENCE_MAPPING" for item in result["diagnostics"])
    definition = parent_definition(); definition["nodes"][1]["writes"] = {"answer": "/missing"}
    result = compile_definition(definition, snapshot, references)
    assert not result["valid"] and any(item["code"] == "WORKFLOW_REFERENCE_MAPPING" for item in result["diagnostics"])
    definition = parent_definition(); definition["state"]["schema"]["properties"]["answer"] = {"type": "string"}
    result = compile_definition(definition, snapshot, references)
    assert not result["valid"] and any(item["code"] == "WORKFLOW_REFERENCE_MAPPING" for item in result["diagnostics"])


def test_missing_target_is_not_a_leaf_and_cycle_is_rejected():
    reg = registry(); snapshot = reg.snapshot(reg.environment("test", "a"))
    result = compile_definition(parent_definition(), snapshot, ReferenceSet.from_snapshot({"version": 1, "rootEnvironmentRef": "test", "targets": [], "environments": []}))
    assert not result["valid"] and any(item["code"] == "WORKFLOW_REFERENCE_UNAVAILABLE" for item in result["diagnostics"])
    child = child_definition(); child["nodes"][1] = reference_node("back", workflow_id="parent", revision=1)
    child["nodes"][1]["writes"] = {"answer": "/answer"}
    result = compile_definition(parent_definition(), snapshot, frozen(reg, [child]))
    assert not result["valid"] and any(item["code"] == "WORKFLOW_REFERENCE_CYCLE" for item in result["diagnostics"])


def test_child_budget_cannot_exceed_parent_node_budget():
    definition = parent_definition(); definition["policy"]["maxNodeExecutions"] = 4
    run = execution_with_references(definition, frozen(registry(), [child_definition()]))
    import asyncio
    with pytest.raises(ExecutionError) as error:
        asyncio.run(run.run_graph())
    assert error.value.code == "NODE_BUDGET_EXCEEDED"


def test_child_policy_can_only_be_stricter():
    definition = parent_definition(); definition["policy"]["maxNodeExecutions"] = 10
    child = child_definition(); child["policy"]["maxNodeExecutions"] = 2
    run = execution_with_references(definition, frozen(registry(), [child]))
    import asyncio
    with pytest.raises(ExecutionError) as error:
        asyncio.run(run.run_graph())
    assert error.value.code == "NODE_BUDGET_EXCEEDED"


def test_resume_validation_traverses_a_fixed_reference_path():
    from eduflow_workflow.interrupts import validate_resume
    reg = registry(); references = frozen(reg, [child_definition()])
    child = references["targets"][0]["definition"]
    child = copy.deepcopy(child)
    child["nodes"][1]["config"]["authoring"] = {"interrupt": {"title": "Confirm", "schema": obj({"answer": {"type": "number"}}), "resumeWrites": {"answer": "answer"}}}
    references = frozen(reg, [child])
    thread = {"state": {"answer": 0}, "interrupts": [{"id": "wait", "nodeId": "a", "graphPath": ["call"]}]}
    # The scoped answer field is validated against the child State schema.
    validate_resume(parent_definition(), thread, {"wait": {"answer": 42}}, reg.environment("test", "a"), ReferenceSet.from_snapshot(references))


def shared_memory_saver(monkeypatch):
    """Reuse one in-memory SDK saver across a pause and its resume."""
    import eduflow_workflow.checkpoints as checkpoints
    shared = {}
    original = checkpoints.MemoryCoordinator

    def factory(execution):
        if "saver" not in shared:
            shared["saver"] = original(execution)
        else:
            shared["saver"].execution = execution
        return shared["saver"]

    monkeypatch.setattr(checkpoints, "MemoryCoordinator", factory)
    return shared


def interrupt_child(timeout_ms):
    child = child_definition()
    child["policy"]["timeoutMs"] = timeout_ms
    child["nodes"][1]["config"]["authoring"] = {
        "interrupt": {"title": "Confirm", "schema": obj({"answer": {"type": "number"}}), "resumeWrites": {"answer": "answer"}}
    }
    return child


def slow_child(run, phase, first_ms=0, resume_ms=0):
    original = run.execute

    async def execute(node, state):
        if run.definition.get("workflowId") == "child":
            if node["id"] == "s" and phase["first"] and first_ms:
                await asyncio.sleep(first_ms / 1000)
            if node["id"] == "e" and not phase["first"] and resume_ms:
                await asyncio.sleep(resume_ms / 1000)
        return await original(node, state)

    run.execute = execute
    return run


async def pause_child(monkeypatch, timeout_ms, first_ms):
    child = interrupt_child(timeout_ms)
    references = frozen(registry(), [child])
    shared = shared_memory_saver(monkeypatch)
    phase = {"first": True}
    run = slow_child(execution_with_references(parent_definition(), references), phase, first_ms=first_ms)
    run.run["thread_id"] = str(uuid.uuid4())
    with pytest.raises(RunPaused) as waiting:
        await run.run_graph()
    return shared, run, waiting.value.interrupts[0]["id"], phase


def resumed_child(first, interrupt_id, phase, resume_ms):
    resume = slow_child(execution_with_references(parent_definition(), first.references.snapshot), phase, resume_ms=resume_ms)
    resume.run.update(run_id=str(uuid.uuid4()), thread_id=first.run["thread_id"], resume_of_run_id=first.run["run_id"], resume_values={interrupt_id: {"answer": 42}})
    return resume


def nested_tree(timeout_ms=800, node_limit=None, tool_limit=None):
    """Codex regression: parent -> middle -> [plain, leaf] with a leaf wait."""
    plain = child_definition("plain")
    leaf = interrupt_child(10000)
    leaf["workflowId"] = "leaf"
    middle = child_definition("middle", add=0)
    middle["policy"]["timeoutMs"] = timeout_ms
    if node_limit is not None:
        middle["policy"]["maxNodeExecutions"] = node_limit
    if tool_limit is not None:
        middle["policy"]["maxToolCalls"] = tool_limit
    middle["nodes"] = [
        middle["nodes"][0],
        reference_node("one", workflow_id="plain"),
        reference_node("two", workflow_id="leaf"),
        middle["nodes"][2],
    ]
    middle["nodes"][1]["writes"] = {"answer": "/answer"}
    middle["nodes"][2]["writes"] = {"answer": "/answer"}
    middle["transitions"] = [
        {"id": "so", "from": "s", "outlet": "next", "to": "one"},
        {"id": "ot", "from": "one", "outlet": "next", "to": "two"},
        {"id": "te", "from": "two", "outlet": "next", "to": "e"},
    ]
    middle["outputBindings"] = {"answer": state_binding("answer")}
    parent = parent_definition()
    parent["nodes"][1]["config"]["workflowRef"] = {"workflowId": "middle", "revision": 1}
    return plain, leaf, middle, parent


def nested_references(reg, tree):
    return frozen(reg, [tree[0], tree[1], tree[2]], root="parent")


def delayed(run, delays):
    original = run.execute

    async def execute(node, state):
        delay = delays.get((run.definition.get("workflowId"), node["id"]), 0)
        if delay:
            await asyncio.sleep(delay)
        return await original(node, state)

    run.execute = execute
    return run


async def pause_nested(monkeypatch, tree, delays=None):
    reg = registry()
    references = nested_references(reg, tree)
    shared = shared_memory_saver(monkeypatch)
    run = delayed(execution_with_references(tree[3], references, reg), delays or {})
    run.run["thread_id"] = str(uuid.uuid4())
    with pytest.raises(RunPaused) as waiting:
        await run.run_graph()
    return shared, run, references, waiting.value.interrupts


def resume_nested(first, references, responses, delays=None, reg=None):
    resume = delayed(execution_with_references(first.root_definition, references, reg), delays or {})
    resume.run.update(run_id=str(uuid.uuid4()), thread_id=first.run["thread_id"], resume_of_run_id=first.run["run_id"], resume_values=responses)
    return resume


def persisted_budgets(shared, thread_id):
    return [
        item.metadata.get(CHILD_BUDGETS_METADATA_KEY)
        for item in shared["saver"].list({"configurable": {"thread_id": thread_id}})
        if isinstance(item.metadata.get(CHILD_BUDGETS_METADATA_KEY), dict)
    ]


def middle_snapshot(budgets):
    values = [state for budget in budgets for key, state in budget.items() if ":call:middle:" in key]
    assert values
    return {field: max(state.get(field, 0) for state in values) for field in ("usedMs", "nodeExecutions", "toolCalls")}


def tool_node(node_id, digest):
    return {
        "id": node_id, "label": node_id, "type": "core.tool", "typeVersion": 2,
        "config": {"toolRef": "f", "contractDigest": digest},
        "inputs": {"value": state_binding("value")}, "writes": {"value": "/result/value"},
    }


def waiting_node():
    return {
        "id": "wait", "label": "Wait", "type": "core.transform", "typeVersion": 1,
        "config": {"operationRef": "core.identity", "operationVersion": 1, "authoring": {
            "interrupt": {"title": "Confirm", "schema": obj({"answer": {"type": "number"}}), "resumeWrites": {"answer": "answer"}}}},
        "inputs": {"value": state_binding("value")}, "writes": {},
    }


def tool_child(workflow_id, digest, before=False, after=False):
    child = child_definition(workflow_id)
    child["inputSchema"] = obj({})
    child["state"] = {
        "schema": obj({"value": {"type": "string"}, "answer": {"type": "number"}}),
        "initial": {"value": "x", "answer": 42}, "inputBindings": {}, "reducers": {},
    }
    child["outputBindings"] = {"answer": state_binding("answer")}
    nodes = [child["nodes"][0]]
    if before:
        nodes.append(tool_node("t1", digest))
    nodes.append(waiting_node())
    if after:
        nodes.append(tool_node("t2", digest))
    nodes.append(child["nodes"][2])
    child["nodes"] = nodes
    child["transitions"] = [
        {"id": f"{left['id']}-{right['id']}", "from": left["id"], "outlet": "next", "to": right["id"]}
        for left, right in zip(nodes, nodes[1:])
    ]
    return child


def parallel_tool_tree(tool):
    reg = Registry({"environments": [{"ref": "test", "ownerIds": ["a"], "tools": [tool]}]})
    digest = reg.snapshot(reg.environment("test", "a"))["tools"][0]["contractDigest"]
    leaf_a = tool_child("leaf_a", digest, before=True)
    leaf_b = tool_child("leaf_b", digest, after=True)
    middle = child_definition("middle", add=0)
    middle["policy"]["timeoutMs"] = 5000
    middle["policy"]["maxToolCalls"] = 1
    middle["state"] = {
        "schema": obj({"value": {"type": "number"}, "answer": {"type": "number"}, "a": {"type": "number"}, "b": {"type": "number"}}),
        "initial": {"value": 0, "answer": 0, "a": 0, "b": 0},
        "inputBindings": {"value": input_binding("value")}, "reducers": {},
    }
    call_a = reference_node("a", workflow_id="leaf_a"); call_a["inputs"] = {}; call_a["writes"] = {"a": "/answer"}
    call_b = reference_node("b", workflow_id="leaf_b"); call_b["inputs"] = {}; call_b["writes"] = {"b": "/answer"}
    middle["nodes"] = [
        middle["nodes"][0], call_a, call_b,
        {"id": "j", "label": "join", "type": "control.join", "typeVersion": 1, "config": {"waitFor": ["a", "b"], "strategy": "all"}, "inputs": {}, "writes": {}},
        middle["nodes"][2],
    ]
    middle["transitions"] = [
        {"id": "sa", "from": "s", "outlet": "next", "to": "a"},
        {"id": "sb", "from": "s", "outlet": "next", "to": "b"},
        {"id": "aj", "from": "a", "outlet": "next", "to": "j"},
        {"id": "bj", "from": "b", "outlet": "next", "to": "j"},
        {"id": "je", "from": "j", "outlet": "next", "to": "e"},
    ]
    middle["outputBindings"] = {"answer": state_binding("a")}
    parent = parent_definition()
    parent["nodes"][1]["config"]["workflowRef"] = {"workflowId": "middle", "revision": 1}
    return reg, (leaf_a, leaf_b, middle, parent)


def test_fixed_reference_parent_command_is_rejected_at_compile():
    reg = registry()
    parent = parent_definition()
    child = child_definition()
    parent["nodes"][1]["writes"] = {}
    child["nodes"][1]["config"]["authoring"] = {"command": {"enabled": True, "graph": "parent", "destinations": ["e"]}}
    result = compile_definition(parent, reg.snapshot(reg.environment("test", "a")), frozen(reg, [child]))
    assert not result["valid"]
    assert any(item["code"] == "WORKFLOW_REFERENCE_BOUNDARY" for item in result["diagnostics"])


async def test_fixed_reference_parent_command_is_rejected_at_runtime(monkeypatch):
    import eduflow_workflow.runtime as runtime
    reg = registry()
    run = execution_with_references(parent_definition(), frozen(reg, [child_definition()]), reg)
    target = run.references.targets[("child", 1, "test")]
    target["definition"]["nodes"][1]["config"]["authoring"] = {"command": {"enabled": True, "graph": "parent", "destinations": ["e"]}}
    target["definition"]["nodes"][1]["writes"] = {}
    fingerprint = run.run["compile_fingerprint"]
    # The frozen target was accepted by the older compiler; runtime must still
    # reject the escaping Command instead of trusting the stored fingerprint.
    monkeypatch.setattr(runtime, "compile_definition", lambda *args, **kwargs: {"valid": True, "compileFingerprint": fingerprint})
    with pytest.raises(ExecutionError) as error:
        await run.run_graph()
    assert error.value.code == "WORKFLOW_REFERENCE_BOUNDARY"


async def test_child_timeout_is_enforced_against_total_compute_time():
    child = child_definition()
    child["policy"]["timeoutMs"] = 100
    run = execution_with_references(parent_definition(), frozen(registry(), [child]))
    original = run.execute

    async def slow(node, state):
        if run.definition.get("workflowId") == "child":
            await asyncio.sleep(.12)
        return await original(node, state)

    run.execute = slow
    started = time.monotonic()
    with pytest.raises(ExecutionError) as error:
        await run.run_graph()
    assert error.value.code == "RUN_TIMEOUT"
    assert time.monotonic() - started < 1


async def test_child_budget_does_not_reset_across_interrupt_resume(monkeypatch):
    shared, first, interrupt_id, phase = await pause_child(monkeypatch, timeout_ms=100, first_ms=60)
    phase["first"] = False
    resume = resumed_child(first, interrupt_id, phase, resume_ms=50)
    with pytest.raises(ExecutionError) as error:
        await resume.run_graph()
    assert error.value.code == "RUN_TIMEOUT"
    # The paused invocation checkpoint carries the already-used budget.
    states = [item.metadata.get("eduflowChildBudget") for item in shared["saver"].list({"configurable": {"thread_id": first.run["thread_id"]}})]
    assert any(state and state.get("usedMs", 0) >= 50 for state in states)


async def test_child_budget_excludes_human_wait_on_resume(monkeypatch):
    shared, first, interrupt_id, phase = await pause_child(monkeypatch, timeout_ms=200, first_ms=60)
    await asyncio.sleep(.25)
    phase["first"] = False
    resume = resumed_child(first, interrupt_id, phase, resume_ms=60)
    assert await resume.run_graph() == {"answer": 42}


async def test_nested_resume_recovers_descendant_usage_and_times_out(monkeypatch):
    """Codex exact case: 800ms middle, 300+300ms before wait and 300ms after.

    The middle has no own superstep checkpoint while the leaf is waiting, so the
    resumed middle must recover the ancestor snapshot written by the leaf.
    """
    tree = nested_tree()
    shared, first, references, interrupts = await pause_nested(
        monkeypatch, tree, {("plain", "s"): .3, ("leaf", "s"): .3},
    )
    assert len(interrupts) == 1
    resume = resume_nested(first, references, {interrupts[0]["id"]: {"answer": 42}}, {("leaf", "e"): .3})
    assert resume.run["run_id"] != first.run["run_id"]
    with pytest.raises(ExecutionError) as error:
        await resume.run_graph()
    assert error.value.code == "RUN_TIMEOUT"
    snapshot = middle_snapshot(persisted_budgets(shared, first.run["thread_id"]))
    assert snapshot["usedMs"] >= 500, snapshot
    assert snapshot["nodeExecutions"] >= 6, snapshot


async def test_nested_resume_preserves_ancestor_node_budget(monkeypatch):
    """Leaf progress after middle's last checkpoint must count against middle."""
    tree = nested_tree(timeout_ms=5000, node_limit=9)
    shared, first, references, interrupts = await pause_nested(monkeypatch, tree)
    resume = resume_nested(first, references, {interrupts[0]["id"]: {"answer": 42}})
    with pytest.raises(ExecutionError) as error:
        await resume.run_graph()
    assert error.value.code == "NODE_BUDGET_EXCEEDED"
    snapshot = middle_snapshot(persisted_budgets(shared, first.run["thread_id"]))
    own_middle = max(
        item.metadata.get("eduflowChildBudget", {}).get("nodeExecutions", 0)
        for item in shared["saver"].list({"configurable": {"thread_id": first.run["thread_id"]}})
        if (item.metadata.get("eduflowChildScope") or {}).get("key", "").endswith(":call:middle:1:call")
    )
    assert snapshot["nodeExecutions"] > own_middle, (snapshot, own_middle)


async def test_parallel_resume_keeps_ancestor_tool_usage(monkeypatch):
    """A tool consumed by one paused branch still constrains its sibling on resume."""
    tool = {"ref": "f", "name": "f", "adapter": "function", "version": 1, "operationRef": "core.identity", "inputSchema": obj({"value": {"type": "string"}}), "outputSchema": obj({"value": {"type": "string"}}), "sideEffect": "none"}
    reg, tree = parallel_tool_tree(tool)
    references = frozen(reg, [tree[0], tree[1], tree[2]], root="parent")
    shared = shared_memory_saver(monkeypatch)
    first = execution_with_references(tree[3], references, reg)
    first.run["thread_id"] = str(uuid.uuid4())
    with pytest.raises(RunPaused) as waiting:
        await first.run_graph()
    assert len(waiting.value.interrupts) == 2
    resume = resume_nested(first, references, {item["id"]: {"answer": 42} for item in waiting.value.interrupts}, reg=reg)
    with pytest.raises(ExecutionError) as error:
        await resume.run_graph()
    assert error.value.code == "TOOL_BUDGET_EXCEEDED"
    snapshot = middle_snapshot(persisted_budgets(shared, first.run["thread_id"]))
    assert snapshot["toolCalls"] == 1, snapshot


async def test_nested_resume_excludes_human_wait_from_ancestor_time(monkeypatch):
    tree = nested_tree(timeout_ms=900)
    _, first, references, interrupts = await pause_nested(
        monkeypatch, tree, {("plain", "s"): .3, ("leaf", "s"): .3},
    )
    await asyncio.sleep(.4)
    resume = resume_nested(first, references, {interrupts[0]["id"]: {"answer": 42}}, {("leaf", "e"): .06})
    assert await resume.run_graph() == {"answer": 42}


async def test_parallel_child_invocations_do_not_share_budgets():
    definition = parent_definition()
    definition["state"] = {"schema": obj({"a": {"type": "number"}, "b": {"type": "number"}}), "initial": {"a": 0, "b": 0}, "inputBindings": {}, "reducers": {}}
    definition["nodes"] = [
        definition["nodes"][0], reference_node("call1", value=5), reference_node("call2", value=10),
        {"id": "j", "label": "join", "type": "control.join", "typeVersion": 1, "config": {"waitFor": ["call1", "call2"], "strategy": "all"}, "inputs": {}, "writes": {}},
        definition["nodes"][2],
    ]
    definition["nodes"][1]["writes"] = {"a": "/answer"}
    definition["nodes"][2]["writes"] = {"b": "/answer"}
    definition["transitions"] = [
        {"id": "s1", "from": "s", "outlet": "next", "to": "call1"},
        {"id": "s2", "from": "s", "outlet": "next", "to": "call2"},
        {"id": "1j", "from": "call1", "outlet": "next", "to": "j"},
        {"id": "2j", "from": "call2", "outlet": "next", "to": "j"},
        {"id": "je", "from": "j", "outlet": "next", "to": "e"},
    ]
    definition["outputBindings"] = {"a": state_binding("a"), "b": state_binding("b")}
    definition["outputSchema"] = obj({"a": {"type": "number"}, "b": {"type": "number"}})
    child = child_definition()
    child["policy"]["maxNodeExecutions"] = 3
    run = execution_with_references(definition, frozen(registry(), [child]))
    assert await run.run_graph() == {"a": 42, "b": 47}


async def test_sequential_child_invocations_get_fresh_budgets():
    definition = parent_definition()
    definition["state"] = {"schema": obj({"answer1": {"type": "number"}, "answer2": {"type": "number"}}), "initial": {"answer1": 0, "answer2": 0}, "inputBindings": {}, "reducers": {}}
    definition["nodes"] = [definition["nodes"][0], reference_node("call1", value=5), reference_node("call2", value=10), definition["nodes"][2]]
    definition["nodes"][1]["writes"] = {"answer1": "/answer"}
    definition["nodes"][2]["writes"] = {"answer2": "/answer"}
    definition["transitions"] = [
        {"id": "s1", "from": "s", "outlet": "next", "to": "call1"},
        {"id": "12", "from": "call1", "outlet": "next", "to": "call2"},
        {"id": "2e", "from": "call2", "outlet": "next", "to": "e"},
    ]
    definition["outputBindings"] = {"answer1": state_binding("answer1"), "answer2": state_binding("answer2")}
    definition["outputSchema"] = obj({"answer1": {"type": "number"}, "answer2": {"type": "number"}})
    child = child_definition()
    child["policy"]["maxNodeExecutions"] = 3
    run = execution_with_references(definition, frozen(registry(), [child]))
    assert await run.run_graph() == {"answer1": 42, "answer2": 47}


async def test_parent_used_count_does_not_seed_a_new_child_budget():
    parent = parent_definition()
    parent["policy"]["maxNodeExecutions"] = 20
    child = child_definition()
    child["policy"]["maxNodeExecutions"] = 3
    run = execution_with_references(parent, frozen(registry(), [child]))
    run.invocations = 5
    assert await run.run_graph() == {"answer": 42}


async def test_nested_child_consumes_ancestor_node_budget():
    reg = registry()
    leaf = child_definition("leaf")
    leaf["policy"]["maxNodeExecutions"] = 5
    middle = child_definition("middle")
    middle["policy"]["maxNodeExecutions"] = 4
    middle["nodes"] = [
        middle["nodes"][0],
        {"id": "slow", "label": "slow", "type": "core.transform", "typeVersion": 1, "config": {"operationRef": "core.identity", "operationVersion": 1}, "inputs": {"value": literal(0)}, "writes": {}},
        reference_node("leafcall", workflow_id="leaf", value=5),
        middle["nodes"][2],
    ]
    middle["nodes"][2]["writes"] = {"answer": "/answer"}
    middle["transitions"] = [
        {"id": "ss", "from": "s", "outlet": "next", "to": "slow"},
        {"id": "sl", "from": "slow", "outlet": "next", "to": "leafcall"},
        {"id": "le", "from": "leafcall", "outlet": "next", "to": "e"},
    ]
    parent = parent_definition()
    parent["nodes"][1]["config"]["workflowRef"] = {"workflowId": "middle", "revision": 1}
    run = execution_with_references(parent, frozen(reg, [leaf, middle]))
    with pytest.raises(ExecutionError) as error:
        await run.run_graph()
    assert error.value.code == "NODE_BUDGET_EXCEEDED"
    assert error.value.graph_path == ["call", "leafcall"]


async def test_child_tool_budget_is_independent_of_root_tool_count():
    tool = {"ref": "f", "name": "f", "adapter": "function", "version": 1, "operationRef": "core.identity", "inputSchema": obj({"value": {"type": "string"}}), "outputSchema": obj({"value": {"type": "string"}}), "sideEffect": "none"}
    reg = Registry({"environments": [{"ref": "test", "ownerIds": ["a"], "tools": [tool]}]})
    digest = reg.snapshot(reg.environment("test", "a"))["tools"][0]["contractDigest"]
    child = child_definition()
    child["inputSchema"] = obj({})
    child["state"] = {"schema": obj({"value": {"type": "string"}, "answer": {"type": "number"}}), "initial": {"value": "x", "answer": 0}, "inputBindings": {}, "reducers": {}}
    def tool_node(node_id):
        return {"id": node_id, "label": node_id, "type": "core.tool", "typeVersion": 2, "config": {"toolRef": "f", "contractDigest": digest}, "inputs": {"value": state_binding("value")}, "writes": {"value": "/result/value"}}
    child["nodes"] = [child["nodes"][0], tool_node("t1"), tool_node("t2"), child["nodes"][2]]
    child["transitions"] = [
        {"id": "s1", "from": "s", "outlet": "next", "to": "t1"},
        {"id": "12", "from": "t1", "outlet": "next", "to": "t2"},
        {"id": "2e", "from": "t2", "outlet": "next", "to": "e"},
    ]
    child["outputBindings"] = {"answer": state_binding("answer")}
    child["policy"]["maxToolCalls"] = 1
    parent = parent_definition()
    parent["nodes"][1]["inputs"] = {}
    run = execution_with_references(parent, frozen(reg, [child]), reg)
    with pytest.raises(ExecutionError) as error:
        await run.run_graph()
    assert error.value.code == "TOOL_BUDGET_EXCEEDED"
    assert run.tool_count == 1


def test_budget_counters_are_call_scoped_but_ancestors_stay_shared():
    parent = InvocationBudget(1000, time.monotonic() + 10, node_limit=4, tool_limit=4)
    parent.consume_node()
    parent.consume_tool()
    child = InvocationBudget(1000, time.monotonic() + 10, parent=parent, node_limit=2, tool_limit=2)
    assert child.node_executions == 0 and child.tool_calls == 0
    child.consume_node()
    child.consume_tool()
    child.consume_node()
    child.consume_tool()
    assert (parent.node_executions, parent.tool_calls) == (3, 3)
    assert child.node_exhausted() and child.tool_exhausted()
    assert not parent.node_exhausted() and not parent.tool_exhausted()
    parent.consume_node()
    parent.consume_tool()
    assert parent.node_exhausted() and parent.tool_exhausted()


async def test_embedded_parent_command_inside_fixed_target_is_preserved():
    child = child_definition()
    child["state"]["initial"]["answer"] = 42
    embedded = sample()
    embedded["nodes"][1]["config"]["authoring"] = {"command": {"enabled": True, "graph": "parent", "destinations": ["e"]}}
    child["nodes"][1] = {"id": "a", "label": "Embedded", "type": "core.subgraph", "typeVersion": 1, "config": {"graph": embedded}, "inputs": {}, "writes": {}}
    run = execution_with_references(parent_definition(), frozen(registry(), [child]))
    assert await run.run_graph() == {"answer": 42}


async def test_child_scope_uses_narrowed_time_and_model_token_policy():
    parent = parent_definition()
    parent["policy"]["maxOutputTokens"] = 4096
    child = child_definition()
    child["policy"]["timeoutMs"] = 200
    child["policy"]["maxOutputTokens"] = 512
    run = execution_with_references(parent, frozen(registry(), [child]))
    seen = {}
    original = run.execute

    async def capture(node, state):
        if run.definition.get("workflowId") == "child":
            seen["timeout"] = run.policy["timeoutMs"]
            seen["tokens"] = run.policy["maxOutputTokens"]
        return await original(node, state)

    run.execute = capture
    assert await run.run_graph() == {"answer": 42}
    assert seen == {"timeout": 200, "tokens": 512}
