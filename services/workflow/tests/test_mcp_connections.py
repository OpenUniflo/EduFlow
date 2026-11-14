"""P1 remote MCP authentication, tool scope and OAuth refresh contracts."""
import json
import time
import pytest

from eduflow_workflow import extensions, tools
from eduflow_workflow.contracts import ExecutionError
from test_extensions_providers import local_env, local_http
from eduflow_workflow.extensions import mcp_connector, reusable_secret_ref, validate_connection


@pytest.fixture
def local_fixtures(monkeypatch):
    monkeypatch.setenv('WORKFLOW_ALLOW_LOCAL_FIXTURES', '1')


def mcp_content(**overrides):
    content = {'type': 'mcp-http', 'name': 'Remote MCP', 'url': 'https://mcp.example.com/mcp', 'transport': 'streamable-http', 'authType': 'none', 'allowedToolNames': []}
    content.update(overrides)
    return content


async def test_mcp_validation_keeps_remote_only_and_supports_empty_allowlist(local_fixtures):
    with local_http(lambda request, body: (200, b'{}', {})) as base:
        content = await validate_connection(mcp_content(url=base + '/mcp'), '', local_env())
    assert content['authType'] == 'none'
    assert content['allowedToolNames'] == []
    assert content['transport'] == 'streamable-http'
    with pytest.raises(ExecutionError) as error:
        await validate_connection(mcp_content(url='http://example.com/mcp'), '', local_env())
    assert error.value.code == 'INVALID_CONNECTION'
    with pytest.raises(ExecutionError) as error:
        await extensions.assert_destination('https://169.254.169.254', local_env())
    assert error.value.code == 'HTTP_DESTINATION_FORBIDDEN'


async def test_mcp_validation_requires_bearer_or_api_key_credentials_and_bounds_tools(local_fixtures):
    with pytest.raises(ExecutionError) as error:
        await validate_connection(mcp_content(authType='bearer', allowedToolNames=['echo']), '', local_env())
    assert error.value.code == 'INVALID_CONNECTION'
    with local_http(lambda request, body: (200, b'{}', {})) as base:
        bearer = await validate_connection(mcp_content(url=base + '/mcp', authType='bearer', allowedToolNames=['echo', 'echo', 'add']), 'token', local_env())
        api_key = await validate_connection(mcp_content(url=base + '/mcp', authType='api-key', credentialHeader='X-API-Key'), 'key', local_env())
        legacy = await validate_connection(mcp_content(url=base + '/mcp', authType='legacy', credentialHeader='X-API-Key'), 'key', local_env())
        with pytest.raises(ExecutionError):
            await validate_connection(mcp_content(url=base + '/mcp', authType='api-key', credentialHeader='Host'), 'key', local_env())
        with pytest.raises(ExecutionError):
            await validate_connection(mcp_content(url=base + '/mcp', allowedToolNames=['bad tool']), '', local_env())
    assert bearer['credentialHeader'] == 'Authorization'
    assert bearer['allowedToolNames'] == ['echo', 'add']
    assert api_key['credentialHeader'] == 'X-API-Key'
    assert legacy['credentialHeader'] == 'X-API-Key'


def test_oauth_secret_reuse_ignores_default_header_normalization():
    rows = [{'kind': 'connection', 'ref': 'oauth', 'version': 1, 'disabled': False, 'content': {'type': 'mcp-http', 'url': 'https://mcp.example.com/mcp', 'authType': 'oauth', 'credentialHeader': 'Authorization', 'secretRef': 'vault:abc'}}]
    assert reusable_secret_ref(rows, 'oauth', mcp_content(authType='oauth', oauth={'clientId': 'c', 'tokenEndpoint': 'https://auth.example.com/token'})) == 'vault:abc'
    assert reusable_secret_ref(rows, 'oauth', mcp_content(authType='bearer')) is None


