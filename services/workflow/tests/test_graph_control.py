"""Real SDK control-flow tests; Local API evidence is recorded separately."""
import copy
import pytest
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from eduflow_workflow.compiler import graph_for,compile_definition,decode_state,encode_state,NodeResult
from eduflow_workflow.contracts import ExecutionError
from eduflow_workflow.registry import Registry,obj
from eduflow_workflow.interrupts import RunPaused
from test_contracts import sample
from test_runtime import execution


def lit(v): return {'source':'literal','value':v}
def state(k): return {'source':'state','pointer':'/'+k,'onMissing':{'mode':'error'}}
def node(id,value,field='value'):
    return {'id':id,'label':id,'type':'core.transform','typeVersion':1,'config':{'operationRef':'core.identity','operationVersion':1},'inputs':{'value':lit(value)},'writes':{field:'/value'}}
def parallel():
    d=sample();d['state']={'schema':obj({'a':{'type':'number'},'b':{'type':'number'}}),'initial':{'a':0,'b':0},'inputBindings':{},'reducers':{}}
    d['nodes']=[d['nodes'][0],node('a',2,'a'),node('b',3,'b'),{'id':'j','label':'join','type':'control.join','typeVersion':1,'config':{'waitFor':['a','b'],'strategy':'all'},'inputs':{},'writes':{}},d['nodes'][-1]]
    d['transitions']=[{'id':str(i),'from':a,'outlet':'next','to':b} for i,(a,b) in enumerate([('s','a'),('s','b'),('a','j'),('b','j'),('j','e')])]
    d['outputSchema']=obj({'a':{'type':'number'},'b':{'type':'number'}});d['outputBindings']={'a':state('a'),'b':state('b')}
    return d

async def test_static_parallel_real_runtime():
    r=execution(parallel());assert await r.run_graph()=={'a':2,'b':3}
    assert len(r.storage.completed)==5

async def test_parallel_conflict_is_explicit():
    d=parallel();d['nodes'][2]['writes']={'a':'/value'}
    with pytest.raises(ExecutionError,match='a') as error: await execution(d).run_graph()
    assert error.value.code=='CONCURRENT_STATE_CONFLICT'

async def test_independent_subgraph_maps_outputs_and_paths():
    d=sample();child=sample();sub=d['nodes'][1]
    sub.update(type='core.subgraph',config={'graph':child},inputs={},writes={'value':'/value'})
    r=execution(d);assert await r.run_graph()=={'value':5}
    calls=[args for name,args in r.storage.calls if name=='step_start']
    assert any(args[-1].get('graphPath')==['a'] for args in calls)

@pytest.mark.parametrize('size',[0,1,3])
async def test_send_native_task_inputs(size):
    d=sample();d['state']={'schema':obj({'items':{'type':'array'},'item':{},'results':{'type':'array'}}),'initial':{'items':list(range(size)),'item':None,'results':[]},'inputBindings':{},'reducers':{'results':{'name':'append','version':1}}}
    d['nodes']=[d['nodes'][0],{'id':'send','label':'send','type':'control.send','typeVersion':1,'config':{'items':'/items','target':'a','itemKey':'item','concurrency':2},'inputs':{},'writes':{}},node('a',[],'results'),d['nodes'][-1]]
    d['transitions']=[{'id':str(i),'from':a,'outlet':'next','to':b} for i,(a,b) in enumerate([('s','send'),('send','e'),('a','e')])]
    calls=[]
    async def execute(n,values):
        calls.append((n['id'],values.get('item')))
        return NodeResult(values,'next',{'results':[values['item']]} if n['id']=='a' else {})
    result=await graph_for(d,execute,'test').ainvoke(encode_state(d,d['state']['initial']))
    assert decode_state(d,result)['results']==list(range(size))
    assert sum(n=='a' for n,v in calls)==size

async def test_multiple_interrupt_partial_resume_with_same_checkpoint():
    from langgraph.types import interrupt
    d=parallel();saver=InMemorySaver()
    async def call(n,values):
        patch={}
        if n['id'] in ('a','b'): patch[n['id']]=interrupt({'nodeId':n['id']})
        return NodeResult(values,'next',patch)
    g=graph_for(d,call,'test',checkpointer=saver);config={'configurable':{'thread_id':'partial'}}
    first=await g.ainvoke(encode_state(d,d['state']['initial']),config)
    ids={i.value['nodeId']:i.id for i in first['__interrupt__']}
    second=await g.ainvoke(Command(resume={ids['a']:2}),config)
    assert [i.id for i in second['__interrupt__']]==[ids['b']]
    last=await g.ainvoke(Command(resume={ids['b']:3}),config)
    assert decode_state(d,last)=={'a':2,'b':3}

@pytest.mark.parametrize('bad', ['missing-target','stateless-interrupt','bad-join'])
def test_control_preflight_rejects_invalid_config(bad):
    d=parallel()
    if bad=='bad-join': d['nodes'][3]['config']['waitFor']=['a']
    elif bad=='missing-target': d['nodes'][1]['config']['authoring']={'command':{'enabled':True,'destinations':['absent']}}
    else:
        child=sample();child['nodes'][1]['config']['authoring']={'interrupt':{'title':'x','schema':obj({}),'resumeWrites':{}}}
        d['nodes'][1].update(type='core.subgraph',config={'graph':child,'persistence':'stateless'},inputs={})
    reg=Registry({'environments':[{'ref':'test','ownerIds':['a']}]});assert not compile_definition(d,reg.snapshot(reg.environment('test','a')))['valid']

