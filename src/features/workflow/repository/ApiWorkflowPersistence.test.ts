import { describe, expect, it } from "vitest";
import type { PersistedWorkflowSettings } from "./WorkflowPersistence";
import { normalizeWorkflowSettings } from "./ApiWorkflowPersistence";

const defaults: PersistedWorkflowSettings = {
  dailyReminder: true,
  compactMode: false,
  emailDigest: true,
  environments: [{ id: "development", name: "Development", baseUrl: "", apiKey: "", model: "", searchApiUrl: "", searchApiKey: "", databaseUrl: "", fileStoragePath: "", note: "" }],
  activeEnvironmentId: "development"
};

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
