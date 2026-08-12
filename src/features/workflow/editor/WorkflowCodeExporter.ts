import type { CodeFile, WorkflowDefinition } from "../domain/types";

export interface WorkflowCodeExporter {
  getFiles(definition: WorkflowDefinition): CodeFile[];
}
