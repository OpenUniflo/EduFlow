import type { WorkflowDefinition } from "../domain/types";
import type { EnvironmentConfig, WorkflowRunRecord } from "../runtime/types";

export type PersistedStateValues = Record<string, Record<string, unknown>>;
export type PersistedRunHistory = Record<string, WorkflowRunRecord[]>;

export type PersistedWorkflowState = {
  workflows?: WorkflowDefinition[];
  tasks?: unknown[];
  activeTemplateId?: string;
  workflowDescription?: string;
  schemaSaved?: boolean;
  nodePositions?: Record<string, { x: number; y: number }>;
  stateValues?: PersistedStateValues;
  runHistory?: PersistedRunHistory;
};

export type PersistedWorkflowSettings = {
  dailyReminder: boolean;
  compactMode: boolean;
  emailDigest: boolean;
  environments: EnvironmentConfig[];
  activeEnvironmentId: string;
};

export interface WorkflowPersistence {
  readState(): PersistedWorkflowState;
  writeState(state: PersistedWorkflowState): void;
  readSettings(): PersistedWorkflowSettings;
  writeSettings(settings: PersistedWorkflowSettings): void;
}
