"""M2: openai-compatible provider connections, model discovery and redacted connection tests."""
import contextlib
import copy
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest

from eduflow_workflow import extensions, tools
from eduflow_workflow.compiler import compile_definition, validate_structure
from eduflow_workflow.contracts import ExecutionError
from eduflow_workflow.extensions import fetch_model_ids, hydrate_connections, http_test_preview, parse_model_ids, validate_connection
from eduflow_workflow.registry import NODE_DESCRIPTORS, OPERATIONS, Registry
from eduflow_workflow.runtime import RunExecution
from test_contracts import sample


@contextlib.contextmanager
def local_http(handler):
    """One loopback HTTP fixture; handler(request, body) returns (status, bytes, headers)."""
    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *args):
            pass

        def do_GET(self):
            self._respond()

        def do_POST(self):
            self._respond()

        def _respond(self):
            length = int(self.headers.get('Content-Length', '0') or 0)
            body = self.rfile.read(length) if length else b''
            try:
                status, payload, headers = handler(self, body)
            except Exception:
                status, payload, headers = 500, b'{"error":"fixture"}', {}
            try:
                self.send_response(status)
                for name, value in {'Content-Type': 'application/json', **headers}.items():
                    self.send_header(name, value)
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError):
                pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield 'http://127.0.0.1:' + str(server.server_address[1])
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def local_env(**extra):
    return {'providers': [], 'tools': [], 'connectors': [], 'localFixtures': True, 'capabilityOrigins': {}, **extra}


def model_content(**overrides):
    content = {'type': 'openai-compatible', 'name': 'Gateway', 'baseUrl': 'https://models.example/v1', 'modelRefs': ['model-a']}
    content.update(overrides)
    return content


@pytest.fixture
def local_fixtures(monkeypatch):
    monkeypatch.setenv('WORKFLOW_ALLOW_LOCAL_FIXTURES', '1')


@pytest.fixture
def allow_destination(monkeypatch):
    async def allow(base_url, env, path='/'):
        return None
    monkeypatch.setattr(extensions, 'assert_destination', allow)


# --- connection validation -------------------------------------------------

async def test_openai_compatible_connection_is_validated_and_normalized(local_fixtures, allow_destination):
    content = await validate_connection(model_content(baseUrl='https://models.example/v1/', description='Team gateway', modelRefs=['b', 'a', 'b']), 'synthetic-key', local_env())
    assert content['baseUrl'] == 'https://models.example/v1'
    assert content['modelRefs'] == ['b', 'a']
    assert content['description'] == 'Team gateway'
    assert 'secretRef' not in content


async def test_local_http_model_connection_requires_fixture_environment_and_process_opt_in(local_fixtures, monkeypatch):
    content = await validate_connection(model_content(baseUrl='http://127.0.0.1:18080/v1', modelRefs=['local-model']), '', local_env())
    assert content['baseUrl'] == 'http://127.0.0.1:18080/v1'
    with pytest.raises(ExecutionError) as caught:
        await validate_connection(model_content(baseUrl='http://127.0.0.1:18080/v1'), '', local_env(localFixtures=False))
    assert caught.value.code == 'INVALID_CONNECTION'
    monkeypatch.delenv('WORKFLOW_ALLOW_LOCAL_FIXTURES')
    with pytest.raises(ExecutionError) as caught:
        await validate_connection(model_content(baseUrl='http://127.0.0.1:18080/v1'), '', local_env())
    assert caught.value.code == 'INVALID_CONNECTION'


async def test_remote_model_connection_requires_https_and_credential(local_fixtures, allow_destination):
    with pytest.raises(ExecutionError) as caught:
        await validate_connection(model_content(), '', local_env())
    assert caught.value.code == 'INVALID_CONNECTION'
    with pytest.raises(ExecutionError):
        await validate_connection(model_content(baseUrl='http://models.example/v1'), 'synthetic-key', local_env())
    with pytest.raises(ExecutionError):
        await validate_connection(model_content(credentialHeader='X-API-Key'), 'synthetic-key', local_env())


