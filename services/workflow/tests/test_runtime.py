"""Node/State failure tests are unit evidence, not Live model acceptance."""
import copy
import pytest
from eduflow_workflow.contracts import ExecutionError, DEFAULT_POLICY
from eduflow_workflow.registry import Registry, obj
from eduflow_workflow.runtime import RunExecution
from test_contracts import sample

class MemoryStorage:
    def __init__(self,fail_commit=False):self.events=[];self.completed=[];self.calls=[];self.fail_commit=fail_commit
    async def check(self,*args):return {"cancelled":False}
    async def call(self,name,*args):
        self.calls.append((name,args))
        if name=="emit":self.events.append((args[2],args[3]))
        if name=="step_complete":
            if self.fail_commit:raise RuntimeError("Injected database failure")
            self.completed.append(args)
        return True

def execution(definition=None,tools=None,storage=None):
    d=definition or sample()
    registry=Registry({"environments":[{"ref":"test","ownerIds":["a"],"tools":tools or []}]})
    env=registry.environment("test","a")
    from eduflow_workflow.compiler import compile_definition
    compiled=compile_definition(d,registry.snapshot(env))
    claim={"run":{"run_id":"00000000-0000-0000-0000-000000000001","owner_user_id":"a","input":{},"environment_ref":"test","environment_revision":env["revision"],"compile_fingerprint":compiled.get("compileFingerprint")},"definition":d,"token":1}
    return RunExecution(claim,registry,storage or MemoryStorage())

async def test_wrapper_state_committed_before_downstream():
    run=execution()
    assert await run.run_graph()=={"value":5}
    assert len(run.storage.completed)==3 and run.state_version==1

@pytest.mark.parametrize("binding,input_value,expected_code",[
    ({"source":"input","pointer":"/absent","onMissing":{"mode":"error"}},{},"BINDING_MISSING"),
    ({"source":"input","pointer":"/value","onMissing":{"mode":"error"}},{"value":"private-invalid-business-value"},"INVALID_NODE_INPUT"),
])
async def test_pre_step_input_failure_has_safe_definition_context_without_fabricated_step(binding,input_value,expected_code):
    run=execution();node=copy.deepcopy(run.definition["nodes"][1]);node["inputs"]["left"]=binding;run.input=input_value
    with pytest.raises(ExecutionError) as caught:await run.execute(node,{"value":0})
    dto=caught.value.dto()
    assert dto["code"]==expected_code
    assert {key:dto[key] for key in ("nodeId","invocation","stage","pointer")}=={"nodeId":"a","invocation":1,"stage":"input_resolution","pointer":"/nodes/a/inputs/left"}
    assert "private-invalid-business-value" not in str(dto) and "stepId" not in dto
    assert not run.storage.calls and not run.storage.events and not run.storage.completed and run.state_version==0

async def test_unknown_binding_schema_still_fails_safely_at_runtime_before_starting_that_step():
    definition=sample();definition["inputSchema"]=obj({"value":{}})
    definition["nodes"][1]["inputs"]["left"]={"source":"input","pointer":"/value","onMissing":{"mode":"error"}}
    run=execution(definition);run.input=run.run["input"]={"value":"private-invalid-business-value"}
    with pytest.raises(ExecutionError) as caught:await run.run_graph()
    dto=caught.value.dto();assert dto["code"]=="INVALID_NODE_INPUT" and dto["nodeId"]=="a" and dto["invocation"]==2
    assert [args[3] for name,args in run.storage.calls if name=="step_start"]==["s"]
    assert not run.storage.events and run.state_version==0

async def test_pre_step_secret_rejection_keeps_value_out_of_error_and_persistence(monkeypatch):
    run=execution();run.env["providers"]=[{"ref":"provider","secretRef":"WORKFLOW_TEST_SECRET"}]
    monkeypatch.setenv("WORKFLOW_TEST_SECRET","private-credential-unit-test")
    node=copy.deepcopy(run.definition["nodes"][1]);node["inputs"]["left"]={"source":"literal","value":"private-credential-unit-test"}
    with pytest.raises(ExecutionError) as caught:await run.execute(node,{"value":0})
    assert caught.value.dto()["code"]=="SECRET_IN_EXECUTION_DATA"
    assert caught.value.dto()["pointer"]=="/nodes/a/inputs/left"
    assert "private-credential-unit-test" not in str(caught.value.dto()) and not run.storage.calls

