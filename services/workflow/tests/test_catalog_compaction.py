"""Bounded discovery cache: large catalogs, allowlist authority and both write paths."""
import copy
import json

import psycopg
import pytest

from eduflow_workflow import extensions, server, storage, tools
from eduflow_workflow.contracts import ExecutionError
from eduflow_workflow.extensions import (
    compact_catalog_tools,
    connector_cache_digest,
    is_catalog_placeholder,
    save_discovered_catalog,
)
from eduflow_workflow.registry import Registry

CATALOG_ROW_LIMIT = 262144
NOTION_NAMES = [
    "notion-search", "notion-fetch", "notion-create-pages", "notion-update-page",
    "notion-move-pages", "notion-duplicate-page", "notion-create-database",
    "notion-update-database", "notion-create-comment", "notion-get-comments",
    "notion-get-users", "notion-get-teams", "notion-get-self", "notion-append-blocks",
    "notion-get-block", "notion-delete-block", "notion-get-page", "notion-list-pages",
    "notion-query-database", "notion-get-database", "notion-upload-file",
    "notion-get-file", "notion-list-databases", "notion-get-user",
]


def catalog_size(value):
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())


def notion_tools():
    """A Notion-shaped tools/list: many large property schemas, only a few allowed."""
    result = []
    for index, name in enumerate(NOTION_NAMES):
        properties = {
            f"property_{field}": {
                "type": "object",
                "description": f"Notion property block {field} for {name} " + "x" * 160,
                "additionalProperties": False,
            }
            for field in range(72)
        }
        result.append({
            "ref": "p4:owner:notion:2:" + name,
            "name": name,
            "description": "Notion MCP tool " + name,
            "version": 1,
            "adapter": "mcp",
            "connectorRef": "p4:owner:notion:2",
            "inputSchema": {"type": "object", "properties": properties, "additionalProperties": False},
            "outputSchema": {"type": "object"},
            "rawSchemaDigest": f"{index:064x}",
            "sideEffect": "unknown",
            "declaredReadOnly": False,
            "declaredDestructive": False,
        })
    return result


def notion_connector(allowed):
    return {
        "ref": "p4:owner:notion:2",
        "name": "Notion",
        "transport": "streamable-http",
        "url": "https://mcp.notion.com/mcp",
        "allowedToolNames": list(allowed),
        "toolEffectPolicy": 5,
    }


class CatalogStore:
    """Fake p6_catalog_put with the real per-row JSON byte bound."""

    def __init__(self, rows=None):
        self.rows = rows or []
        self.puts = []

    async def call(self, name, *args):
        if name == "p4_catalog_read":
            return copy.deepcopy(self.rows)
        if name == "p6_catalog_put":
            self.puts.append(args)
            if catalog_size(args[2]) > CATALOG_ROW_LIMIT:
                raise ExecutionError("CATALOG_PAYLOAD_TOO_LARGE", "fixture row bound")
            return True
        raise AssertionError(name)


class QuotaStore(CatalogStore):
    async def call(self, name, *args):
        if name == "p6_catalog_put":
            self.puts.append(args)
            raise ExecutionError("CATALOG_QUOTA_EXCEEDED", "fixture quota")
        return await super().call(name, *args)


class EnvRegistry:
    def __init__(self, environment):
        self.environment_value = environment

    def environment(self, ref, owner, variable_environment_id=None):
        assert (ref, owner) == ("local", "owner")
        return copy.deepcopy(self.environment_value)

    def public_tools(self, environment):
        return [tool for tool in environment["tools"] if not is_catalog_placeholder(tool)]

    def public_environment(self, environment):
        return {
            "environmentRef": environment["ref"],
            "connectors": [
                {"ref": connector["ref"], "discoveredToolNames": list(connector.get("discoveredToolNames") or [])}
                for connector in environment.get("connectors", [])
            ],
        }


def mcp_environment(allowed):
    content = {
        "type": "mcp-http",
        "name": "Notion",
        "url": "https://mcp.notion.com/mcp",
        "transport": "streamable-http",
        "authType": "none",
        "allowedToolNames": list(allowed),
    }
    connector = extensions.mcp_connector(content, "p4:owner:notion:2", "owner", 2)
    return content, {
        "ref": "local",
        "providers": [],
        "tools": [],
        "connectors": [connector],
        "capabilityOrigins": {},
    }


