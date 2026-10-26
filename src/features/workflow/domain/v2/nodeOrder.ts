import type { WorkflowDefinitionV2 } from "./types";

/**
 * Execution-order helpers for authoring. The editor uses the same transition
 * graph the runtime schedules; a producer that can only run after the current
 * node must not be offered as an available input.
 */

function graphIds(definition: WorkflowDefinitionV2): Set<string> {
  return new Set(definition.nodes.map(node => node.id));
}

function adjacency(definition: WorkflowDefinitionV2, ids: readonly string[]): Map<string, Set<string>> {
  const known = new Set(ids);
  const edges = new Map<string, Set<string>>(ids.map(id => [id, new Set<string>()]));
  for (const transition of definition.transitions) {
    if (!known.has(transition.from) || !known.has(transition.to)) continue;
    edges.get(transition.from)!.add(transition.to);
  }
  return edges;
}

/**
 * Nodes that can only execute after `nodeId`, including indirect branches.
 * Returns `undefined` when the node is absent or the graph is cyclic: callers
 * must not gray fields from uncertain topology.
 */
export function downstreamNodeIds(definition: WorkflowDefinitionV2, nodeId: string): Set<string> | undefined {
  const ids = [...graphIds(definition)];
  if (!ids.includes(nodeId)) return undefined;
  const edges = adjacency(definition, ids);
  // Kahn's algorithm: a cycle means execution order cannot be decided.
  const indegree = new Map(ids.map(id => [id, 0]));
  for (const targets of edges.values()) for (const target of targets) indegree.set(target, (indegree.get(target) ?? 0) + 1);
  const queue = ids.filter(id => (indegree.get(id) ?? 0) === 0);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited += 1;
    for (const target of edges.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  if (visited !== ids.length) return undefined;
  const downstream = new Set<string>();
  const stack = [...(edges.get(nodeId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (downstream.has(id) || id === nodeId) continue;
    downstream.add(id);
    for (const target of edges.get(id) ?? []) stack.push(target);
  }
  return downstream;
}

/**
 * State fields whose every known producer can only run after `nodeId`.
 * A field with an upstream producer, written by the node itself, disconnected,
 * or from an undecidable graph stays selectable.
 */
export function laterProducerFields(
  definition: WorkflowDefinitionV2,
  nodeId: string,
  producers: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const downstream = downstreamNodeIds(definition, nodeId);
  if (!downstream) return new Set();
  const ids = graphIds(definition);
  const later = new Set<string>();
  for (const [field, owners] of producers) {
    const known = [...new Set(owners.filter(owner => ids.has(owner)))];
    if (!known.length) continue;
    if (known.every(owner => downstream.has(owner))) later.add(field);
  }
  return later;
}