async def test_private_network_model_destination_is_denied_outside_local_fixtures():
    with pytest.raises(ExecutionError) as caught:
        await validate_connection(model_content(baseUrl='https://10.0.0.5/v1'), 'synthetic-key', {'providers': [], 'tools': [], 'connectors': []})
    assert caught.value.code == 'HTTP_DESTINATION_FORBIDDEN'


@pytest.mark.parametrize('base_url', ['https://user:pass@models.example/v1', 'https://models.example/v1?key=1', 'https://models.example/v1#fragment', 'https:///v1', 'ftp://models.example'])
async def test_model_base_url_rejects_embedded_credentials_or_components(base_url):
    with pytest.raises(ExecutionError) as caught:
        await validate_connection(model_content(baseUrl=base_url), 'synthetic-key', local_env())
    assert caught.value.code == 'INVALID_CONNECTION'


@pytest.mark.parametrize('refs', [[], [''], ['bad model'], ['a' * 201], 'model-a', [str(index) for index in range(51)]])
async def test_model_refs_are_bounded_and_pattern_checked(refs, local_fixtures):
    with pytest.raises(ExecutionError) as caught:
        await validate_connection(model_content(baseUrl='http://127.0.0.1:18080/v1', modelRefs=refs), '', local_env())
    assert caught.value.code == 'INVALID_CONNECTION'


@pytest.mark.parametrize('overrides', [
    {'type': 'deepseek', 'modelRefs': ['deepseek-chat'], 'description': 'x' * 501},
    {'type': 'http', 'baseUrl': 'https://api.example.com', 'path': '/', 'method': 'GET', 'sideEffect': 'read', 'description': 'x' * 501},
])
async def test_description_is_bounded_for_every_connection_type(overrides):
    content = {'name': 'Connection', 'modelRefs': ['deepseek-chat'], **overrides}
    if overrides['type'] == 'deepseek':
        content['modelRefs'] = ['deepseek-chat']
    with pytest.raises(ExecutionError) as caught:
        await validate_connection(content, 'synthetic-key', local_env())
    assert caught.value.code == 'INVALID_CONNECTION'


async def test_deepseek_models_use_the_shared_pattern_with_the_official_base_url():
    content = await validate_connection({'type': 'deepseek', 'modelRefs': ['deepseek-chat', 'deepseek-v3.2'], 'description': 'Official'}, 'synthetic-key', {})
    assert content['modelRefs'] == ['deepseek-chat', 'deepseek-v3.2']
    assert content['description'] == 'Official'
    with pytest.raises(ExecutionError):
        await validate_connection({'type': 'deepseek', 'baseUrl': 'https://api.deepseek.com/v1', 'modelRefs': ['deepseek-chat']}, 'synthetic-key', {})
    with pytest.raises(ExecutionError):
        await validate_connection({'type': 'deepseek', 'modelRefs': ['bad model']}, 'synthetic-key', {})
    with pytest.raises(ExecutionError):
        await validate_connection({'type': 'deepseek', 'modelRefs': ['deepseek-chat']}, '', {})


async def test_connection_grammar_is_a_closed_whitelist(local_fixtures):
    with pytest.raises(ExecutionError) as caught:
        await validate_connection(model_content(type='ollama', baseUrl='http://127.0.0.1:18080'), '', local_env())
    assert caught.value.code == 'INVALID_CONNECTION'
    with pytest.raises(ExecutionError):
        await validate_connection(model_content(baseUrl='http://127.0.0.1:18080', secretRef='vault:1'), '', local_env())
    with pytest.raises(ExecutionError):
        await validate_connection(model_content(baseUrl='http://127.0.0.1:18080', unknownField=True), '', local_env())
    with pytest.raises(ExecutionError) as caught:
        await validate_connection(model_content(baseUrl='http://127.0.0.1:18080', path='/api'), '', local_env())
    assert caught.value.code == 'INVALID_CONNECTION'


