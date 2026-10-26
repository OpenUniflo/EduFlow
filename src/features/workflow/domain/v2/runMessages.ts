/**
 * User-facing Run admission copy. These strings never mention Worker, queue,
 * Daemon, heartbeat, deployment, or digest; those remain server diagnostics.
 */
export const workflowRunnerOfflineMessage = "运行服务暂时没有启动，这次运行没有开始。请稍后再试，或联系管理员。";
export const workflowQueueWaitMessage = "还在等待开始，运行服务可能暂时不可用，可以稍后再看或取消这次运行。";
export const WORKFLOW_QUEUE_WAIT_MS = 30_000;

/** Shows the wait hint only after a Run has stayed queued for the grace period. */
export function workflowQueueWaitNotice(
  run: { status?: string; createdAt?: string } | null | undefined,
  now = Date.now(),
): string | undefined {
  if (!run || run.status !== "queued" || !run.createdAt) return undefined;
  const createdAt = Date.parse(run.createdAt);
  if (!Number.isFinite(createdAt)) return undefined;
  return now - createdAt >= WORKFLOW_QUEUE_WAIT_MS ? workflowQueueWaitMessage : undefined;
}
