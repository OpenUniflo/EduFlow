import type { WorkflowThreadV2 } from "../../domain/v2/types";

export type RunWaitingResponseTarget = {
  runId: string;
  nodeId: string;
  interruptId: string;
  graphPath: string[];
};

/**
 * A waiting live Run exposes its response form on the current canvas. The
 * read-only history snapshot is not a precondition: requiring it made the form
 * appear only after the Run had been selected from Run History or the page had
 * been refreshed. Thread/Run/path identity still has to match the canvas scope,
 * and the interrupt node must exist in the graph currently on screen.
 */
export function runWaitingResponseTarget(input: {
  phase: string;
  runId: string | null | undefined;
  thread: WorkflowThreadV2 | null;
  interrupt: WorkflowThreadV2["interrupts"][number] | undefined;
  graphPath: readonly string[] | undefined;
  nodeExists: boolean;
}): RunWaitingResponseTarget | null {
  const { phase, runId, thread, interrupt, graphPath, nodeExists } = input;
  if (phase !== "waiting" || !runId || !thread || !interrupt || !nodeExists) return null;
  if (thread.status !== "waiting" || thread.currentRunId !== runId) return null;
  const path = interrupt.graphPath ?? [];
  if (JSON.stringify(path) !== JSON.stringify(graphPath ?? [])) return null;
  return { runId, nodeId: interrupt.nodeId, interruptId: interrupt.id, graphPath: [...path] };
}
