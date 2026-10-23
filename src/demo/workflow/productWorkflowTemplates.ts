import { createEditorV2, createNodeV2, createWorkflowV2, stateBinding, workflowPolicy } from "@/features/workflow/domain/v2/factory";
import type { Binding, JsonSchema, JsonValue, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowNodeV2 } from "@/features/workflow/domain/v2/types";

const obj = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const messagesSchema: JsonSchema = { type: "object", properties: { messages: { type: "array", items: { type: "object" } } }, required: ["messages"], additionalProperties: false };
const text = (value: string): Binding => ({ source: "literal", value });
const edge = (from: string, to: string) => ({ id: `${from}:next:${to}`, from, to, outlet: "next" });

/**
 * Tool nodes are typeVersion 2: one input per tool argument. These templates start unbound
 * (`toolRef: ""`) because the public JSON tool is created by the user; no Schema is known here, so
 * the parameter table starts empty and M11 fills it from the selected tool's inputSchema.
 */
function toolField(id: string, label: string, stateField: string, outputPath: string, inputs: Record<string, Binding> = {}): WorkflowNodeV2 {
  const node = createNodeV2("core.tool", id);
  return { ...node, label, typeVersion: 2, config: { toolRef: "", contractDigest: "" }, inputs, writes: { [stateField]: outputPath } };
}

function normalize(id: string, label: string, code: string, inputs: Record<string, Binding>, inputProperties: Record<string, JsonSchema>): WorkflowNodeV2 {
  const node = createNodeV2("core.function", id);
  return { ...node, label, config: { implementation: "code", language: "python", code, inputSchema: obj(inputProperties), outputSchema: messagesSchema }, inputs, writes: { messages: "/messages" } };
}

/**
 * Model nodes are typeVersion 2: the transcript is read through the reserved `history` binding, and
 * `config.prompt` carries the instruction. Prompt segments stay declarative (`text` / `param`);
 * the previous normalize function only supplies data, so the instruction lives here exactly once.
 */
function model(id: string, label: string, system: string, instruction: string): WorkflowNodeV2 {
  const node = createNodeV2("core.llm", id);
  return {
    ...node,
    label,
    typeVersion: 2,
    config: {
      providerRef: "",
      modelRef: "",
      modelParameters: {},
      allowedToolRefs: [],
      prompt: {
        system: [{ type: "text", text: system }],
        messages: [{ role: "user", content: [{ type: "text", text: instruction }] }],
      },
    },
    inputs: { history: stateBinding("/messages") },
    writes: { messages: "/messages" },
  };
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
  definition.policy = { ...workflowPolicy, timeoutMs: 180000, nodeTimeoutMs: 120000, maxOutputTokens: 3072 };
  return { definition, editor: createEditorV2(definition) };
}

const hnCode = `def process(input, context):
    hits = input.get("hn") or []
    lines = []
    for item in hits[:4]:
        title = item.get("title") or item.get("story_title") or ""
        url = item.get("url") or item.get("story_url") or ""
        if title:
            lines.append("- " + title + " " + url)
    npm = input.get("npm") or {}
    package = str(npm.get("name") or "npm package")
    version = str(npm.get("version") or "")
    se = input.get("se") or []
    seLines = []
    for item in se[:3]:
        title = str(item.get("title") or "")
        link = str(item.get("link") or "")
        if title:
            seLines.append("- " + title + " " + link)
    text = "Hacker News：\\n" + "\\n".join(lines) + "\\n"
    text += "StackExchange：\\n" + "\\n".join(seLines) + "\\n"
    text += "npm：" + package + " " + version
    return {"messages": [{"id": "tech-brief", "role": "user", "content": [{"type": "text", "text": text}]}]}
`;
const dependencyCode = `def process(input, context):
    stats = input.get("pypi") or {}
    data = stats.get("data") or {}
    npm = input.get("npm") or {}
    text = "PyPI langgraph 最近下载：日 " + str(data.get("last_day")) + " / 月 " + str(data.get("last_month")) + "\\n"
    text += "npm zod：" + str(npm.get("name") or "") + " " + str(npm.get("version") or "")
    return {"messages": [{"id": "dependency-brief", "role": "user", "content": [{"type": "text", "text": text}]}]}
`;
const triageCode = `def process(input, context):
    hits = input.get("hn") or []
    lines = []
    for item in hits[:5]:
        title = item.get("title") or item.get("story_title") or ""
        url = item.get("url") or item.get("story_url") or ""
        if title:
            lines.append("- " + title + " " + url)
    text = "Hacker News 社区问题：\\n" + "\\n".join(lines)
    return {"messages": [{"id": "triage-brief", "role": "user", "content": [{"type": "text", "text": text}]}]}
`;