def install_notion_discovery(monkeypatch, discovered):
    async def discover(registry, environment, connector_ref, include_all=False):
        assert include_all is True
        assert connector_ref == "p4:owner:notion:2"
        return copy.deepcopy(discovered)

    monkeypatch.setattr(tools, "discover", discover)


def test_large_notion_catalog_compacts_only_unallowed_tools():
    discovered = notion_tools()
    allowed = ["notion-search", "notion-fetch"]
    assert catalog_size(discovered) > CATALOG_ROW_LIMIT

    compact = compact_catalog_tools(discovered, allowed)

    assert [tool["name"] for tool in compact] == NOTION_NAMES
    by_name = {tool["name"]: tool for tool in compact}
    for name in allowed:
        assert by_name[name]["inputSchema"] == next(tool for tool in discovered if tool["name"] == name)["inputSchema"]
        assert by_name[name]["rawSchemaDigest"] == next(tool for tool in discovered if tool["name"] == name)["rawSchemaDigest"]
    for name in NOTION_NAMES:
        if name not in allowed:
            assert by_name[name] == {"name": name, "discoveryPlaceholder": True}
    assert catalog_size(compact) < CATALOG_ROW_LIMIT


async def test_save_retries_once_when_sql_reports_the_row_bound():
    discovered = notion_tools()
    allowed = ["notion-search", "notion-fetch"]
    store = CatalogStore()

    await save_discovered_catalog(store, "local:p4:owner:notion:2", notion_connector(allowed), discovered)

    assert len(store.puts) == 2
    first, second = store.puts
    assert first[2] == discovered
    assert catalog_size(second[2]) < CATALOG_ROW_LIMIT
    assert {tool["name"] for tool in second[2] if "inputSchema" in tool} == set(allowed)
    assert all(is_catalog_placeholder(tool) for tool in second[2] if tool["name"] not in allowed)


async def test_normal_cache_keeps_one_full_write_and_is_unchanged():
    discovered = [
        {"name": "echo", "description": "Echo", "inputSchema": {"type": "object", "properties": {}}},
        {"name": "add", "description": "Add", "inputSchema": {"type": "object", "properties": {}}},
    ]
    store = CatalogStore()

    await save_discovered_catalog(store, "local:p4:owner:small:1", notion_connector(["echo"]), discovered)

    assert len(store.puts) == 1
    assert store.puts[0][2] is discovered


async def test_quota_is_not_retried_or_masked():
    store = QuotaStore()

    with pytest.raises(ExecutionError) as caught:
        await save_discovered_catalog(store, "local:p4:owner:notion:2", notion_connector([]), notion_tools())

    assert caught.value.code == "CATALOG_QUOTA_EXCEEDED"
    assert len(store.puts) == 1


async def test_allowed_subset_overflow_is_not_hidden_by_the_compact_retry():
    huge = notion_tools()[0]
    huge["inputSchema"]["properties"]["oversized"] = {"description": "x" * CATALOG_ROW_LIMIT}
    store = CatalogStore()

    with pytest.raises(ExecutionError) as caught:
        await save_discovered_catalog(store, "local:p4:owner:notion:2", notion_connector([huge["name"]]), [huge])

    assert caught.value.code == "CATALOG_PAYLOAD_TOO_LARGE"
    assert len(store.puts) == 2


