import { createEditorV2, createNodeV2, createWorkflowV2, stateBinding, workflowPolicy } from "@/features/workflow/domain/v2/factory";
import type { Binding, JsonSchema, JsonValue, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowNodeV2 } from "@/features/workflow/domain/v2/types";

const obj = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const text = (value: string): Binding => ({ source: "literal", value });
const edge = (from: string, to: string) => ({ id: `${from}:next:${to}`, from, to, outlet: "next" });

function tool(id: string, label: string, argumentsValue: Record<string, JsonValue>, writeTo: string): WorkflowNodeV2 {
  const node = createNodeV2("core.tool", id);
  return { ...node, label, config: { toolRef: "", contractDigest: "" }, inputs: { arguments: { source: "literal", value: argumentsValue } }, writes: { [writeTo.slice(1)]: "/result" } };
}

function concat(id: string, label: string, resultsField: string): WorkflowNodeV2 {
  const node = createNodeV2("core.transform", id);
  return { ...node, label, config: { operationRef: "core.concat", operationVersion: 1 }, inputs: { values: stateBinding(`/${resultsField}`), separator: text("\n\n") }, writes: { retrieved: "/value" } };
}

function message(id: string, label: string, input: Binding): WorkflowNodeV2 {
  const node = createNodeV2("core.transform", id);
  return { ...node, label, config: { operationRef: "core.message", operationVersion: 1 }, inputs: { text: input, role: text("user") }, writes: { messages: "/messages" } };
}

function model(id: string, label: string): WorkflowNodeV2 {
  return { ...createNodeV2("core.llm", id), label, config: { providerRef: "", modelRef: "", modelParameters: {}, allowedToolRefs: [] }, writes: { messages: "/messages" } };
}

type Spec = {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNodeV2[];
  state: WorkflowDefinitionV2["state"];
  requiredCapabilities: string[];
};

function build(spec: Spec): WorkflowDocumentV2 {
  const definition = createWorkflowV2(spec.name);
  definition.workflowId = spec.id;
  definition.description = spec.description;
  definition.inputSchema = obj({});
  definition.outputSchema = obj({ messages: { type: "array", items: { type: "object" } } });
  definition.state = spec.state;
  const start = createNodeV2("core.start", "start");
  const end = createNodeV2("core.end", "end");
  const chain = [start, ...spec.nodes, end];
  definition.nodes = chain;
  definition.transitions = chain.slice(0, -1).map((node, index) => edge(node.id, chain[index + 1].id));
  definition.outputBindings = { messages: stateBinding("/messages") };
  definition.requiredCapabilities = spec.requiredCapabilities;
  // Real model calls in Local acceptance exceeded the 30s default; keep a bounded but practical node budget.
  definition.policy = { ...workflowPolicy, timeoutMs: 180000, nodeTimeoutMs: 120000 };
  return { definition, editor: createEditorV2(definition) };
}

function retrievalState() {
  return {
    schema: obj({ results: { type: "array", items: { type: "string" } }, retrieved: { type: "string" }, messages: { type: "array", items: { type: "object" } } }),
    initial: { results: [], retrieved: "", messages: [] },
    inputBindings: {},
    reducers: { results: { name: "append" as const, version: 1 as const } },
  };
}

/** Explicit Local seed drafts; Hosted publication remains gated on scenario acceptance. */
export function productWorkflowTemplates(): WorkflowDocumentV2[] {
  return [
    build({
      id: "product-tech-brief",
      name: "技术周报简报",
      description: "检索 Hacker News、arXiv 与 Wikipedia，合并公开结果并由模型生成技术简报。工具连接需返回 result 字符串。",
      nodes: [
        tool("hn", "检索 Hacker News", { query: "AI agents", tags: "story", hits: 10 }, "/results"),
        tool("arxiv", "检索 arXiv", { search_query: "all:workflow orchestration", max_results: 5 }, "/results"),
        tool("wiki", "检索 Wikipedia", { query: "workflow orchestration", limit: 3 }, "/results"),
        concat("combine", "合并公开结果", "results"),
        message("prompt", "构造简报请求", stateBinding("/retrieved")),
        model("write", "生成技术简报"),
      ],
      state: retrievalState(),
      requiredCapabilities: ["llm", "http"],
    }),
    build({
      id: "product-dependency-health",
      name: "依赖健康检查",
      description: "读取 PyPI 与 npm 的公开元数据，合并后由模型解释版本与维护风险。工具连接需返回 result 字符串。",
      nodes: [
        tool("pypi", "读取 PyPI 元数据", { package: "langgraph" }, "/results"),
        tool("npm", "读取 npm 元数据", { package: "zod" }, "/results"),
        concat("combine", "合并依赖元数据", "results"),
        message("prompt", "构造风险评估请求", stateBinding("/retrieved")),
        model("assess", "评估依赖风险"),
      ],
      state: retrievalState(),
      requiredCapabilities: ["llm", "http"],
    }),
    build({
      id: "product-community-triage",
      name: "社区问题分流",
      description: "检索一条公开 Hacker News 问题，由模型归纳问题并给出回应草稿。工具连接需返回 result 字符串。",
      nodes: [
        tool("hn", "检索社区问题", { query: "How do you orchestrate AI agents?", hits: 5 }, "/retrieved"),
        message("prompt", "构造分流请求", stateBinding("/retrieved")),
        model("triage", "归纳并起草回应"),
      ],
      state: {
        schema: obj({ retrieved: { type: "string" }, messages: { type: "array", items: { type: "object" } } }),
        initial: { retrieved: "", messages: [] },
        inputBindings: {},
        reducers: {},
      },
      requiredCapabilities: ["llm", "http"],
    }),
    build({
      id: "product-content-review",
      name: "产品更新事实核对",
      description: "核对一段产品更新草稿中的事实主张，标出缺少依据的说法，并给出可发布版本。",
      nodes: [
        message("prompt", "准备核对请求", text("请核对这段产品更新：本次更新优化了工作流画布，支持 12 种新节点，并已提升 300% 性能。请逐条标出有依据与缺少依据的主张，并给出可发布版本。")),
        model("review", "核对事实主张"),
      ],
      state: {
        schema: obj({ messages: { type: "array", items: { type: "object" } } }),
        initial: { messages: [] },
        inputBindings: {},
        reducers: {},
      },
      requiredCapabilities: ["llm"],
    }),
  ];
}
