import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const dependency = vi.hoisted(() => ({ client: undefined as unknown as SupabaseClient }));
vi.mock("./supabase.js", () => ({ createServerSupabase: () => dependency.client }));
import { handleWorkflowV2, readWorkflowDocument } from "./workflowV2.js";

type Row = Record<string, unknown>;
function fixture(headRevision = 1) {
  const original = { workflowId: "workflow", definitionRevision: 1, editorRevision: 1, nodes: { calc: { x: 280, y: 180 } }, edges: {} };
  const second = { ...original, definitionRevision: 2, editorRevision: 3, nodes: { calc: { x: 400, y: 300 } } };
  const current = { ...original, definitionRevision: headRevision, editorRevision: headRevision === 1 ? 2 : 4, nodes: { calc: { x: 999, y: 999 } } };
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table); const filters: Row = {};
      const query = {
        select() { return query; }, eq(key: string, value: unknown) { filters[key] = value; return query; },
        async maybeSingle() {
          if (table === "workflow_v2_definitions") return { data: { current_revision: headRevision, archived: false }, error: null };
          if (table === "workflow_revisions") return { data: { definition: { workflowId: "workflow", revision: filters.revision, name: "Saved workflow", description: "", nodes: [] }, editor_snapshot: filters.revision === 1 ? original : second }, error: null };
          return { data: null, error: null };
        },
        async single() { return { data: { document: current }, error: null }; },
      };
      return query;
    },
    rpc: vi.fn(async () => ({ data: { workflowId: "new-private-copy", revision: 1, editorRevision: 1 }, error: null })),
  };
  dependency.client = client as unknown as SupabaseClient;
  return { client: dependency.client, rpc: client.rpc, calls, original, second, current };
}

describe("Definition revision and Editor Document authority", () => {
  it("explicit revision=head uses immutable layout despite editor-only save", async () => {
    const state = fixture();
    const historical = await readWorkflowDocument(state.client, "owner", "workflow", 1);
    expect(historical.editor).toEqual(state.original);
    expect(state.calls).not.toContain("workflow_editor_documents");
  });
  it("ordinary GET keeps the latest editor-only saved layout", async () => {
    const state = fixture();
    const current = await readWorkflowDocument(state.client, "owner", "workflow");
    expect(current.editor).toEqual(state.current);
    expect(current.definition.revision).toBe(1);
    expect(state.calls).toContain("workflow_editor_documents");
  });
  it("copying the current saved definition keeps its latest matching editor document", async () => {
    const state = fixture();
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as VercelResponse;
    const request = { method: "POST", query: { resource: "definitions", op: "copy" }, body: { sourceWorkflowId: "workflow", sourceRevision: 1 }, headers: {} } as unknown as VercelRequest;
    await handleWorkflowV2(request, response, "owner");
    const args = state.rpc.mock.calls[0] as unknown as [string, Row];
    expect(args[0]).toBe("workflow_v2_save");
    expect((args[1].p_editor as Row).nodes).toEqual(state.current.nodes);
    expect(args[1].p_provenance).toEqual({ copiedFromWorkflowId: "workflow", sourceRevision: 1 });
  });
  it("copying an older revision preserves its immutable snapshot rather than head layout", async () => {
    const state = fixture(2);
    const oldCopy = await readWorkflowDocument(state.client, "owner", "workflow", 1, "current");
    expect(oldCopy.editor).toEqual(state.original);
    const headSnapshot = await readWorkflowDocument(state.client, "owner", "workflow", 2);
    expect(headSnapshot.editor).toEqual(state.second);
    expect(state.calls).not.toContain("workflow_editor_documents");
  });
});