def test_hydrate_connections_injects_model_adapters():
    env = {'providers': [], 'tools': [], 'connectors': [], 'capabilityOrigins': {}}
    hydrate_connections(env, 'a', [
        {'kind': 'connection', 'ref': 'gateway', 'version': 2, 'disabled': False, 'content': {'type': 'openai-compatible', 'name': 'Gateway', 'baseUrl': 'https://models.example/v1', 'modelRefs': ['a', 'b'], 'secretRef': 'vault:1'}},
        {'kind': 'connection', 'ref': 'official', 'version': 1, 'disabled': False, 'content': {'type': 'deepseek', 'name': 'Official', 'modelRefs': ['deepseek-chat'], 'secretRef': 'vault:2'}},
        {'kind': 'connection', 'ref': 'local', 'version': 1, 'disabled': False, 'content': {'type': 'openai-compatible', 'name': 'Local', 'baseUrl': 'http://127.0.0.1:18080/v1', 'modelRefs': ['local-model']}},
    ])
    gateway, official, local = env['providers']
    assert gateway == {'ref': 'p4:a:gateway:2', 'name': 'Gateway', 'modelRefs': ['a', 'b'], 'baseUrl': 'https://models.example/v1', 'secretRef': 'vault:1', 'adapter': 'openai'}
    assert official['adapter'] == 'deepseek' and official['baseUrl'] == 'https://api.deepseek.com'
    assert local['adapter'] == 'openai' and 'secretRef' not in local


# --- model discovery -------------------------------------------------------

async def test_model_list_is_sorted_deduplicated_and_capped(local_fixtures):
    identifiers = ['m' + str(index) for index in range(250)] + ['m1']
    payload = {'data': [{'id': identifier} for identifier in identifiers] + [{'missing': 'id'}]}

    def handler(request, body):
        assert request.path == '/models'
        assert 'Authorization' not in request.headers
        return 200, json.dumps(payload).encode(), {}

    with local_http(handler) as base:
        models = await fetch_model_ids(base, None, local_env())
    assert len(models) == 200 and models == sorted(set(models))


async def test_model_list_accepts_an_empty_provider(local_fixtures):
    with local_http(lambda request, body: (200, json.dumps({'data': []}).encode(), {})) as base:
        assert await fetch_model_ids(base, None, local_env()) == []


@pytest.mark.parametrize('status,payload,code', [
    (200, b'not json', 'CONNECTION_TEST_FAILED'),
    (200, b'{"data":"not-a-list"}', 'CONNECTION_TEST_FAILED'),
    (401, b'{"error":"unauthorized"}', 'CONNECTION_TEST_FAILED'),
])
async def test_model_list_failures_are_safe_and_structured(local_fixtures, status, payload, code):
    with local_http(lambda request, body: (status, payload, {})) as base:
        with pytest.raises(ExecutionError) as caught:
            await fetch_model_ids(base, None, local_env())
    assert caught.value.code == code
    assert 'unauthorized' not in str(caught.value)


async def test_model_list_timeout_is_reported_without_leaking(local_fixtures):
    def handler(request, body):
        time.sleep(0.6)
        return 200, b'{"data":[]}', {}

    with local_http(handler) as base:
        with pytest.raises(ExecutionError) as caught:
            await fetch_model_ids(base, None, local_env(), timeout=0.2)
    assert caught.value.code == 'CONNECTION_TEST_TIMEOUT'


async def test_model_list_sends_the_managed_credential(local_fixtures, monkeypatch):
    monkeypatch.setenv('MODEL_CONNECTION_KEY', 'synthetic-model-key')
    seen = {}

    def handler(request, body):
        seen['authorization'] = request.headers.get('Authorization')
        return 200, json.dumps({'data': [{'id': 'remote-model'}]}).encode(), {}

    env = local_env(providers=[{'ref': 'p', 'secretRef': 'MODEL_CONNECTION_KEY'}])
    with local_http(handler) as base:
        assert await fetch_model_ids(base, 'MODEL_CONNECTION_KEY', env) == ['remote-model']
    assert seen['authorization'] == 'Bearer synthetic-model-key'


def test_model_payload_parsing_rejects_non_envelopes():
    assert parse_model_ids({'data': [{'id': 'b'}, {'id': 'a'}, {'id': 'a'}]}) == ['a', 'b']
    with pytest.raises(ExecutionError):
        parse_model_ids({'models': []})
    with pytest.raises(ExecutionError):
        parse_model_ids('text')


# --- HTTP test preview -----------------------------------------------------

