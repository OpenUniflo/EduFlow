import type { WorkflowDocumentV2 } from "../../domain/v2/types";

/** Every condition the confirm action needs; kept pure so stale-response states are testable. */
export function referencePickerCanApply(args: {
  document: WorkflowDocumentV2 | null;
  selectedWorkflowId: string;
  selectedRevision: number | null;
  selectedEnvironment: string;
  environmentAvailable: boolean;
  revisionLoading: boolean;
  revisionError: string;
  documentLoading: boolean;
  documentError: string;
  unchanged: boolean;
}): boolean {
  const document = args.document;
  const matchesSelection = Boolean(
    document
    && args.selectedRevision !== null
    && document.definition.workflowId === args.selectedWorkflowId
    && document.definition.revision === args.selectedRevision,
  );
  return Boolean(
    matchesSelection
    && args.selectedEnvironment
    && args.environmentAvailable
    && !args.revisionLoading
    && !args.revisionError
    && !args.documentLoading
    && !args.documentError
    && !document?.archived
    && !args.unchanged,
  );
}
