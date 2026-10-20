import { withModelState } from "./messageAuthoring";
import { createAuthoringNode } from "./authoring";
import { createEditorV2, createNodeV2, createWorkflowV2, stateBinding } from "./factory";
import type { JsonValue, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowNodeV2 } from "./types";
const fixture = (node: WorkflowNodeV2, output: Record<string, JsonValue>, writes: Record<string, string> = {}) => ({ ...node, config: { ...node.config, authoring: { previewOutput: output } }, writes });
const edge = (from: string, to: string, outlet = "next") => ({ id: `${from}:${outlet}:${to}`, from, to, outlet });
function request(id: string, label: string, field: string, type = "string"): WorkflowNodeV2 {
  const node = createAuthoringNode("core.function", id);
  return { ...node, label, config: { ...node.config, authoring: { interrupt: { title: label, schema: { type: "object", properties: { [field]: { type, title: field === "approved" ? "是否继续处理？" : field === "items" ? "待摘要资料（每行一项）" : "订单号", ...(type === "array" ? { items: { type: "string" }, minItems: 1 } : type === "string" ? { minLength: 1 } : {}) } }, required: [field], additionalProperties: false }, resumeWrites: { [field]: field } } } } };
}
/** Generic authoring examples with explicit fixture data; no Course identities or live fallbacks. */
export function authoringExample(kind: "parallel" | "batch", base: WorkflowDefinitionV2): WorkflowDocumentV2 {
  const graph = { ...createWorkflowV2(base.name), workflowId: base.workflowId, revision: base.revision, description: kind === "parallel" ? "前端演示：普通节点请求信息，并行查询、子图、确认与条件分支。所有外部结果都是示例值。" : "前端演示：普通函数请求资料列表，Send 为每个条目创建任务，追加归并结果。" };
  if (kind === "parallel") {
    const child = createWorkflowV2("风险检查");
    child.inputSchema = { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] };
    child.state = { schema: { type: "object", properties: { order_id: { type: "string" }, risk: { type: "string" } } }, initial: { order_id: "", risk: "" }, inputBindings: { order_id: { source: "input", pointer: "/order_id", onMissing: { mode: "error" } } }, reducers: {} };
    child.outputSchema = { type: "object", properties: { risk: { type: "string" } }, required: ["risk"] }; child.outputBindings = { risk: stateBinding("/risk") };
    child.nodes.splice(1, 0, fixture({ ...createAuthoringNode("core.function", "inspect"), label: "评估风险（演示）", inputs: { order_id: stateBinding("/order_id") } }, { risk: "低风险（演示值）" }, { risk: "/risk" })); child.transitions = [edge("start", "inspect"), edge("inspect", "end")];
    const risk = createAuthoringNode("core.subgraph", "risk"); risk.label = "风险检查子图"; risk.config.graph = child as unknown as JsonValue; risk.inputs = { order_id: stateBinding("/order_id") }; risk.writes = { risk: "/risk" };
    const join = createAuthoringNode("control.join", "join"); join.config.waitFor = ["stock", "risk"];
    const route = createNodeV2("core.router", "route"); route.config = { cases: [{ id: "approved", priority: 1, predicate: { op: "eq", left: stateBinding("/approved"), right: { source: "literal", value: true } } }], defaultOutlet: "default" };
    graph.nodes = [createNodeV2("core.start", "start"), request("request", "提供订单信息", "order_id"), createAuthoringNode("control.fork", "parallel"), fixture({ ...createNodeV2("core.tool", "stock"), label: "查询库存（演示）", inputs: { order_id: stateBinding("/order_id") } }, { stock: "库存充足（演示值）" }, { stock: "/stock" }), risk, join, request("review", "确认处理建议", "approved", "boolean"), route, fixture({ ...createNodeV2("core.tool", "execute"), label: "生成回执（演示）" }, { receipt: "DEMO-001（未创建真实订单）" }, { receipt: "/receipt" }), createNodeV2("core.end", "end")];
    graph.transitions = [edge("start", "request"), edge("request", "parallel"), edge("parallel", "stock", "branch_1"), edge("parallel", "risk", "branch_2"), edge("stock", "join"), edge("risk", "join"), edge("join", "review"), edge("review", "route"), edge("route", "execute", "approved"), edge("route", "end", "default"), edge("execute", "end")];
    graph.state = { schema: { type: "object", properties: { order_id: { type: "string" }, stock: { type: "string" }, risk: { type: "string" }, approved: { type: "boolean" }, receipt: { type: "string" } } }, initial: { order_id: "", stock: "", risk: "", approved: false, receipt: "" }, inputBindings: {}, reducers: {} };
    graph.outputSchema = { type: "object", properties: { receipt: { type: "string" } } }; graph.outputBindings = { receipt: stateBinding("/receipt") };
    const editor = createEditorV2(graph); editor.nodes = { start: { x: 20, y: 250 }, request: { x: 150, y: 230 }, parallel: { x: 390, y: 230 }, stock: { x: 630, y: 100 }, risk: { x: 630, y: 390 }, join: { x: 900, y: 230 }, review: { x: 1140, y: 230 }, route: { x: 1380, y: 230 }, execute: { x: 1620, y: 100 }, end: { x: 1870, y: 250 } };
    return { definition: graph, editor };
  }
  const send = createAuthoringNode("control.send", "send"); send.config = { items: "/items", target: "summarize", itemKey: "item", concurrency: 3 };
  const summarize = fixture({ ...createAuthoringNode("core.function", "summarize"), label: "摘要单项资料（演示）" }, { results: ["单项摘要示例：接入模型后返回真实摘要。"] }, { results: "/results" });
  graph.nodes = [createNodeV2("core.start", "start"), request("prepare", "提供待摘要资料", "items", "array"), send, summarize, createNodeV2("core.end", "end")];
  graph.transitions = [edge("start", "prepare"), edge("prepare", "send"), edge("send", "end"), edge("summarize", "end")];
  graph.state = { schema: { type: "object", properties: { items: { type: "array", items: { type: "string" } }, results: { type: "array", items: { type: "string" } } } }, initial: { items: [], results: [] }, inputBindings: {}, reducers: { results: { name: "append", version: 1 } } };
  graph.outputSchema = { type: "object", properties: { results: { type: "array", items: { type: "string" } } } }; graph.outputBindings = { results: stateBinding("/results") };
  const editor = createEditorV2(graph); editor.nodes = { start: { x: 20, y: 230 }, prepare: { x: 150, y: 210 }, send: { x: 400, y: 210 }, summarize: { x: 660, y: 420 }, end: { x: 910, y: 230 } };
  return { definition: graph, editor };
}
export function liveQuestionExample(base: WorkflowDefinitionV2, providerRef: string, modelRef: string): WorkflowDocumentV2 {
  const graph = withModelState({ ...createWorkflowV2(base.name), workflowId: base.workflowId, revision: base.revision, description: "真实模型问答：运行到构建用户消息节点时填写问题，再由已配置的模型回答。" });
  graph.state.schema.properties = { ...(graph.state.schema.properties as Record<string,JsonValue>), question: { type: "string", title: "你的问题" } };
  graph.state.initial.question = ""; graph.state.reducers.question = { name: "replace", version: 1 };
  const prepare = createNodeV2("core.transform", "prepare"); prepare.label = "构建用户消息";
  prepare.config = { operationRef: "core.message", operationVersion: 1, authoring: { interrupt: { title: "你想问什么？", schema: { type: "object", properties: { question: { type: "string", title: "你的问题", description: "填写你希望模型回答的问题。提交后会继续调用模型。", minLength: 1 } }, required: ["question"], additionalProperties: false }, resumeWrites: { question: "question" } } } };
  prepare.inputs = { text: stateBinding("/question") }; prepare.writes = { messages: "/messages" };
  const model = createNodeV2("core.llm", "model"); model.config = { ...model.config, providerRef, modelRef };
  graph.nodes = [createNodeV2("core.start", "start"), prepare, model, createNodeV2("core.end", "end")];
  graph.transitions = [edge("start", "prepare"), edge("prepare", "model"), edge("model", "end")];
  graph.outputSchema = { type: "object", properties: { messages: { type: "array", items: { type: "object" } } }, required: ["messages"], additionalProperties: false };
  graph.outputBindings = { messages: stateBinding("/messages") };
  graph.policy.authoring = { checkpoint: "superstep", waitTimeoutMs: 86400000, recursionLimit: 50 };
  const editor = createEditorV2(graph); editor.nodes = { start: { x: 40, y: 120 }, prepare: { x: 280, y: 120 }, model: { x: 620, y: 120 }, end: { x: 960, y: 120 } };
  return { definition: graph, editor };
}
