import copy
import pytest
from eduflow_workflow.compiler import compile_definition, graph_for, encode_state, decode_state
from eduflow_workflow.contracts import DEFAULT_POLICY, ExecutionError, schema_check, validate_value, resolve, predicate, semantic_hash, digest, apply_patch
from eduflow_workflow.registry import Registry, obj


def sample():
    literal=lambda v:{"source":"literal","value":v}
    return {"schemaVersion":"2.0","workflowId":"test","revision":1,"name":"sample","description":"", "inputSchema":obj({}),"outputSchema":obj({"value":{"type":"number"}}),"state":{"schema":obj({"value":{"type":"number"}}),"initial":{"value":0},"inputBindings":{},"reducers":{}},"entryNodeId":"s","nodes":[{"id":"s","label":"Start","type":"core.start","typeVersion":1,"config":{},"inputs":{},"writes":{}},{"id":"a","label":"Add","type":"core.transform","typeVersion":1,"config":{"operationRef":"core.add","operationVersion":1},"inputs":{"left":literal(2),"right":literal(3)},"writes":{"value":"/value"}},{"id":"e","label":"End","type":"core.end","typeVersion":1,"config":{},"inputs":{},"writes":{}}],"transitions":[{"id":"sa","from":"s","outlet":"next","to":"a"},{"id":"ae","from":"a","outlet":"next","to":"e"}],"outputBindings":{"value":{"source":"state","pointer":"/value","onMissing":{"mode":"error"}}},"policy":dict(DEFAULT_POLICY),"requiredCapabilities":["serial"]}

def registry():
    reg=Registry({"environments":[{"ref":"test","ownerIds":["a","b"]}]})
    return reg.snapshot(reg.environment("test","a"))

def test_valid_compile():
    assert compile_definition(sample(),registry())["valid"]

@pytest.mark.parametrize("source_schema,expected_valid",[
    ({"type":"string"},False),
    ({"type":"object"},False),
    ({"type":["string","null"]},False),
    ({"type":"integer"},True),
    ({"type":["number","null"]},True),
    ({},True),
    ({"$ref":"#/$defs/Value"},True),
])
def test_dynamic_binding_rejects_only_proven_disjoint_declared_root_types(source_schema,expected_valid):
    definition=sample()
    definition["inputSchema"]=obj({"value":source_schema})
    definition["inputSchema"]["$defs"]={"Value":{"type":"number"}}
    definition["nodes"][1]["inputs"]["left"]={"source":"input","pointer":"/value","onMissing":{"mode":"error"}}
    result=compile_definition(definition,registry())
    assert result["valid"] is expected_valid
    if not expected_valid:
        diagnostic=next(d for d in result["diagnostics"] if d["code"]=="BINDING_TYPE_MISMATCH")
        assert diagnostic["nodeId"]=="a" and diagnostic["pointer"]=="/nodes/a/inputs/left"

def test_generic_tool_arguments_require_an_object_binding_without_inventing_object_assembly():
    from eduflow_workflow.compiler import validate_structure
    from eduflow_workflow.registry import NODE_DESCRIPTORS, OPERATIONS
    definition=sample();definition["inputSchema"]=obj({"orderId":{"type":"string"}})
    node=definition["nodes"][1]
    node.update(type="core.tool",config={"toolRef":"trusted","contractDigest":"contract"},inputs={"arguments":{"source":"input","pointer":"/orderId","onMissing":{"mode":"error"}}},writes={})
    result=validate_structure(definition,NODE_DESCRIPTORS,OPERATIONS)
    assert any(d["code"]=="BINDING_TYPE_MISMATCH" and d["pointer"]=="/nodes/a/inputs/arguments" for d in result["diagnostics"])
    node["inputs"]["arguments"]["pointer"]=""
    assert validate_structure(definition,NODE_DESCRIPTORS,OPERATIONS)["valid"]