def http_tool(base, **extra):
    tool = {'ref': 'api', 'baseUrl': base, 'path': '/preview', 'method': 'GET', 'sideEffect': 'read', 'inputSchema': {'type': 'object'}, 'outputSchema': {'type': 'object'}, 'headerSecretRefs': {}}
    tool.update(extra)
    return tool


async def test_http_test_preview_is_truncated_to_four_kibibytes(local_fixtures):
    body = b'x' * 10000
    with local_http(lambda request, response: (200, body, {})) as base:
        result = await http_test_preview(http_tool(base), local_env(), {})
    assert result['ok'] is True and result['status'] == 200
    assert result['preview'] == 'x' * 4096 and len(result['preview'].encode()) == 4096


async def test_http_test_preview_preserves_failing_status_and_body(local_fixtures):
    with local_http(lambda request, response: (500, b'fixture failure', {})) as base:
        result = await http_test_preview(http_tool(base), local_env(), {})
    assert result == {'ok': False, 'status': 500, 'preview': 'fixture failure'}


async def test_http_test_preview_is_redacted_before_truncation(local_fixtures, monkeypatch):
    secret = 'private-preview-credential'
    monkeypatch.setenv('PREVIEW_SECRET', secret)
    env = local_env(providers=[{'ref': 'p', 'secretRef': 'PREVIEW_SECRET'}])
    # The credential sits beyond the 4096-byte preview window: redaction must inspect the raw body first.
    body = ('a' * 5000 + secret).encode()
    with local_http(lambda request, response: (200, body, {})) as base:
        with pytest.raises(ExecutionError) as caught:
            await http_test_preview(http_tool(base), env, {})
    assert caught.value.code == 'SECRET_IN_EXECUTION_DATA'
    assert secret not in str(caught.value)


async def test_http_test_preview_validates_arguments_before_any_request(local_fixtures):
    env = local_env()
    with local_http(lambda request, response: pytest.fail('invalid arguments must not reach the endpoint')) as base:
        with pytest.raises(ExecutionError) as caught:
            await http_test_preview(http_tool(base, inputSchema={'type': 'object', 'properties': {'id': {'type': 'string'}}, 'required': ['id']}), env, {})
    assert caught.value.code == 'INVALID_TOOL_ARGUMENTS'


# --- runtime adapter routing ----------------------------------------------

class FakeModel:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.functions = None

    def bind_tools(self, functions):
        self.functions = functions
        return self


class MemoryStorage:
    async def check(self, *args):
        return {'cancelled': False}

    async def call(self, *args):
        return True


def execution():
    registry = Registry({'environments': [{'ref': 'test', 'ownerIds': ['a']}]})
    environment = registry.environment('test', 'a')
    claim = {'run': {'run_id': '00000000-0000-0000-0000-000000000001', 'owner_user_id': 'a', 'input': {}, 'environment_ref': 'test', 'environment_revision': environment['revision'], 'compile_fingerprint': None}, 'definition': sample(), 'token': 1}
    return RunExecution(claim, registry, MemoryStorage())


def llm_config(**overrides):
    config = {'providerRef': 'provider', 'modelRef': 'model-a', 'modelParameters': {}, 'allowedToolRefs': []}
    config.update(overrides)
    return config


async def test_model_adapter_routes_openai_compatible_provider(monkeypatch):
    calls = {}

    def fake_model(**kwargs):
        calls.update(kwargs)
        return FakeModel(**kwargs)

    monkeypatch.setattr('eduflow_workflow.runtime.ChatOpenAI', fake_model)
    run = execution()
    run.env['providers'] = [{'ref': 'provider', 'modelRefs': ['model-a'], 'baseUrl': 'https://models.example/v1', 'adapter': 'openai'}]
    adapter = run.model_adapter(llm_config())
    assert adapter.kwargs['model'] == 'model-a'
    assert adapter.kwargs['base_url'] == 'https://models.example/v1'
    assert adapter.kwargs['api_key'] == 'local-fixture-no-credential'
    assert adapter.kwargs['max_retries'] == 0
    client = calls['http_async_client']
    assert isinstance(client, httpx.AsyncClient)
    assert client.follow_redirects is False and client.trust_env is False
    await client.aclose()


