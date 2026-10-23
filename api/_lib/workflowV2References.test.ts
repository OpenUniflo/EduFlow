import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectionReferenceRows, connectionRefName, connectionRefVersion, variableReferenceRows, type ReferenceWorkflow } from "./workflowV2References";

type Row = Record<string, unknown>;

const environmentBinding = (pointer: string) => ({ source: "environment", pointer, onMissing: { mode: "error" } });

const rootDefinition: Row = {
  name: "流程 A",
  revision: 4,
  nodes: [
    {
      id: "model",
      label: "模型",
      type: "core.llm",
      config: { providerRef: "p4:owner:price:2", modelRef: "deepseek-chat", allowedToolRefs: ["p4:owner:price:2", "p4:owner:search:1", "environment-tool"] },
      inputs: { primary: environmentBinding("/QUESTION"), secondary: environmentBinding("/QUESTION"), plain: { source: "literal", value: "text" } },
      writes: {},
    },
    { id: "tool", label: "", type: "core.tool", config: { toolRef: "p4:owner:search:3" }, inputs: {}, writes: {} },
    {
      id: "router",
      label: "路由",
      type: "core.router",
      config: {
        cases: [{
          predicate: {
            op: "and",
            children: [
              { op: "eq", left: environmentBinding("/THRESHOLD"), right: { source: "literal", value: 1 } },
              { op: "exists", source: "environment", pointer: "/FLAG" },
            ],
          },
        }],
      },
      inputs: {},
      writes: {},
    },
    {
      id: "sub",
      label: "子图",
      type: "core.subgraph",
      config: {
        graph: {
          nodes: [{
            id: "inner",
            label: "内部模型",
            type: "core.llm",
            config: { providerRef: "p4:owner:price:5", modelRef: "deepseek-reasoner" },
            inputs: { nested: environmentBinding("/MODEL_URL") },
            writes: {},
          }],
          outputBindings: { result: environmentBinding("/NESTED_OUTPUT") },
        },
      },
      inputs: {},
      writes: {},
    },
  ],
  outputBindings: { answer: environmentBinding("/API_URL") },
};

const workflow = (overrides: Partial<ReferenceWorkflow> = {}): ReferenceWorkflow => ({ workflowId: "wf-a", workflowName: "流程 A", revision: 4, definition: rootDefinition, ...overrides });

describe("connection reference identity", () => {
  it("accepts a catalog ref or a stored user connection key", () => {
    expect(connectionRefName("price_service")).toBe("price_service");
    expect(connectionRefName("p4:owner:price_service:2")).toBe("price_service");
    expect(connectionRefName("p4:owner:price_service:")).toBe("price_service");
    expect(connectionRefName("  price_service  ")).toBe("price_service");
    expect(connectionRefName("")).toBeUndefined();
    expect(connectionRefName(undefined)).toBeUndefined();
    expect(connectionRefName("p4:owner")).toBeUndefined();
  });

  it("parses the immutable version pinned by a stored key", () => {
    expect(connectionRefVersion("p4:owner:price_service:2")).toBe(2);
    expect(connectionRefVersion("p4:owner:price_service:0")).toBeUndefined();
    expect(connectionRefVersion("p4:owner:price_service")).toBeUndefined();
    expect(connectionRefVersion("price_service")).toBeUndefined();
  });
});

describe("connection references", () => {
  it("reports provider, tool and allowed-tool usages across the root and nested subgraphs", () => {
    const rows = connectionReferenceRows([workflow()], "price");
    expect(rows).toEqual([
      { workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: [], nodeId: "model", nodeLabel: "模型", version: 2, modelRef: "deepseek-chat" },
      { workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: [], nodeId: "model", nodeLabel: "模型", version: 2 },
      { workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: ["sub"], nodeId: "inner", nodeLabel: "内部模型", version: 5, modelRef: "deepseek-reasoner" },
    ]);
    const search = connectionReferenceRows([workflow()], "search");
    expect(search).toEqual([
      { workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: [], nodeId: "model", nodeLabel: "模型", version: 1 },
      { workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: [], nodeId: "tool", nodeLabel: "tool", version: 3 },
    ]);
  });

  it("matches every version of the requested connection and ignores other or environment references", () => {
    expect(connectionReferenceRows([workflow()], "p4:owner:price:2")).toHaveLength(3);
    expect(connectionReferenceRows([workflow()], "environment-tool")).toEqual([]);
    expect(connectionReferenceRows([workflow()], "unknown")).toEqual([]);
    expect(connectionReferenceRows([workflow()], "")).toEqual([]);
  });

  it("excludes archived workflows even when the caller passes one", () => {
    expect(connectionReferenceRows([workflow({ archived: true })], "price")).toEqual([]);
  });
});

