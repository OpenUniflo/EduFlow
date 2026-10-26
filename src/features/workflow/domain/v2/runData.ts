import type { JsonValue, WorkflowDefinitionV2, WorkflowNodeV2 } from "./types";

/** The subset of a Run Step that node run data needs. */
export type RunStepInput = {
  stepId: string; runId: string; nodeId: string; status: string;
  input?: JsonValue; output?: JsonValue; startedAt?: string; finishedAt?: string; graphPath?: string[];
  error?: { code: string; message: string; category?: string; retryable?: boolean; externalStatus?: number; httpStatus?: number; reason?: string; provider?: string; model?: string; host?: string; tool?: string; effect?: string; elapsedMs?: number; timeoutMs?: number };
};

export type NodeRunWrite = { field: string; pointer: string; value: JsonValue | undefined; reducer: string };

export type NodeRunData = {
  runId: string; stepId: string; status: string;
  input?: JsonValue; output?: JsonValue;
  error?: RunStepInput["error"];
  writes: NodeRunWrite[];
  elapsedMs?: number;
  /** Zero-based position of the selected (last) invocation in the supplied step list. */
  stepIndex: number;
  /** How many times this node ran in the selected scope; loops produce more than one. */
  invocationCount: number;
};

function pathKey(graphPath: readonly string[] | undefined): string {
  return JSON.stringify(Array.isArray(graphPath) ? graphPath.filter(segment => typeof segment === "string") : []);
}

function childGraph(node: WorkflowNodeV2): WorkflowDefinitionV2 | undefined {
  if (node.type !== "core.subgraph") return undefined;
  const graph = node.config.graph;
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) return undefined;
  return Array.isArray((graph as unknown as WorkflowDefinitionV2).nodes) ? graph as unknown as WorkflowDefinitionV2 : undefined;
}

function findNode(definition: WorkflowDefinitionV2, graphPath: readonly string[], nodeId: string): WorkflowNodeV2 | undefined {
  let graph: WorkflowDefinitionV2 | undefined = definition;
  for (const segment of graphPath) {
    if (!graph || !Array.isArray(graph.nodes)) return undefined;
    const parent: WorkflowNodeV2 | undefined = graph.nodes.find(item => item && item.id === segment);
    graph = parent ? childGraph(parent) : undefined;
    if (!graph) return undefined;
  }
  return graph && Array.isArray(graph.nodes) ? graph.nodes.find(item => item && item.id === nodeId) : undefined;
}

function elapsedMs(step: RunStepInput): number | undefined {
  if (!step.startedAt || !step.finishedAt) return undefined;
  const started = Date.parse(step.startedAt);
  const finished = Date.parse(step.finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return undefined;
  return finished - started;
}

/** Reads the step output at a node write pointer; an empty pointer means the whole output. */
export function readOutputPointer(output: JsonValue | undefined, pointer: string): JsonValue | undefined {
  if (pointer === "") return output;
  if (typeof pointer !== "string" || !pointer.startsWith("/")) return undefined;
  let current: JsonValue | undefined = output;
  for (const raw of pointer.slice(1).split("/")) {
    const token = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) return undefined;
      current = current[Number(token)];
    } else if (typeof current === "object") {
      if (!Object.prototype.hasOwnProperty.call(current, token)) return undefined;
      current = (current as Record<string, JsonValue>)[token];
    } else return undefined;
  }
  return current;
}

/**
 * Derives the selected Run step for one node, preferring the last invocation when a loop ran it
 * repeatedly. Writes are inferred from the step output plus `node.writes`; the runtime does not
 * persist a State snapshot (plan fact F5), so this shows the written value only.
 */
export function nodeRunData(definition: WorkflowDefinitionV2, steps: readonly RunStepInput[], nodeId: string, graphPath: readonly string[] = []): NodeRunData | null {
  if (!definition || typeof definition !== "object" || !Array.isArray(definition.nodes)) return null;
  if (!Array.isArray(steps) || !nodeId) return null;
  const targetPath = Array.isArray(graphPath) ? graphPath : [];
  const node = findNode(definition, targetPath, nodeId);
  if (!node) return null;

  const targetKey = pathKey(targetPath);
  let selected: RunStepInput | undefined;
  let stepIndex = -1;
  let invocationCount = 0;
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index] as RunStepInput | undefined;
    if (!step || typeof step !== "object" || step.nodeId !== nodeId) continue;
    if (pathKey(step.graphPath) !== targetKey) continue;
    invocationCount++;
    selected = step;
    stepIndex = index;
  }
  if (!selected) return null;

  const reducers = definition.state && typeof definition.state === "object" ? definition.state.reducers : undefined;
  const writes: NodeRunWrite[] = [];
  for (const [field, pointer] of Object.entries(node.writes ?? {})) {
    if (!field || typeof pointer !== "string") continue;
    const reducer = reducers && typeof reducers === "object" && reducers[field] && typeof reducers[field].name === "string" ? reducers[field].name : "replace";
    writes.push({ field, pointer, value: readOutputPointer(selected.output, pointer), reducer });
  }

  const elapsed = elapsedMs(selected);
  return {
    runId: selected.runId,
    stepId: selected.stepId,
    status: selected.status,
    ...(selected.input === undefined ? {} : { input: selected.input }),
    ...(selected.output === undefined ? {} : { output: selected.output }),
    ...(selected.error === undefined ? {} : { error: selected.error }),
    writes,
    ...(elapsed === undefined ? {} : { elapsedMs: elapsed }),
    stepIndex,
    invocationCount,
  };
}