async def test_mcp_headers_supports_none_bearer_api_key_and_legacy(monkeypatch):
    monkeypatch.setattr(tools, 'secret', lambda ref: {'vault:bearer': 'bearer-token', 'vault:key': 'key-token', 'vault:legacy': 'Bearer legacy-token'}[ref])
    connector = mcp_connector({'type': 'mcp-http', 'url': 'https://mcp.example.com/mcp', 'authType': 'none'}, 'x', 'owner')
    assert await tools.mcp_headers(connector, {}) == {}
    connector = mcp_connector({'type': 'mcp-http', 'url': 'https://mcp.example.com/mcp', 'authType': 'bearer', 'secretRef': 'vault:bearer'}, 'x', 'owner')
    assert await tools.mcp_headers(connector, {}) == {'Authorization': 'Bearer bearer-token'}
    connector = mcp_connector({'type': 'mcp-http', 'url': 'https://mcp.example.com/mcp', 'authType': 'api-key', 'credentialHeader': 'X-API-Key', 'secretRef': 'vault:key'}, 'x', 'owner')
    assert await tools.mcp_headers(connector, {}) == {'X-API-Key': 'key-token'}
    connector = mcp_connector({'type': 'mcp-http', 'url': 'https://mcp.example.com/mcp', 'authType': 'legacy', 'secretRef': 'vault:legacy'}, 'x', 'owner')
    assert await tools.mcp_headers(connector, {}) == {'Authorization': 'Bearer legacy-token'}


async def test_oauth_refresh_is_async_serialized_and_really_overlaps(monkeypatch, local_fixtures):
    import asyncio
    captured = {'bodies': [], 'interleaved': False, 'sync_connect': False}
    monkeypatch.setenv('WORKFLOW_DATABASE_URL', 'postgresql://workflow_worker@127.0.0.1:54322/postgres')
    def handler(request, body):
        captured['bodies'].append(body.decode())
        time.sleep(0.25)  # keep the first refresh in flight while task 2 waits on the DB lock
        return 200, json.dumps({'access_token': 'new-token', 'refresh_token': 'rotated-refresh', 'expires_in': 3600, 'token_type': 'Bearer'}).encode(), {}
    with local_http(handler) as base:
        state = {'bundle': {'v': 1, 'access_token': 'expired', 'refresh_token': 'refresh', 'client_id': 'client', 'token_endpoint': base + '/token', 'expires_at': 0}, 'lock': asyncio.Lock()}
        monkeypatch.setattr(tools, 'secret', lambda ref: json.dumps(state['bundle']))
        class FakeCursor:
            def __init__(self): self.row = None
            async def __aenter__(self): return self
            async def __aexit__(self, *args): return False
            async def execute(self, query, params=None):
                if 'pg_advisory_xact_lock' in query:
                    if state['lock'].locked(): captured['interleaved'] = True
                    await state['lock'].acquire()
                elif 'p4_secret' in query:
                    self.row = (json.dumps(state['bundle']),)
                elif 'mcp_oauth_secret_update' in query:
                    state['bundle'] = json.loads(params[1])
                    self.row = None
            async def fetchone(self): return self.row
        class FakeAsyncConnection:
            def __init__(self): self.cursor_obj = FakeCursor()
            @classmethod
            async def connect(cls, *args, **kwargs): return cls()
            async def __aenter__(self): return self
            async def __aexit__(self, *args):
                if state['lock'].locked(): state['lock'].release()
                return False
            def cursor(self): return self.cursor_obj
        import psycopg
        monkeypatch.setattr(psycopg, 'AsyncConnection', FakeAsyncConnection)
        def reject_sync(*args, **kwargs):
            captured['sync_connect'] = True
            raise AssertionError('sync psycopg.connect must not run in an async refresh')
        monkeypatch.setattr(psycopg, 'connect', reject_sync)
        connector = mcp_connector({'type': 'mcp-http', 'url': 'https://mcp.example.com/mcp', 'authType': 'oauth', 'secretRef': 'vault:oauth'}, 'x', 'owner')
        async def refresh(): return await tools.mcp_headers(connector, local_env())
        # Real overlap with a hard timeout: a blocking sync connection would
        # deadlock here and fail instead of hanging the suite.
        first, second = await asyncio.wait_for(asyncio.gather(refresh(), refresh()), timeout=5)
        assert first == {'Authorization': 'Bearer new-token'}
        assert second == {'Authorization': 'Bearer new-token'}
        assert captured['interleaved'] is True
        assert captured['sync_connect'] is False
        assert len(captured['bodies']) == 1
        assert 'grant_type=refresh_token' in captured['bodies'][0]
        assert 'refresh_token=refresh' in captured['bodies'][0]
        assert state['bundle']['access_token'] == 'new-token'
        assert state['bundle']['refresh_token'] == 'rotated-refresh'
        assert state['bundle']['expires_at'] > time.time() * 1000


