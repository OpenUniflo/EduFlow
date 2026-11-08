import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "../_lib/http.js";
import { parseRecordsQuery, readRecords } from "./records";

type Row = Record<string, unknown>;

function fakeClient(tables: Record<string, Row[]>): SupabaseClient {
  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { rows = rows.filter((row) => row[column] === value); return builder; },
      is: (column: string, value: unknown) => { rows = rows.filter((row) => value === null ? row[column] == null : row[column] === value); return builder; },
      in: (column: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[column])); return builder; },
      order: () => builder,
      range: (fromIndex: number, toIndex: number) => Promise.resolve({ data: rows.slice(fromIndex, toIndex + 1), error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve)
    };
    return builder;
  }
  return { from } as unknown as SupabaseClient;
}

const NOW = "2026-11-02T12:00:00.000Z";

function fixture() {
  return {
    knowledge_evidence: [
      { id: "admin-micro", user_id: "admin", node_id: "k1", event_type: "micro_path_completed", source_entity_id: "p1", context: { pathId: "p1", courseId: "c1" }, occurred_at: "2026-11-01T01:00:00.000Z" },
      { id: "student-micro", user_id: "student", node_id: "k2", event_type: "micro_path_completed", source_entity_id: "p2", context: { pathId: "p2", courseId: "c2" }, occurred_at: "2026-11-01T02:00:00.000Z" }
    ],
    learning_attempts: [
      { id: "student-attempt", user_id: "student", course_id: "c2", assignment_id: "a2", attempt_number: 1, response: { kind: "code", submissionMode: "conversation" }, submitted_at: "2026-11-01T03:00:00.000Z" }
    ],
    performance_results: [
      { id: "student-result", user_id: "student", attempt_id: "student-attempt", course_id: "c2", assignment_id: "a2", version: 1, outcome: "passed", score: 1, feedback: { message: "Accepted" }, evaluator_kind: "manual", evaluated_at: "2026-11-01T04:00:00.000Z" }
    ],
    personal_course_route_versions: [
      { id: "admin-route", user_id: "admin", course_id: "c1", version_number: 1, source: "initial", include_node_ids: [], exclude_node_ids: [], created_at: "2026-10-30T01:00:00.000Z" },
      { id: "student-route", user_id: "student", course_id: "c2", version_number: 1, source: "initial", include_node_ids: [], exclude_node_ids: [], created_at: "2026-10-30T02:00:00.000Z" }
    ],
    courses: [{ id: "c1", title: "Admin Course" }, { id: "c2", title: "Student Course" }],
    knowledge_nodes: [{ id: "k1", title: "Admin Knowledge" }, { id: "k2", title: "Student Knowledge" }],
    course_assignments: [{ course_id: "c2", id: "a2", title: "Student Practice" }],
    curriculum_coverages: [],
    curriculum_lessons: [],
    curriculum_chapters: [],
    assignment_coverages: [],
    micro_learning_paths: [
      { id: "p1", knowledge_id: "k1", course_id: "c1", scope: "course", mode: "learn", status: "published", title: "Admin Path", estimated_minutes: 5 },
      { id: "p2", knowledge_id: "k2", course_id: "c2", scope: "course", mode: "learn", status: "published", title: "Student Path", estimated_minutes: 5 }
    ]
  };
}

describe("records API ownership and validation", () => {
  it("returns only the token user's own events even when the table contains another learner", async () => {
    const client = fakeClient(fixture());
    const admin = await readRecords(client, "admin", { types: [], courseId: null, range: "all", limit: 20, cursor: null, timeZone: "Asia/Shanghai", now: NOW });
    expect(admin.events.map((event) => event.id).sort()).toEqual(["micro:admin-micro", "route:admin-route"].sort());
    expect(admin.resultTotal).toBe(2);
    expect(admin.events.every((event) => !event.id.includes("student"))).toBe(true);

    const student = await readRecords(client, "student", { types: [], courseId: null, range: "all", limit: 20, cursor: null, timeZone: "Asia/Shanghai", now: NOW });
    expect(student.events.map((event) => event.id).sort()).toEqual(["evaluation:student-result", "micro:student-micro", "practice:student-attempt", "route:student-route"].sort());
    expect(student.resultTotal).toBe(4);
    expect(student.events.every((event) => !event.id.includes("admin"))).toBe(true);
    const evaluation = student.events.find((event) => event.type === "evaluation");
    expect(evaluation?.feedback).toEqual({ summary: "老师验收通过", items: [] });
    expect(JSON.stringify(student.events)).not.toContain("Accepted");
  });

  it("counts types before the type filter and paginates with the returned cursor", async () => {
    const client = fakeClient(fixture());
    const first = await readRecords(client, "student", { types: ["micro", "practice"], courseId: null, range: "all", limit: 1, cursor: null, timeZone: "Asia/Shanghai", now: NOW });
    expect(first.counts.total).toBe(4);
    expect(first.counts.byType).toEqual({ micro: 1, practice: 1, evaluation: 1, route: 1 });
    expect(first.resultTotal).toBe(2);
    expect(first.events).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    const second = await readRecords(client, "student", { types: ["micro", "practice"], courseId: null, range: "all", limit: 1, cursor: first.nextCursor, timeZone: "Asia/Shanghai", now: NOW });
    expect(second.events).toHaveLength(1);
    expect(second.events[0].id).not.toBe(first.events[0].id);
    expect(second.hasMore).toBe(false);
  });

  it("parses valid filters and rejects invalid input", () => {
    expect(parseRecordsQuery({ types: "evaluation,micro", range: "last30", limit: "10", tz: "UTC" })).toMatchObject({
      types: ["micro", "evaluation"],
      range: "last30",
      limit: 10,
      timeZone: "UTC"
    });
    expect(() => parseRecordsQuery({ types: "invented" })).toThrow(ApiError);
    expect(() => parseRecordsQuery({ range: "year" })).toThrow(ApiError);
    expect(() => parseRecordsQuery({ limit: 0 })).toThrow(ApiError);
    expect(() => parseRecordsQuery({ tz: "Mars/Olympus" })).toThrow(ApiError);
    expect(() => parseRecordsQuery({ cursor: "bad" })).toThrow(ApiError);
  });
});
