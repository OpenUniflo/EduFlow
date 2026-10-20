import type { WorkflowControllerRecovery } from "../../application/v2/editorHistory";
import type { JsonDraftStore } from "./JsonField";

// Unsaved editor state in this tab only. It never replaces a server document or authorizes a write.
export const WORKFLOW_SESSION_RECOVERY_TTL_MS = 60 * 60 * 1000;
type Recovery = {
  ticket: string;
  ownerId: string;
  workflowId: string;
  capturedAt: number;
  controller: WorkflowControllerRecovery;
  drafts: JsonDraftStore;
  pendingIds: string[];
};
let checkpoint: Recovery | null = null;
function pendingUnload(event: BeforeUnloadEvent) {
  if (!checkpoint || Date.now() - checkpoint.capturedAt >= WORKFLOW_SESSION_RECOVERY_TTL_MS) return;
  event.preventDefault(); event.returnValue = "";
}
function guardUnload(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) window.addEventListener("beforeunload", pendingUnload);
  else window.removeEventListener("beforeunload", pendingUnload);
}
function sameWorkflow(controller: WorkflowControllerRecovery, workflowId: string) {
  return [controller.savedDocument, controller.timeline.present, ...controller.timeline.past, ...controller.timeline.future]
    .every(snapshot => snapshot.definition.workflowId === workflowId && snapshot.editor.workflowId === workflowId);
}
export function retainWorkflowSessionRecovery(ownerId: string, workflowId: string, controller: WorkflowControllerRecovery, drafts: JsonDraftStore, pendingIds: string[]) {
  if (!ownerId || !workflowId || !sameWorkflow(controller, workflowId)) return;
  checkpoint = structuredClone({ ticket: crypto.randomUUID(), ownerId, workflowId, capturedAt: Date.now(), controller, drafts, pendingIds });
  guardUnload(true);
}
// Peeking is repeatable during StrictMode render. Only the committed editor acknowledges its ticket.
export function peekWorkflowSessionRecovery(ownerId: string, workflowId: string): Recovery | null {
  if (checkpoint && (Date.now() < checkpoint.capturedAt || Date.now() - checkpoint.capturedAt >= WORKFLOW_SESSION_RECOVERY_TTL_MS)) clearWorkflowSessionRecovery();
  if (!checkpoint || checkpoint.ownerId !== ownerId || checkpoint.workflowId !== workflowId) return null;
  return structuredClone(checkpoint);
}
export function acknowledgeWorkflowSessionRecovery(ticket: string) {
  if (checkpoint?.ticket === ticket) clearWorkflowSessionRecovery();
}
// Only the original createRun promise can establish that its exact first request
// was rejected. A different 401, including a confirmation failure, proves nothing.
export function rejectRecoveredWorkflowSubmission(ownerId: string, workflowId: string, key: string) {
  if (checkpoint?.ownerId !== ownerId || checkpoint.workflowId !== workflowId || checkpoint.controller.pendingRunRequest?.key !== key) return;
  checkpoint.controller.pendingRunRequest = null;
  checkpoint.controller.runPreparationFailure = "submit";
}
export function clearWorkflowSessionRecovery() { checkpoint = null; guardUnload(false); }
