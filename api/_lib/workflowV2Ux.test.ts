import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
const dependencies = vi.hoisted(() => ({ client: undefined as unknown as SupabaseClient, compiler: vi.fn() }));
vi.mock("./supabase.js", () => ({ createServerSupabase: () => dependencies.client }));
vi.mock("./workflowV2Protocol.js", async (original) => ({ ...await original<typeof import("./workflowV2Protocol.js")>(), workflowCompiler: dependencies.compiler }));
import { handleWorkflowV2, workflowLibraryGroup } from "./workflowV2.js";

type Row = Record<string, unknown>;
const definition = { workflowId: "w", revision: 3, name: "draft", nodes: [] };
function setup(headOwner = "a", revision = 3) {
  const reads: { table: string; filters: Row; order?: Row; limit?: number }[] = [];
  const writes = vi.fn();
  dependencies.client = {
    from(table: string) {
      const call = { table, filters: {} as Row, order: {} as Row, limit: 0 }; reads.push(call);
      const rows = () => call.filters.owner_user_id !== headOwner ? null : table === "workflow_v2_definitions" ? { current_revision: revision } : table === "workflow_revisions" ? { definition, editor_snapshot: {} } : null;
      const query = {
        select() { return query; }, eq(key: string, value: unknown) { call.filters[key] = value; return query; },
        lt(key: string, value: unknown) { call.filters[`lt:${key}`] = value; return query; },
        order(key: string, value: unknown) { call.order[key] = value; return query; }, limit(value: number) { call.limit = value; return query; },
        async maybeSingle() { return { data: rows(), error: null }; },
        then(resolve: (result: unknown) => unknown) {
          const data = [3, 2, 1].filter((n) => !call.filters["lt:revision"] || n < Number(call.filters["lt:revision"])).slice(0, call.limit).map((n) => ({ revision: n, definition: { name: `v${n}` }, definition_hash: `hash${n}`, created_at: "2026-10-14T00:00:00Z" }));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
        update: writes, insert: writes, delete: writes,
      };
      return query;
    }, rpc: writes,
  } as unknown as SupabaseClient;
  dependencies.compiler.mockResolvedValue({ valid: true, checks: { structure: true, environment: true, input: "unchecked" }, diagnostics: [], requiredCapabilities: [], registrySnapshot: { never: "browser" } });
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as VercelResponse;
  return { reads, writes, response, output: () => vi.mocked(response.json).mock.calls[0]?.[0] as Row };
}
function request(resource: string, body?: Row, query: Row = {}) {
  return { method: body ? "POST" : "GET", query: { resource, ...query }, body, headers: {} } as unknown as VercelRequest;
}
beforeEach(() => dependencies.compiler.mockReset());
describe("Draft validation without mutations", () => {
  const body = { mode: "draft", workflowId: "w", baseRevision: 3, draftDefinition: definition, environmentRef: "e", clientRequestId: "request-a", draftGeneration: 7 };
  it("validates unsaved draft, echoes correlation and removes private registry", async () => {
    const state = setup();
    await handleWorkflowV2(request("validate", body), state.response, "a");
    expect(state.writes).not.toHaveBeenCalled();
    expect(state.reads.map((read) => read.table)).toEqual(["workflow_v2_definitions"]);
    expect(dependencies.compiler).toHaveBeenCalledWith("/v1/validate", { ownerId: "a", environmentRef: "e", definition });
    expect(state.output()).toMatchObject({ clientRequestId: "request-a", draftGeneration: 7, checks: { input: "unchecked" } });
    expect(state.output()).not.toHaveProperty("registrySnapshot");
  });
  it("prechecks the actual submitted input snapshot and annotates diagnostics", async () => {
    const state = setup(); dependencies.compiler.mockResolvedValue({ valid: false, checks: { structure: true, environment: true, input: false }, diagnostics: [{ code: "INVALID_RUN_INPUT", scope: "input", pointer: "/question" }] });
    await handleWorkflowV2(request("validate", { ...body, input: { count: 0, confirm: false, nil: null } }), state.response, "a");
    expect(dependencies.compiler.mock.calls[0][1].input).toEqual({ count: 0, confirm: false, nil: null });
    expect(state.output().diagnostics).toEqual([{ code: "INVALID_RUN_INPUT", scope: "input", pointer: "/question", requestId: state.output().requestId, clientRequestId: "request-a", draftGeneration: 7 }]);
    expect(state.writes).not.toHaveBeenCalled();
  });
  it("rejects stale and cross-owner drafts before invoking compiler", async () => {
    const stale = setup("a", 4);
    await expect(handleWorkflowV2(request("validate", body), stale.response, "a")).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT", details: { clientRequestId: "request-a" } });
    const other = setup();
    await expect(handleWorkflowV2(request("validate", body), other.response, "b")).rejects.toMatchObject({ status: 404 });
    expect(dependencies.compiler).not.toHaveBeenCalled();
    expect(stale.writes).not.toHaveBeenCalled(); expect(other.writes).not.toHaveBeenCalled();
  });
  it("preserves saved validation and accepts optional input", async () => {
    const state = setup();
    await handleWorkflowV2(request("validate", { workflowId: "w", revision: 3, environmentRef: "e", input: {} }), state.response, "a");
    expect(dependencies.compiler.mock.calls[0][1]).toEqual({ ownerId: "a", environmentRef: "e", definition, input: {} });
    expect(state.writes).not.toHaveBeenCalled();
  });
});
describe("Owner revisions independent of Run history", () => {
  it("paginates immutable revision rows by descending exclusive cursor", async () => {
    const state = setup();
    await handleWorkflowV2(request("revisions", undefined, { workflowId: "w", limit: "1", cursor: "3" }), state.response, "a");
    expect(state.output()).toEqual({ items: [{ revision: 2, name: "v2", createdAt: "2026-10-14T00:00:00Z", definitionHash: "hash2", availability: "available" }], nextCursor: 2 });
    expect(state.reads[1].filters).toEqual({ owner_user_id: "a", workflow_id: "w", "lt:revision": 3 });
    expect(state.reads.map((row) => row.table)).not.toContain("workflow_live_runs");
    expect(state.writes).not.toHaveBeenCalled();
  });
  it("does not disclose another owner's revision list", async () => {
    const state = setup();
    await expect(handleWorkflowV2(request("revisions", undefined, { workflowId: "w" }), state.response, "b")).rejects.toMatchObject({ status: 404 });
    expect(state.reads).toHaveLength(1);
  });
});

it("Run DTO exposes safe reuse only on explicit detail and scopes execution errors", async () => {
  const { workflowRunDto } = await import("./workflowV2.js");
  const run = { run_id: "r", input: { question: "hi", email: "private@example.org" }, output: null, error: { code: "MODEL_ADAPTER_FAILED", message: "Safe adapter failure" } };
  expect(workflowRunDto(run)).not.toHaveProperty("inputReuse");
  expect(workflowRunDto(run, true)).toMatchObject({ inputReuse: { available: true, complete: false, fields: [{ pointer: "/question", value: "hi" }], removedFields: [{ pointer: "/email", reason: "sensitive" }] }, error: { scope: "run", runId: "r" } });
  expect(JSON.stringify(workflowRunDto(run, true))).not.toContain("private@example.org");
});

it("Run DTO retains pre-step input-resolution context without manufacturing a Step", async () => {
  const { workflowRunDto } = await import("./workflowV2.js");
  const run = { run_id: "r", input: {}, output: null, error: { code: "INVALID_NODE_INPUT", category: "validation", message: "Schema type constraint failed", nodeId: "tool", invocation: 2, stage: "input_resolution", pointer: "/nodes/tool/inputs/arguments" } };
  const dto = workflowRunDto(run);
  expect(dto).toMatchObject({ error: { ...run.error, scope: "run", runId: "r" } });
  expect(dto).not.toHaveProperty("error.stepId");
  expect(dto).not.toHaveProperty("steps");
});

describe("Trusted library display groups", () => {
  it.each([undefined, null, "test", [], {}, { libraryGroup: "TEST" }, { libraryGroup: "future" }, { sourceKind: "local_import", sourceTemplateId: "test-template" }])("keeps missing or unknown metadata unclassified: %j", (provenance) => {
    expect(workflowLibraryGroup(provenance)).toBeUndefined();
  });
  it("recognizes only exact operator fields and preserves provenance", () => {
    const provenance = { sourceTemplateId: "source", sourceRevision: 4, libraryGroup: "test" };
    expect(workflowLibraryGroup(provenance)).toBe("test");
    expect(workflowLibraryGroup({ ...provenance, libraryGroup: "general" })).toBe("general");
    expect(provenance).toEqual({ sourceTemplateId: "source", sourceRevision: 4, libraryGroup: "test" });
  });
  it("does not treat an inherited group as an explicit operator label", () => {
    expect(workflowLibraryGroup(Object.create({ libraryGroup: "test" }))).toBeUndefined();
  });

  function librarySetup() {
    const rows: Row[] = [
      { owner_user_id: "a", workflow_id: "one", current_revision: 3, name: "same name", provenance: { sourceTemplateId: "source", libraryGroup: "test" } },
      { owner_user_id: "a", workflow_id: "two", current_revision: 3, name: "same name", provenance: { libraryGroup: "general" } },
      { owner_user_id: "a", workflow_id: "unclassified", current_revision: 3, name: "test sample", provenance: { sourceKind: "local_import" } },
      { owner_user_id: "b", workflow_id: "one", current_revision: 3, name: "private other owner", provenance: { libraryGroup: "general" } },
    ];
    const before = structuredClone(rows); const reads: Row[] = []; const writes = vi.fn();
    dependencies.client = { from(table: string) {
      const filters: Row = {}; reads.push({ table, filters }); let limit = 200;
      const data = () => rows.filter(row => Object.entries(filters).every(([key, value]) => key === "revision" || key === "archived" ? true : row[key] === value)).slice(0, limit);
      const query = {
        select() { return query; }, eq(key: string, value: unknown) { filters[key] = value; return query; },
        order() { return query; }, limit(value: number) { limit = value; return query; },
        then(resolve: (result: unknown) => unknown) { return Promise.resolve({ data: data(), error: null }).then(resolve); },
        async maybeSingle() { const row = data()[0]; return { data: !row ? null : table === "workflow_revisions" ? { definition: { ...definition, workflowId: row.workflow_id, name: row.name }, definition_hash: `hash:${row.workflow_id}`, editor_snapshot: {} } : row, error: null }; },
        async single() { return { data: { document: { workflowId: filters.workflow_id } }, error: null }; },
        insert: writes, update: writes, delete: writes,
      }; return query;
    }, rpc: writes } as unknown as SupabaseClient;
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as VercelResponse;
    return { rows, before, reads, writes, response, output: () => vi.mocked(response.json).mock.calls[0]?.[0] as { items: Row[] } };
  }

  it("projects groups only from the authenticated owner's heads without mutating identity or invoking Compiler", async () => {
    const state = librarySetup();
    await handleWorkflowV2(request("definitions"), state.response, "a");
    expect(state.output().items.map(row => ({ id: row.workflowId, name: row.name, group: row.group }))).toEqual([
      { id: "one", name: "same name", group: "test" }, { id: "two", name: "same name", group: "general" }, { id: "unclassified", name: "test sample", group: undefined },
    ]);
    expect(state.output().items[2]).not.toHaveProperty("group");
    expect(state.reads.every(read => (read.filters as Row).owner_user_id === "a")).toBe(true);
    expect(state.rows).toEqual(state.before);
    expect(state.writes).not.toHaveBeenCalled(); expect(dependencies.compiler).not.toHaveBeenCalled();
  });
  it("does not reuse another owner's group or Definition for an identical workflow ID", async () => {
    const state = librarySetup();
    await handleWorkflowV2(request("definitions"), state.response, "b");
    expect(state.output().items).toHaveLength(1);
    expect(state.output().items[0]).toMatchObject({ workflowId: "one", name: "private other owner", group: "general", revision: 3 });
    expect(state.reads.every(read => (read.filters as Row).owner_user_id === "b")).toBe(true);
  });
  it.each(["create", "save", "copy"])("rejects browser classification/provenance injection on %s before any mutation", async (operation) => {
    const state = setup();
    const body = operation === "copy" ? { sourceWorkflowId: "w", sourceRevision: 3 } : { definition, editor: {}, baseRevision: 3, baseEditorRevision: 1 };
    for (const injection of [{ provenance: { libraryGroup: "test" } }, { group: "general" }, { libraryGroup: "test" }]) {
      const req = request("definitions", { ...body, ...injection }, operation === "copy" ? { op: "copy" } : operation === "save" ? { id: "w" } : {});
      if (operation === "save") req.method = "PUT";
      await expect(handleWorkflowV2(req, state.response, "a")).rejects.toMatchObject({ status: 400, code: "INVALID_REQUEST" });
    }
    expect(state.writes).not.toHaveBeenCalled(); expect(dependencies.compiler).not.toHaveBeenCalled();
  });
});
