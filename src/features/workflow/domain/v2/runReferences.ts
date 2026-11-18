import type { JsonValue, WorkflowDefinitionV2, WorkflowNodeV2 } from "./types";
import { workflowReferenceInNode, workflowReferenceUsages } from "./workflowReferences";

/**
 * Presentation-only view of a Run's frozen fixed-reference closure.
 *
 * A target definition in this structure is exactly the one the Worker froze at
 * launch. Nothing in this module may fall back to a target's current revision:
 * if the snapshot is missing, the caller must say the read-only history is
 * unavailable rather than synthesize a newer definition.
 */
export type RunReferenceTarget = {
  workflowId: string;
  revision: number;
  environmentRef: string;
  name: string;
  definition: WorkflowDefinitionV2;
};

export type RunReferenceEnvironment = {
  environmentRef: string;
  environmentRevision: string;
};

export type RunReferenceSnapshot = {
  available: boolean;
  reason?: "missing" | "invalid";
  version?: 1;
  root?: { workflowId: string; revision: number };
  rootEnvironmentRef?: string;
  targets: RunReferenceTarget[];
  environments: RunReferenceEnvironment[];
  targetCount?: number;
};

export type RunReferenceCallInfo = {
  graphPath: string[];
  nodeId: string;
  nodeLabel: string;
  target: RunReferenceTarget;
};

export const EMPTY_RUN_REFERENCE_SNAPSHOT: RunReferenceSnapshot = { available: false, reason: "missing", targets: [], environments: [] };

const objectValue = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export function runReferenceKey(workflowId: string, revision: number, environmentRef: string): string {
  return `${workflowId}\u0000${revision}\u0000${environmentRef}`;
}

/** Index a projection by the exact identity a Worker path record carries. */
export function runReferenceTargetMap(snapshot: RunReferenceSnapshot | null | undefined): Map<string, RunReferenceTarget> {
  const map = new Map<string, RunReferenceTarget>();
  for (const target of snapshot?.targets ?? []) map.set(runReferenceKey(target.workflowId, target.revision, target.environmentRef), target);
  return map;
}

/**
 * Adds each frozen target as an embedded graph at its fixed-reference call
 * site so the ordinary read-only canvas, breadcrumb and snapshot navigation
 * resolve the launch-time definition. The original node stays intact when a
 * target is missing; no fallback definition is invented.
 */
export function expandRunDefinition(root: WorkflowDefinitionV2, snapshot: RunReferenceSnapshot | null | undefined): WorkflowDefinitionV2 {
  const targets = runReferenceTargetMap(snapshot);
  if (!targets.size) return root;
  const expandGraph = (graph: WorkflowDefinitionV2, depth: number): WorkflowDefinitionV2 => ({
    ...graph,
    nodes: graph.nodes.map(node => {
      if (!node || node.type !== "core.subgraph") return node;
      const config = node.config;
      const embedded = config.graph;
      if (embedded && typeof embedded === "object" && !Array.isArray(embedded) && Array.isArray((embedded as unknown as WorkflowDefinitionV2).nodes) && depth < 8) {
        const child = expandGraph(embedded as unknown as WorkflowDefinitionV2, depth + 1);
        return child === embedded ? node : { ...node, config: { ...config, graph: child as unknown as JsonValue } };
      }
      const reference = workflowReferenceInNode(node);
      if (!reference) return node;
      const target = targets.get(runReferenceKey(reference.workflowId, reference.revision, reference.environmentRef));
      if (!target || depth >= 8) return node;
      const child = expandGraph(target.definition, depth + 1);
      const expanded = { ...node, config: { ...config, graph: child as unknown as JsonValue } } as WorkflowNodeV2;
      return expanded;
    }),
  });
  return expandGraph(root, 0);
}

/** Every fixed call site declared by a Definition, including nested embedded graphs. */
export function runReferenceCalls(definition: WorkflowDefinitionV2, snapshot: RunReferenceSnapshot | null | undefined): RunReferenceCallInfo[] {
  const targets = runReferenceTargetMap(snapshot);
  return workflowReferenceUsages(definition).flatMap(usage => {
    const target = targets.get(runReferenceKey(usage.workflowId, usage.revision, usage.environmentRef));
    return target ? [{ graphPath: usage.graphPath, nodeId: usage.nodeId, nodeLabel: usage.nodeLabel, target }] : [];
  });
}

/** A definition still carries fixed references that need an exact frozen closure. */
export function definitionHasFixedReferences(definition: WorkflowDefinitionV2): boolean {
  return workflowReferenceUsages(definition).length > 0;
}

/** True when this Run claims a frozen reference closure in its Run DTO. */
export function runHasFixedReferences(run: { referenceCount?: number } | null | undefined, definition: WorkflowDefinitionV2): boolean {
  return (run?.referenceCount ?? 0) > 0 || definitionHasFixedReferences(definition);
}
