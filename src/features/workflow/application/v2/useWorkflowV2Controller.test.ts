import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Controlled hook scheduling makes response/edit races explicit without a DOM.
const host = vi.hoisted(() => ({ slots: [] as any[], index: 0, effects: [] as (() => void)[] }));
vi.mock("react", () => ({
  useState(initial: any) { const i = host.index++; if (!(i in host.slots)) host.slots[i] = typeof initial === "function" ? initial() : initial; return [host.slots[i], (value: any) => { host.slots[i] = typeof value === "function" ? value(host.slots[i]) : value; }]; },
  useRef(initial: any) { const i = host.index++; return host.slots[i] ??= { current: initial }; },
  useCallback(fn: any, deps: any[]) { const i = host.index++; const old = host.slots[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) host.slots[i] = { fn, deps }; return host.slots[i].fn; },
  useEffect(fn: any, deps: any[]) { const i = host.index++; const old = host.slots[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) { host.effects.push(() => { old?.cleanup?.(); host.slots[i].cleanup = fn(); }); host.slots[i] = { deps }; } },
}));
const api = vi.hoisted(() => ({ environments: vi.fn(), history: vi.fn(), tools: vi.fn(), get: vi.fn(), run: vi.fn(), events: vi.fn(), steps: vi.fn(), save: vi.fn(), saveEditor: vi.fn(), validateDraft: vi.fn(), createRun: vi.fn(), cancel: vi.fn(), resumeThread:vi.fn(), threads:vi.fn(), thread:vi.fn(), cancelThread:vi.fn(), discover: vi.fn() }));
vi.mock("@/shared/api/supabaseClient", () => ({ supabaseClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "test-bearer" } } }), signOut: vi.fn() } } }));
vi.mock("../../repository/v2/WorkflowApiV2", () => ({
  WorkflowApiV2: class { constructor() { return api; } },
  workflowErrorMessage: (reason: unknown) => reason instanceof Error ? reason.message : "请求失败",
}));

import { ApiRequestError } from "@/shared/api/apiClient";
import { createEditorV2, createWorkflowV2 } from "../../domain/v2/factory";
import type { WorkflowDocumentV2, WorkflowLaunchContext, WorkflowRunV2, WorkflowTool } from "../../domain/v2/types";
import { useWorkflowV2Controller } from "./useWorkflowV2Controller";
import type { WorkflowControllerRecovery } from "./editorHistory";

