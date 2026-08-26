import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/apiClient", () => ({ apiRequest }));

import { ApiMicroLearningRepository } from "./ApiMicroLearningRepository";

const payload = {
  paths: [{ id: "path", knowledgeId: "knowledge", scope: "global", title: "Public Micro", mode: "learn", estimatedMinutes: 2, required: true, status: "published", units: [{ id: "unit", pathId: "path", title: "Unit", position: 0, estimatedMinutes: 2, required: true, steps: [{ id: "step", kind: "check", title: "Check", body: "Question", interaction: { type: "choice", options: ["A", "B"], correctIndex: 0 } }] }] }],
  pathProgress: [], unitProgress: []
};

describe("anonymous Micro Learning", () => {
  beforeEach(() => { apiRequest.mockReset(); apiRequest.mockResolvedValueOnce(payload).mockResolvedValue({ correct: true, completed: false }); });

  it("keeps start and completion progress in memory without a durable start write", async () => {
    const repository = new ApiMicroLearningRepository();
    await repository.hydrate();
    await repository.start("path");
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(repository.getPathProgress("path")?.status).toBe("in_progress");
    const result = await repository.completeStep("path", "unit", "step", "A");
    expect(result).toEqual({ correct: true, completed: true });
    expect(repository.getPathProgress("path")?.status).toBe("completed");
    expect(apiRequest).toHaveBeenLastCalledWith("/api/micro", expect.objectContaining({ method: "POST" }));
  });
});
