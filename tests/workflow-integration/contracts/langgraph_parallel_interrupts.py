"""Native LangGraph parallel and interrupt contract regressions; no product or DB writes."""
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
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command, Send, interrupt


class State(TypedDict):
    results: Annotated[list[str], operator.add]


async def main():
    evidence = {"sdk": importlib.metadata.version("langgraph"), "evidenceLayer": "native SDK with InMemorySaver only", "cases": []}
    async def record(name, body):
        try:
            detail = await body()
            evidence["cases"].append({"id": name, "passed": True, "detail": detail})
        except Exception as e:
            evidence["cases"].append({"id": name, "passed": False, "error": type(e).__name__ + ": " + str(e)})

    async def partial_resume():
        calls = {"a": 0, "b": 0, "join": 0}
        def a(state):
            calls["a"] += 1
            return {"results": ["a:" + str(interrupt({"node": "a"}))]}
        def b(state):
            calls["b"] += 1
            return {"results": ["b:" + str(interrupt({"node": "b"}))]}
        def join(state):
            calls["join"] += 1
            return {"results": ["joined"]}
        builder=StateGraph(State).add_node("a",a).add_node("b",b).add_node("join",join)
        builder.add_edge(START,"a").add_edge(START,"b").add_edge(["a","b"],"join").add_edge("join",END)
        graph=builder.compile(checkpointer=InMemorySaver())
        config={"configurable":{"thread_id":"p3-independent-partial"}}
        first=await graph.ainvoke({"results":[]},config)
        interrupts={item.value["node"]:item.id for item in first["__interrupt__"]}
        initial_checkpoint=(await graph.aget_state(config)).config["configurable"]["checkpoint_id"]
        second=await graph.ainvoke(Command(resume={interrupts["a"]:0}),config)
        second_snapshot=await graph.aget_state(config)
        second_calls=dict(calls)
        assert [item.id for item in second["__interrupt__"]]==[interrupts["b"]]
        assert calls["join"]==0
        third=await graph.ainvoke(Command(resume={interrupts["b"]:False}),config)
        assert third["results"]==["a:0","b:False","joined"]
        assert calls["join"]==1
        return {"interruptIds":interrupts,"firstCheckpoint":initial_checkpoint,"afterPartialCheckpoint":second_snapshot.config["configurable"]["checkpoint_id"],"afterPartialState":second_snapshot.values,"afterPartialTasks":[{"id":t.id,"name":t.name,"interrupts":[i.id for i in t.interrupts],"result":t.result} for t in second_snapshot.tasks],"callsAfterPartial":second_calls,"final":third,"callsFinal":calls}
    await record("C02-partial-parallel-resume",partial_resume)

    async def batch_resume():
        def a(state): return {"results":["a:"+str(interrupt("a"))]}
        def b(state): return {"results":["b:"+str(interrupt("b"))]}
        graph=StateGraph(State).add_node("a",a).add_node("b",b).add_edge(START,"a").add_edge(START,"b").add_edge("a",END).add_edge("b",END).compile(checkpointer=InMemorySaver())
        config={"configurable":{"thread_id":"p3-independent-batch"}}
        first=await graph.ainvoke({"results":[]},config)
        final=await graph.ainvoke(Command(resume={i.id:False if i.value=="a" else [] for i in first["__interrupt__"]}),config)
        assert final["results"]==["a:False","b:[]"]
        return final
    await record("C02-batch-parallel-resume",batch_resume)

    async def nested_resume():
        calls={"outer":0,"inside":0,"root":0}
        def inside(state):
            calls["inside"]+=1
            return {"results":["sub:"+str(interrupt({"node":"inside"}))]}
        child=StateGraph(State).add_node("inside",inside).add_edge(START,"inside").add_edge("inside",END).compile()
        async def outer(state):
            calls["outer"]+=1
            result=await child.ainvoke({"results":[]})
            return {"results":result["results"]}
        def root(state):
            calls["root"]+=1
            return {"results":["root:"+str(interrupt({"node":"root"}))]}
        graph=StateGraph(State).add_node("outer",outer).add_node("root",root).add_edge(START,"outer").add_edge(START,"root").add_edge("outer",END).add_edge("root",END).compile(checkpointer=InMemorySaver())
        config={"configurable":{"thread_id":"p3-independent-nested"}}
        first=await graph.ainvoke({"results":[]},config)
        before=await graph.aget_state(config,subgraphs=True)
        mapping={i.value["node"]:i.id for i in first["__interrupt__"]}
        second=await graph.ainvoke(Command(resume={mapping["inside"]:"ok"}),config)
        assert [i.id for i in second["__interrupt__"]]==[mapping["root"]]
        final=await graph.ainvoke(Command(resume={mapping["root"]:"yes"}),config)
        assert sorted(final["results"])==["root:yes","sub:ok"]
        return {"interruptIds":mapping,"parentTasks":[{"name":t.name,"taskId":t.id,"hasSubState":t.state is not None} for t in before.tasks],"calls":calls,"afterPartialState":{k:v for k,v in second.items() if k!='__interrupt__'},"final":final}
    await record("C03-nested-root-partial-resume",nested_resume)

    async def send_multi():
        class Input(TypedDict):
            results: Annotated[list[str],operator.add]
            items: list[str]
        def route(state): return [Send("worker",{"item":item}) for item in state["items"]]
        def worker(state): return {"results":[str(interrupt(state["item"]))]}
        graph=StateGraph(Input).add_node("worker",worker).add_conditional_edges(START,route).add_edge("worker",END).compile(checkpointer=InMemorySaver())
        config={"configurable":{"thread_id":"p3-independent-send"}}
        first=await graph.ainvoke({"results":[],"items":["x","y"]},config)
        ids={i.value:i.id for i in first["__interrupt__"]}
        assert len(set(ids.values()))==2
        final=await graph.ainvoke(Command(resume={ids["x"]:0,ids["y"]:False}),config)
        empty=await graph.ainvoke({"results":[],"items":[]},{"configurable":{"thread_id":"p3-independent-empty"}})
        assert final["results"]==["0","False"] and empty["results"]==[]
        return {"interruptIds":ids,"final":final,"empty":empty}
    await record("C01-send-instance-identities",send_multi)

    async def command_static():
        def a(state): return Command(update={"results":["a"]},goto="b")
        def b(state): return {"results":["b"]}
        def c(state): return {"results":["c"]}
        graph=StateGraph(State).add_node("a",a).add_node("b",b).add_node("c",c).add_edge(START,"a").add_edge("a","c").add_edge("b",END).add_edge("c",END).compile()
        final=await graph.ainvoke({"results":[]})
        assert sorted(final["results"])==["a","b","c"]
        return final
    await record("C01-command-static-edges-additive",command_static)

    async def barrier_semantics():
        async def build(all_required):
            calls=[]
            def node(name):
                def execute(state):
                    calls.append(name)
                    return {"results":[name]}
                return execute
            builder=StateGraph(State)
            for name in ("a","b","c","join"): builder.add_node(name,node(name))
            builder.add_edge(START,"a").add_edge(START,"b").add_edge("b","c")
            if all_required: builder.add_edge(["a","c"],"join")
            else: builder.add_edge("a","join").add_edge("c","join")
            builder.add_edge("join",END)
            final=await builder.compile().ainvoke({"results":[]})
            return {"calls":calls,"final":final}
        barrier=await build(True)
        separate=await build(False)
        assert barrier["calls"].count("join")==1 and separate["calls"].count("join")==2
        return {"waitAll":barrier,"separateTriggers":separate}
    await record("C01-barrier-vs-separate",barrier_semantics)

    async def defer_semantics():
        calls=[]
        def node(name):
            def execute(state):
                calls.append(name)
                return {"results":[name]}
            return execute
        builder=StateGraph(State)
        for name in ("a","b","c"): builder.add_node(name,node(name))
        builder.add_node("deferred",node("deferred"),defer=True)
        builder.add_edge(START,"a").add_edge(START,"b").add_edge("a","deferred").add_edge("b","c").add_edge("c",END).add_edge("deferred",END)
        final=await builder.compile().ainvoke({"results":[]})
        assert calls[-1]=="deferred" and calls.count("deferred")==1
        return {"calls":calls,"final":final}
    await record("C01-deferred-after-long-branch",defer_semantics)

    async def static_breakpoint():
        calls=[]
        def node(state):
            calls.append("node")
            return {"results":["done"]}
        graph=StateGraph(State).add_node("node",node).add_edge(START,"node").add_edge("node",END).compile(checkpointer=InMemorySaver(),interrupt_before=["node"])
        config={"configurable":{"thread_id":"p3-independent-breakpoint"}}
        first=await graph.ainvoke({"results":[]},config)
        snapshot=await graph.aget_state(config)
        assert not calls and snapshot.next==("node",) and not first.get("__interrupt__")
        final=await graph.ainvoke(None,config)
        assert final["results"]==["done"]
        return {"first":first,"next":snapshot.next,"taskInterrupts":[[i.id for i in t.interrupts] for t in snapshot.tasks],"final":final}
    await record("C01-static-breakpoint-no-dynamic-interrupt",static_breakpoint)

    async def parent_command():
        def jump(state): return Command(graph=Command.PARENT,update={"results":["child"]},goto="destination")
        child=StateGraph(State).add_node("jump",jump).add_edge(START,"jump").add_edge("jump",END).compile()
        def destination(state): return {"results":["destination"]}
        def static(state): return {"results":["static"]}
        graph=StateGraph(State).add_node("child",child).add_node("destination",destination).add_node("static",static).add_edge(START,"child").add_edge("child","static").add_edge("destination",END).add_edge("static",END).compile(checkpointer=InMemorySaver())
        final=await graph.ainvoke({"results":[]},{"configurable":{"thread_id":"p3-independent-parent"}})
        assert sorted(final["results"])==["child","destination","static"]
        return final
    await record("C03-parent-command-additive",parent_command)

    async def persistence_modes():
        observations=[]
        def inside(state): return {"results":[str(interrupt("question"))]}
        for mode in (None,False,True):
            child=StateGraph(State).add_node("inside",inside).add_edge(START,"inside").add_edge("inside",END).compile(checkpointer=mode)
            graph=StateGraph(State).add_node("child",child).add_edge(START,"child").add_edge("child",END).compile(checkpointer=InMemorySaver())
            config={"configurable":{"thread_id":"p3-independent-persistence-"+str(mode)}}
            first=await graph.ainvoke({"results":[]},config)
            old=first["__interrupt__"][0].id
            final=await graph.ainvoke(Command(resume={old:"yes"}),config)
            after=[i.id for i in final.get("__interrupt__",[])]
            if mode is False: assert final["results"]==[] and after and after[0]!=old
            else: assert final["results"]==["yes"] and not after
            observations.append({"checkpointerFlag":mode,"firstInterrupt":old,"afterResumeInterrupts":after,"results":final["results"]})
        return {"modes":observations,"productRequirement":"Stateless child must reject nested interrupts/breakpoints before execution because stable resume is unavailable"}
    await record("C03-subgraph-persistence-modes",persistence_modes)

    async def child_static_breakpoint():
        from langgraph.errors import GraphInterrupt
        from langgraph.config import get_config
        captured=[]
        def inside(state): return {"results":["child-done"]}
        child=StateGraph(State).add_node("inside",inside).add_edge(START,"inside").add_edge("inside",END).compile(interrupt_before=["inside"])
        async def outer(state):
            try:return await child.ainvoke(state)
            except GraphInterrupt as error:
                config=get_config();config={**config,"configurable":{**config["configurable"]}}
                config["configurable"].pop("checkpoint_id",None)
                snapshot=await child.aget_state(config)
                captured.append({"dynamicInterruptCount":len(error.args[0]),"namespace":config["configurable"]["checkpoint_ns"],"next":snapshot.next,"checkpointId":snapshot.config["configurable"]["checkpoint_id"]})
                raise
        graph=StateGraph(State).add_node("child",outer).add_edge(START,"child").add_edge("child",END).compile(checkpointer=InMemorySaver())
        config={"configurable":{"thread_id":"p3-independent-child-static"}}
        first=await graph.ainvoke({"results":[]},config)
        parent=await graph.aget_state(config)
        final=await graph.ainvoke(None,config)
        assert captured[0]["next"]==("inside",) and captured[0]["dynamicInterruptCount"]==0 and parent.next==("child",) and final["results"]==["child-done"]
        return {"captured":captured,"first":first,"parentNext":parent.next,"final":final}
    await record("C03-child-static-breakpoint-propagation",child_static_breakpoint)

    out=Path('artifacts/workflow/checks')/'langgraph-parallel-interrupts.json'
    out.write_text(json.dumps(evidence,ensure_ascii=False,indent=2,default=str)+'\n')
    print(json.dumps(evidence,ensure_ascii=False,indent=2,default=str))
    assert all(case['passed'] for case in evidence['cases'])

if __name__=='__main__': asyncio.run(main())
