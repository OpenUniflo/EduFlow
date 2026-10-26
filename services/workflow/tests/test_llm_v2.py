"""M10: core.llm v2 structured prompt authoring, compilation and execution."""
import copy
import json

import pytest
from langchain_core.messages import AIMessageChunk

from eduflow_workflow import prompts, runtime
from eduflow_workflow.compiler import compile_definition, validate_structure
from eduflow_workflow.contracts import ExecutionError
from eduflow_workflow.registry import NODE_DESCRIPTORS, OPERATIONS, Registry, obj
from eduflow_workflow.runtime import RunExecution
from test_contracts import sample
from test_runtime import execution


class FakeStreamModel:
    def __init__(self, text='assistant-answer'):
        self.text = text
        self.seen = []
        self.bound = None

    def bind(self, **kwargs):
        self.bound = kwargs
        return self

    async def astream(self, messages, stream_usage=True):
        self.seen = list(messages)
        yield AIMessageChunk(content=self.text, response_metadata={'finish_reason': 'stop'}, usage_metadata={'input_tokens': 3, 'output_tokens': 4, 'total_tokens': 7})


def prompt(messages, system=None):
    return {'system': system or [], 'messages': messages}


def text(value):
    return {'type': 'text', 'text': value}


def param(name, format=None):
    segment = {'type': 'param', 'name': name}
    if format is not None: segment['format'] = format
    return segment


def llm_config(model_ref='model-a', messages=None, system=None):
    return {'providerRef': 'provider', 'modelRef': model_ref, 'modelParameters': {}, 'allowedToolRefs': [],
            'prompt': prompt(messages if messages is not None else [{'role': 'user', 'content': [text('Hello')]}], system)}


def provider_registry(providers=None):
    registry = Registry({'environments': [{'ref': 'test', 'ownerIds': ['a'], 'providers': providers if providers is not None else [{'ref': 'provider', 'modelRefs': ['model-a'], 'secretRef': 'MODEL_KEY'}]}]})
    return registry, registry.environment('test', 'a')


def llm_definition(config, inputs=None, type_version=2):
    definition = sample()
    definition['nodes'][1].update(type='core.llm', typeVersion=type_version, config=config, inputs=inputs or {}, writes={})
    return definition


def llm_run(monkeypatch, text='assistant-answer'):
    fake = FakeStreamModel(text)
    monkeypatch.setattr('eduflow_workflow.runtime.ChatDeepSeek', lambda **kwargs: fake)
    run = execution()
    run.env['providers'] = [{'ref': 'provider', 'modelRefs': ['model-a'], 'secretRef': 'MODEL_KEY'}]
    monkeypatch.setenv('MODEL_KEY', 'synthetic-offline-model-key')
    return run, fake


def llm_node(config, inputs, writes=None):
    return {'id': 'a', 'label': 'Model', 'type': 'core.llm', 'typeVersion': 2, 'config': config, 'inputs': inputs, 'writes': writes or {}}


# --- rendering rules -------------------------------------------------------

def test_text_format_keeps_strings_and_renders_scalars_and_objects():
    params = {'raw': 'raw-text', 'number': 12.5, 'integer': 7, 'whole': 4.0, 'flag': True, 'object': {'a': 1.0}, 'list': [1, 2.0], 'nothing': None}
    segments = [param(name) for name in params]
    assert prompts.render_segments(segments, params) == 'raw-text12.574true{"a":1}[1,2]null'


def test_json_format_always_serializes_compact_json():
    assert prompts.render_segments([param('value', 'json')], {'value': 'text'}) == '"text"'
    assert prompts.render_segments([param('value', 'json')], {'value': {'b': 2.0, 'a': [1]}}) == '{"b":2,"a":[1]}'
    assert prompts.render_segments([param('value', 'json')], {'value': None}) == 'null'


def test_render_prompt_orders_system_then_messages():
    system, messages = prompts.render_prompt(prompt([{'role': 'user', 'content': [text('Q: '), param('q')]}, {'role': 'assistant', 'content': [text('A')]}], [text('S: '), param('s')]), {'s': 'sys', 'q': 'question'})
    assert system == 'S: sys'
    assert messages == [{'role': 'user', 'content': 'Q: question'}, {'role': 'assistant', 'content': 'A'}]