def test_binding_default_with_compatible_root_type_remains_a_runtime_decision():
    definition=sample();definition["inputSchema"]=obj({"value":{"type":"string"}},[])
    definition["nodes"][1]["inputs"]["left"]={"source":"input","pointer":"/value","onMissing":{"mode":"default","value":2}}
    assert compile_definition(definition,registry())["valid"]

def test_boolean_schema_and_unknown_union_paths_are_not_guessed_by_binding_type_check():
    definition=sample();definition["inputSchema"]=obj({"value":True})
    definition["nodes"][1]["inputs"]["left"]={"source":"input","pointer":"/value","onMissing":{"mode":"error"}}
    assert compile_definition(definition,registry())["valid"]

def test_state_binding_type_diagnostic_uses_escaped_definition_identity():
    definition=sample();definition["state"]["schema"]["properties"]["text"]={"type":"string"}
    definition["nodes"][1]["id"]="a/b~c"
    definition["transitions"][0]["to"]="a/b~c";definition["transitions"][1]["from"]="a/b~c"
    definition["nodes"][1]["inputs"]["left"]={"source":"state","pointer":"/text","onMissing":{"mode":"error"}}
    result=compile_definition(definition,registry())
    assert any(d["code"]=="BINDING_TYPE_MISMATCH" and d["nodeId"]=="a/b~c" and d["pointer"]=="/nodes/a~1b~0c/inputs/left" for d in result["diagnostics"])

def test_authorized_tool_literal_arguments_use_its_jsonschema_contract():
    definition=sample();definition["nodes"][1].update(type="core.tool",config={"toolRef":"trusted","contractDigest":"contract"},inputs={"arguments":{"source":"literal","value":{"orderId":7}}},writes={})
    snapshot=registry();snapshot["tools"]=[{"ref":"trusted","contractDigest":"contract","available":True,"inputSchema":obj({"orderId":{"type":"string"}})}]
    result=compile_definition(definition,snapshot)
    assert any(d["code"]=="INVALID_NODE_INPUT" and d["nodeId"]=="a" and d["pointer"].startswith("/nodes/a/inputs/arguments") for d in result["diagnostics"])
    definition["nodes"][1]["inputs"]["arguments"]["value"]={"orderId":"A1001"}
    assert compile_definition(definition,snapshot)["valid"]

@pytest.mark.parametrize("mutate,code",[
 (lambda d:d["nodes"][1].update(type="core.unknown"),"UNKNOWN_NODE_TYPE"),
 (lambda d:d["transitions"].pop(),"INVALID_OUTLETS"),
 (lambda d:d["transitions"][0].update(to="missing"),"DANGLING_TRANSITION"),
 (lambda d:d["nodes"][1]["inputs"].update(extra={"source":"literal","value":1}),"INVALID_NODE_INPUT_BINDINGS"),
 (lambda d:d["nodes"][1]["inputs"].update(left={"source":"state","pointer":"/missing","onMissing":{"mode":"error"}}),"UNKNOWN_BINDING_FIELD"),
 (lambda d:d["nodes"][1]["writes"].update(missing="/value"),"INVALID_STATE_WRITE"),
 (lambda d:d["policy"].update(maxAttempts=2),"INVALID_POLICY"),
 (lambda d:d["policy"].update(maxCost={"amount":"1","currency":"USD"}),"UNSUPPORTED_CAPABILITY"),
 (lambda d:d["requiredCapabilities"].append("unknown-future-capability"),"UNSUPPORTED_CAPABILITY"),
 (lambda d:d["inputSchema"].update(pattern="a"),"UNSUPPORTED_SCHEMA"),
 (lambda d:d.update(schemaVersion="3.0"),"UNKNOWN_DEFINITION_VERSION"),
 (lambda d:d["nodes"].append(copy.deepcopy(d["nodes"][0])),"DUPLICATE_ID"),
])
def test_diagnostics(mutate,code):
    d=sample();mutate(d)
    r=compile_definition(d,registry())
    assert not r["valid"]
    assert code in {diag["code"] for diag in r["diagnostics"]}

