"""One execution context per run; LangGraph alone schedules actual graph transitions."""
import asyncio
import copy
import json
import os
import time
import uuid
from urllib.parse import urlsplit
import httpx
from contextvars import ContextVar
from dataclasses import dataclass, replace
from langgraph.errors import GraphInterrupt
from .compiler import compile_definition, graph_for, NodeResult, encode_state, decode_state, SDK_EXECUTION, SDK_MESSAGES, SDK_SCOPE, CHILD_BUDGET_METADATA_KEY, CHILD_BUDGET_SCOPE_METADATA_KEY, CHILD_BUDGETS_METADATA_KEY
from .contracts import ExecutionError, bind, validate_value, canonical, pointer, apply_patch, predicate, reduce_field
from .messages import from_langchain, to_langchain
from .registry import OPERATIONS, restore_frozen_environment
from .references import ReferenceSet, frozen_references_from_snapshot, authorize_frozen_references, current_reference_snapshot, reference_config, environment_for
from .tools import invoke_tool, model_http_client
from .model_transport import DEEPSEEK_BASE_URL, JSON_RESPONSE_FORMAT, create_model_client, model_output_limit, parse_structured_output, structured_instruction

@dataclass(frozen=True)
class InvocationContext:
    """Task-local identity; never inherit the previous node's mutable context."""
    node_id: str
    invocation: int
    state_version: int
    step_id: str | None = None
    sdk_execution: dict | None = None


def _safe_host(url):
    """Hostname only: never leak paths, query strings or embedded credentials."""
    try:
        host = urlsplit(str(url or "")).hostname
    except ValueError:
        return None
    return host or None

def _provider_host(provider):
    return _safe_host(provider.get("baseUrl") or ("https://api.deepseek.com" if provider.get("adapter", "deepseek") == "deepseek" else ""))

def _reason_for_status(status):
    if status in (401, 403): return "auth_failed"
    if status == 404: return "model_not_found"
    if status == 429: return "rate_limited"
    if status in (400, 422): return "bad_request"
    if status in (408, 504): return "timeout"
    if isinstance(status, int) and status >= 500: return "provider_error"
    return None

def _reason_for_exception(error, status=None, model_call=False):
    reason = _reason_for_status(status)
    if reason: return reason
    if isinstance(error, (httpx.TimeoutException, asyncio.TimeoutError)): return "timeout"
    if isinstance(error, httpx.ConnectError): return "connection_refused"
    if isinstance(error, httpx.HTTPError): return "provider_error"
    return "provider_error" if model_call else "provider_error"

def _value_type_label(value):
    if isinstance(value,bool): return "是否"
    if isinstance(value,list): return "列表"
    if isinstance(value,dict): return "对象"
    if isinstance(value,(int,float)): return "数字"
    if isinstance(value,str): return "文本"
    if value is None: return "空值"
    return "其他类型"

def _schema_type_name(schema):
    if not isinstance(schema,dict): return None
    value=schema.get("type")
    if isinstance(value,list): value=next((item for item in value if item!="null"),None)
    if value=="integer": return "number"
    return value if value in ("string","number","boolean","array","object") else None

def _schema_type_label(schema):
    return {"string":"文本","number":"数字","boolean":"是否","array":"列表","object":"对象"}.get(_schema_type_name(schema))

def _value_type_name(value):
    if isinstance(value,bool): return "boolean"
    if isinstance(value,list): return "array"
    if isinstance(value,dict): return "object"
    if isinstance(value,(int,float)): return "number"
    if isinstance(value,str): return "string"
    if value is None: return "null"
    return None

def _write_source_label(node):
    return {"core.tool":"工具","core.llm":"模型","core.function":"函数","core.transform":"处理"}.get(node.get("type"),"节点")

def _structured_fields(config):
    structured = config.get("structuredOutput")
    fields = structured.get("fields") if isinstance(structured, dict) else None
    return fields if isinstance(fields, list) else []

