import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiLearningProgressRepository } from "./ApiLearningProgressRepository";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/apiClient", () => ({ apiRequest: apiRequestMock }));

describe("ApiLearningProgressRepository write queue", () => {
  beforeEach(() => apiRequestMock.mockReset());

  it("keeps successful writes in enqueue order", async () => {
    apiRequestMock.mockResolvedValue(undefined);
    const repository = new ApiLearningProgressRepository();

    repository.updateMaterialState("user-1", "course-1", "material-a", { progress: 10 });
    repository.updateMaterialState("user-1", "course-1", "material-b", { progress: 20 });

    await expect(repository.flush()).resolves.toBeUndefined();
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(apiRequestMock.mock.calls[0][1].body).materialStates).toHaveProperty("material-a");
    expect(JSON.parse(apiRequestMock.mock.calls[1][1].body).materialStates).toHaveProperty("material-b");
  });

  it("runs a later write after a rejected write and reports the failure through flush", async () => {
    apiRequestMock.mockRejectedValueOnce(new Error("progress write A failed")).mockResolvedValueOnce(undefined);
    const repository = new ApiLearningProgressRepository();

    repository.updateMaterialState("user-1", "course-1", "material-a", { progress: 10 });
    repository.updateMaterialState("user-1", "course-1", "material-b", { progress: 20 });

    await expect(repository.flush()).rejects.toThrow("progress write A failed");
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(apiRequestMock.mock.calls[1][1].body).materialStates).toHaveProperty("material-b");
  });

  it("continues after a middle failure and acknowledges that failure once", async () => {
    apiRequestMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("progress write B failed"))
      .mockResolvedValueOnce(undefined);
    const repository = new ApiLearningProgressRepository();

    repository.updateMaterialState("user-1", "course-1", "material-a", { progress: 10 });
    repository.updateMaterialState("user-1", "course-1", "material-b", { progress: 20 });
    repository.updateMaterialState("user-1", "course-1", "material-c", { progress: 30 });

    await expect(repository.flush()).rejects.toThrow("progress write B failed");
    expect(apiRequestMock).toHaveBeenCalledTimes(3);

    repository.updateMaterialState("user-1", "course-1", "material-d", { progress: 40 });
    await expect(repository.flush()).resolves.toBeUndefined();
    expect(apiRequestMock).toHaveBeenCalledTimes(4);
  });
});
