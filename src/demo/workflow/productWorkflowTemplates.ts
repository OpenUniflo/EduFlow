import { createEditorV2, createNodeV2, createWorkflowV2, stateBinding, workflowPolicy } from "@/features/workflow/domain/v2/factory";
import type { Binding, JsonSchema, JsonValue, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowNodeV2 } from "@/features/workflow/domain/v2/types";

const obj = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const messagesSchema: JsonSchema = { type: "object", properties: { messages: { type: "array", items: { type: "object" } } }, required: ["messages"], additionalProperties: false };
const text = (value: string): Binding => ({ source: "literal", value });
const edge = (from: string, to: string) => ({ id: `${from}:next:${to}`, from, to, outlet: "next" });

/** The HTTP adapter wraps the parsed response as {"result": <json>}; each template writes a concrete field out of it. */
function toolField(id: string, label: string, stateField: string, outputPath: string): WorkflowNodeV2 {
  const node = createNodeV2("core.tool", id);
  return { ...node, label, config: { toolRef: "", contractDigest: "" }, inputs: { arguments: { source: "literal", value: {} } }, writes: { [stateField]: outputPath } };
}

function normalize(id: string, label: string, code: string, inputs: Record<string, Binding>, inputProperties: Record<string, JsonSchema>): WorkflowNodeV2 {
  const node = createNodeV2("core.function", id);
  return { ...node, label, config: { implementation: "code", language: "python", code, inputSchema: obj(inputProperties), outputSchema: messagesSchema }, inputs, writes: { messages: "/messages" } };
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

const hnCode = `def process(input, context):
    hits = input.get("hn") or []
    lines = []
    for item in hits[:6]:
        title = item.get("title") or item.get("story_title") or ""
        url = item.get("url") or item.get("story_url") or ""
        if title:
            lines.append("- " + title + " " + url)
    wiki = str(input.get("wiki") or "")[:1500]
    npm = input.get("npm") or {}
    package = str(npm.get("name") or "npm package")
    version = str(npm.get("version") or "")
    text = "请根据以下公开资料写一段中文技术简报，必须引用来源：\\n"
    text += "Hacker News：\\n" + "\\n".join(lines) + "\\n"
    text += "Wikipedia：" + wiki + "\\n"
    text += "npm：" + package + " " + version
    return {"messages": [{"id": "tech-brief", "role": "user", "content": [{"type": "text", "text": text}]}]}
`;
const dependencyCode = `def process(input, context):
    pypi = input.get("pypi") or {}
    npm = input.get("npm") or {}
    info = pypi.get("info") or {}
    text = "请根据以下公开元数据解释依赖版本、维护状态与升级风险：\\n"
    text += "PyPI：" + str(info.get("name") or "") + " " + str(info.get("version") or "") + "\\n"
    text += "npm：" + str(npm.get("name") or "") + " " + str(npm.get("version") or "")
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
    text = "请归纳以下社区问题并给出可执行分流建议，引用来源：\\n" + "\\n".join(lines)
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
      description: "检索 Hacker News、Wikipedia 与 npm 的公开 JSON，由隔离函数整理后交给模型生成技术简报。工具连接需返回 JSON 对象；arXiv XML 适配待补。",
      nodes: [
        toolField("hn", "检索 Hacker News", "hnHits", "/result/hits"),
        toolField("wiki", "读取 Wikipedia 摘要", "wikiExtract", "/result/extract"),
        toolField("npm", "读取 npm 包信息", "npmInfo", "/result"),
        normalize("combine", "整理公开资料", hnCode, { hn: stateBinding("/hnHits"), wiki: stateBinding("/wikiExtract"), npm: stateBinding("/npmInfo") }, {
          hn: { type: "array", items: { type: "object" } },
          wiki: { type: "string" },
          npm: { type: "object" },
        }),
        model("write", "生成技术简报"),
      ],
      state: retrievalState({
        hnHits: { type: "array", items: { type: "object" } },
        wikiExtract: { type: "string" },
        npmInfo: { type: "object" },
      }, { hnHits: [], wikiExtract: "", npmInfo: {} }),
      requiredCapabilities: ["llm", "http", "function"],
    }),
    build({
      id: "product-dependency-health",
      name: "依赖健康检查",
      description: "读取 PyPI 与 npm 的公开 JSON 元数据，由隔离函数整理后交给模型解释版本与维护风险。工具连接需返回 JSON 对象。",
      nodes: [
        toolField("pypi", "读取 PyPI 元数据", "pypiInfo", "/result"),
        toolField("npm", "读取 npm 元数据", "npmInfo", "/result"),
        normalize("combine", "整理依赖元数据", dependencyCode, { pypi: stateBinding("/pypiInfo"), npm: stateBinding("/npmInfo") }, {
          pypi: { type: "object" },
          npm: { type: "object" },
        }),
        model("assess", "评估依赖风险"),
      ],
      state: retrievalState({
        pypiInfo: { type: "object" },
        npmInfo: { type: "object" },
      }, { pypiInfo: {}, npmInfo: {} }),
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
        model("triage", "归纳并起草回应"),
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
          return { ...node, label: "准备核对请求", config: { operationRef: "core.message", operationVersion: 1 }, inputs: { text: text("请核对这段产品更新：本次更新优化了工作流画布，支持 12 种新节点，并已提升 300% 性能。请逐条标出有依据与缺少依据的主张，并给出可发布版本。"), role: text("user") }, writes: { messages: "/messages" } };
        })(),
        model("review", "核对事实主张"),
      ],
      state: retrievalState({}, {}),
      requiredCapabilities: ["llm"],
    }),
  ];
}
