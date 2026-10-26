import { describe, expect, it } from "vitest";
import { WORKFLOW_QUEUE_WAIT_MS, workflowQueueWaitMessage, workflowQueueWaitNotice, workflowRunnerOfflineMessage } from "./runMessages";

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
    for (const message of [workflowRunnerOfflineMessage, workflowQueueWaitMessage]) {
      for (const term of ["Worker", "队列", "Daemon", "心跳", "部署", "digest", "执行器"]) {
        expect(message).not.toContain(term);
      }
    }
    expect(workflowRunnerOfflineMessage).toBe("运行服务暂时没有启动，这次运行没有开始。请稍后再试，或联系管理员。");
    expect(workflowQueueWaitMessage).toBe("还在等待开始，运行服务可能暂时不可用，可以稍后再看或取消这次运行。");
  });
});