def test_hash_presentation_and_order():
    d=sample();other=copy.deepcopy(d)
    other.update(name="changed",description="changed",workflowId="other",revision=2)
    other["nodes"].reverse();other["transitions"].reverse()
    other["nodes"][0]["label"]="changed"
    assert semantic_hash(d)==semantic_hash(other)
    other["nodes"][1]["config"]["operationRef"]="core.identity"
    assert semantic_hash(d)!=semantic_hash(other)

@pytest.mark.parametrize("schema,value",[({"type":["string","null"]},None),({"type":"number"},1),({"type":"object","properties":{"n":{"$ref":"#/$defs/N"}},"$defs":{"N":{"type":"number"}}},{"n":2}),({"type":"object","minProperties":1},{"a":1})])
def test_schema_supported(schema,value):
    schema_check(schema);validate_value(schema,value)

@pytest.mark.parametrize("schema",[{"format":"email"},{"pattern":"x"},{"$ref":"https://example.org/schema"},{"$defs":{"A":{"$ref":"#/$defs/A"}},"$ref":"#/$defs/A"}])
def test_schema_unsupported(schema):
    with pytest.raises(ExecutionError):schema_check(schema)

def test_bind_missing_null_default():
    assert resolve({"source":"state","pointer":"/null","onMissing":{"mode":"default","value":1}},{},{"null":None}) is None
    assert resolve({"source":"state","pointer":"/absent","onMissing":{"mode":"default","value":1}},{},{})==1
    with pytest.raises(ExecutionError):resolve({"source":"state","pointer":"/absent","onMissing":{"mode":"error"}},{},{})

def test_predicates():
    assert predicate({"op":"exists","source":"state","pointer":"/x"},{},{"x":None})
    assert not predicate({"op":"nonEmpty","source":"state","pointer":"/x"},{},{"x":[]})
    assert predicate({"op":"nonEmpty","source":"state","pointer":"/x"},{},{"x":[1]})
    with pytest.raises(ExecutionError):predicate({"op":"nonEmpty","source":"state","pointer":"/x"},{},{"x":1})
    with pytest.raises(ExecutionError):predicate({"op":"eq","left":{"source":"literal","value":True},"right":{"source":"literal","value":1}},{},{})

@pytest.mark.parametrize("value",[float('nan'),float('inf'),9007199254740992])
def test_numbers_interoperable(value):
    with pytest.raises(ExecutionError):digest(value)

def test_messages_reducer_uses_sdk_identity():
    d=sample();d["state"]["schema"]=obj({"messages":{"type":"array"}});d["state"]["reducers"]={"messages":{"name":"messages","version":1}}
    old={"id":"a","role":"user","content":[{"type":"text","text":"old"}]};new={**old,"content":[{"type":"text","text":"new"}]}
    state=apply_patch({"messages":[old]},{"messages":[new]},d)
    assert len(state["messages"])==1 and state["messages"][0]["content"][0]["text"]=="new"

async def test_real_langgraph_routes_from_edges():
    d=sample();path=[]
    async def execute(node,state):
        path.append(node["id"])
        return {"values":{**state,"value":5} if node["id"]=="a" else state,"outlet":"next"}
    result=await graph_for(d,execute,"unit-"+semantic_hash(d)).ainvoke(encode_state(d,{"value":0}))
    assert path==["s","a","e"] and decode_state(d,result)["value"]==5
    d["transitions"]=[{"id":"se","from":"s","outlet":"next","to":"e"},{"id":"ae","from":"a","outlet":"next","to":"e"}];path.clear()
    await graph_for(d,execute,"unit-"+semantic_hash(d)).ainvoke(encode_state(d,{"value":0}))
    assert path==["s","e"]


