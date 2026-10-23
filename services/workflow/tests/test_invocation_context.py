"""Interleaved node calls must preserve event ownership and fail stale commits."""
import asyncio
import copy

import pytest
from eduflow_workflow.contracts import ExecutionError
from test_runtime import MemoryStorage, execution


def tool_node(run, node_id):
    node = copy.deepcopy(run.definition['nodes'][1])
    node.update(id=node_id, type='core.tool', typeVersion=2, config={'toolRef': 'f'},
                inputs={'value': {'source': 'literal', 'value': node_id}}, writes={})
    return node


def registered_tool():
    return {'ref': 'f', 'name': 'identity', 'adapter': 'function', 'version': 1,
            'operationRef': 'core.identity', 'inputSchema': {'type': 'object'},
            'outputSchema': {'type': 'object'}, 'sideEffect': 'none'}


async def test_interleaved_tool_events_and_commits_keep_their_own_step(monkeypatch):
    run = execution(tools=[registered_tool()])
    entered = {name: asyncio.Event() for name in ('slow', 'fast')}
    release = asyncio.Event()

    async def invoke(tool, env, arguments, timeout):
        name = arguments['value']
        entered[name].set()
        if name == 'slow':
            await release.wait()
        return arguments

    monkeypatch.setattr('eduflow_workflow.runtime.invoke_tool', invoke)
    slow = asyncio.create_task(run.execute(tool_node(run, 'slow'), {'value': 0}))
    await entered['slow'].wait()
    await run.execute(tool_node(run, 'fast'), {'value': 0})
    release.set()
    await slow
    starts = {args[3]: args[2] for name, args in run.storage.calls if name == 'step_start'}
    assert starts['slow'] != starts['fast']
    for name, args in run.storage.calls:
        if name == 'emit':
            node = args[5]
            assert args[4] == starts[node]
            if args[2] == 'tool.completed':
                assert args[3]['result']['value'] == node
    assert {args[2] for args in run.storage.completed} == set(starts.values())
    assert run.invocations == 2
    assert run.node_id is None and run.step_id is None


async def test_failed_input_keeps_own_invocation_while_another_step_runs(monkeypatch):
    run = execution(tools=[registered_tool()])
    entered, release = asyncio.Event(), asyncio.Event()

    async def invoke(*args):
        entered.set()
        await release.wait()
        return {'value': 'slow'}

    monkeypatch.setattr('eduflow_workflow.runtime.invoke_tool', invoke)
    task = asyncio.create_task(run.execute(tool_node(run, 'slow'), {'value': 0}))
    await entered.wait()
    invalid = copy.deepcopy(run.definition['nodes'][1])
    invalid['inputs']['left'] = {'source': 'literal', 'value': 'invalid'}
    with pytest.raises(ExecutionError) as caught:
        await run.execute(invalid, {'value': 0})
    assert caught.value.dto()['invocation'] == 2
    assert run.node_id is None and run.step_id is None
    release.set()
    await task
    assert run.invocations == 2


async def test_stale_candidate_is_rejected_before_storage_overwrite():
    class RacingStorage(MemoryStorage):
        async def call(self, name, *args):
            result = await super().call(name, *args)
            if name == 'step_start':
                run.state_version += 1
            return result

    store = RacingStorage()
    run = execution(storage=store)
    with pytest.raises(ExecutionError) as caught:
        await run.execute(run.definition['nodes'][1], {'value': 0})
    assert caught.value.code == 'STATE_VERSION_CONFLICT'
    assert not store.completed
    assert run.node_id is None and run.step_id is None


async def test_cancelled_task_does_not_leave_identity_on_caller(monkeypatch):
    run = execution(tools=[registered_tool()])
    entered = asyncio.Event()

    async def invoke(*args):
        entered.set()
        await asyncio.Future()

    monkeypatch.setattr('eduflow_workflow.runtime.invoke_tool', invoke)
    task = asyncio.create_task(run.execute(tool_node(run, 'cancelled'), {'value': 0}))
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert run.node_id is None and run.step_id is None
    await run.execute(run.definition['nodes'][1], {'value': 0})
    assert run.storage.completed[-1][3] == {'value': 5}


async def test_guard_wait_cannot_bind_old_input_state_to_new_commit_version(monkeypatch):
    run = execution()
    entered, release = asyncio.Event(), asyncio.Event()
    slow_node = copy.deepcopy(run.definition['nodes'][1])
    slow_node['id'] = 'slow'
    fast_node = copy.deepcopy(slow_node)
    fast_node['id'] = 'fast'
    for node in (slow_node, fast_node):
        node['inputs'] = {'left': {'source': 'state', 'pointer': '/value', 'onMissing': {'mode': 'error'}},
                          'right': {'source': 'literal', 'value': 1}}
    original_guard = run.guard

    async def delayed_guard():
        if run.node_id == 'slow' and not entered.is_set():
            entered.set()
            await release.wait()
        await original_guard()

    monkeypatch.setattr(run, 'guard', delayed_guard)
    old_state = {'value': 0}
    slow = asyncio.create_task(run.execute(slow_node, old_state))
    await entered.wait()
    fast_result = await run.execute(fast_node, old_state)
    assert fast_result['values'] == {'value': 1}
    release.set()
    with pytest.raises(ExecutionError) as caught:
        await slow
    assert caught.value.code == 'STATE_VERSION_CONFLICT'
    assert caught.value.dto()['effect'] == 'none'
    assert len(run.storage.completed) == 1 and run.state_version == 1
    assert [args[3] for name, args in run.storage.calls if name == 'step_start'] == ['fast']
    assert old_state == {'value': 0}
    assert run.node_id is None and run.step_id is None
