"""Versioned execution policies around a pure SDK compute graph, not a scheduler."""
import asyncio
import copy
import json
import time
from typing import TypedDict, Any
from langgraph.graph import StateGraph, START, END
from langgraph.types import RetryPolicy, CachePolicy
from langgraph.cache.memory import InMemoryCache
from langgraph.errors import NodeError, NodeTimeoutError
from .contracts import ExecutionError, digest, validate_value, schema_check
from .sandbox import run_code, IMAGES

CACHE=InMemoryCache()
CACHE_LIMIT=512
REDUCERS={'edu.sum':1,'edu.max':1,'edu.unique':1}
BUILTINS=[{'ref':'edu.scale','version':v,'name':'数值缩放 v'+str(v),'language':'builtin','inputSchema':{'type':'object','properties':{'value':{'type':'number'}},'required':['value'],'additionalProperties':False},'outputSchema':{'type':'object','properties':{'value':{'type':'number'}},'required':['value'],'additionalProperties':False},'factor':v,'purpose':'node'} for v in (1,2)]

def catalog(env): return [*copy.deepcopy(BUILTINS),*env.get('functions',[])]
def function(env,ref,version,purpose=None):
    matches=[f for f in catalog(env) if f['ref']==ref and f['version']==version and not f.get('disabled')]
    if len(matches)!=1: raise ExecutionError('FUNCTION_UNAVAILABLE','Function version is missing or disabled','auth',effect='none')
    if purpose and matches[0].get('purpose','node')!=purpose: raise ExecutionError('FUNCTION_PURPOSE_MISMATCH','Function version has a different execution purpose')
    return matches[0]

def validate_node(node,snapshot,environment_checks):
    cfg=node['config'];s=cfg.get('authoring',{})
    if node['type']=='core.memory' and any(k in s for k in ('cache','retry','errorHandler')): raise ExecutionError('INVALID_MEMORY_POLICY','Memory mutations use checkpoint transactions; caching, retry and handlers are not configurable')
    if set(s)-{'interrupt','command','defer','retry','timeoutMs','cache','errorHandler','overwrite'}: raise ExecutionError('UNSUPPORTED_CAPABILITY','Unknown node policy')
    if node['type']=='core.function':
        if cfg.get('implementation')=='registered':
            version=cfg.get('functionVersion')
            if isinstance(version,bool) or not isinstance(version,int) or version<1: raise ExecutionError('INVALID_FUNCTION_VERSION','Select an explicit immutable function version')
            if environment_checks: function({'functions':snapshot.get('functions',[])},cfg.get('functionRef'),version,'node')
        elif cfg.get('implementation')=='code':
            if cfg.get('language') not in IMAGES or not isinstance(cfg.get('code'),str) or not cfg['code'].strip() or len(cfg['code'])>32768: raise ExecutionError('INVALID_CODE','Choose a supported language and provide at most 32 KiB code')
        else: raise ExecutionError('INVALID_FUNCTION','Select registered or code implementation')
        for key in ('inputSchema','outputSchema'):
            schema_check(cfg.get(key,{'type':'object'}))
            if cfg.get(key,{}).get('type','object')!='object': raise ExecutionError('INVALID_FUNCTION_SCHEMA','Function interfaces must be objects')
    if any(k in s for k in ('retry','timeoutMs','cache','errorHandler')) and (node['type'].startswith('control.') or node['type'] in ('core.start','core.end','core.router','core.subgraph')):
        raise ExecutionError('INVALID_POLICY_COMBINATION','Apply execution policies to processing nodes inside the graph')
    retry=s.get('retry',{})
    if retry:
        if set(retry)-{'maxAttempts','intervalMs','backoffFactor','maxIntervalMs','retryOn'}: raise ExecutionError('INVALID_RETRY','Unknown retry option')
        for key,lo,hi,default in [('maxAttempts',1,10,3),('intervalMs',0,10000,1000),('backoffFactor',1,10,1),('maxIntervalMs',0,30000,10000)]:
            value=retry.get(key,default)
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not lo<=value<=hi or key=='maxAttempts' and not isinstance(value,int): raise ExecutionError('INVALID_RETRY','Invalid retry '+key)
        if not isinstance(retry.get('retryOn',[]),list) or set(retry.get('retryOn',[]))-{'rate_limit','provider','tool','code','timeout'}: raise ExecutionError('INVALID_RETRY','Choose supported transient error categories')
    if 'timeoutMs' in s and (isinstance(s['timeoutMs'],bool) or not isinstance(s['timeoutMs'],(float,int)) or not 1<=s['timeoutMs']<=120000): raise ExecutionError('INVALID_TIMEOUT','Node timeout must be 1–120000 ms')
    if 'cache' in s:
        spec=s['cache']
        if not isinstance(spec,dict) or set(spec)!={'ttlMs'} or isinstance(spec['ttlMs'],bool) or not isinstance(spec['ttlMs'],int) or spec['ttlMs']%1000!=0 or not 1000<=spec['ttlMs']<=3600000: raise ExecutionError('INVALID_CACHE','Cache TTL must be whole seconds, 1000–3600000 ms')
        if node['type'] not in ('core.function','core.transform') or 'interrupt' in s or 'command' in s or 'errorHandler' in s or node['type']=='core.transform' and cfg.get('operationRef')=='core.message': raise ExecutionError('INVALID_CACHE_COMBINATION','Cache supports pure computation without waits, Command or handlers')
    if 'errorHandler' in s:
        h=s['errorHandler']
        if not isinstance(h,dict) or set(h)-{'functionRef','functionVersion'} or isinstance(h.get('functionVersion'),bool) or not isinstance(h.get('functionVersion'),int) or h['functionVersion']<1: raise ExecutionError('INVALID_ERROR_HANDLER','Select a versioned handler')
        if environment_checks: function({'functions':snapshot.get('functions',[])},h.get('functionRef'),h['functionVersion'],'handler')
    if 'overwrite' in s:
        if not isinstance(s['overwrite'],list) or len(set(s['overwrite']))!=len(s['overwrite']) or set(s['overwrite'])-set(node['writes']): raise ExecutionError('INVALID_OVERWRITE','Choose declared written fields to overwrite')