def test_semantic_collections_use_utf16_order():
    d=sample()
    d["nodes"][0]["id"]="\U0001f600"
    d["nodes"][1]["id"]="\ue000"
    canonical_input={key:value for key,value in d.items() if key not in ("workflowId","revision","name","description")}
    canonical_input["nodes"]=sorted([{key:value for key,value in node.items() if key!="label"} for node in d["nodes"]],key=lambda node:node["id"].encode("utf-16-be"))
    canonical_input["transitions"]=sorted(d["transitions"],key=lambda edge:edge["id"].encode("utf-16-be"))
    assert semantic_hash(d)==digest(canonical_input)
    with pytest.raises(ExecutionError):digest("\ud800")

def test_document_structure_does_not_claim_environment_readiness():
    from eduflow_workflow.compiler import validate_structure
    from eduflow_workflow.registry import NODE_DESCRIPTORS, OPERATIONS
    definition=sample()
    definition["nodes"][1].update(type="core.tool",config={"toolRef":"registered-reference","contractDigest":"frozen-contract"},inputs={"arguments":{"source":"literal","value":{"value":1}}},writes={"value":"/result/value"})
    structure=validate_structure(definition,NODE_DESCRIPTORS,OPERATIONS)
    assert structure["valid"] and not structure["diagnostics"]
    assert "compileFingerprint" not in structure
    unavailable=compile_definition(definition,registry())
    assert not unavailable["valid"]
    assert {d["code"] for d in unavailable["diagnostics"]}=={"TOOL_UNAVAILABLE"}
    environment=registry()
    environment["tools"]=[{"ref":"registered-reference","name":"trusted","contractDigest":"frozen-contract","available":True}]
    assert compile_definition(definition,environment)["valid"]
    environment["tools"][0]["contractDigest"]="changed-contract"
    changed=compile_definition(definition,environment)
    assert not changed["valid"] and "TOOL_CONTRACT_CHANGED" in {d["code"] for d in changed["diagnostics"]}


def test_structure_still_reports_broken_tool_configuration():
    from eduflow_workflow.compiler import validate_structure
    from eduflow_workflow.registry import NODE_DESCRIPTORS, OPERATIONS
    definition=sample()
    definition["nodes"][1].update(type="core.tool",config={},inputs={"arguments":{"source":"literal","value":{}}})
    result=validate_structure(definition,NODE_DESCRIPTORS,OPERATIONS)
    assert not result["valid"]
    assert any(d.get("nodeId")=="a" and d["code"]=="SCHEMA_VALIDATION_FAILED" for d in result["diagnostics"])

@pytest.mark.parametrize("schema_type",["array","string",["object","null"]])
def test_state_requires_explicit_top_level_object(schema_type):
    definition=sample();definition["state"]["schema"]["type"]=schema_type
    result=compile_definition(definition,registry())
    assert not result["valid"]
    assert any(d["code"]=="INVALID_SCHEMA" and d.get("pointer")=="/state/schema" for d in result["diagnostics"])

@pytest.mark.parametrize("mutate,code",[
 (lambda d:d.update(revision=True),"INVALID_DEFINITION"),
 (lambda d:d["nodes"][0].update(typeVersion=True),"INVALID_NODE"),
 (lambda d:d["state"]["reducers"].update(value={"name":"replace","version":True}),"INVALID_REDUCER"),
])
def test_boolean_is_not_integer_identity_or_reducer_version(mutate,code):
    definition=sample();mutate(definition)
    result=compile_definition(definition,registry())
    assert not result["valid"] and code in {d["code"] for d in result["diagnostics"]}


def test_minimal_migration_structure_end_outlets_and_transition_identity():
    from eduflow_workflow.compiler import validate_structure
    from eduflow_workflow.registry import NODE_DESCRIPTORS, OPERATIONS
    definition=sample();definition["nodes"]= [definition["nodes"][0],definition["nodes"][2]]
    definition["transitions"]=[{"id":"se","from":"s","outlet":"next","to":"e"}]
    definition["outputBindings"]={};definition["outputSchema"]={"type":"object"}
    assert validate_structure(definition,NODE_DESCRIPTORS,OPERATIONS)["valid"]
    definition["transitions"].append({"id":"ee","from":"e","outlet":"next","to":"e"})
    result=validate_structure(definition,NODE_DESCRIPTORS,OPERATIONS)
    assert not result["valid"] and any(d["code"]=="INVALID_OUTLETS" for d in result["diagnostics"])
    definition["transitions"]=[{"from":"s","outlet":"next","to":"e"}]
    result=validate_structure(definition,NODE_DESCRIPTORS,OPERATIONS)
    assert not result["valid"] and result["diagnostics"][0]["code"]=="DUPLICATE_ID"
    definition["transitions"]=[{"id":"same","from":"s","outlet":"next","to":"e"},{"id":"same","from":"s","outlet":"next","to":"e"}]
    assert not validate_structure(definition,NODE_DESCRIPTORS,OPERATIONS)["valid"]