async def test_mcp_headers_legacy_header_secret_refs_and_request_only_ephemeral(monkeypatch):
    monkeypatch.setattr(tools, 'secret', lambda ref: {'vault:legacy': 'legacy-value', 'vault:key': 'saved-key'}[ref])
    legacy = {'ref': 'x', 'url': 'https://mcp.example.com/mcp', 'headerSecretRefs': {'Authorization': 'vault:legacy', 'X-API-Key': 'vault:key'}}
    assert await tools.mcp_headers(legacy, {}) == {'Authorization': 'legacy-value', 'X-API-Key': 'saved-key'}
    ephemeral = mcp_connector({'type': 'mcp-http', 'url': 'https://mcp.example.com/mcp', 'authType': 'bearer'}, 'inspect', 'owner', credential='request-only-token')
    assert await tools.mcp_headers(ephemeral, {}) == {'Authorization': 'Bearer request-only-token'}
    api_key = mcp_connector({'type': 'mcp-http', 'url': 'https://mcp.example.com/mcp', 'authType': 'api-key', 'credentialHeader': 'X-API-Key'}, 'inspect', 'owner', credential='request-only-key')
    assert await tools.mcp_headers(api_key, {}) == {'X-API-Key': 'request-only-key'}


def test_discovery_metadata_does_not_invalidate_its_own_cache_digest():
    from eduflow_workflow.extensions import connector_cache_digest
    connector=mcp_connector(mcp_content(),'p4:owner:docs:1','owner')
    first=connector_cache_digest(connector)
    connector['discoveredToolNames']=['read_wiki_structure','ask_question']
    assert connector_cache_digest(connector)==first


def test_public_environment_exposes_full_discovery_metadata_without_tools():
    from eduflow_workflow.registry import Registry
    registry=Registry({"environments":[{"ref":"local","name":"Local","ownerIds":["owner"]}]})
    env=registry.environment('local','owner')
    env['connectors']=[{'ref':'p4:owner:docs:1','name':'DeepWiki','transport':'streamable-http','discoveredToolNames':['read_wiki_structure','ask_question','read_wiki_contents']}]
    connector=registry.public_environment(env)['connectors'][0]
    assert connector['discoveredToolNames']==['read_wiki_structure','ask_question','read_wiki_contents']
    assert 'tools' not in connector


