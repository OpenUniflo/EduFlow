"""Frozen fixed-revision Workflow references.

Resolution is always server-owned: the database walks the immutable
Definitions and the Worker freezes the resulting definitions, exact revisions
and target environments into the Run registry snapshot. A missing target is an
error, never an empty/leaf graph. At execution/guard/resume time the frozen
closure is used for semantics while authorization is re-read from the database
and the current environment catalogs.
"""
from __future__ import annotations

import copy
import os
from dataclasses import dataclass
from typing import Any

from .contracts import ExecutionError, digest
from .registry import restore_frozen_environment

REFERENCE_VERSION = 1
MAX_REFERENCE_DEPTH = 8
MAX_REFERENCE_NODES = 256
MAX_REFERENCE_TARGETS = 32
MAX_DIRECT_REFERENCES = 64


def environment_for(registry, ref: str, owner: str, variable_environment_id: str | None):
    """Keep the existing two-argument Registry call shape when no selection exists."""
    return registry.environment(ref, owner) if variable_environment_id is None else registry.environment(ref, owner, variable_environment_id)


def reference_config(node: dict) -> dict | None:
    """Return the fixed reference carried by a `core.subgraph` node, if any."""
    if not isinstance(node, dict) or node.get("type") != "core.subgraph":
        return None
    config = node.get("config")
    if not isinstance(config, dict):
        raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Subgraph configuration must be an object")
    reference = config.get("workflowRef")
    if reference is None:
        return None
    if not isinstance(reference, dict):
        raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Fixed Workflow reference must be an object")
    workflow_id = reference.get("workflowId")
    revision = reference.get("revision")
    environment = config.get("environmentRef")
    if (
        not isinstance(workflow_id, str) or not workflow_id
        or isinstance(revision, bool) or not isinstance(revision, int) or revision < 1
        or not isinstance(environment, str) or not environment
    ):
        raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Fixed Workflow reference requires owner, exact revision and environment")
    if "graph" in config:
        raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "A reference and an embedded graph are mutually exclusive")
    if config.get("stateMode", "independent") != "independent":
        raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Fixed Workflow references always use independent State")
    if config.get("persistence", "per-invocation") != "per-invocation":
        raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Fixed Workflow references always use per-invocation persistence")
    return {"workflowId": workflow_id, "revision": revision, "environmentRef": environment}


def reference_key(workflow_id: str, revision: int, environment_ref: str) -> tuple[str, int, str]:
    return (workflow_id, revision, environment_ref)


def walk_reference_nodes(definition: dict, graph_path: tuple[str, ...] = ()) -> list[tuple[dict, list[str], dict]]:
    """All fixed-reference nodes in a Definition, including embedded child graphs."""
    found: list[tuple[dict, list[str], dict]] = []
    nodes = definition.get("nodes") if isinstance(definition, dict) else None
    for node in nodes if isinstance(nodes, list) else []:
        if not isinstance(node, dict):
            continue
        reference = reference_config(node)
        if reference is not None:
            found.append((node, list(graph_path), reference))
        config = node.get("config") if isinstance(node.get("config"), dict) else {}
        embedded = config.get("graph") if isinstance(config, dict) else None
        if node.get("type") == "core.subgraph" and isinstance(embedded, dict) and len(graph_path) < MAX_REFERENCE_DEPTH:
            found.extend(walk_reference_nodes(embedded, (*graph_path, str(node.get("id", "")))))
    return found


def has_references(definition: dict) -> bool:
    return bool(walk_reference_nodes(definition))


def _require_target(target: Any, identity: str) -> dict:
    if not isinstance(target, dict):
        raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Frozen reference target is invalid")
    workflow_id = target.get("workflowId")
    revision = target.get("revision")
    environment = target.get("environmentRef")
    definition = target.get("definition")
    if (
        not isinstance(workflow_id, str) or not workflow_id
        or isinstance(revision, bool) or not isinstance(revision, int) or revision < 1
        or not isinstance(environment, str) or not environment
        or not isinstance(definition, dict)
    ):
        raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", f"Frozen reference target {identity} is invalid")
    if definition.get("workflowId") != workflow_id or definition.get("revision") != revision:
        raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Frozen reference definition identity changed")
    return target


