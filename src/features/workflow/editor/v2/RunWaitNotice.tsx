import type { WorkflowRunV2 } from "../../domain/v2/types";
import { workflowQueueWaitNotice } from "../../domain/v2/runMessages";

/** Calm wait hint; it disappears as soon as the Run leaves the queued state. */
export function RunWaitNotice({ run, now }: { run: WorkflowRunV2 | null | undefined; now?: number }) {
  const message = workflowQueueWaitNotice(run, now);
  return message ? <p className="wf-queue-wait-note" role="status">{message}</p> : null;
}
