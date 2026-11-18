/**
 * Read-only shape for the N12 assistant proposal preview. The real Assistant
 * proposal pipeline is not wired yet, so the editor renders injected sample
 * content and never calls an API or mutates the workflow.
 */
export type AssistantProposalChangeKind = "add" | "modify" | "delete";

export type AssistantProposalChange = {
  kind: AssistantProposalChangeKind;
  title: string;
  detail: string;
};

export type AssistantProposalPreview = {
  title: string;
  summary: string;
  impact: string;
  changes: readonly AssistantProposalChange[];
};
