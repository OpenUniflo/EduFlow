/**
 * Read-only resource reference scan for the Workflow resource center (M3).
 *
 * The API loads each owner's current, non-archived Workflow definition; these pure
 * functions then report where a managed connection or an environment variable is used.
 * They mirror the browser-side semantics in
 * `src/features/workflow/domain/v2/connectionReferences.ts` and
 * `src/features/workflow/domain/v2/dataFlow.ts` without importing React, the application
 * composition root or any browser module into the API bundle.
 */

/** One current definition loaded for a single owner. */
export type ReferenceWorkflow = {
  workflowId: string;
  workflowName: string;
  revision: number;
  definition: Record<string, unknown>;
  /** Archived Workflows are excluded from every reference scan, even if a caller passes one. */
  archived?: boolean;
};

/** A node (or the synthetic graph output) that references a managed connection. */
export type ConnectionReferenceRow = {
  workflowId: string;
  workflowName: string;
  revision: number;
  graphPath: string[];
  nodeId: string;
  nodeLabel: string;
  version?: number;
  modelRef?: string;
};

/** A node (or the synthetic graph output) that reads an environment variable. */
export type VariableReferenceRow = {
  workflowId: string;
  workflowName: string;
  revision: number;
  graphPath: string[];
  nodeId: string;
  nodeLabel: string;
  variableKey: string;
};

/** Graph outputs are produced by no single node, so consumers use this synthetic owner. */
export const GRAPH_OUTPUT_NODE_ID = "@output";
export const GRAPH_OUTPUT_NODE_LABEL = "工作流输出";
/** Subgraphs are walked at most this deep, matching the Worker's nesting limit. */
export const MAX_SUBGRAPH_DEPTH = 8;

const USER_REF = "p4:";

function objectOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function nodesOf(definition: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(definition.nodes)) return [];
  return definition.nodes.map(objectOf).filter((node): node is Record<string, unknown> => Boolean(node));
}

function nodeLabelOf(node: Record<string, unknown>, nodeId: string): string {
  return typeof node.label === "string" && node.label.trim() ? node.label : nodeId;
}

function childGraphOf(node: Record<string, unknown>): Record<string, unknown> | undefined {
  if (node.type !== "core.subgraph") return undefined;
  const graph = objectOf(objectOf(node.config)?.graph);
  return graph && Array.isArray(graph.nodes) ? graph : undefined;
}

/**
 * Resolves the logical connection name from either a catalog ref (`price_service`) or a
 * stored connection key (`p4:<owner>:price_service:<version>`). Connection refs are
 * environment-scoped names without colons, so the third segment is the name.
 */
export function connectionRefName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const ref = value.trim();
  if (!ref || ref.length > 256) return undefined;
  if (!ref.startsWith(USER_REF)) return ref;
  const parts = ref.split(":");
  return parts[2] ? parts[2] : undefined;
}

/** Parses the immutable version pinned by a stored `p4:<owner>:<ref>:<version>` key. */
export function connectionRefVersion(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.startsWith(USER_REF)) return undefined;
  const parts = value.split(":");
  if (parts.length < 4 || !/^\d+$/.test(parts[3])) return undefined;
  const version = Number(parts[3]);
  return Number.isSafeInteger(version) && version > 0 ? version : undefined;
}

function storedRefName(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith(USER_REF)) return undefined;
  const parts = value.split(":");
  return parts[2] ? parts[2] : undefined;
}

function isUserReference(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(USER_REF);
}

/**
 * Connection usages across the root definition and nested subgraphs. Every eligible node
 * field contributes a row: a model provider ref (with its `modelRef`), a tool ref and each
 * allowed tool ref. Environment-provided refs are ignored because they are not managed
 * connections, and the requested ref is matched against all of its immutable versions.
 */