def test_router_priority_rejects_boolean_integer_alias():
    definition=sample()
    definition["nodes"][1].update(type="core.router",config={"cases":[{"id":"yes","priority":True,"predicate":{"op":"eq","left":{"source":"literal","value":1},"right":{"source":"literal","value":1}}}],"defaultOutlet":"no"},inputs={},writes={})
    definition["transitions"]=[{"id":"sr","from":"s","outlet":"next","to":"a"},{"id":"yes","from":"a","outlet":"yes","to":"e"},{"id":"no","from":"a","outlet":"no","to":"e"}]
    result=compile_definition(definition,registry())
    assert not result["valid"] and "INVALID_ROUTER" in {d["code"] for d in result["diagnostics"]}

async def test_cached_plan_rebinds_two_owners_input_callbacks_and_state():
    from eduflow_workflow.compiler import _graph_plan,cache_info
    from dataclasses import FrozenInstanceError
    _graph_plan.cache_clear()
    definition=sample();definition["state"]["schema"]["properties"]["owner"]={"type":"string"}
    fingerprint=compile_definition(definition,registry())["compileFingerprint"]
    paths={"owner-a":[],"owner-b":[]}
    def owner_execute(owner):
        async def execute(node,state):
            paths[owner].append(node["id"])
            return {"values":{"owner":owner,"value":state["value"]+1} if node["type"]=="core.transform" else state,"outlet":"next"}
        return execute
    first=graph_for(definition,owner_execute("owner-a"),fingerprint)
    second_definition=copy.deepcopy(definition);second_definition.update(workflowId="another-private-workflow",name="Different label")
    second=graph_for(second_definition,owner_execute("owner-b"),fingerprint)
    assert cache_info()["misses"]==1 and cache_info()["hits"]==1
    result_a=await first.ainvoke(encode_state(definition,{"value":2}))
    result_b=await second.ainvoke(encode_state(second_definition,{"value":20}))
    assert decode_state(definition,result_a)=={"owner":"owner-a","value":3}
    assert decode_state(second_definition,result_b)=={"owner":"owner-b","value":21}
    assert paths=={"owner-a":["s","a","e"],"owner-b":["s","a","e"]}
    plan=_graph_plan(fingerprint,"s",(("a","core.transform"),("e","core.end"),("s","core.start")),(("ae","a","next","e"),("sa","s","next","a")))
    with pytest.raises(FrozenInstanceError):plan.entry_node_id="other"
    assert set(cache_info())=={"hits","misses","maxsize","currsize"}
    assert "owner" not in repr(plan) and not any(callable(value) for value in plan.__dict__.values())

