import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createUserSupabase = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/supabase.js", () => ({ createUserSupabase }));

import handler from "../../api/_handlers/courses";

type Row = Record<string, unknown>;

const tableRows: Record<string, Row[]> = {
  profiles: [{ id: "learner", role: "student" }],
  courses: [{ id: "route-only-course", title: "Route-only Course", description: "A valid Course without optional assets", generation_status: "ready", lifecycle: "published", revision: "route-only-v1" }],
  course_curricula: [{ course_id: "route-only-course", id: "route-only-curriculum", generation_mode: "manual" }],
  curriculum_chapters: [{ course_id: "route-only-course", id: "route-only-chapter", title: "Route", description: "Route chapter", display_order: 0, color: "#6078db", outcome: "Understand the route" }],
  curriculum_lessons: [{ course_id: "route-only-course", id: "route-only-lesson", chapter_id: "route-only-chapter", title: "Route lesson", display_order: 0 }],
  curriculum_coverages: [{ course_id: "route-only-course", id: "route-only-coverage", lesson_id: "route-only-lesson", node_id: "route-knowledge", role: "introduce", display_order: 0 }],
  curriculum_sequences: [],
  course_assignments: [],
  assignment_coverages: [],
  assignment_dependencies: [],
  chapter_outcomes: [],
  assignment_outcome_compositions: [],
  final_projects: [],
  final_project_outcome_compositions: [],
  materials: [],
  material_segments: [],
  material_knowledge_coverages: []
};

function queryResult(rows: Row[]) {
  const result = Promise.resolve({ data: rows, error: null });
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: result.then.bind(result)
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

describe("GET /api/courses", () => {
  beforeEach(() => {
    createUserSupabase.mockReset();
    createUserSupabase.mockResolvedValue({
      client: {
        from: (table: string) => queryResult(tableRows[table] ?? []),
        storage: { from: () => ({ createSignedUrl: vi.fn() }) }
      },
      user: { id: "learner" },
      token: "token"
    });
  });

  it("maps a persisted route-only Course while every optional asset table is empty", async () => {
    const recorder = responseRecorder();
    await handler({ method: "GET", query: {}, headers: {} } as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toEqual({
      courses: [expect.objectContaining({
        course: expect.objectContaining({ id: "route-only-course", generationStatus: "ready" }),
        curriculum: expect.objectContaining({ id: "route-only-curriculum" }),
        chapters: [expect.objectContaining({ id: "route-only-chapter" })],
        lessons: [expect.objectContaining({ id: "route-only-lesson" })],
        curriculumCoverages: [expect.objectContaining({ nodeId: "route-knowledge" })],
        assignments: [],
        assignmentCoverages: [],
        assignmentDependencies: [],
        chapterOutcomes: [],
        assignmentOutcomeCompositions: [],
        finalProjects: [],
        finalProjectOutcomeCompositions: [],
        materials: [],
        materialKnowledgeCoverages: []
      })]
    });
  });
});