async def test_model_adapter_routes_deepseek_by_default_and_never_constructs_openai(monkeypatch):
    monkeypatch.setattr('eduflow_workflow.runtime.ChatOpenAI', lambda **kwargs: pytest.fail('DeepSeek must not use the OpenAI adapter'))
    monkeypatch.setattr('eduflow_workflow.runtime.ChatDeepSeek', lambda **kwargs: FakeModel(**kwargs))
    monkeypatch.setenv('MODEL_CONNECTION_KEY', 'synthetic-model-key')
    run = execution()
    run.env['providers'] = [{'ref': 'provider', 'modelRefs': ['deepseek-flash'], 'secretRef': 'MODEL_CONNECTION_KEY'}]
    adapter = run.model_adapter(llm_config(modelRef='deepseek-flash'))
    assert adapter.kwargs['api_key'] == 'synthetic-model-key'
    assert adapter.kwargs['api_base'] == 'https://api.deepseek.com'


async def test_openai_compatible_provider_binds_authorized_tools(monkeypatch):
    monkeypatch.setattr('eduflow_workflow.runtime.ChatOpenAI', lambda **kwargs: FakeModel(**kwargs))
    run = execution()
    run.env['providers'] = [{'ref': 'provider', 'modelRefs': ['model-a'], 'baseUrl': 'https://models.example/v1', 'adapter': 'openai'}]
    run.env['tools'] = [{'ref': 'f', 'name': 'trusted_identity', 'description': 'Echo', 'version': 1, 'adapter': 'function', 'inputSchema': {'type': 'object'}, 'outputSchema': {'type': 'object'}, 'available': True, 'sideEffect': 'none'}]
    adapter = run.model_adapter(llm_config(allowedToolRefs=['f']))
    assert [function['function']['name'] for function in adapter.functions] == ['trusted_identity']
    await adapter.kwargs['http_async_client'].aclose()


async def test_thinking_remains_deepseek_only(monkeypatch):
    monkeypatch.setattr('eduflow_workflow.runtime.ChatOpenAI', lambda **kwargs: pytest.fail('thinking must be rejected before the SDK is constructed'))
    run = execution()
    run.env['providers'] = [{'ref': 'provider', 'modelRefs': ['model-a'], 'baseUrl': 'https://models.example/v1', 'adapter': 'openai'}]
    with pytest.raises(ExecutionError) as caught:
        run.model_adapter(llm_config(modelParameters={'thinking': {'type': 'enabled'}}))
    assert caught.value.code == 'UNSUPPORTED_MODEL_PARAMETER'


# --- compile-time model authorization -------------------------------------

