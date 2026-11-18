import type { JsonValue, WorkflowDefinitionV2, WorkflowPathEntry, WorkflowStepV2 } from "../../domain/v2/types";
import { nodeAtGraphPath } from "../../domain/v2/authoring";
import { runReferenceKey, runReferenceTargetMap, type RunReferenceSnapshot, type RunReferenceTarget } from "../../domain/v2/runReferences";
import { workflowReferenceInNode } from "../../domain/v2/workflowReferences";

export type SubgraphInvocation = {
  key: string;
  graphPath: string[];
  namespace: string;
  taskId?: string;
  steps: WorkflowStepV2[];
  startedAt?: string;
  finishedAt?: string;
};

export type StepInvocationIdentity = {
  key: string;
  graphPath: string[];
  namespace: string;
  taskId?: string;
};

export type InvocationDeclaredTarget = {
  workflowId: string;
  revision: number;
  environmentRef: string;
};

/** Full launch-time identity of one actual subgraph call. */
export type SubgraphInvocationDetail = SubgraphInvocation & {
  callerGraphPath: string[];
  callerNodeId: string;
  callerNodeLabel?: string;
  workflowPath?: WorkflowPathEntry[];
  declaredTarget?: InvocationDeclaredTarget;
  target?: RunReferenceTarget;
  targetAvailable: boolean;
  fixed: boolean;
  callStep?: WorkflowStepV2;
  input?: JsonValue;
  output?: JsonValue;
  status: string;
  error?: WorkflowStepV2["error"];
  attemptCount: number;
};

export function stepInvocationIdentity(step: WorkflowStepV2): StepInvocationIdentity | undefined {
  const execution = step.execution;
  const graphPath = step.graphPath ?? execution?.graphPath ?? [];
  if (!graphPath.length) return undefined;
  // The checkpoint namespace contains one task id per node, so it changes for
  // every internal Step. The parent task id is the stable identity of the
  // subgraph invocation that owns all of those Steps. Fall back to the
  // graph-scoped namespace for legacy rows that predate parentTaskId.
  const namespace = execution?.graphNamespace || execution?.namespace || (Array.isArray(step.namespace) ? step.namespace.join("|") : "");
  const invocationTask = execution?.parentTaskId || execution?.taskId || step.taskId;
  // Prefer the stable parent task / graph namespace. A legacy namespace is more
  // stable than a per-node task id because the task id changes for every Step.
  const identity = execution?.parentTaskId || execution?.graphNamespace || namespace || invocationTask;
  if (!identity) return undefined;
  return { key: `${graphPath.join("\u0000")}::${identity}`, graphPath, namespace: namespace || identity, taskId: invocationTask };
}

/**
 * Groups real Step identities by the child graph path and checkpoint namespace.
 * The order is the first observed step time, which is evidence for display only;
 * it must not be presented as a scheduler-assigned invocation number.
 */
export function subgraphInvocations(steps: WorkflowStepV2[]): SubgraphInvocation[] {
  const groups = new Map<string, SubgraphInvocation>();
  for (const step of steps) {
    const identity = stepInvocationIdentity(step);
    if (!identity) continue;
    const current = groups.get(identity.key) ?? {
      ...identity,
      steps: [],
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
    };
    current.steps.push(step);
    if (step.startedAt && (!current.startedAt || step.startedAt < current.startedAt)) current.startedAt = step.startedAt;
    if (step.finishedAt && (!current.finishedAt || step.finishedAt > current.finishedAt)) current.finishedAt = step.finishedAt;
    groups.set(identity.key, current);
  }
  return [...groups.values()].sort((left, right) => (left.startedAt ?? "").localeCompare(right.startedAt ?? "") || left.namespace.localeCompare(right.namespace));
}

const samePath = (left: readonly string[] | undefined, right: readonly string[] | undefined) =>
  JSON.stringify(Array.isArray(left) ? left : []) === JSON.stringify(Array.isArray(right) ? right : []);

function latestAttempt(step: WorkflowStepV2): number {
  return Number.isSafeInteger(step.attempt) ? step.attempt : 1;
}

function callRecord(step: WorkflowStepV2, graphPath: readonly string[]): WorkflowPathEntry | undefined {
  const path = step.execution?.workflowPath;
  if (!Array.isArray(path) || path.length < graphPath.length) return undefined;
  const record = path[graphPath.length - 1];
  if (!record || record.nodeId !== graphPath[graphPath.length - 1]) return undefined;
  return record;
}

function declaredTarget(step: WorkflowStepV2, definition: WorkflowDefinitionV2, graphPath: readonly string[]): InvocationDeclaredTarget | undefined {
  const record = callRecord(step, graphPath);
  if (record && typeof record.workflowId === "string" && Number.isSafeInteger(record.revision) && Number(record.revision) > 0 && typeof record.environmentRef === "string" && record.environmentRef) {
    return { workflowId: record.workflowId, revision: Number(record.revision), environmentRef: record.environmentRef };
  }
  const callerPath = graphPath.slice(0, -1);
  const node = nodeAtGraphPath(definition, callerPath, String(graphPath[graphPath.length - 1] ?? ""));
  const reference = node ? workflowReferenceInNode(node) : undefined;
  return reference ? { workflowId: reference.workflowId, revision: reference.revision, environmentRef: reference.environmentRef } : undefined;
}

function callStepFor(steps: readonly WorkflowStepV2[], graphPath: readonly string[], nodeId: string, invocationId?: string): WorkflowStepV2 | undefined {
  const callerPath = graphPath.slice(0, -1);
  const candidates = steps.filter(step => samePath(step.graphPath, callerPath) && step.nodeId === nodeId && (!invocationId || step.execution?.taskId === invocationId));
  // A loop may call the same node repeatedly. The Worker's task id is the exact
  // invocation identity; only fall back to the newest call when legacy rows have
  // no task identity.
  const ordered = [...candidates].sort((left, right) => (left.startedAt ?? "").localeCompare(right.startedAt ?? "") || latestAttempt(left) - latestAttempt(right));
  return ordered[ordered.length - 1];
}

