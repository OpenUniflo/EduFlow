import { scopeKey } from "./authoring";
import { PARAM_NAME_PATTERN, RESERVED_PARAM_NAME } from "./schema";
import type { Binding, WorkflowDefinitionV2, WorkflowNodeV2 } from "./types";

/**
 * Editor-only derived data for the State / resource panels (plan 3.4).
 * Everything here reads a persisted definition; nothing mutates it.
 */

/** Graph outputs are produced by no single node, so consumers use this synthetic owner. */
export const GRAPH_OUTPUT_NODE_ID = "@output";
/** Subgraphs are walked at most this deep, matching the Worker's nesting limit. */
export const MAX_SUBGRAPH_DEPTH = 8;

export type DefinitionScope = { scopeKey: string; graphPath: string[]; definition: WorkflowDefinitionV2 };

function subgraphOf(node: WorkflowNodeV2): WorkflowDefinitionV2 | undefined {
  if (node.type !== "core.subgraph") return undefined;
  if (!node.config || typeof node.config !== "object") return undefined;
  const graph = node.config.graph;
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) return undefined;
  return Array.isArray((graph as unknown as WorkflowDefinitionV2).nodes) ? graph as unknown as WorkflowDefinitionV2 : undefined;
}

/**
 * Flattens a definition and its subgraphs. Each scope is keyed by `scopeKey(graphPath)`,
 * and ancestor graphs are tracked by object identity so a self-referencing graph object
 * cannot recurse forever. An over-deep graph is skipped rather than treated as valid.
 */
export function definitionScopes(definition: WorkflowDefinitionV2, maxDepth = MAX_SUBGRAPH_DEPTH): DefinitionScope[] {
  const scopes: DefinitionScope[] = [];
  const ancestors = new Set<WorkflowDefinitionV2>();
  const visit = (graph: WorkflowDefinitionV2, graphPath: string[]) => {
    if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes) || ancestors.has(graph)) return;
    ancestors.add(graph);
    scopes.push({ scopeKey: scopeKey(graphPath), graphPath, definition: graph });
    if (graphPath.length < maxDepth) {
      for (const node of graph.nodes) {
        if (!node || typeof node !== "object") continue;
        const child = subgraphOf(node);
        if (child) visit(child, [...graphPath, node.id]);
      }
    }
    ancestors.delete(graph);
  };
  visit(definition, []);
  return scopes;
}

/** Decodes the first segment of a JSON Pointer, which is the top-level State / variable key. */
export function pointerFieldName(pointer: unknown): string | undefined {
  if (typeof pointer !== "string") return undefined;
  const body = pointer.startsWith("/") ? pointer.slice(1) : pointer;
  const token = body.split("/")[0];
  if (!token) return undefined;
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function addOwner(map: Map<string, string[]>, field: string, nodeId: string) {
  const owners = map.get(field);
  if (!owners) map.set(field, [nodeId]);
  else if (!owners.includes(nodeId)) owners.push(nodeId);
}

/**
 * State fields written by nodes. `node.writes` maps a State field to the JSON Pointer of the step
 * output to store (see the Worker's `pointer(output, path)` patch); the map key is the field.
 */
export function stateFieldProducers(definition: WorkflowDefinitionV2): Map<string, string[]> {
  const producers = new Map<string, string[]>();
  for (const scope of definitionScopes(definition)) {
    for (const node of scope.definition.nodes) {
      if (!node || !node.writes || typeof node.writes !== "object") continue;
      for (const [field, pointer] of Object.entries(node.writes)) {
        if (typeof pointer !== "string" || !field) continue;
        addOwner(producers, field, node.id);
      }
    }
  }
  return producers;
}

function collectPredicateBindings(predicate: unknown, source: "state" | "environment", sink: (key: string) => void) {
  if (!predicate || typeof predicate !== "object" || Array.isArray(predicate)) return;
  const record = predicate as Record<string, unknown>;
  if (record.source === source) {
    const key = pointerFieldName(record.pointer);
    if (key) sink(key);
  }
  for (const name of ["left", "right", "value"]) {
    const binding = record[name];
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) continue;
    const candidate = binding as Record<string, unknown>;
    if (candidate.source === source) {
      const key = pointerFieldName(candidate.pointer);
      if (key) sink(key);
    }
  }
  for (const name of ["children", "child"]) {
    const child = record[name];
    if (Array.isArray(child)) child.forEach(item => collectPredicateBindings(item, source, sink));
    else collectPredicateBindings(child, source, sink);
  }
}

