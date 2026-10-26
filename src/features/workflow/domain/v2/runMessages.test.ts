import { describe, expect, it } from "vitest";
import { WORKFLOW_QUEUE_WAIT_MS, workflowQueueWaitMessage, workflowQueueWaitNotice } from "./runMessages";

const createdAt = "2026-10-24T10:00:00.000Z";
const at = (offsetMs: number) => Date.parse(createdAt) + offsetMs;

describe("Run admission copy", () => {
  it("shows the wait explanation only after the 30 second grace period", () => {
    expect(workflowQueueWaitNotice({ status: "queued", createdAt }, at(WORKFLOW_QUEUE_WAIT_MS - 1))).toBeUndefined();
    expect(workflowQueueWaitNotice({ status: "queued", createdAt }, at(WORKFLOW_QUEUE_WAIT_MS))).toBe(workflowQueueWaitMessage);
  });

  it("removes the wait explanation once the Run starts or ends", () => {
    for (const status of ["running", "waiting", "success", "failed", "cancelled"]) {
      expect(workflowQueueWaitNotice({ status, createdAt }, at(WORKFLOW_QUEUE_WAIT_MS * 2))).toBeUndefined();
    }
    expect(workflowQueueWaitNotice({ status: "queued", createdAt: "" }, at(WORKFLOW_QUEUE_WAIT_MS * 2))).toBeUndefined();
  });

  it("contains no internal service terminology", () => {
    for (const term of ["Worker", "队列", "Daemon", "心跳", "部署", "digest", "执行器"]) {
      expect(workflowQueueWaitMessage).not.toContain(term);
    }
    expect(workflowQueueWaitMessage).toBe("运行已排队超过 30 秒，正在等待开始。可以稍后再看或取消这次运行。");
  });
});
