import { describe, expect, it } from "vitest";
import { hasStartedAssignment, practiceStatusView } from "./assignmentStatus";

describe("hasStartedAssignment", () => {
  it("treats an untouched or absent assignment as not started", () => {
    expect(hasStartedAssignment(undefined)).toBe(false);
    expect(hasStartedAssignment("not_started")).toBe(false);
    expect(hasStartedAssignment("not-started")).toBe(false);
  });

  it("treats every real lifecycle state as started", () => {
    for (const status of ["started", "in-progress", "submitted", "needs_revision", "accepted", "completed"] as const) {
      expect(hasStartedAssignment(status)).toBe(true);
    }
  });
});

describe("practiceStatusView", () => {
  it("never calls accepted or revising work in progress", () => {
    expect(practiceStatusView("accepted", { evaluator: "ai", status: "succeeded" }).label).toBe("已通过");
    expect(practiceStatusView("needs_revision", { evaluator: "ai" }).label).toBe("需要修改");
  });

  it("distinguishes AI evaluation from teacher review", () => {
    expect(practiceStatusView("submitted", { evaluator: "ai", status: "running" }).label).toBe("评价中");
    expect(practiceStatusView("submitted", { evaluator: "teacher" }).label).toBe("待老师评价");
    expect(practiceStatusView("submitted", { evaluator: "ai", status: "handed_off" }).label).toBe("待老师评价");
  });

  it("keeps a real started state separate from submitted states", () => {
    expect(practiceStatusView("started").label).toBe("进行中");
    expect(practiceStatusView(undefined).label).toBe("未开始");
  });
});
