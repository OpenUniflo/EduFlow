import type { WorkflowStepV2 } from "../../domain/v2/types";

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

export function stepInvocationIdentity(step: WorkflowStepV2): StepInvocationIdentity | undefined {
  const execution = step.execution as (typeof step.execution & { graphPath?: string[] }) | undefined;
  const graphPath = step.graphPath ?? execution?.graphPath ?? [];
  if (!graphPath.length) return undefined;
  const namespace = execution?.namespace ?? (Array.isArray(step.namespace) ? step.namespace.join("|") : "");
  if (!namespace) return undefined;
  return { key: `${graphPath.join("\u0000")}::${namespace}`, graphPath, namespace, taskId: execution?.taskId ?? step.taskId };
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
