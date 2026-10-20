"""Independent locked-SDK P4 probes. InMemorySaver/cache only; no product or DB I/O."""
from pathlib import Path as ArtifactPath
ArtifactPath("artifacts/workflow/checks").mkdir(parents=True,exist_ok=True)
ArtifactPath("artifacts/workflow/acceptance/reports").mkdir(parents=True,exist_ok=True)
import asyncio
import importlib.metadata
import json
import operator
from pathlib import Path
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime
from langgraph.types import RetryPolicy, CachePolicy, Command, interrupt, Overwrite
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.cache.memory import InMemoryCache
from langgraph.errors import NodeTimeoutError, InvalidUpdateError, NodeError

class State(TypedDict, total=False):
    values: Annotated[list, operator.add]
    result: str

async def main():
    evidence={'sdk':importlib.metadata.version('langgraph'),'evidenceLayer':'native SDK/InMemorySaver/InMemoryCache; no product, Worker, database or sandbox','cases':[]}
    async def record(cid,fn):
        try: evidence['cases'].append({'id':cid,'passed':True,'detail':await fn()})
        except Exception as e: evidence['cases'].append({'id':cid,'passed':False,'error':type(e).__name__+': '+str(e)})

    async def retries():
        calls=[]
        async def work(state,runtime:Runtime):
            info=runtime.execution_info;calls.append({'task':info.task_id,'attempt':info.node_attempt})
            if len(calls)<3:raise ConnectionError('temporary')
            return {'values':['ok']}
        g=StateGraph(State).add_node('work',work,retry_policy=RetryPolicy(max_attempts=3,initial_interval=.001,jitter=False)).add_edge(START,'work').add_edge('work',END).compile()
        out=await g.ainvoke({'values':[]})
        assert out['values']==['ok'] and [c['attempt'] for c in calls]==[1,2,3] and len({c['task'] for c in calls})==1
        return {'calls':calls,'output':out}
    await record('C01-retry-same-task-increment-attempt',retries)

    async def handler_after_retry():
        calls=[]
        async def work(state):calls.append('work');raise ConnectionError('temporary')
        async def handler(state):calls.append('handler');return {'result':'recovered'}
        g=StateGraph(State).add_node('work',work,retry_policy=RetryPolicy(max_attempts=2,initial_interval=.001,jitter=False),error_handler=handler).add_edge(START,'work').add_edge('work',END).compile()
        out=await g.ainvoke({})
        assert calls==['work','work','handler'] and out['result']=='recovered'
        return {'calls':calls,'output':out}
    await record('C01-error-handler-after-retry-exhausted',handler_after_retry)

    async def interrupt_policy():
        calls=[]
        def work(state,runtime:Runtime):calls.append(['work',runtime.execution_info.node_attempt]);return {'result':str(interrupt('confirm'))}
        def handler(state):calls.append(['handler']);return {'result':'incorrect'}
        g=StateGraph(State).add_node('work',work,retry_policy=RetryPolicy(max_attempts=3,retry_on=lambda e:True,initial_interval=.001,jitter=False),error_handler=handler).add_edge(START,'work').add_edge('work',END).compile(checkpointer=InMemorySaver())
        cfg={'configurable':{'thread_id':'p4-native-interrupt'}}
        first=await g.ainvoke({},cfg);out=await g.ainvoke(Command(resume={first['__interrupt__'][0].id:False}),cfg)
        assert calls==[['work',1],['work',1]] and out['result']=='False'
        return {'calls':calls,'output':out,'observation':'resume re-enters body with node_attempt=1; interrupt bypasses retry and handler'}
    await record('C01-interrupt-bypasses-retry-handler',interrupt_policy)

    async def timeout_retry():
        calls=[];clean=[]
        async def work(state,runtime:Runtime):
            a=runtime.execution_info.node_attempt;calls.append(a)
            try:await asyncio.sleep(.06)
            finally:clean.append(a)
            return {'result':'too late'}
        async def handler(state):return {'result':'timed out'}
        g=StateGraph(State).add_node('work',work,timeout=.01,retry_policy=RetryPolicy(max_attempts=2,retry_on=NodeTimeoutError,initial_interval=.001,jitter=False),error_handler=handler).add_edge(START,'work').add_edge('work',END).compile()
        out=await g.ainvoke({})
        assert calls==[1,2] and clean==[1,2] and out['result']=='timed out'
        return {'calls':calls,'cleanup':clean,'output':out,'observation':'async timeout cancels cooperatively; does not prove isolation for CPU-bound code'}
    await record('C01-timeout-cancel-retry-handler',timeout_retry)

    async def handler_failure():
        calls=[]
        def work(state):calls.append('work');raise ValueError('bad input')
        def handler(state):calls.append('handler');raise ValueError('handler failed')
        g=StateGraph(State).add_node('work',work,error_handler=handler).add_edge(START,'work').add_edge('work',END).compile()
        try:await g.ainvoke({})
        except ValueError as e:assert str(e)=='handler failed'
        else:raise AssertionError('failed handler was swallowed')
        assert calls==['work','handler'];return {'calls':calls}
    await record('C01-error-handler-fails-once',handler_failure)

    async def handler_static_successor():
        calls=[]
        def work(state):calls.append('work');raise ValueError('bad')
        def handler(state,error:NodeError):
            calls.append({'handlerNode':error.node,'sourceError':type(error.error).__name__})
            return {'result':'recovered'}
        def after(state):calls.append('after');return {'result':'after'}
        g=StateGraph(State).add_node('work',work,error_handler=handler).add_node('after',after).add_edge(START,'work').add_edge('work','after').add_edge('after',END).compile()
        out=await g.ainvoke({})
        assert out['result']=='recovered' and 'after' not in calls
        return {'calls':calls,'output':out,'observation':'handler receives original exception via NodeError; handler State update does not activate failed-node static successor'}
    await record('C01-handler-nodeerror-and-static-successor',handler_static_successor)

    async def cache_context():
        calls=[]
        def work(state,runtime:Runtime):calls.append(runtime.context['owner']);return {'result':runtime.context['owner']}
        g=StateGraph(State,context_schema=dict).add_node('work',work,cache_policy=CachePolicy(ttl=1)).add_edge(START,'work').add_edge('work',END).compile(cache=InMemoryCache())
        first=await g.ainvoke({},context={'owner':'A'});second=await g.ainvoke({},context={'owner':'B'})
        assert first['result']==second['result']=='A' and calls==['A']
        await asyncio.sleep(1.05);third=await g.ainvoke({},context={'owner':'B'})
        assert third['result']=='B' and calls==['A','B']
        return {'calls':calls,'first':first,'secondContextB':second,'afterTTL':third,'observation':'default cache key omits Runtime.context and caches node writes; product must supply authorization-safe namespace/key'}
    await record('C01-default-cache-omits-context-and-TTL',cache_context)

    async def context_isolation():
        calls=[]
        async def work(state,runtime:Runtime):
            owner=runtime.context['owner'];await asyncio.sleep(.01)
            assert runtime.context['owner']==owner;calls.append(owner);return {'result':owner}
        g=StateGraph(State,context_schema=dict).add_node('work',work).add_edge(START,'work').add_edge('work',END).compile()
        out=await asyncio.gather(g.ainvoke({},context={'owner':'A'}),g.ainvoke({},context={'owner':'B'}))
        assert [x['result'] for x in out]==['A','B'];return {'calls':calls,'output':out}
    await record('C01-concurrent-runtime-context-isolation',context_isolation)

    async def overwrite():
        g=StateGraph(State).add_node('work',lambda s:{'values':Overwrite(['replacement'])}).add_edge(START,'work').add_edge('work',END).compile()
        out=await g.ainvoke({'values':['seed']});assert out['values']==['replacement'];return out
    await record('C01-overwrite-bypasses-reducer',overwrite)

    async def overwrite_conflict():
        g=StateGraph(State).add_node('a',lambda s:{'values':Overwrite(['a'])}).add_node('b',lambda s:{'values':Overwrite(['b'])}).add_edge(START,'a').add_edge(START,'b').add_edge('a',END).add_edge('b',END).compile()
        try:await g.ainvoke({'values':[]})
        except InvalidUpdateError as e:return {'error':type(e).__name__,'message':str(e)}
        raise AssertionError('concurrent overwrite accepted')
    await record('C01-concurrent-overwrite-conflict',overwrite_conflict)

    async def resume_retry_reset():
        calls=[]
        async def work(state,runtime:Runtime):calls.append(runtime.execution_info.node_attempt);raise ConnectionError('down')
        g=StateGraph(State).add_node('work',work,retry_policy=RetryPolicy(max_attempts=2,initial_interval=.001,jitter=False)).add_edge(START,'work').add_edge('work',END).compile(checkpointer=InMemorySaver())
        cfg={'configurable':{'thread_id':'p4-native-retry-resume'}}
        for payload in ({},None):
            try:await g.ainvoke(payload,cfg)
            except ConnectionError:pass
        assert calls==[1,2,1,2];return {'calls':calls,'observation':'SDK retries reset on invocation/resume; product cumulative task-attempt gate is required'}
    await record('C01-retry-attempts-reset-across-resume',resume_retry_reset)
    async def message_delete():
        from langgraph.graph.message import add_messages
        from langchain_core.messages import HumanMessage, RemoveMessage
        class M(TypedDict):
            messages: Annotated[list,add_messages]
        g=StateGraph(M).add_node('delete',lambda s:{'messages':[RemoveMessage(id='old')]}).add_edge(START,'delete').add_edge('delete',END).compile()
        out=await g.ainvoke({'messages':[HumanMessage(id='old',content='hello')]})
        assert out['messages']==[]
        return {'remainingMessages':0,'observation':'official add_messages accepts RemoveMessage with stable existing message id'}
    await record('C01-message-delete-native',message_delete)

    async def io_channels():
        class PublicIn(TypedDict):incoming:str
        class PublicOut(TypedDict):result:str
        class Internal(TypedDict):incoming:str;private:str;result:str
        def work(s):return {'private':'server internal','result':s['incoming']+'!'}
        g=StateGraph(Internal,input_schema=PublicIn,output_schema=PublicOut).add_node('work',work).add_edge(START,'work').add_edge('work',END).compile()
        out=await g.ainvoke({'incoming':'public','private':'client attempt'})
        assert out=={'result':'public!'}
        return {'output':out,'observation':'StateGraph explicit input/output schemas constrain projected channels; they do not replace product auth or JSON Schema validation'}
    await record('C01-input-output-channel-projection',io_channels)

    async def defer_retry():
        calls=[]
        async def a(s,runtime:Runtime):
            calls.append('a'+str(runtime.execution_info.node_attempt))
            if runtime.execution_info.node_attempt<2:raise ConnectionError('retry')
            return {'values':['a']}
        async def b(s):calls.append('b');return {'values':['b']}
        def final(s):calls.append('final');assert sorted(s['values'])==['a','b'];return {'result':'done'}
        g=StateGraph(State).add_node('a',a,retry_policy=RetryPolicy(max_attempts=2,initial_interval=.001,jitter=False)).add_node('b',b).add_node('final',final,defer=True).add_edge(START,'a').add_edge(START,'b').add_edge('a','final').add_edge('b','final').add_edge('final',END).compile()
        out=await g.ainvoke({'values':[]})
        assert calls[-1]=='final' and out['result']=='done'
        return {'calls':calls,'output':out}
    await record('C01-retry-parallel-defer',defer_retry)

    evidence['summary']={'passed':sum(x['passed'] for x in evidence['cases']),'total':len(evidence['cases'])}
    path=Path('artifacts/workflow/checks/langgraph-execution-policies.json');path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(evidence['summary']));assert all(x['passed'] for x in evidence['cases'])

asyncio.run(main())
