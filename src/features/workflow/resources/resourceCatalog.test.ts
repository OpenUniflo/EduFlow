import { describe, expect, it } from "vitest";
import type { JsonValue, WorkflowDefinitionV2, WorkflowNodeV2 } from "../domain/v2/types";
import type { CatalogConnection } from "./resourceModel";
import { resolveWorkflowResources } from "./resourceCatalog";

const policy = { timeoutMs: 120000, nodeTimeoutMs: 30000, maxNodeExecutions: 50, maxToolCalls: 10, maxInputBytes: 65536, maxStateBytes: 1048576, maxEventBytes: 65536, maxOutputTokens: 2048, maxAttempts: 1 };

function definition(nodes: WorkflowNodeV2[]): WorkflowDefinitionV2 {
  return {
    schemaVersion: "2.0", workflowId: "workflow", revision: 1, name: "test", description: "",
    inputSchema: { type: "object" }, outputSchema: { type: "object" },
    state: { schema: { type: "object" }, initial: {}, inputBindings: {}, reducers: {} },
    entryNodeId: nodes[0]?.id ?? "start", nodes, transitions: [], outputBindings: {}, policy, requiredCapabilities: [],
  };
}

function node(id: string, label: string, type: string, config: Record<string, JsonValue>): WorkflowNodeV2 {
  return { id, label, type, typeVersion: 1, config, inputs: {}, writes: {} };
}

function connection(ref: string, version: number, content: Record<string, JsonValue>): CatalogConnection {
  return { connectionKey: `p4:owner:${ref}:${version}`, ref, version, disabled: false, hasCredential: true, content };
}

describe("resolved workflow resources", () => {
  it("lists one provider for three model nodes and resolves a referenced older version by ref", () => {
    const resources = resolveWorkflowResources({
      definition: definition([
        node("research", "资料检索", "core.llm", { providerRef: "p4:owner:deepseek:1", modelRef: "deepseek-flash" }),
        node("draft", "初稿", "core.llm", { providerRef: "p4:owner:deepseek:1", modelRef: "deepseek-reasoner" }),
        node("review", "审阅", "core.llm", { providerRef: "p4:owner:deepseek:1", modelRef: "deepseek-flash" }),
      ]),
      connections: [
        connection("deepseek", 1, { type: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-flash"] }),
        connection("deepseek", 2, { type: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-flash", "deepseek-reasoner"] }),
      ],
    });
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      kind: "provider",
      title: "DeepSeek",
      meta: "已启用 2 个模型 · deepseek-flash、deepseek-reasoner",
      usage: "资料检索、初稿、审阅",
      edit: { kind: "provider", mode: "edit", ref: "deepseek" },
    });
  });

  it("lists APIs, inline functions and variables from the same reference scan", () => {
    const input = node("input", "读取主题", "core.llm", { providerRef: "deepseek" });
    input.inputs = { topic: { source: "environment", pointer: "/TOPIC", onMissing: { mode: "error" } } };
    const resources = resolveWorkflowResources({
      definition: definition([
        node("search", "搜索", "core.tool", { toolRef: "hn_search", contractDigest: "d" }),
        node("transform", "整理结果", "core.function", { implementation: "code", language: "javascript", code: "return {}", inputSchema: { type: "object" }, outputSchema: { type: "object" } }),
        input,
      ]),
      tools: [{ ref: "hn_search", name: "Hacker News 搜索", contractDigest: "d", inputSchema: { type: "object", properties: { query: { type: "string" } } } }],
      environment: { environmentRef: "local", environmentRevision: "1", name: "Local", capabilities: [], providers: [{ ref: "deepseek", name: "DeepSeek", modelRefs: ["deepseek-chat"] }], connectors: [] },
      variableConfiguration: { revision: 1, variables: [{ key: "TOPIC", value: "RAG", overrides: {} }] },
    });
    expect(resources.map(resource => resource.kind).sort()).toEqual(["api", "function", "provider", "variable"]);
    expect(resources.find(resource => resource.kind === "api")).toMatchObject({ title: "Hacker News 搜索", platform: true });
    expect(resources.find(resource => resource.kind === "function")).toMatchObject({ title: "整理结果", meta: "JavaScript · 本流程代码" });
    expect(resources.find(resource => resource.kind === "provider")).toMatchObject({ title: "DeepSeek", meta: "已启用 1 个模型 · deepseek-chat", platform: true });
    expect(resources.find(resource => resource.kind === "variable")).toMatchObject({ title: "TOPIC", meta: "文本 · RAG" });
  });

  it("shows a user MCP tool as MCP with its connection name and no p4 ref in the title", () => {
    const ref = "p4:owner:docs:1:read_wiki_structure";
    const resources = resolveWorkflowResources({
      definition: definition([node("read", "读取结构", "core.tool", { toolRef: ref, contractDigest: "d" })]),
      connections: [connection("docs", 1, { type: "mcp-http", name: "DeepWiki", serverTitle: "DeepWiki", url: "https://mcp.example.com/mcp", allowedToolNames: ["read_wiki_structure"] })],
      tools: [{ ref, name: "read_wiki_structure", contractDigest: "d", inputSchema: { type: "object" }, origin: "user", connectionRef: "docs", connectorRef: "p4:owner:docs:1", adapter: "mcp", sideEffect: "unknown", declaredReadOnly: true }],
    });
    const item = resources.find(resource => resource.kind === "mcp");
    expect(item).toMatchObject({ title: "read_wiki_structure", badge: "MCP 工具", meta: "DeepWiki · 服务声明只读", section: "mcp", platform: false, technicalId: ref });
    expect(item?.title).not.toContain("p4:");
    expect(item?.meta).not.toContain("p4:");
    expect(resources.some(resource => resource.kind === "api")).toBe(false);
  });
});
