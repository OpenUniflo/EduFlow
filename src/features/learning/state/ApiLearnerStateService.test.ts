import { describe, expect, it, vi, beforeEach } from "vitest";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/shared/api/apiClient", () => ({ apiRequest }));

import { ApiLearnerStateService } from "./ApiLearnerStateService";

describe("assignment result lookup", () => {
  beforeEach(() => { apiRequest.mockReset(); apiRequest.mockResolvedValue({ result: null }); });

  it("reads one exact Attempt when the card carries an attemptId", async () => {
    const service = new ApiLearnerStateService();
    await service.getAssignmentResult("course-1", "assignment-1", undefined, "attempt-2");
    expect(apiRequest).toHaveBeenCalledWith("/api/learning?courseId=course-1&assignmentId=assignment-1&attemptId=attempt-2");
  });

  it("keeps the historical latest-Attempt fallback when no attemptId exists", async () => {
    const service = new ApiLearnerStateService();
    await service.getAssignmentResult("course-1", "assignment-1");
    expect(apiRequest).toHaveBeenCalledWith("/api/learning?courseId=course-1&assignmentId=assignment-1");
  });

  it("preserves the action-run lookup for action results", async () => {
    const service = new ApiLearnerStateService();
    await service.getAssignmentResult("course-1", "assignment-1", "run-1");
    expect(apiRequest).toHaveBeenCalledWith("/api/learning?courseId=course-1&assignmentId=assignment-1&actionRunId=run-1");
  });
});
