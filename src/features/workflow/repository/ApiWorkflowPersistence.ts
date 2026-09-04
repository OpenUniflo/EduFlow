import type { PersistedWorkflowSettings, PersistedWorkflowState, WorkflowPersistence } from "./WorkflowPersistence";
import { ApiRequestError, apiRequest } from "@/shared/api/apiClient";
import { RecoverableWriteQueue } from "@/shared/api/RecoverableWriteQueue";

type WorkflowPayload = { state: PersistedWorkflowState; settings: PersistedWorkflowSettings | null; builtinWorkflowIds: string[] };
const WORKFLOW_HYDRATION_RETRY_DELAY_MS = 200;

export function isTransientPostgrestClaimsError(error: unknown) {
  return error instanceof ApiRequestError && error.code === "PGRST303";
}

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
  private readonly defaultSettings: PersistedWorkflowSettings;

  constructor(defaultSettings: PersistedWorkflowSettings) {
    this.defaultSettings = structuredClone(defaultSettings);
    this.settings = structuredClone(this.defaultSettings);
  }

  async hydrate() {
    let payload: WorkflowPayload;
    try {
      payload = await apiRequest<WorkflowPayload>("/api/workflows");
    } catch (error) {
      if (!isTransientPostgrestClaimsError(error)) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, WORKFLOW_HYDRATION_RETRY_DELAY_MS));
      payload = await apiRequest<WorkflowPayload>("/api/workflows");
    }
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

  resetAuthenticatedState() {
    this.writes.cancel();
    this.state = {};
    this.settings = structuredClone(this.defaultSettings);
    this.builtinWorkflowIds = [];
    this.hydrated = false;
  }

  private queueWrite() {
    if (!this.hydrated) return;
    const body = JSON.stringify({ state: this.state, settings: this.settings, builtinWorkflowIds: this.builtinWorkflowIds });
    this.writes.enqueue(() => apiRequest("/api/workflows", { method: "PUT", body }));
  }
}
