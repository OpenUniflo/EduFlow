import { createContext, useContext, type ReactNode } from "react";
import type { Selection, Template } from "../app/model";

type WorkflowContextValue = {
  workflows: Template[];
  activeTemplate: Template;
  activeTemplateId: string;
  selection: Selection;
  schemaSaved: boolean;
  openWorkflow: (templateId: string) => void;
  createWorkflow: () => void;
  deleteWorkflow: (workflowId: string) => void;
};

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function WorkflowProvider({ value, children }: { value: WorkflowContextValue; children: ReactNode }) {
  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow() {
  const value = useContext(WorkflowContext);
  if (!value) {
    throw new Error("useWorkflow must be used within WorkflowProvider");
  }
  return value;
}