def test_undeclared_parameter_raises_when_rendering_outside_compilation():
    with pytest.raises(ExecutionError) as caught:
        prompts.render_segments([param('absent')], {})
    assert caught.value.code == 'PROMPT_PARAM_UNDECLARED'


def test_estimate_counts_static_text_and_known_binding_values():
    document = prompt([{'role': 'user', 'content': [text('Hello '), param('name'), param('payload', 'json'), param('dynamic')]}])
    inputs = {'name': {'source': 'literal', 'value': 'EduFlow'}, 'payload': {'source': 'state', 'pointer': '/payload', 'onMissing': {'mode': 'default', 'value': {'a': 1}}}, 'dynamic': {'source': 'state', 'pointer': '/value', 'onMissing': {'mode': 'error'}}}
    assert prompts.estimate_prompt_bytes(document, inputs) == len('Hello EduFlow{"a":1}'.encode('utf-8'))


def test_prompt_param_positions_keep_definition_order_and_precise_locations():
    document = prompt([{'role': 'user', 'content': [param('a'), text('x'), param('b')]}], [text('s'), param('c')])
    assert prompts.prompt_param_positions(document) == [('c', '/config/prompt/system/1'), ('a', '/config/prompt/messages/0/content/0'), ('b', '/config/prompt/messages/0/content/2')]


# --- runtime execution -----------------------------------------------------

async def test_llm_assembles_system_history_and_prompt_and_returns_text(monkeypatch):
    run, fake = llm_run(monkeypatch)
    config = llm_config(messages=[{'role': 'user', 'content': [text('Question: '), param('question')]}], system=[text('Topic: '), param('topic')])
    history = [{'id': 'h1', 'role': 'user', 'content': [{'type': 'text', 'text': 'Earlier'}]}]
    output, usage = await run.llm(llm_node(config, {}), {'topic': 'math', 'question': 'Why?', 'history': history})
    assert [message.type for message in fake.seen] == ['system', 'human', 'human']
    assert [message.content for message in fake.seen] == ['Topic: math', 'Earlier', 'Question: Why?']
    assert output['text'] == 'assistant-answer'
    assert output['messages'][0]['role'] == 'assistant' and output['toolCalls'] == []
    assert usage == {'inputTokens': 3, 'outputTokens': 4}


async def test_llm_renders_environment_parameters_through_the_run_variables(monkeypatch):
    run, fake = llm_run(monkeypatch)
    run.env['variables'] = {'TONE': 'friendly'}
    config = llm_config(system=[param('tone')])
    node = llm_node(config, {'tone': {'source': 'environment', 'pointer': '/TONE', 'onMissing': {'mode': 'error'}}})
    await run.execute(node, {'value': 0})
    assert fake.seen[0].content == 'friendly'


async def test_llm_missing_parameter_uses_the_binding_default(monkeypatch):
    run, fake = llm_run(monkeypatch)
    config = llm_config(system=[param('tone')])
    node = llm_node(config, {'tone': {'source': 'state', 'pointer': '/missing', 'onMissing': {'mode': 'default', 'value': 'neutral'}}})
    await run.execute(node, {'value': 0})
    assert fake.seen[0].content == 'neutral'


async def test_llm_text_output_writes_into_state(monkeypatch):
    run, fake = llm_run(monkeypatch, text='final text')
    run.definition['state']['schema'] = obj({'value': {'type': 'number'}, 'answer': {'type': 'string'}})
    run.definition['state']['initial']['answer'] = ''
    node = llm_node(llm_config(), {}, writes={'answer': '/text'})
    result = await run.execute(node, {'value': 0, 'answer': ''})
    assert result['values']['answer'] == 'final text'


def structured_config(fields):
    config = llm_config()
    config['structuredOutput'] = {'fields': fields}
    return config


