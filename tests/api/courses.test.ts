import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createUserSupabase = vi.hoisted(() => vi.fn());
const createServerSupabase = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/supabase.js", () => ({ createUserSupabase, createServerSupabase }));

import handler from "../../api/_handlers/courses";

type Row = Record<string, unknown>;

const tableRows: Record<string, Row[]> = {
  profiles: [{ id: "learner", role: "student" }],
  courses: [
    { id: "route-only-course", title: "Route-only Course", description: "A valid Course without optional assets", generation_status: "ready", lifecycle: "published", revision: "route-only-v1" },
    { id: "empty-draft", title: "Empty Draft", description: "A legitimate authoring container", generation_status: "draft", lifecycle: "draft", revision: "draft-1", target_outcome: null }
  ],
  course_curricula: [
    { course_id: "route-only-course", id: "route-only-curriculum", generation_mode: "manual" },
    { course_id: "empty-draft", id: "empty-draft-curriculum", generation_mode: "manual" }
  ],
  curriculum_chapters: [
    { course_id: "route-only-course", id: "route-only-chapter", title: "Route", description: "Route chapter", display_order: 0, color: "#6078db", outcome: "Understand the route" },
    { course_id: "empty-draft", id: "empty-draft-chapter", title: "Draft", description: "Draft chapter", display_order: 0, color: "#6078db", outcome: "" }
  ],
  curriculum_lessons: [
    { course_id: "route-only-course", id: "route-only-lesson", chapter_id: "route-only-chapter", title: "Route lesson", display_order: 0 },
    { course_id: "empty-draft", id: "empty-draft-lesson", chapter_id: "empty-draft-chapter", title: "Draft lesson", display_order: 0 }
  ],
  curriculum_coverages: [{ course_id: "route-only-course", id: "route-only-coverage", lesson_id: "route-only-lesson", node_id: "route-knowledge", role: "introduce", display_order: 0 }],
  knowledge_nodes: [{ id: "route-knowledge", status: "active" }],
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
  let selected = [...rows];
  let patch: Row | null = null;
  const result = () => Promise.resolve({ data: selected.map((row) => patch ? { ...row, ...patch } : row), error: null });
  const builder = {
    select: () => builder,
    insert: (value: Row) => { selected = [value]; return builder; },
    update: (value: Row) => { patch = value; return builder; },
    eq: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { selected = selected.filter((row) => values.includes(row[key])); return builder; },
    order: () => builder,
    maybeSingle: () => result().then(({ data, error }) => ({ data: data[0] ?? null, error })),
    then: <TResult1 = { data: Row[]; error: null }, TResult2 = never>(onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) => result().then(onfulfilled, onrejected)
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
    tableRows.profiles[0].role = "student";
    createUserSupabase.mockReset();
    createUserSupabase.mockResolvedValue({
      client: {
        from: (table: string) => queryResult(tableRows[table] ?? []),
        storage: { from: () => ({ createSignedUrl: vi.fn() }) }
      },
      user: { id: "learner" },
      token: "token"
    });
    createServerSupabase.mockReset();
    createServerSupabase.mockReturnValue({ from: (table: string) => queryResult(tableRows[table] ?? []) });
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

  it("keeps Draft Courses hidden from students", async () => {
    const recorder = responseRecorder();
    await handler({ method: "GET", query: {}, headers: {} } as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(200);
    expect((recorder.body() as { courses: Array<{ course: { id: string } }> }).courses.map((runtime) => runtime.course.id)).toEqual(["route-only-course"]);
  });

  it("returns an incomplete Draft alongside Published Courses to an admin", async () => {
    tableRows.profiles[0].role = "admin";
    const recorder = responseRecorder();
    await handler({ method: "GET", query: {}, headers: {} } as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toMatchObject({ courses: [
      { course: { id: "route-only-course", lifecycle: "published" }, curriculumCoverages: [expect.any(Object)] },
      { course: { id: "empty-draft", lifecycle: "draft", targetOutcome: undefined }, curriculumCoverages: [], assignments: [], materials: [] }
    ] });
    tableRows.profiles[0].role = "student";
  });

  it("blocks direct publication when a Draft has no Knowledge route", async () => {
    tableRows.profiles[0].role = "admin";
    const recorder = responseRecorder();
    await handler({ method: "PATCH", query: {}, headers: {}, body: { courseId: "empty-draft", lifecycle: "published" } } as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(422);
    expect(recorder.body()).toMatchObject({ error: { code: "course_learning_route_required" } });
    tableRows.profiles[0].role = "student";
  });

  it("allows a route-only Course to pass the direct publication gate", async () => {
    tableRows.profiles[0].role = "admin";
    const recorder = responseRecorder();
    await handler({ method: "PATCH", query: {}, headers: {}, body: { courseId: "route-only-course", lifecycle: "published" } } as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toMatchObject({ courseId: "route-only-course", lifecycle: "published" });
    tableRows.profiles[0].role = "student";
  });

  it("creates an editable Draft without requiring targetOutcome", async () => {
    tableRows.profiles[0].role = "admin";
    const recorder = responseRecorder();
    await handler({ method: "POST", query: {}, headers: {}, body: { title: "Untargeted Draft" } } as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(201);
    expect(recorder.body()).toMatchObject({ courseId: expect.stringMatching(/^course-/) });
    tableRows.profiles[0].role = "student";
  });
});