async def test_connection_test_write_path_returns_the_complete_catalog(monkeypatch):
    discovered = notion_tools()
    allowed = ["notion-search"]
    content, environment = mcp_environment(allowed)
    rows = [{"kind": "connection", "ref": "notion", "version": 2, "disabled": False, "content": content}]
    store = CatalogStore(rows)
    monkeypatch.setattr(extensions, "Storage", lambda url: store)
    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "postgresql://fixture")
    monkeypatch.setenv("WORKFLOW_DEPLOYMENT_MODE", "hosted")
    monkeypatch.delenv("WORKFLOW_CATALOG_FILE", raising=False)
    install_notion_discovery(monkeypatch, discovered)

    result = await extensions.catalog_operation(
        {"ownerId": "owner", "environmentRef": "local", "action": "test",
         "kind": "connection", "ref": "notion", "version": 2},
        EnvRegistry(environment),
    )

    assert result["ok"] is True
    assert [tool["name"] for tool in result["tools"]] == NOTION_NAMES
    assert [tool["name"] for tool in result["tools"] if tool["allowed"]] == allowed
    assert len(store.puts) == 2
    assert catalog_size(store.puts[1][2]) < CATALOG_ROW_LIMIT


async def test_connection_test_write_path_keeps_newly_selected_tools_executable(monkeypatch):
    discovered = notion_tools()
    selected = ["notion-search", "notion-fetch"]
    content, environment = mcp_environment(selected)
    rows = [{"kind": "connection", "ref": "notion", "version": 2, "disabled": False, "content": content}]
    store = CatalogStore(rows)
    monkeypatch.setattr(extensions, "Storage", lambda url: store)
    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "postgresql://fixture")
    monkeypatch.setenv("WORKFLOW_DEPLOYMENT_MODE", "hosted")
    monkeypatch.delenv("WORKFLOW_CATALOG_FILE", raising=False)
    install_notion_discovery(monkeypatch, discovered)

    result = await extensions.catalog_operation(
        {"ownerId": "owner", "environmentRef": "local", "action": "test",
         "kind": "connection", "ref": "notion", "version": 2},
        EnvRegistry(environment),
    )

    assert result["ok"] is True
    compact = store.puts[1][2]
    saved = {tool["name"]: tool for tool in compact}
    for name in selected:
        assert saved[name]["rawSchemaDigest"] == next(tool for tool in discovered if tool["name"] == name)["rawSchemaDigest"]
        assert saved[name]["inputSchema"]["properties"]
    assert all(is_catalog_placeholder(saved[name]) for name in NOTION_NAMES if name not in selected)


class DiscoverRegistry(EnvRegistry):
    """Re-read the just-written cache the way Registry.environment does."""

    def __init__(self, environment, store):
        super().__init__(environment)
        self.store = store

    def environment(self, ref, owner, variable_environment_id=None):
        environment = super().environment(ref, owner, variable_environment_id)
        if self.store.puts:
            cached = self.store.puts[-1][2]
            environment["connectors"][0]["discoveredToolNames"] = [tool["name"] for tool in cached]
            allowed = set(environment["connectors"][0].get("allowedToolNames") or [])
            environment["tools"] = [
                tool for tool in cached
                if tool["name"] in allowed and not is_catalog_placeholder(tool)
            ]
        return environment


async def test_discover_entry_uses_the_same_compact_retry(monkeypatch):
    discovered = notion_tools()
    allowed = ["notion-search"]
    content, environment = mcp_environment(allowed)
    store = CatalogStore()
    monkeypatch.setattr(storage, "Storage", lambda url: store)
    monkeypatch.setattr(server, "registry", DiscoverRegistry(environment, store))
    monkeypatch.setattr(server, "discover", lambda registry, env, connector_ref, include_all=False: _resolved(discovered))
    monkeypatch.setattr(server, "refresh", lambda: None)
    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "postgresql://fixture")
    monkeypatch.setenv("WORKFLOW_DEPLOYMENT_MODE", "hosted")
    monkeypatch.delenv("WORKFLOW_CATALOG_FILE", raising=False)

    result = await server.discovery({"ownerId": "owner", "environmentRef": "local", "connectorRef": "p4:owner:notion:2"})

    assert result["discoveredToolNames"] == NOTION_NAMES
    assert [tool["name"] for tool in result["items"]] == allowed
    assert len(store.puts) == 2
    assert catalog_size(store.puts[1][2]) < CATALOG_ROW_LIMIT
    assert {tool["name"] for tool in store.puts[1][2] if "inputSchema" in tool} == set(allowed)


async def _resolved(value):
    return copy.deepcopy(value)