async def test_structured_output_requests_json_and_returns_each_field(monkeypatch):
    run, fake = llm_run(monkeypatch, text='{"keywords":"ai agents","count":2}')
    config = structured_config([{'name': 'keywords', 'type': 'string'}, {'name': 'count', 'type': 'number', 'description': '结果数量'}])
    output, _ = await run.llm(llm_node(config, {}), {})
    assert fake.bound == {'response_format': {'type': 'json_object'}}
    assert fake.seen[0].content.endswith('JSON 字段') is False
    assert 'keywords（文本）' in fake.seen[0].content and 'count（数字）：结果数量' in fake.seen[0].content
    assert output['keywords'] == 'ai agents' and output['count'] == 2
    assert output['text'] == '{"keywords":"ai agents","count":2}'


async def test_structured_output_missing_field_fails_without_fabricating(monkeypatch):
    run, _ = llm_run(monkeypatch, text='{"keywords":"ai agents"}')
    config = structured_config([{'name': 'keywords', 'type': 'string'}, {'name': 'count', 'type': 'number'}])
    with pytest.raises(ExecutionError) as caught:
        await run.llm(llm_node(config, {}), {})
    assert caught.value.code == 'INVALID_MODEL_OUTPUT'
    assert '缺少字段「count」' in str(caught.value)
    assert caught.value.pointer == '/count'


async def test_structured_output_wrong_field_type_fails(monkeypatch):
    run, _ = llm_run(monkeypatch, text='{"keywords":3}')
    config = structured_config([{'name': 'keywords', 'type': 'string'}])
    with pytest.raises(ExecutionError) as caught:
        await run.llm(llm_node(config, {}), {})
    assert caught.value.code == 'INVALID_MODEL_OUTPUT'
    assert '字段「keywords」应为文本' in str(caught.value)


async def test_structured_output_non_json_text_fails(monkeypatch):
    run, _ = llm_run(monkeypatch, text='not json')
    config = structured_config([{'name': 'keywords', 'type': 'string'}])
    with pytest.raises(ExecutionError) as caught:
        await run.llm(llm_node(config, {}), {})
    assert caught.value.code == 'INVALID_MODEL_OUTPUT'
    assert '不符合输出字段要求' in str(caught.value)


async def test_structured_field_write_into_matching_state_field(monkeypatch):
    run, _ = llm_run(monkeypatch, text='{"keywords":"ai agents"}')
    run.definition['state']['schema'] = obj({'value': {'type': 'number'}, 'keywords': {'type': 'string'}})
    run.definition['state']['initial']['keywords'] = ''
    node = llm_node(structured_config([{'name': 'keywords', 'type': 'string'}]), {}, writes={'keywords': '/keywords'})
    result = await run.execute(node, {'value': 0, 'keywords': ''})
    assert result['values']['keywords'] == 'ai agents'


async def test_llm_missing_required_binding_fails_before_the_provider(monkeypatch):
    run, fake = llm_run(monkeypatch)
    node = llm_node(llm_config(), {'tone': {'source': 'state', 'pointer': '/missing', 'onMissing': {'mode': 'error'}}})
    with pytest.raises(ExecutionError) as caught:
        await run.execute(node, {'value': 0})
    assert caught.value.code == 'BINDING_MISSING' and fake.seen == []


# --- compilation -----------------------------------------------------------

def test_valid_llm_definition_compiles():
    registry, environment = provider_registry()
    definition = llm_definition(llm_config(), {'topic': {'source': 'state', 'pointer': '/value', 'onMissing': {'mode': 'error'}}}, type_version=2)
    result = compile_definition(definition, registry.snapshot(environment))
    assert result['valid'], result['diagnostics']


@pytest.mark.parametrize('system,message_content,expected_pointer', [
    ([], [param('missing')], '/nodes/a/config/prompt/messages/0/content/0'),
    ([text('s'), param('missing')], [text('ok')], '/nodes/a/config/prompt/system/1'),
    ([], [text('x'), param('history')], '/nodes/a/config/prompt/messages/0/content/1'),
])
def test_prompt_param_references_must_be_declared_at_their_segment_pointer(system, message_content, expected_pointer):
    registry, environment = provider_registry()
    definition = llm_definition(llm_config(messages=[{'role': 'user', 'content': message_content}], system=system), {'history': {'source': 'literal', 'value': []}})
    result = compile_definition(definition, registry.snapshot(environment))
    assert not result['valid']
    diagnostic = next(item for item in result['diagnostics'] if item['code'] == 'PROMPT_PARAM_UNDECLARED')
    assert diagnostic['nodeId'] == 'a' and diagnostic['pointer'] == expected_pointer


