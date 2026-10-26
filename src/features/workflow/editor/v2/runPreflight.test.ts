import { describe, expect, it } from "vitest";
import { createNodeV2, createWorkflowV2, stateBinding } from "../../domain/v2/factory";
import type { WorkflowEnvironment } from "../../domain/v2/types";
import { nodeTestBlockReason, runPreflight } from "./runPreflight";

const environment: WorkflowEnvironment = {
  environmentRef: "local", environmentRevision: "1", name: "Local", capabilities: ["llm", "http"],
  providers: [{ ref: "provider", name: "DeepSeek", modelRefs: ["deepseek-chat"] }], connectors: [],
};
const tool = { ref: "hn_search", name: "Hacker News 搜索", contractDigest: "digest", inputSchema: { type: "object", properties: { query: { type: "string" } } }, available: true };

describe("run preflight", () => {
  it("blocks missing required startup input before a run exists", () => {
    const definition = { ...createWorkflowV2(), inputSchema: { type: "object", properties: { question: { type: "string", title: "你的问题" } }, required: ["question"], additionalProperties: false } };
    const issues = runPreflight({ definition, input: {}, environment, tools: [] });
    expect(issues).toContainEqual(expect.objectContaining({ id: "input:question", tab: "run" }));
  });
  it("blocks model nodes without a selected model", () => {
    const model = createNodeV2("core.llm", "answer");
    const definition = { ...createWorkflowV2(), nodes: [createNodeV2("core.start", "start"), model, createNodeV2("core.end", "end")] };
    expect(runPreflight({ definition, input: {}, environment, tools: [] })).toContainEqual(expect.objectContaining({ id: "model:answer:missing", nodeId: "answer" }));
  });
  it("blocks missing parameter sources and unavailable tools", () => {
    const model = createNodeV2("core.llm", "answer"); model.config = { ...model.config, providerRef: "provider", modelRef: "deepseek-chat" }; model.inputs = { question: stateBinding("/missing") };
    const search = createNodeV2("core.tool", "search"); search.config = { toolRef: "hn_search", contractDigest: "old" };
    const definition = { ...createWorkflowV2(), nodes: [createNodeV2("core.start", "start"), search, model, createNodeV2("core.end", "end")] };
    const issues = runPreflight({ definition, input: {}, environment, tools: [tool] });
    expect(issues).toContainEqual(expect.objectContaining({ id: "binding:answer:question:state", tab: "state" }));
    expect(issues).toContainEqual(expect.objectContaining({ id: "tool:search:digest" }));
  });
  it("blocks State initialization and output sources that no longer exist", () => {
    const definition = { ...createWorkflowV2(), state: { ...createWorkflowV2().state, inputBindings: { answer: { source: "input" as const, pointer: "/missing", onMissing: { mode: "error" as const } } } }, outputBindings: { answer: stateBinding("/absent") } };
    const issues = runPreflight({ definition, input: {}, environment, tools: [] });
    expect(issues).toContainEqual(expect.objectContaining({ id: "state-input:answer", tab: "state" }));
    expect(issues).toContainEqual(expect.objectContaining({ id: "state-output:answer", tab: "state" }));
  });
  it("accepts a ready configured flow", () => {
    const base = createWorkflowV2();
    const model = createNodeV2("core.llm", "answer"); model.config = { ...model.config, providerRef: "provider", modelRef: "deepseek-chat" };
    const definition = { ...base, state: { ...base.state, schema: { type: "object", properties: { answer: { type: "string" } } }, initial: { answer: "" }, reducers: { answer: { name: "replace", version: 1 as const } } }, nodes: [createNodeV2("core.start", "start"), model, createNodeV2("core.end", "end")] };
    expect(runPreflight({ definition, input: {}, environment, tools: [] })).toEqual([]);
  });
  it("blocks a write whose output type does not match the target field", () => {
    const base = createWorkflowV2();
    const search = createNodeV2("core.tool", "search"); search.config = { toolRef: "hn_search", contractDigest: "digest" }; search.writes = { hits: "/result/hits" };
    const toolWithHits = { ...tool, outputSchema: { type: "object", properties: { hits: { type: "array", items: { type: "object" } } } } };
    const definition = { ...base, state: { ...base.state, schema: { type: "object", properties: { hits: { type: "string" } } }, initial: { hits: "" }, reducers: { hits: { name: "replace", version: 1 as const } } }, nodes: [createNodeV2("core.start", "start"), search, createNodeV2("core.end", "end")] };
    const issues = runPreflight({ definition, input: {}, environment, tools: [toolWithHits] });
    expect(issues).toContainEqual(expect.objectContaining({ id: "write:search:hits:type", nodeId: "search" }));
    expect(issues.find(issue => issue.id === "write:search:hits:type")?.detail).toContain("列表");
    expect(issues.find(issue => issue.id === "write:search:hits:type")?.detail).toContain("文本");
    expect(issues.find(issue => issue.id === "write:search:hits:type")?.summary).toBe("工具 的 hits 输出是列表，但字段 hits 是文本");
    expect(issues.find(issue => issue.id === "write:search:hits:type")?.fix).toEqual({ field: "hits", type: "array" });
  });
  it("blocks a node test only for that node's own issue", () => {
    const base = createWorkflowV2();
    const search = createNodeV2("core.tool", "search"); search.config = { toolRef: "hn_search", contractDigest: "digest" }; search.writes = { hits: "/result/hits" };
    const answer = createNodeV2("core.llm", "answer"); answer.config = { ...answer.config, providerRef: "provider", modelRef: "deepseek-chat" }; answer.writes = {};
    const toolWithHits = { ...tool, outputSchema: { type: "object", properties: { hits: { type: "array", items: { type: "object" } } } } };
    const definition = { ...base, state: { ...base.state, schema: { type: "object", properties: { hits: { type: "string" } } }, initial: { hits: "" }, reducers: { hits: { name: "replace", version: 1 as const } } }, nodes: [createNodeV2("core.start", "start"), search, answer, createNodeV2("core.end", "end")] };
    const issues = runPreflight({ definition, input: {}, environment, tools: [toolWithHits] });
    expect(nodeTestBlockReason(issues, "search")).toContain("hits 输出是列表");
    expect(nodeTestBlockReason(issues, "answer")).toBeUndefined();
  });
});
