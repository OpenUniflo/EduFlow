"""M13: owner variable environments resolve into frozen Run variables."""
import copy

import pytest

from eduflow_workflow import server
from eduflow_workflow.contracts import ExecutionError
from eduflow_workflow.registry import Registry, requested_variable_environment, resolve_variable_configuration, restore_frozen_environment
from eduflow_workflow.runtime import RunExecution
from test_contracts import sample
from test_runtime import MemoryStorage

CONFIGURATION = {
    'revision': 4,
    'variables': [
        {'key': 'API_HOST', 'value': 'https://default.example', 'overrides': {'dev': 'https://dev.example'}},
        {'key': 'LIMIT', 'value': 1, 'overrides': {'prod': 5}},
        {'key': 'FLAG', 'value': True, 'overrides': {}},
    ],
    'environments': [{'id': 'dev', 'name': '开发'}, {'id': 'prod', 'name': '正式'}],
    'default_environment_id': 'prod',
}


def registry_with(monkeypatch, configuration=CONFIGURATION):
    registry = Registry({'environments': [{'ref': 'test', 'ownerIds': ['a']}]})
    monkeypatch.setattr(Registry, 'variable_configuration', lambda self, owner: copy.deepcopy(configuration))
    return registry


# --- resolution ------------------------------------------------------------

def test_default_variable_environment_uses_its_overrides():
    resolution = resolve_variable_configuration(CONFIGURATION)
    assert resolution['variables'] == {'API_HOST': 'https://default.example', 'LIMIT': 5, 'FLAG': True}
    assert resolution['variableEnvironment'] == {'id': 'prod', 'name': '正式'}
    assert resolution['variableEnvironmentId'] == 'prod' and resolution['defaultVariableEnvironmentId'] == 'prod'
    assert resolution['revision'] == 4


def test_explicit_variable_environment_overrides_only_its_own_keys():
    resolution = resolve_variable_configuration(CONFIGURATION, 'dev')
    assert resolution['variables'] == {'API_HOST': 'https://dev.example', 'LIMIT': 1, 'FLAG': True}
    assert resolution['variableEnvironment'] == {'id': 'dev', 'name': '开发'}


def test_without_default_environment_pure_defaults_are_used():
    configuration = {**CONFIGURATION, 'default_environment_id': None}
    resolution = resolve_variable_configuration(configuration)
    assert resolution['variables'] == {'API_HOST': 'https://default.example', 'LIMIT': 1, 'FLAG': True}
    assert resolution['variableEnvironment'] is None and resolution['variableEnvironmentId'] is None


def test_camel_case_default_id_is_accepted():
    configuration = {'revision': 1, 'variables': [{'key': 'A', 'value': 1, 'overrides': {'dev': 2}}], 'environments': [{'id': 'dev', 'name': 'Dev'}], 'defaultEnvironmentId': 'dev'}
    assert resolve_variable_configuration(configuration)['variables'] == {'A': 2}


def test_old_rpc_without_environments_keeps_default_values():
    configuration = {'revision': 1, 'variables': [{'key': 'A', 'value': 1, 'overrides': {'test': 9}}]}
    resolution = resolve_variable_configuration(configuration)
    assert resolution['variables'] == {'A': 1}
    assert resolution['variableEnvironment'] is None and resolution['defaultVariableEnvironmentId'] is None


def test_old_runtime_ref_overrides_are_not_reinterpreted_as_variable_environments():
    configuration = {'revision': 1, 'variables': [{'key': 'A', 'value': 1, 'overrides': {'test': 9}}], 'environments': [{'id': 'dev', 'name': 'Dev'}], 'default_environment_id': None}
    assert resolve_variable_configuration(configuration, 'dev')['variables'] == {'A': 1}


def test_stale_default_environment_falls_back_to_defaults():
    configuration = {**CONFIGURATION, 'environments': [{'id': 'dev', 'name': '开发'}], 'default_environment_id': 'removed'}
    resolution = resolve_variable_configuration(configuration)
    assert resolution['variables'] == {'API_HOST': 'https://default.example', 'LIMIT': 1, 'FLAG': True}
    assert resolution['variableEnvironment'] is None


@pytest.mark.parametrize('requested', ['missing', '', 'test'])
def test_unknown_explicit_environment_is_rejected(requested):
    with pytest.raises(ExecutionError) as caught:
        resolve_variable_configuration(CONFIGURATION, requested)
    assert caught.value.code == 'INVALID_VARIABLE_ENVIRONMENT' and caught.value.category == 'policy'