def test_unused_parameter_is_a_warning_not_a_blocking_error():
    registry, environment = provider_registry()
    definition = llm_definition(llm_config(), {'topic': {'source': 'literal', 'value': 'math'}})
    result = compile_definition(definition, registry.snapshot(environment))
    assert result['valid'] is True
    warning = next(item for item in result['diagnostics'] if item['code'] == 'PROMPT_PARAM_UNUSED')
    assert warning['severity'] == 'warning' and warning['nodeId'] == 'a' and warning['pointer'] == '/nodes/a/inputs/topic'
    assert 'compileFingerprint' in result


def test_used_parameter_does_not_emit_unused_warning():
    registry, environment = provider_registry()
    definition = llm_definition(llm_config(system=[param('topic')]), {'topic': {'source': 'literal', 'value': 'math'}})
    result = compile_definition(definition, registry.snapshot(environment))
    assert result['valid'] and not [item for item in result['diagnostics'] if item['code'] == 'PROMPT_PARAM_UNUSED']


def test_invalid_parameter_names_are_reported_on_the_input_binding():
    registry, environment = provider_registry()
    definition = llm_definition(llm_config(system=[param('topic')]), {'topic name': {'source': 'literal', 'value': 'math'}})
    result = compile_definition(definition, registry.snapshot(environment))
    assert not result['valid']
    codes = {(item['code'], item.get('pointer')) for item in result['diagnostics']}
    assert ('PROMPT_PARAM_UNUSED', '/nodes/a/inputs/topic name') in codes
    # A param segment may not reference a malformed declaration, so the unused warning keeps the binding visible.
    assert any(item['code'] == 'PROMPT_PARAM_UNDECLARED' for item in result['diagnostics'])


def test_prompt_requires_at_least_one_message():
    registry, environment = provider_registry()
    definition = llm_definition({'providerRef': 'provider', 'modelRef': 'model-a', 'modelParameters': {}, 'allowedToolRefs': [], 'prompt': {'system': [], 'messages': []}})
    result = compile_definition(definition, registry.snapshot(environment))
    assert not result['valid']
    assert any(item['code'] == 'SCHEMA_VALIDATION_FAILED' and item.get('pointer', '').startswith('/nodes/a/config/prompt/messages') for item in result['diagnostics'])


def test_history_binding_must_be_a_messages_array():
    registry, environment = provider_registry()
    definition = llm_definition(llm_config(), {'history': {'source': 'literal', 'value': [{'id': 'bad', 'role': 'user', 'content': 'not-blocks'}]}})
    result = compile_definition(definition, registry.snapshot(environment))
    assert not result['valid']
    assert any(item['code'] == 'INVALID_NODE_INPUT' and item.get('pointer', '').startswith('/nodes/a/inputs/history') for item in result['diagnostics'])


def test_retired_v1_model_node_reports_node_version_retired_only():
    registry, environment = provider_registry()
    definition = llm_definition({'providerRef': 'provider', 'modelRef': 'model-a', 'modelParameters': {}, 'allowedToolRefs': []}, {'messages': {'source': 'literal', 'value': []}}, type_version=1)
    result = compile_definition(definition, registry.snapshot(environment))
    assert not result['valid']
    assert [item['code'] for item in result['diagnostics']] == ['NODE_VERSION_RETIRED']
    assert result['diagnostics'][0]['nodeId'] == 'a' and result['diagnostics'][0]['pointer'] == '/nodes/a'


