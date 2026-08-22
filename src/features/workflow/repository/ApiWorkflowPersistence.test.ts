import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedWorkflowSettings } from "./WorkflowPersistence";
import { ApiRequestError } from "@/shared/api/apiClient";
import { ApiWorkflowPersistence, isTransientPostgrestClaimsError, normalizeWorkflowSettings } from "./ApiWorkflowPersistence";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/apiClient", () => ({
  apiRequest: apiRequestMock,
  ApiRequestError: class ApiRequestError extends Error {
    constructor(readonly code: string | undefined, message: string, readonly status: number) {
      super(message);
    }
  }
}));

const defaults: PersistedWorkflowSettings = {
  dailyReminder: true,
  compactMode: false,
  emailDigest: true,
  environments: [{ id: "development", name: "Development", baseUrl: "", apiKey: "", model: "", searchApiUrl: "", searchApiKey: "", databaseUrl: "", fileStoragePath: "", note: "" }],
  activeEnvironmentId: "development"
};

async function createHydratedPersistence() {
  apiRequestMock.mockResolvedValueOnce({ state: {}, settings: defaults, builtinWorkflowIds: [] });
  const persistence = new ApiWorkflowPersistence(defaults);
  await persistence.hydrate();
  apiRequestMock.mockClear();
  return persistence;
}

describe("normalizeWorkflowSettings", () => {
  it("keeps safe environment defaults when persisted settings are incomplete", () => {
    expect(normalizeWorkflowSettings(defaults, { compactMode: true } as Partial<PersistedWorkflowSettings>)).toMatchObject({
      compactMode: true,
      activeEnvironmentId: "development",
      environments: defaults.environments
    });
  });

  it("falls back to an available environment when the persisted active id is stale", () => {
    expect(normalizeWorkflowSettings(defaults, { environments: defaults.environments, activeEnvironmentId: "missing" })).toMatchObject({
      activeEnvironmentId: "development"
    });
  });
});

describe("ApiWorkflowPersistence hydration", () => {
  beforeEach(() => apiRequestMock.mockReset());

  it("retries one precise PGRST303 hydration failure and then uses the successful payload", async () => {
    apiRequestMock
      .mockRejectedValueOnce(new ApiRequestError("PGRST303", "temporary claims failure", 500))
      .mockResolvedValueOnce({ state: { activeTemplateId: "workflow-a" }, settings: defaults, builtinWorkflowIds: [] });
    const persistence = new ApiWorkflowPersistence(defaults);

    await expect(persistence.hydrate()).resolves.toBeUndefined();

    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(persistence.readState()).toEqual({ activeTemplateId: "workflow-a" });
  });

  it("does not retry other API failures", async () => {
    const error = new ApiRequestError("unauthorized", "session expired", 401);
    apiRequestMock.mockRejectedValueOnce(error);

    await expect(new ApiWorkflowPersistence(defaults).hydrate()).rejects.toBe(error);

    expect(isTransientPostgrestClaimsError(error)).toBe(false);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });
});

describe("ApiWorkflowPersistence write queue", () => {
  beforeEach(() => apiRequestMock.mockReset());

  it("keeps successful writes in enqueue order", async () => {
    const persistence = await createHydratedPersistence();
    apiRequestMock.mockResolvedValue(undefined);

    persistence.writeState({ activeTemplateId: "workflow-a" });
    persistence.writeState({ activeTemplateId: "workflow-b" });

    await expect(persistence.flush()).resolves.toBeUndefined();
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(apiRequestMock.mock.calls[0][1].body).state.activeTemplateId).toBe("workflow-a");
    expect(JSON.parse(apiRequestMock.mock.calls[1][1].body).state.activeTemplateId).toBe("workflow-b");
  });

  it("runs a later write after a rejected write and reports the failure through flush", async () => {
    const persistence = await createHydratedPersistence();
    apiRequestMock.mockRejectedValueOnce(new Error("workflow write A failed")).mockResolvedValueOnce(undefined);

    persistence.writeState({ activeTemplateId: "workflow-a" });
    persistence.writeState({ activeTemplateId: "workflow-b" });

    await expect(persistence.flush()).rejects.toThrow("workflow write A failed");
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(apiRequestMock.mock.calls[1][1].body).state.activeTemplateId).toBe("workflow-b");
  });

  it("continues after a middle failure and acknowledges that failure once", async () => {
    const persistence = await createHydratedPersistence();
    apiRequestMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("workflow write B failed"))
      .mockResolvedValueOnce(undefined);

    persistence.writeState({ activeTemplateId: "workflow-a" });
    persistence.writeState({ activeTemplateId: "workflow-b" });
    persistence.writeState({ activeTemplateId: "workflow-c" });

    await expect(persistence.flush()).rejects.toThrow("workflow write B failed");
    expect(apiRequestMock).toHaveBeenCalledTimes(3);

    persistence.writeState({ activeTemplateId: "workflow-d" });
    await expect(persistence.flush()).resolves.toBeUndefined();
    expect(apiRequestMock).toHaveBeenCalledTimes(4);
  });
});