def test_unknown_explicit_environment_against_legacy_rpc_is_rejected():
    with pytest.raises(ExecutionError) as caught:
        resolve_variable_configuration({'revision': 1, 'variables': []}, 'dev')
    assert caught.value.code == 'INVALID_VARIABLE_ENVIRONMENT'


@pytest.mark.parametrize('body,expected', [
    ({}, None),
    ({'variableEnvironmentId': None}, None),
    ({'variableEnvironmentId': 'dev'}, 'dev'),
])
def test_requested_variable_environment_reader(body, expected):
    assert requested_variable_environment(body) == expected


@pytest.mark.parametrize('value', ['', 3, True, ['dev'], 'x' * 129])
def test_requested_variable_environment_reader_rejects_invalid_values(value):
    with pytest.raises(ExecutionError) as caught:
        requested_variable_environment({'variableEnvironmentId': value})
    assert caught.value.code == 'INVALID_VARIABLE_ENVIRONMENT'


# --- registry integration --------------------------------------------------

def test_registry_environment_defaults_and_selection(monkeypatch):
    registry = registry_with(monkeypatch)
    default = registry.environment('test', 'a')
    selected = registry.environment('test', 'a', 'dev')
    assert default['variables'] == {'API_HOST': 'https://default.example', 'LIMIT': 5, 'FLAG': True}
    assert default['variableEnvironment'] == {'id': 'prod', 'name': '正式'}
    assert selected['variables'] == {'API_HOST': 'https://dev.example', 'LIMIT': 1, 'FLAG': True}
    assert selected['variableEnvironment'] == {'id': 'dev', 'name': '开发'}
    assert selected['variableEnvironmentId'] == 'dev' and selected['configurationRevision'] == 4


def test_registry_environment_without_configuration_keeps_empty_defaults(monkeypatch):
    registry = registry_with(monkeypatch, configuration=None)
    environment = registry.environment('test', 'a')
    assert environment['variables'] == {} and environment['variableEnvironment'] is None
    with pytest.raises(ExecutionError) as caught:
        registry.environment('test', 'a', 'dev')
    assert caught.value.code == 'INVALID_VARIABLE_ENVIRONMENT'


def test_registry_environment_rejects_unknown_requested_id(monkeypatch):
    registry = registry_with(monkeypatch)
    with pytest.raises(ExecutionError) as caught:
        registry.environment('test', 'a', 'absent')
    assert caught.value.code == 'INVALID_VARIABLE_ENVIRONMENT'


def test_environment_revision_ignores_variable_values_and_selection(monkeypatch):
    registry = registry_with(monkeypatch)
    default = registry.environment('test', 'a')
    selected = registry.environment('test', 'a', 'dev')
    registry.update(default)
    registry.update(selected)
    assert default['revision'] == selected['revision']


def test_snapshot_freezes_variables_and_variable_environment(monkeypatch):
    registry = registry_with(monkeypatch)
    snapshot = registry.snapshot(registry.environment('test', 'a', 'dev'))
    assert snapshot['variables'] == {'API_HOST': 'https://dev.example', 'LIMIT': 1, 'FLAG': True}
    assert snapshot['variableEnvironment'] == {'id': 'dev', 'name': '开发'}
    assert snapshot['variableEnvironmentId'] == 'dev' and snapshot['configurationRevision'] == 4


def test_restore_frozen_environment_reproduces_the_frozen_digest(monkeypatch):
    registry = registry_with(monkeypatch)
    frozen = registry.snapshot(registry.environment('test', 'a', 'dev'))
    fresh = registry.environment('test', 'a')
    assert fresh['variables'] != frozen['variables']
    restore_frozen_environment(fresh, frozen)
    assert fresh['variables'] == frozen['variables']
    assert fresh['variableEnvironment'] == {'id': 'dev', 'name': '开发'}
    assert registry.snapshot(fresh)['digest'] == frozen['digest']