def llm_definition(model_ref='model-a', provider_ref='provider'):
    definition = sample()
    definition['nodes'][1].update(type='core.llm', typeVersion=2, config={'providerRef': provider_ref, 'modelRef': model_ref, 'modelParameters': {}, 'allowedToolRefs': [], 'prompt': {'system': [], 'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'hello'}]}]}}, inputs={}, writes={})
    return definition


def provider_registry(providers):
    registry = Registry({'environments': [{'ref': 'test', 'ownerIds': ['a'], 'providers': providers}]})
    return registry, registry.environment('test', 'a')


def test_compile_requires_the_model_to_be_enabled_on_the_selected_connection():
    registry, environment = provider_registry([{'ref': 'provider', 'modelRefs': ['model-a'], 'secretRef': 'MODEL_CONNECTION_KEY'}])
    snapshot = registry.snapshot(environment)
    assert compile_definition(llm_definition(), snapshot)['valid']
    disabled = compile_definition(llm_definition(model_ref='model-b'), snapshot)
    assert not disabled['valid']
    assert [(item['code'], item['nodeId'], item['pointer']) for item in disabled['diagnostics'] if item['code'] == 'MODEL_NOT_ENABLED'] == [('MODEL_NOT_ENABLED', 'a', '/nodes/a/config/modelRef')]
    missing = compile_definition(llm_definition(provider_ref='absent'), snapshot)
    assert any(item['code'] == 'MODEL_NOT_ENABLED' for item in missing['diagnostics'])


def test_structure_validation_does_not_require_a_connection_catalog():
    assert validate_structure(llm_definition(), NODE_DESCRIPTORS, OPERATIONS)['valid']


# --- unified connection test results --------------------------------------

class FakeStorage:
    def __init__(self, rows):
        self.rows = rows

    async def call(self, name, *args):
        return copy.deepcopy(self.rows)


class FakeRegistry:
    def __init__(self, environment):
        self.env = environment

    def environment(self, ref, owner, variable_environment_id=None):
        assert (ref, owner) == ('local', 'a')
        return copy.deepcopy(self.env)


def catalog_body(ref='models'):
    return {'ownerId': 'a', 'environmentRef': 'local', 'action': 'test', 'kind': 'connection', 'ref': ref, 'version': 1}


def install_fake_storage(monkeypatch, rows):
    monkeypatch.setattr(extensions, 'Storage', lambda url: FakeStorage(rows))
    monkeypatch.setenv('WORKFLOW_DATABASE_URL', 'postgresql://fixture')


async def test_catalog_test_returns_the_unified_model_result(monkeypatch, local_fixtures):
    with local_http(lambda request, body: (200, json.dumps({'data': [{'id': 'z-model'}, {'id': 'a-model'}]}).encode(), {})) as base:
        rows = [{'kind': 'connection', 'ref': 'models', 'version': 1, 'disabled': False, 'content': {'type': 'openai-compatible', 'name': 'Gateway', 'baseUrl': base, 'modelRefs': ['a-model']}}]
        install_fake_storage(monkeypatch, rows)
        result = await extensions.catalog_operation(catalog_body(), FakeRegistry(local_env()))
    assert result['ok'] is True and result['models'] == ['a-model', 'z-model']
    assert set(result) == {'ok', 'elapsedMs', 'models'} and isinstance(result['elapsedMs'], int)


async def test_catalog_test_returns_the_unified_failure_result(monkeypatch, local_fixtures):
    with local_http(lambda request, body: (500, b'{"error":"fixture"}', {})) as base:
        rows = [{'kind': 'connection', 'ref': 'models', 'version': 1, 'disabled': False, 'content': {'type': 'openai-compatible', 'name': 'Gateway', 'baseUrl': base, 'modelRefs': ['a-model']}}]
        install_fake_storage(monkeypatch, rows)
        result = await extensions.catalog_operation(catalog_body(), FakeRegistry(local_env()))
    assert set(result) == {'ok', 'error'} and result['ok'] is False
    assert result['error']['code'] == 'CONNECTION_TEST_FAILED'


async def test_catalog_test_returns_http_preview_with_elapsed_time(monkeypatch, local_fixtures):
    with local_http(lambda request, body: (200, b'http fixture preview', {})) as base:
        rows = [{'kind': 'connection', 'ref': 'api', 'version': 1, 'disabled': False, 'content': {'type': 'http', 'name': 'Local API', 'baseUrl': base, 'path': '/preview', 'method': 'GET', 'sideEffect': 'read', 'inputSchema': {'type': 'object'}, 'outputSchema': {'type': 'object'}}}]
        install_fake_storage(monkeypatch, rows)
        environment = local_env()
        hydrate_connections(environment, 'a', rows)
        result = await extensions.catalog_operation(catalog_body('api'), FakeRegistry(environment))
    assert result['ok'] is True and result['status'] == 200 and result['preview'] == 'http fixture preview'
    assert set(result) == {'ok', 'status', 'elapsedMs', 'preview'}


async def test_catalog_test_returns_mcp_tool_names(monkeypatch):
    rows = [{'kind': 'connection', 'ref': 'mcp', 'version': 1, 'disabled': False, 'content': {'type': 'mcp-http', 'name': 'Local MCP', 'url': 'http://127.0.0.1:9/mcp', 'allowedToolNames': ['echo']}}]
    install_fake_storage(monkeypatch, rows)
    environment = local_env()
    hydrate_connections(environment, 'a', rows)

    async def discover(registry, env, connector_ref):
        return [{'name': 'echo', 'description': 'Echo tool'}, {'name': 'get-sum', 'description': 'Sum'}]

    monkeypatch.setattr(tools, 'discover', discover)
    result = await extensions.catalog_operation(catalog_body('mcp'), FakeRegistry(environment))
    assert result['ok'] is True and result['tools'] == [{'name': 'echo', 'description': 'Echo tool'}, {'name': 'get-sum', 'description': 'Sum'}]
    assert set(result) == {'ok', 'elapsedMs', 'tools'}


# --- Generic API editor contract -----------------------------------------

async def test_generic_http_connection_validates_params_headers_auth_and_output_map(local_fixtures):
    with local_http(lambda request, body: (200, b'{}', {})) as base:
        content = await validate_connection({
            'type': 'http', 'name': 'GitHub', 'baseUrl': base,
            'path': '/repos/{{owner}}/{{repo}}', 'method': 'GET', 'sideEffect': 'read',
            'params': [
                {'name': 'owner', 'source': 'node', 'value': '', 'required': True, 'description': '所有者'},
                {'name': 'page', 'source': 'fixed', 'value': '2', 'required': False, 'description': ''},
            ],
            'headers': [{'name': 'Accept', 'value': 'application/json'}],
            'auth': {'type': 'api-key-header', 'name': 'X-API-Key'},
            'settings': {'timeoutMs': 5000, 'retries': 1, 'resultPath': 'data'},
            'outputMap': [{'name': 'items', 'path': 'items', 'type': 'array'}],
        }, 'synthetic-key', local_env())
    assert content['params'][1] == {'name': 'page', 'source': 'fixed', 'value': '2', 'required': False, 'description': ''}
    assert content['headers'] == [{'name': 'Accept', 'value': 'application/json'}]
    assert content['auth'] == {'type': 'api-key-header', 'name': 'X-API-Key'}
    assert content['settings'] == {'timeoutMs': 5000, 'retries': 1, 'resultPath': 'data'}
    assert content['outputMap'] == [{'name': 'items', 'path': 'items', 'type': 'array'}]


async def test_generic_http_connection_rejects_duplicate_params_and_get_body(local_fixtures):
    with local_http(lambda request, body: (200, b'{}', {})) as base:
        with pytest.raises(ExecutionError) as duplicate:
            await validate_connection({'type': 'http', 'name': 'x', 'baseUrl': base, 'path': '/x', 'method': 'GET', 'sideEffect': 'read',
                'params': [{'name': 'q', 'source': 'node'}, {'name': 'q', 'source': 'fixed', 'value': '1'}]}, '', local_env())
        assert duplicate.value.code == 'INVALID_CONNECTION'
        with pytest.raises(ExecutionError) as body:
            await validate_connection({'type': 'http', 'name': 'x', 'baseUrl': base, 'path': '/x', 'method': 'GET', 'sideEffect': 'read', 'body': {'mode': 'json', 'text': '{}'}}, '', local_env())
        assert body.value.code == 'INVALID_CONNECTION'


def test_hydrate_generic_http_connection_builds_required_inputs_and_server_side_values():
    environment = local_env(variables={'OWNER': 'openai'})
    content = {
        'type': 'http', 'name': 'GitHub', 'baseUrl': 'https://api.github.com', 'path': '/repos/{{owner}}/{{repo}}',
        'method': 'GET', 'sideEffect': 'read', 'params': [
            {'name': 'owner', 'source': 'node', 'value': '', 'required': True, 'description': '所有者'},
            {'name': 'repo', 'source': 'node', 'value': '', 'required': True, 'description': '仓库'},
            {'name': 'tags', 'source': 'fixed', 'value': 'story', 'required': False, 'description': ''},
            {'name': 'account', 'source': 'variable', 'value': 'OWNER', 'required': False, 'description': ''},
        ], 'headers': [{'name': 'Accept', 'value': 'application/json'}],
        'auth': {'type': 'bearer'}, 'settings': {'timeoutMs': 8000}, 'outputMap': [{'name': 'hits', 'path': 'hits', 'type': 'array'}],
        'secretRef': 'TEST_GITHUB_TOKEN',
    }
    environment = hydrate_connections(environment, 'a', [{'kind': 'connection', 'ref': 'github', 'version': 1, 'disabled': False, 'content': content}])
    tool = next(item for item in environment['tools'] if item['ref'] == 'p4:a:github:1')
    assert tool['inputSchema']['required'] == ['owner', 'repo']
    assert tool['inputSchema']['properties']['owner']['description'] == '所有者'
    assert tool['queryParams'] == {'tags': 'story', 'account': 'openai'}
    assert tool['queryArgumentNames'] == []
    assert tool['requestHeaders'] == {'Accept': 'application/json'}
    assert tool['authSecretRef'] == 'TEST_GITHUB_TOKEN'
    assert tool['outputMap'] == [{'name': 'hits', 'path': 'hits', 'type': 'array'}]


async def test_invoke_generic_http_connection_sends_bearer_path_query_and_maps_output(local_fixtures, monkeypatch):
    monkeypatch.setenv('TEST_GITHUB_TOKEN', 'private-api-token')
    seen = {}

    def handler(request, body):
        seen['path'] = request.path
        seen['authorization'] = request.headers.get('Authorization')
        seen['accept'] = request.headers.get('Accept')
        seen['body'] = body.decode()
        return 200, json.dumps({'data': {'items': [{'title': 'A'}]}}).encode(), {}

    with local_http(handler) as base:
        environment = local_env(providers=[{'ref': 'p', 'secretRef': 'TEST_GITHUB_TOKEN'}])
        content = {
            'type': 'http', 'name': 'GitHub', 'baseUrl': base, 'path': '/repos/{{owner}}/items', 'method': 'POST', 'sideEffect': 'write',
            'params': [
                {'name': 'owner', 'source': 'node', 'value': '', 'required': True, 'description': ''},
                {'name': 'repo', 'source': 'node', 'value': '', 'required': True, 'description': ''},
                {'name': 'page', 'source': 'fixed', 'value': '2', 'required': False, 'description': ''},
            ], 'headers': [{'name': 'Accept', 'value': 'application/json'}],
            'body': {'mode': 'json', 'text': '{"repo": "{{repo}}"}'}, 'auth': {'type': 'bearer'},
            'settings': {'timeoutMs': 5000}, 'outputMap': [{'name': 'items', 'path': 'data.items', 'type': 'array'}],
            'secretRef': 'TEST_GITHUB_TOKEN',
        }
        environment = hydrate_connections(environment, 'a', [{'kind': 'connection', 'ref': 'github', 'version': 1, 'disabled': False, 'content': content}])
        tool = next(item for item in environment['tools'] if item['ref'] == 'p4:a:github:1')
        result = await tools.invoke_tool(tool, environment, {'owner': 'openai', 'repo': 'openai-python'}, 5)
    assert seen['path'] == '/repos/openai/items?page=2'
    assert seen['authorization'] == 'Bearer private-api-token'
    assert seen['accept'] == 'application/json'
    assert json.loads(seen['body']) == {'repo': 'openai-python'}
    assert result == {'items': [{'title': 'A'}]}


async def test_fetch_model_reply_returns_first_reply_text(local_fixtures):
    seen = {}

    def handler(request, body):
        seen['path'] = request.path
        seen['body'] = json.loads(body.decode())
        return 200, json.dumps({'choices': [{'message': {'content': '连接可用。'}}]}).encode(), {}

    with local_http(handler) as base:
        reply = await extensions.fetch_model_reply(base, None, 'deepseek-flash', '请确认连接。', local_env())
    assert reply == '连接可用。'
    assert seen['path'] == '/chat/completions'
    assert seen['body']['model'] == 'deepseek-flash'
    assert seen['body']['messages'] == [{'role': 'user', 'content': '请确认连接。'}]


def test_builtin_hacker_news_search_uses_optional_words_without_typo_fallback():
    from eduflow_workflow.registry import BUILTIN_TOOLS
    hn = next(tool for tool in BUILTIN_TOOLS if tool['ref'] == 'hn_search')
    assert 'optionalWords={query}' in hn['path']
    assert 'typoTolerance=false' in hn['path']
    assert 'removeWordsIfNoResults' not in hn['path']
    assert 'hitsPerPage=5' in hn['path']