def retry_allowed(error,settings,timeout_effect='none'):
    if isinstance(error,NodeTimeoutError): return timeout_effect!='unknown' and 'timeout' in settings.get('retryOn',['rate_limit','provider'])
    return isinstance(error,ExecutionError) and error.effect!='unknown' and error.category in settings.get('retryOn',['rate_limit','provider']) and error.category not in ('auth','policy','validation','infrastructure')

class ComputeState(TypedDict,total=False):
    key:str
    output:dict

async def compute(executor,node,resolved,body):
    from .tools import declared_effect
    timeout_effect='unknown' if declared_effect(node,executor.env.get('tools',[]))=='write' else 'none'
    def timeout_error():
        if node['type']=='core.llm':
            provider=next((p for p in executor.env.get('providers',[]) if p['ref']==node['config'].get('providerRef')),{})
            return ExecutionError('MODEL_TIMEOUT','Model response exceeded the node time limit','timeout',retryable=True,effect=timeout_effect,reason='timeout',provider=provider.get('name') or provider.get('ref'),model=node['config'].get('modelRef'),timeout_ms=round(timeout*1000))
        return ExecutionError('NODE_TIMEOUT','Node exceeded configured timeout','timeout',effect=timeout_effect,reason='timeout',timeout_ms=round(timeout*1000))
    s=node['config'].get('authoring',{});retry=s.get('retry',{});calls=0
    max_attempts=retry.get('maxAttempts',1)
    context={'ownerId':executor.run['owner_user_id'],'workflowId':executor.run.get('workflow_id',executor.root_definition['workflowId']),'nodeId':node['id'],'graphPath':(executor._invocation.get().sdk_execution or {}).get('graphPath',[])}
    # Only this safe, complete declared context reaches user code. No environment/credentials.
    timeout=min(s.get('timeoutMs',executor.definition['policy']['nodeTimeoutMs'])/1000,executor.remaining())
    async def attempt(handler=False):
        await executor.guard()
        identity=executor._invocation.get().sdk_execution or {}
        key=identity.get('taskId',executor.step_id)
        if executor.coordinated and hasattr(executor.storage,'url'):
            n=await executor.storage.call('p4_attempt',executor.run['run_id'],executor.token,key,max_attempts,handler)
        else:
            n=executor._p4_attempts.get(key,0)+1
            if not handler and n>max_attempts: raise ExecutionError('ATTEMPT_BUDGET_EXCEEDED','Task attempt limit exhausted','policy',effect='none')
            executor._p4_attempts[key]=n
        await executor.event('node.handler.started' if handler else 'node.attempt.started',{'attempt':n,'taskId':key})
        return n
    async def work(state):
        nonlocal calls
        n=await attempt();calls+=1
        try:
            result=await body({**context,'attempt':n})
            executor.assert_no_secrets(result)
            await executor.event('node.attempt.completed',{'attempt':n})
            return {'output':result}
        except Exception as error:
            from langgraph.errors import GraphBubbleUp
            if isinstance(error,GraphBubbleUp): raise
            safe=error if isinstance(error,ExecutionError) else ExecutionError('NODE_EXECUTION_FAILED','Processing failed','infrastructure',effect='unknown')
            await executor.event('node.attempt.failed',{'attempt':n,'error':safe.dto(),'retryEligible':retry_allowed(safe,retry)})
            raise
    async def handler(state,error:NodeError):
        source=error.error
        if isinstance(source,NodeTimeoutError) and timeout_effect=='unknown': raise timeout_error()
        if isinstance(source,ExecutionError) and (source.category in ('auth','policy','validation','infrastructure') or source.effect=='unknown'): raise source
        if not isinstance(source,(ExecutionError,NodeTimeoutError)): raise source
        await attempt(True)
        h=s['errorHandler'];f=function(executor.env,h['functionRef'],h['functionVersion'],'handler')
        value=await invoke_function(f,{'error':{'code':getattr(source,'code','NODE_TIMEOUT')},'input':resolved},context,timeout,executor.guard)
        await executor.event('node.handler.completed',{'sourceError':getattr(source,'code','NODE_TIMEOUT'),'functionRef':h['functionRef'],'functionVersion':h['functionVersion']})
        return {'output':{'output':value,'outlet':'next','usage':None}}
    graph=StateGraph(ComputeState)
    kwargs={'timeout':timeout}
    if retry: kwargs['retry_policy']=RetryPolicy(initial_interval=retry.get('intervalMs',1000)/1000,backoff_factor=retry.get('backoffFactor',1),max_interval=retry.get('maxIntervalMs',10000)/1000,max_attempts=max_attempts,jitter=False,retry_on=lambda e:retry_allowed(e,retry,timeout_effect))
    if 'cache' in s: kwargs['cache_policy']=CachePolicy(key_func=lambda state:state['key'],ttl=max(1,s['cache']['ttlMs']//1000))
    if 'errorHandler' in s: kwargs['error_handler']=handler
    graph.add_node('compute',work,**kwargs);graph.add_edge(START,'compute');graph.add_edge('compute',END)
    if sum(len(bucket) for bucket in getattr(CACHE,'_cache',{}).values())>=CACHE_LIMIT: await CACHE.aclear()
    key=digest({'node':node,'input':resolved,'context':context,'environmentRevision':executor.env['revision'],'versions':executor.run.get('compile_fingerprint','test')})
    task=asyncio.create_task(graph.compile(cache=CACHE if 'cache' in s else None,checkpointer=False).ainvoke({'key':key},durability='async'))
    try:
        while not task.done():
            await asyncio.sleep(.1);await executor.guard()
        result=await task
    except NodeTimeoutError: raise timeout_error() from None
    finally:
        if not task.done(): task.cancel()
        await asyncio.gather(task,return_exceptions=True)
    if 'cache' in s: await executor.event('node.cache',{'hit':calls==0,'scope':'worker-process','ttlMs':s['cache']['ttlMs']})
    bundle=result.get('output')
    validate_value({'type':'object','properties':{'output':{'type':'object'},'outlet':{'const':'next'},'usage':{'type':['object','null']}},'required':['output','outlet','usage'],'additionalProperties':False},bundle,'INVALID_COMPUTE_RECEIPT')
    executor.assert_no_secrets(bundle)
    return bundle

async def invoke_function(f,arguments,context,timeout,guard):
    validate_value(f.get('inputSchema',{'type':'object'}),arguments,'INVALID_FUNCTION_INPUT')
    if f.get('language')=='builtin': result={'value':arguments['value']*f['factor']}
    else:
        try: result=await run_code(f['language'],f['code'],arguments,context,timeout,guard)
        except ExecutionError as error:
            if error.code=='SANDBOX_UNAVAILABLE' and getattr(error,'diagnostic_id',None):
                import sys
                owner=getattr(guard,'__self__',None)
                run=getattr(owner,'run',{})
                print(json.dumps({'event':'workflow.sandbox.failed_task','diagnosticId':error.diagnostic_id,
                    'runId':str(run.get('run_id','')),'stepId':str(getattr(owner,'step_id',''))}),file=sys.stderr,flush=True)
            raise
    validate_value(f.get('outputSchema',{'type':'object'}),result,'INVALID_FUNCTION_OUTPUT')
    return result