const failureStatuses = new Set(["failed", "interrupted"]);

/**
 * The latest attempt of each child node invocation is the only retry evidence
 * that can speak for that node. Earlier attempts stay in the step list but must
 * never decide the final outcome after a successful retry.
 */
function latestAttemptsByNode(steps: readonly WorkflowStepV2[]): WorkflowStepV2[] {
  const latest = new Map<string, WorkflowStepV2>();
  for (const step of steps) {
    const key = `${step.nodeId}\u0000${Number.isSafeInteger(step.invocation) ? step.invocation : 0}`;
    const previous = latest.get(key);
    if (!previous || latestAttempt(step) >= latestAttempt(previous)) latest.set(key, step);
  }
  return [...latest.values()];
}

function latestFailure(steps: readonly WorkflowStepV2[]): WorkflowStepV2 | undefined {
  return [...steps]
    .filter(step => failureStatuses.has(step.status))
    .sort((left, right) => {
      const leftTime = left.finishedAt ?? left.startedAt ?? "";
      const rightTime = right.finishedAt ?? right.startedAt ?? "";
      return rightTime.localeCompare(leftTime) || latestAttempt(right) - latestAttempt(left);
    })[0];
}

type InvocationOutcome = { status: string; error?: WorkflowStepV2["error"] };

/**
 * A persisted parent call Step is the authoritative terminal record of the
 * actual invocation. Its completed status wins even when a child Step failed
 * before a retry succeeded; those attempts remain visible in the step list.
 */
function outcomeFromCallStep(callStep: WorkflowStepV2, steps: readonly WorkflowStepV2[]): InvocationOutcome {
  const status = callStep.status || "unknown";
  if (status === "completed" || status === "success") return { status };
  if (!failureStatuses.has(status)) return { status };
  const error = callStep.error ?? latestFailure(latestAttemptsByNode(steps))?.error;
  return { status, ...(error ? { error } : {}) };
}

/** Legacy rows without a parent call Step can only rely on each node's latest attempt. */
function outcomeFromSteps(steps: readonly WorkflowStepV2[]): InvocationOutcome {
  const latest = latestAttemptsByNode(steps);
  if (!latest.length) return { status: "unknown" };
  if (latest.some(step => step.status === "running")) return { status: "running" };
  if (latest.some(step => step.status === "waiting")) return { status: "waiting" };
  if (latest.some(step => step.status === "queued")) return { status: "queued" };
  const failure = latestFailure(latest);
  if (failure) return { status: failure.status, ...(failure.error ? { error: failure.error } : {}) };
  if (latest.some(step => step.status === "cancelled")) return { status: "cancelled" };
  if (latest.every(step => step.status === "completed" || step.status === "success")) return { status: "completed" };
  return { status: "unknown" };
}

/**
 * Resolves each actual child invocation against the Run's frozen closure.
 * Repeated calls to one target and equal node ids at different graph paths stay
 * separate because the group key uses the exact graph path + checkpoint
 * namespace, and the parent call Step is found by the Worker task identity.
 */
export function subgraphInvocationDetails(
  steps: WorkflowStepV2[],
  definition: WorkflowDefinitionV2,
  snapshot?: RunReferenceSnapshot | null,
): SubgraphInvocationDetail[] {
  const targets = runReferenceTargetMap(snapshot);
  return subgraphInvocations(steps).map(group => {
    const child = group.steps[0];
    const record = child ? callRecord(child, group.graphPath) : undefined;
    const declared = child ? declaredTarget(child, definition, group.graphPath) : undefined;
    const target = declared ? targets.get(runReferenceKey(declared.workflowId, declared.revision, declared.environmentRef)) : undefined;
    const callerGraphPath = group.graphPath.slice(0, -1);
    const callerNodeId = group.graphPath[group.graphPath.length - 1] ?? "";
    const callerNode = nodeAtGraphPath(definition, callerGraphPath, callerNodeId);
    const callStep = child ? callStepFor(steps, group.graphPath, callerNodeId, record?.invocationId) : undefined;
    const outcome = callStep ? outcomeFromCallStep(callStep, group.steps) : outcomeFromSteps(group.steps);
    return {
      ...group,
      callerGraphPath,
      callerNodeId,
      ...(callerNode ? { callerNodeLabel: callerNode.label } : {}),
      ...(child?.execution?.workflowPath ? { workflowPath: child.execution.workflowPath } : {}),
      ...(declared ? { declaredTarget: declared } : {}),
      ...(target ? { target } : {}),
      targetAvailable: Boolean(target),
      fixed: Boolean(declared),
      ...(callStep ? { callStep } : {}),
      ...(callStep && callStep.input !== undefined ? { input: callStep.input } : {}),
      ...(callStep && callStep.output !== undefined ? { output: callStep.output } : {}),
      status: outcome.status,
      ...(outcome.error ? { error: outcome.error } : {}),
      attemptCount: Math.max(1, ...group.steps.map(latestAttempt)),
    };
  });
}

/** Human-readable call chain without inventing a target name when none was frozen. */
export function invocationCallPath(detail: SubgraphInvocationDetail): string[] {
  const labels: string[] = [];
  for (const entry of detail.workflowPath ?? []) {
    if (entry.nodeId) labels.push(entry.nodeId);
  }
  if (!labels.length) labels.push(detail.callerNodeLabel ?? detail.callerNodeId);
  return labels;
}
