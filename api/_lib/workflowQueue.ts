import { send } from "@vercel/queue";
import { ApiError } from "./http.js";

/**
 * Queue push mode is the only execution mode on Vercel. The database remains the durable
 * authority: `workflow_v2_enqueue`/`workflow_v2_resume`/`p5_start` still write the
 * `workflow_live_runs` and `workflow_run_jobs` rows before this module publishes the
 * runId-only message. A failed publish therefore leaves a recoverable queued Run.
 */
export const WORKFLOW_QUEUE_TOPIC = "workflow-runs";
export const WORKFLOW_QUEUE_TIMEOUT_KIND = "timeout";
/** The database queue timeout is 60s; the delayed check leaves a delivery margin. */
export const WORKFLOW_QUEUE_TIMEOUT_DELAY_SECONDS = 75;
export const WORKFLOW_QUEUE_TIMEOUT_RETENTION_SECONDS = 3_600;
export type WorkflowRunnerMode = "queue" | "daemon";

/**
 * Vercel Preview and Production are queue-only; there is no hosted daemon to switch back
 * to. `pnpm workflow:local` (no `VERCEL_ENV`) keeps the local worker/watchdog path, and
 * `WORKFLOW_RUNNER_MODE` may only choose a local mode.
 */
export function resolveWorkflowRunnerMode(env: NodeJS.ProcessEnv = process.env): WorkflowRunnerMode {
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "production") return "queue";
  const explicit = env.WORKFLOW_RUNNER_MODE?.trim().toLowerCase();
  if (explicit === "queue" || explicit === "daemon") return explicit;
  if (explicit) throw new Error("WORKFLOW_RUNNER_MODE must be queue or daemon");
  return "daemon";
}

export function workflowQueueRunId(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}

/**
 * Publish one runId plus a delayed queue-timeout check. The database remains queued if the
 * primary publish throws. The delayed check is best effort: the Run is already recoverable
 * through its database row, and any later queue activity also runs the bounded watchdog.
 */
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
  try {
    await send(
      WORKFLOW_QUEUE_TOPIC,
      { runId, kind: WORKFLOW_QUEUE_TIMEOUT_KIND },
      {
        idempotencyKey: `run:${runId}:timeout`,
        delaySeconds: WORKFLOW_QUEUE_TIMEOUT_DELAY_SECONDS,
        retentionSeconds: WORKFLOW_QUEUE_TIMEOUT_RETENTION_SECONDS,
      },
    );
  } catch {
    // Do not fail an accepted Run because its safety-net message was not scheduled. The
    // next consumer activity still sweeps bounded queue timeouts through the watchdog.
    console.warn("Workflow queue timeout check could not be scheduled", runId);
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