async def test_secret_in_error_context_is_omitted_before_error_can_be_persisted(monkeypatch):
    run=execution();run.env["providers"]=[{"ref":"provider","secretRef":"WORKFLOW_TEST_SECRET"}]
    monkeypatch.setenv("WORKFLOW_TEST_SECRET","private-credential-unit-test")
    node=copy.deepcopy(run.definition["nodes"][1]);node["id"]="private-credential-unit-test"
    node["inputs"]["left"]={"source":"input","pointer":"/missing","onMissing":{"mode":"error"}}
    with pytest.raises(ExecutionError) as caught:await run.execute(node,{"value":0})
    assert caught.value.code=="BINDING_MISSING"
    assert "private-credential-unit-test" not in str(caught.value.dto())
    assert "nodeId" not in caught.value.dto() and not run.storage.calls

@pytest.mark.parametrize("node_type",["core.tool","core.tool_dispatch"])
@pytest.mark.parametrize("adapter",["function","mcp"])
async def test_prepared_wrapper_preserves_complete_tool_input_and_sdk_result(node_type,adapter,monkeypatch):
    """Current wrapper integration, not an assertion about a real MCP transport."""
    import json
    from contextlib import asynccontextmanager
    from mcp.types import CallToolResult, TextContent
    tool={"ref":"f","name":"wrapper_tool","adapter":adapter,"version":1,"operationRef":"core.identity","inputSchema":obj({"value":{"type":"string"}}),"outputSchema":obj({"value":{"type":"string"}}),"sideEffect":"none"}
    expected={"value":"wrapper-marker"};received=[]
    if adapter=="mcp":
        tool.update(connectorRef="mcp",outputSchema=obj({"content":{"type":"array"},"isError":{"type":"boolean"}}))
        expected={"content":[{"type":"text","text":"Echo: wrapper-marker"}],"isError":False}
        class Session:
            async def call_tool(self,name,arguments):
                received.append((name,arguments))
                return CallToolResult(content=[TextContent(type="text",text="Echo: wrapper-marker")],isError=False)
        @asynccontextmanager
        async def session(connector,env):yield Session()
        monkeypatch.setattr("eduflow_workflow.tools.mcp_session",session)
    run=execution(tools=[tool]);run.env["connectors"]=[{"ref":"mcp"}]
    node=copy.deepcopy(run.definition["nodes"][1]);node.update(type=node_type,typeVersion=2 if node_type=="core.tool" else 1,writes={})
    if node_type=="core.tool":
        node.update(config={"toolRef":"f"},inputs={"value":{"source":"input","pointer":"/value","onMissing":{"mode":"error"}}})
        run.input={"value":"wrapper-marker"}
    else:
        node.update(config={"allowedToolRefs":["f"]},inputs={"toolCalls":{"source":"input","pointer":"/calls","onMissing":{"mode":"error"}}})
        run.input={"calls":[{"id":"original-call","name":"wrapper_tool","arguments":{"value":"wrapper-marker"}}]}
    result=await run.execute(node,{"value":0})
    assert result=={"values":{"value":0},"outlet":"next"} and run.state_version==0
    assert [name for name,_ in run.storage.calls]==["step_start","emit","emit","step_complete"]
    assert run.storage.calls[0][1][5]==({"value":"wrapper-marker"} if node_type=="core.tool" else {"toolCalls":run.input["calls"]})
    output=run.storage.completed[0][3]
    if node_type=="core.tool":assert output=={"result":expected}
    else:
        message=output["toolMessages"][0]
        assert message["role"]=="tool" and message["toolCallId"]=="original-call" and json.loads(message["content"][0]["text"])==expected
    assert [kind for kind,_ in run.storage.events]==["tool.started","tool.completed"]
    assert run.storage.events[1][1]["result"]==expected
    if adapter=="mcp":assert received==[("wrapper_tool",{"value":"wrapper-marker"})]

async def test_commit_failure_stops_remaining_graph():
    storage=MemoryStorage(fail_commit=True);run=execution(storage=storage)
    with pytest.raises(ExecutionError,match="persistence"):await run.run_graph()
    assert run.invocations==1 and not storage.completed