@dataclass(frozen=True)
class ReferenceSet:
    """Validated frozen closure carried in a Run registry snapshot."""

    snapshot: dict
    targets: dict[tuple[str, int, str], dict]
    environments: dict[str, dict]
    root_environment_ref: str

    @classmethod
    def from_snapshot(cls, snapshot: Any) -> "ReferenceSet | None":
        if not snapshot:
            return None
        if not isinstance(snapshot, dict) or snapshot.get("version") != REFERENCE_VERSION:
            raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Frozen Workflow reference closure is invalid")
        raw_targets = snapshot.get("targets", [])
        raw_environments = snapshot.get("environments", [])
        if not isinstance(raw_targets, list) or not isinstance(raw_environments, list):
            raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Frozen Workflow reference closure is invalid")
        targets: dict[tuple[str, int, str], dict] = {}
        for index, raw in enumerate(raw_targets):
            target = _require_target(raw, str(index))
            key = reference_key(target["workflowId"], target["revision"], target["environmentRef"])
            if key in targets:
                raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Frozen Workflow reference closure contains duplicate targets")
            targets[key] = target
        environments: dict[str, dict] = {}
        for raw in raw_environments:
            if not isinstance(raw, dict):
                raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Frozen target environment is invalid")
            ref = raw.get("environmentRef")
            revision = raw.get("environmentRevision")
            registry_snapshot = raw.get("registrySnapshot")
            if not isinstance(ref, str) or not ref or not isinstance(revision, str) or not isinstance(registry_snapshot, dict):
                raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Frozen target environment is invalid")
            environments[ref] = raw
        if len(targets) > MAX_REFERENCE_TARGETS:
            raise ExecutionError("WORKFLOW_REFERENCE_LIMIT", "Frozen reference closure exceeds target budget")
        root_environment = snapshot.get("rootEnvironmentRef")
        if not isinstance(root_environment, str) or not root_environment:
            raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Frozen Workflow reference closure has no root environment")
        return cls(snapshot=snapshot, targets=targets, environments=environments, root_environment_ref=root_environment)

    def target_for(self, reference: dict) -> dict:
        target = self.targets.get(reference_key(reference["workflowId"], reference["revision"], reference["environmentRef"]))
        if target is None:
            raise ExecutionError("WORKFLOW_REFERENCE_UNAVAILABLE", "Frozen Workflow reference target is unavailable")
        return target

    def environment_snapshot(self, environment_ref: str, root_environment_ref: str, root_snapshot: dict) -> dict:
        if environment_ref == root_environment_ref:
            return root_snapshot
        frozen = self.environments.get(environment_ref)
        if frozen is None:
            raise ExecutionError("WORKFLOW_REFERENCE_ENVIRONMENT", "Fixed Workflow target environment was not frozen", "auth")
        return frozen["registrySnapshot"]

    def authorization_payload(self) -> dict:
        return {"targets": [
            {"workflowId": target["workflowId"], "revision": target["revision"], "environmentRef": target["environmentRef"]}
            for target in sorted(self.targets.values(), key=lambda item: (item["workflowId"], item["revision"], item["environmentRef"]))
        ]}

    def definition_digest(self) -> str:
        return digest({
            "version": REFERENCE_VERSION,
            "targets": [
                {"workflowId": target["workflowId"], "revision": target["revision"], "environmentRef": target["environmentRef"], "definition": target["definition"]}
                for target in sorted(self.targets.values(), key=lambda item: (item["workflowId"], item["revision"], item["environmentRef"]))
            ],
            "environments": [
                {"environmentRef": row["environmentRef"], "environmentRevision": row["environmentRevision"]}
                for row in sorted(self.environments.values(), key=lambda item: item["environmentRef"])
            ],
        })


def build_frozen_references(registry, resolved: dict, owner: str, root_environment_ref: str, variable_environment_id: str | None) -> dict:
    """Freeze exact target Definitions and each non-root target environment."""
    if not isinstance(resolved, dict):
        raise ExecutionError("INVALID_SUBGRAPH_REFERENCE", "Reference resolver returned an invalid closure")
    targets: list[dict] = []
    seen: set[tuple[str, int, str]] = set()
    for raw in resolved.get("targets", []):
        target = _require_target(raw, str(len(targets)))
        key = reference_key(target["workflowId"], target["revision"], target["environmentRef"])
        if key in seen:
            continue
        seen.add(key)
        targets.append({
            "workflowId": target["workflowId"],
            "revision": target["revision"],
            "environmentRef": target["environmentRef"],
            "definition": copy.deepcopy(target["definition"]),
        })
    if len(targets) > MAX_REFERENCE_TARGETS:
        raise ExecutionError("WORKFLOW_REFERENCE_LIMIT", "Reference closure exceeds target budget")
    environments: list[dict] = []
    for environment_ref in sorted({target["environmentRef"] for target in targets}):
        if environment_ref == root_environment_ref:
            continue
        env = environment_for(registry, environment_ref, owner, variable_environment_id)
        snapshot = registry.snapshot(env)
        environments.append({
            "environmentRef": environment_ref,
            "environmentRevision": snapshot["environmentRevision"],
            "registrySnapshot": snapshot,
        })
    return {
        "version": REFERENCE_VERSION,
        "root": resolved.get("root", {}),
        "rootEnvironmentRef": root_environment_ref,
        "targets": targets,
        "environments": environments,
    }