describe("variable references", () => {
  it("reports input bindings, router predicates, nested outputs and graph outputs once per node", () => {
    expect(variableReferenceRows([workflow()])).toEqual([
      { workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: [], nodeId: "model", nodeLabel: "模型", variableKey: "QUESTION" },
      { workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: [], nodeId: "router", nodeLabel: "路由", variableKey: "THRESHOLD" },
      { workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: [], nodeId: "router", nodeLabel: "路由", variableKey: "FLAG" },
      { workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: ["sub"], nodeId: "inner", nodeLabel: "内部模型", variableKey: "MODEL_URL" },
      { workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: ["sub"], nodeId: "@output", nodeLabel: "工作流输出", variableKey: "NESTED_OUTPUT" },
      { workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: [], nodeId: "@output", nodeLabel: "工作流输出", variableKey: "API_URL" },
    ]);
  });

  it("ignores literal, input and state bindings and archived workflows", () => {
    const definition: Row = { nodes: [{ id: "fn", label: "函数", type: "core.function", config: {}, inputs: { a: { source: "state", pointer: "/ANSWER", onMissing: { mode: "error" } }, b: { source: "input", pointer: "/question", onMissing: { mode: "error" } }, c: { source: "literal", value: "text" } }, writes: {} }] };
    expect(variableReferenceRows([workflow({ definition })])).toEqual([]);
    expect(variableReferenceRows([workflow({ archived: true })])).toEqual([]);
  });
});

const dependencies = vi.hoisted(() => ({ server: undefined as SupabaseClient | undefined, compiler: vi.fn() }));
vi.mock("./supabase.js", () => ({ createServerSupabase: () => dependencies.server }));
vi.mock("./workflowV2Protocol.js", async (original) => ({ ...await original<typeof import("./workflowV2Protocol.js")>(), workflowCompiler: dependencies.compiler }));
import { handleWorkflowV2 } from "./workflowV2.js";

type Fixture = { workflowId: string; currentRevision: number; archived?: boolean; definition: Row };

function mockClient(fixtures: Fixture[], configuration?: Row) {
  const reads: { table: string; filters: Row }[] = [];
  const writes: { operation: string; value: unknown }[] = [];
  const client = {
    from(table: string) {
      const filters: Row = {};
      reads.push({ table, filters });
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        gt(key: string, value: unknown) { filters[`gt:${key}`] = value; return query; },
        order() { return query; },
        limit(value: number) { filters.limit = value; return query; },
        async maybeSingle() {
          if (table === "workflow_revisions") {
            const fixture = fixtures.find((item) => item.workflowId === filters.workflow_id && item.currentRevision === filters.revision);
            return { data: fixture ? { revision: fixture.currentRevision, definition: fixture.definition } : null, error: null };
          }
          if (table === "workflow_workspace_configuration") return { data: configuration ?? null, error: null };
          return { data: null, error: null };
        },
        then(resolve: (value: unknown) => unknown) {
          if (table === "workflow_v2_definitions") {
            let rows = fixtures.filter((item) => filters.archived === undefined || Boolean(item.archived) === filters.archived);
            const cursor = filters["gt:workflow_id"];
            if (typeof cursor === "string") rows = rows.filter((item) => item.workflowId > cursor);
            rows = rows.slice(0, Number(filters.limit ?? 100));
            return Promise.resolve({ data: rows.map((item) => ({ workflow_id: item.workflowId, current_revision: item.currentRevision, archived: Boolean(item.archived) })), error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
        insert(value: unknown) { writes.push({ operation: "insert", value }); return Promise.resolve({ data: value, error: null }); },
        update(value: unknown) {
          writes.push({ operation: "update", value });
          const update = {
            eq() { return update; },
            select() { return update; },
            then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [{ revision: Number((value as Row).revision) }], error: null }).then(resolve); },
          };
          return update;
        },
      };
      return query;
    },
    rpc: vi.fn(() => { throw new Error("unexpected rpc"); }),
  } as unknown as SupabaseClient;
  return { client, reads, writes };
}

function vercelResponse() {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as VercelResponse;
  return { response, output: () => vi.mocked(response.json).mock.calls[0]?.[0] as Row };
}

const request = (method: string, resource: string, query: Row = {}, body?: unknown) => ({ method, query: { resource, ...query }, body, headers: {} } as unknown as VercelRequest);

beforeEach(() => { dependencies.server = undefined; dependencies.compiler.mockReset(); });

