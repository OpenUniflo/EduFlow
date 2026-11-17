import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fixedRevisionReferenceIssue, workflowReferenceEdges, workflowReferenceIssues, workflowReferenceOfNode } from "./workflowV2References";

type Row = Record<string, unknown>;
const definition = (workflowId: string, revision: number, nodes: Row[]) => ({ schemaVersion: "2.0", workflowId, revision, name: workflowId, description: "", nodes });
const referenceNode = (id: string, workflowId: string, revision: number, extra: Row = {}) => ({
  id, label: id, type: "core.subgraph", typeVersion: 1,
  config: { workflowRef: { workflowId, revision }, environmentRef: "local", ...extra }, inputs: { value: { source: "literal", value: 1 } }, writes: { result: "/value" },
});
const embedded = (id: string, nodes: Row[]) => ({ id, label: id, type: "core.subgraph", typeVersion: 1, config: { graph: { nodes } }, inputs: {}, writes: {} });

describe("fixed independent Workflow reference contract", () => {
  it("reads exact revisions and rejects a missing or non-integer revision", () => {
    const node = referenceNode("call", "child", 3) as never;
    expect(workflowReferenceOfNode(node)).toEqual({ targetWorkflowId: "child", targetRevision: 3, environmentRef: "local" });
    expect(workflowReferenceOfNode({ ...(node as Row), config: { workflowRef: { workflowId: "child" }, environmentRef: "local" } })).toBeUndefined();
    expect(workflowReferenceOfNode({ ...(node as Row), config: { workflowRef: { workflowId: "child", revision: 0 }, environmentRef: "local" } })).toBeUndefined();
  });

  it("allows the same target from several nodes and inside embedded graphs", () => {
    const root = definition("root", 2, [referenceNode("first", "child", 1), referenceNode("second", "child", 1), embedded("group", [referenceNode("nested", "child", 1)])]);
    expect(workflowReferenceEdges(root)).toMatchObject([
      { graphPath: [], nodeId: "first", targetWorkflowId: "child", targetRevision: 1 },
      { graphPath: [], nodeId: "second", targetWorkflowId: "child", targetRevision: 1 },
      { graphPath: ["group"], nodeId: "nested", targetWorkflowId: "child", targetRevision: 1 },
    ]);
  });

  it("rejects double configuration, shared state and missing environments", () => {
    const double = definition("root", 1, [{ ...referenceNode("call", "child", 1), config: { graph: { nodes: [] }, workflowRef: { workflowId: "child", revision: 1 }, environmentRef: "local" } }]);
    const shared = definition("root", 1, [referenceNode("call", "child", 1, { stateMode: "shared" })]);
    const noEnvironment = definition("root", 1, [{ ...referenceNode("call", "child", 1), config: { workflowRef: { workflowId: "child", revision: 1 } } }]);
    expect(workflowReferenceIssues(double)).toHaveLength(1);
    expect(workflowReferenceIssues(shared)).toHaveLength(1);
    expect(workflowReferenceIssues(noEnvironment)).toHaveLength(1);
  });

  it("detects a cycle through the actual fixed-revision chain but permits reused targets", () => {
    const a1 = definition("a", 1, [referenceNode("to-b", "b", 1)]);
    const b1 = definition("b", 1, [referenceNode("to-a", "a", 1)]);
    const missing = fixedRevisionReferenceIssue({ workflowId: "a", revision: 1 }, (id, rev) => id === "a" && rev === 1 ? a1 : id === "b" && rev === 1 ? b1 : undefined);
    expect(missing).toMatchObject({ code: "WORKFLOW_REFERENCE_CYCLE" });

    const reused = definition("a", 1, [referenceNode("first", "b", 1), referenceNode("second", "b", 1)]);
    expect(fixedRevisionReferenceIssue({ workflowId: "a", revision: 1 }, (id, rev) => id === "a" ? reused : id === "b" ? definition("b", 1, []) : undefined)).toBeUndefined();
  });

  it("enforces the fixed chain depth limit", () => {
    const chain = new Map<string, Row>();
    for (let index = 0; index < 10; index += 1) chain.set(`w${index}`, definition(`w${index}`, 1, [referenceNode("next", `w${index + 1}`, 1)]));
    const issue = fixedRevisionReferenceIssue({ workflowId: "w0", revision: 1 }, (id) => chain.get(id));
    expect(issue).toMatchObject({ code: "WORKFLOW_REFERENCE_LIMIT" });
  });
});

