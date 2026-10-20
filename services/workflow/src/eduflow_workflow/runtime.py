"""One execution context per run; LangGraph alone schedules actual graph transitions."""
import asyncio
import copy
import json
import os
import time
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, replace
from langchain_deepseek import ChatDeepSeek
from langgraph.errors import GraphInterrupt
from .compiler import compile_definition, graph_for, NodeResult, encode_state, decode_state, SDK_EXECUTION, SDK_MESSAGES, SDK_SCOPE
from .contracts import ExecutionError, bind, validate_value, canonical, pointer, apply_patch, predicate, reduce_field
from .messages import from_langchain, to_langchain
from .registry import OPERATIONS
from .tools import invoke_tool, secret

@dataclass(frozen=True)
class InvocationContext:
    """Task-local identity; never inherit the previous node's mutable context."""
    node_id: str
    invocation: int
    state_version: int
    step_id: str | None = None
    sdk_execution: dict | None = None


class RunExecution:
    def __init__(self,claim,registry,storage):
        self.run=claim["run"]; self.root_definition=claim["definition"]; self.token=claim["token"]
        self.registry,self.storage=registry,storage
        self.thread=claim.get("thread",{})
        self.root_input=self.run["input"]; self.state_version=self.thread.get("state_version",0); self.invocations=self.thread.get("node_executions",0); self.tool_count=self.thread.get("tool_calls",0)
        self.deadline=time.monotonic()+max(0,self.definition["policy"]["timeoutMs"]-self.thread.get("compute_ms",0))/1000
        self.messages_private={}
        self._invocation = ContextVar("workflow_invocation", default=None)
        self._commit_lock = asyncio.Lock()
        self.coordinated = False
        self._prepared = {}
        self._p4_attempts = {}
        self._static_waits = {}
        self._stream_attempts = {}
        self.env=registry.environment(self.run["environment_ref"],self.run["owner_user_id"])
        snapshot=self.run.get("registry_snapshot",{})
        self.env["variables"]=copy.deepcopy(snapshot.get("variables",self.env.get("variables",{})))
        self.env["configurationRevision"]=snapshot.get("configurationRevision",self.env.get("configurationRevision",0))
    @property
    def definition(self):
        scope=SDK_SCOPE.get()
        return scope['definition'] if scope else self.root_definition
    @definition.setter
    def definition(self,value): self.root_definition=value
    @property
    def input(self):
        scope=SDK_SCOPE.get()
        return scope['input'] if scope else self.root_input
    @input.setter
    def input(self,value): self.root_input=value
    @property
    def step_id(self):
        context = self._invocation.get()
        return context.step_id if context else None

    @property
    def node_id(self):
        context = self._invocation.get()
        return context.node_id if context else None

    def assert_no_secrets(self,value):
        from .credentials import assert_no_secrets
        assert_no_secrets(value,self.env)
    async def guard(self):
        from .server import refresh
        refresh()
        if time.monotonic()>=self.deadline: raise ExecutionError("RUN_TIMEOUT","Run exceeded deadline","timeout",effect="unknown")
        await self.storage.check(self.run["run_id"],self.token)
        # Reload trusted config so secret/environment revocation dominates frozen snapshots.
        current=self.registry.environment(self.env["ref"],self.run["owner_user_id"])
        if current["revision"]!=self.run["environment_revision"]: raise ExecutionError("ENVIRONMENT_CHANGED","Environment or tool authorization changed","auth")
        from .compiler import _function_versions
        _function_versions(self.root_definition,self.registry.snapshot(current))
        for provider in current["providers"]:
            if provider.get("secretRef") and not (provider["secretRef"].startswith("vault:") or os.environ.get(provider["secretRef"])): raise ExecutionError("SECRET_REVOKED","Provider secret unavailable","auth")
    async def event(self,kind,payload):
        context=self._invocation.get()
        if kind=='node.attempt.started':self._stream_attempts[self.step_id]=payload['attempt']
        if context and context.sdk_execution:
            payload={**payload,"execution":context.sdk_execution}
        self.assert_no_secrets(payload)
        if len(canonical(payload))>self.definition["policy"]["maxEventBytes"]: raise ExecutionError("EVENT_TOO_LARGE","Event exceeds size budget","policy")
        await self.storage.call("emit",self.run["run_id"],self.token,kind,payload,self.step_id,self.node_id)
    async def tools(self,calls,refs):
        catalog={tool["ref"]:tool for tool in self.env["tools"] if tool["ref"] in refs}
        names={tool["name"]:tool for tool in catalog.values()}
        ids=[call["id"] for call in calls]
        if len(ids)!=len(set(ids)): raise ExecutionError("DUPLICATE_TOOL_CALL","Tool call IDs must be unique")
        selected=[]
        # Validate the complete batch before any side effect.
        for call in calls:
            tool=names.get(call["name"])
            if not tool or not tool["available"]: raise ExecutionError("TOOL_FORBIDDEN","Tool is not authorized","auth")
            self.assert_no_secrets(call["arguments"])
            validate_value(tool["inputSchema"],call["arguments"],"INVALID_TOOL_ARGUMENTS"); selected.append(tool)
        messages=[]
        for index,(call,tool) in enumerate(zip(calls,selected)):
            call_id=str(uuid.uuid4())
            try:
                await self.guard()
                if self.tool_count>=self.definition["policy"]["maxToolCalls"]: raise ExecutionError("TOOL_BUDGET_EXCEEDED","Tool call budget exhausted","policy")
                self.tool_count+=1
                await self.event("tool.started",{"callId":call_id,"toolCallId":call["id"],"toolRef":tool["ref"],"contractDigest":tool["contractDigest"]})
                await self.guard()
                result=await asyncio.wait_for(invoke_tool(tool,self.env,call["arguments"],self.remaining()),timeout=self.remaining())
                await self.event("tool.completed",{"callId":call_id,"toolCallId":call["id"],"result":result,"effect":"confirmed" if tool["sideEffect"]=="write" else "none"})
                messages.append({"id":str(uuid.uuid4()),"role":"tool","content":[{"type":"text","text":json.dumps(result,ensure_ascii=False)}],"toolCallId":call["id"]})
            except Exception as error:
                error=error if isinstance(error,ExecutionError) else ExecutionError("TOOL_TIMEOUT","Tool call interrupted","timeout",effect="unknown")
                await self.event("tool.failed",{"callId":call_id,"toolCallId":call["id"],"error":error.dto()})
                for pending in calls[index+1:]: await self.event("tool.skipped",{"toolCallId":pending["id"],"reason":"previous_tool_failed"})
                raise error
        return messages
    def remaining(self): return max(.001,min(self.deadline-time.monotonic(),self.definition["policy"]["nodeTimeoutMs"]/1000))
    def model_adapter(self,config):
        """Initialize the mature provider SDK; never expose raw proxy/SDK exceptions."""
        providers=[p for p in self.env["providers"] if p["ref"]==config["providerRef"] and config["modelRef"] in p["modelRefs"]]
        if not providers: raise ExecutionError("MODEL_FORBIDDEN","Model is not authorized","auth")
        provider=providers[0]
        allowed_parameters={"temperature","top_p","frequency_penalty","presence_penalty","thinking"}
        if set(config["modelParameters"])-allowed_parameters: raise ExecutionError("UNSUPPORTED_MODEL_PARAMETER","Unsupported model parameter")
        parameters=dict(config["modelParameters"])
        thinking=parameters.pop("thinking",None)
        if "thinking" in config["modelParameters"] and (not isinstance(thinking,dict) or set(thinking)!={"type"} or thinking["type"] not in ("enabled","disabled")):
            raise ExecutionError("UNSUPPORTED_MODEL_PARAMETER","Thinking must explicitly select enabled or disabled")
        try:
            model=ChatDeepSeek(model=config["modelRef"],api_key=secret(provider["secretRef"]),api_base=provider.get("baseUrl","https://api.deepseek.com"),max_tokens=self.definition["policy"]["maxOutputTokens"],timeout=self.remaining(),max_retries=0,**({"extra_body":{"thinking":thinking}} if thinking is not None else {}),**parameters)
            refs=config["allowedToolRefs"]
            if refs:
                functions=[{"type":"function","function":{"name":t["name"],"description":t.get("description",""),"parameters":t["inputSchema"]}} for t in self.env["tools"] if t["ref"] in refs and t["available"]]
                model=model.bind_tools(functions)
            return model
        except ExecutionError: raise
        except Exception:
            raise ExecutionError("MODEL_ADAPTER_FAILED","Model adapter initialization or tool binding failed","infrastructure",effect="none") from None
    async def llm(self,node,resolved):
        model=self.model_adapter(node["config"])
        from langchain_core.messages import messages_from_dict
        persisted={key:messages_from_dict([value])[0] for key,value in SDK_MESSAGES.get().items()}
        messages=[self.messages_private.get(m['id'],persisted.get(m['id'],to_langchain(m))) for m in resolved['messages']]
        try:
            from .session_memory_history import stream_model
            response=await stream_model(self,model,messages)
        except ExecutionError:raise
        except Exception as error:
            status=getattr(error,"status_code",None)
            category="auth" if status in (401,403) else "rate_limit" if status==429 else "timeout" if isinstance(error,asyncio.TimeoutError) else "provider"
            raise ExecutionError("MODEL_REQUEST_FAILED","Model request failed","provider" if category=="provider" else category,external_status=status) from None
        if response.invalid_tool_calls: raise ExecutionError("INVALID_MODEL_TOOL_CALL","Provider returned an invalid structured tool call","provider")
        message=from_langchain(response); self.messages_private[message["id"]]=response
        usage=response.usage_metadata or {}
        return {"messages":[message],"toolCalls":message.get("toolCalls",[])},{"inputTokens":usage.get("input_tokens"),"outputTokens":usage.get("output_tokens")}
    async def execute(self,node,state):
        # Bind the version before the first await: guard can yield while another
        # invocation commits. The supplied state must not acquire that new version.
        if self.coordinated and hasattr(self.storage,'url'):
            identity=SDK_EXECUTION.get()
            receipt=await self.storage.call('receipt',self.run['run_id'],self.token,identity['taskId'])
            if receipt:
                if receipt['node_id']!=node['id'] or receipt['checkpoint_id']!=identity['checkpointId']:
                    raise ExecutionError('TASK_RESULT_CONFLICT','Stored task does not match checkpoint','infrastructure',effect='unknown')
                self.assert_no_secrets(receipt['output'])
                saved=json.loads(receipt['outlet']) if receipt['outlet'].startswith(('[','{')) else receipt['outlet']
                result=NodeResult(self.apply_node_patch(node,state,receipt['patch']),saved.get('outlet','next') if isinstance(saved,dict) else saved,receipt['patch'])
                if isinstance(saved,dict):
                    from langgraph.types import Command
                    result.parent_command=Command(goto=saved['parentGoto'])
                result.provider_messages=receipt.get('provider_messages') if node['type'] in ('core.llm','core.subgraph') else None
                return result
        response_patch={}
        interaction=node['config'].get('authoring',{}).get('interrupt')
        if interaction:
            from langgraph.types import interrupt
            from .interrupts import response_patch_for
            response=interrupt({'nodeId':node['id'],'title':interaction['title'],'schema':interaction['schema'],'graphPath':(SDK_SCOPE.get() or {}).get('graphPath',[]),'taskId':(SDK_EXECUTION.get() or {}).get('taskId'),'namespace':(SDK_EXECUTION.get() or {}).get('namespace',''),'checkpointId':(SDK_EXECUTION.get() or {}).get('checkpointId')})
            response_patch=response_patch_for(self.definition,node,response)
            state=apply_patch(state,response_patch,self.definition)
        if not (self.coordinated and hasattr(self.storage,'url')):
            if self.invocations>=self.definition['policy']['maxNodeExecutions']: raise ExecutionError('NODE_BUDGET_EXCEEDED','Node execution budget exhausted','policy')
            self.invocations+=1
        context=InvocationContext(node["id"],self.invocations,self.state_version,sdk_execution=SDK_EXECUTION.get())
        token=self._invocation.set(context)
        try:
            await self.guard()
            if not self.coordinated and context.state_version != self.state_version:
                raise ExecutionError("STATE_VERSION_CONFLICT","State changed before node execution","infrastructure",effect="none")
            return await self._execute_invocation(node,state,context,response_patch)
        except ExecutionError as error:
            if not hasattr(error,'graph_path'): error.graph_path=(SDK_SCOPE.get() or {}).get('graphPath',[])
            raise
        finally:
            self._invocation.reset(token)

    async def _execute_invocation(self,node,state,context,response_patch=None):
        escape=lambda value:value.replace("~","~0").replace("/","~1")
        base="/nodes/"+escape(node["id"])+"/inputs"; location=base
        try:
            resolved={}
            for field,binding in node["inputs"].items():
                location=base+"/"+escape(field)
                resolved.update(bind({field:binding},self.input,state,self.env.get("variables",{})))
                self.assert_no_secrets({field:resolved[field]})
            descriptors={(d["type"],d["version"]):d for d in self.registry.nodes}
            desc=descriptors[(node["type"],node["typeVersion"])]
            operation=OPERATIONS.get(node["config"].get("operationRef"),{}) if node["type"]=="core.transform" else {}
            input_schema=operation.get("inputSchema",desc["inputSchema"]); output_schema=operation.get("outputSchema",desc["outputSchema"])
            if node['type']=='core.function':
                from .execution_policies import function
                cfg=node['config']
                f=function(self.env,cfg['functionRef'],cfg['functionVersion'],'node') if cfg['implementation']=='registered' else cfg
                input_schema=f.get('inputSchema',{'type':'object'});output_schema=f.get('outputSchema',{'type':'object'})
            location=base
            try: validate_value(input_schema,resolved,"INVALID_NODE_INPUT")
            except ExecutionError as error:
                field=(error.pointer or "").split("/")[1:2]
                field=field[0].replace("~1","/").replace("~0","~") if field else None
                if field in node["inputs"]: location=base+"/"+escape(field)
                raise
        except Exception as error:
            error=error if isinstance(error,ExecutionError) else ExecutionError("NODE_INPUT_RESOLUTION_FAILED","Node input preparation failed","infrastructure",effect="none")
            error.node_id=node["id"]; error.invocation=context.invocation; error.stage="input_resolution"; error.pointer=location
            try: self.assert_no_secrets(error.dto())
            except ExecutionError:
                error=ExecutionError(error.code,"Node input preparation failed",error.category,effect="none")
            raise error from None
        context=replace(context,step_id=str(uuid.uuid4()))
        if self.coordinated and hasattr(self.storage,'url'):
            from .tools import declared_effect
            effect=declared_effect(node,self.env['tools'])
            invocation=await self.storage.call('begin_task',self.run['run_id'],self.token,context.step_id,node['id'],resolved,context.state_version,context.sdk_execution,effect)
            context=replace(context,invocation=invocation)
            self.invocations=max(self.invocations,invocation)
        else:
            await self.storage.call('step_start',self.run['run_id'],self.token,context.step_id,node['id'],context.invocation,resolved,context.state_version,*([context.sdk_execution] if context.sdk_execution else []))
        self._invocation.set(context)
        outlet="next"; usage=None
        try:
            try:
                from langgraph.config import get_stream_writer
                get_stream_writer()({'nodeId':node['id'],'stepId':context.step_id,'execution':context.sdk_execution,'phase':'compute_started'})
            except RuntimeError:pass
            from .execution_policies import compute
            settings=node['config'].get('authoring',{})
            if node['type']=='core.function' or any(k in settings for k in ('retry','timeoutMs','cache','errorHandler')):
                bundle=await compute(self,node,resolved,lambda ctx:self._process_node(node,resolved,state,ctx))
            else: bundle=await self._process_node(node,resolved,state,{})
            output,outlet,usage=bundle['output'],bundle['outlet'],bundle['usage']
            parent_command=output.pop('__parent_command__',None) if node['type']=='core.subgraph' else None
            self.assert_no_secrets(output)
            shared_patch=output.pop('__shared_patch__',{}) if node['type']=='core.subgraph' else {}
            validate_value(output_schema,output,"INVALID_NODE_OUTPUT")
            patch={field:pointer(output,path) for field,path in node["writes"].items()}
            command=node['config'].get('authoring',{}).get('command',{})
            if command.get('enabled'): patch.update(bind(command.get('update',{}),self.input,state,self.env.get('variables',{})))
            if node['type']=='core.subgraph' and node['config'].get('stateMode')=='shared': patch.update(shared_patch)
            if parent_command: patch.update(decode_state(self.definition,parent_command.update))
            candidate=self.apply_node_patch(node,state,patch)
            # Compose two raw updates inside this task before the SDK reducer sees them once.
            combined=dict(response_patch or {})
            for field,value in patch.items():
                combined[field]=reduce_field(combined[field],value,self.definition['state']['reducers'].get(field,{'name':'replace'})['name']) if field in combined else value
            patch=combined
            if len(canonical({"output":output}))>self.definition["policy"]["maxEventBytes"]: raise ExecutionError("EVENT_TOO_LARGE","Node output event exceeds budget","policy")
            await self.guard()
            if self.coordinated:
                if hasattr(self.storage, 'url'):
                    from langchain_core.messages import message_to_dict
                    provider_messages={**SDK_MESSAGES.get(),**{key:message_to_dict(value) for key,value in self.messages_private.items()}}
                    self.assert_no_secrets(provider_messages)
                    if len(canonical(provider_messages))>self.definition['policy']['maxStateBytes']: raise ExecutionError('STATE_TOO_LARGE','Provider continuation exceeds checkpoint budget','policy')
                    await self.storage.call('prepare_step',self.run['run_id'],self.token,context.step_id,output,patch,json.dumps({'outlet':outlet,'parentGoto':parent_command.goto}) if parent_command else json.dumps(outlet) if isinstance(outlet,list) else outlet or '',usage,provider_messages)
                    if (SDK_SCOPE.get() or {}).get('stateless'): await self.storage.call('complete_stateless_task',self.run['run_id'],self.token,context.step_id)
                else:
                    self._prepared[context.sdk_execution['taskId']]={'execution':context.sdk_execution,'step_id':context.step_id,'checkpoint_id':context.sdk_execution['checkpointId'],'output':output,'patch':patch,'usage':usage}
                result=NodeResult(candidate,outlet or '',patch)
                result.parent_command=parent_command
                if hasattr(self.storage,'url') and node['type'] in ('core.llm','core.subgraph'): result.provider_messages=provider_messages
                return result
            async with self._commit_lock:
                # Until superstep persistence is introduced, reject stale writes.
                # A shared current version would silently accept an old candidate.
                if context.state_version != self.state_version:
                    raise ExecutionError("STATE_VERSION_CONFLICT","State changed during node execution","infrastructure",effect="unknown")
                await self.storage.call("step_complete",self.run["run_id"],self.token,context.step_id,output,candidate,patch,context.state_version,usage)
                self.state_version+=1 if patch else 0
            return NodeResult(candidate,outlet or "",patch)
        except Exception as error:
            from langgraph.errors import GraphBubbleUp
            if isinstance(error,GraphBubbleUp): raise
            error=error if isinstance(error,ExecutionError) else ExecutionError("NODE_EXECUTION_FAILED","Node execution or persistence failed","infrastructure",effect="unknown")
            try: await self.event("step.failed",{"error":error.dto()})
            except Exception: pass
            raise error

    def apply_node_patch(self,node,state,patch):
        fields=node['config'].get('authoring',{}).get('overwrite',[])
        if not fields: return apply_patch(state,patch,self.definition)
        definition={**self.definition,'state':{**self.definition['state'],'reducers':{**self.definition['state']['reducers'],**{f:{'name':'replace','version':1} for f in fields}}}}
        return apply_patch(state,patch,definition)

    async def _process_node(self,node,resolved,state,context):
        outlet="next";usage=None
        if node["type"] in ("core.start","core.end","control.fork","control.join","control.send"): output={}; outlet=None if node["type"]=="core.end" else "next"
        elif node["type"]=="core.router":
            outlet=node["config"]["defaultOutlet"]
            matches=[case['id'] for case in sorted(node['config']['cases'],key=lambda c:c['priority']) if predicate(case['predicate'],self.input,state)]
            outlet=(matches or [outlet]) if node['config'].get('mode')=='all' else (matches[0] if matches else outlet)
            output={"outlet":outlet}
        elif node["type"]=="core.transform":
            from .registry import transform
            output=transform(node["config"]["operationRef"],resolved)
        elif node['type']=='core.subgraph':
            output=await self.subgraph(node,resolved,state)
        elif node["type"]=="core.llm": output,usage=await asyncio.wait_for(self.llm(node,resolved),timeout=self.remaining())
        elif node["type"]=="core.tool_dispatch": output={"toolMessages":await self.tools(resolved["toolCalls"],node["config"]["allowedToolRefs"])}
        elif node["type"]=="core.tool":
            tool=next(t for t in self.env["tools"] if t["ref"]==node["config"]["toolRef"])
            messages=await self.tools([{"id":str(uuid.uuid4()),"name":tool["name"],"arguments":resolved["arguments"]}],[tool["ref"]]); output={"result":json.loads(messages[0]["content"][0]["text"])}
        elif node['type']=='core.progress':
            from langgraph.config import get_stream_writer
            output={'message':node['config']['message'],'percent':node['config'].get('percent',0)}
            self.assert_no_secrets(output)
            ctx=self._invocation.get()
            get_stream_writer()({**output,'nodeId':node['id'],'stepId':self.step_id,'execution':ctx.sdk_execution,'phase':'custom'})
        elif node['type']=='core.memory':
            from .session_memory_history import memory_node
            output=await memory_node(self,node,resolved)
        elif node['type']=='core.function':
            from .execution_policies import function,invoke_function
            cfg=node['config']
            f=function(self.env,cfg['functionRef'],cfg['functionVersion'],'node') if cfg['implementation']=='registered' else cfg
            output=await invoke_function(f,resolved,context,min(self.remaining(),30),self.guard)
        else: raise ExecutionError("UNKNOWN_NODE_TYPE","Executor not registered")
        return {"output":output,"outlet":outlet,"usage":usage}

    async def subgraph(self,node,resolved,state):
        child=node['config']['graph']; mode=node['config'].get('stateMode','independent')
        parent_scope=SDK_SCOPE.get() or {}; path=[*parent_scope.get('graphPath',[]),node['id']]
        validate_value(child['inputSchema'],resolved,'INVALID_SUBGRAPH_INPUT')
        initial=copy.deepcopy(state) if mode=='shared' else {**copy.deepcopy(child['state']['initial']),**bind(child['state']['inputBindings'],resolved,{})}
        validate_value(child['state']['schema'],initial,'INVALID_INITIAL_STATE')
        token=SDK_SCOPE.set({'definition':child,'input':resolved,'graphPath':path,'parentDefinition':self.definition,'parentTaskId':(SDK_EXECUTION.get() or {}).get('taskId'),'parentCheckpoint':(SDK_EXECUTION.get() or {}).get('checkpointId'),'stateless':node['config'].get('persistence')=='stateless'})
        try:
            persistence=node['config'].get('persistence','per-invocation')
            graph=graph_for(child,self.execute,self.run['compile_fingerprint'],checkpointer=False if persistence=='stateless' else True if persistence=='per-thread' else None)
            child_input=encode_state(child,initial)
            from .graph_control import advanced_graph
            child_input['eduflow_graph_input']=resolved
            try: result=await graph.ainvoke(child_input,durability='async' if persistence=='stateless' else 'sync')
            except GraphInterrupt as error:
                if not error.args[0] and not any(item['graphPath'][:len(path)]==path for item in self._static_waits.values()):
                    from langgraph.config import get_config
                    cfg=get_config(); cfg={**cfg,'configurable':{**cfg['configurable']}}
                    cfg['configurable'].pop('checkpoint_id',None)
                    snapshot=await graph.aget_state(cfg)
                    self.record_breakpoints(child,snapshot,path)
                raise
            except Exception as error:
                from langgraph.errors import ParentCommand
                if isinstance(error,ParentCommand): return {'__parent_command__':error.args[0]}
                from langgraph.errors import InvalidUpdateError
                if isinstance(error,InvalidUpdateError):
                    from .compiler import state_channels
                    message=str(error).split('For troubleshooting')[0]
                    for field,channel in sorted(state_channels(child).items(),key=lambda item:len(item[1]),reverse=True): message=message.replace(channel,field)
                    conflict=ExecutionError('CONCURRENT_STATE_CONFLICT',message,'validation',effect='none');conflict.graph_path=path
                    raise conflict from None
                raise
            final=decode_state(child,result)
            output=bind(child['outputBindings'],resolved,final)
            validate_value(child['outputSchema'],output,'INVALID_SUBGRAPH_OUTPUT')
            if mode=='shared':
                # Reducers must emit raw updates. Accumulate child receipts from this
                # invocation, not a full merged list copied back into the parent.
                patches=await self.storage.call('scope_patches',self.run['run_id'],self.token,(SDK_EXECUTION.get() or {}).get('taskId')) if hasattr(self.storage,'url') else [r['patch'] for r in self._prepared.values() if r.get('execution',{}).get('parentTaskId')==(SDK_EXECUTION.get() or {}).get('taskId')]
                merged={}
                for patch in patches:
                    for field,value in patch.items(): merged[field]=reduce_field(merged[field],value,child['state']['reducers'].get(field,{'name':'replace'})['name']) if field in merged else value
                output['__shared_patch__']=merged
            return output
        finally: SDK_SCOPE.reset(token)

    def record_breakpoints(self,definition,snapshot,path,only=None):
        names={'eduflow_node_'+str(i):n for i,n in enumerate(sorted(definition['nodes'],key=lambda n:n['id']))}
        for name in snapshot.next:
            node=names.get(name)
            if not node or only is not None and node['id'] not in only: continue
            if any(task.name==name and task.interrupts for task in snapshot.tasks): continue
            checkpoint=snapshot.config['configurable'].get('checkpoint_id','')
            key='breakpoint:'+checkpoint+':'+name
            self._static_waits[key]={'id':key,'nodeId':node['id'],'title':'调试断点 · 下一步 '+node['label'],'schema':{'type':'object','properties':{},'additionalProperties':False},'graphPath':path,'breakpoint':True,'checkpointId':checkpoint,'namespace':snapshot.config['configurable'].get('checkpoint_ns','')+'|'+name}

    async def run_graph(self):
        current=compile_definition(self.definition,self.registry.snapshot(self.env))
        if not current["valid"] or current["compileFingerprint"]!=self.run["compile_fingerprint"]: raise ExecutionError("COMPILE_FINGERPRINT_CHANGED","Compiler registry differs from accepted Run")
        self.assert_no_secrets(self.input)
        validate_value(self.definition["inputSchema"],self.input,"INVALID_RUN_INPUT")
        if len(canonical(self.input))>self.definition["policy"]["maxInputBytes"]: raise ExecutionError("INPUT_TOO_LARGE","Input exceeds budget","policy")
        state={**copy.deepcopy(self.definition["state"]["initial"]),**bind(self.definition["state"]["inputBindings"],self.input,{})}
        self.assert_no_secrets(state)
        validate_value(self.definition["state"]["schema"],state,"INVALID_INITIAL_STATE")
        from .checkpoints import PostgresCoordinator, MemoryCoordinator
        self.coordinated=True
        saver=PostgresCoordinator(self) if hasattr(self.storage,'url') else MemoryCoordinator(self)
        graph=graph_for(self.definition,self.execute,current["compileFingerprint"],checkpointer=saver)
        from .telemetry import record_cache_info
        record_cache_info()
        config={"configurable":{"thread_id":str(self.run.get('thread_id') or self.run['run_id'])},"recursion_limit":self.definition['policy'].get('authoring',{}).get('recursionLimit',self.definition['policy']['maxNodeExecutions']+2)}
        def concurrency(d):
            caps=[n['config']['concurrency'] for n in d['nodes'] if n['type']=='control.send']
            caps.extend(concurrency(n['config']['graph']) for n in d['nodes'] if n['type']=='core.subgraph')
            return min([20,*caps])
        config['max_concurrency']=concurrency(self.definition)
        graph_input=encode_state(self.definition,state)
        if self.run.get('operation')=='next':
            graph_input=encode_state(self.definition,bind(self.definition['state']['inputBindings'],self.input,{}))
        elif self.run.get('operation')=='branch':graph_input=None
        from .graph_control import advanced_graph
        if graph_input is not None: graph_input['eduflow_graph_input']=self.input
        if self.run.get('resume_of_run_id'):
            from langgraph.types import Command
            graph_input=Command(resume={k:v for k,v in self.run.get('resume_values',{}).items() if not k.startswith('breakpoint:')}) if any(not k.startswith('breakpoint:') for k in self.run.get('resume_values',{})) else None
        try:
            result={}
            async for kind,value in graph.astream(graph_input,config,durability='sync',stream_mode=['values','custom']):
                if kind=='values':result=value
                elif kind=='custom' and isinstance(value,dict):
                    self.assert_no_secrets(value)
                    if hasattr(self.storage,'url'):
                        await self.storage.call('p5_stream',self.run['run_id'],self.token,'node.progress',{**value,'transient':True},value.get('stepId'),value.get('nodeId'))
        except Exception as error:
            from langgraph.errors import InvalidUpdateError
            if isinstance(error,InvalidUpdateError):
                message=str(error).split('For troubleshooting')[0]
                from .compiler import state_channels
                for field,channel in sorted(state_channels(self.definition).items(),key=lambda item:len(item[1]),reverse=True): message=message.replace(channel,field)
                raise ExecutionError('CONCURRENT_STATE_CONFLICT',message,'validation',effect='none') from None
            raise
        snapshot=await graph.aget_state(config)
        before=self.definition['policy'].get('authoring',{}).get('interruptBefore',[])
        if before: self.record_breakpoints(self.definition,snapshot,[],set(before))
        # A later parallel values event may omit an earlier child interrupt.
        # The durable snapshot, not the final transient event, owns pending waits.
        interrupts=snapshot.interrupts
        if interrupts:
            from .interrupts import RunPaused
            pending=[{'id':item.id,**item.value} for item in interrupts]+list(self._static_waits.values())
            self.assert_no_secrets(pending)
            if hasattr(self.storage,'url'):await self.storage.call('p5_freeze_history',self.run['run_id'],self.token,snapshot.config['configurable']['checkpoint_id'])
            raise RunPaused(pending,self.definition['policy'].get('authoring',{}).get('waitTimeoutMs',86400000))
        if snapshot.next:
            from .interrupts import RunPaused
            if not self._static_waits: self.record_breakpoints(self.definition,snapshot,[])
            if hasattr(self.storage,'url'):await self.storage.call('p5_freeze_history',self.run['run_id'],self.token,snapshot.config['configurable']['checkpoint_id'])
            raise RunPaused(list(self._static_waits.values()),self.definition['policy'].get('authoring',{}).get('waitTimeoutMs',86400000))
        state=decode_state(self.definition,result)
        # Message fields using messages reducer cannot end with unfulfilled tool calls.
        for field,reducer in self.definition["state"]["reducers"].items():
            if reducer["name"]=="messages":
                pending=set()
                for message in state.get(field,[]):
                    pending.update(call["id"] for call in message.get("toolCalls",[]))
                    if message.get("toolCallId"): pending.discard(message["toolCallId"])
                if pending: raise ExecutionError("INVALID_RUN_OUTPUT","Run ended with pending tool calls")
        output=bind(self.definition["outputBindings"],self.input,state)
        validate_value(self.definition["outputSchema"],output,"INVALID_RUN_OUTPUT")
        return output