class RegistryConnection:
    def __init__(self, rows, discovered):
        self.rows = rows
        self.discovered = discovered

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, query, params=None):
        if "p4_catalog_read" in query:
            return _RegistryCursor(copy.deepcopy(self.rows))
        if "p6_catalog_list" in query:
            return _RegistryCursor(copy.deepcopy(self.discovered))
        raise AssertionError(query)


class _RegistryCursor:
    def __init__(self, value):
        self.value = value

    def fetchone(self):
        return (self.value,)


def cached_registry(monkeypatch, cached_tools, allowed):
    content, _ = mcp_environment(allowed)
    connector = extensions.mcp_connector(content, "p4:owner:notion:2", "owner", 2)
    connector["policyVersion"] = 2
    rows = [{"kind": "connection", "ref": "notion", "version": 2, "disabled": False, "content": content}]
    discovered = {
        "local:p4:owner:notion:2": {
            "connectorDigest": connector_cache_digest(connector),
            "tools": cached_tools,
        }
    }
    monkeypatch.setenv("WORKFLOW_DATABASE_URL", "postgresql://fixture")
    monkeypatch.setenv("WORKFLOW_DEPLOYMENT_MODE", "hosted")
    monkeypatch.setattr(psycopg, "connect", lambda *args, **kwargs: RegistryConnection(rows, discovered))
    registry = Registry({"environments": [{"ref": "local", "ownerIds": ["owner"]}]})
    monkeypatch.setattr(registry, "variable_configuration", lambda owner: None)
    return registry


def test_registry_reads_legacy_full_cache_without_changing_allowlist_authority(monkeypatch):
    discovered = notion_tools()
    legacy_tools = copy.deepcopy(discovered[:3])
    registry = cached_registry(monkeypatch, legacy_tools, ["notion-search"])

    environment = registry.environment("local", "owner")

    assert environment["connectors"][0]["discoveredToolNames"] == NOTION_NAMES[:3]
    refs = {tool["ref"] for tool in environment["tools"]}
    assert "p4:owner:notion:2:notion-search" in refs
    assert "p4:owner:notion:2:notion-fetch" not in refs
    selected = next(tool for tool in environment["tools"] if tool["ref"].endswith(":notion-search"))
    assert selected["inputSchema"] == discovered[0]["inputSchema"]
    assert selected["rawSchemaDigest"] == discovered[0]["rawSchemaDigest"]


def test_registry_reads_compact_cache_names_but_never_executes_placeholders(monkeypatch):
    discovered = notion_tools()
    compact = compact_catalog_tools(discovered, ["notion-search", "notion-fetch"])
    registry = cached_registry(monkeypatch, compact, ["notion-search", "notion-fetch"])

    environment = registry.environment("local", "owner")

    assert environment["connectors"][0]["discoveredToolNames"] == NOTION_NAMES
    refs = {tool["ref"] for tool in environment["tools"]}
    assert "p4:owner:notion:2:notion-search" in refs
    assert "p4:owner:notion:2:notion-fetch" in refs
    assert not any(is_catalog_placeholder(tool) for tool in environment["tools"])
    assert not any(tool["ref"].endswith(":notion-create-pages") for tool in environment["tools"])


def test_registry_startup_filters_placeholders_and_keeps_legacy_full_entries(monkeypatch, tmp_path):
    content, _ = mcp_environment(["notion-search"])
    connector = extensions.mcp_connector(content, "p4:owner:notion:2", "owner", 2)
    full = notion_tools()[0]
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps({
        "local:p4:owner:notion:2": {
            "connectorDigest": connector_cache_digest(connector),
            "tools": [full, {"name": "notion-fetch", "discoveryPlaceholder": True}],
        }
    }))
    monkeypatch.setenv("WORKFLOW_CATALOG_FILE", str(path))
    monkeypatch.delenv("WORKFLOW_DEPLOYMENT_MODE", raising=False)

    registry = Registry({"environments": [{"ref": "local", "ownerIds": ["owner"], "connectors": [connector]}]})

    refs = {tool["ref"] for tool in registry.environments[0]["tools"]}
    assert full["ref"] in refs
    assert not any(is_catalog_placeholder(tool) for tool in registry.environments[0]["tools"])