def frozen_references_from_snapshot(snapshot: Any) -> ReferenceSet | None:
    if not isinstance(snapshot, dict):
        return None
    return ReferenceSet.from_snapshot(snapshot.get("workflowReferences"))


async def resolve_definition_references(storage, registry, owner: str, definition: dict, root_environment_ref: str, variable_environment_id: str | None) -> dict | None:
    """Resolve through the authoritative database closure walker."""
    if not has_references(definition):
        return None
    if not getattr(storage, "url", None):
        raise ExecutionError("WORKFLOW_REFERENCE_UNAVAILABLE", "Fixed Workflow references require the server database", "auth")
    resolved = await storage.call("workflow_reference_resolve", owner, definition)
    return build_frozen_references(registry, resolved, owner, root_environment_ref, variable_environment_id)


async def authorize_frozen_references(storage, registry, owner: str, references: ReferenceSet | None, root_environment_ref: str, variable_environment_id: str | None) -> dict[str, dict]:
    """Recheck revocation and environment identity; return current non-root env snapshots.

    The frozen ordinary variable values are restored before snapshotting so an
    unrelated variable edit does not masquerade as an authorization change.
    Provider secrets and exact function versions are checked by execution and
    the compile fingerprint; the environment revision comparison here covers
    tool/connection enablement and catalog changes.
    """
    if references is None:
        return {}
    if getattr(storage, "url", None):
        await storage.call("workflow_reference_authorize", owner, references.authorization_payload())
    current: dict[str, dict] = {}
    for environment_ref, frozen in sorted(references.environments.items()):
        env = environment_for(registry, environment_ref, owner, variable_environment_id)
        restore_frozen_environment(env, frozen["registrySnapshot"])
        snapshot = registry.snapshot(env)
        if snapshot["environmentRevision"] != frozen["environmentRevision"]:
            raise ExecutionError("ENVIRONMENT_CHANGED", "Target environment authorization changed", "auth")
        for provider in env.get("providers", []):
            secret_ref = provider.get("secretRef")
            if secret_ref and not (str(secret_ref).startswith("vault:") or os.environ.get(secret_ref)):
                raise ExecutionError("SECRET_REVOKED", "Target environment credential is unavailable", "auth")
        current[environment_ref] = snapshot
    return current


def current_reference_snapshot(references: ReferenceSet | None, current_environments: dict[str, dict]) -> ReferenceSet | None:
    """A frozen closure with current authorization snapshots for fingerprinting."""
    if references is None:
        return None
    snapshot = copy.deepcopy(references.snapshot)
    for row in snapshot.get("environments", []):
        current = current_environments.get(row["environmentRef"])
        if current is not None:
            row["environmentRevision"] = current["environmentRevision"]
            row["registrySnapshot"] = current
    return ReferenceSet.from_snapshot(snapshot)


def scoped_child_definition(definition: dict, graph_path: list[str], references: ReferenceSet | None) -> dict | None:
    """Resolve a frozen graph path (embedded graph or fixed reference)."""
    current = definition
    for node_id in graph_path:
        node = next((item for item in current.get("nodes", []) if isinstance(item, dict) and item.get("id") == node_id and item.get("type") == "core.subgraph"), None)
        if node is None:
            return None
        config = node.get("config") if isinstance(node.get("config"), dict) else {}
        embedded = config.get("graph")
        if isinstance(embedded, dict):
            current = embedded
            continue
        if references is None:
            return None
        try:
            reference = reference_config(node)
        except ExecutionError:
            return None
        if reference is None:
            return None
        current = references.target_for(reference)["definition"]
    return current
