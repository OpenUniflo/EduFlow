import { createEditorV2, createNodeV2, stateBinding, workflowPolicy } from "./factory";
import type { Binding, JsonSchema, JsonValue, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowNodeV2, WorkflowTool } from "./types";

/**
 * Product-owned starting flows. They are not Demo fixtures and never import src/demo:
 * the canvas writes them locally, and the user's first save persists them as a normal Workflow.
 */
export type StartingTemplateKind = "assistant" | "search" | "triage";

export type StartingTemplateCard = {
  kind: StartingTemplateKind;
  title: string;
  chain: string;
  description: string;
};

export const startingTemplateCards: StartingTemplateCard[] = [
  { kind: "assistant", title: "问答助手", chain: "模型 → 结束", description: "输入一个问题，由模型直接回答。" },
  { kind: "search", title: "先搜索再总结", chain: "工具 → 模型 → 结束", description: "先搜索相关讨论，再让模型归纳。" },
  { kind: "triage", title: "按问题类型分流", chain: "模型 → 条件路由 → …", description: "按问题类型走不同的处理分支。" },
];

export type StartingModelOptions = {
  providerRef?: string;
  modelRef?: string;
  /** Built-in real HN search tool as exposed by the execution environment. */
  hnTool?: Pick<WorkflowTool, "ref" | "contractDigest">;
  /**
   * Starting flows answer ordinary questions, so DeepSeek flash/chat explicitly
   * disables provider-side thinking. Otherwise reasoning tokens can consume the
   * whole node budget before the first visible character. Users can re-enable it
   * on the model node afterwards.
   */
  disableReasoning?: boolean;
};

const object = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const edge = (from: string, to: string, outlet = "next") => ({ id: `${from}:${outlet}:${to}`, from, to, outlet });
const text = (value: string): JsonValue => ({ type: "text", text: value });
const param = (name: string, format?: "text" | "json"): JsonValue => ({ type: "param", name, ...(format ? { format } : {}) });
const prompt = (system: string, message: JsonValue[]) => ({ system: [text(system)], messages: [{ role: "user", content: message }] });
const inputQuestion: JsonSchema = { type: "string", title: "你的问题", description: "填写你希望处理的问题。", minLength: 1 };

function modelParameters(options: StartingModelOptions): Record<string, JsonValue> {
  if (options.disableReasoning === false) return {};
  return /^deepseek-(flash|chat)/i.test(options.modelRef ?? "") ? { thinking: { type: "disabled" } } : {};
}

function modelNode(id: string, label: string, options: StartingModelOptions, configPrompt: JsonValue, inputs: Record<string, Binding>, writes: Record<string, string>): WorkflowNodeV2 {
  const node = createNodeV2("core.llm", id);
  return {
    ...node,
    label,
    typeVersion: 2,
    config: {
      providerRef: options.providerRef ?? "",
      modelRef: options.modelRef ?? "",
      modelParameters: modelParameters(options),
      allowedToolRefs: [],
      prompt: configPrompt,
    },
    inputs,
    writes,
  };
}

function toolNode(options: StartingModelOptions): WorkflowNodeV2 {
  const node = createNodeV2("core.tool", "search");
  return {
    ...node,
    label: "搜索 Hacker News",
    typeVersion: 2,
    config: { toolRef: options.hnTool?.ref ?? "hn_search", contractDigest: options.hnTool?.contractDigest ?? "" },
    inputs: { query: { source: "input", pointer: "/question", onMissing: { mode: "error" } } },
    writes: { hits: "/result/hits" },
  };
}

function finish(base: WorkflowDefinitionV2, description: string, nodes: WorkflowNodeV2[], transitions: WorkflowDefinitionV2["transitions"], state: WorkflowDefinitionV2["state"], inputSchema: JsonSchema, outputSchema: JsonSchema, outputBindings: Record<string, Binding>, positions: Record<string, { x: number; y: number }>): WorkflowDocumentV2 {
  const graph: WorkflowDefinitionV2 = {
    schemaVersion: "2.0",
    workflowId: base.workflowId,
    revision: base.revision,
    name: base.name,
    description,
    inputSchema,
    outputSchema,
    state,
    entryNodeId: "start",
    nodes,
    transitions,
    outputBindings,
    // 2048 tokens is enough for a bounded 250–300 Chinese character answer and
    // leaves headroom for short code blocks without making truncation invisible.
    policy: { ...workflowPolicy, ...base.policy, timeoutMs: 180000, nodeTimeoutMs: 120000, maxOutputTokens: 2048 },
    requiredCapabilities: [],
  };
  const editor = createEditorV2(graph);
  editor.nodes = positions;
  return { definition: graph, editor };
}

function commonState(): WorkflowDefinitionV2["state"] {
  return {
    schema: object({ question: { type: "string", title: "你的问题" }, answer: { type: "string", title: "回答" }, messages: { type: "array", items: { type: "object" } } }),
    initial: { question: "", answer: "", messages: [] },
    inputBindings: { question: { source: "input", pointer: "/question", onMissing: { mode: "error" } } },
    reducers: { messages: { name: "messages", version: 1 }, answer: { name: "replace", version: 1 }, question: { name: "replace", version: 1 } },
  };
}

