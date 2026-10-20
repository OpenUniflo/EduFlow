"""Native field channels preserve serial persistence and reducer updates."""
import copy
import pytest
from eduflow_workflow.contracts import ExecutionError

from eduflow_workflow.compiler import state_channels, encode_state, decode_state
from eduflow_workflow.registry import obj
from test_contracts import sample
from test_runtime import execution


async def test_append_update_is_applied_once_by_native_channels_and_persistence():
    definition = sample()
    definition['state'] = {'schema': obj({'items': {'type': 'array', 'items': {'type': 'string'}}}),
                           'initial': {'items': ['seed']}, 'inputBindings': {},
                           'reducers': {'items': {'name': 'append', 'version': 1}}}
    first = definition['nodes'][1]
    first.update(config={'operationRef': 'core.identity', 'operationVersion': 1},
                 inputs={'value': {'source': 'literal', 'value': ['first']}}, writes={'items': '/value'})
    second = copy.deepcopy(first)
    second.update(id='second', inputs={'value': {'source': 'literal', 'value': ['second']}})
    definition['nodes'].insert(2, second)
    definition['transitions'][1]['to'] = 'second'
    definition['transitions'].append({'id': 'second-end', 'from': 'second', 'outlet': 'next', 'to': 'e'})
    definition['outputSchema'] = obj({'items': {'type': 'array'}})
    definition['outputBindings'] = {'items': {'source': 'state', 'pointer': '/items', 'onMissing': {'mode': 'error'}}}
    run = execution(definition)
    assert await run.run_graph() == {'items': ['seed', 'first', 'second']}
    assert run.storage.completed[-1][4] == {'items': ['seed', 'first', 'second']}
    assert [args[5] for args in run.storage.completed if args[5]] == [{'items': ['first']}, {'items': ['second']}]


async def test_empty_business_state_has_no_fabricated_domain_fields():
    definition = sample()
    definition['nodes'] = [definition['nodes'][0], definition['nodes'][-1]]
    definition['transitions'] = [{'id': 'start-end', 'from': 's', 'outlet': 'next', 'to': 'e'}]
    definition['state'] = {'schema': obj({}), 'initial': {}, 'inputBindings': {}, 'reducers': {}}
    definition['outputSchema'] = obj({})
    definition['outputBindings'] = {}
    run = execution(definition)
    assert await run.run_graph() == {}
    assert run.storage.completed[-1][4] == {}


def test_domain_field_names_cannot_collide_with_projected_node_or_route_names():
    definition = sample()
    names = ['values', 'outlet', '__start__', 'eduflow_node_0', 'eduflow_route_0', 'a/b~c']
    definition['state']['schema'] = obj({name: {'type': 'string'} for name in names})
    definition['state']['initial'] = {name: name for name in names}
    channels = state_channels(definition)
    assert len(set(channels.values())) == len(names)
    assert decode_state(definition, encode_state(definition, definition['state']['initial'])) == definition['state']['initial']


async def test_full_candidate_callback_cannot_silently_double_apply_reducer():
    from eduflow_workflow.compiler import graph_for
    definition = sample()
    definition['state'] = {'schema': obj({'items': {'type': 'array'}}),
                           'initial': {'items': ['seed']}, 'inputBindings': {},
                           'reducers': {'items': {'name': 'append', 'version': 1}}}

    async def ambiguous(node, state):
        return {'values': {'items': state['items'] + ['new']} if node['id'] == 'a' else state,
                'outlet': 'next'}

    graph = graph_for(definition, ambiguous, 'unit-ambiguous-callback')
    with pytest.raises(ExecutionError) as caught:
        await graph.ainvoke(encode_state(definition, {'items': ['seed']}))
    assert caught.value.code == 'AMBIGUOUS_REDUCER_UPDATE'
    assert definition['state']['initial'] == {'items': ['seed']}


async def test_native_task_identity_is_available_only_inside_its_callback():
    from eduflow_workflow.compiler import graph_for, SDK_EXECUTION
    definition = sample()
    observed = []

    async def execute(node, state):
        identity = SDK_EXECUTION.get()
        observed.append((node['id'], dict(identity)))
        return {'values': state, 'outlet': 'next'}

    caller = {'taskId': 'caller-task'}
    token = SDK_EXECUTION.set(caller)
    try:
        graph = graph_for(definition, execute, 'unit-native-task-identities')
        await graph.ainvoke(encode_state(definition, {'value': 0}))
        assert SDK_EXECUTION.get() is caller
    finally:
        SDK_EXECUTION.reset(token)
    assert [node for node, _ in observed] == ['s', 'a', 'e']
    assert len({identity['taskId'] for _, identity in observed}) == 3
    assert all(isinstance(identity['checkpointId'], str) and identity['checkpointId'] for _, identity in observed)
    assert all(isinstance(identity['attempt'], int) for _, identity in observed)
