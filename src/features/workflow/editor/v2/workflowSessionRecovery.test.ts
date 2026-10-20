import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorV2, createWorkflowV2 } from "../../domain/v2/factory";
import type { WorkflowControllerRecovery } from "../../application/v2/editorHistory";
import { acknowledgeWorkflowSessionRecovery, clearWorkflowSessionRecovery, peekWorkflowSessionRecovery, rejectRecoveredWorkflowSubmission, retainWorkflowSessionRecovery, WORKFLOW_SESSION_RECOVERY_TTL_MS } from "./workflowSessionRecovery";

const definition = { ...createWorkflowV2("saved"), workflowId: "workflow" };
const snapshot = { definition, editor: createEditorV2(definition) };
function controller(): WorkflowControllerRecovery {
  return { timeline: { past: [snapshot], present: snapshot, future: [snapshot] }, savedDocument: snapshot,
    base: { revision: definition.revision, editorRevision: snapshot.editor.editorRevision }, input: { question: "private draft" },
    inputDirty: true, inputInvalid: "unfinished JSON", environmentRef: "local", pendingRunRequest: { fingerprint: "original-request", key: "original-key" },
    observedRunId: null, runOrigin: null, runPreparationFailure: null };
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() }); clearWorkflowSessionRecovery(); });
afterEach(() => { clearWorkflowSessionRecovery(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function retain(value = controller()) {
  retainWorkflowSessionRecovery("owner", definition.workflowId, value, new Map([["input", { text: "{unfinished", baseline: "{}", error: "invalid", mode: "json" }]]), ["input"]);
}
describe("workflow tab-local recovery", () => {
  it("keeps raw drafts, pending fields and history isolated to the authenticated owner/workflow", () => {
    retain();
    expect(peekWorkflowSessionRecovery("another-owner", definition.workflowId)).toBeNull();
    expect(peekWorkflowSessionRecovery("owner", "another-workflow")).toBeNull();
    const recovered = peekWorkflowSessionRecovery("owner", definition.workflowId)!;
    expect(recovered.controller).toEqual(controller()); expect(recovered.pendingIds).toEqual(["input"]);
    expect(recovered.drafts.get("input")).toMatchObject({ text: "{unfinished", mode: "json" });
    recovered.controller.timeline.present.definition.name = "mutated clone";
    recovered.drafts.clear();
    expect(peekWorkflowSessionRecovery("owner", definition.workflowId)!.controller.timeline.present.definition.name).toBe("saved");
    expect(peekWorkflowSessionRecovery("owner", definition.workflowId)!.drafts.size).toBe(1);
  });
  it("allows StrictMode to peek twice and only consumes a committed matching ticket", () => {
    retain(); const first = peekWorkflowSessionRecovery("owner", definition.workflowId)!;
    expect(peekWorkflowSessionRecovery("owner", definition.workflowId)?.ticket).toBe(first.ticket);
    acknowledgeWorkflowSessionRecovery("stale-ticket"); expect(peekWorkflowSessionRecovery("owner", definition.workflowId)).not.toBeNull();
    retain(); acknowledgeWorkflowSessionRecovery(first.ticket); expect(peekWorkflowSessionRecovery("owner", definition.workflowId)).not.toBeNull();
    acknowledgeWorkflowSessionRecovery(peekWorkflowSessionRecovery("owner", definition.workflowId)!.ticket);
    expect(peekWorkflowSessionRecovery("owner", definition.workflowId)).toBeNull();
  });
  it("expires its single RAM checkpoint and removes the temporary native unload protection", () => {
    retain(); expect(window.addEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    vi.advanceTimersByTime(WORKFLOW_SESSION_RECOVERY_TTL_MS);
    expect(peekWorkflowSessionRecovery("owner", definition.workflowId)).toBeNull();
    expect(window.removeEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });
  it("rejects cross-workflow history and only settles a matching original submission key", () => {
    const invalid = structuredClone(controller()); invalid.timeline.past[0].definition.workflowId = "other";
    retain(invalid); expect(peekWorkflowSessionRecovery("owner", definition.workflowId)).toBeNull();
    retain(); rejectRecoveredWorkflowSubmission("other-owner", definition.workflowId, "original-key");
    rejectRecoveredWorkflowSubmission("owner", definition.workflowId, "different-key");
    expect(peekWorkflowSessionRecovery("owner", definition.workflowId)!.controller.pendingRunRequest?.key).toBe("original-key");
    rejectRecoveredWorkflowSubmission("owner", definition.workflowId, "original-key");
    expect(peekWorkflowSessionRecovery("owner", definition.workflowId)!.controller).toMatchObject({ pendingRunRequest: null, runPreparationFailure: "submit" });
  });
});
