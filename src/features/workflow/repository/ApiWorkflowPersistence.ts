import type { PersistedWorkflowSettings, PersistedWorkflowState, WorkflowPersistence } from "./WorkflowPersistence";
import { apiRequest } from "@/shared/api/apiClient";

type WorkflowPayload = { state: PersistedWorkflowState; settings: PersistedWorkflowSettings | null; builtinWorkflowIds: string[] };

export class ApiWorkflowPersistence implements WorkflowPersistence {
  private state: PersistedWorkflowState = {};
  private settings: PersistedWorkflowSettings;
  private builtinWorkflowIds: string[] = [];
  private pending: Promise<unknown> = Promise.resolve();
  private hydrated = false;

  constructor(defaultSettings: PersistedWorkflowSettings) {
    this.settings = structuredClone(defaultSettings);
  }

  async hydrate() {
    const payload = await apiRequest<WorkflowPayload>("/api/workflows");
    this.state = structuredClone(payload.state);
    this.settings = structuredClone(payload.settings ?? this.settings);
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
    return this.pending;
  }

  private queueWrite() {
    if (!this.hydrated) return;
    const body = JSON.stringify({ state: this.state, settings: this.settings, builtinWorkflowIds: this.builtinWorkflowIds });
    this.pending = this.pending.then(() => apiRequest("/api/workflows", { method: "PUT", body }));
  }
}
