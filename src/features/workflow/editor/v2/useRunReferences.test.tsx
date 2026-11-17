// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RunReferenceSnapshot } from "../../domain/v2/runReferences";
import { createWorkflowV2 } from "../../domain/v2/factory";
import type { WorkflowRunV2 } from "../../domain/v2/types";
import { workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { runReferenceSnapshotMatchesRun, useRunReferences } from "./useRunReferences";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type State = ReturnType<typeof useRunReferences>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function run(overrides: Partial<WorkflowRunV2> = {}): WorkflowRunV2 {
  return {
    runId: "run-a", workflowId: "root", revision: 2, mode: "live", verification: "unverified",
    status: "success", definitionHash: "definition", semanticHash: "semantic", compileFingerprint: "compile",
    environmentRef: "local", environmentRevision: "env-1", policyVersion: "m1.1",
    createdAt: "2026-11-16T10:00:00Z", lastSeq: 8,
    ...overrides,
  };
}

function targetSnapshot(source: WorkflowRunV2, name = "子流程"): RunReferenceSnapshot {
  const definition = createWorkflowV2(name);
  definition.workflowId = "child";
  definition.revision = 1;
  return {
    available: true, version: 1,
    root: { workflowId: source.workflowId, revision: source.revision },
    rootEnvironmentRef: source.environmentRef,
    targets: [{ workflowId: "child", revision: 1, environmentRef: source.environmentRef, name, definition }],
    environments: [{ environmentRef: source.environmentRef, environmentRevision: source.environmentRevision }],
    targetCount: 1,
  };
}

const MISSING: RunReferenceSnapshot = { available: false, reason: "missing", targets: [], environments: [] };

let latest: State;
let root: Root | undefined;
let host: HTMLDivElement;
const requests: string[] = [];

function Probe({ value }: { value: WorkflowRunV2 | null }) {
  latest = useRunReferences(value);
  return null;
}

function render(value: WorkflowRunV2 | null) {
  if (!root) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  act(() => { root!.render(<Probe value={value}/>); });
}

beforeEach(() => {
  requests.length = 0;
  vi.restoreAllMocks();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

it("loads the frozen closure for an active live run before any history selection", async () => {
  const source = run();
  const pending = deferred<RunReferenceSnapshot>();
  vi.spyOn(workflowApiV2, "runReferences").mockImplementation(runId => { requests.push(runId); return pending.promise; });

  render(source);
  expect(requests).toEqual(["run-a"]);
  expect(latest.runReferences).toBeNull();
  expect(latest.runReferencesLoading).toBe(true);
  expect(latest.runReferencesError).toBe("");

  await act(async () => { pending.resolve(targetSnapshot(source)); });
  expect(latest.runReferencesLoading).toBe(false);
  expect(latest.runReferences).toMatchObject({
    available: true,
    root: { workflowId: "root", revision: 2 },
    targets: [{ workflowId: "child", revision: 1, environmentRef: "local", name: "子流程" }],
  });
  expect(latest.runReferencesError).toBe("");
});

it("never applies a previous run's late response after switching runs", async () => {
  const first = run({ runId: "run-a", workflowId: "root-a" });
  const second = run({ runId: "run-b", workflowId: "root-b", revision: 3 });
  const pendingA = deferred<RunReferenceSnapshot>();
  const pendingB = deferred<RunReferenceSnapshot>();
  vi.spyOn(workflowApiV2, "runReferences").mockImplementation(runId => {
    requests.push(runId);
    return runId === "run-a" ? pendingA.promise : pendingB.promise;
  });

  render(first);
  render(second);
  expect(latest.runReferences).toBeNull();
  expect(latest.runReferencesLoading).toBe(true);

  await act(async () => { pendingA.resolve(targetSnapshot(first, "旧目标")); });
  expect(latest.runReferences).toBeNull();
  expect(latest.runReferencesLoading).toBe(true);
  expect(requests).toEqual(["run-a", "run-b"]);

  await act(async () => { pendingB.resolve(targetSnapshot(second, "新目标")); });
  expect(latest.runReferencesLoading).toBe(false);
  expect(latest.runReferences?.available && latest.runReferences.targets[0]?.name).toBe("新目标");
});

it("caches an available closure per run and reuses it when switching back", async () => {
  const first = run({ runId: "run-a" });
  const second = run({ runId: "run-b", revision: 4 });
  const pendingA = deferred<RunReferenceSnapshot>();
  const pendingB = deferred<RunReferenceSnapshot>();
  vi.spyOn(workflowApiV2, "runReferences").mockImplementation(runId => {
    requests.push(runId);
    return runId === "run-a" ? pendingA.promise : pendingB.promise;
  });

  render(first);
  await act(async () => { pendingA.resolve(targetSnapshot(first, "A 目标")); });
  render(second);
  await act(async () => { pendingB.resolve(targetSnapshot(second, "B 目标")); });
  render(first);

  expect(requests).toEqual(["run-a", "run-b"]);
  expect(latest.runReferencesLoading).toBe(false);
  expect(latest.runReferences?.available && latest.runReferences.targets[0]?.name).toBe("A 目标");
});

it("reports a truly missing snapshot instead of hanging in loading or borrowing a target", async () => {
  const source = run();
  const pending = deferred<RunReferenceSnapshot>();
  vi.spyOn(workflowApiV2, "runReferences").mockImplementation(runId => { requests.push(runId); return pending.promise; });

  render(source);
  await act(async () => { pending.resolve(MISSING); });
  expect(latest.runReferencesLoading).toBe(false);
  expect(latest.runReferences).toEqual(MISSING);
  expect(latest.runReferencesError).toBe("");
  expect(latest.runReferences?.available).toBe(false);
});

it("keeps a failed projection read distinguishable from a missing snapshot", async () => {
  const source = run();
  const pending = deferred<RunReferenceSnapshot>();
  vi.spyOn(workflowApiV2, "runReferences").mockImplementation(runId => { requests.push(runId); return pending.promise; });

  render(source);
  await act(async () => { pending.reject(new Error("读取失败")); });
  expect(latest.runReferencesLoading).toBe(false);
  expect(latest.runReferences).toBeNull();
  expect(latest.runReferencesError).toBe("读取失败");
});

it("rejects a closure whose root identity does not match the selected run", async () => {
  const source = run({ runId: "run-a", revision: 2 });
  const pending = deferred<RunReferenceSnapshot>();
  vi.spyOn(workflowApiV2, "runReferences").mockImplementation(runId => { requests.push(runId); return pending.promise; });

  render(source);
  await act(async () => { pending.resolve(targetSnapshot(run({ revision: 9 }))); });
  expect(latest.runReferences).toBeNull();
  expect(latest.runReferencesLoading).toBe(false);
  expect(latest.runReferencesError).toContain("运行身份不一致");
});

it("matches only available closures to the same root, revision and environment", () => {
  const source = run();
  expect(runReferenceSnapshotMatchesRun(MISSING, source)).toBe(true);
  expect(runReferenceSnapshotMatchesRun(targetSnapshot(source), source)).toBe(true);
  expect(runReferenceSnapshotMatchesRun(targetSnapshot(run({ revision: 5 })), source)).toBe(false);
  expect(runReferenceSnapshotMatchesRun(targetSnapshot(run({ environmentRef: "dev" })), source)).toBe(false);
  expect(runReferenceSnapshotMatchesRun(targetSnapshot(run({ workflowId: "other" })), source)).toBe(false);
});
