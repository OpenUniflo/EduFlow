/**
 * User-facing Run wait copy. The string never mentions Worker, queue, Daemon,
 * heartbeat, deployment, or digest; those remain server diagnostics.
 */
export const workflowQueueWaitMessage = "运行已排队超过 30 秒，正在等待开始。可以稍后再看或取消这次运行。";
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