const dependencies = vi.hoisted(() => ({ server: undefined as SupabaseClient | undefined, compiler: vi.fn() }));
vi.mock("./supabase.js", () => ({ createServerSupabase: () => dependencies.server }));
vi.mock("./workflowV2Protocol.js", async (original) => ({ ...await original<typeof import("./workflowV2Protocol.js")>(), workflowCompiler: dependencies.compiler }));
import { handleWorkflowV2 } from "./workflowV2.js";

type Fixture = { heads: Map<string, Row>; revisions: Map<string, Row>; index?: Row[]; impact?: Row };
function key(workflowId: string, revision: number) { return `${workflowId}@${revision}`; }
function mockClient(fixture: Fixture) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "workflow_v2_reference_impact") return { data: fixture.impact ?? { referenceCount: 0, referencedBy: 0, blocking: [] }, error: null };
    return { data: { ok: true }, error: null };
  });
  const client = {
    from(table: string) {
      const filters: Row = {};
      const query: Row = {
        select() { return query; }, eq(keyName: string, value: unknown) { filters[keyName] = value; return query; },
        order() { return query; }, limit() { return query; }, in() { return query; },
        async maybeSingle() {
          if (table === "workflow_v2_definitions") return { data: fixture.heads.get(String(filters.workflow_id)) ?? null, error: null };
          if (table === "workflow_revisions") return { data: fixture.revisions.get(key(String(filters.workflow_id), Number(filters.revision))) ?? null, error: null };
          return { data: null, error: null };
        },
        async single() { return { data: { document: fixture.revisions.get(key(String(filters.workflow_id), Number(filters.revision)))?.editor_snapshot ?? {} }, error: null }; },
        then(resolve: (value: unknown) => unknown) {
          if (table === "workflow_reference_index") return Promise.resolve({ data: (fixture.index ?? []).filter((row) => (filters.target_workflow_id === undefined || row.target_workflow_id === filters.target_workflow_id) && (filters.target_revision === undefined || row.target_revision === filters.target_revision)), error: null }).then(resolve);
          return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
        },
        insert() { return Promise.resolve({ data: null, error: null }); },
        update() { return query; },
      };
      return query;
    },
    rpc,
  } as unknown as SupabaseClient;
  return { client, rpc };
}
function response() { const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as VercelResponse; return { response, output: () => vi.mocked(response.json).mock.calls[0]?.[0] as Row }; }
const request = (method: string, query: Row, body?: unknown) => ({ method, query: { resource: "definitions", ...query }, body, headers: {} } as unknown as VercelRequest);
beforeEach(() => { dependencies.server = undefined; dependencies.compiler.mockReset(); });