function walkBindings(definition: WorkflowDefinitionV2, source: "state" | "environment", sink: (key: string, nodeId: string, graphPath: string[]) => void) {
  for (const scope of definitionScopes(definition)) {
    for (const node of scope.definition.nodes) {
      if (!node || typeof node !== "object") continue;
      if (node.inputs && typeof node.inputs === "object") {
        for (const binding of Object.values(node.inputs) as Binding[]) {
          if (binding?.source !== source) continue;
          const key = pointerFieldName(binding.pointer);
          if (key) sink(key, node.id, scope.graphPath);
        }
      }
      if (node.type === "core.router" && node.config && typeof node.config === "object" && Array.isArray(node.config.cases)) {
        for (const item of node.config.cases) {
          if (!item || typeof item !== "object" || Array.isArray(item)) continue;
          collectPredicateBindings((item as Record<string, unknown>).predicate, source, key => sink(key, node.id, scope.graphPath));
        }
      }
    }
    if (!scope.definition.outputBindings || typeof scope.definition.outputBindings !== "object") continue;
    for (const binding of Object.values(scope.definition.outputBindings) as Binding[]) {
      if (binding?.source !== source) continue;
      const key = pointerFieldName(binding.pointer);
      if (key) sink(key, GRAPH_OUTPUT_NODE_ID, scope.graphPath);
    }
  }
}

/** State fields read by node inputs, router predicates (including nested conditions) and graph outputs. */
export function stateFieldConsumers(definition: WorkflowDefinitionV2): Map<string, string[]> {
  const consumers = new Map<string, string[]>();
  walkBindings(definition, "state", (field, nodeId) => addOwner(consumers, field, nodeId));
  return consumers;
}

export type VariableReference = { key: string; nodeId: string; graphPath: string[] };

/** Environment variable usages across the root definition and its subgraphs, deduplicated per node. */
export function variableReferences(definition: WorkflowDefinitionV2): VariableReference[] {
  const rows: VariableReference[] = [];
  const seen = new Set<string>();
  walkBindings(definition, "environment", (key, nodeId, graphPath) => {
    const identity = `${scopeKey(graphPath)}\u0000${nodeId}\u0000${key}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    rows.push({ key, nodeId, graphPath });
  });
  return rows;
}

/**
 * Suggests a parameter name for an input row. Literal values are named `value`; pointers use
 * their last segment with `[]` markers removed and escapes decoded. Invalid characters become
 * `_`, a leading digit is prefixed with `_`, and `taken` (plus the reserved `history`) forces
 * `_2`, `_3`, … suffixes. `taken` is never mutated.
 */
export function defaultParamName(binding: Binding, taken: Set<string>): string {
  if (binding?.source === "literal") return "value";
  const pointer = typeof binding?.pointer === "string" ? binding.pointer : "";
  const segments = pointer.split("/").filter(Boolean);
  let base = (segments[segments.length - 1] ?? "").replace(/\[\]/g, "").replace(/~1/g, "/").replace(/~0/g, "~");
  base = base.replace(/[^A-Za-z0-9_]/g, "_");
  if (!base) base = "value";
  if (/^[0-9]/.test(base)) base = `_${base}`;
  base = base.slice(0, 64);
  const isFree = (name: string) => !taken.has(name) && name !== RESERVED_PARAM_NAME && PARAM_NAME_PATTERN.test(name);
  if (isFree(base)) return base;
  for (let suffix = 2; suffix < 10000; suffix++) {
    const tail = `_${suffix}`;
    const candidate = `${base.slice(0, Math.max(0, 64 - tail.length))}${tail}`;
    if (isFree(candidate)) return candidate;
  }
  return base;
}