def test_mcp_tool_effects_stay_conservative_and_do_not_trust_declarations():
    from types import SimpleNamespace
    def tool(name, read_only=None, destructive=None):
        return SimpleNamespace(name=name, description=name, inputSchema={'type': 'object'}, outputSchema=None, model_dump=lambda **_: {'name': name}, annotations=SimpleNamespace(readOnlyHint=read_only, destructiveHint=destructive) if read_only is not None or destructive is not None else None)
    read_name = tool('read_wiki_structure')
    declared_read = tool('read_page', read_only=True, destructive=False)
    malicious = tool('read_page', read_only=True, destructive=True)
    write = tool('update_page', destructive=True)
    delete_with_read_hint = tool('delete_page', read_only=True, destructive=False)
    unknown = tool('do_something')
    assert tools.mcp_tool_effect(read_name) == 'unknown'
    assert tools.mcp_tool_effect(declared_read) == 'unknown'
    assert tools.mcp_tool_effect(malicious) == 'write'
    assert tools.mcp_tool_effect(write) == 'write'
    assert tools.mcp_tool_effect(delete_with_read_hint) == 'unknown'
    assert tools.mcp_tool_effect(unknown) == 'unknown'
    connector = mcp_connector(mcp_content(), 'p4:owner:docs:1', 'owner')
    described = tools._tool_descriptor(connector, 'p4:owner:docs:1', declared_read)
    assert described['sideEffect'] == 'unknown'
    assert described['declaredReadOnly'] is True and described['declaredDestructive'] is False
    assert connector['toolEffectPolicy'] == 5


def test_preflight_results_redact_request_credential():
    payload = extensions._scrub_ephemeral({'description': 'token request-only-token', 'nested': ['request-only-token']}, 'request-only-token')
    assert payload == {'description': 'token [REDACTED]', 'nested': ['[REDACTED]']}


def test_current_owner_scope_applies_to_every_immutable_version():
    v1 = {'kind': 'connection', 'ref': 'docs', 'version': 1, 'disabled': False, 'content': {'type': 'mcp-http', 'url': 'https://mcp.example.com/mcp', 'authType': 'none', 'allowedToolNames': ['echo', 'add']}}
    v2 = {'kind': 'connection', 'ref': 'docs', 'version': 2, 'disabled': False, 'content': {'type': 'mcp-http', 'url': 'https://mcp.example.com/mcp', 'authType': 'none', 'allowedToolNames': ['echo']}}
    env = local_env()
    extensions.hydrate_connections(env, 'owner', [v1, v2])
    by_ref = {item['ref']: item for item in env['connectors']}
    assert by_ref['p4:owner:docs:1']['allowedToolNames'] == ['echo']
    assert by_ref['p4:owner:docs:2']['allowedToolNames'] == ['echo']
    disabled_v1 = {**v1, 'disabled': True}
    disabled_v2 = {**v2, 'disabled': True}
    env = local_env()
    extensions.hydrate_connections(env, 'owner', [disabled_v1, disabled_v2])
    assert env['connectors'] == []


async def test_old_mcp_binding_is_rejected_by_current_allowlist():
    tool = {'ref': 'p4:owner:docs:1:add', 'name': 'add', 'adapter': 'mcp', 'connectorRef': 'p4:owner:docs:1', 'inputSchema': {'type': 'object'}, 'outputSchema': {'type': 'object'}, 'sideEffect': 'read'}
    env = local_env(connectors=[{'ref': 'p4:owner:docs:1', 'url': 'https://mcp.example.com/mcp', 'authType': 'none', 'allowedToolNames': ['echo']}])
    with pytest.raises(ExecutionError) as error:
        await tools.invoke_tool(tool, env, {}, 10)
    assert error.value.code == 'MCP_TOOL_NOT_ALLOWED'
    env = local_env(connectors=[])
    with pytest.raises(ExecutionError) as error:
        await tools.invoke_tool(tool, env, {}, 10)
    assert error.value.code == 'MCP_CONNECTION_DISABLED'


async def test_inspect_tools_maps_a_rejected_credential(local_fixtures):
    with local_http(lambda request, body: (401, b'{"error":"unauthorized"}', {'WWW-Authenticate': 'Bearer'})) as base:
        connector = {'ref': 'mock', 'name': 'mock', 'url': base + '/mcp', 'transport': 'streamable-http', 'allowedToolNames': [], 'sideEffect': 'write', 'authType': 'none'}
        with pytest.raises(ExecutionError) as error:
            await tools.inspect_tools(connector, local_env())
    assert error.value.code == 'MCP_AUTH_REQUIRED'