describe("Workflow reference API", () => {
  it("reads outgoing references with exact target metadata and historical revisions", async () => {
    const source = definition("parent", 2, [referenceNode("call", "child", 1)]);
    const fixture = { heads: new Map([["parent", { current_revision: 2, archived: false }], ["child", { current_revision: 3, archived: false }]]), revisions: new Map([[key("parent", 2), { definition: source }], [key("child", 1), { definition: definition("child", 1, []) }]]) };
    dependencies.server = mockClient(fixture).client;
    const state = response();
    await handleWorkflowV2(request("GET", { id: "parent", op: "references", revision: "2" }), state.response, "owner");
    expect(state.output()).toMatchObject({ workflowId: "parent", revision: 2, items: [{ nodeId: "call", target: { workflowId: "child", revision: 1, currentRevision: 3, available: true, environmentRef: "local" } }] });
  });

  it("reads the current blocking closure and keeps the intermediate source chain", async () => {
    const blocks = definition("root", 4, [referenceNode("to-old", "middle", 2)]);
    const middle = definition("middle", 2, [referenceNode("to-target", "child", 1)]);
    const fixture = {
      heads: new Map([["root", { current_revision: 4, archived: false }], ["middle", { current_revision: 3, archived: false }], ["child", { current_revision: 1, archived: false }]]),
      revisions: new Map([
        [key("root", 4), { definition: blocks }],
        [key("middle", 2), { definition: middle }],
        [key("child", 1), { definition: definition("child", 1, []) }],
      ]),
      impact: {
        referenceCount: 1,
        referencedBy: 1,
        blocking: [{
          rootWorkflowId: "root", rootRevision: 4, rootName: "Root",
          sourceWorkflowId: "middle", sourceRevision: 2, sourceName: "Middle old", sourceCurrent: false,
          nodeId: "to-target", graphPath: [], targetWorkflowId: "child", targetRevision: 1, targetName: "Child", environmentRef: "local",
          chain: ["root:4", "middle:2", "child:1"], chainNames: ["Root", "Middle old", "Child"],
        }],
      },
    };
    dependencies.server = mockClient(fixture).client;
    const state = response();
    await handleWorkflowV2(request("GET", { id: "child", op: "referenced-by", revision: "1" }), state.response, "owner");
    expect(state.output()).toMatchObject({
      mode: "current-closure",
      items: [{
        sourceWorkflowId: "middle", sourceRevision: 2, sourceCurrent: false,
        rootWorkflowId: "root", rootRevision: 4,
        nodeId: "to-target", nodeLabel: "to-target",
        chain: ["root:4", "middle:2", "child:1"], chainNames: ["Root", "Middle old", "Child"], indirect: true, blocking: true,
      }],
    });
  });

  it("reads historical direct index rows only when explicitly requested", async () => {
    const source = definition("parent", 2, [referenceNode("call", "child", 1)]);
    const fixture = {
      heads: new Map([["parent", { current_revision: 2, archived: false }], ["old", { current_revision: 3, archived: false }], ["child", { current_revision: 1, archived: false }]]),
      revisions: new Map([[key("parent", 2), { definition: source }], [key("old", 1), { definition: definition("old", 1, [referenceNode("legacy", "child", 1)]) }]]),
      index: [
        { workflow_id: "parent", revision: 2, node_id: "call", graph_path: [], target_workflow_id: "child", target_revision: 1, target_environment_ref: "local" },
        { workflow_id: "old", revision: 1, node_id: "legacy", graph_path: [], target_workflow_id: "child", target_revision: 1, target_environment_ref: "local" },
      ],
    };
    dependencies.server = mockClient(fixture).client;
    const state = response();
    await handleWorkflowV2(request("GET", { id: "child", op: "referenced-by", revision: "1", historical: "true" }), state.response, "owner");
    expect(state.output()).toMatchObject({ mode: "historical-index", items: [{ sourceWorkflowId: "old", sourceRevision: 1, sourceCurrent: false, nodeId: "legacy", nodeLabel: "legacy" }, { sourceWorkflowId: "parent", sourceRevision: 2, sourceCurrent: true, nodeId: "call", nodeLabel: "call", targetRevision: 1 }] });
  });

  it("rejects double configuration before compiling or writing", async () => {
    const source = definition("parent", 1, [{ ...referenceNode("call", "child", 1), config: { graph: { nodes: [] }, workflowRef: { workflowId: "child", revision: 1 }, environmentRef: "local" } }]);
    const fixture = { heads: new Map([["parent", { current_revision: 1, archived: false, editor_revision: 1 }]]), revisions: new Map([[key("parent", 1), { definition: source, editor_snapshot: { workflowId: "parent", editorRevision: 1, definitionRevision: 1, nodes: {}, edges: {} } }]]) };
    const mock = mockClient(fixture); dependencies.server = mock.client;
    await expect(handleWorkflowV2(request("PUT", { id: "parent" }, { definition: { ...source, revision: 2 }, editor: { workflowId: "parent", editorRevision: 1, definitionRevision: 2, nodes: {}, edges: {} }, baseRevision: 1, baseEditorRevision: 1, environmentRef: "local" }), response().response, "owner"))
      .rejects.toMatchObject({ status: 400, code: "INVALID_SUBGRAPH_REFERENCE" });
    expect(dependencies.compiler).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("checks the target environment against the server catalog before saving", async () => {
    const source = definition("parent", 1, [referenceNode("call", "child", 1)]);
    const fixture = { heads: new Map([["parent", { current_revision: 1, archived: false, editor_revision: 1 }]]), revisions: new Map([[key("parent", 1), { definition: source, editor_snapshot: { workflowId: "parent", editorRevision: 1, definitionRevision: 1, nodes: {}, edges: {} } }]]) };
    const mock = mockClient(fixture); dependencies.server = mock.client;
    dependencies.compiler.mockImplementation(async (path: string) => path === "/v1/catalog" ? { items: [] } : { definitionHash: "hash" });
    await expect(handleWorkflowV2(request("PUT", { id: "parent" }, { definition: { ...source, revision: 2 }, editor: { workflowId: "parent", editorRevision: 1, definitionRevision: 2, nodes: {}, edges: {} }, baseRevision: 1, baseEditorRevision: 1, environmentRef: "local" }), response().response, "owner"))
      .rejects.toMatchObject({ status: 403, code: "WORKFLOW_REFERENCE_ENVIRONMENT" });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("reports the transitive blocking chain in delete-impact", async () => {
    const fixture = {
      heads: new Map([["child", { current_revision: 5, archived: false }]]),
      revisions: new Map([[key("child", 5), { definition: definition("child", 5, []) }]]),
      impact: {
        referenceCount: 1, referencedBy: 1,
        blocking: [{
          rootWorkflowId: "root", rootRevision: 4, rootName: "Root",
          sourceWorkflowId: "middle", sourceRevision: 2, sourceName: "Middle old", sourceCurrent: false,
          nodeId: "to-target", graphPath: [], targetWorkflowId: "child", targetRevision: 1, targetName: "Child", environmentRef: "local",
          chain: ["root:4", "middle:2", "child:1"], chainNames: ["Root", "Middle old", "Child"],
        }],
      },
    };
    const mock = mockClient(fixture); dependencies.server = mock.client;
    const state = response();
    await handleWorkflowV2(request("GET", { id: "child", op: "delete-impact" }), state.response, "owner");
    expect(mock.rpc).toHaveBeenCalledWith("workflow_v2_reference_impact", { p_owner: "owner", p_workflow: "child" });
    expect(state.output()).toMatchObject({
      revision: 5, referenceCount: 1, referencedBy: 1,
      blockingReferences: [{ chain: ["root:4", "middle:2", "child:1"], chainNames: ["Root", "Middle old", "Child"], sourceCurrent: false }],
    });
  });

  it("rejects delete with the blocking chain before the destructive RPC", async () => {
    const fixture = {
      heads: new Map([["child", { current_revision: 1, archived: false }]]),
      revisions: new Map([[key("child", 1), { definition: definition("child", 1, []) }]]),
      impact: { referenceCount: 1, referencedBy: 1, blocking: [{ rootWorkflowId: "root", rootRevision: 1, sourceWorkflowId: "root", sourceRevision: 1, nodeId: "call", graphPath: [], targetWorkflowId: "child", targetRevision: 1, chain: ["root:1", "child:1"], chainNames: ["Root", "Child"] }] },
    };
    const mock = mockClient(fixture); dependencies.server = mock.client;
    await expect(handleWorkflowV2(request("DELETE", { id: "child", op: "delete" }, { baseRevision: 1 }), response().response, "owner"))
      .rejects.toMatchObject({ status: 409, code: "WORKFLOW_REFERENCED", details: { referenceCount: 1, blockingReferences: [{ chain: ["root:1", "child:1"] }] } });
    expect(mock.rpc).not.toHaveBeenCalledWith("workflow_v2_delete", expect.anything());
  });

  it("delegates archive to the protected database RPC", async () => {
    const mock = mockClient({ heads: new Map(), revisions: new Map() }); dependencies.server = mock.client;
    const state = response();
    await handleWorkflowV2(request("DELETE", { id: "parent" }, { baseRevision: 2 }), state.response, "owner");
    expect(mock.rpc).toHaveBeenCalledWith("workflow_v2_archive", { p_owner: "owner", p_workflow: "parent", p_base: 2 });
  });
});
