import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createUserSupabase = vi.hoisted(() => vi.fn());
const createOptionalUserSupabase = vi.hoisted(() => vi.fn());
const createServerSupabase = vi.hoisted(() => vi.fn());
const serverRpc = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/supabase.js", () => ({ createUserSupabase, createOptionalUserSupabase, createServerSupabase }));

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
  ,course_target_knowledge: [],
  knowledge_edges: [],
  assistant_messages: [],
  assistant_sessions: []
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
    createOptionalUserSupabase.mockReset();
    createOptionalUserSupabase.mockImplementation((request) => createUserSupabase(request));
    createServerSupabase.mockReset();
    serverRpc.mockReset();
    createServerSupabase.mockReturnValue({ from: (table: string) => queryResult(tableRows[table] ?? []), rpc: serverRpc });
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

  it("returns only Published Courses to an anonymous viewer", async () => {
    tableRows.courses.push({ id: "published-personal", title: "Private", description: "Owner-only after Publish", generation_status: "ready", lifecycle: "published", course_type: "personal", owner_user_id: "learner", revision: "personal-v1" });
    createOptionalUserSupabase.mockResolvedValueOnce({
      client: { from: (table: string) => queryResult(tableRows[table] ?? []), storage: { from: () => ({ createSignedUrl: vi.fn() }) } },
      user: null
    });
    const recorder = responseRecorder();
    await handler({ method: "GET", query: {}, headers: {} } as VercelRequest, recorder.response);
    expect(recorder.statusCode()).toBe(200);
    expect((recorder.body() as { courses: Array<{ course: { id: string } }> }).courses.map((runtime) => runtime.course.id)).toEqual(["route-only-course"]);
    tableRows.courses.pop();
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
    expect(recorder.body()).toMatchObject({ error: { code: "course_structure_invalid" } });
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

  it("returns an owner-private Personal Draft to its learner owner", async () => {
    tableRows.courses.push({ id: "personal-draft", title: "Personal Draft", description: "Owner-only", generation_status: "draft", lifecycle: "draft", course_type: "personal", owner_user_id: "learner", revision: "creator-draft-1" });
    tableRows.course_curricula.push({ course_id: "personal-draft", id: "personal-draft:curriculum", generation_mode: "manual" });
    tableRows.curriculum_chapters.push({ course_id: "personal-draft", id: "personal-draft:chapter", title: "Route", description: "Route", display_order: 0, color: "#7567e8", outcome: "Goal" });
    tableRows.curriculum_lessons.push({ course_id: "personal-draft", id: "personal-draft:lesson", chapter_id: "personal-draft:chapter", title: "Route", display_order: 0 });
    tableRows.curriculum_coverages.push({ course_id: "personal-draft", id: "personal-draft:coverage", lesson_id: "personal-draft:lesson", node_id: "route-knowledge", role: "assess", display_order: 0 });
    tableRows.course_target_knowledge.push({ course_id: "personal-draft", knowledge_id: "route-knowledge", required: true });
    const recorder = responseRecorder();
    await handler({ method: "GET", query: {}, headers: {} } as VercelRequest, recorder.response);
    expect((recorder.body() as { courses: Array<{ course: { id: string; lifecycle: string; ownerUserId?: string } }> }).courses).toEqual(expect.arrayContaining([expect.objectContaining({ course: expect.objectContaining({ id: "personal-draft", lifecycle: "draft", ownerUserId: "learner" }) })]));
    [tableRows.courses, tableRows.course_curricula, tableRows.curriculum_chapters, tableRows.curriculum_lessons, tableRows.curriculum_coverages, tableRows.course_target_knowledge].forEach((rows) => rows.pop());
  });

  it("creates a Personal Draft from an owned Brief without requiring Material", async () => {
    tableRows.assistant_sessions.push({ id: "session", user_id: "learner" });
    tableRows.assistant_messages.push({ id: "brief-message", session_id: "session", structured_content: { type: "course_creation_brief", schemaVersion: 1, briefId: "brief", planningId: "plan", planningMessageId: "plan-message", goal: "Train a model", targetKnowledge: [{ id: "route-knowledge", title: "Route Knowledge", description: "A valid target" }], referenceMaterialIntent: "none" } });
    serverRpc.mockResolvedValueOnce({ data: [{ course_id: "personal-new-draft", lifecycle: "draft" }], error: null });
    const recorder = responseRecorder();
    await handler({ method: "POST", query: {}, headers: {}, body: {
      creationBriefMessageId: "brief-message",
      requirements: { goal: "Train a model", learnerFoundation: "Some Python", timeConstraint: "Two weeks", preferences: ["Practice first"] },
      scope: { targetKnowledgeIds: ["route-knowledge"], prerequisiteKnowledgeIds: [], optionalKnowledgeIds: [] },
      curriculum: { chapters: [{ id: "chapter", title: "First route", knowledgeIds: ["route-knowledge"] }] },
      creatorMetadata: { desiredMaterialKnowledgeIds: [], desiredMicroKnowledgeIds: [], desiredAssignmentKnowledgeIds: ["route-knowledge"] }
    } } as VercelRequest, recorder.response);
    expect(recorder.statusCode()).toBe(201);
    expect(recorder.body()).toEqual({ courseId: "personal-new-draft", lifecycle: "draft" });
    expect(serverRpc).toHaveBeenCalledWith("create_personal_course_draft_for_brief", expect.objectContaining({ p_owner_user_id: "learner", p_creation_brief_message_id: "brief-message", p_source_course_id: null, p_target_knowledge_ids: ["route-knowledge"] }));
    tableRows.assistant_sessions.pop(); tableRows.assistant_messages.pop();
  });

  it("resumes the same owner Draft by its Course Creation Brief and returns an opaque empty result to another user", async () => {
    tableRows.courses.push({ id: "personal-resume", title: "Resume", description: "Owner-only", generation_status: "draft", lifecycle: "draft", course_type: "personal", owner_user_id: "learner", revision: "creator-draft-1", creation_brief_message_id: "brief-resume" });
    tableRows.course_curricula.push({ course_id: "personal-resume", id: "personal-resume:curriculum", generation_mode: "manual" });
    tableRows.curriculum_chapters.push({ course_id: "personal-resume", id: "personal-resume:chapter", title: "Route", description: "Route", display_order: 0, color: "#7567e8", outcome: "Goal" });
    tableRows.curriculum_lessons.push({ course_id: "personal-resume", id: "personal-resume:lesson", chapter_id: "personal-resume:chapter", title: "Route", display_order: 0 });
    tableRows.curriculum_coverages.push({ course_id: "personal-resume", id: "personal-resume:coverage", lesson_id: "personal-resume:lesson", node_id: "route-knowledge", role: "assess", display_order: 0 });
    tableRows.course_target_knowledge.push({ course_id: "personal-resume", knowledge_id: "route-knowledge", required: true });
    const owner = responseRecorder();
    await handler({ method: "GET", query: { creationBriefMessageId: "brief-resume" }, headers: {} } as unknown as VercelRequest, owner.response);
    expect(owner.body()).toMatchObject({ courseId: "personal-resume", lifecycle: "draft" });
    createOptionalUserSupabase.mockResolvedValueOnce({ client: { from: (table: string) => queryResult(tableRows[table] ?? []), storage: { from: () => ({ createSignedUrl: vi.fn() }) } }, user: { id: "other-user" } });
    const other = responseRecorder();
    await handler({ method: "GET", query: { creationBriefMessageId: "brief-resume" }, headers: {} } as unknown as VercelRequest, other.response);
    expect(other.statusCode()).toBe(200);
    expect(other.body()).toEqual({ course: null, courseId: null, lifecycle: null });
    [tableRows.courses, tableRows.course_curricula, tableRows.curriculum_chapters, tableRows.curriculum_lessons, tableRows.curriculum_coverages, tableRows.course_target_knowledge].forEach((rows) => rows.pop());
  });

  it("activates Personal Course membership on completion without writing Knowledge progress", async () => {
    tableRows.courses.push({ id: "personal-publish", title: "Personal", description: "Personal", generation_status: "draft", lifecycle: "draft", course_type: "personal", owner_user_id: "learner", revision: "creator-draft-1" });
    tableRows.course_curricula.push({ course_id: "personal-publish", id: "personal-publish:curriculum", generation_mode: "manual" });
    tableRows.curriculum_chapters.push({ course_id: "personal-publish", id: "personal-publish:chapter", title: "Route", description: "Route", display_order: 0, color: "#7567e8", outcome: "Goal" });
    tableRows.curriculum_lessons.push({ course_id: "personal-publish", id: "personal-publish:lesson", chapter_id: "personal-publish:chapter", title: "Route", display_order: 0 });
    tableRows.curriculum_coverages.push({ course_id: "personal-publish", id: "personal-publish:coverage", lesson_id: "personal-publish:lesson", node_id: "route-knowledge", role: "assess", display_order: 0 });
    tableRows.course_target_knowledge.push({ course_id: "personal-publish", knowledge_id: "route-knowledge", required: true });
    const membershipUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
    createServerSupabase.mockReturnValue({ from: (table: string) => table === "user_course_states" ? { upsert: membershipUpsert } : queryResult(tableRows[table] ?? []), rpc: serverRpc });
    const recorder = responseRecorder();
    await handler({ method: "PATCH", query: {}, headers: {}, body: { courseId: "personal-publish", lifecycle: "published" } } as VercelRequest, recorder.response);
    expect(recorder.statusCode()).toBe(200);
    expect(membershipUpsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "learner", course_id: "personal-publish", is_active: true }));
    [tableRows.courses, tableRows.course_curricula, tableRows.curriculum_chapters, tableRows.curriculum_lessons, tableRows.curriculum_coverages, tableRows.course_target_knowledge].forEach((rows) => rows.pop());
  });
});
