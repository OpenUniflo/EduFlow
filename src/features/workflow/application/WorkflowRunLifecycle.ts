import type { WorkflowRunRecord } from "../runtime/types";

type ActiveRunSession = {
  id: string;
  workflowId: string;
  finalize(record: WorkflowRunRecord): WorkflowRunRecord;
};

export type CompletedRun = {
  record: WorkflowRunRecord;
  history: WorkflowRunRecord[];
};

export function canExecuteWorkflow(schemaSaved: boolean) {
  return schemaSaved;
}

export function nextWorkflowStepIndex(current: number, runOrderLength: number) {
  return current + 1 >= runOrderLength ? 0 : current + 1;
}

export function resolveGeneratedWorkflow(description: string, currentDescription: string, inferTemplateId: (value: string) => string) {
  const nextDescription = description.trim() || currentDescription;
  return { description: nextDescription, templateId: inferTemplateId(nextDescription) };
}

export class WorkflowRunLifecycle {
  private active: ActiveRunSession | null = null;

  start(workflowId: string, finalize: ActiveRunSession["finalize"], id = `${workflowId}-${Date.now()}`) {
    this.active = { id, workflowId, finalize };
    return id;
  }

  stop() {
    this.active = null;
  }

  complete(baseRecord: WorkflowRunRecord, existing: WorkflowRunRecord[], onCompleted?: (record: WorkflowRunRecord) => void): CompletedRun | null {
    const session = this.active;
    if (!session || session.workflowId !== baseRecord.workflowId || existing.some((item) => item.id === session.id)) return null;
    this.active = null;
    const record = session.finalize({ ...baseRecord, id: session.id });
    onCompleted?.(record);
    return { record, history: [record, ...existing].slice(0, 20) };
  }
}
