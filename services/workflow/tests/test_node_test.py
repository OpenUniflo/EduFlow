import copy
import pytest
from eduflow_workflow.node_test import test_node as invoke_node_test
from eduflow_workflow.registry import Registry,HARD_LIMITS
from eduflow_workflow.contracts import ExecutionError,bind

@pytest.fixture
def setup_node():
    definition={"schemaVersion":"2.0","workflowId":"test","revision":1,"name":"Test","description":"","inputSchema":{"type":"object"},"outputSchema":{"type":"object"},"state":{"schema":{"type":"object","properties":{"answer":{"type":"number"}},"required":["answer"],"additionalProperties":False},"initial":{"answer":0},"inputBindings":{},"reducers":{}},"entryNodeId":"start","nodes":[{"id":"calc","label":"Add","type":"core.transform","typeVersion":1,"config":{"operationRef":"core.add","operationVersion":1},"inputs":{"left":{"source":"literal","value":2},"right":{"source":"literal","value":3}},"writes":{"answer":"/value"}}],"transitions":[],"outputBindings":{},"policy":dict(HARD_LIMITS),"requiredCapabilities":[]}
    definition["policy"].update(maxAttempts=1,maxNodeExecutions=10)
    registry=Registry({"environments":[{"ref":"test-env","name":"Test","ownerIds":["test-user"]}]})
    body={"definition":definition,"nodeId":"calc","environmentRef":"test-env","ownerId":"test-user","state":{"answer":0},"input":{}}
    return body,registry

@pytest.mark.asyncio
async def test_node_uses_real_transform_and_does_not_mutate_definition_or_input(setup_node):
    body,registry=setup_node; original=copy.deepcopy(body)
    result=await invoke_node_test(body,registry)
    assert result["output"]=={"value":5}
    assert result["writes"]=={"answer":5}
    assert result["stateBefore"]=={"answer":0} and result["stateAfter"]=={"answer":5}
    assert result["input"]=={"left":2,"right":3}
    assert body==original

@pytest.mark.asyncio
async def test_node_rejects_another_owner_and_missing_state(setup_node):
    body,registry=setup_node; body["ownerId"]="other"
    with pytest.raises(ExecutionError,match="authorized"): await invoke_node_test(body,registry)
    body["ownerId"]="test-user";body["state"]={}
    with pytest.raises(ExecutionError): await invoke_node_test(body,registry)

def test_environment_binding_keeps_values_structural_and_read_only():
    values={"TIMEOUT":0,"ENABLED":False};original=copy.deepcopy(values)
    assert bind({"time":{"source":"environment","pointer":"/TIMEOUT","onMissing":{"mode":"error"}},"enabled":{"source":"environment","pointer":"/ENABLED","onMissing":{"mode":"error"}}},{},{},values)=={"time":0,"enabled":False}
    assert values==original

@pytest.mark.asyncio
async def test_formal_run_uses_frozen_variables_after_workspace_edit(setup_node,monkeypatch):
    from eduflow_workflow.node_test import TestStorage
    from eduflow_workflow.runtime import RunExecution
    body,registry=setup_node
    env=registry.environment("test-env","test-user")
    env["variables"]={"FACTOR":99};env["configurationRevision"]=2
    monkeypatch.setattr(registry,"environment",lambda ref,owner:copy.deepcopy(env))
    node=body["definition"]["nodes"][0]
    node["inputs"]["right"]={"source":"environment","pointer":"/FACTOR","onMissing":{"mode":"error"}}
    run={"run_id":"isolated-test","owner_user_id":"test-user","environment_ref":"test-env","environment_revision":env["revision"],"input":{},"registry_snapshot":{"variables":{"FACTOR":5},"configurationRevision":1}}
    executor=RunExecution({"run":run,"definition":body["definition"],"token":0},registry,TestStorage())
    result=await executor.execute(node,{"answer":0})
    assert result["values"]=={"answer":7}
    assert env["variables"]=={"FACTOR":99}

@pytest.mark.asyncio
async def test_tool_executes_the_resolved_query_without_prose_rewriting():
    """Chinese queries are translated by a model node, never by a tool-side regex."""
    from eduflow_workflow.tools import invoke_tool
    tool={"ref":"hn_search","name":"Hacker News 搜索","adapter":"function","operationRef":"core.identity","inputSchema":{"type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":False},"outputSchema":{"type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":False},"sideEffect":"read"}
    query="大家怎么看 AI 编程助手？"
    assert await invoke_tool(tool,{"providers":[],"tools":[],"connectors":[]},{"value":query},1)=={"value":query}