def test_runtime_execution_restores_the_frozen_variable_environment(monkeypatch):
    registry = registry_with(monkeypatch)
    frozen = registry.snapshot(registry.environment('test', 'a', 'dev'))
    environment = registry.environment('test', 'a')
    claim = {'run': {'run_id': '00000000-0000-0000-0000-000000000001', 'owner_user_id': 'a', 'input': {}, 'environment_ref': 'test', 'environment_revision': environment['revision'], 'compile_fingerprint': None, 'registry_snapshot': frozen}, 'definition': sample(), 'token': 1}
    execution = RunExecution(claim, registry, MemoryStorage())
    assert execution.env['variables'] == {'API_HOST': 'https://dev.example', 'LIMIT': 1, 'FLAG': True}
    assert execution.env['variableEnvironment'] == {'id': 'dev', 'name': '开发'}
    assert execution.env['variableEnvironmentId'] == 'dev'


# --- endpoint freeze -------------------------------------------------------

async def test_validation_freezes_the_requested_variable_environment(monkeypatch):
    registry = registry_with(monkeypatch)
    monkeypatch.setattr(server, 'registry', registry)
    selected = await server.validation({'ownerId': 'a', 'environmentRef': 'test', 'variableEnvironmentId': 'dev', 'definition': sample()})
    assert selected['valid'] and selected['registrySnapshot']['variables']['API_HOST'] == 'https://dev.example'
    assert selected['registrySnapshot']['variableEnvironment'] == {'id': 'dev', 'name': '开发'}
    assert selected['registrySnapshot']['variableEnvironmentId'] == 'dev'
    default = await server.validation({'ownerId': 'a', 'environmentRef': 'test', 'definition': sample()})
    assert default['registrySnapshot']['variables']['API_HOST'] == 'https://default.example'
    assert default['registrySnapshot']['variableEnvironment'] == {'id': 'prod', 'name': '正式'}


async def test_validation_rejects_an_unknown_variable_environment(monkeypatch):
    registry = registry_with(monkeypatch)
    monkeypatch.setattr(server, 'registry', registry)
    with pytest.raises(ExecutionError) as caught:
        await server.validation({'ownerId': 'a', 'environmentRef': 'test', 'variableEnvironmentId': 'absent', 'definition': sample()})
    assert caught.value.code == 'INVALID_VARIABLE_ENVIRONMENT'


async def test_catalog_exposes_variables_for_the_requested_environment(monkeypatch):
    registry = registry_with(monkeypatch)
    monkeypatch.setattr(server, 'registry', registry)
    selected = await server.catalog({'ownerId': 'a', 'environmentRef': 'test', 'variableEnvironmentId': 'dev'})
    assert selected['environment']['variables'] == {'API_HOST': 'https://dev.example', 'LIMIT': 1, 'FLAG': True}
    default = await server.catalog({'ownerId': 'a', 'environmentRef': 'test'})
    assert default['environment']['variables'] == {'API_HOST': 'https://default.example', 'LIMIT': 5, 'FLAG': True}


async def test_thread_load_restores_the_frozen_selection_before_recompiling(monkeypatch):
    from datetime import datetime, timezone
    from eduflow_workflow import session_memory_history
    from eduflow_workflow.compiler import compile_definition
    registry = registry_with(monkeypatch)
    frozen = registry.snapshot(registry.environment('test', 'a', 'dev'))
    definition = sample()
    compiled = compile_definition(definition, frozen)
    assert compiled['valid']
    thread = {'snapshot': {'environment_ref': 'test', 'environment_revision': frozen['environmentRevision'], 'registry_snapshot': frozen, 'compile_fingerprint': compiled['compileFingerprint']}, 'updated_at': datetime.now(timezone.utc).isoformat()}
    page = {'thread': thread, 'definition': definition, 'archived': False}

    class FakeStorage:
        def __init__(self, url): pass
        async def call(self, *args): return copy.deepcopy(page)

    monkeypatch.setattr('eduflow_workflow.storage.Storage', FakeStorage)
    monkeypatch.setenv('WORKFLOW_DATABASE_URL', '')
    # The owner's current default moved to another environment after this thread started.
    different = {**CONFIGURATION, 'default_environment_id': 'prod', 'variables': [{'key': 'API_HOST', 'value': 'https://changed.example', 'overrides': {}}]}
    monkeypatch.setattr(Registry, 'variable_configuration', lambda self, owner: copy.deepcopy(different))
    _, environment = await session_memory_history.load('a', '00000000-0000-0000-0000-000000000001', registry)
    assert environment['variables'] == frozen['variables'] == {'API_HOST': 'https://dev.example', 'LIMIT': 1, 'FLAG': True}
    assert environment['variableEnvironment'] == {'id': 'dev', 'name': '开发'}
