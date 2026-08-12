import type { PersistedWorkflowSettings, PersistedWorkflowState, WorkflowPersistence } from "./WorkflowPersistence";
import { apiRequest } from "@/shared/api/apiClient";
import { RecoverableWriteQueue } from "@/shared/api/RecoverableWriteQueue";

type WorkflowPayload = { state: PersistedWorkflowState; settings: PersistedWorkflowSettings | null; builtinWorkflowIds: string[] };

export function normalizeWorkflowSettings(
  current: PersistedWorkflowSettings,
  persisted: Partial<PersistedWorkflowSettings> | null | undefined
): PersistedWorkflowSettings {
  const environments = Array.isArray(persisted?.environments) && persisted.environments.length
    ? persisted.environments
    : current.environments;
  const activeEnvironmentId = environments.some((environment) => environment.id === persisted?.activeEnvironmentId)
    ? persisted!.activeEnvironmentId!
    : environments.some((environment) => environment.id === current.activeEnvironmentId)
      ? current.activeEnvironmentId
      : environments[0].id;
  return {
    ...current,
    ...persisted,
    environments: structuredClone(environments),
    activeEnvironmentId
  };
}

export class ApiWorkflowPersistence implements WorkflowPersistence {
  private state: PersistedWorkflowState = {};
  private settings: PersistedWorkflowSettings;
  private builtinWorkflowIds: string[] = [];
  private readonly writes = new RecoverableWriteQueue();
  private hydrated = false;

  constructor(defaultSettings: PersistedWorkflowSettings) {
    this.settings = structuredClone(defaultSettings);
  }

  async hydrate() {
    const payload = await apiRequest<WorkflowPayload>("/api/workflows");
    this.state = structuredClone(payload.state);
    this.settings = normalizeWorkflowSettings(this.settings, payload.settings);
    this.builtinWorkflowIds = [...payload.builtinWorkflowIds];
    this.hydrated = true;
  }

  readState() {
    return structuredClone(this.state);
  }

  writeState(state: PersistedWorkflowState) {
    this.state = structuredClone(state);
    this.queueWrite();
  }

  readSettings() {
    return structuredClone(this.settings);
  }

  writeSettings(settings: PersistedWorkflowSettings) {
    this.settings = structuredClone(settings);
    this.queueWrite();
  }

  flush() {
    return this.writes.flush();
  }

  private queueWrite() {
    if (!this.hydrated) return;
    const body = JSON.stringify({ state: this.state, settings: this.settings, builtinWorkflowIds: this.builtinWorkflowIds });
    this.writes.enqueue(() => apiRequest("/api/workflows", { method: "PUT", body }));
  }
}
