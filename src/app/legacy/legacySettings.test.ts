import { describe, expect, it } from "vitest";
import { demoWorkflowSettings } from "@/demo/workflows/demoWorkflowSettings";
import { LocalStorageWorkflowPersistence, workflowSettingsStorageKey, type StorageLike } from "@/features/workflow/repository/LocalStorageWorkflowPersistence";
import { writeLegacySettings } from "./legacySettings";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("legacy settings compatibility writer", () => {
  it("updates preferences without deleting Workflow Environment settings", () => {
    const storage = new MemoryStorage();
    storage.setItem(workflowSettingsStorageKey, JSON.stringify({ ...demoWorkflowSettings, futureField: "preserved" }));

    writeLegacySettings({ dailyReminder: true, compactMode: true, emailDigest: true }, storage);

    const stored = JSON.parse(storage.getItem(workflowSettingsStorageKey)!) as Record<string, unknown>;
    expect(stored).toMatchObject({
      dailyReminder: true,
      compactMode: true,
      emailDigest: true,
      environments: demoWorkflowSettings.environments,
      activeEnvironmentId: demoWorkflowSettings.activeEnvironmentId,
      futureField: "preserved"
    });
    const persistence = new LocalStorageWorkflowPersistence(storage, [], demoWorkflowSettings);
    expect(persistence.readSettings()).toEqual({ ...demoWorkflowSettings, compactMode: true });
  });
});
