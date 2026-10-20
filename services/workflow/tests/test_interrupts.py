"""Response contracts cover false/zero/empty and reject unsafe resume payloads."""
import pytest
from eduflow_workflow.contracts import ExecutionError
from eduflow_workflow.interrupts import interaction_check,response_patch_for,validate_resume
from eduflow_workflow.checkpoints import checkpoint_digest
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from test_contracts import sample


def response_definition(kind='number',extra=None):
    d=sample();spec={'type':kind,**(extra or {})}
    d['state']['schema']['properties']['value']=spec
    n=d['nodes'][1];n['config']['authoring']={'interrupt':{'title':'Confirm value','schema':{'type':'object','properties':{'answer':spec},'required':['answer'],'additionalProperties':False},'resumeWrites':{'answer':'value'}}}
    return d,n

@pytest.mark.parametrize('kind,value',[('number',0),('boolean',False),('array',[]),('string','hello')])
def test_response_preserves_json_values(kind,value):
    d,n=response_definition(kind)
    interaction_check(d,n)
    assert response_patch_for(d,n,{'answer':value})=={'value':value}
    thread={'state':{'value':value},'interrupts':[{'id':'opaque-id','nodeId':n['id']}]}
    assert validate_resume(d,thread,{'opaque-id':{'answer':value}}, {'providers':[],'tools':[],'connectors':[]})

@pytest.mark.parametrize('response',[{}, {'answer':'  '},{'answer':0},{'answer':'ok','extra':True}])
def test_invalid_response_is_rejected_before_queue(response):
    d,n=response_definition('string',{'minLength':1})
    with pytest.raises(ExecutionError,match='.*') as error:response_patch_for(d,n,response)
    assert error.value.code=='INVALID_INTERRUPT_RESPONSE'

@pytest.mark.parametrize('responses',[{}, {'stale-id':{'answer':3}}, {'id':{'answer':3},'extra-id':{}}])
def test_resume_response_ids_must_match_current_pending_exactly(responses):
    d,n=response_definition();thread={'state':{'value':0},'interrupts':[{'id':'id','nodeId':n['id']}]}
    with pytest.raises(ExecutionError) as error:validate_resume(d,thread,responses,{})
    assert error.value.code=='INTERRUPT_ID_CONFLICT'


def test_checkpoint_hash_preserves_native_sdk_types_and_stable_collection_order():
    serde=JsonPlusSerializer()
    first={'checkpoint':{'barrier':{'A','B'},'channels':[1,False,b'blob']},'metadata':{'step':2,'source':'loop'}}
    reordered={'metadata':{'source':'loop','step':2},'checkpoint':{'channels':[1,False,b'blob'],'barrier':set(['B','A'])}}
    assert checkpoint_digest(serde,first)==checkpoint_digest(serde,reordered)
    for altered in ({'barrier':['A','B'],'channels':[1,False,b'blob']},{'barrier':{'A'},'channels':[1,False,b'blob']},{'barrier':{'A','B'},'channels':[True,0,b'blob']}):
        assert checkpoint_digest(serde,first)!=checkpoint_digest(serde,{**first,'checkpoint':altered})


async def test_resume_preflight_preserves_frozen_variables_but_rechecks_authorization(monkeypatch):
    import copy
    from eduflow_workflow import server
    from eduflow_workflow.registry import Registry
    from eduflow_workflow.compiler import compile_definition
    d,n=response_definition()
    registry=Registry({'environments':[{'ref':'test','ownerIds':['a']}]})
    env=registry.environment('test','a');env.update(variables={'VALUE':3},configurationRevision=1)
    frozen=registry.snapshot(env);compiled=compile_definition(d,frozen)
    current=copy.deepcopy(env);current.update(variables={'VALUE':99},configurationRevision=2)
    monkeypatch.setattr(registry,'environment',lambda ref,owner:copy.deepcopy(current))
    monkeypatch.setattr(server,'registry',registry)
    async def checkpoints(_thread): return None
    monkeypatch.setattr(server,'assert_checkpoints',checkpoints)
    thread={'snapshot':{'environment_ref':'test','environment_revision':env['revision'],'registry_snapshot':frozen,'compile_fingerprint':compiled['compileFingerprint']},'state':{'value':0},'interrupts':[{'id':'id','nodeId':n['id']}]}
    body={'thread':thread,'definition':d,'ownerId':'a','responses':{'id':{'answer':0}}}
    assert await server.resume_validation(body)=={'valid':True}
    current['revision']='authorization-changed'
    with pytest.raises(ExecutionError) as error:await server.resume_validation(body)
    assert error.value.code=='COMPILE_FINGERPRINT_CHANGED'