/** Builds one complete, runnable starting flow around the current Workflow identity. */
export function createStartingTemplate(kind: StartingTemplateKind, base: WorkflowDefinitionV2, options: StartingModelOptions = {}): WorkflowDocumentV2 {
  const start = createNodeV2("core.start", "start");
  const end = createNodeV2("core.end", "end");
  const inputSchema = object({ question: inputQuestion });
  const outputSchema = object({ answer: { type: "string", title: "回答" } });
  const outputBindings = { answer: stateBinding("/answer") };
  if (kind === "assistant") {
    const model = modelNode("answer", "回答用户问题", options, prompt("你是 EduFlow 的通用学习助理，请用中文直接、准确地回答问题，控制在 300 字以内。", [text("请回答这个问题："), param("question")]), { question: { source: "input", pointer: "/question", onMissing: { mode: "error" } } }, { answer: "/text", messages: "/messages" });
    return finish(base, "输入一个问题，由已连接的模型直接回答。", [start, model, end], [edge("start", "answer"), edge("answer", "end")], commonState(), inputSchema, outputSchema, outputBindings, { start: { x: 80, y: 160 }, answer: { x: 380, y: 140 }, end: { x: 760, y: 160 } });
  }
  if (kind === "search") {
    // Public search indexes match literal tokens. A model node turns any natural
    // language question into keywords; the tool never rewrites user prose.
    const extract = modelNode("keywords", "提取搜索关键词", options, prompt("你是搜索助手。只输出 2–3 个核心英文名词作为搜索关键词，用空格分隔。不要年份、形容词（如 trending、popular、best）、解释或引号。", [text("请把这个问题转成英文搜索关键词："), param("question")]), { question: { source: "input", pointer: "/question", onMissing: { mode: "error" } } }, { keywords: "/text" });
    const search = toolNode(options);
    search.inputs = { query: stateBinding("/keywords") };
    const model = modelNode("answer", "归纳搜索结果", options, prompt("你是严谨的中文助理，只依据搜索结果归纳，不编造事实。请用中文回答，控制在 250 字以内。", [text("用户的问题："), param("question"), text("\n\nHacker News 搜索结果（JSON，每条含标题、链接、分数、评论数和摘要）："), param("hits", "json"), text("\n如果搜索结果为空，直接说明没有找到相关讨论；否则综合标题、链接、分数、评论数和摘要，用不超过 250 字总结相关讨论。")]), { question: stateBinding("/question"), hits: stateBinding("/hits") }, { answer: "/text", messages: "/messages" });
    const state = commonState();
    state.schema.properties = { ...(state.schema.properties as Record<string, JsonSchema>), keywords: { type: "string", title: "搜索关键词" }, hits: { type: "array", items: { type: "object" } } };
    state.initial.keywords = "";
    state.initial.hits = [];
    state.reducers.keywords = { name: "replace", version: 1 };
    state.reducers.hits = { name: "replace", version: 1 };
    return finish(base, "先由模型提取搜索关键词，再用真实 Hacker News 搜索公开讨论，最后归纳。", [start, extract, search, model, end], [edge("start", "keywords"), edge("keywords", "search"), edge("search", "answer"), edge("answer", "end")], state, inputSchema, outputSchema, outputBindings, { start: { x: 40, y: 170 }, keywords: { x: 280, y: 140 }, search: { x: 540, y: 140 }, answer: { x: 820, y: 140 }, end: { x: 1120, y: 170 } });
  }
  const classify = modelNode("classify", "判断问题类型", options, prompt("你只输出一个词，不要解释，不要标点。", [text("请判断这个问题的类型，只输出「学习」「技术」或「其他」之一："), param("question")]), { question: { source: "input", pointer: "/question", onMissing: { mode: "error" } } }, { category: "/text" });
  const route = createNodeV2("core.router", "route");
  route.label = "按问题类型分流";
  route.config = {
    cases: [
      { id: "learning", label: "学习", priority: 1, predicate: { op: "eq", left: stateBinding("/category"), right: { source: "literal", value: "学习" } } },
      { id: "technical", label: "技术", priority: 2, predicate: { op: "eq", left: stateBinding("/category"), right: { source: "literal", value: "技术" } } },
    ],
    defaultOutlet: "other",
    defaultLabel: "其他",
  };
  const learning = modelNode("learning", "学习问题回答", options, prompt("你是学习助理，请用中文给出清晰、循序渐进的步骤，控制在 300 字以内。", [text("请回答这个学习问题："), param("question")]), { question: { source: "input", pointer: "/question", onMissing: { mode: "error" } } }, { answer: "/text", messages: "/messages" });
  const technical = modelNode("technical", "技术问题回答", options, prompt("你是技术助理，请用中文给出准确、可执行的回答，并说明前提，控制在 300 字以内。先给结论，再列 3–5 个排查步骤。", [text("请回答这个技术问题："), param("question")]), { question: { source: "input", pointer: "/question", onMissing: { mode: "error" } } }, { answer: "/text", messages: "/messages" });
  const state = commonState();
  state.schema.properties = { ...(state.schema.properties as Record<string, JsonSchema>), category: { type: "string", title: "问题类型" } };
  state.initial.category = "";
  state.reducers.category = { name: "replace", version: 1 };
  return finish(base, "先由模型判断问题类型，再走对应的处理分支。", [start, classify, route, learning, technical, end], [edge("start", "classify"), edge("classify", "route"), edge("route", "learning", "learning"), edge("route", "technical", "technical"), edge("route", "end", "other"), edge("learning", "end"), edge("technical", "end")], state, inputSchema, outputSchema, outputBindings, { start: { x: 40, y: 260 }, classify: { x: 300, y: 250 }, route: { x: 600, y: 260 }, learning: { x: 860, y: 100 }, technical: { x: 860, y: 400 }, end: { x: 1160, y: 260 } });
}
