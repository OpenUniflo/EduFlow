import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { WorkflowThreadV2 } from "../../domain/v2/types";
import { runWaitingResponseTarget } from "./runWaitingResponse";

const interrupt = {
  id: "interrupt-1",
  nodeId: "correct",
  title: "工商信用代码不匹配，请提交更正后的 18 位代码",
  schema: { type: "object", properties: { code: { type: "string" } } },
  graphPath: [] as string[],
};
const thread: WorkflowThreadV2 = {
  threadId: "run-1",
  workflowId: "workflow",
  revision: 2,
  status: "waiting",
  currentRunId: "run-1",
  checkpointId: "checkpoint",
  state: {},
  stateVersion: 1,
  interrupts: [interrupt],
  updatedAt: "2026-11-16T09:25:45Z",
  nodeExecutions: 1,
  toolCalls: 0,
  computeMs: 0,
};

describe("live waiting response entry", () => {
  it("exposes the response target on the current canvas without a history snapshot", () => {
    expect(runWaitingResponseTarget({
      phase: "waiting",
      runId: "run-1",
      thread,
      interrupt,
      graphPath: [],
      nodeExists: true,
    })).toEqual({ runId: "run-1", nodeId: "correct", interruptId: "interrupt-1", graphPath: [] });
  });

  it("keeps the target out of a different Run or canvas scope", () => {
    expect(runWaitingResponseTarget({ phase: "waiting", runId: "run-2", thread, interrupt, graphPath: [], nodeExists: true })).toBeNull();
    expect(runWaitingResponseTarget({ phase: "waiting", runId: "run-1", thread, interrupt, graphPath: ["subgraph"], nodeExists: true })).toBeNull();
  });

  it("does not offer a response after the Run or Thread has moved on", () => {
    expect(runWaitingResponseTarget({ phase: "running", runId: "run-1", thread, interrupt, graphPath: [], nodeExists: true })).toBeNull();
    expect(runWaitingResponseTarget({ phase: "waiting", runId: "run-1", thread: { ...thread, status: "closed" }, interrupt, graphPath: [], nodeExists: true })).toBeNull();
    expect(runWaitingResponseTarget({ phase: "waiting", runId: "run-1", thread, interrupt, graphPath: [], nodeExists: false })).toBeNull();
  });

  it("matches interrupt graph paths for a waiting subgraph on its own canvas", () => {
    const nested = { ...interrupt, id: "interrupt-2", graphPath: ["child"] };
    expect(runWaitingResponseTarget({ phase: "waiting", runId: "run-1", thread: { ...thread, interrupts: [nested] }, interrupt: nested, graphPath: ["child"], nodeExists: true })).toMatchObject({ nodeId: "correct", graphPath: ["child"] });
  });

  it("never targets a same-id node that waits in another graph path", () => {
    const current = { ...interrupt, id: "interrupt-current", graphPath: ["current"] };
    const sibling = { ...interrupt, id: "interrupt-sibling", graphPath: ["sibling"] };
    const twoGraphs = { ...thread, interrupts: [sibling, current] };
    expect(runWaitingResponseTarget({ phase: "waiting", runId: "run-1", thread: twoGraphs, interrupt: current, graphPath: ["current"], nodeExists: true }))
      .toMatchObject({ nodeId: "correct", interruptId: "interrupt-current", graphPath: ["current"] });
    expect(runWaitingResponseTarget({ phase: "waiting", runId: "run-1", thread: twoGraphs, interrupt: sibling, graphPath: ["current"], nodeExists: true })).toBeNull();
    expect(runWaitingResponseTarget({ phase: "waiting", runId: "run-1", thread: twoGraphs, interrupt: sibling, graphPath: ["sibling"], nodeExists: true }))
      .toMatchObject({ interruptId: "interrupt-sibling", graphPath: ["sibling"] });
  });

  it("keeps the live editor response entry anchored to the current canvas path", () => {
    const editor = readFileSync(new URL("./LiveWorkflowEditor.tsx", import.meta.url), "utf8");
    expect(editor).toContain("runWaitingResponseTarget");
    expect(editor).toContain("graphPath:safePath");
    expect(editor).not.toContain("graphPath:pendingInterrupt?.graphPath");
    expect(editor).toContain("等待回应 · 请在节点气泡中填写并提交");
    expect(editor).not.toMatch(/pendingInterrupt&&pendingThread&&inspection/);
    expect(editor).not.toMatch(/if\(!key\|\|!inspection\|\|focusedResponse/);
  });
});
