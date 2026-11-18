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

/**
 * Registered function usages across the root definition and nested subgraphs.
 * Function references are owner-local names without a `p4:` prefix, pinned by
 * `functionVersion`; error handlers use the same `functionRef`/`functionVersion`
 * pair under `config.authoring.errorHandler`. One node contributes at most one
 * row even when it uses the same function as both its body and its handler.
 */
export function functionReferenceRows(workflows: readonly ReferenceWorkflow[], ref: unknown): ConnectionReferenceRow[] {
  const wanted = typeof ref === "string" ? ref.trim() : "";
  if (!wanted || wanted.length > 256) return [];
  const rows: ConnectionReferenceRow[] = [];
  const seen = new Set<string>();
  const visit = (workflow: ReferenceWorkflow, graph: Record<string, unknown>, graphPath: string[]) => {
    for (const node of nodesOf(graph)) {
      const nodeId = typeof node.id === "string" ? node.id : "";
      if (!nodeId) continue;
      const config = objectOf(node.config) ?? {};
      const handler = objectOf(objectOf(config.authoring)?.errorHandler);
      const versions: (number | undefined)[] = [];
      if (node.type === "core.function" && config.implementation === "registered" && config.functionRef === wanted) {
        versions.push(typeof config.functionVersion === "number" && Number.isSafeInteger(config.functionVersion) ? config.functionVersion : undefined);
      }
      if (handler?.functionRef === wanted) {
        versions.push(typeof handler.functionVersion === "number" && Number.isSafeInteger(handler.functionVersion) ? handler.functionVersion : undefined);
      }
      if (versions.length) {
        const version = versions[0];
        const identity = `${workflow.workflowId}\u0000${graphPath.join("/")}\u0000${nodeId}\u0000${version ?? "unknown"}`;
        if (!seen.has(identity)) {
          seen.add(identity);
          rows.push({
            workflowId: workflow.workflowId,
            workflowName: workflow.workflowName,
            revision: workflow.revision,
            graphPath: [...graphPath],
            nodeId,
            nodeLabel: nodeLabelOf(node, nodeId),
            ...(version === undefined ? {} : { version }),
          });
        }
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

/** Fixed independent Workflow reference carried by a `core.subgraph` node. */
export type WorkflowReferenceEdge = {
  graphPath: string[];
  nodeId: string;
  nodeLabel: string;
  targetWorkflowId: string;
  targetRevision: number;
  environmentRef: string;
  inputs: Record<string, unknown>;
  writes: Record<string, unknown>;
};

export const MAX_WORKFLOW_REFERENCE_DEPTH = 8;
export const MAX_WORKFLOW_REFERENCE_NODES = 64;
export const MAX_WORKFLOW_REFERENCE_CHAIN_NODES = 256;
export const MAX_WORKFLOW_REFERENCE_WORKFLOWS = 32;

function referenceShapeOf(node: Record<string, unknown>): { config: Record<string, unknown>; reference: Record<string, unknown> } | undefined {
  if (node.type !== "core.subgraph") return undefined;
  const config = objectOf(node.config);
  const reference = objectOf(config?.workflowRef);
  return config && reference ? { config, reference } : undefined;
}

function validReferenceRevision(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647 ? value : undefined;
}

/** One reference node's declared target, or undefined when the node is embedded/not a subgraph. */
export function workflowReferenceOfNode(node: Record<string, unknown>): Omit<WorkflowReferenceEdge, "graphPath" | "nodeId" | "nodeLabel" | "inputs" | "writes"> | undefined {
  const shape = referenceShapeOf(node);
  if (!shape) return undefined;
  const workflowId = typeof shape.reference.workflowId === "string" ? shape.reference.workflowId.trim() : "";
  const revision = validReferenceRevision(shape.reference.revision);
  const environmentRef = typeof shape.config.environmentRef === "string" ? shape.config.environmentRef.trim() : "";
  if (!workflowId || revision === undefined || !environmentRef) return undefined;
  return { targetWorkflowId: workflowId, targetRevision: revision, environmentRef };
}

/**
 * Structural issues for the reference form. Embedded graphs remain accepted.
 * Reference nodes pin one exact revision, one explicit environment and isolated
 * state; `config.graph` and `config.workflowRef` are mutually exclusive.
 */
export function workflowReferenceIssues(definition: Record<string, unknown>, path: string[] = []): string[] {
  const issues: string[] = [];
  const nodes = nodesOf(definition);
  for (const node of nodes) {
    const nodeId = typeof node.id === "string" ? node.id : "";
    if (node.type !== "core.subgraph" || !nodeId) continue;
    const config = objectOf(node.config);
    const location = [...path, nodeId].join(" / ");
    if (!config) { issues.push(`${location}: 子图配置无效`); continue; }
    if (config.graph !== undefined && config.workflowRef !== undefined) {
      issues.push(`${location}: 不能同时保存内嵌子图和固定版本引用`);
      continue;
    }
    if (config.workflowRef === undefined) {
      if (!objectOf(config.graph) || !Array.isArray(objectOf(config.graph)?.nodes)) issues.push(`${location}: 缺少内嵌子图或固定版本引用`);
      continue;
    }
    const reference = objectOf(config.workflowRef);
    if (!reference) { issues.push(`${location}: 固定版本引用格式无效`); continue; }
    const keys = Object.keys(reference).sort();
    if (keys.length !== 2 || keys[0] !== "revision" || keys[1] !== "workflowId") issues.push(`${location}: 固定版本引用只能包含 workflowId 和 revision`);
    if (typeof reference.workflowId !== "string" || !reference.workflowId.trim() || reference.workflowId.trim().length > 128) issues.push(`${location}: 目标工作流标识无效`);
    if (validReferenceRevision(reference.revision) === undefined) issues.push(`${location}: 固定修订必须是正整数`);
    if (typeof config.environmentRef !== "string" || !config.environmentRef.trim() || config.environmentRef.trim().length > 160) issues.push(`${location}: 必须指定目标运行环境`);
    if (config.stateMode !== undefined && config.stateMode !== "independent") issues.push(`${location}: 引用只能使用隔离状态`);
    if (config.persistence !== undefined && config.persistence !== "per-invocation") issues.push(`${location}: 引用只能使用每次调用隔离的检查点`);
    const extra = Object.keys(config).filter((key) => !["workflowRef", "environmentRef", "stateMode", "persistence"].includes(key));
    if (extra.length) issues.push(`${location}: 引用配置包含未知字段 ${extra.join(", ")}`);
  }
  if (path.length < MAX_WORKFLOW_REFERENCE_DEPTH) {
    for (const node of nodes) {
      const child = objectOf(node.config)?.graph;
      if (node.type === "core.subgraph" && child && typeof child === "object" && !Array.isArray(child)) {
        issues.push(...workflowReferenceIssues(child as Record<string, unknown>, [...path, typeof node.id === "string" ? node.id : "?"]));
      }
    }
  } else if (nodes.some((node) => node.type === "core.subgraph" && objectOf(objectOf(node.config)?.graph))) {
    issues.push(`${path.join(" / ")}: 子图嵌套超过 ${MAX_WORKFLOW_REFERENCE_DEPTH} 层`);
  }
  return issues;
}

/** Fixed reference edges across the root definition and its embedded graphs. */
export function workflowReferenceEdges(definition: Record<string, unknown>): WorkflowReferenceEdge[] {
  const edges: WorkflowReferenceEdge[] = [];
  const visit = (graph: Record<string, unknown>, graphPath: string[]) => {
    for (const node of nodesOf(graph)) {
      const nodeId = typeof node.id === "string" ? node.id : "";
      if (!nodeId) continue;
      const target = workflowReferenceOfNode(node);
      if (target) {
        const config = objectOf(node.config) ?? {};
        edges.push({
          graphPath: [...graphPath],
          nodeId,
          nodeLabel: nodeLabelOf(node, nodeId),
          ...target,
          inputs: objectOf(node.inputs) ?? {},
          writes: objectOf(node.writes) ?? {},
        });
      }
      if (graphPath.length < MAX_WORKFLOW_REFERENCE_DEPTH) {
        const child = childGraphOf(node);
        if (child) visit(child, [...graphPath, nodeId]);
      }
    }
  };
  visit(definition, []);
  return edges;
}

export type FixedReferenceIssue = { code: "WORKFLOW_REFERENCE_CYCLE" | "WORKFLOW_REFERENCE_LIMIT"; message: string };

/**
 * Checks an actual fixed-revision dependency closure. Callers resolve each exact
 * `(workflowId, revision)` to its definition; a missing target is a separate
 * availability error. The same target may be reused from many nodes.
 */
export function fixedRevisionReferenceIssue(
  root: { workflowId: string; revision: number },
  resolve: (workflowId: string, revision: number) => Record<string, unknown> | undefined,
): FixedReferenceIssue | undefined {
  const rootIdentity = `${root.workflowId}@${root.revision}`;
  const seenTargets = new Set<string>();
  let nodeCount = 0;
  const visit = (workflowId: string, revision: number, path: string[]): FixedReferenceIssue | undefined => {
    const identity = `${workflowId}@${revision}`;
    if (path.includes(identity)) return { code: "WORKFLOW_REFERENCE_CYCLE", message: `固定版本引用形成循环：${[...path, identity].join(" -> ")}` };
    if (path.length > MAX_WORKFLOW_REFERENCE_DEPTH) return { code: "WORKFLOW_REFERENCE_LIMIT", message: `固定版本引用超过 ${MAX_WORKFLOW_REFERENCE_DEPTH} 层` };
    const definition = resolve(workflowId, revision);
    if (!definition) return undefined;
    for (const edge of workflowReferenceEdges(definition)) {
      nodeCount += 1;
      seenTargets.add(`${edge.targetWorkflowId}@${edge.targetRevision}`);
      if (nodeCount > MAX_WORKFLOW_REFERENCE_CHAIN_NODES) return { code: "WORKFLOW_REFERENCE_LIMIT", message: `引用闭包超过 ${MAX_WORKFLOW_REFERENCE_CHAIN_NODES} 个引用节点` };
      if (seenTargets.size > MAX_WORKFLOW_REFERENCE_WORKFLOWS) return { code: "WORKFLOW_REFERENCE_LIMIT", message: `引用闭包超过 ${MAX_WORKFLOW_REFERENCE_WORKFLOWS} 个目标修订` };
      const issue = visit(edge.targetWorkflowId, edge.targetRevision, [...path, identity]);
      if (issue) return issue;
    }
    return undefined;
  };
  return visit(root.workflowId, root.revision, []);
}
