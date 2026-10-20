import { describe, expect, it } from "vitest";
import { createEditorV2, createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import { advancePreview, createFrontendPreview, forkPreview, frontendPreviewEvents, planPreview, respondPreview, type FrontendPreview } from "./frontendPreview";
function setup() {
  const definition = createWorkflowV2(); definition.state.initial = { response: "", later: false };
  const node = createNodeV2("core.transform", "prepare"); node.config.authoring = { interrupt: { title: "你的问题", schema: { type: "object", properties: { answer: { type: "string", minLength: 1 } }, required: ["answer"] }, resumeWrites: { answer: "response" } } };
  const final = createNodeV2("core.transform", "final"); final.config.authoring = { previewOutput: { later: true } }; final.writes = { later: "/later" };
  definition.nodes.splice(1, 0, node, final); definition.transitions = [{ id: "a", from: "start", outlet: "next", to: "prepare" }, { id: "b", from: "prepare", outlet: "next", to: "final" }, { id: "c", from: "final", outlet: "next", to: "end" }];
  return { definition, editor: createEditorV2(definition) };
}
function finish(record: FrontendPreview) { let current = record; for (let i = 0; i < 30 && current.status === "running"; i++) current = advancePreview(current); return current; }
it("maps explicit advanced invocation data into graph State without changing the saved initial values",()=>{
  const snapshot=setup();snapshot.definition.state.inputBindings={response:{source:"input",pointer:"/question",onMissing:{mode:"error"}}};
  const session=createFrontendPreview(snapshot,"advanced-input","normal",{question:"external caller"});
  expect(session.states["[]"].response).toBe("external caller");expect(snapshot.definition.state.initial.response).toBe("");
  expect(session.inputs["[]"]).toEqual({question:"external caller"});
});
describe("isolated frontend preview tape", () => {
  it("starts directly, pauses at an ordinary node, validates response and resumes the same identity", () => {
    const snapshot = setup(); let current = finish(createFrontendPreview(snapshot, "preview-1"));
    expect(current.status).toBe("waiting"); expect(current.steps[current.steps.length - 1]?.nodeId).toBe("prepare");
    expect(current.steps[current.steps.length - 1]?.finishedAt).toBeUndefined();
    expect(respondPreview(current, { answer: "" })).toBe(current);
    expect(respondPreview(current, { answer: "   " })).toBe(current);
    current = finish(respondPreview(current, { answer: "hello" }));
    expect(current.status).toBe("success"); expect(current.id).toBe("preview-1");
    expect(current.states["[]"]).toEqual({ response: "hello", later: true });
    expect(snapshot.definition.state.initial.response).toBe("");
  });
  it("forks the checkpoint state without leaking future state or overwriting source history", () => {
    const waiting = finish(createFrontendPreview(setup(), "preview-1"));
    const done = finish(respondPreview(waiting, { answer: "hello" }));
    const checkpoint = done.steps.find(step => step.nodeId === "prepare")!;
    const fork = forkPreview(done, checkpoint.stepId, "preview-2");
    expect(fork.states["[]"].later).toBe(false); expect(fork.states["[]"].response).toBe("hello");
    expect(fork.steps).toEqual([]); expect(fork.parent?.id).toBe(done.id); expect(done.states["[]"].later).toBe(true);
  });
  it("keeps retries as distinct attempts and never labels a preview as live", () => {
    const snapshot = setup(); snapshot.definition.nodes[1].config = {};
    const done = finish(createFrontendPreview(snapshot, "preview-1", "retry"));
    expect(done.mode).toBe("preview"); expect(done.status).toBe("success");
    expect(done.steps.filter(step => step.nodeId === "prepare").map(step => [step.attempt, step.status])).toEqual([[1, "failed"], [2, "completed"]]);
    const cancelled = { ...done, status: "cancelled" as const }; expect(advancePreview(cancelled)).toBe(cancelled);
  });
});

import { authoringExample } from "../../domain/v2/authoringExamples";
import { authoringDiagnostics } from "../../domain/v2/authoring";
it.each([true, false])("previews parallel/subgraph joins and routes the explicit confirmation %s", approved => {
  const snapshot = authoringExample("parallel", createWorkflowV2()); expect(authoringDiagnostics(snapshot.definition)).toEqual([]);
  let session = finish(createFrontendPreview(snapshot, "preview-order")); expect(session.status).toBe("waiting");
  session = finish(respondPreview(session, { order_id: "A1001" })); expect(session.status).toBe("waiting");
  expect(session.states['["risk"]'].order_id).toBe("A1001"); expect(session.states["[]"].risk).toBe("低风险（演示值）");
  session = finish(respondPreview(session, { approved })); expect(session.status).toBe("success");
  expect(session.steps.some(step => step.nodeId === "execute")).toBe(approved);
  const join = session.steps.findIndex(step => step.nodeId === "join");
  expect(session.steps.findIndex(step => step.nodeId === "stock")).toBeLessThan(join);
  expect(session.steps.findIndex(step => step.nodeId === "risk" && step.status === "completed")).toBeLessThan(join);
  expect(session.steps.filter(step => step.nodeId === "risk")).toHaveLength(1);
  const risk = session.steps.find(step => step.nodeId === "risk")!;
  const fork = forkPreview(session, risk.stepId, "risk-fork");
  expect(fork.tasks[fork.cursor]?.nodeId).toBe("join");
});
it("shows a separate invocation per Send item and aggregates only explicit fixture returns", () => {
  const snapshot = authoringExample("batch", createWorkflowV2()); expect(authoringDiagnostics(snapshot.definition)).toEqual([]);
  let session = finish(createFrontendPreview(snapshot, "preview-send")); expect(session.status).toBe("waiting");
  session = finish(respondPreview(session, { items: ["first", "second", "third"] }));
  expect(session.status).toBe("success");
  const tasks = session.steps.filter(step => step.nodeId === "summarize");
  expect(tasks.map(step => [step.invocation, step.input])).toEqual([[1, { item: "first" }], [2, { item: "second" }], [3, { item: "third" }]]);
  expect(new Set(tasks.map(step => step.taskId)).size).toBe(3);
  expect(session.states["[]"].results).toHaveLength(3);
});
it("distinguishes all-predecessor from any-ready illustrative join ordering",()=>{
  const {definition}=authoringExample("parallel",createWorkflowV2());
  const all=planPreview(definition).map(task=>task.nodeId);
  expect(all.indexOf("join")).toBeGreaterThan(all.indexOf("inspect"));
  definition.nodes.find(node=>node.id==="join")!.config.strategy="any";
  const any=planPreview(definition).map(task=>task.nodeId);
  expect(any.indexOf("join")).toBeGreaterThan(any.indexOf("stock"));
  expect(any.indexOf("join")).toBeLessThan(any.indexOf("risk"));
});
it("streams one invocation incrementally and commits output and State only at completion", () => {
  const definition = createWorkflowV2();
  definition.state.initial = { answer: "" };
  const model = createNodeV2("core.llm", "model");
  model.config.authoring = { previewOutput: { answer: "abcdefghijklmno" } };
  model.writes = { answer: "/answer" };
  definition.nodes.splice(1, 0, model);
  definition.transitions = [{ id: "a", from: "start", to: "model", outlet: "next" }, { id: "b", from: "model", to: "end", outlet: "next" }];
  let session = advancePreview(advancePreview(createFrontendPreview({ definition, editor: createEditorV2(definition) }, "stream")));
  expect(session.steps[1].status).toBe("running");
  expect(session.steps[1].output).toBeUndefined();
  session = advancePreview(session);
  expect(frontendPreviewEvents(session).filter(event => event.type === "node.output.delta")).toHaveLength(1);
  expect(session.states["[]"].answer).toBe("");
  const done = finish(session);
  expect(done.steps.filter(step => step.nodeId === "model")).toHaveLength(1);
  expect(done.states["[]"].answer).toBe("abcdefghijklmno");
  expect(frontendPreviewEvents(done).filter(event => event.type === "node.output.delta").map(event => (event.payload as {text:string}).text).join("")).toBe("abcdefghijklmno");
});