class InvocationBudget:
    """Per-subgraph-invocation compute budget, bounded by every ancestor.

    Each invocation owns its counters (a parent's already-used count is never
    copied into a new child), but every executed node/tool also consumes every
    ancestor budget and the root thread budget. Used time is checkpointed with
    the child graph so an interrupt/resume continues the same budget instead of
    restarting it; human wait time is excluded by restarting ``started`` while
    keeping ``base_used_ms``.
    """
    def __init__(self, limit_ms, root_deadline, parent=None, base_used_ms=0, node_executions=0, tool_calls=0, node_limit=0, tool_limit=0, started=None):
        self.limit_ms=float(limit_ms); self.root_deadline=root_deadline; self.parent=parent
        self.base_used_ms=max(0.0,float(base_used_ms or 0)); self.started=time.monotonic() if started is None else started
        self.node_executions=int(node_executions or 0); self.tool_calls=int(tool_calls or 0)
        self.node_limit=max(0,int(node_limit or 0)); self.tool_limit=max(0,int(tool_limit or 0))
    def chain(self):
        current=self
        while current is not None:
            yield current
            current=current.parent
    def used_ms(self):
        return self.base_used_ms+max(0.0,(time.monotonic()-self.started)*1000)
    def remaining_ms(self):
        remaining=self.limit_ms-self.used_ms()
        if self.parent is not None: remaining=min(remaining,self.parent.remaining_ms())
        remaining=min(remaining,(self.root_deadline-time.monotonic())*1000)
        return remaining
    def node_exhausted(self):
        return any(item.node_limit<=item.node_executions for item in self.chain())
    def tool_exhausted(self):
        return any(item.tool_limit<=item.tool_calls for item in self.chain())
    def consume_node(self):
        for item in self.chain(): item.node_executions+=1
    def consume_tool(self):
        for item in self.chain(): item.tool_calls+=1
    def checkpoint_state(self):
        return {"usedMs":max(0,int(round(self.used_ms()))),"nodeExecutions":int(self.node_executions),"toolCalls":int(self.tool_calls)}

def checkpoint_budget_metadata():
    """Persist every scope in the call chain, not only the checkpoint owner.

    A nested child writes its own checkpoints while its parent is suspended
    inside the call node. If only the current scope were recorded, the parent
    would resume from its last own checkpoint and lose all compute consumed by
    the descendant after that point. Ancestor snapshots share the same
    InvocationBudget objects, so they include parallel work and descendants.
    """
    scope=SDK_SCOPE.get() or {}
    budget=scope.get('budget')
    if not isinstance(budget,InvocationBudget): return {}
    metadata={CHILD_BUDGET_METADATA_KEY:budget.checkpoint_state()}
    scope_key=scope.get('budgetScopeKey')
    if isinstance(scope_key,str) and scope_key: metadata[CHILD_BUDGET_SCOPE_METADATA_KEY]={"key":scope_key}
    chain=scope.get('budgetScopes')
    budgets={}
    if isinstance(chain,(list,tuple)):
        for entry in chain:
            if not isinstance(entry,(list,tuple)) or len(entry)!=2: continue
            key,item=entry
            if isinstance(key,str) and key and isinstance(item,InvocationBudget):
                budgets[key]=item.checkpoint_state()
    elif isinstance(scope_key,str) and scope_key:
        budgets[scope_key]=budget.checkpoint_state()
    if budgets: metadata[CHILD_BUDGETS_METADATA_KEY]=budgets
    return metadata

def budget_state_from_metadata(metadata,scope_key):
    """Return one scope's persisted counters from either metadata generation."""
    if not isinstance(metadata,dict) or not isinstance(scope_key,str) or not scope_key: return None
    states=metadata.get(CHILD_BUDGETS_METADATA_KEY)
    if isinstance(states,dict) and isinstance(states.get(scope_key),dict): return states[scope_key]
    scope=metadata.get(CHILD_BUDGET_SCOPE_METADATA_KEY)
    state=metadata.get(CHILD_BUDGET_METADATA_KEY)
    if isinstance(scope,dict) and scope.get('key')==scope_key and isinstance(state,dict): return state
    return None

def merge_budget_state(current,candidate):
    """Counters and compute time are monotonic; the latest snapshot wins per field.

    Checkpoints from parallel branches may arrive in any order. Merging by
    maximum keeps a later branch snapshot from overwriting usage that another
    branch already recorded for the same shared ancestor.
    """
    result={} if not isinstance(current,dict) else dict(current)
    if not isinstance(candidate,dict): return result
    for field in ('usedMs','nodeExecutions','toolCalls'):
        value=candidate.get(field)
        if isinstance(value,bool) or not isinstance(value,(int,float)) or value<0: continue
        previous=result.get(field)
        if not isinstance(previous,(int,float)) or isinstance(previous,bool): result[field]=value
        else: result[field]=max(previous,value)
    return result

def stricter_policy(parent, child):
    """Effective child policy is the per-key intersection with its parent budget."""
    result=copy.deepcopy(child)
    for key,value in child.items():
        if key=='authoring' and isinstance(value,dict):
            merged=dict(value)
            for name in ('recursionLimit','waitTimeoutMs'):
                if isinstance(merged.get(name),int) and not isinstance(merged.get(name),bool) and isinstance(parent.get('authoring',{}).get(name),int) and not isinstance(parent.get('authoring',{}).get(name),bool):
                    merged[name]=min(merged[name],parent['authoring'][name])
            result[key]=merged
        elif isinstance(value,(int,float)) and not isinstance(value,bool) and isinstance(parent.get(key),(int,float)) and not isinstance(parent.get(key),bool):
            result[key]=min(parent[key],value)
    return result