function retrievalState(values: Record<string, JsonSchema>, initial: Record<string, JsonValue>) {
  return {
    schema: obj({ ...values, messages: { type: "array", items: { type: "object" } } }),
    initial: { ...initial, messages: [] },
    inputBindings: {},
    reducers: {},
  };
}

/** Explicit Local seed drafts; Hosted publication remains gated on scenario acceptance. */
export function productWorkflowTemplates(): WorkflowDocumentV2[] {
  return [
    build({
      id: "product-tech-brief",
      name: "技术周报简报",
      description: "检索 Hacker News、StackExchange 与 npm 的公开 JSON，由隔离函数整理后交给模型生成技术简报。工具连接需返回 JSON 对象；Wikipedia/arXiv 适配仍待补。",
      nodes: [
        toolField("hn", "检索 Hacker News", "hnHits", "/result/hits"),
        toolField("se", "检索 StackExchange", "seItems", "/result/items"),
        toolField("npm", "读取 npm 包信息", "npmInfo", "/result"),
        normalize("combine", "整理公开资料", hnCode, { hn: stateBinding("/hnHits"), se: stateBinding("/seItems"), npm: stateBinding("/npmInfo") }, {
          hn: { type: "array", items: { type: "object" } },
          se: { type: "array", items: { type: "object" } },
          npm: { type: "object" },
        }),
        model("write", "生成技术简报", "你是严谨的中文技术编辑，只依据提供的公开资料写作，必须引用来源，不编造事实。", "请用不超过 250 字的中文技术简报概括以上公开资料，必须引用来源。"),
      ],
      state: retrievalState({
        hnHits: { type: "array", items: { type: "object" } },
        seItems: { type: "array", items: { type: "object" } },
        npmInfo: { type: "object" },
      }, { hnHits: [], seItems: [], npmInfo: {} }),
      requiredCapabilities: ["llm", "http", "function"],
    }),
    build({
      id: "product-dependency-health",
      name: "依赖健康检查",
      description: "读取 PyPI 下载统计与 npm 公开 JSON 元数据，由隔离函数整理后交给模型解释版本、使用与维护风险。工具连接需返回 JSON 对象。",
      nodes: [
        toolField("pypi", "读取 PyPI 下载统计", "pypiStats", "/result"),
        toolField("npm", "读取 npm 元数据", "npmInfo", "/result"),
        normalize("combine", "整理依赖元数据", dependencyCode, { pypi: stateBinding("/pypiStats"), npm: stateBinding("/npmInfo") }, {
          pypi: { type: "object" },
          npm: { type: "object" },
        }),
        model("assess", "评估依赖风险", "你是依赖维护顾问，只依据提供的公开数据解释使用、版本与升级风险。", "请用不超过 200 字、3 条要点解释以上依赖的使用、版本与升级风险。"),
      ],
      state: retrievalState({
        pypiStats: { type: "object" },
        npmInfo: { type: "object" },
      }, { pypiStats: {}, npmInfo: {} }),
      requiredCapabilities: ["llm", "http", "function"],
    }),
    build({
      id: "product-community-triage",
      name: "社区问题分流",
      description: "检索公开 Hacker News 结果，由隔离函数整理后交给模型归纳问题并给出回应草稿。工具连接需返回 JSON 对象。",
      nodes: [
        toolField("hn", "检索社区问题", "hnHits", "/result/hits"),
        normalize("combine", "整理社区问题", triageCode, { hn: stateBinding("/hnHits") }, {
          hn: { type: "array", items: { type: "object" } },
        }),
        model("triage", "归纳并起草回应", "你是社区运营助理，只依据提供的公开资料归纳问题并起草回应。", "请用不超过 200 字给出社区问题归纳、分流建议与回应草稿三部分，并引用来源。"),
      ],
      state: retrievalState({ hnHits: { type: "array", items: { type: "object" } } }, { hnHits: [] }),
      requiredCapabilities: ["llm", "http", "function"],
    }),
    build({
      id: "product-content-review",
      name: "产品更新事实核对",
      description: "核对一段产品更新草稿中的事实主张，标出缺少依据的说法，并给出可发布版本。",
      nodes: [
        (() => {
          const node = createNodeV2("core.transform", "prompt");
          return { ...node, label: "准备核对请求", config: { operationRef: "core.message", operationVersion: 1 }, inputs: { text: text("本次更新优化了工作流画布，支持 12 种新节点，并已提升 300% 性能。"), role: text("user") }, writes: { messages: "/messages" } };
        })(),
        model("review", "核对事实主张", "你是事实核对编辑，只标出有依据与缺少依据的主张，不替产品补充未提供的证据。", "请核对以上产品更新草稿中的事实主张，逐条标出有依据与缺少依据的说法，并给出可发布版本。"),
      ],
      state: retrievalState({}, {}),
      requiredCapabilities: ["llm"],
    }),
  ];
}
