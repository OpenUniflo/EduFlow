import type { WorkflowDefinition } from "../domain/types";

export type WorkflowRunNodeRecord = {
  id: string;
  label: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
};

export type WorkflowRunRecord = {
  id: string;
  workflowId: string;
  workflowTemplateId: string;
  courseId?: string;
  assignmentId?: string;
  workflowName: string;
  createdAt: string;
  status: "success";
  nodeCount: number;
  outputSummary: string;
  finalState: Record<string, unknown>;
  nodes: WorkflowRunNodeRecord[];
};

export type WorkflowRuntime = {
  readonly stepDelayMs: number;
  createInitialState(): Record<string, unknown>;
  createStateSnapshot(definition: WorkflowDefinition, stateValues: Record<string, unknown>, runIndex: number): Record<string, unknown>;
  createRunRecord(
    definition: WorkflowDefinition,
    stateValues: Record<string, unknown>,
    runNumber: number
  ): WorkflowRunRecord;
  scheduleNextStep(advance: () => void): () => void;
};

export type EnvironmentConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  searchApiUrl: string;
  searchApiKey: string;
  databaseUrl: string;
  fileStoragePath: string;
  note: string;
};
