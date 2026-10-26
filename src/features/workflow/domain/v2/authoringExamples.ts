import { withModelState } from "./messageAuthoring";
import { createEditorV2, createNodeV2, createWorkflowV2, stateBinding } from "./factory";
import type { WorkflowDefinitionV2, WorkflowDocumentV2 } from "./types";
const edge = (from: string, to: string, outlet = "next") => ({ id: `${from}:${outlet}:${to}`, from, to, outlet });
/** Real model Q&A starter used by the workspace seed. No preview or fixture output. */
export function liveQuestionExample(base: WorkflowDefinitionV2, providerRef: string, modelRef: string): WorkflowDocumentV2 {
  const graph = withModelState({ ...createWorkflowV2(base.name), workflowId: base.workflowId, revision: base.revision, description: "真实模型问答：运行到构建用户消息节点时填写问题，再由已配置的模型回答。" });
  graph.state.schema.properties = { ...(graph.state.schema.properties as Record<string, import("./types").JsonValue>), question: { type: "string", title: "你的问题" } };
  graph.state.initial.question = ""; graph.state.reducers.question = { name: "replace", version: 1 };
  const prepare = createNodeV2("core.transform", "prepare"); prepare.label = "构建用户消息";
  prepare.config = { operationRef: "core.message", operationVersion: 1, authoring: { interrupt: { title: "你想问什么？", schema: { type: "object", properties: { question: { type: "string", title: "你的问题", description: "填写你希望模型回答的问题。提交后会继续调用模型。", minLength: 1 } }, required: ["question"], additionalProperties: false }, resumeWrites: { question: "question" } } } };
  prepare.inputs = { text: stateBinding("/question") }; prepare.writes = { messages: "/messages" };
  const model = createNodeV2("core.llm", "model"); model.label = "回答用户问题";
  model.config = {
    providerRef, modelRef, modelParameters: {}, allowedToolRefs: [],
    prompt: {
      system: [{ type: "text", text: "你是 EduFlow 的通用学习助理，请直接、准确地回答用户的问题。" }],
      messages: [{ role: "user", content: [{ type: "text", text: "请回答用户提出的问题。" }] }],
    },
  };
  model.inputs = { history: stateBinding("/messages") };
  model.writes = { messages: "/messages" };
  graph.nodes = [createNodeV2("core.start", "start"), prepare, model, createNodeV2("core.end", "end")];
  graph.transitions = [edge("start", "prepare"), edge("prepare", "model"), edge("model", "end")];
  graph.outputSchema = { type: "object", properties: { messages: { type: "array", items: { type: "object" } } }, required: ["messages"], additionalProperties: false };
  graph.outputBindings = { messages: stateBinding("/messages") };
  graph.policy.authoring = { checkpoint: "superstep", waitTimeoutMs: 86400000, recursionLimit: 50 };
  const editor = createEditorV2(graph); editor.nodes = { start: { x: 40, y: 120 }, prepare: { x: 280, y: 120 }, model: { x: 620, y: 120 }, end: { x: 960, y: 120 } };
  return { definition: graph, editor };
}
