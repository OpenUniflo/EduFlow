import { describe, expect, it } from "vitest";
import { threadResumeLabel } from "./SessionHistoryWorkspace";

describe("thread resume labels", () => {
  it("marks stale completed threads as read-only instead of promising continuation", () => {
    expect(threadResumeLabel({ status: "closed", current_run_id: "run", resumable: true })).toBe("本轮完成 · 可继续");
    expect(threadResumeLabel({ status: "closed", current_run_id: "run", resumable: false })).toBe("历史只读 · 不可继续");
  });

  it("keeps waiting recovery and active execution distinct", () => {
    expect(threadResumeLabel({ status: "waiting", current_run_id: "run", resumable: true })).toBe("等待回应");
    expect(threadResumeLabel({ status: "active", current_run_id: "run", resumable: false })).toBe("执行中");
    expect(threadResumeLabel({ status: "expired", current_run_id: "run" })).toBe("已到期");
  });
});