describe("resource reference endpoints", () => {
  it("scans the owner's current, non-archived definitions through the user client", async () => {
    const { client, reads } = mockClient([
      { workflowId: "wf-a", currentRevision: 4, definition: { name: "流程 A", revision: 4, nodes: [{ id: "model", label: "模型", type: "core.llm", config: { providerRef: "p4:owner:price:2", modelRef: "deepseek-chat" } }] } },
      { workflowId: "wf-b", currentRevision: 2, archived: true, definition: { name: "已归档", revision: 2, nodes: [{ id: "model", label: "模型", type: "core.llm", config: { providerRef: "p4:owner:price:1" } }] } },
    ]);
    const server = { from: vi.fn(() => { throw new Error("reference scans must use the user client"); }) } as unknown as SupabaseClient;
    dependencies.server = server;
    const state = vercelResponse();
    await handleWorkflowV2(request("GET", "extensions", { view: "references", ref: "price" }), state.response, "owner", client);
    expect(state.output()).toEqual({ items: [{ workflowId: "wf-a", workflowName: "流程 A", revision: 4, graphPath: [], nodeId: "model", nodeLabel: "模型", version: 2, modelRef: "deepseek-chat" }] });
    expect(server.from).not.toHaveBeenCalled();
    expect(reads.map((read) => read.table)).toEqual(["workflow_v2_definitions", "workflow_revisions"]);
    expect(reads[0].filters).toMatchObject({ owner_user_id: "owner", archived: false });
    expect(reads[1].filters).toMatchObject({ owner_user_id: "owner", workflow_id: "wf-a", revision: 4 });
  });

  it("accepts a full stored connection key", async () => {
    const { client } = mockClient([{ workflowId: "wf-a", currentRevision: 4, definition: { name: "流程 A", revision: 4, nodes: [{ id: "model", label: "模型", type: "core.llm", config: { providerRef: "p4:owner:price:7" } }] } }]);
    const state = vercelResponse();
    await handleWorkflowV2(request("GET", "extensions", { view: "references", ref: "p4:owner:price:7" }), state.response, "owner", client);
    expect((state.output().items as Row[])).toMatchObject([{ workflowId: "wf-a", nodeId: "model", version: 7 }]);
  });

  it("requires a reference identity before reading anything", async () => {
    const { client, reads } = mockClient([]);
    const state = vercelResponse();
    await expect(handleWorkflowV2(request("GET", "extensions", { view: "references" }), state.response, "owner", client)).rejects.toMatchObject({ status: 400, code: "INVALID_REQUEST" });
    expect(reads).toEqual([]);
  });

  it("reports variable usages for the configuration reference view", async () => {
    const { client } = mockClient([{ workflowId: "wf-a", currentRevision: 4, definition: rootDefinition }]);
    const state = vercelResponse();
    await handleWorkflowV2(request("GET", "configuration", { view: "references" }), state.response, "owner", client);
    const items = state.output().items as Row[];
    expect(items).toHaveLength(6);
    expect(items[0]).toMatchObject({ workflowId: "wf-a", workflowName: "流程 A", nodeId: "model", variableKey: "QUESTION" });
    expect(items.some((row) => row.variableKey === "API_URL" && row.nodeId === "@output")).toBe(true);
  });
});

describe("configuration descriptions", () => {
  const body = { baseRevision: 2, variables: [{ key: "API_URL", value: "https://example.test", overrides: {}, description: "接口地址" }] };

  it("accepts, persists and returns a bounded variable description", async () => {
    const { client, writes } = mockClient([], { revision: 2, variables: [{ key: "API_URL", value: "https://example.test", overrides: {}, description: "接口地址" }] });
    dependencies.server = client;
    dependencies.compiler.mockResolvedValue({ items: [] });
    const state = vercelResponse();
    await handleWorkflowV2(request("PUT", "configuration", {}, body), state.response, "owner");
    expect(state.output()).toEqual({ revision: 3, variables: body.variables });
    expect(writes).toMatchObject([{ operation: "update", value: { owner_user_id: "owner", revision: 3, variables: body.variables } }]);
  });

  it("returns the stored description on read", async () => {
    const { client } = mockClient([], { revision: 3, variables: [{ key: "API_URL", value: "https://example.test", overrides: {}, description: "接口地址" }] });
    dependencies.server = client;
    const state = vercelResponse();
    await handleWorkflowV2(request("GET", "configuration"), state.response, "owner");
    expect(state.output()).toEqual({ revision: 3, variables: [{ key: "API_URL", value: "https://example.test", overrides: {}, description: "接口地址" }] });
  });

  it("rejects an over-long or credential-shaped description", async () => {
    const { client } = mockClient([]);
    dependencies.server = client;
    const tooLong = { baseRevision: 2, variables: [{ key: "API_URL", value: "x", overrides: {}, description: "字".repeat(301) }] };
    await expect(handleWorkflowV2(request("PUT", "configuration", {}, tooLong), vercelResponse().response, "owner")).rejects.toMatchObject({ status: 400, code: "INVALID_CONFIGURATION" });
    const credential = { baseRevision: 2, variables: [{ key: "API_URL", value: "x", overrides: {}, description: "api_key=abcdef123456" }] };
    await expect(handleWorkflowV2(request("PUT", "configuration", {}, credential), vercelResponse().response, "owner")).rejects.toMatchObject({ status: 400, code: "SECRET_IN_DEFINITION" });
  });
});

describe("extension test response", () => {
  it("passes Worker test fields through without trimming models, tools or preview", async () => {
    const result = { ok: true, elapsedMs: 321, status: 200, preview: "{\"answer\":42}", models: ["deepseek-chat", "deepseek-reasoner"], tools: [{ name: "lookup", description: "查询价格" }] };
    dependencies.compiler.mockResolvedValue(result);
    const state = vercelResponse();
    const body = { environmentRef: "local-env", action: "test", kind: "connection", ref: "price", version: 2, arguments: { query: "a" }, confirmExternalEffect: false };
    await handleWorkflowV2(request("POST", "extensions", {}, body), state.response, "owner");
    expect(state.output()).toEqual(result);
    expect(dependencies.compiler).toHaveBeenCalledWith("/v1/extensions", { ...body, ownerId: "owner" });
  });
});