class RunExecution:
    def __init__(self,claim,registry,storage):
        self.run=claim["run"]; self.root_definition=claim["definition"]; self.token=claim["token"]
        self.registry,self.storage=registry,storage
        self.thread=claim.get("thread",{})
        self.root_input=self.run["input"]; self.state_version=self.thread.get("state_version",0); self.invocations=self.thread.get("node_executions",0); self.tool_count=self.thread.get("tool_calls",0)
        self.deadline=time.monotonic()+max(0,self.root_policy["timeoutMs"]-self.thread.get("compute_ms",0))/1000
        self.messages_private={}
        self._invocation = ContextVar("workflow_invocation", default=None)
        self._commit_lock = asyncio.Lock()
        self.coordinated = False
        self._prepared = {}
        self._p4_attempts = {}
        self._static_waits = {}
        self._stream_attempts = {}
        self._budget_states = {}
        self._saver = None
        self.max_concurrency=20
        self.root_environment_ref=self.run["environment_ref"]
        frozen_snapshot=self.run.get("registry_snapshot") if isinstance(self.run.get("registry_snapshot"),dict) else {}
        self.variable_environment_id=frozen_snapshot.get("variableEnvironmentId") if isinstance(frozen_snapshot.get("variableEnvironmentId"),str) else None
        self.root_env=environment_for(registry,self.root_environment_ref,self.run["owner_user_id"],self.variable_environment_id)
        restore_frozen_environment(self.root_env,frozen_snapshot)
        self.references=frozen_references_from_snapshot(frozen_snapshot)
        self._reference_envs={}
        if self.references is not None:
            for environment_ref,frozen in sorted(self.references.environments.items()):
                env=environment_for(registry,environment_ref,self.run["owner_user_id"],self.variable_environment_id)
                restore_frozen_environment(env,frozen["registrySnapshot"])
                if env["revision"]!=frozen["environmentRevision"]:
                    raise ExecutionError("ENVIRONMENT_CHANGED","Fixed Workflow target environment authorization changed","auth")
                self._reference_envs[environment_ref]=env
    @property
    def definition(self):
        scope=SDK_SCOPE.get()
        return scope['definition'] if scope else self.root_definition
    @definition.setter
    def definition(self,value): self.root_definition=value
    @property
    def env(self):
        scope=SDK_SCOPE.get()
        return scope.get('environment',self.root_env) if scope else self.root_env
    @env.setter
    def env(self,value): self.root_env=value
    @property
    def root_policy(self):
        return self.root_definition.get("policy",{})

    @property
    def policy(self):
        scope=SDK_SCOPE.get()
        return (scope.get('policy') if scope else None) or self.root_policy
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
    def scope_budget(self):
        scope=SDK_SCOPE.get()
        budget=scope.get('budget') if scope else None
        return budget if isinstance(budget,InvocationBudget) else None
    def budget_error(self):
        budget=self.scope_budget()
        limit=budget.limit_ms if budget is not None else self.policy["timeoutMs"]
        return ExecutionError("RUN_TIMEOUT","Workflow invocation exceeded its compute budget","timeout",effect="unknown",reason="timeout",timeout_ms=int(round(limit)))
    def child_budget_expired(self):
        budget=self.scope_budget()
        return budget is not None and budget.remaining_ms()<=0
    def checkpoint_thread_id(self):
        return str(self.run.get('thread_id') or self.thread.get('thread_id') or self.run.get('resume_of_run_id') or self.run['run_id'])
    async def resumed_budget_state(self,scope_key):
        """Latest durable counters for this exact invocation anywhere in the thread.

        A nested child's checkpoints carry ancestor snapshots because the parent
        has no superstep checkpoint while it is suspended in the call node. On
        resume, search backwards in the SDK checkpoint history and merge by
        maximum instead of reading only the scope's own last checkpoint; that
        keeps sequential descendants, parallel branches and a new run id from
        resetting or overwriting shared ancestor usage.
        """
        if not scope_key: return {}
        if scope_key in self._budget_states: return self._budget_states[scope_key]
        if self._saver is None or not (self.run.get('resume_of_run_id') or self.thread.get('checkpoint_id')): return {}
        best={}
        config={"configurable":{"thread_id":self.checkpoint_thread_id()}}
        async for item in self._saver.alist(config):
            best=merge_budget_state(best,budget_state_from_metadata(item.metadata or {},scope_key))
        self._budget_states[scope_key]=best
        return best
    def child_scope_key(self,node,path,child):
        invocation=(SDK_EXECUTION.get() or {}).get('taskId') or 'direct'
        return f"{self.checkpoint_thread_id()}:{invocation}:{node['id']}:{child.get('workflowId')}:{child.get('revision')}:{'/'.join(path)}"
    def child_budget(self,policy,state):
        state=state if isinstance(state,dict) else {}
        return InvocationBudget(
            policy['timeoutMs'],self.deadline,parent=self.scope_budget(),
            base_used_ms=state.get('usedMs',0),node_executions=state.get('nodeExecutions',0),tool_calls=state.get('toolCalls',0),
            node_limit=policy['maxNodeExecutions'],tool_limit=policy['maxToolCalls'])
    async def guard(self):
        from .server import refresh
        refresh()
        if time.monotonic()>=self.deadline: raise ExecutionError("RUN_TIMEOUT","Run exceeded deadline","timeout",effect="unknown")
        budget=self.scope_budget()
        if budget is not None and budget.remaining_ms()<=0: raise self.budget_error()
        await self.storage.check(self.run["run_id"],self.token)
        # Reload trusted config so secret/environment revocation dominates frozen snapshots.
        current=environment_for(self.registry,self.root_environment_ref,self.run["owner_user_id"],self.variable_environment_id)
        restore_frozen_environment(current,self.run.get("registry_snapshot",{}))
        if current["revision"]!=self.run["environment_revision"]: raise ExecutionError("ENVIRONMENT_CHANGED","Environment or tool authorization changed","auth")
        current_target_environments={}
        if self.references is not None:
            current_target_environments=await authorize_frozen_references(self.storage,self.registry,self.run["owner_user_id"],self.references,self.root_environment_ref,self.variable_environment_id)
        from .compiler import _function_versions
        current_references=current_reference_snapshot(self.references,current_target_environments) if self.references is not None else None
        current_root_snapshot=self.registry.snapshot(current)
        _function_versions(self.root_definition,current_root_snapshot,current_references,root_snapshot=current_root_snapshot)
        for provider in current["providers"]:
            if provider.get("secretRef") and not (provider["secretRef"].startswith("vault:") or os.environ.get(provider["secretRef"])): raise ExecutionError("SECRET_REVOKED","Provider secret unavailable","auth")
    async def event(self,kind,payload):
        context=self._invocation.get()
        if kind=='node.attempt.started':self._stream_attempts[self.step_id]=payload['attempt']
        if context and context.sdk_execution:
            payload={**payload,"execution":context.sdk_execution}
        self.assert_no_secrets(payload)
        if len(canonical(payload))>self.policy["maxEventBytes"]: raise ExecutionError("EVENT_TOO_LARGE","Event exceeds size budget","policy")
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
                budget=self.scope_budget()
                if self.tool_count>=self.root_policy["maxToolCalls"] or budget is not None and budget.tool_exhausted():
                    raise ExecutionError("TOOL_BUDGET_EXCEEDED","Tool call budget exhausted","policy")
                self.tool_count+=1
                if budget is not None: budget.consume_tool()
                await self.event("tool.started",{"callId":call_id,"toolCallId":call["id"],"toolRef":tool["ref"],"contractDigest":tool["contractDigest"]})
                await self.guard()
                result=await asyncio.wait_for(invoke_tool(tool,self.env,call["arguments"],self.remaining()),timeout=self.remaining())
                # An MCP success proves the call completed, not that no external
                # change happened. Only non-MCP write tools can be confirmed here.
                effect="unknown" if tool.get("adapter")=="mcp" else "confirmed" if tool.get("sideEffect")=="write" else "unknown" if tool.get("sideEffect")=="unknown" else "none"
                await self.event("tool.completed",{"callId":call_id,"toolCallId":call["id"],"result":result,"effect":effect,"effectSource":"adapter" if tool.get("adapter")=="mcp" else "declared",**({"declaredReadOnly":tool.get("declaredReadOnly") is True,"declaredDestructive":tool.get("declaredDestructive") is True} if tool.get("adapter")=="mcp" else {})})
                messages.append({"id":str(uuid.uuid4()),"role":"tool","content":[{"type":"text","text":json.dumps(result,ensure_ascii=False)}],"toolCallId":call["id"]})
            except Exception as error:
                if self.child_budget_expired() and (not isinstance(error,ExecutionError) or error.code in ("TOOL_TIMEOUT","TOOL_BUDGET_EXCEEDED")):
                    error=self.budget_error()
                else:
                    error=error if isinstance(error,ExecutionError) else ExecutionError("TOOL_TIMEOUT","Tool call interrupted","timeout",effect="unknown")
                if not error.tool:
                    error.tool=tool.get("name") or tool.get("ref")
                if not error.host:
                    error.host=_safe_host(tool.get("baseUrl"))
                if not error.reason:
                    error.reason="timeout" if error.code in ("TOOL_TIMEOUT","TOOL_BUDGET_EXCEEDED") else "auth_failed" if error.code in ("TOOL_FORBIDDEN","SECRET_REVOKED") else "provider_error"
                await self.event("tool.failed",{"callId":call_id,"toolCallId":call["id"],"error":error.dto()})
                for pending in calls[index+1:]: await self.event("tool.skipped",{"toolCallId":pending["id"],"reason":"previous_tool_failed"})
                raise error
        return messages
    def remaining(self):
        remaining=min(self.deadline-time.monotonic(),self.policy["nodeTimeoutMs"]/1000)
        budget=self.scope_budget()
        if budget is not None: remaining=min(remaining,budget.remaining_ms()/1000)
        return max(.001,remaining)
    def model_adapter(self,config,http_client=None):
        """Initialize the mature provider SDK; never expose raw proxy/SDK exceptions."""
        providers=[p for p in self.env["providers"] if p["ref"]==config["providerRef"] and config["modelRef"] in p["modelRefs"]]
        if not providers:
            configured=next((p for p in self.env["providers"] if p["ref"]==config["providerRef"]),None)
            raise ExecutionError("MODEL_FORBIDDEN","Model is not authorized","auth",reason="model_not_found",provider=(configured or {}).get("name") or config.get("providerRef"),model=config.get("modelRef"),host=_provider_host(configured or {}))
        provider=providers[0]
        allowed_parameters={"temperature","top_p","frequency_penalty","presence_penalty","thinking","maxOutputTokens"}
        if set(config["modelParameters"])-allowed_parameters: raise ExecutionError("UNSUPPORTED_MODEL_PARAMETER","Unsupported model parameter")
        parameters=dict(config["modelParameters"])
        max_tokens=model_output_limit(parameters)
        parameters.pop("maxOutputTokens", None)
        thinking=parameters.get("thinking")
        if "thinking" in config["modelParameters"] and (not isinstance(thinking,dict) or set(thinking)!={"type"} or thinking["type"] not in ("enabled","disabled")):
            raise ExecutionError("UNSUPPORTED_MODEL_PARAMETER","Thinking must explicitly select enabled or disabled")
        try:
            session_key=str(self.run.get("thread_id") or self.run.get("run_id") or uuid.uuid4())
            model=create_model_client(provider,config["modelRef"],self.env,session_key,
                                      max_tokens,self.remaining(),
                                      parameters=parameters,http_client=http_client)
            refs=config["allowedToolRefs"]
            if refs:
                functions=[{"type":"function","function":{"name":t["name"],"description":t.get("description",""),"parameters":t["inputSchema"]}} for t in self.env["tools"] if t["ref"] in refs and t["available"]]
                model=model.bind_tools(functions)
            return model
        except ExecutionError as error:
            if not error.reason:
                error.reason = "auth_failed" if error.code in ("SECRET_REVOKED", "MODEL_FORBIDDEN") else "provider_error"
            error.provider = error.provider or provider.get("name") or provider.get("ref")
            error.model = error.model or config.get("modelRef")
            error.host = error.host or _provider_host(provider)
            raise
        except Exception as exc:
            raise ExecutionError("MODEL_ADAPTER_FAILED","Model adapter initialization or tool binding failed","infrastructure",effect="none",reason=_reason_for_exception(exc,None,True),provider=provider.get("name") or provider.get("ref"),model=config.get("modelRef"),host=_provider_host(provider)) from None
    async def llm(self,node,resolved):
        from .prompts import render_prompt
        config=node["config"]
        parameters={name:value for name,value in resolved.items() if name!="history"}
        system,payloads=render_prompt(config["prompt"],parameters)
        fields=_structured_fields(config)
        if fields:
            instruction=structured_instruction(fields)
            system=f"{system}\n\n{instruction}" if system else instruction
        from langchain_core.messages import messages_from_dict
        persisted={key:messages_from_dict([value])[0] for key,value in SDK_MESSAGES.get().items()}
        def convert(message):
            return self.messages_private.get(message["id"],persisted.get(message["id"],to_langchain(message)))
        messages=[]
        if system: messages.append(to_langchain({"id":str(uuid.uuid4()),"role":"system","content":[{"type":"text","text":system}]}))
        messages.extend(convert(message) for message in resolved.get("history") or [])
        messages.extend(to_langchain({"id":str(uuid.uuid4()),"role":payload["role"],"content":[{"type":"text","text":payload["content"]}]}) for payload in payloads)
        provider=next((p for p in self.env["providers"] if p["ref"]==config.get("providerRef")),{})
        started=time.monotonic()
        def elapsed_ms(): return round((time.monotonic()-started)*1000)
        try:
            from .session_memory_history import stream_model
            base_url=provider.get("baseUrl") or DEEPSEEK_BASE_URL
            async with model_http_client(base_url,self.env) as http_client:
                model=self.model_adapter(config,http_client)
                if fields: model=model.bind(response_format=JSON_RESPONSE_FORMAT)
                response=await stream_model(self,model,messages)
        except ExecutionError as error:
            if not error.reason:
                error.reason="auth_failed" if error.code=="SECRET_REVOKED" else "provider_error"
            error.provider=error.provider or provider.get("name") or provider.get("ref")
            error.model=error.model or config.get("modelRef")
            error.host=error.host or _provider_host(provider)
            if error.elapsed_ms is None: error.elapsed_ms=elapsed_ms()
            raise
        except Exception as error:
            status=getattr(error,"status_code",None) or getattr(getattr(error,"response",None),"status_code",None)
            category="auth" if status in (401,403) else "rate_limit" if status==429 else "timeout" if isinstance(error,(asyncio.TimeoutError,httpx.TimeoutException)) else "provider"
            reason=_reason_for_exception(error,status,True)
            raise ExecutionError("MODEL_REQUEST_FAILED","Model request failed","provider" if category=="provider" else category,external_status=status,reason=reason,provider=provider.get("name") or provider.get("ref"),model=config.get("modelRef"),host=_provider_host(provider),http_status=status,elapsed_ms=elapsed_ms()) from None
        if response.invalid_tool_calls: raise ExecutionError("INVALID_MODEL_TOOL_CALL","Provider returned an invalid structured tool call","provider")
        message=from_langchain(response); self.messages_private[message["id"]]=response
        usage=response.usage_metadata or {}
        text="".join(block["text"] for block in message.get("content",[]) if isinstance(block,dict) and block.get("type")=="text")
        output={"messages":[message],"toolCalls":message.get("toolCalls",[]),"text":text}
        if fields: output.update(parse_structured_output(text,fields))
        return output,{"inputTokens":usage.get("input_tokens"),"outputTokens":usage.get("output_tokens")}
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
                    if node['config'].get('graph') is None and reference_config(node) is not None:
                        raise ExecutionError('WORKFLOW_REFERENCE_BOUNDARY','A fixed Workflow reference cannot control or write its parent graph','validation',effect='none')
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
        budget=self.scope_budget()
        if not (self.coordinated and hasattr(self.storage,'url')):
            if self.invocations>=self.root_policy['maxNodeExecutions'] or budget is not None and budget.node_exhausted():
                error=ExecutionError('NODE_BUDGET_EXCEEDED','Node execution budget exhausted','policy')
                error.graph_path=(SDK_SCOPE.get() or {}).get('graphPath',[])
                raise error
            self.invocations+=1
            if budget is not None: budget.consume_node()
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
        budget=self.scope_budget()
        if self.coordinated and hasattr(self.storage,'url'):
            from .tools import declared_effect
            if budget is not None and budget.node_exhausted():
                raise ExecutionError('NODE_BUDGET_EXCEEDED','Node execution budget exhausted','policy')
            effect=declared_effect(node,self.env['tools'])
            invocation=await self.storage.call('begin_task',self.run['run_id'],self.token,context.step_id,node['id'],resolved,context.state_version,context.sdk_execution,effect)
            context=replace(context,invocation=invocation)
            self.invocations=max(self.invocations,invocation)
            if budget is not None: budget.consume_node()
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
            try: candidate=self.apply_node_patch(node,state,patch)
            except ExecutionError as error:
                if error.code=="INVALID_STATE_UPDATE":
                    field=(error.pointer or "").split("/")[1:2]
                    field=field[0].replace("~1","/").replace("~0","~") if field else None
                    if field in patch:
                        field_schema=(self.definition.get("state",{}).get("schema",{}).get("properties") or {}).get(field)
                        expected_name=_schema_type_name(field_schema);actual_name=_value_type_name(patch[field])
                        expected_label=_schema_type_label(field_schema);actual_label=_value_type_label(patch[field])
                        if expected_name and actual_name and expected_name!=actual_name:
                            error.field=field;error.expected_type=expected_name;error.actual_type=actual_name
                            error.expected_label=expected_label;error.actual_label=actual_label;error.value_source=_write_source_label(node)
                            error.message=f"{field} 字段是{expected_label}，但{error.value_source}返回的是{actual_label}"
                            error.args=(error.message,)
                raise
            # Compose two raw updates inside this task before the SDK reducer sees them once.
            combined=dict(response_patch or {})
            for field,value in patch.items():
                combined[field]=reduce_field(combined[field],value,self.definition['state']['reducers'].get(field,{'name':'replace'})['name']) if field in combined else value
            patch=combined
            if len(canonical({"output":output}))>self.policy["maxEventBytes"]: raise ExecutionError("EVENT_TOO_LARGE","Node output event exceeds budget","policy")
            await self.guard()
            if self.coordinated:
                if hasattr(self.storage, 'url'):
                    from langchain_core.messages import message_to_dict
                    provider_messages={**SDK_MESSAGES.get(),**{key:message_to_dict(value) for key,value in self.messages_private.items()}}
                    self.assert_no_secrets(provider_messages)
                    if len(canonical(provider_messages))>self.policy['maxStateBytes']: raise ExecutionError('STATE_TOO_LARGE','Provider continuation exceeds checkpoint budget','policy')
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
        elif node["type"]=="core.llm":
            # Reserve a bounded node slice, but report expiry as a model timeout
            # instead of the generic infrastructure wrapper. The provider may be
            # thinking/reasoning before any visible token, so this is a real wait.
            limit=self.remaining(); started=time.monotonic()
            provider=next((p for p in self.env["providers"] if p["ref"]==node["config"].get("providerRef")),{})
            try: output,usage=await asyncio.wait_for(self.llm(node,resolved),timeout=limit)
            except asyncio.TimeoutError:
                raise ExecutionError("MODEL_TIMEOUT","Model response exceeded the node time limit","timeout",retryable=True,effect="none",reason="timeout",provider=provider.get("name") or provider.get("ref"),model=node["config"].get("modelRef"),host=_provider_host(provider),elapsed_ms=round((time.monotonic()-started)*1000),timeout_ms=round(limit*1000)) from None
        elif node["type"]=="core.tool_dispatch": output={"toolMessages":await self.tools(resolved["toolCalls"],node["config"]["allowedToolRefs"])}
        elif node["type"]=="core.tool":
            tool=next(t for t in self.env["tools"] if t["ref"]==node["config"]["toolRef"])
            messages=await self.tools([{"id":str(uuid.uuid4()),"name":tool["name"],"arguments":dict(resolved)}],[tool["ref"]]); output={"result":json.loads(messages[0]["content"][0]["text"])}
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

    def reference_target(self,node):
        reference=reference_config(node)
        if reference is None or self.references is None:
            raise ExecutionError('WORKFLOW_REFERENCE_UNAVAILABLE','Fixed Workflow reference target was not frozen','auth',effect='none')
        return self.references.target_for(reference)

    def reference_environment(self,target):
        environment_ref=target['environmentRef']
        if environment_ref==self.root_environment_ref:
            return self.root_env
        env=self._reference_envs.get(environment_ref)
        if env is None:
            raise ExecutionError('WORKFLOW_REFERENCE_ENVIRONMENT','Fixed Workflow target environment was not frozen','auth',effect='none')
        return env

    async def subgraph(self,node,resolved,state):
        embedded=node['config'].get('graph')
        fixed=embedded is None
        if fixed:
            target=self.reference_target(node)
            child=copy.deepcopy(target['definition'])
            mode='independent'
            environment=self.reference_environment(target)
        else:
            child=embedded; mode=node['config'].get('stateMode','independent'); environment=self.env
        parent_scope=SDK_SCOPE.get() or {}; path=[*parent_scope.get('graphPath',[]),node['id']]
        effective_policy=stricter_policy(self.policy,child['policy'])
        runtime_child=copy.deepcopy(child); runtime_child['policy']=effective_policy
        validate_value(child['inputSchema'],resolved,'INVALID_SUBGRAPH_INPUT')
        initial=copy.deepcopy(state) if mode=='shared' else {**copy.deepcopy(child['state']['initial']),**bind(child['state']['inputBindings'],resolved,{})}
        validate_value(child['state']['schema'],initial,'INVALID_INITIAL_STATE')
        invocation=(SDK_EXECUTION.get() or {}).get('taskId')
        workflow_path=[*parent_scope.get('workflowPath',[]),{
            'parentWorkflowId':self.definition.get('workflowId'),
            'parentRevision':self.definition.get('revision'),
            'nodeId':node['id'],
            'workflowId':child.get('workflowId') or None,
            'revision':child.get('revision') or None,
            **({'environmentRef':target['environmentRef']} if fixed else {}),
            **({'invocationId':invocation} if invocation else {}),
        }]
        persistence=node['config'].get('persistence','per-invocation')
        scope_key=self.child_scope_key(node,path,child)
        resumed=await self.resumed_budget_state(scope_key) if persistence!='stateless' else {}
        budget=self.child_budget(effective_policy,resumed)
        ancestors=parent_scope.get('budgetScopes')
        budget_scopes=((scope_key,budget),*(ancestors if isinstance(ancestors,(list,tuple)) else ()))
        scope={'definition':runtime_child,'input':resolved,'graphPath':path,'parentDefinition':None if fixed else self.definition,'parentTaskId':invocation,'parentCheckpoint':(SDK_EXECUTION.get() or {}).get('checkpointId'),'stateless':persistence=='stateless','environment':environment,'policy':effective_policy,'workflowId':child.get('workflowId') or None,'revision':child.get('revision') or None,'workflowPath':workflow_path,'fixedReference':fixed,'budget':budget,'budgetScopeKey':scope_key,'budgetScopes':budget_scopes}
        token=SDK_SCOPE.set(scope)
        try:
            graph=graph_for(runtime_child,self.execute,self.run['compile_fingerprint'],checkpointer=False if persistence=='stateless' else True if persistence=='per-thread' else None)
            child_input=encode_state(runtime_child,initial)
            child_input['eduflow_graph_input']=resolved
            child_config={'max_concurrency':max(1,min(self.max_concurrency,20)),'recursion_limit':max(1,min(effective_policy.get('authoring',{}).get('recursionLimit',effective_policy['maxNodeExecutions']+2),effective_policy['maxNodeExecutions']+2))}
            remaining=budget.remaining_ms()
            if remaining<=0:
                error=self.budget_error(); error.graph_path=path; raise error
            try: result=await asyncio.wait_for(graph.ainvoke(child_input,config=child_config,durability='async' if persistence=='stateless' else 'sync'),timeout=max(.001,remaining/1000))
            except asyncio.TimeoutError:
                error=self.budget_error(); error.graph_path=path; raise error from None
            except GraphInterrupt as error:
                if not error.args[0] and not any(item['graphPath'][:len(path)]==path for item in self._static_waits.values()):
                    from langgraph.config import get_config
                    cfg=get_config(); cfg={**cfg,'configurable':{**cfg['configurable']}}
                    cfg['configurable'].pop('checkpoint_id',None)
                    snapshot=await graph.aget_state(cfg)
                    self.record_breakpoints(runtime_child,snapshot,path)
                raise
            except Exception as error:
                from langgraph.errors import ParentCommand
                if isinstance(error,ParentCommand):
                    if fixed:
                        boundary=ExecutionError('WORKFLOW_REFERENCE_BOUNDARY','A fixed Workflow reference cannot control or write its parent graph','validation',effect='none')
                        boundary.graph_path=path; raise boundary from None
                    return {'__parent_command__':error.args[0]}
                from langgraph.errors import InvalidUpdateError
                if isinstance(error,InvalidUpdateError):
                    from .compiler import state_channels
                    message=str(error).split('For troubleshooting')[0]
                    for field,channel in sorted(state_channels(runtime_child).items(),key=lambda item:len(item[1]),reverse=True): message=message.replace(channel,field)
                    conflict=ExecutionError('CONCURRENT_STATE_CONFLICT',message,'validation',effect='none');conflict.graph_path=path
                    raise conflict from None
                raise
            final=decode_state(runtime_child,result)
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
        current=compile_definition(self.definition,self.registry.snapshot(self.env),self.references)
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
        self._saver=saver
        graph=graph_for(self.definition,self.execute,current["compileFingerprint"],checkpointer=saver)
        from .telemetry import record_cache_info
        record_cache_info()
        config={"configurable":{"thread_id":str(self.run.get('thread_id') or self.run['run_id'])},"recursion_limit":self.definition['policy'].get('authoring',{}).get('recursionLimit',self.definition['policy']['maxNodeExecutions']+2)}
        def concurrency(d,seen=None):
            seen=seen if seen is not None else set()
            caps=[n['config']['concurrency'] for n in d['nodes'] if n['type']=='control.send']
            for n in d['nodes']:
                if n['type']!='core.subgraph': continue
                child=n['config'].get('graph')
                if isinstance(child,dict): caps.append(concurrency(child,seen))
                elif self.references is not None:
                    try: target=self.references.target_for(reference_config(n))
                    except ExecutionError: target=None
                    if target is not None:
                        identity=(target['workflowId'],target['revision'],target['environmentRef'])
                        if identity not in seen:
                            seen.add(identity); caps.append(concurrency(target['definition'],seen))
            return min([20,*caps])
        self.max_concurrency=concurrency(self.definition)
        config['max_concurrency']=self.max_concurrency
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
