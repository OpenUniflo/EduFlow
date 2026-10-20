"""Meaningful P5 boundaries; Live SQL and browser acceptance remain independent."""
import pytest
from langchain_core.messages import AIMessageChunk
from eduflow_workflow.session_memory_history import stream_model,namespace,validate_request,scope_definition,HistorySaver
from eduflow_workflow.contracts import ExecutionError
from test_runtime import execution
from test_contracts import sample

class Model:
    def __init__(self,chunks,fail=False):self.chunks=chunks;self.fail=fail
    async def astream(self,messages,**options):
        for text in self.chunks:yield AIMessageChunk(content=text,id='message')
        if self.fail:raise RuntimeError('controlled provider failure')
        yield AIMessageChunk(content='',id='message',response_metadata={'finish_reason':'stop'})

async def test_real_sdk_chunks_accumulate_and_end_snapshot_stays_bounded():
    run=execution();text='x'*20000
    response=await stream_model(run,Model([text[:10000],text[10000:]]),[])
    assert response.content==text
    deltas=[p for k,p in run.storage.events if k=='node.output.delta']
    end=[p for k,p in run.storage.events if k=='node.output.end'][-1]
    assert ''.join(p['text'] for p in deltas)==text
    assert end['finalFromStep'] and len(str(end))<1000
    assert len({p['streamId'] for p in deltas})==1

async def test_split_secret_never_enters_published_delta(monkeypatch):
    run=execution();secret='sensitive-managed-token-0001'
    run.env['providers']=[{'ref':'test','secretRef':'WORKFLOW_P5_TEST_SECRET'}]
    monkeypatch.setenv('WORKFLOW_P5_TEST_SECRET',secret)
    with pytest.raises(ExecutionError) as caught:await stream_model(run,Model(['prefix '+secret[:9],secret[9:]]),[])
    assert caught.value.code=='SECRET_IN_EXECUTION_DATA'
    assert secret not in str(run.storage.events)
    assert secret[:9] not in str(run.storage.events)

async def test_failed_stream_is_explicitly_interrupted_and_no_computed_end():
    run=execution()
    with pytest.raises(RuntimeError):await stream_model(run,Model(['part'*200],True),[])
    ends=[p for k,p in run.storage.events if k=='node.output.end']
    assert ends[-1]['status']=='interrupted' and not any(e['status']=='computed' for e in ends)

@pytest.mark.parametrize('body,reason,code',[
    ('unfinished','length','MODEL_OUTPUT_TRUNCATED'),
    ('','length','MODEL_OUTPUT_TRUNCATED'),
    ('','stop','EMPTY_MODEL_RESPONSE'),
    ('   ','stop','EMPTY_MODEL_RESPONSE'),
    ('blocked','content_filter','MODEL_RESPONSE_INCOMPLETE'),
    ('partial',None,'MODEL_RESPONSE_INCOMPLETE'),
])
async def test_incomplete_sdk_response_cannot_be_computed_or_committed(body,reason,code):
    class FinishedModel:
        async def astream(self,messages,**options):
            yield AIMessageChunk(content=body,id='message',response_metadata={'finish_reason':reason})
    run=execution()
    with pytest.raises(ExecutionError) as caught:await stream_model(run,FinishedModel(),[])
    assert caught.value.code==code
    assert not run.storage.completed and run.state_version==0
    ends=[p for k,p in run.storage.events if k=='node.output.end']
    assert ends[-1]['status']=='interrupted' and not any(e['status']=='computed' for e in ends)

async def test_valid_sdk_tool_call_may_have_no_visible_text():
    class ToolModel:
        async def astream(self,messages,**options):
            yield AIMessageChunk(content='',id='message',tool_call_chunks=[{'name':'lookup','args':'{"value":1}','id':'call-1','index':0}],response_metadata={'finish_reason':'tool_calls'})
    run=execution();response=await stream_model(run,ToolModel(),[])
    assert response.tool_calls[0]['args']=={'value':1}
    assert [p for k,p in run.storage.events if k=='node.output.end'][-1]['status']=='computed'

async def test_stream_output_limit_stops_before_unbounded_publication():
    run=execution()
    with pytest.raises(ExecutionError) as caught:await stream_model(run,Model(['x'*65537]),[])
    assert caught.value.code=='MODEL_OUTPUT_TOO_LARGE'
    assert not any(k=='node.output.delta' for k,p in run.storage.events)

@pytest.mark.parametrize('body',[{}, {'ownerId':'a','action':'prepare','threadId':'bad','checkpointId':'x','idempotencyKey':'k'}, {'ownerId':'a','action':'threads','workflowId':'x','privilege':'admin'}])
def test_p5_request_rejects_forged_fields_or_invalid_ids(body):
    with pytest.raises(ExecutionError):validate_request(body)

def test_namespace_isolates_owner_environment_and_shared_vs_workflow():
    common=('a','production','workflow')
    private=namespace(*common,'workflow','prefs')
    assert private!=namespace('b','production','workflow','workflow','prefs')
    assert private!=namespace('a','test','workflow','workflow','prefs')
    assert private!=namespace(*common,'shared','prefs')
    assert namespace('a','env.name','w','shared','x')!=namespace('a','env','w','shared','x')

def test_history_version_policy_matches_product_coordinator():
    # Official default strings cannot be mixed with already persisted integer channels.
    assert HistorySaver.get_next_version(None,4,None)==5

def test_scope_projection_does_not_accept_a_non_subgraph_namespace():
    with pytest.raises(ExecutionError):scope_definition(sample(),'eduflow_node_0:forged')

async def test_configurable_custom_progress_uses_actual_sdk_execution():
    d=sample();d['nodes'][1].update(type='core.progress',config={'message':'阶段处理完成','percent':35},inputs={},writes={'value':'/percent'})
    run=execution(d)
    assert await run.run_graph()=={'value':35}
    assert len(run.storage.completed)==3

@pytest.mark.skipif(__import__('os').environ.get('WORKFLOW_TEST_LOCAL_DB')!='1',reason='Explicit Local DB opt-in')
async def test_store_ttl_is_invisible_before_watchdog_and_cas_restarts_at_zero():
    import json,uuid
    from pathlib import Path
    from eduflow_workflow.session_memory_history import connection,memory_get,memory_write,expire_memory
    from langgraph.store.postgres.aio import AsyncPostgresStore
    settings=json.loads(Path('.acceptance/workflow-v2-m1/runtime-private.json').read_text())
    ns=namespace(str(uuid.uuid4()),'ttl-test','rollback-only','workflow','test')
    async with connection(settings['databaseUrl']) as conn:
        async with conn.transaction() as txn:
            await AsyncPostgresStore(conn).aput(ns,'expired',{'version':3,'data':False,'deleted':False},ttl=1)
            await conn.execute("update workflow_memory.store set expires_at=now()-interval '1 second' where prefix=%s",('.'.join(ns),))
            assert await memory_get(conn,ns,'expired')=={'found':False,'value':None,'version':0}
            assert (await memory_write(conn,ns,'expired',0,0,'put',1))['version']==1
            await conn.execute("update workflow_memory.store set expires_at=now()-interval '1 second' where prefix=%s",('.'.join(ns),))
            await expire_memory(conn,ns)
            assert await AsyncPostgresStore(conn).asearch(ns,refresh_ttl=False)==[]
            txn.force_rollback=True
