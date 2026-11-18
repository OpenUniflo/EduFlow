import { send } from "@vercel/queue";
import { ApiError } from "./http.js";
import { resolveWorkflowRunnerMode, WORKFLOW_QUEUE_TOPIC } from "./workflowQueue.js";

/**
 * A manual re-evaluation has a database row before this publish. Queue push mode uses the
 * existing Workflow consumer with `kind=evaluation`; the consumer drains due jobs and
 * schedules a follow-up sweep while leases/retries are still pending. Local daemon mode
 * already polls the same rows, so it needs no message.
 */
export async function dispatchEvaluationWakeup(evaluationId: string): Promise<"local" | "queued"> {
  if (resolveWorkflowRunnerMode() !== "queue") return "local";
  try {
    await send(
      WORKFLOW_QUEUE_TOPIC,
      { kind: "evaluation", evaluationId },
      { idempotencyKey: `evaluation:${evaluationId}`, delaySeconds: 1, retentionSeconds: 3_600 },
    );
    return "queued";
  } catch {
    throw new ApiError(503, "EVALUATION_WAKEUP_FAILED", "评价已创建但暂时无法唤醒执行器；请稍后刷新或重试。", { evaluationId, retryable: true });
  }
}
