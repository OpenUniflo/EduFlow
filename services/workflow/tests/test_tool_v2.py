"""M11: core.tool v2 form-style arguments, compilation and execution."""
import copy

import pytest

from eduflow_workflow import runtime
from eduflow_workflow.compiler import compile_definition, validate_structure
from eduflow_workflow.contracts import ExecutionError
from eduflow_workflow.registry import NODE_DESCRIPTORS, OPERATIONS, Registry, obj
from test_contracts import sample
from test_runtime import execution

TOOL_SCHEMA = obj({'orderId': {'type': 'string'}, 'note': {'type': 'string'}, 'filter': obj({'status': {'type': 'string'}}), 'limit': {'type': 'integer'}}, ['orderId'])


def registry_snapshot(schema=TOOL_SCHEMA, contract='contract', available=True):
    registry = Registry({'environments': [{'ref': 'test', 'ownerIds': ['a']}]})
    snapshot = registry.snapshot(registry.environment('test', 'a'))
    snapshot['tools'] = [{'ref': 'f', 'name': 'f', 'contractDigest': contract, 'available': available, 'inputSchema': schema}]
    return snapshot


def tool_definition(inputs, config=None, type_version=2):
    definition = sample()
    definition['nodes'][1].update(type='core.tool', typeVersion=type_version, config=config or {'toolRef': 'f', 'contractDigest': 'contract'}, inputs=inputs, writes={})
    return definition


def literal(value):
    return {'source': 'literal', 'value': value}


def state(pointer):
    return {'source': 'state', 'pointer': pointer, 'onMissing': {'mode': 'error'}}


def run_input(pointer):
    return {'source': 'input', 'pointer': pointer, 'onMissing': {'mode': 'error'}}


def registered_tool(schema=TOOL_SCHEMA):
    return {'ref': 'f', 'name': 'f', 'adapter': 'function', 'version': 1, 'operationRef': 'core.identity', 'inputSchema': schema, 'outputSchema': {'type': 'object'}, 'sideEffect': 'read'}


# --- compilation -----------------------------------------------------------

def test_valid_tool_definition_compiles():
    definition = tool_definition({'orderId': literal('A1001'), 'note': literal('hello'), 'filter': literal({'status': 'open'})})
    result = compile_definition(definition, registry_snapshot())
    assert result['valid'], result['diagnostics']


def test_unknown_tool_argument_is_reported_on_the_input_row():
    definition = tool_definition({'orderId': literal('A1001'), 'extra': literal('nope')})
    result = compile_definition(definition, registry_snapshot())
    assert not result['valid']
    diagnostic = next(item for item in result['diagnostics'] if item['code'] == 'TOOL_ARGUMENT_UNKNOWN')
    assert diagnostic['nodeId'] == 'a' and diagnostic['pointer'] == '/nodes/a/inputs/extra'


def test_required_tool_argument_without_a_binding_is_reported_on_the_missing_row():
    definition = tool_definition({'note': literal('hello')})
    result = compile_definition(definition, registry_snapshot())
    assert not result['valid']
    diagnostic = next(item for item in result['diagnostics'] if item['code'] == 'TOOL_ARGUMENT_REQUIRED')
    assert diagnostic['nodeId'] == 'a' and diagnostic['pointer'] == '/nodes/a/inputs/orderId'


def test_literal_tool_arguments_use_their_parameter_sub_schema():
    definition = tool_definition({'orderId': literal(7)})
    result = compile_definition(definition, registry_snapshot())
    assert not result['valid']
    assert any(item['code'] == 'INVALID_NODE_INPUT' and item['nodeId'] == 'a' and item['pointer'].startswith('/nodes/a/inputs/orderId') for item in result['diagnostics'])
    definition['nodes'][1]['inputs']['orderId'] = literal('A1001')
    assert compile_definition(definition, registry_snapshot())['valid']


def test_nested_object_literal_is_validated_by_its_sub_schema():
    definition = tool_definition({'orderId': literal('A1001'), 'filter': literal({'status': 5})})
    result = compile_definition(definition, registry_snapshot())
    assert not result['valid']
    assert any(item['code'] == 'INVALID_NODE_INPUT' and '/nodes/a/inputs/filter' in item.get('pointer', '') for item in result['diagnostics'])