async def test_final_output_missing_is_failure():
    d=sample();d["outputBindings"]["value"]={"source":"state","pointer":"/absent","onMissing":{"mode":"default","value":None}}
    # Optional dynamically omitted state output remains a runtime schema failure.
    run=execution(d)
    run.definition["state"]["schema"]["additionalProperties"]=True
    from eduflow_workflow.compiler import compile_definition
    run.run["compile_fingerprint"]=compile_definition(run.definition,run.registry.snapshot(run.env))["compileFingerprint"]
    with pytest.raises(ExecutionError) as error:await run.run_graph()
    assert error.value.code=="INVALID_RUN_OUTPUT"

async def test_budget_enforced_before_next_execution():
    d=sample();d["policy"]["maxNodeExecutions"]=1;run=execution(d)
    with pytest.raises(ExecutionError) as error:await run.run_graph()
    assert error.value.code=="NODE_BUDGET_EXCEEDED" and len(run.storage.completed)==1

async def test_batch_validates_all_before_any_call(monkeypatch):
    tools=[{"ref":"f","name":"f","adapter":"function","version":1,"operationRef":"core.identity","inputSchema":obj({"value":{"type":"string"}}),"outputSchema":obj({"value":{"type":"string"}}),"sideEffect":"none"}]
    run=execution(tools=tools);count=0
    async def invoke(*args):
        nonlocal count;count+=1;return {"value":"ok"}
    monkeypatch.setattr("eduflow_workflow.runtime.invoke_tool",invoke)
    with pytest.raises(ExecutionError):await run.tools([{"id":"a","name":"f","arguments":{"value":"ok"}},{"id":"b","name":"f","arguments":{"value":3}}],["f"])
    assert count==0 and not run.storage.events

async def test_batch_preserves_first_success_and_skips_tail(monkeypatch):
    tools=[{"ref":"f","name":"f","adapter":"function","version":1,"operationRef":"core.identity","inputSchema":obj({"value":{"type":"string"}}),"outputSchema":obj({"value":{"type":"string"}}),"sideEffect":"write"}]
    run=execution(tools=tools);count=0
    async def invoke(tool,env,args,timeout):
        nonlocal count;count+=1
        if args["value"]=="fail":raise ExecutionError("TOOL_FAILED","fixture failure","tool",effect="unknown")
        return args
    monkeypatch.setattr("eduflow_workflow.runtime.invoke_tool",invoke)
    with pytest.raises(ExecutionError):await run.tools([{"id":"a","name":"f","arguments":{"value":"ok"}},{"id":"b","name":"f","arguments":{"value":"fail"}},{"id":"c","name":"f","arguments":{"value":"tail"}}],["f"])
    assert count==2
    kinds=[kind for kind,_ in run.storage.events]
    assert kinds==["tool.started","tool.completed","tool.started","tool.failed","tool.skipped"]

async def test_credentials_never_enter_state_or_event_storage(monkeypatch):
    run=execution();run.env["providers"]=[{"ref":"provider","secretRef":"WORKFLOW_TEST_SECRET"}]
    monkeypatch.setenv("WORKFLOW_TEST_SECRET","private-credential-unit-test")
    with pytest.raises(ExecutionError) as error:await run.event("tool.completed",{"result":{"text":"private-credential-unit-test"}})
    assert error.value.code=="SECRET_IN_EXECUTION_DATA" and not run.storage.events
    assert "private-credential-unit-test" not in str(error.value)

async def test_credential_object_keys_fail_before_trace_or_state_writes(monkeypatch):
    run=execution();run.env["providers"]=[{"ref":"provider","secretRef":"WORKFLOW_TEST_SECRET"}]
    monkeypatch.setenv("WORKFLOW_TEST_SECRET","private-credential-unit-test")
    with pytest.raises(ExecutionError) as error:await run.event("tool.completed",{"result":{"prefix-private-credential-unit-test":"not a secret"}})
    assert error.value.code=="SECRET_IN_EXECUTION_DATA" and not run.storage.events
    assert "private-credential-unit-test" not in str(error.value)

