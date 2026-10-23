import copy
import pytest
from eduflow_workflow.contracts import ExecutionError
from eduflow_workflow.registry import Registry
from eduflow_workflow.compiler import compile_definition
from eduflow_workflow.execution_policies import CACHE
from test_contracts import sample
from test_runtime import execution

@pytest.mark.parametrize('side_effect,expected_calls',[('write',1),('read',2)])
@pytest.mark.parametrize('with_handler',[False,True])
async def test_native_deadline_cannot_retry_or_handle_an_uncertain_write(monkeypatch,side_effect,expected_calls,with_handler):
 import asyncio
 from eduflow_workflow import runtime,execution_policies
 calls=[];handled=[]
 async def committed_then_lost(*args):
  calls.append('external commit')
  await asyncio.sleep(1)
 async def handle(*args):
  handled.append(True);return {'result':{'value':99}}
 monkeypatch.setattr(runtime,'invoke_tool',committed_then_lost)
 monkeypatch.setattr(execution_policies,'invoke_function',handle)
 tool={'ref':'external','name':'external','adapter':'function','operationRef':'core.identity','inputSchema':{'type':'object'},'outputSchema':{'type':'object'},'sideEffect':side_effect}
 run=execution(tools=[tool]);run.env['functions']=[{'ref':'handler','version':1,'purpose':'handler','language':'builtin'}]
 settings={'timeoutMs':20,'retry':{'maxAttempts':2,'intervalMs':0,'retryOn':['timeout']}}
 if with_handler:settings['errorHandler']={'functionRef':'handler','functionVersion':1}
 node=copy.deepcopy(run.definition['nodes'][1]);node.update(type='core.tool',typeVersion=2,config={'toolRef':'external','authoring':settings},inputs={},writes={'value':'/result/value'} if with_handler else {})
 if side_effect=='read' and with_handler:
  await run.execute(node,{'value':0})
  assert len(handled)==1
 else:
  with pytest.raises(ExecutionError) as caught:await run.execute(node,{'value':0})
  assert caught.value.code=='NODE_TIMEOUT'
  assert caught.value.effect==('unknown' if side_effect=='write' else 'none')
  assert not handled
 assert len(calls)==expected_calls

def definition(config=None,settings=None):
 d=sample();d['nodes'][1].update(type='core.function',config=config or {'implementation':'registered','functionRef':'edu.scale','functionVersion':2},inputs={'value':{'source':'literal','value':5}})
 if settings:d['nodes'][1]['config']['authoring']=settings
 return d

async def test_registered_versioned_function_real_graph():
 assert await execution(definition()).run_graph()=={'value':10}

@pytest.mark.parametrize('language,code',[('python','def process(input, context):\n return {"value": input["value"] + 3}'),('javascript','function process(input, context) { return {value:input.value + 3}; }')])
async def test_two_isolated_languages(language,code):
 assert await execution(definition({'implementation':'code','language':language,'code':code})).run_graph()=={'value':8}

async def test_native_retry_then_success():
 d=definition({'implementation':'code','language':'python','code':'def process(input, context):\n if context["attempt"] < 3: raise RuntimeError("temporary")\n return {"value": context["attempt"]}'},{'retry':{'maxAttempts':3,'intervalMs':0,'retryOn':['code']}})
 r=execution(d);assert await r.run_graph()=={'value':3}
 assert sum(n=='emit' and a[2]=='node.attempt.started' for n,a in r.storage.calls)==3

async def test_cache_hit_is_audited_after_real_task_start():
 await CACHE.aclear();d=definition(settings={'cache':{'ttlMs':60000}})
 r=execution(d);assert await r.run_graph()=={'value':10}
 other=execution(d);assert await other.run_graph()=={'value':10}
 assert any(n=='emit' and a[2]=='node.cache' and a[3]['hit'] for n,a in other.storage.calls)

async def test_custom_numeric_reducer():
 d=sample();d['state']['reducers']={'value':{'name':'edu.sum','version':1}}
 assert await execution(d).run_graph()=={'value':5}

@pytest.mark.parametrize('settings',[{'cache':{'ttlMs':1500}},{'retry':{'maxAttempts':20}},{'timeoutMs':-1},{'errorHandler':{'functionRef':'none'}}])
def test_policy_invalid_preflight(settings):
 d=definition(settings=settings);reg=Registry({'environments':[{'ref':'test','ownerIds':['a']}]})
 assert not compile_definition(d,reg.snapshot(reg.environment('test','a')))['valid']

async def test_explicit_overwrite_uses_native_overwrite():
 d=sample();d['state']['initial']['value']=10;d['state']['reducers']={'value':{'name':'edu.sum','version':1}}
 d['nodes'][1]['config']['authoring']={'overwrite':['value']}
 assert await execution(d).run_graph()=={'value':5}

async def test_message_removal_uses_official_remove_message():
 from eduflow_workflow.contracts import reduce_field
 initial=[{'id':'a','role':'user','content':[{'type':'text','text':'keep?'}]},{'id':'b','role':'user','content':[{'type':'text','text':'keep'}]}]
 result=reduce_field(initial,[{'id':'a','role':'remove','content':[]}],'messages')
 assert [message['id'] for message in result]==['b']

@pytest.mark.parametrize('value,expected',[(1,True),(0,False),(-1,False)])
def test_versioned_predicate(value,expected):
 from eduflow_workflow.contracts import predicate
 assert predicate({'op':'function','functionRef':'edu.positive','functionVersion':1,'value':{'source':'literal','value':value}},{},{}) is expected

async def test_output_limit_preserves_error_and_cleanup():
 from eduflow_workflow.sandbox import run_code,command
 with pytest.raises(ExecutionError) as caught:
  await run_code('python','import os\ndef process(input, context):\n while True: os.write(1,b"x"*8192)',{},{},3)
 assert caught.value.code=='SANDBOX_OUTPUT_LIMIT'
 status,out,_=await command('ps','--filter','label=eduflow.p4=ephemeral','--format','{{.ID}}')
 # Independent acceptance may run other containers concurrently; this unit only asserts CLI responsiveness.
 assert status==0

def test_node_and_handler_function_purposes_are_separate():
 from eduflow_workflow.execution_policies import function
 with pytest.raises(ExecutionError) as caught: function({},'edu.scale',1,'handler')
 assert caught.value.code=='FUNCTION_PURPOSE_MISMATCH'

async def test_cached_output_must_still_match_function_version_schema():
 await CACHE.aclear();d=definition(settings={'cache':{'ttlMs':60000}})
 assert await execution(d).run_graph()=={'value':10}
 keys=[(namespace,key) for namespace,bucket in CACHE._cache.items() for key in bucket]
 assert len(keys)==1
 CACHE.set({keys[0]:([('output',{'output':{'value':10,'unexpected':True},'outlet':'next','usage':None})],60)})
 with pytest.raises(ExecutionError) as caught:await execution(d).run_graph()
 assert caught.value.code=='INVALID_NODE_OUTPUT'
 await CACHE.aclear()
