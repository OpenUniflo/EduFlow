import { describe, expect, it } from "vitest";
import { summarizeAssignmentAttempts, type AssignmentAttemptHistoryItem } from "./assignmentAttempt";

const attempt = (attemptNumber: number, withdrawn: boolean, outcome?: "passed" | "failed" | "pending"): AssignmentAttemptHistoryItem => ({
  attemptId: `a${attemptNumber}`,
  attemptNumber,
  submittedAt: `2026-01-${String(attemptNumber).padStart(2, "0")}T00:00:00Z`,
  withdrawn,
  ...(withdrawn ? { withdrawnAt: `2026-02-${String(attemptNumber).padStart(2, "0")}T00:00:00Z`, withdrawalSource: "assistant" as const } : {}),
  ...(outcome ? { outcome } : {})
});

describe("summarizeAssignmentAttempts", () => {
  it("counts withdrawn and counting attempts from the full record", () => {
    const summary = summarizeAssignmentAttempts([
      attempt(5, true),
      attempt(4, false, "failed"),
      attempt(3, true, "failed"),
      attempt(2, false, "pending"),
      attempt(1, true, "passed")
    ]);
    expect(summary.totalSubmissions).toBe(5);
    expect(summary.withdrawnSubmissions).toBe(3);
    expect(summary.countingSubmissions).toBe(2);
    expect(summary.latestCountingSubmission).toMatchObject({ attemptNumber: 4, status: "needs_revision" });
  });

  it("returns no latest counting attempt when every submission was withdrawn", () => {
    const summary = summarizeAssignmentAttempts([attempt(2, true), attempt(1, true)]);
    expect(summary).toMatchObject({ totalSubmissions: 2, withdrawnSubmissions: 2, countingSubmissions: 0, latestCountingSubmission: null });
  });
});