const definition = { ...createWorkflowV2("saved"), workflowId: "workflow", revision: 3 };
const initial: WorkflowDocumentV2 = { definition, editor: { ...createEditorV2(definition), editorRevision: 8 } };
const oldRun: WorkflowRunV2 = { runId: "old", workflowId: "workflow", revision: 3, mode: "live", verification: "unverified", status: "success", definitionHash: "definition", semanticHash: "semantic", compileFingerprint: "compiled", environmentRef: "local", environmentRevision: "environment", policyVersion: "m1", createdAt: "2026-01-01T00:00:00Z", lastSeq: 1, output: { answer: 46 } };
let hookDocument = initial;
let hookRecovery: WorkflowControllerRecovery | undefined;
let hookContext: WorkflowLaunchContext | undefined;
const recoveryRejected = vi.fn();
const authenticationFailure = { sessionUserId: "owner", method: "POST", path: "/api/workflows", status: 401 as const, occurredAt: 0, requestId: "request-401" };
function remountRecovery(recovery: WorkflowControllerRecovery, document = initial, context?: WorkflowLaunchContext) {
  dispose(); host.slots = []; host.index = 0; host.effects = [];
  hookRecovery = structuredClone(recovery); hookDocument = document; hookContext = context;
  return render();
}
function render() { host.index = 0; const control = useWorkflowV2Controller(hookDocument, hookContext, hookRecovery, recoveryRejected); host.effects.splice(0).forEach(effect => effect()); return control; }
async function flush() { for (let i = 0; i < 8; i += 1) await Promise.resolve(); }
async function boot() { render(); await flush(); return render(); }
function dispose() { host.slots.forEach(slot => slot?.cleanup?.()); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  dispose(); host.slots = []; host.index = 0; host.effects = [];
  hookDocument = initial; hookRecovery = undefined; hookContext = undefined; recoveryRejected.mockReset();
  Object.values(api).forEach(mock => mock.mockReset());
  vi.useFakeTimers(); vi.stubGlobal("document", { visibilityState: "visible" });
  api.environments.mockResolvedValue({ items: [{ environmentRef: "local" }] });
  api.threads.mockResolvedValue({items:[]});
  api.thread.mockResolvedValue(null);
  api.history.mockResolvedValue({ items: [oldRun], legacyItems: [] });
  api.tools.mockResolvedValue({ items: [] });
  api.get.mockResolvedValue(initial);
  api.run.mockImplementation(async (id: string) => ({ ...oldRun, runId: id }));
  api.events.mockImplementation(async (id: string) => ({ events: [{ protocolVersion: "1", eventId: `event-${id}`, runId: id, seq: 1, type: "run.success", occurredAt: oldRun.createdAt, payload: {} }], nextSeq: 1, hasMore: false }));
  api.steps.mockResolvedValue({ items: [{ stepId: "step", nodeId: "end" }] });
  api.validateDraft.mockResolvedValue({ valid: true, diagnostics: [] });
  api.save.mockResolvedValue({ workflowId: "workflow", revision: 4, editorRevision: 9 });
  api.createRun.mockResolvedValue({ runId: "new", revision: 3, status: "queued" });
});
afterEach(() => { dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("initial data and submission feedback", () => {
  it("distinguishes a pending environment read from an empty configured catalog", async () => {
    const catalog = deferred<{ items: { environmentRef: string }[] }>();
    api.environments.mockReturnValueOnce(catalog.promise);
    render(); await flush();
    expect(render().initialLoadStatus).toBe("loading");
    expect(render().environments).toEqual([]);
    catalog.resolve({ items: [] }); await flush();
    expect(render().initialLoadStatus).toBe("ready");
    expect(render().environments).toEqual([]);
  });

  it("reports an unsuccessful initial read separately from a loaded empty catalog", async () => {
    api.environments.mockRejectedValueOnce(new Error("环境读取中断"));
    await boot();
    expect(render().initialLoadStatus).toBe("failed");
    expect(render().environmentError).toBe("环境读取中断");
    expect(render().error).toBe("环境读取中断");
    expect(api.createRun).not.toHaveBeenCalled();
  });

  it("refreshes tools with environment resources without changing the selected environment", async () => {
    const tool = { ref: "http-tool", name: "HTTP tool" } as WorkflowTool;
    api.tools.mockResolvedValueOnce({ items: [] }).mockResolvedValue({ items: [tool] });
    await boot();
    expect(render().tools).toEqual([]);
    await render().refreshEnvironmentResources(); await flush();
    expect(render().environmentRef).toBe("local");
    expect(render().tools).toEqual([tool]);
  });

  it("marks a failed environment refresh and keeps the error available to the banner", async () => {
    api.environments.mockResolvedValueOnce({ items: [{ environmentRef: "local" }] }).mockRejectedValueOnce(new Error("刷新失败"));
    await boot();
    await render().refreshEnvironments(); await flush();
    expect(render().initialLoadStatus).toBe("failed");
    expect(render().environmentError).toBe("刷新失败");
  });

  it("retires the accepted-submission notice once the same Run reaches a failed terminal state", async () => {
    api.history.mockResolvedValue({ items: [] });
    let observed: WorkflowRunV2 = { ...oldRun, runId: "new", status: "running" };
    api.run.mockImplementation(async () => observed);
    await boot(); await render().startRun(); render(); await flush();
    expect(render().notice).toContain("真实运行已提交");
    observed = { ...observed, status: "failed" };
    await vi.advanceTimersByTimeAsync(1000); render(); await flush();
    expect(render().run?.status).toBe("failed");
    expect(render().notice).not.toContain("真实运行已提交");
    expect(api.createRun).toHaveBeenCalledTimes(1);
  });
});

describe("cancellation feedback", () => {
  it("announces the in-flight request immediately, suppresses duplicate requests and then shows the accepted terminal state", async () => {
    const running = { ...oldRun, status: "running" as const };
    api.history.mockResolvedValue({ items: [running] });
    api.run.mockResolvedValue(running);
    await boot(); await flush();
    const request = deferred<void>(); api.cancel.mockReturnValueOnce(request.promise);
    const pending = render().cancel();
    expect(render().cancelPending).toBe(true);
    expect(render().notice).toContain("正在提交取消请求");
    await render().cancel();
    expect(api.cancel).toHaveBeenCalledTimes(1);
    api.run.mockResolvedValue({ ...running, status: "cancelled" });
    request.resolve(); await pending;
    expect(render().cancelPending).toBe(false);
    expect(render().run?.status).toBe("cancelled");
    expect(render().notice).toBe("");
  });

  it("clears pending feedback after a rejected cancellation without claiming acceptance", async () => {
    const running = { ...oldRun, status: "running" as const };
    api.history.mockResolvedValue({ items: [running] }); api.run.mockResolvedValue(running);
    await boot(); await flush();
    const request = deferred<void>(); api.cancel.mockReturnValueOnce(request.promise);
    const pending = render().cancel();
    request.reject(new Error("取消请求未完成")); await pending;
    expect(render().cancelPending).toBe(false);
    expect(render().error).toBe("取消请求未完成");
    expect(render().notice).not.toContain("正在提交取消请求");
    expect(render().notice).not.toContain("已受理");
    expect(render().run?.status).toBe("running");
  });

  it("does not replace a newly selected historical Run with a late cancellation response", async () => {
    const running = { ...oldRun, status: "running" as const };
    api.history.mockResolvedValue({ items: [running, { ...oldRun, runId: "another" }] });
    api.run.mockImplementation(async (id: string) => ({ ...oldRun, runId: id, status: id === "old" ? "running" : "success" }));
    await boot(); await flush();
    const request = deferred<void>(); api.cancel.mockReturnValueOnce(request.promise);
    const pending = render().cancel();
    render().selectRun({ ...oldRun, runId: "another" }); render(); await flush();
    request.resolve(); await pending;
    expect(render().run?.runId).toBe("another");
    expect(render().runOrigin).toBe("history");
    expect(render().cancelPending).toBe(false);
  });
});

describe("current attempt and selected history", () => {
  it("clears a selected old success when local input prevents a new attempt, retaining its history", async () => {
    (await boot()).selectRun(oldRun); render(); await flush();
    expect(render().runOrigin).toBe("history");
    expect(render().run?.output).toEqual({ answer: 46 });
    render().setInputInvalid("运行输入不是合法 JSON");
    await render().startRun();
    const rejected = render();
    expect(rejected.run).toBeNull(); expect(rejected.runSnapshot).toBeNull();
    expect(rejected.runOrigin).toBeNull(); expect(rejected.steps).toEqual([]); expect(rejected.events).toEqual([]);
    expect(rejected.runPreparationFailure).toBe("preflight");
    expect(rejected.history).toEqual([oldRun]);
    expect(api.validateDraft).not.toHaveBeenCalled(); expect(api.createRun).not.toHaveBeenCalled();
  });

  it("does not let an old observation refill a rejected attempt before effect cleanup", async () => {
    await boot();
    const late = deferred<WorkflowRunV2>(); api.run.mockReturnValueOnce(late.promise);
    render().selectRun(oldRun); render();
    render().rejectRunPreparation("尚未启动");
    late.resolve(oldRun); await flush();
    expect(render().run).toBeNull(); expect(render().events).toEqual([]); expect(render().runOrigin).toBeNull();
  });

  it("records a rejected server preflight as this attempt without submitting a Run", async () => {
    (await boot()).selectRun(oldRun); render(); await flush();
    api.validateDraft.mockResolvedValueOnce({ valid: false, diagnostics: [{ code: "INVALID_RUN_INPUT", severity: "error", message: "question required", pointer: "/question", scope: "input" }] });
    await render().startRun();
    expect(render().runPreparationFailure).toBe("preflight"); expect(render().runOrigin).toBeNull(); expect(render().run).toBeNull();
    expect(render().diagnostics[0].code).toBe("INVALID_RUN_INPUT"); expect(render().history).toEqual([oldRun]);
    expect(api.createRun).not.toHaveBeenCalled();
  });

  it("reloads the snapshot when selecting another Run of the same revision", async () => {
    (await boot()).selectRun(oldRun); render(); await flush(); render(); await flush();
    expect(render().runSnapshot).toEqual(initial);
    api.get.mockClear();
    render().selectRun({ ...oldRun, runId: "another" }); render(); await flush(); render(); await flush();
    expect(render().runSnapshot).toEqual(initial);
    expect(api.get).toHaveBeenCalledWith("workflow", 3);
  });

  it("keeps the original uncertain key/input and confirms it after a local rejection", async () => {
    (await boot()).setInput({ question: "A" });
    api.createRun.mockRejectedValueOnce(new Error("response was not JSON"));
    await render().startRun();
    const key = api.createRun.mock.calls[0][4];
    expect(render().submitUnknown).toBe(true);
    render().setInput({ question: "B" }); render().rejectRunPreparation("非法新输入");
    expect(render().submitUnknown).toBe(true); expect(render().runPreparationFailure).toBeNull();
    await render().confirmSubmission();
    expect(api.createRun.mock.calls[1]).toMatchObject({ 0: "workflow", 1: 3, 2: { question: "A" }, 3: "local", 4: key });
    expect(render().submitUnknown).toBe(false); expect(render().runOrigin).toBe("current");
    expect(render().input).toEqual({ question: "B" });
  });

  it("keeps a parsed {} HTTP202 uncertain through the real repository and confirms with the original key", async () => {
    const { WorkflowApiV2 } = await vi.importActual<typeof import("../../repository/v2/WorkflowApiV2")>("../../repository/v2/WorkflowApiV2");
    const repository = new WorkflowApiV2();
    api.createRun.mockImplementation(repository.createRun.bind(repository));
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ runId: "ca72a44b-7a80-47b1-a93b-451775c03ddb", revision: 3, status: "running", historyExpired: false }), { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    (await boot()).setInput({ question: "original A" });
    await render().startRun();
    expect(render().submitUnknown).toBe(true); expect(render().run).toBeNull();
    render().setInput({ question: "newer B" }); render().rejectRunPreparation("new input invalid");
    await render().confirmSubmission();
    expect(fetch).toHaveBeenCalledTimes(2);
    const first = fetch.mock.calls[0][1]; const confirmation = fetch.mock.calls[1][1];
    expect(confirmation.headers["Idempotency-Key"]).toBe(first.headers["Idempotency-Key"]);
    expect(JSON.parse(confirmation.body)).toEqual(JSON.parse(first.body));
    expect(JSON.parse(confirmation.body).input).toEqual({ question: "original A" });
    expect(render().submitUnknown).toBe(false); expect(render().runOrigin).toBe("current");
    expect(render().input).toEqual({ question: "newer B" });
  });

  it("marks an already active Run loaded on entry as current", async () => {
    api.history.mockResolvedValue({ items: [{ ...oldRun, status: "running" }] });
    await boot();
    expect(render().runOrigin).toBe("current");
  });

  it("saves captured A and submits its input while retaining newer graph/input B", async () => {
    (await boot()).editDefinition(current => ({ ...current, name: "A" }));
    render().setInput({ question: "A" });
    const validation = deferred<{ valid: boolean; diagnostics: [] }>(); api.validateDraft.mockReturnValueOnce(validation.promise);
    const pending = render().startRun(true);
    render().editDefinition(current => ({ ...current, name: "B" })); render().setInput({ question: "B" });
    validation.resolve({ valid: true, diagnostics: [] }); await pending;
    expect(api.save.mock.calls[0][0].name).toBe("A");
    expect(api.createRun.mock.calls[0][1]).toBe(4); expect(api.createRun.mock.calls[0][2]).toEqual({ question: "A" });
    expect(render().definition).toMatchObject({ name: "B", revision: 4 });
    expect(render().dirty).toBe(true); expect(render().input).toEqual({ question: "B" }); expect(render().runOrigin).toBe("current");
  });
});

describe("restore only commits after acceptance", () => {
  it("preserves the full draft, input, undo/redo and base revisions on a 409", async () => {
    (await boot()).editDefinition(current => ({ ...current, name: "A" }));
    render().editDefinition(current => ({ ...current, name: "B" })); render().undo();
    render().setInput({ question: "keep" }); render().setInputInvalid("unfinished raw input");
    const before = render(); const snapshot = structuredClone({ definition: before.definition, editor: before.editor });
    const target = structuredClone(initial); target.definition.name = "restore";
    api.save.mockRejectedValueOnce(new ApiRequestError("REVISION_CONFLICT", "conflict", 409));
    expect(await before.restoreDocument(target)).toBeUndefined();
    const rejected = render();
    expect({ definition: rejected.definition, editor: rejected.editor }).toEqual(snapshot);
    expect(rejected.input).toEqual({ question: "keep" }); expect(rejected.inputInvalid).toBe("unfinished raw input");
    expect(rejected.inputResetVersion).toBe(before.inputResetVersion); expect(rejected.canUndo).toBe(before.canUndo); expect(rejected.canRedo).toBe(true);
    expect(rejected.saveConflict).toBe(true); expect(rejected.dirty).toBe(true);
    rejected.redo(); expect(render().definition.name).toBe("B"); render().undo(); expect(render().definition.name).toBe("A");
    await render().saveDocument(); expect(api.save.mock.calls[1].slice(2)).toEqual([3, 8]);
  });

  it("creates a Definition revision even for a layout-only restore and makes it undoable", async () => {
    (await boot()).setInput({ question: "keep" });
    const target = structuredClone(initial); target.editor.nodes.start.x = 700;
    await render().restoreDocument(target);
    expect(api.save).toHaveBeenCalledOnce(); expect(api.saveEditor).not.toHaveBeenCalled();
    expect(render().definition.revision).toBe(4); expect(render().editor.editorRevision).toBe(9); expect(render().editor.nodes.start.x).toBe(700);
    expect(render().dirty).toBe(false); expect(render().canUndo).toBe(true); expect(render().input).toEqual({ question: "keep" });
    render().undo(); expect(render().editor.nodes.start.x).toBe(initial.editor.nodes.start.x); expect(render().definition.revision).toBe(4); expect(render().dirty).toBe(true);
    render().redo(); expect(render().editor.nodes.start.x).toBe(700); expect(render().dirty).toBe(false);
  });

  it("retains newer B during a pending restore while discard returns to accepted A", async () => {
    await boot();
    const target = structuredClone(initial); target.definition.name = "restored A";
    const accepted = deferred<{ workflowId: string; revision: number; editorRevision: number }>(); api.save.mockReturnValueOnce(accepted.promise);
    const pending = render().restoreDocument(target);
    render().editDefinition(current => ({ ...current, name: "newer B" })); render().setInput({ question: "newer input" });
    accepted.resolve({ workflowId: "workflow", revision: 4, editorRevision: 9 }); await pending;
    expect(render().definition).toMatchObject({ name: "newer B", revision: 4 }); expect(render().dirty).toBe(true);
    render().discard(); expect(render().definition).toMatchObject({ name: "restored A", revision: 4 }); expect(render().dirty).toBe(false);
    expect(render().input).toEqual({ question: "newer input" });
  });
});


describe("same-tab recovery after authentication interruption", () => {
  it("captures synchronous input changes and a cleared history identity before the next React commit", async () => {
    (await boot()).selectRun(oldRun); render(); await flush();
    const beforeCommit = render();
    beforeCommit.setInput({ question: "latest discrete event" });
    beforeCommit.setInputInvalid("latest raw error");
    beforeCommit.setEnvironmentRef("latest-environment");
    beforeCommit.rejectRunPreparation("new attempt blocked");
    const checkpoint = beforeCommit.captureSessionRecovery(authenticationFailure);
    expect(checkpoint.input).toEqual({ question: "latest discrete event" });
    expect(checkpoint.inputDirty).toBe(true); expect(checkpoint.inputInvalid).toBe("latest raw error");
    expect(checkpoint.observedRunId).toBeNull(); expect(checkpoint.runOrigin).toBeNull();
    expect(checkpoint.environmentRef).toBe("latest-environment");
    expect(checkpoint.runPreparationFailure).toBe("preflight");
  });

  it("recovers unsaved documents, input, raw-input errors and undo/redo without saving or running", async () => {
    (await boot()).editDefinition(current => ({ ...current, name: "draft A" }));
    render().editDefinition(current => ({ ...current, name: "draft B" })); render().undo();
    render().setInput({ question: "kept" }); render().setInputInvalid("unfinished JSON");
    const checkpoint = render().captureSessionRecovery(authenticationFailure);
    remountRecovery(checkpoint); await flush();
    const recovered = render();
    expect(recovered.definition.name).toBe("draft A"); expect(recovered.input).toEqual({ question: "kept" });
    expect(recovered.inputDirty).toBe(true); expect(recovered.inputInvalid).toBe("unfinished JSON");
    expect(recovered.dirty).toBe(true); expect(recovered.canRedo).toBe(true);
    expect(recovered.notice).toContain("登录已恢复");
    expect(api.save).not.toHaveBeenCalled(); expect(api.createRun).not.toHaveBeenCalled();
    recovered.redo(); expect(render().definition.name).toBe("draft B");
    render().undo(); expect(render().definition.name).toBe("draft A");
  });

  it("keeps the original saved baseline and rejects a changed server head without silently rebasing", async () => {
    (await boot()).editDefinition(current => ({ ...current, name: "local draft" }));
    const checkpoint = render().captureSessionRecovery(authenticationFailure);
    const fresh = structuredClone(initial); fresh.definition.revision = 4; fresh.definition.name = "remote change";
    fresh.editor.editorRevision = 9; fresh.editor.definitionRevision = 4;
    remountRecovery(checkpoint, fresh); await flush();
    expect(render().notice).toContain("服务端版本已更新");
    api.save.mockRejectedValueOnce(new ApiRequestError("REVISION_CONFLICT", "conflict", 409));
    await render().saveDocument();
    expect(api.save.mock.calls[0].slice(2)).toEqual([3, 8]);
    expect(render().definition.name).toBe("local draft"); expect(render().dirty).toBe(true);
    expect(render().saveConflict).toBe(true); render().undo(); expect(render().definition.name).toBe("saved");
  });

  it("does not advance from an interrupted preflight to Save or createRun after its late response", async () => {
    (await boot()).editDefinition(current => ({ ...current, name: "draft" }));
    const validation = deferred<{ valid: boolean; diagnostics: [] }>(); api.validateDraft.mockReturnValueOnce(validation.promise);
    const promise = render().startRun(true);
    const checkpoint = render().captureSessionRecovery(authenticationFailure);
    expect(checkpoint.runPreparationFailure).toBe("preflight");
    validation.resolve({ valid: true, diagnostics: [] }); await promise;
    expect(api.save).not.toHaveBeenCalled(); expect(api.createRun).not.toHaveBeenCalled();
  });

  it("does not submit after an already in-flight Save completes following interruption", async () => {
    (await boot()).editDefinition(current => ({ ...current, name: "draft" }));
    const saving = deferred<{ workflowId: string; revision: number; editorRevision: number }>(); api.save.mockReturnValueOnce(saving.promise);
    const promise = render().startRun(true); await flush();
    const checkpoint = render().captureSessionRecovery(authenticationFailure);
    expect(checkpoint.runPreparationFailure).toBe("save");
    saving.resolve({ workflowId: "workflow", revision: 4, editorRevision: 9 }); await promise;
    expect(api.createRun).not.toHaveBeenCalled();
    remountRecovery(checkpoint); expect(render().definition.name).toBe("draft"); expect(render().dirty).toBe(true);
  });

  it("restores an uncertain original request and its original context/key, leaving the new draft untouched", async () => {
    const originalContext = { courseId: "course-A", assignmentId: "assignment-A", workflowTemplateId: "workflow" };
    hookContext = originalContext;
    (await boot()).setInput({ question: "original A" });
    api.createRun.mockRejectedValueOnce(new Error("response lost")); await render().startRun();
    const originalKey = api.createRun.mock.calls[0][4];
    render().setInput({ question: "newer B" });
    const checkpoint = render().captureSessionRecovery(authenticationFailure);
    const otherContext = { ...originalContext, assignmentId: "assignment-B" };
    remountRecovery(checkpoint, initial, otherContext); await flush();
    expect(api.createRun).toHaveBeenCalledTimes(1); expect(render().submitUnknown).toBe(true);
    await render().startRun(); expect(api.createRun).toHaveBeenCalledTimes(1);
    await render().confirmSubmission();
    expect(api.createRun.mock.calls[1]).toEqual(["workflow", 3, { question: "original A" }, "local", originalKey, originalContext, undefined]);
    expect(render().input).toEqual({ question: "newer B" });
    await render().startRun(); expect(api.createRun.mock.calls[2][5]).toEqual(otherContext);
  });

  it("only settles the exact original first createRun rejection, never an unrelated notification", async () => {
    await boot();
    const creation = deferred<{ runId: string; revision: number; status: string }>();
    api.createRun.mockReturnValueOnce(creation.promise);
    const promise = render().startRun(); await flush();
    const checkpoint = render().captureSessionRecovery(authenticationFailure);
    expect(checkpoint.pendingRunRequest?.key).toBe(api.createRun.mock.calls[0][4]);
    expect(recoveryRejected).not.toHaveBeenCalled();
    // The original create call itself definitively rejects after the synchronous capture.
    creation.reject(new ApiRequestError("UNAUTHORIZED", "expired", 401));
    await promise;
    expect(recoveryRejected).toHaveBeenCalledExactlyOnceWith(checkpoint.pendingRunRequest!.key);
  });

  it("retains an original uncertain key when confirmation itself receives a 401", async () => {
    (await boot()).setInput({ question: "original" });
    api.createRun.mockRejectedValueOnce(new Error("lost")); await render().startRun();
    const originalKey = api.createRun.mock.calls[0][4];
    const checkpoint = render().captureSessionRecovery(authenticationFailure);
    remountRecovery(checkpoint); await flush();
    api.createRun.mockRejectedValueOnce(new ApiRequestError("UNAUTHORIZED", "expired again", 401));
    await render().confirmSubmission();
    expect(render().submitUnknown).toBe(true); expect(recoveryRejected).not.toHaveBeenCalled();
    expect(render().captureSessionRecovery(authenticationFailure).pendingRunRequest?.key).toBe(originalKey);
  });

  it("restores an observed run through fresh server reads without resubmitting it", async () => {
    (await boot()).selectRun(oldRun); render(); await flush();
    const checkpoint = render().captureSessionRecovery(authenticationFailure); api.run.mockClear(); api.events.mockClear();
    remountRecovery(checkpoint); await flush(); render(); await flush();
    expect(api.run).toHaveBeenCalledWith("old"); expect(api.events).toHaveBeenCalledWith("old", 0);
    expect(render().runOrigin).toBe("history"); expect(render().run?.runId).toBe("old");
    expect(api.createRun).not.toHaveBeenCalled();
  });
});


it('resumes the frozen Thread without replacing edits made while the request is pending',async()=>{
  const gate=deferred<{runId:string;revision:number;status:string}>();api.resumeThread.mockReturnValue(gate.promise);
  let control=await boot();
  const thread={threadId:'thread',currentRunId:'old',checkpointId:'cp',revision:1} as import('../../domain/v2/types').WorkflowThreadV2;
  control.selectRun({...oldRun,status:'waiting',threadId:'thread'});control=render();
  expect(control.observedThreadId).toBe('thread');
  const result=control.resumeThread(thread,{'interrupt':{answer:0}});
  control.editDefinition(current=>({...current,name:'new draft while resuming'}));
  gate.resolve({runId:'resumed',revision:1,status:'queued'});await result;await flush();control=render();
  expect(api.resumeThread).toHaveBeenCalledWith('thread','cp',{'interrupt':{answer:0}},'old');
  expect(control.definition.name).toBe('new draft while resuming');expect(control.dirty).toBe(true);
  expect(control.runOrigin).toBe('current');
  expect(control.observedRunId).toBe('resumed');expect(control.observedThreadId).toBe('thread');
  await flush();control=render();await flush();control=render();
  expect(control.run?.status).toBe('success');expect(control.notice).not.toContain('已提交恢复');
});

const waitingThread = {threadId:'thread-waiting',workflowId:'workflow',revision:3,status:'waiting',currentRunId:'pending-run',checkpointId:'checkpoint',state:{amount:0},stateVersion:0,interrupts:[{id:'interrupt',nodeId:'amount',title:'填写费用',schema:{type:'object'}}],updatedAt:'2026-10-18T00:00:00Z',nodeExecutions:1,toolCalls:0,computeMs:10} as import('../../domain/v2/types').WorkflowThreadV2;
it('observes a waiting Thread when its original Run history was physically pruned',async()=>{
  api.threads.mockResolvedValue({items:[waitingThread]});api.thread.mockResolvedValue(waitingThread);
  api.run.mockRejectedValue(new ApiRequestError('HISTORY_EXPIRED','pruned',410));
  let control=await boot();for(let i=0;i<4;i++){await flush();control=render();}
  expect(control.observedRunId).toBe('pending-run');expect(control.currentThread?.threadId).toBe('thread-waiting');
  expect(control.historyExpired).toBe(true);expect(control.awaitingRunRecord).toBe(false);
  expect(control.run).toBeNull();expect(control.steps).toEqual([]);expect(control.events).toEqual([]);
  expect(control.runSnapshot?.definition.revision).toBe(3);
});
it('does not attach a waiting form to another Run of the same Thread',async()=>{
  api.thread.mockResolvedValue(waitingThread);
  let control=await boot();control.selectThread(waitingThread);control=render();await flush();control=render();
  control.selectRun({...oldRun,runId:'previous-run',threadId:waitingThread.threadId,status:'continued'});control=render();await flush();control=render();
  expect(control.observedRunId).toBe('previous-run');expect(control.currentThread).toBeNull();
  expect(await control.resumeThread(waitingThread,{interrupt:{amount:12}})).toBe(false);
  expect(api.resumeThread).not.toHaveBeenCalled();
});
it('a late accepted response does not replace a history selection made during submission',async()=>{
  const gate=deferred<{runId:string;revision:number;status:string}>();api.resumeThread.mockReturnValue(gate.promise);
  let control=await boot();control.selectThread(waitingThread);control=render();
  const pending=control.resumeThread(waitingThread,{interrupt:{amount:12}});
  control.selectRun({...oldRun,runId:'chosen-history'});control=render();
  gate.resolve({runId:'continuation',revision:3,status:'queued'});expect(await pending).toBe(true);control=render();
  expect(control.observedRunId).toBe('chosen-history');expect(control.runOrigin).toBe('history');
});