async def test_shared_subgraph_returns_raw_append_updates_once():
    d=sample();schema=obj({'items':{'type':'array'}})
    d['state']={'schema':schema,'initial':{'items':['seed']},'inputBindings':{},'reducers':{'items':{'name':'append','version':1}}}
    child=copy.deepcopy(d);child['nodes'][1]=node('a',['child'],'items');child['outputSchema']=obj({});child['outputBindings']={}
    d['nodes'][1].update(type='core.subgraph',config={'graph':child,'stateMode':'shared'},inputs={},writes={})
    d['outputSchema']=obj({'items':{'type':'array'}});d['outputBindings']={'items':state('items')}
    assert await execution(d).run_graph()=={'items':['seed','child']}

async def test_command_parent_and_static_edges_both_execute():
    d=parallel();child=sample();child['nodes'][1]['config']['authoring']={'command':{'enabled':True,'graph':'parent','destinations':['b']}}
    child['nodes'][1]['writes']={}
    d['nodes'][1].update(type='core.subgraph',config={'graph':child},inputs={},writes={})
    # Return from subgraph also retains its parent static outgoing a->j.
    d['nodes'][3]['config']={'waitFor':['a','b'],'strategy':'any'}
    r=execution(d);assert (await r.run_graph())['b']==3
    parent_ids={args[2] for name,args in r.storage.calls if name=='step_start' and args[3]=='a' and args[-1].get('graphPath')==[]}
    assert any(args[2] in parent_ids for args in r.storage.completed)


async def test_stateless_subgraph_does_not_inherit_sync_durability_bug():
    d=sample();child=sample();d['nodes'][1].update(type='core.subgraph',config={'graph':child,'persistence':'stateless'},inputs={},writes={'value':'/value'})
    assert await execution(d).run_graph()=={'value':5}

async def test_nested_static_breakpoint_is_waiting_at_child_node():
    d=sample();child=sample();child['policy']['authoring']={'checkpoint':'superstep','recursionLimit':50,'waitTimeoutMs':10000,'interruptBefore':['a']}
    d['nodes'][1].update(type='core.subgraph',config={'graph':child},inputs={},writes={'value':'/value'})
    with pytest.raises(RunPaused) as waiting: await execution(d).run_graph()
    item=waiting.value.interrupts[0]
    assert item['graphPath']==['a'] and item['nodeId']=='a' and item['breakpoint']

async def test_business_interrupt_after_static_breakpoint_is_not_relabelled_as_debug():
    from types import SimpleNamespace
    r=execution();names=sorted(r.definition['nodes'],key=lambda n:n['id']);name='eduflow_node_'+str(next(i for i,n in enumerate(names) if n['id']=='a'))
    snap=SimpleNamespace(next=(name,),tasks=(SimpleNamespace(name=name,interrupts=('business',)),),config={'configurable':{'checkpoint_id':'checkpoint'}})
    r.record_breakpoints(r.definition,snap,[],{'a'})
    assert r._static_waits=={}

async def test_nested_conflict_reports_child_field_and_graph_path():
    d=sample();child=parallel();child['nodes'][2]['writes']={'a':'/value'}
    d['nodes'][1].update(type='core.subgraph',config={'graph':child},inputs={},writes={})
    with pytest.raises(ExecutionError) as caught: await execution(d).run_graph()
    assert caught.value.code=='CONCURRENT_STATE_CONFLICT'
    assert caught.value.dto()['graphPath']==['a']
    assert "'a'" in str(caught.value) and 'eduflow_state_' not in str(caught.value)

def test_parent_command_rejects_updates_missing_from_parent_schema():
    d=parallel();child=sample();child['nodes'][1]['config']['authoring']={'command':{'enabled':True,'graph':'parent','destinations':['b']}}
    d['nodes'][1].update(type='core.subgraph',config={'graph':child},inputs={},writes={})
    reg=Registry({'environments':[{'ref':'test','ownerIds':['a']}]});result=compile_definition(d,reg.snapshot(reg.environment('test','a')))
    assert not result['valid'] and any(x['code']=='INVALID_COMMAND' for x in result['diagnostics'])

async def test_fast_child_interrupt_survives_later_parallel_values_event():
    import asyncio
    d=parallel();child=sample()
    child['nodes'][1]['config']['authoring']={'interrupt':{'title':'Child input','schema':obj({'value':{'type':'number'}}),'resumeWrites':{'value':'value'}}}
    d['nodes'][1].update(type='core.subgraph',config={'graph':child},inputs={},writes={'a':'/value'})
    run=execution(d);original=run.execute
    async def delayed(node,state):
        if node['id']=='b' and run.definition is run.root_definition:await asyncio.sleep(.08)
        return await original(node,state)
    run.execute=delayed
    with pytest.raises(RunPaused) as waiting:await run.run_graph()
    assert waiting.value.interrupts and waiting.value.interrupts[0]['graphPath']==['a']
    assert not any(i.get('breakpoint') for i in waiting.value.interrupts)
