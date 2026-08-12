import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedWorkflowSettings } from "./WorkflowPersistence";
import { ApiWorkflowPersistence, normalizeWorkflowSettings } from "./ApiWorkflowPersistence";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/apiClient", () => ({ apiRequest: apiRequestMock }));

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