def test_variable_binding_target_type_comes_from_the_parameter_sub_schema():
    definition = tool_definition({'orderId': state('/value')})
    result = compile_definition(definition, registry_snapshot())
    assert not result['valid']
    diagnostic = next(item for item in result['diagnostics'] if item['code'] == 'BINDING_TYPE_MISMATCH')
    assert diagnostic['nodeId'] == 'a' and diagnostic['pointer'] == '/nodes/a/inputs/orderId'
    definition['nodes'][1]['inputs']['orderId'] = literal('A1001')
    assert compile_definition(definition, registry_snapshot())['valid']


def test_environment_tool_argument_must_exist_in_the_environment_variables():
    definition = tool_definition({'orderId': {'source': 'environment', 'pointer': '/ORDER_ID', 'onMissing': {'mode': 'error'}}})
    snapshot = registry_snapshot()
    snapshot['variables'] = {'ORDER_ID': 'A1001'}
    assert compile_definition(definition, snapshot)['valid']
    missing = compile_definition(definition, {**snapshot, 'variables': {}})
    assert not missing['valid'] and any(item['code'] == 'BINDING_MISSING' for item in missing['diagnostics'])


def test_retired_v1_tool_node_reports_node_version_retired_only():
    definition = tool_definition({'arguments': literal({})}, config={'toolRef': 'f', 'contractDigest': 'contract'}, type_version=1)
    result = compile_definition(definition, registry_snapshot())
    assert not result['valid']
    assert [item['code'] for item in result['diagnostics']] == ['NODE_VERSION_RETIRED']
    assert result['diagnostics'][0]['nodeId'] == 'a' and result['diagnostics'][0]['pointer'] == '/nodes/a'


def test_structure_validation_does_not_require_a_tool_catalog():
    assert validate_structure(tool_definition({'anything': literal(1)}), NODE_DESCRIPTORS, OPERATIONS)['valid']


# --- runtime ---------------------------------------------------------------

async def test_tool_runtime_assembles_only_bound_arguments(monkeypatch):
    received = []

    async def invoke(tool, env, arguments, timeout):
        received.append(arguments)
        return {'echo': arguments}

    monkeypatch.setattr('eduflow_workflow.runtime.invoke_tool', invoke)
    run = execution(tools=[registered_tool()])
    node = copy.deepcopy(run.definition['nodes'][1])
    node.update(type='core.tool', typeVersion=2, config={'toolRef': 'f'}, inputs={'orderId': literal('A1001'), 'note': run_input('/note'), 'filter': literal({'status': 'open'})}, writes={})
    run.input = {'note': 'hello'}
    await run.execute(node, {'value': 0})
    assert received == [{'orderId': 'A1001', 'note': 'hello', 'filter': {'status': 'open'}}]


async def test_tool_runtime_keeps_literal_and_variable_values_distinct(monkeypatch):
    received = []

    async def invoke(tool, env, arguments, timeout):
        received.append(arguments)
        return arguments

    monkeypatch.setattr('eduflow_workflow.runtime.invoke_tool', invoke)
    run = execution(tools=[registered_tool()])
    node = copy.deepcopy(run.definition['nodes'][1])
    node.update(type='core.tool', typeVersion=2, config={'toolRef': 'f'}, inputs={'orderId': literal('A1001'), 'limit': run_input('/limit')}, writes={})
    run.input = {'limit': 4}
    await run.execute(node, {'value': 0})
    assert received == [{'orderId': 'A1001', 'limit': 4}]


async def test_tool_runtime_defense_rejects_missing_required_arguments(monkeypatch):
    async def invoke(tool, env, arguments, timeout):
        raise AssertionError('invalid arguments must not reach the tool')

    monkeypatch.setattr('eduflow_workflow.runtime.invoke_tool', invoke)
    run = execution(tools=[registered_tool()])
    node = copy.deepcopy(run.definition['nodes'][1])
    node.update(type='core.tool', typeVersion=2, config={'toolRef': 'f'}, inputs={}, writes={})
    with pytest.raises(ExecutionError) as caught:
        await run.execute(node, {'value': 0})
    assert caught.value.code == 'INVALID_TOOL_ARGUMENTS'
