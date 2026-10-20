"""Independent P5 locked-SDK probes, no product/DB/provider I/O."""
from pathlib import Path as ArtifactPath
ArtifactPath("artifacts/workflow/checks").mkdir(parents=True,exist_ok=True)
ArtifactPath("artifacts/workflow/acceptance/reports").mkdir(parents=True,exist_ok=True)
import asyncio
import copy
import importlib.metadata
import json
import operator
from pathlib import Path
from typing import Annotated, TypedDict

from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.base import create_checkpoint
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from langgraph.store.memory import InMemoryStore
from langgraph.types import Command, RetryPolicy, interrupt


class State(TypedDict, total=False):
    values: Annotated[list, operator.add]
    number: int
    answer: str


def cfg(name):
    return {'configurable': {'thread_id': name}}


def basic(saver=None):
    return (StateGraph(State).add_node('a', lambda s: {'values': ['a'], 'number': s.get('number', 0)+1})
            .add_node('b', lambda s: {'values': ['b'], 'answer': str(s['number'])})
            .add_edge(START, 'a').add_edge('a', 'b').add_edge('b', END).compile(checkpointer=saver))


async def main():
    evidence = {'sdk': importlib.metadata.version('langgraph'),
                'evidenceLayer': 'Native installed SDK, InMemorySaver/Store and fake model; no product/DB/paid network',
                'cases': []}

    async def record(cid, fn):
        try:
            detail = await fn()
            evidence['cases'].append({'id': cid, 'passed': True, 'detail': detail})
        except Exception as e:
            evidence['cases'].append({'id': cid, 'passed': False, 'error': type(e).__name__+': '+str(e)})

    async def multimode():
        async def a(s):
            get_stream_writer()({'progress': 1})
            await asyncio.sleep(.005)
            return {'values': ['a']}
        g = StateGraph(State).add_node('a', a).add_edge(START, 'a').add_edge('a', END).compile()
        events = [e async for e in g.astream({'values': []}, stream_mode=['custom', 'updates', 'values'], version='v2')]
        assert all(isinstance(e, dict) and set(('type','ns','data')) <= set(e) for e in events)
        modes = [e['type'] for e in events]
        assert set(modes) == {'values','custom','updates'}
        assert any(e['type']=='custom' and e['data']=={'progress':1} for e in events)
        return {'events': events, 'observation': 'v2 unifies type/ns/data; custom precedes successful update and is not commit authority'}
    await record('C01-multimode-v2-envelope', multimode)

    async def subgraphs():
        def leaf(s): get_stream_writer()({'leaf': True});return {'values':['leaf']}
        child=StateGraph(State).add_node('leaf',leaf).add_edge(START,'leaf').add_edge('leaf',END).compile()
        g=StateGraph(State).add_node('child',child).add_edge(START,'child').add_edge('child',END).compile()
        events=[e async for e in g.astream({'values':[]},stream_mode=['custom','updates'],subgraphs=True,version='v2')]
        assert any(e['ns'] and e['type']=='custom' for e in events)
        assert any(not e['ns'] and e['type']=='updates' for e in events)
        return {'events':events,'observation':'child namespace includes invocation identity; root and child updates are separate'}
    await record('C01-subgraph-stream-namespace',subgraphs)

    async def retries():
        calls=[]
        async def a(s,runtime:Runtime):
            n=runtime.execution_info.node_attempt;calls.append(n)
            get_stream_writer()({'attempt':n,'partial':'half'})
            if n==1:raise ConnectionError('retry')
            return {'answer':'complete'}
        g=StateGraph(State).add_node('a',a,retry_policy=RetryPolicy(max_attempts=2,initial_interval=.001,jitter=False)).add_edge(START,'a').add_edge('a',END).compile()
        events=[e async for e in g.astream({},stream_mode=['custom','updates'],version='v2')]
        custom=[e['data']['attempt'] for e in events if e['type']=='custom']
        assert calls==custom==[1,2]
        assert len([e for e in events if e['type']=='updates'])==1
        return {'events':events,'observation':'custom from failed attempts remains observable; SDK does not retract it'}
    await record('C01-failed-attempt-custom-not-retracted',retries)

    async def business_interrupt():
        def a(s):get_stream_writer()({'beforeWait':True});return {'answer':str(interrupt('confirm'))}
        g=StateGraph(State).add_node('a',a).add_edge(START,'a').add_edge('a',END).compile(checkpointer=InMemorySaver())
        c=cfg('p5-native-interrupt')
        events=[e async for e in g.astream({},c,stream_mode=['custom','updates'],version='v2')]
        state=await g.aget_state(c);iid=state.interrupts[0].id
        continued=[e async for e in g.astream(Command(resume={iid:False}),c,stream_mode=['custom','updates'],version='v2')]
        assert sum(e['type']=='custom' for e in events+continued)==2
        assert (await g.aget_state(c)).values['answer']=='False'
        return {'first':events,'resumed':continued,'observation':'interrupt resumes by re-entering body; progress before interrupt can recur'}
    await record('C01-interrupt-progress-reentry',business_interrupt)

    async def messages():
        model=FakeListChatModel(responses=['hello'],sleep=.003)
        async def a(s):
            result=await model.ainvoke([HumanMessage(content='say hello')])
            return {'answer':result.content}
        g=StateGraph(State).add_node('a',a).add_edge(START,'a').add_edge('a',END).compile()
        events=[e async for e in g.astream({},stream_mode=['messages','updates'],version='v2')]
        chunks=[e['data'][0].content for e in events if e['type']=='messages']
        metadata=[e['data'][1] for e in events if e['type']=='messages']
        assert ''.join(chunks)=='hello' and len(chunks)>1
        assert all(m.get('langgraph_node')=='a' for m in metadata)
        return {'chunks':chunks,'metadata':metadata,'eventTypes':[e['type'] for e in events],
                'observation':'fake model verifies SDK messages interception only, not provider network streaming'}
    await record('C01-model-message-chunks',messages)

    async def thread_rounds():
        g=basic(InMemorySaver());c=cfg('p5-native-turns')
        first=await g.ainvoke({'values':[],'number':1},c)
        second=await g.ainvoke({'values':['input2']},c)
        assert first['number']==2 and second['number']==3 and second['values']==['a','b','input2','a','b']
        return {'first':first,'second':second,'observation':'new non-None input on completed thread starts entry again, merges existing channels using reducers'}
    await record('C01-thread-next-input-uses-existing-channels',thread_rounds)

    async def history_update():
        g=basic(InMemorySaver());c=cfg('p5-native-history')
        await g.ainvoke({'values':[],'number':1},c)
        history=[s async for s in g.aget_state_history(c)]
        source=next(s for s in history if s.next==('b',))
        before=copy.deepcopy(source.values)
        changed=await g.aupdate_state(source.config,{'number':10,'values':['edit']},as_node='a')
        old=await g.aget_state(source.config);draft=await g.aget_state(changed)
        assert old.values==before and draft.next==('b',) and draft.values['number']==10
        final=await g.ainvoke(None,changed)
        assert final['answer']=='10' and final['values']==['a','edit','b']
        return {'oldId':source.config['configurable']['checkpoint_id'],'newId':changed['configurable']['checkpoint_id'],
                'old':old.values,'draft':draft.values,'next':draft.next,'final':final,
                'observation':'update creates new same-thread checkpoint and changes next task as if node emitted patch; does not mutate selected old checkpoint'}
    await record('C02-historical-update-original-immutable',history_update)

    async def copy_same_thread():
        g=basic(InMemorySaver());c=cfg('p5-native-copy')
        await g.ainvoke({'values':[],'number':1},c)
        source=await anext(s async for s in g.aget_state_history(c) if s.next==('b',))
        copied=await g.aupdate_state(source.config,None,as_node='__copy__')
        draft=await g.aget_state(copied)
        assert copied['configurable']['thread_id']==c['configurable']['thread_id']
        assert copied['configurable']['checkpoint_id']!=source.config['configurable']['checkpoint_id']
        assert draft.values==source.values and draft.next==source.next
        return {'source':source.config,'copy':copied,'next':draft.next,'observation':'SDK __copy__ forks checkpoint inside original thread, not into a new product Thread'}
    await record('C02-copy-is-same-thread-fork',copy_same_thread)

    async def cross_thread_not_automatic():
        g=basic(InMemorySaver());c=cfg('p5-native-source')
        await g.ainvoke({'values':[],'number':3},c)
        source=await g.aget_state(c)
        other=copy.deepcopy(source.config);other['configurable']['thread_id']='p5-native-other'
        empty=await g.aget_state(other)
        assert empty.values=={} and empty.next==()
        return {'newThreadValues':empty.values,'observation':'changing thread_id while retaining checkpoint_id does not copy a checkpoint'}
    await record('C02-new-thread-id-does-not-clone',cross_thread_not_automatic)

    async def official_saver_clone():
        saver=InMemorySaver();calls=[]
        def a(s,runtime:Runtime):calls.append(['a',runtime.execution_info.task_id]);return {'number':s['number']+1,'values':['a']}
        def b(s,runtime:Runtime):calls.append(['b',runtime.execution_info.task_id]);return {'answer':str(s['number']),'values':['b']}
        g=StateGraph(State).add_node('a',a).add_node('b',b).add_edge(START,'a').add_edge('a','b').add_edge('b',END).compile(checkpointer=saver)
        await g.ainvoke({'number':3,'values':[]},cfg('p5-native-clone-source'))
        history=[s async for s in g.aget_state_history(cfg('p5-native-clone-source'))]
        source=next(s for s in history if s.next==('b',));item=await saver.aget_tuple(source.config)
        cloned=create_checkpoint(copy.deepcopy(item.checkpoint),None,item.metadata['step'])
        target={'configurable':{'thread_id':'p5-native-clone-target','checkpoint_ns':''}}
        branch=await saver.aput(target,cloned,{**item.metadata,'source':'fork'},cloned['channel_versions'])
        state=await g.aget_state(branch)
        assert state.values==source.values and state.next==source.next
        previous_calls=len(calls);out=await g.ainvoke(None,branch)
        assert [x[0] for x in calls[previous_calls:]]==['b'] and out['answer']=='4'
        assert calls[-1][1]!=calls[1][1]
        return {'branch':branch,'output':out,'taskIds':calls,'observation':'official saver+new checkpoint id+all channel versions clones basic channels; this probe excludes pending writes, nested scopes and product receipts, which need separate product handling'}
    await record('C02-controlled-official-saver-cross-thread-clone',official_saver_clone)

    async def bulk_updates():
        g=basic(InMemorySaver());c=cfg('p5-native-bulk')
        await g.ainvoke({'values':[],'number':1},c)
        source=await anext(s async for s in g.aget_state_history(c) if s.next==('b',))
        result=await g.abulk_update_state(source.config,[[({'values':['x'],'number':5},'a',None)],[({'values':['y'],'number':6},'a',None)]])
        snapshot=await g.aget_state(result)
        assert snapshot.values['values']==['a','x','y'] and snapshot.values['number']==6 and snapshot.next==('b',)
        return {'state':snapshot.values,'next':snapshot.next,'observation':'bulk applies sequential supersteps and reducers; it is not a business-state replacement'}
    await record('C02-bulk-update-reducer-supersteps',bulk_updates)

    async def bulk_failure():
        g=basic(InMemorySaver());c=cfg('p5-native-bulk-partial')
        await g.ainvoke({'values':[],'number':1},c);old=await g.aget_state(c)
        error=None
        try:await g.abulk_update_state(old.config,[[({'number':7},'a',None)],[({'values':99},'a',None)]])
        except Exception as e:error=type(e).__name__+': '+str(e)
        latest=await g.aget_state(c)
        assert error and latest.values['number']==7 and latest.config!=old.config
        return {'error':error,'old':old.values,'latestAfterFailure':latest.values,
                'observation':'SDK bulk is not all-or-nothing across supersteps; first checkpoint survives later reducer TypeError. Product needs prevalidation plus transaction or isolated resumable draft'}
    await record('C02-bulk-failure-leaves-earlier-supersteps',bulk_failure)

    async def no_saver():
        g=basic()
        try:await g.abulk_update_state(cfg('none'),[[({'number':1},'a',None)]])
        except ValueError as e:return {'error':type(e).__name__,'message':str(e)}
        raise AssertionError('bulk without saver unexpectedly accepted')
    await record('C02-bulk-requires-checkpointer',no_saver)

    async def store_runtime():
        store=InMemoryStore()
        async def a(s,runtime:Runtime):
            ns=(runtime.context['owner'],'memory')
            item=await runtime.store.aget(ns,'total');n=(item.value['number'] if item else 0)+s['number']
            await runtime.store.aput(ns,'total',{'number':n})
            return {'number':n}
        g=StateGraph(State,context_schema=dict).add_node('a',a).add_edge(START,'a').add_edge('a',END).compile(store=store,checkpointer=InMemorySaver())
        first=await g.ainvoke({'number':2},cfg('store-a'),context={'owner':'A'})
        second=await g.ainvoke({'number':3},cfg('store-b'),context={'owner':'A'})
        third=await g.ainvoke({'number':4},cfg('store-c'),context={'owner':'B'})
        assert first['number']==2 and second['number']==5 and third['number']==4
        return {'outputs':[first,second,third],'observation':'Store supports cross-thread persistence only according to caller namespaces; owner isolation is product responsibility, InMemoryStore not durable'}
    await record('C02-runtime-store-cross-thread-and-explicit-scope',store_runtime)

    async def store_blind_write():
        store=InMemoryStore();ns=('owner','scope')
        await store.aput(ns,'key',{'version':1,'value':'old'})
        a=await store.aget(ns,'key');b=await store.aget(ns,'key')
        await store.aput(ns,'key',{'version':a.value['version']+1,'value':'A'})
        await store.aput(ns,'key',{'version':b.value['version']+1,'value':'B'})
        final=await store.aget(ns,'key')
        assert final.value=={'version':2,'value':'B'}
        return {'final':final.value,'supportsTTL':store.supports_ttl,
                'observation':'official generic put does not enforce expected-version CAS; last write wins. Product adapter must add CAS, durable TTL and quotas'}
    await record('C02-store-put-has-no-version-cas',store_blind_write)

    evidence['summary']={'passed':sum(x['passed'] for x in evidence['cases']),'total':len(evidence['cases'])}
    path=Path('artifacts/workflow/checks/langgraph-checkpoints-store.json');path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(evidence,ensure_ascii=False,indent=2,default=str)+'\n')
    print(json.dumps(evidence['summary']))
    assert all(x['passed'] for x in evidence['cases'])


asyncio.run(main())
