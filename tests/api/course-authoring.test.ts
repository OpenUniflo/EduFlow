import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createUserSupabase = vi.hoisted(() => vi.fn());
const createServerSupabase = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/supabase.js", () => ({ createUserSupabase, createServerSupabase }));

import handler from "../../api/_handlers/course-authoring";

type Row = Record<string, unknown>;

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

function serverFor(draftRow: Row | null, rpc = vi.fn()) {
  return {
    rpc,
    from(table: string) {
      let inserted: Row | null = null;
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        update: () => builder,
        insert: (value: Row) => { inserted = value; return builder; },
        maybeSingle: async () => {
          if (table === "profiles") return { data: { role: "admin" }, error: null };
          if (table === "course_authoring_drafts") {
            if (inserted) return { data: { revision: 1, updated_at: "2026-08-25T00:00:00.000Z" }, error: null };
            return { data: draftRow, error: null };
          }
          return { data: null, error: null };
        }
      };
      return builder;
    }
  };
}

const state = { courseId: "course", schemaVersion: 2, microPathsEdited: false };
const previewRuntime = {
  course: { id: "course", title: "Course", description: "Draft", lifecycle: "draft", targetOutcome: undefined },
  chapters: [{ id: "chapter" }],
  lessons: [{ id: "lesson" }],
  curriculumCoverages: []
};

describe("course authoring lifecycle validation", () => {
  beforeEach(() => {
    createUserSupabase.mockReset();
    createServerSupabase.mockReset();
    createUserSupabase.mockResolvedValue({ user: { id: "admin-user" } });
  });

  it("saves an incomplete Draft without targetOutcome or a Knowledge route", async () => {
    createServerSupabase.mockReturnValue(serverFor(null));
    const recorder = responseRecorder();

    await handler({ method: "PUT", query: { courseId: "course" }, headers: {}, body: { state, previewRuntime, expectedRevision: 0 } } as unknown as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toMatchObject({ revision: 1 });
  });

  it("blocks publishing a saved Draft without a minimum Knowledge route", async () => {
    const rpc = vi.fn();
    createServerSupabase.mockReturnValue(serverFor({ payload: { state, previewRuntime } }, rpc));
    const recorder = responseRecorder();

    await handler({ method: "POST", query: { courseId: "course" }, headers: {}, body: { expectedRevision: 1 } } as unknown as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(422);
    expect(recorder.body()).toMatchObject({ error: { code: "course_learning_route_required" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows a route-only saved Draft without targetOutcome to reach the transactional publish RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ revision: "published-1" }], error: null });
    const routeOnlyPreview = { ...previewRuntime, curriculumCoverages: [{ id: "coverage", lessonId: "lesson", nodeId: "knowledge" }] };
    createServerSupabase.mockReturnValue(serverFor({ payload: { state, previewRuntime: routeOnlyPreview } }, rpc));
    const recorder = responseRecorder();

    await handler({ method: "POST", query: { courseId: "course" }, headers: {}, body: { expectedRevision: 1 } } as unknown as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(200);
    expect(rpc).toHaveBeenCalledWith("publish_course_authoring_draft", { p_course_id: "course", p_expected_revision: 1 });
  });

  it("preserves publishing behavior when targetOutcome is present", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ revision: "published-1" }], error: null });
    const routeOnlyPreview = { ...previewRuntime, course: { ...previewRuntime.course, targetOutcome: "Optional authoring metadata" }, curriculumCoverages: [{ id: "coverage", lessonId: "lesson", nodeId: "knowledge" }] };
    createServerSupabase.mockReturnValue(serverFor({ payload: { state, previewRuntime: routeOnlyPreview } }, rpc));
    const recorder = responseRecorder();

    await handler({ method: "POST", query: { courseId: "course" }, headers: {}, body: { expectedRevision: 1 } } as unknown as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(200);
    expect(rpc).toHaveBeenCalledWith("publish_course_authoring_draft", { p_course_id: "course", p_expected_revision: 1 });
  });
});
