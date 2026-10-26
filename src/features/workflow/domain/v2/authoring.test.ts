import { describe, expect, it } from "vitest";
import { createEditorV2, createWorkflowV2 } from "./factory";
import { authoringDiagnostics, createAuthoringNode, editorAtPath, frontendCapabilities, graphAtPath, interactionResponseIssue, nodeOutlets, outletDisplayName, pruneGraphLayouts, replaceGraph, replaceGraphEditor } from "./authoring";
function document() { const graph = createWorkflowV2(); graph.nodes.splice(1, 0, createAuthoringNode("core.subgraph", "nested")); return { graph, editor: createEditorV2(graph) }; }
describe("frontend graph authoring boundary", () => {
  it("rejects whitespace in required non-empty responses without rewriting valid text or falsy values",()=>{
    const schema={type:"object",properties:{text:{type:"string",minLength:1},approved:{type:"boolean"},count:{type:"number"}},required:["text","approved","count"]};
    expect(interactionResponseIssue(schema,{text:"   ",approved:false,count:0})).toContain("不能只包含空格");
    const response={text:"  valid text  ",approved:false,count:0};
    expect(interactionResponseIssue(schema,response)).toBeUndefined();expect(response.text).toBe("  valid text  ");
    expect(interactionResponseIssue({properties:{text:{type:"string",minLength:0}},required:["text"]},{text:"   "})).toBeUndefined();
  });
  it("keeps nested State and layout separate while roundtripping the one document", () => {
    const { graph, editor } = document(); const child = graphAtPath(graph, ["nested"]);
    const next = replaceGraph(graph, ["nested"], { ...child, state: { ...child.state, initial: { onlyChild: 2 } } });
    const layout = editorAtPath(editor, ["nested"], child); layout.nodes.start = { x: 456, y: 789 };
    const saved = JSON.parse(JSON.stringify({ definition: next, editor: replaceGraphEditor(editor, ["nested"], layout) }));
    expect(graphAtPath(saved.definition, ["nested"]).state.initial).toEqual({ onlyChild: 2 });
    expect(saved.definition.state.initial).toEqual({});
    expect(editorAtPath(saved.editor, ["nested"], child).nodes.start).toEqual({ x: 456, y: 789 });
    expect(saved.editor.nodes.start).toEqual(editor.nodes.start);
  });
  it("prunes layouts when subgraphs are deleted and rejects invalid navigation", () => {
    const { graph, editor } = document(); const child = graphAtPath(graph, ["nested"]);
    const saved = replaceGraphEditor(editor, ["nested"], editorAtPath(editor, ["nested"], child));
    expect(pruneGraphLayouts({ ...graph, nodes: graph.nodes.filter(node => node.id !== "nested") }, saved).graphs).toEqual({});
    expect(() => graphAtPath(graph, ["missing"])).toThrow("子图不存在");
  });
  it("does not call frontend extensions live executable", () => {
    const { graph } = document(); graph.nodes.push({ ...createAuthoringNode("core.function", "f"), config: { authoring: { interrupt: { title: "question", schema: {}, resumeWrites: {} } } } });
    expect(frontendCapabilities(graph)).toEqual(expect.arrayContaining(["子图", "函数", "节点中断与恢复"]));
    expect(frontendCapabilities(createWorkflowV2())).toEqual([]);
  });
  it("exposes independent parallel outlets and diagnoses unresolved Send targets", () => {
    const graph = createWorkflowV2(); const fork = createAuthoringNode("control.fork", "fork");
    expect(nodeOutlets(fork)).toEqual(["branch_1", "branch_2"]);
    graph.nodes.push(createAuthoringNode("control.send", "send"));
    expect(authoringDiagnostics(graph)).toContain("主流程 / 动态分发 Send：请选择分发目标");
  });
});

describe("user-visible outlet names", () => {
  it("prefers router author labels and never exposes internal case keys", () => {
    const node = createAuthoringNode("core.router", "route");
    node.config = { cases: [
      { id: "learning", label: "学习", priority: 1, predicate: { op: "eq" } },
      { id: "technical", priority: 2, predicate: { op: "eq", right: { source: "literal", value: "技术" } } },
    ], defaultOutlet: "other", defaultLabel: "其他" };
    expect(outletDisplayName(node, "learning")).toBe("学习");
    expect(outletDisplayName(node, "technical")).toBe("技术");
    expect(outletDisplayName(node, "other")).toBe("其他");
  });
  it("keeps generic control-flow names readable", () => {
    const node = createAuthoringNode("control.fork", "fork");
    expect(outletDisplayName(node, "branch_2")).toBe("分支 2");
    expect(outletDisplayName(node, "default")).toBe("否则");
    expect(outletDisplayName(node, "next")).toBe("");
  });
});
