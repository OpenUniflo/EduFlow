import { send } from "@vercel/queue";
import { ApiError } from "./http.js";

/**
 * Queue push mode replaces the always-on Worker for new Runs. The database remains the
 * durable authority: `workflow_v2_enqueue`/`workflow_v2_resume`/`p5_start` still write the
 * `workflow_live_runs` and `workflow_run_jobs` rows before this module publishes the
 * runId-only message. A failed publish therefore leaves a recoverable queued Run.
 */
export const WORKFLOW_QUEUE_TOPIC = "workflow-runs";
export type WorkflowRunnerMode = "queue" | "daemon";

/**
 * Local development and `pnpm workflow:local` keep the Daemon path. Vercel Preview and
 * Production default to Queue push mode; an explicit switch exists for incident/rollback
 * operations without changing the deployment environment.
 */
export function resolveWorkflowRunnerMode(env: NodeJS.ProcessEnv = process.env): WorkflowRunnerMode {
  const explicit = env.WORKFLOW_RUNNER_MODE?.trim().toLowerCase();
  if (explicit === "queue" || explicit === "daemon") return explicit;
  if (explicit) throw new Error("WORKFLOW_RUNNER_MODE must be queue or daemon");
  return env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "production" ? "queue" : "daemon";
}

export function workflowQueueRunId(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}

/** Publish exactly one runId. The database remains queued if this throws. */
export async function dispatchWorkflowRun(runId: string): Promise<void> {
  try {
    await send(WORKFLOW_QUEUE_TOPIC, { runId }, { idempotencyKey: `run:${runId}` });
  } catch {
    // Bounded, credential-free error. Repeated requests use the same idempotency key, so a
    // retry re-publishes safely and the consumer claims the Run at most once.
    throw new ApiError(
      503,
      "WORKFLOW_QUEUE_DISPATCH_FAILED",
      "The Run is queued but the queue message could not be sent; retry with the same Idempotency-Key",
      { runId, retryable: true },
    );
  }
}

/** Dispatch only accepted Run results; terminal/active replays are no-ops. */
export async function dispatchQueuedWorkflow(result: unknown): Promise<void> {
  if (resolveWorkflowRunnerMode() !== "queue" || !result || typeof result !== "object") return;
  const row = result as Record<string, unknown>;
  if (row.status !== "queued") return;
  const runId = workflowQueueRunId(row.runId);
  if (runId) await dispatchWorkflowRun(runId);
}
