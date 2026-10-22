import json
import uuid

import pytest

from eduflow_workflow import operations, server
from eduflow_workflow.contracts import ExecutionError
from eduflow_workflow.extensions import hydrate_connections
from eduflow_workflow.registry import Registry


def configure_hosted(monkeypatch, environments):
    monkeypatch.setenv('WORKFLOW_DEPLOYMENT_MODE', 'hosted')
    monkeypatch.delenv('WORKFLOW_ALLOW_LOCAL_FIXTURES', raising=False)
    monkeypatch.setenv('WORKFLOW_SANDBOX_BACKEND', 'vercel')
    monkeypatch.setenv('WORKFLOW_SANDBOX_IMAGE', 'image@sha256:' + 'a' * 64)
    monkeypatch.setenv('WORKFLOW_INTERNAL_TOKEN', 'x' * 32)
    monkeypatch.setenv('WORKFLOW_DATABASE_URL', 'postgresql://workflow_worker:secret@db.example.com:5432/postgres?sslmode=require')
    monkeypatch.setenv('WORKFLOW_ENVIRONMENTS_JSON', json.dumps({'environments': environments}))


def test_authenticated_runtime_rejects_owner_ids_or_capabilities():
    with pytest.raises(ExecutionError):
        Registry({'environments': [{'ref': 'shared', 'access': 'authenticated', 'ownerIds': ['a']}]})
    with pytest.raises(ExecutionError):
        Registry({'environments': [{'ref': 'shared', 'access': 'authenticated', 'providers': [{'ref': 'p', 'modelRefs': ['m']}]}]})
    with pytest.raises(ExecutionError):
        Registry({'environments': [{'ref': 'shared', 'access': 'public'}]})


def test_owner_scoped_environment_still_filters_and_reports_access():
    registry = Registry({'environments': [{'ref': 'restricted', 'ownerIds': ['a']}]})
    environment = registry.environment('restricted', 'a')
    assert environment['ref'] == 'restricted'
    assert 'access' not in environment
    assert registry.public_environment(environment)['access'] == 'owners'
    with pytest.raises(ExecutionError) as caught:
        registry.environment('restricted', 'b')
    assert caught.value.code == 'ENVIRONMENT_FORBIDDEN'


async def test_authenticated_runtime_is_visible_to_any_authenticated_owner(monkeypatch):
    registry = Registry({'environments': [{'ref': 'shared', 'name': 'Shared', 'access': 'authenticated'}]})
    monkeypatch.setattr(server, 'registry', registry)
    result = await server.catalog({'ownerId': 'user-a'})
    assert [item['environmentRef'] for item in result['items']] == ['shared']
    assert result['items'][0]['access'] == 'authenticated'
    assert result['items'][0]['providers'] == []
    assert (await server.catalog({'ownerId': ''}))['items'] == []


def test_hosted_shared_runtime_requires_no_owner_and_no_secrets(monkeypatch):
    configure_hosted(monkeypatch, [{'ref': 'shared', 'access': 'authenticated'}])
    operations.assert_hosted_configuration()

    configure_hosted(monkeypatch, [{'ref': 'shared', 'access': 'authenticated', 'providers': [{'ref': 'p', 'modelRefs': ['m']}]}])
    with pytest.raises(RuntimeError):
        operations.assert_hosted_configuration()

    configure_hosted(monkeypatch, [{'ref': 'shared', 'access': 'authenticated', 'ownerIds': [str(uuid.uuid4())]}])
    with pytest.raises(RuntimeError):
        operations.assert_hosted_configuration()


def test_hosted_owner_runtime_still_requires_explicit_owner_ids(monkeypatch):
    owner = str(uuid.uuid4())
    configure_hosted(monkeypatch, [{'ref': 'restricted', 'ownerIds': [owner]}])
    operations.assert_hosted_configuration()

    configure_hosted(monkeypatch, [{'ref': 'restricted'}])
    with pytest.raises(RuntimeError):
        operations.assert_hosted_configuration()

    configure_hosted(monkeypatch, [{'ref': 'restricted', 'access': 'authenticated', 'ownerIds': [owner]}])
    with pytest.raises(RuntimeError):
        operations.assert_hosted_configuration()


def test_hosted_rejects_unknown_access_mode(monkeypatch):
    configure_hosted(monkeypatch, [{'ref': 'legacy', 'access': 'public', 'ownerIds': [str(uuid.uuid4())]}])
    with pytest.raises(RuntimeError):
        operations.assert_hosted_configuration()


def test_capability_metadata_does_not_change_owner_environment_revision():
    registry = Registry({'environments': [{'ref': 'restricted', 'ownerIds': ['a']}]})
    environment = registry.environment('restricted', 'a')
    revision = environment['revision']
    environment['capabilityOrigins'] = {'p4:a:model:2': {'origin': 'user', 'connectionRef': 'model', 'version': 2}}
    registry.update(environment)
    assert environment['revision'] == revision


def test_user_connection_metadata_is_projected_for_display():
    registry = Registry({'environments': [{'ref': 'restricted', 'ownerIds': ['a']}]})
    environment = registry.environment('restricted', 'a')
    hydrate_connections(environment, 'a', [
        {'kind': 'connection', 'ref': 'model', 'version': 2, 'disabled': False, 'content': {'type': 'deepseek', 'name': 'My model', 'modelRefs': ['deepseek-flash'], 'secretRef': 'vault:1'}},
        {'kind': 'connection', 'ref': 'search', 'version': 3, 'disabled': False, 'content': {'type': 'http', 'name': 'Search', 'baseUrl': 'https://example.com', 'path': '/search', 'method': 'GET', 'sideEffect': 'read', 'inputSchema': {'type': 'object'}, 'outputSchema': {'type': 'object'}}},
    ])
    registry.update(environment)
    provider = next(item for item in registry.public_environment(environment)['providers'] if item['connectionRef'] == 'model')
    tool = next(item for item in registry.public_tools(environment) if item['connectionRef'] == 'search')
    assert provider['origin'] == 'user' and provider['version'] == 2
    assert tool['origin'] == 'user' and tool['version'] == 3
