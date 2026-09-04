import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createUserSupabase = vi.hoisted(() => vi.fn());
const createServerSupabase = vi.hoisted(() => vi.fn());
const requirePublishedCourse = vi.hoisted(() => vi.fn());
vi.mock("../_lib/supabase.js", () => ({ createUserSupabase, createServerSupabase }));
vi.mock("../_lib/courseMembership.js", () => ({ requirePublishedCourse }));

import handler, { fetchAllNavigationRows, fetchNavigationRowsByChunks } from "./navigation";

type Row = Record<string, unknown>;
type Order = { key: string; ascending: boolean };

function query(rows: Row[], navigationDecisions?: Row[]) {
  let selected = [...rows];
  const orders: Order[] = [];
  let upserted: Row | undefined;
  const materialize = () => [...selected].sort((left, right) => {
    for (const order of orders) {
      const comparison = String(left[order.key] ?? "").localeCompare(String(right[order.key] ?? ""), undefined, { numeric: true });
      if (comparison) return order.ascending ? comparison : -comparison;
    }
    return 0;
  });
  const result = (from = 0, to = 999) => Promise.resolve({ data: materialize().slice(from, to + 1), error: null });
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return builder; },
    is: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { selected = selected.filter((row) => values.includes(row[key])); return builder; },
    order: (key: string, options?: { ascending?: boolean }) => { orders.push({ key, ascending: options?.ascending !== false }); return builder; },
    range: (from: number, to: number) => result(from, to),
    upsert: (value: Row) => {
      upserted = value;
      if (navigationDecisions && !navigationDecisions.some((row) => row.user_id === value.user_id && row.course_id === value.course_id && row.policy_version === value.policy_version && row.input_hash === value.input_hash)) {
        navigationDecisions.push({ ...value, id: `decision-${navigationDecisions.length + 1}`, decided_at: "2026-09-05T00:00:00.000Z" });
      }
      return builder;
    },
    single: () => result().then(({ data, error }) => ({ data: data[0] ?? null, error })),
    then: <TResult1 = { data: Row[] | null; error: null }, TResult2 = never>(onfulfilled?: ((value: { data: Row[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) => Promise.resolve({ data: upserted ? null : materialize(), error: null }).then(onfulfilled, onrejected)
  };
  return builder;
}

function responseRecorder() {
  let statusCode = 0;
  let body: unknown;
  const response = {
    status(code: number) { statusCode = code; return response; },
    json(value: unknown) { body = value; return response; },
    setHeader: vi.fn()
  } as unknown as VercelResponse;
  return { response, statusCode: () => statusCode, body: () => body };
}

function clients(tableRows: Record<string, Row[]>) {
  const navigationDecisions: Row[] = [];
  const userClient = { from: (table: string) => query(tableRows[table] ?? []) };
  const serverClient = { from: (table: string) => query(table === "navigation_decisions" ? navigationDecisions : (tableRows[table] ?? []), navigationDecisions) };
  createUserSupabase.mockResolvedValue({ client: userClient, user: { id: "learner" }, token: "bearer" });
  createServerSupabase.mockReturnValue(serverClient);
  return { userClient };
}

describe("Navigation authority pagination", () => {
  beforeEach(() => {
    createUserSupabase.mockReset();
    createServerSupabase.mockReset();
    requirePublishedCourse.mockReset();
    requirePublishedCourse.mockResolvedValue({ id: "course", lifecycle: "published" });
  });

  it("reads through the third PostgREST page without dropping rows", async () => {
    const source = Array.from({ length: 1_201 }, (_, index) => ({ id: `row-${String(index).padStart(4, "0")}` }));
    const range = vi.fn((from: number, to: number) => Promise.resolve({ data: source.slice(from, to + 1), error: null }));
    const rows = await fetchAllNavigationRows({ range }, "Navigation pagination regression");
    expect(rows).toHaveLength(1_201);
    expect(rows[rows.length - 1]).toEqual({ id: "row-1200" });
    expect(range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it("chunks unbounded in-filters before paginating each scoped query", async () => {
    const chunkSizes: number[] = [];
    const rows = await fetchNavigationRowsByChunks(Array.from({ length: 251 }, (_, index) => `id-${index}`), (chunk) => {
      chunkSizes.push(chunk.length);
      return { range: (from: number, to: number) => Promise.resolve({ data: chunk.map((id) => ({ id })).slice(from, to + 1), error: null }) };
    }, "Navigation chunk regression");
    expect(rows).toHaveLength(251);
    expect(chunkSizes).toEqual([100, 100, 51]);
  });

  it("also bounds encoded URL length while preserving long and special-character IDs", async () => {
    const values = Array.from({ length: 12 }, (_, index) => `${String(index).padStart(2, "0")}-${"课程/节点 ?&=".repeat(20)}`);
    const input = [...values].reverse().concat(values[3]);
    const chunks: string[][] = [];
    const rows = await fetchNavigationRowsByChunks(input, (chunk) => {
      chunks.push([...chunk]);
      return { range: (from: number, to: number) => Promise.resolve({ data: chunk.map((id) => ({ id })).slice(from, to + 1), error: null }) };
    }, "Navigation encoded-length regression");
    expect(rows.map((row) => row.id)).toEqual([...values].sort());
    expect(chunks.flat()).toEqual([...values].sort());
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
    expect(chunks.every((chunk) => chunk.length === 1 || chunk.reduce((total, id) => total + encodeURIComponent(id).length + 3, 0) <= 4_000)).toBe(true);
  });

  it("lets a decision-changing prerequisite on page three block the route and reuses the same decision", async () => {
    const sourceIds = Array.from({ length: 1_201 }, (_, index) => `source-${String(index).padStart(4, "0")}`);
    const nodeIds = [...sourceIds, "target"];
    const tableRows: Record<string, Row[]> = {
      curriculum_coverages: nodeIds.map((nodeId, index) => ({ id: `coverage-${index}`, course_id: "course", lesson_id: "lesson", node_id: nodeId, display_order: index })),
      curriculum_lessons: [{ id: "lesson", course_id: "course", display_order: 0 }],
      course_target_knowledge: [{ course_id: "course", knowledge_id: "target", required: true }],
      micro_learning_paths: [], course_assignments: [], assignment_coverages: [], materials: [], material_knowledge_coverages: [], performance_results: [], user_micro_path_progress: [],
      knowledge_nodes: nodeIds.map((id) => ({ id, current_revision_id: `revision-${id}` })),
      knowledge_node_revisions: nodeIds.map((id) => ({ id: `revision-${id}`, title: id })),
      knowledge_edges: sourceIds.map((source, index) => ({ id: `edge-${String(index).padStart(4, "0")}`, source_node_id: source, target_node_id: "target", relation: "prerequisite", lifecycle_status: "active" })),
      user_knowledge_states: sourceIds.slice(0, 1_200).map((nodeId) => ({ user_id: "learner", node_id: nodeId, status: "mastered" }))
    };
    const { userClient } = clients(tableRows);
    const request = { method: "GET", query: { courseId: "course" }, headers: { authorization: "Bearer valid" } } as unknown as VercelRequest;
    const first = responseRecorder();
    await handler(request, first.response);
    const second = responseRecorder();
    await handler(request, second.response);
    expect(first.statusCode()).toBe(200);
    expect(first.body()).toMatchObject({ decisionId: "decision-1", nextAction: { kind: "next", nodeId: "source-1200", reasonCode: "knowledge_route_available" } });
    expect(second.body()).toMatchObject({ decisionId: "decision-1" });
    expect(requirePublishedCourse).toHaveBeenCalledWith(userClient, "course");
  });

  it("uses the unique result id tie-break after user/course scoping", async () => {
    const evaluatedAt = "2026-09-05T00:00:00.000Z";
    const tableRows: Record<string, Row[]> = {
      curriculum_coverages: [{ id: "coverage", course_id: "course", lesson_id: "lesson", node_id: "target", display_order: 0 }],
      curriculum_lessons: [{ id: "lesson", course_id: "course", display_order: 0 }],
      course_target_knowledge: [{ course_id: "course", knowledge_id: "target", required: true }],
      micro_learning_paths: [], materials: [], material_knowledge_coverages: [], user_micro_path_progress: [], knowledge_edges: [],
      knowledge_nodes: [{ id: "target", current_revision_id: "revision-target" }],
      knowledge_node_revisions: [{ id: "revision-target", title: "Target" }],
      user_knowledge_states: [{ user_id: "learner", node_id: "target", status: "learned" }],
      course_assignments: [{ id: "practice", course_id: "course", display_order: 0 }],
      assignment_coverages: [{ id: "assignment-coverage", course_id: "course", assignment_id: "practice", node_id: "target", required: true }],
      performance_results: [
        { id: "z-result", user_id: "learner", course_id: "course", assignment_id: "practice", outcome: "passed", evaluated_at: evaluatedAt, version: 1 },
        { id: "a-result", user_id: "learner", course_id: "course", assignment_id: "practice", outcome: "failed", evaluated_at: evaluatedAt, version: 1 },
        { id: "zz-other-user", user_id: "other", course_id: "course", assignment_id: "practice", outcome: "failed", evaluated_at: evaluatedAt, version: 1 },
        { id: "zz-other-course", user_id: "learner", course_id: "other", assignment_id: "practice", outcome: "failed", evaluated_at: evaluatedAt, version: 1 }
      ]
    };
    clients(tableRows);
    const recorder = responseRecorder();
    await handler({ method: "GET", query: { courseId: "course" }, headers: { authorization: "Bearer valid" } } as unknown as VercelRequest, recorder.response);
    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toMatchObject({ nextAction: { kind: "next", reasonCode: "knowledge_route_available" } });
  });
});