export function connectionReferenceRows(workflows: readonly ReferenceWorkflow[], ref: unknown): ConnectionReferenceRow[] {
  const wanted = connectionRefName(ref);
  if (!wanted) return [];
  const rows: ConnectionReferenceRow[] = [];
  const visit = (workflow: ReferenceWorkflow, graph: Record<string, unknown>, graphPath: string[]) => {
    for (const node of nodesOf(graph)) {
      const nodeId = typeof node.id === "string" ? node.id : "";
      if (!nodeId) continue;
      const nodeLabel = nodeLabelOf(node, nodeId);
      const config = objectOf(node.config) ?? {};
      const add = (storedRef: unknown, modelRef?: string) => {
        if (!isUserReference(storedRef) || storedRefName(storedRef) !== wanted) return;
        const version = connectionRefVersion(storedRef);
        rows.push({
          workflowId: workflow.workflowId,
          workflowName: workflow.workflowName,
          revision: workflow.revision,
          graphPath: [...graphPath],
          nodeId,
          nodeLabel,
          ...(version === undefined ? {} : { version }),
          ...(modelRef === undefined ? {} : { modelRef }),
        });
      };
      if (node.type === "core.llm") add(config.providerRef, typeof config.modelRef === "string" ? config.modelRef : undefined);
      if (node.type === "core.tool") add(config.toolRef);
      if ((node.type === "core.llm" || node.type === "core.tool_dispatch") && Array.isArray(config.allowedToolRefs)) {
        for (const allowed of config.allowedToolRefs) add(allowed);
      }
      if (graphPath.length < MAX_SUBGRAPH_DEPTH) {
        const child = childGraphOf(node);
        if (child) visit(workflow, child, [...graphPath, nodeId]);
      }
    }
  };
  for (const workflow of workflows) if (workflow.archived !== true) visit(workflow, workflow.definition, []);
  return rows;
}

/** Decodes the first segment of a JSON Pointer, which is the environment variable key. */
export function pointerFieldName(pointer: unknown): string | undefined {
  if (typeof pointer !== "string") return undefined;
  const body = pointer.startsWith("/") ? pointer.slice(1) : pointer;
  const token = body.split("/")[0];
  if (!token) return undefined;
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function collectBinding(binding: unknown, sink: (key: string) => void) {
  const value = objectOf(binding);
  if (!value || value.source !== "environment") return;
  const key = pointerFieldName(value.pointer);
  if (key) sink(key);
}

function collectPredicate(predicate: unknown, sink: (key: string) => void) {
  const value = objectOf(predicate);
  if (!value) return;
  // Comparative predicates carry bindings on `left`/`right`; the existence forms carry
  // `source`/`pointer` directly, and boolean combinators nest their children.
  if (value.source === "environment") {
    const key = pointerFieldName(value.pointer);
    if (key) sink(key);
  }
  for (const name of ["left", "right", "value"]) collectBinding(value[name], sink);
  for (const name of ["children", "child"]) {
    const child = value[name];
    if (Array.isArray(child)) child.forEach((item) => collectPredicate(item, sink));
    else collectPredicate(child, sink);
  }
}

/**
 * Environment variable usages across the root definition and nested subgraphs: node input
 * bindings, router predicates (including nested conditions) and graph output bindings.
 * Usages are deduplicated per `(graphPath, nodeId, key)`.
 */
export function variableReferenceRows(workflows: readonly ReferenceWorkflow[]): VariableReferenceRow[] {
  const rows: VariableReferenceRow[] = [];
  const seen = new Set<string>();
  for (const workflow of workflows) {
    if (workflow.archived === true) continue;
    const add = (graphPath: string[], nodeId: string, nodeLabel: string, key: string) => {
      const identity = `${workflow.workflowId}\u0000${graphPath.join("/")}\u0000${nodeId}\u0000${key}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      rows.push({ workflowId: workflow.workflowId, workflowName: workflow.workflowName, revision: workflow.revision, graphPath: [...graphPath], nodeId, nodeLabel, variableKey: key });
    };
    const visit = (graph: Record<string, unknown>, graphPath: string[]) => {
      for (const node of nodesOf(graph)) {
        const nodeId = typeof node.id === "string" ? node.id : "";
        if (!nodeId) continue;
        const nodeLabel = nodeLabelOf(node, nodeId);
        const inputs = objectOf(node.inputs);
        if (inputs) for (const binding of Object.values(inputs)) collectBinding(binding, (key) => add(graphPath, nodeId, nodeLabel, key));
        const config = objectOf(node.config) ?? {};
        if (node.type === "core.router" && Array.isArray(config.cases)) {
          for (const item of config.cases) collectPredicate(objectOf(item)?.predicate, (key) => add(graphPath, nodeId, nodeLabel, key));
        }
        if (graphPath.length < MAX_SUBGRAPH_DEPTH) {
          const child = childGraphOf(node);
          if (child) visit(child, [...graphPath, nodeId]);
        }
      }
      const outputs = objectOf(graph.outputBindings);
      if (outputs) for (const binding of Object.values(outputs)) collectBinding(binding, (key) => add(graphPath, GRAPH_OUTPUT_NODE_ID, GRAPH_OUTPUT_NODE_LABEL, key));
    };
    visit(workflow.definition, []);
  }
  return rows;
}
