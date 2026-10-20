"""Pure preflight evidence: no network/model/tool execution or persistence."""
import copy
import pytest
from test_contracts import sample
from eduflow_workflow.registry import Registry
from eduflow_workflow.contracts import ExecutionError, validate_value
from eduflow_workflow import server

@pytest.fixture
def preflight(monkeypatch):
    monkeypatch.setattr(server,"registry",Registry({"environments":[{"ref":"test","ownerIds":["a"]}]}))
    return {"ownerId":"a","environmentRef":"test","definition":sample()}

async def test_validation_without_input_explicitly_unchecked(preflight):
    result=await server.validation(preflight)
    assert result["valid"] and result["checks"]=={"structure":True,"environment":True,"input":"unchecked"}
    assert "compileFingerprint" in result

async def test_validation_input_checks_types_and_required_field_pointer(preflight):
    preflight["definition"]["inputSchema"]={"type":"object","properties":{"outer":{"type":"object","properties":{"a/b~c":{"type":"string"}},"required":["a/b~c"]}},"required":["outer"]}
    preflight["input"]={"outer":{}}
    result=await server.validation(preflight)
    assert not result["valid"] and result["checks"]=={"structure":True,"environment":True,"input":False}
    assert result["diagnostics"][0]["scope"]=="input" and result["diagnostics"][0]["pointer"]=="/outer/a~1b~0c"
    preflight["input"]={"outer":{"a/b~c":"valid"}}
    assert (await server.validation(preflight))["checks"]["input"] is True

async def test_structure_and_environment_diagnostics_have_separate_scope(preflight):
    preflight["definition"]["transitions"].pop()
    result=await server.validation(preflight)
    assert result["checks"]=={"structure":False,"environment":False,"input":"unchecked"}
    assert all(d["scope"]=="definition" for d in result["diagnostics"])
    preflight["definition"]=sample()
    preflight["definition"]["nodes"][1].update(type="core.tool",config={"toolRef":"absent","contractDigest":"unavailable"},inputs={"arguments":{"source":"literal","value":{}}},writes={})
    preflight["input"]={}
    result=await server.validation(preflight)
    assert result["checks"]=={"structure":True,"environment":False,"input":True}
    assert {d["scope"] for d in result["diagnostics"]}=={"environment"}

async def test_preflight_rejects_cross_owner_and_mutates_nothing(preflight):
    original=copy.deepcopy(preflight)
    await server.validation(preflight)
    assert preflight==original
    preflight["ownerId"]="b"
    with pytest.raises(ExecutionError) as caught:await server.validation(preflight)
    assert caught.value.code=="ENVIRONMENT_FORBIDDEN"

async def test_model_preflight_never_constructs_sdk_or_invokes_tools(preflight,monkeypatch):
    from eduflow_workflow import runtime,tools
    def forbidden(*args,**kwargs): raise AssertionError("Preflight performed execution")
    monkeypatch.setattr(runtime,"ChatDeepSeek",forbidden)
    monkeypatch.setattr(tools,"invoke_tool",forbidden)
    monkeypatch.setenv("SYNTHETIC_PREFLIGHT_KEY","synthetic-offline-key")
    monkeypatch.setattr(server,"registry",Registry({"environments":[{"ref":"test","ownerIds":["a"],"providers":[{"ref":"p","modelRefs":["m"],"secretRef":"SYNTHETIC_PREFLIGHT_KEY"}]}]}))
    node=preflight["definition"]["nodes"][1]
    node.update(type="core.llm",config={"providerRef":"p","modelRef":"m","modelParameters":{},"allowedToolRefs":[]},inputs={"messages":{"source":"literal","value":[{"id":"q","role":"user","content":[{"type":"text","text":"hello"}]}]}},writes={})
    preflight["input"]={}
    assert (await server.validation(preflight))["valid"]

async def test_preflight_input_binding_and_budget_have_input_scope(preflight):
    preflight["definition"]["inputSchema"]={"type":"object","properties":{"optional":{"type":"number"}}}
    preflight["definition"]["state"]["inputBindings"]={"value":{"source":"input","pointer":"/optional","onMissing":{"mode":"error"}}}
    preflight["input"]={}
    result=await server.validation(preflight)
    assert result["diagnostics"][0]["scope"]=="input" and result["diagnostics"][0]["pointer"]=="/optional"
    preflight["definition"]=sample();preflight["definition"]["policy"]["maxInputBytes"]=1
    result=await server.validation(preflight)
    assert result["diagnostics"][0]["code"]=="INPUT_TOO_LARGE" and result["checks"]["input"] is False

def test_schema_pointer_points_to_type_error_and_required_property():
    with pytest.raises(ExecutionError) as caught:validate_value({"type":"object","properties":{"x":{"type":"array","items":{"type":"number"}}}},{"x":[True]})
    assert caught.value.pointer=="/x/0"

async def test_input_diagnostics_do_not_echo_failing_private_values(preflight):
    preflight["definition"]["inputSchema"]={"type":"object","properties":{"email":{"type":"number"}}}
    preflight["input"]={"email":"private-person@example.org"}
    result=await server.validation(preflight)
    assert result["diagnostics"][0]["pointer"]=="/email"
    assert "private-person@example.org" not in str(result["diagnostics"])

def test_catalog_groups_are_operator_metadata_only():
    registry=Registry({"environments":[{"ref":"test","ownerIds":["a"],"tools":[{"ref":"fault_named_but_general","name":"Fault","inputSchema":{},"group":"general"},{"ref":"plain","name":"Plain","inputSchema":{},"group":"test"},{"ref":"test_without_metadata","name":"Test tool","inputSchema":{}}]}]})
    tools=registry.public_tools(registry.environment("test","a"))
    assert [tool.get("group") for tool in tools]==["general","test",None]
