"""Isolated node invocation. Reuses execution/authorization, never creates a formal Run."""
import asyncio
import copy
import uuid
from .contracts import ExecutionError, validate_value
from .compiler import compile_definition
from .runtime import RunExecution

class TestStorage:
    def __init__(self): self.read=None;self.result=None
    async def check(self,*args): return {}
    async def call(self,operation,*args):
        if operation=="step_start": self.read=args[5]
        if operation=="step_complete": self.result={"output":args[3],"stateAfter":args[4],"writes":args[5]}
        return None

async def test_node(body,registry):
    env=registry.environment(body["environmentRef"],body["ownerId"])
    definition=copy.deepcopy(body["definition"])
    selected=next((node for node in definition["nodes"] if node["id"]==body["nodeId"]),None)
    if not selected: raise ExecutionError("NODE_NOT_FOUND","Node does not exist")
    if selected["type"].startswith("control.") or selected["type"] in ("core.subgraph","core.memory"): raise ExecutionError("NODE_TEST_REQUIRES_RUN","Run the workflow to test control flow and subgraphs")
    if selected["type"] in ("core.start","core.end"): raise ExecutionError("NODE_TEST_UNAVAILABLE","Test a processing node")
    if selected["config"].get("authoring",{}).get("interrupt"): raise ExecutionError("NODE_TEST_REQUIRES_RUN","Run the workflow to respond to a node interrupt")
    refs=([selected["config"]["toolRef"]] if selected["type"]=="core.tool" else selected["config"].get("allowedToolRefs",[]))
    if any(tool["ref"] in refs and tool.get("sideEffect")=="write" for tool in env["tools"]) and body.get("confirmExternalEffect") is not True:
        raise ExecutionError("EXTERNAL_EFFECT_CONFIRMATION_REQUIRED","Confirm possible external changes before testing","policy")
    start={"id":"test-start-"+str(uuid.uuid4()),"label":"Test start","type":"core.start","typeVersion":1,"config":{},"inputs":{},"writes":{}}
    end={**start,"id":"test-end-"+str(uuid.uuid4()),"type":"core.end"}
    outlets=[case["id"] for case in selected["config"].get("cases",[])]+[selected["config"].get("defaultOutlet","default")] if selected["type"]=="core.router" else ["next"]
    definition.update(nodes=[start,selected,end],entryNodeId=start["id"],transitions=[{"id":"test-entry","from":start["id"],"outlet":"next","to":selected["id"]}]+[{"id":"test-out-"+str(index),"from":selected["id"],"outlet":outlet,"to":end["id"]} for index,outlet in enumerate(outlets)],outputSchema={"type":"object"},outputBindings={})
    checked=compile_definition(definition,registry.snapshot(env))
    if not checked["valid"]: raise ExecutionError("NODE_TEST_INVALID","Node configuration is invalid")
    state=copy.deepcopy(body["state"]);run_input=body["input"]
    validate_value(definition["state"]["schema"],state,"INVALID_TEST_STATE")
    validate_value(definition["inputSchema"],run_input,"INVALID_RUN_INPUT")
    storage=TestStorage()
    run={"run_id":str(uuid.uuid4()),"owner_user_id":body["ownerId"],"environment_ref":env["ref"],"environment_revision":env["revision"],"input":run_input}
    executor=RunExecution({"run":run,"definition":definition,"token":0},registry,storage)
    executor.assert_no_secrets(state);executor.assert_no_secrets(run_input)
    result=await asyncio.wait_for(executor.execute(selected,state),timeout=min(30,definition["policy"]["nodeTimeoutMs"]/1000))
    return {"mode":"node-test","input":storage.read,"output":storage.result["output"],"writes":storage.result["writes"],"stateBefore":state,"stateAfter":result["values"],"processingType":selected["type"]}