async def test_cache_identity_includes_registry_and_sdk_fingerprint(monkeypatch):
    import eduflow_workflow.compiler as compiler
    compiler._graph_plan.cache_clear()
    definition=sample();snapshot=registry()
    initial=compiler.compile_definition(definition,snapshot)["compileFingerprint"]
    async def execute(node,state):return {"values":state,"outlet":"next"}
    compiler.graph_for(definition,execute,initial)
    upgraded_registry={**snapshot,"digest":"new-registry-contract-digest"}
    registry_fp=compiler.compile_definition(definition,upgraded_registry)["compileFingerprint"]
    compiler.graph_for(definition,execute,registry_fp)
    monkeypatch.setattr(compiler,"DEPENDENCY_MANIFEST",{**compiler.DEPENDENCY_MANIFEST,"packages":{**compiler.DEPENDENCY_MANIFEST["packages"],"langgraph":"future-sdk-version"}})
    sdk_fp=compiler.compile_definition(definition,snapshot)["compileFingerprint"]
    compiler.graph_for(definition,execute,sdk_fp)
    assert len({initial,registry_fp,sdk_fp})==3
    assert compiler.cache_info()["hits"]==0 and compiler.cache_info()["misses"]==3
    # Even a caller supplying the same fingerprint cannot substitute a new topology.
    changed=copy.deepcopy(definition);changed["transitions"][0]["to"]="e"
    compiler.graph_for(changed,execute,initial)
    assert compiler.cache_info()["misses"]==4

async def test_cache_is_bounded_and_compiler_has_no_filesystem_side_effect(monkeypatch,tmp_path):
    from eduflow_workflow.compiler import _graph_plan,cache_info
    import eduflow_workflow.compiler as compiler
    _graph_plan.cache_clear();definition=sample()
    monkeypatch.setenv("WORKFLOW_CACHE_INFO_FILE",str(tmp_path/"unexpected-side-effect.json"))
    async def execute(node,state):return {"values":state,"outlet":"next"}
    for index in range(65):compiler.graph_for(definition,execute,"fingerprint-"+str(index))
    assert cache_info()["maxsize"]==64 and cache_info()["currsize"]==64
    assert not (tmp_path/"unexpected-side-effect.json").exists()

@pytest.mark.parametrize("domain_id",["__start__","__end__","ordinary:id","ordinary|id","values","outlet"])
@pytest.mark.parametrize("node_role",["entry","work","router","end"])
async def test_sdk_name_projection_preserves_domain_ids_and_router_targets(domain_id,node_role):
    definition=sample()
    router={"id":"r","label":"Route","type":"core.router","typeVersion":1,"config":{"cases":[{"id":"chosen:case","priority":0,"predicate":{"op":"eq","left":{"source":"literal","value":1},"right":{"source":"literal","value":1}}}],"defaultOutlet":"fallback|case"},"inputs":{},"writes":{}}
    definition["nodes"].insert(1,router)
    definition["transitions"]=[{"id":"sr","from":"s","outlet":"next","to":"r"},{"id":"ra","from":"r","outlet":"chosen:case","to":"a"},{"id":"re","from":"r","outlet":"fallback|case","to":"e"},{"id":"ae","from":"a","outlet":"next","to":"e"}]
    original={"entry":"s","work":"a","router":"r","end":"e"}[node_role]
    for node in definition["nodes"]:
        if node["id"]==original:node["id"]=domain_id
    if definition["entryNodeId"]==original:definition["entryNodeId"]=domain_id
    for edge in definition["transitions"]:
        if edge["from"]==original:edge["from"]=domain_id
        if edge["to"]==original:edge["to"]=domain_id
    original_document=copy.deepcopy(definition)
    compiled=compile_definition(definition,registry())
    assert compiled["valid"],compiled["diagnostics"]
    observed=[]
    async def execute(node,state):
        observed.append(node["id"])
        return {"values":state,"outlet":"chosen:case" if node["type"]=="core.router" else "next"}
    graph=graph_for(definition,execute,compiled["compileFingerprint"])
    await graph.ainvoke(encode_state(definition,{"value":0}))
    assert observed==[domain_id if node_id==original else node_id for node_id in ("s","r","a","e")]
    assert definition==original_document
    # The default Router path uses the same SDK target projection.
    observed.clear()
    async def fallback_execute(node,state):
        observed.append(node["id"])
        return {"values":state,"outlet":"fallback|case" if node["type"]=="core.router" else "next"}
    await graph_for(definition,fallback_execute,compiled["compileFingerprint"]).ainvoke(encode_state(definition,{"value":0}))
    assert observed==[domain_id if node_id==original else node_id for node_id in ("s","r","e")]
