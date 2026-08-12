import type { WorkflowDefinition } from "../domain/types";
import type { PersistedWorkflowSettings, PersistedWorkflowState, WorkflowPersistence } from "./WorkflowPersistence";

export const workflowStorageKey = "knowledge-atlas.workflow-state.v2";
export const workflowSettingsStorageKey = "knowledge-atlas.workflow-settings.v2";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export class LocalStorageWorkflowPersistence implements WorkflowPersistence {
  constructor(
    private readonly storage: StorageLike,
    private readonly builtinWorkflows: WorkflowDefinition[],
    private readonly defaultSettings: PersistedWorkflowSettings
  ) {}

  readState(): PersistedWorkflowState {
    try {
      const raw = this.storage.getItem(workflowStorageKey);
      if (!raw) return { workflows: this.builtinWorkflows };
      const parsed = JSON.parse(raw) as PersistedWorkflowState;
      return Array.isArray(parsed.workflows) ? { ...parsed, workflows: this.mergeBuiltinWorkflows(parsed.workflows) } : { workflows: this.builtinWorkflows };
    } catch {
      return { workflows: this.builtinWorkflows };
    }
  }

  writeState(state: PersistedWorkflowState) {
    this.storage.setItem(workflowStorageKey, JSON.stringify(state));
  }

  mergeBuiltinWorkflows(storedWorkflows: WorkflowDefinition[] | undefined) {
    if (!storedWorkflows?.length) return this.builtinWorkflows;
    const normalized = storedWorkflows.map((item) => item.id === "showcase" && item.name === "EduFlow LangGraph 示例" ? { ...item, name: "知序 LangGraph 示例" } : item);
    const storedIds = new Set(normalized.map((item) => item.id));
    return [...this.builtinWorkflows.filter((item) => !storedIds.has(item.id)), ...normalized];
  }

  private normalizeSettings(value: Partial<PersistedWorkflowSettings> | null | undefined): PersistedWorkflowSettings {
    const environments = Array.isArray(value?.environments) && value.environments.length ? value.environments : this.defaultSettings.environments;
    const activeEnvironmentId = environments.some((item) => item.id === value?.activeEnvironmentId)
      ? value?.activeEnvironmentId ?? environments[0].id
      : environments[0].id;
    return {
      dailyReminder: value?.dailyReminder ?? this.defaultSettings.dailyReminder,
      compactMode: value?.compactMode ?? this.defaultSettings.compactMode,
      emailDigest: value?.emailDigest ?? this.defaultSettings.emailDigest,
      environments,
      activeEnvironmentId
    };
  }

  readSettings() {
    try {
      const raw = this.storage.getItem(workflowSettingsStorageKey);
      return this.normalizeSettings(raw ? JSON.parse(raw) as Partial<PersistedWorkflowSettings> : null);
    } catch {
      return this.defaultSettings;
    }
  }

  writeSettings(settings: PersistedWorkflowSettings) {
    this.storage.setItem(workflowSettingsStorageKey, JSON.stringify(this.normalizeSettings(settings)));
  }
}