async def test_provider_sdk_constructs_and_binds_under_trusted_socks_without_network(monkeypatch):
    import socket
    tools=[{"ref":"f","name":"trusted_identity","adapter":"function","version":1,"operationRef":"core.identity","inputSchema":obj({"value":{"type":"string"}}),"outputSchema":obj({"value":{"type":"string"}}),"sideEffect":"none"}]
    run=execution(tools=tools)
    run.env["providers"]=[{"ref":"provider","secretRef":"WORKFLOW_TEST_MODEL_KEY","modelRefs":["deepseek-flash"],"baseUrl":"https://model.invalid"}]
    monkeypatch.setenv("WORKFLOW_TEST_MODEL_KEY","synthetic-offline-sdk-key")
    for variable in ("HTTP_PROXY","HTTPS_PROXY","ALL_PROXY"):
        monkeypatch.setenv(variable,"socks5://synthetic-proxy-user:synthetic-proxy-password@127.0.0.1:19876")
    monkeypatch.setenv("NO_PROXY","")
    def network_denied(*args,**kwargs): raise AssertionError("Offline SDK test must not issue network connections")
    monkeypatch.setattr(socket.socket,"connect",network_denied)
    monkeypatch.setattr(socket,"getaddrinfo",network_denied)
    adapter=run.model_adapter({"providerRef":"provider","modelRef":"deepseek-flash","modelParameters":{},"allowedToolRefs":["f"]})
    assert adapter.kwargs["tools"][0]["function"]["name"]=="trusted_identity"
    assert adapter.bound.max_retries==0
    adapter.bound.root_client.close()
    await adapter.bound.root_async_client.close()

@pytest.mark.parametrize('thinking',[{'type':'enabled'},{'type':'disabled'}])
async def test_thinking_parameter_uses_official_sdk_extra_body(monkeypatch,thinking):
    run=execution()
    run.env['providers']=[{'ref':'provider','secretRef':'WORKFLOW_TEST_MODEL_KEY','modelRefs':['deepseek-flash'],'baseUrl':'https://model.invalid'}]
    monkeypatch.setenv('WORKFLOW_TEST_MODEL_KEY','synthetic-offline-sdk-key')
    adapter=run.model_adapter({'providerRef':'provider','modelRef':'deepseek-flash','modelParameters':{'thinking':thinking},'allowedToolRefs':[]})
    assert adapter.extra_body=={'thinking':thinking} and adapter.max_retries==0
    assert adapter._get_request_payload([])['extra_body']=={'thinking':thinking}
    adapter.root_client.close();await adapter.root_async_client.close()

@pytest.mark.parametrize('thinking',[None,True,'disabled',{}, {'type':'automatic'},{'type':'disabled','other':True}])
def test_invalid_thinking_configuration_is_rejected_before_sdk(monkeypatch,thinking):
    run=execution();run.env['providers']=[{'ref':'provider','secretRef':'unused','modelRefs':['deepseek-flash']}]
    def forbidden(**kwargs):raise AssertionError('Invalid config must not initialize model')
    monkeypatch.setattr('eduflow_workflow.runtime.ChatDeepSeek',forbidden)
    with pytest.raises(ExecutionError) as error:
        run.model_adapter({'providerRef':'provider','modelRef':'deepseek-flash','modelParameters':{'thinking':thinking},'allowedToolRefs':[]})
    assert error.value.code=='UNSUPPORTED_MODEL_PARAMETER'

@pytest.mark.parametrize("failure_stage",["initialization","binding"])
async def test_model_adapter_failures_do_not_expose_provider_or_proxy_credentials(monkeypatch,failure_stage):
    from types import SimpleNamespace
    tools=[{"ref":"f","name":"trusted_identity","adapter":"function","version":1,"operationRef":"core.identity","inputSchema":obj({"value":{"type":"string"}}),"outputSchema":obj({"value":{"type":"string"}}),"sideEffect":"none"}]
    run=execution(tools=tools)
    run.env["providers"]=[{"ref":"provider","secretRef":"WORKFLOW_TEST_MODEL_KEY","modelRefs":["deepseek-flash"]}]
    monkeypatch.setenv("WORKFLOW_TEST_MODEL_KEY","synthetic-offline-sdk-key")
    def fail(*args,**kwargs): raise ImportError("synthetic-offline-sdk-key socks5://proxy-user:proxy-password@127.0.0.1:19876")
    factory=fail if failure_stage=="initialization" else lambda **kwargs:SimpleNamespace(bind_tools=fail)
    monkeypatch.setattr("eduflow_workflow.runtime.ChatDeepSeek",factory)
    with pytest.raises(ExecutionError) as error:
        run.model_adapter({"providerRef":"provider","modelRef":"deepseek-flash","modelParameters":{},"allowedToolRefs":["f"]})
    assert error.value.code=="MODEL_ADAPTER_FAILED"
    assert error.value.category=="infrastructure" and error.value.effect=="none"
    assert all(secret not in str(error.value.dto()) for secret in ("synthetic-offline-sdk-key","proxy-user","proxy-password"))
