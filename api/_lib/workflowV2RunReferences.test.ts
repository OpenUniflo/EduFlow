import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { workflowRunReferenceCount, workflowRunReferenceSnapshot, workflowRunReferencesDto } from "./workflowV2RunReferences";

type Row = Record<string, unknown>;
const runId = "11111111-1111-4111-8111-111111111111";
const definition = (workflowId: string, revision: number, marker: string) => ({ schemaVersion: "2.0", workflowId, revision, name: `${workflowId}-${revision}`, nodes: [{ id: marker }] });
const frozen = (registry: Row = {}) => ({
  run_id: runId, owner_user_id: "owner", workflow_id: "root", revision: 1, status: "success",
  registry_snapshot: {
    workflowReferences: {
      version: 1, root: { workflowId: "root", revision: 1 }, rootEnvironmentRef: "local",
      targets: [
        { workflowId: "child", revision: 2, environmentRef: "local", definition: definition("child", 2, "child-v2") },
        { workflowId: "child", revision: 1, environmentRef: "local-alt", definition: definition("child", 1, "child-v1-alt") },
      ],
      environments: [
        { environmentRef: "local-alt", environmentRevision: "env-7", registrySnapshot: { providers: [{ secretRef: "SHOULD_NOT_LEAK" }] } },
      ],
    },
    ...registry,
  },
});

describe("Run frozen reference projection", () => {
  it("returns exact targets and environments without leaking the worker registry snapshot", () => {
    const snapshot = workflowRunReferenceSnapshot(frozen().registry_snapshot);
    expect(snapshot).toMatchObject({
      available: true, version: 1, rootEnvironmentRef: "local", targetCount: 2,
      root: { workflowId: "root", revision: 1 },
      targets: [
        { workflowId: "child", revision: 2, environmentRef: "local", name: "child-2" },
        { workflowId: "child", revision: 1, environmentRef: "local-alt", name: "child-1" },
      ],
      environments: [{ environmentRef: "local-alt", environmentRevision: "env-7" }],
    });
    expect(JSON.stringify(snapshot)).not.toContain("SHOULD_NOT_LEAK");
    expect(JSON.stringify(snapshot)).not.toContain("registrySnapshot");
    expect(workflowRunReferenceCount(frozen().registry_snapshot)).toBe(2);
  });

  it("marks missing and malformed snapshots explicitly instead of resolving a current target", () => {
    expect(workflowRunReferenceSnapshot({})).toEqual({ available: false, reason: "missing", targets: [], environments: [] });
    expect(workflowRunReferencesDto({ workflowReferences: { version: 2 } })).toEqual({ available: false, reason: "invalid", targets: [], environments: [] });
    expect(workflowRunReferenceCount(null)).toBe(0);
  });

  it("drops a target whose frozen definition identity does not match and deduplicates exact identities", () => {
    const raw = frozen().registry_snapshot as Row;
    const references = raw.workflowReferences as Row;
    const targets = references.targets as Row[];
    targets.push({ workflowId: "child", revision: 2, environmentRef: "local", definition: definition("other", 2, "wrong") });
    targets.push({ workflowId: "child", revision: 2, environmentRef: "local", definition: definition("child", 2, "duplicate") });
    const snapshot = workflowRunReferenceSnapshot(raw);
    expect(snapshot.available).toBe(true);
    if (snapshot.available) expect(snapshot.targets).toHaveLength(2);
  });
});

const dependencies = vi.hoisted(() => ({ server: undefined as SupabaseClient | undefined }));
vi.mock("./supabase.js", () => ({ createServerSupabase: () => dependencies.server }));
import { handleWorkflowV2 } from "./workflowV2.js";

function response() { const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as VercelResponse; return { response, output: () => vi.mocked(response.json).mock.calls[0]?.[0] as Row }; }
const request = (query: Row) => ({ method: "GET", query: { resource: "runs", ...query }, body: undefined, headers: {} } as unknown as VercelRequest);

beforeEach(() => { dependencies.server = undefined; });

describe("Run reference API projection", () => {
  it("returns only the authenticated owner's frozen Run closure", async () => {
    const filters: Row = {};
    const client = {
      from(table: string) {
        const query: Row = {
          select() { return query; }, eq(key: string, value: unknown) { filters[`${table}.${key}`] = value; return query; },
          async maybeSingle() { return { data: table === "workflow_live_runs" && filters["workflow_live_runs.owner_user_id"] === "owner" ? frozen() : null, error: null }; },
        };
        return query;
      },
      rpc: vi.fn(),
    } as unknown as SupabaseClient;
    dependencies.server = client;
    const state = response();
    await handleWorkflowV2(request({ id: runId, op: "references" }), state.response, "owner");
    expect(filters["workflow_live_runs.owner_user_id"]).toBe("owner");
    expect(filters["workflow_live_runs.run_id"]).toBe(runId);
    expect(state.output()).toMatchObject({ available: true, targetCount: 2 });
    expect((state.output().targets as Row[])[0]).toMatchObject({ workflowId: "child", revision: 2 });
  });

  it("does not serve another owner's Run", async () => {
    const client = {
      from(table: string) {
        const query: Row = {
          select() { return query; }, eq() { return query; },
          async maybeSingle() { return { data: table === "workflow_live_runs" ? null : null, error: null }; },
          async then() { return { data: null, error: null }; },
        };
        return query;
      },
      rpc: vi.fn(),
    } as unknown as SupabaseClient;
    dependencies.server = client;
    await expect(handleWorkflowV2(request({ id: runId, op: "references" }), response().response, "other")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});