def test_retired_v1_model_node_inside_a_subgraph_keeps_the_graph_path():
    registry, environment = provider_registry()
    child = llm_definition({'providerRef': 'provider', 'modelRef': 'model-a', 'modelParameters': {}, 'allowedToolRefs': []}, {'messages': {'source': 'literal', 'value': []}}, type_version=1)
    parent = sample()
    parent['nodes'][1].update(type='core.subgraph', typeVersion=1, config={'graph': child, 'stateMode': 'independent', 'persistence': 'per-invocation'}, inputs={}, writes={})
    result = compile_definition(parent, registry.snapshot(environment))
    assert not result['valid']
    retired = next(item for item in result['diagnostics'] if item['code'] == 'NODE_VERSION_RETIRED')
    assert retired['nodeId'] == 'a' and retired['graphPath'] == [parent['nodes'][1]['id']]


def test_structure_validation_accepts_the_new_model_shape_without_a_connection_catalog():
    assert validate_structure(llm_definition(llm_config(), {'topic': {'source': 'literal', 'value': 'math'}}), NODE_DESCRIPTORS, OPERATIONS)['valid']


def test_estimated_rendered_prompt_length_is_counted_against_max_input_bytes():
    registry, environment = provider_registry()
    definition = llm_definition(llm_config(messages=[{'role': 'user', 'content': [text('x' * 40)]}]), {})
    definition['policy']['maxInputBytes'] = 20
    result = compile_definition(definition, registry.snapshot(environment))
    assert not result['valid']
    diagnostic = next(item for item in result['diagnostics'] if item['code'] == 'INPUT_TOO_LARGE')
    assert diagnostic['nodeId'] == 'a' and diagnostic['pointer'] == '/nodes/a/config/prompt'


async def test_unused_parameter_warning_keeps_environment_validation_ready(monkeypatch):
    from eduflow_workflow import server
    registry, environment = provider_registry()
    monkeypatch.setattr(server, 'registry', registry)
    monkeypatch.setenv('MODEL_KEY', 'synthetic-offline-model-key')
    definition = llm_definition(llm_config(), {'topic': {'source': 'literal', 'value': 'math'}})
    result = await server.validation({'ownerId': 'a', 'environmentRef': 'test', 'definition': definition})
    assert result['valid'] is True and result['checks'] == {'structure': True, 'environment': True, 'input': 'unchecked'}
    warnings = [item for item in result['diagnostics'] if item['code'] == 'PROMPT_PARAM_UNUSED']
    assert len(warnings) == 1 and warnings[0]['severity'] == 'warning' and warnings[0]['scope'] == 'definition'


def test_structured_output_contract_rejects_duplicate_and_reserved_names():
    registry, environment = provider_registry()
    config = structured_config([
        {'name': 'keywords', 'type': 'string'},
        {'name': 'keywords', 'type': 'number'},
        {'name': 'text', 'type': 'string'},
    ])
    result = compile_definition(llm_definition(config), registry.snapshot(environment))
    assert not result['valid']
    diagnostics = [item for item in result['diagnostics'] if item['code'] == 'INVALID_STRUCTURED_OUTPUT']
    assert len(diagnostics) == 2
    assert {item['pointer'] for item in diagnostics} == {
        '/nodes/a/config/structuredOutput/fields/1/name',
        '/nodes/a/config/structuredOutput/fields/2/name',
    }


def test_structured_output_contract_accepts_unique_fields():
    registry, environment = provider_registry()
    config = structured_config([
        {'name': 'keywords', 'type': 'string', 'description': '搜索关键词'},
        {'name': 'language', 'type': 'string'},
    ])
    result = compile_definition(llm_definition(config), registry.snapshot(environment))
    assert result['valid'], result['diagnostics']


def test_structured_output_write_type_mismatch_is_a_compile_error():
    registry, environment = provider_registry()
    definition = llm_definition(structured_config([{'name': 'keywords', 'type': 'string'}]))
    definition['state']['schema'] = obj({'value': {'type': 'number'}, 'keywords': {'type': 'number'}})
    definition['state']['initial']['keywords'] = 0
    definition['nodes'][1]['writes'] = {'keywords': '/keywords'}
    result = compile_definition(definition, registry.snapshot(environment))
    assert not result['valid']
    diagnostic = next(item for item in result['diagnostics'] if item['code'] == 'INVALID_STATE_WRITE_TYPE')
    assert diagnostic['nodeId'] == 'a' and diagnostic['pointer'] == '/nodes/a/writes/keywords'
