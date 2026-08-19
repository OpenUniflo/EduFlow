import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase } from "./_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "./_lib/http.js";
import { dataOrThrow } from "./_lib/query.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);

function rpcRows(result: { data: unknown; error: any }, operation: string) {
  if (result.error?.code === "40001") throw new ApiError(409, "authoring_draft_conflict", "The draft changed in another session. Reload before saving again.");
  if (result.error?.code === "P0002") throw new ApiError(404, "authoring_draft_not_found", "The requested Course draft does not exist");
  return dataOrThrow(result.data as Row[] | null, result.error, operation);
}

async function requireTeacher(request: VercelRequest) {
  const { user } = await createUserSupabase(request);
  const server = createServerSupabase();
  const result = await server.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const profile = dataOrThrow(result.data as Row | null, result.error, "Authoring role lookup");
  if (!profile || !["teacher", "admin"].includes(text(profile, "role"))) throw new ApiError(403, "authoring_forbidden", "Teacher or admin permission is required");
  return { user, server };
}

function assertDraftShape(courseId: string, state: unknown, previewRuntime: unknown) {
  if (!state || typeof state !== "object" || Array.isArray(state) || !previewRuntime || typeof previewRuntime !== "object" || Array.isArray(previewRuntime)) throw new ApiError(400, "invalid_authoring_draft", "A draft state and preview runtime are required");
  const draft = state as Record<string, unknown>;
  const preview = previewRuntime as { course?: { id?: unknown; targetOutcome?: unknown }; chapters?: unknown; lessons?: unknown };
  if (draft.courseId !== courseId || draft.schemaVersion !== 2 || preview.course?.id !== courseId) throw new ApiError(400, "invalid_authoring_draft", "Draft identity does not match the Course");
  if (!Array.isArray(preview.chapters) || !Array.isArray(preview.lessons)) throw new ApiError(400, "invalid_authoring_preview", "Preview runtime is incomplete");
  if (!String(preview.course?.targetOutcome ?? "").trim()) throw new ApiError(400, "course_target_outcome_required", "A Course target outcome is required before publishing");
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  const courseId = typeof request.query.courseId === "string" ? request.query.courseId : undefined;
  if (!courseId) throw new ApiError(400, "course_id_required", "courseId is required");
  const { user, server } = await requireTeacher(request);

  if (request.method === "GET") {
    const result = await server.from("course_authoring_drafts").select("payload,revision,updated_at").eq("course_id", courseId).maybeSingle();
    const row = dataOrThrow(result.data as Row | null, result.error, "Authoring draft read");
    if (!row) { json(response, 200, { draft: null }); return; }
    const payload = row.payload as Record<string, unknown>;
    json(response, 200, { draft: { state: payload.state, previewRuntime: payload.previewRuntime, revision: Number(row.revision), updatedAt: text(row, "updated_at") } });
    return;
  }

  if (request.method === "PUT") {
    const body = request.body as { state?: unknown; previewRuntime?: unknown; expectedRevision?: unknown };
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new ApiError(400, "invalid_authoring_revision", "expectedRevision is required");
    assertDraftShape(courseId, body.state, body.previewRuntime);
    const payload = { state: body.state, previewRuntime: body.previewRuntime };
    const currentResult = await server.from("course_authoring_drafts").select("revision").eq("course_id", courseId).maybeSingle();
    const current = dataOrThrow(currentResult.data as Row | null, currentResult.error, "Authoring draft revision lookup");
    if (!current) {
      if (expectedRevision !== 0) throw new ApiError(409, "authoring_draft_conflict", "The draft changed in another session. Reload before saving again.");
      const inserted = await server.from("course_authoring_drafts").insert({ course_id: courseId, author_user_id: user.id, schema_version: 2, payload, revision: 1 }).select("revision,updated_at").maybeSingle();
      const row = dataOrThrow(inserted.data as Row | null, inserted.error, "Authoring draft create");
      if (!row) throw new ApiError(500, "authoring_draft_save_failed", "Draft was not saved");
      json(response, 200, { revision: Number(row.revision), updatedAt: text(row, "updated_at") }); return;
    }
    if (Number(current.revision) !== expectedRevision) throw new ApiError(409, "authoring_draft_conflict", "The draft changed in another session. Reload before saving again.");
    const updated = await server.from("course_authoring_drafts").update({ author_user_id: user.id, payload, revision: expectedRevision + 1, updated_at: new Date().toISOString() }).eq("course_id", courseId).eq("revision", expectedRevision).select("revision,updated_at").maybeSingle();
    const row = dataOrThrow(updated.data as Row | null, updated.error, "Authoring draft update");
    if (!row) throw new ApiError(409, "authoring_draft_conflict", "The draft changed in another session. Reload before saving again.");
    json(response, 200, { revision: Number(row.revision), updatedAt: text(row, "updated_at") });
    return;
  }

  if (request.method === "POST") {
    const expectedRevision = Number((request.body as { expectedRevision?: unknown }).expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new ApiError(400, "invalid_authoring_revision", "A saved draft revision is required");
    const result = await server.rpc("publish_course_authoring_draft", { p_course_id: courseId, p_expected_revision: expectedRevision });
    const rows = rpcRows(result, "Course publish");
    if (!rows[0]) throw new ApiError(500, "course_publish_failed", "Course was not published");
    json(response, 200, { revision: text(rows[0], "revision"), published: true });
    return;
  }
  return methodNotAllowed(response, ["GET", "PUT", "POST"]);
});
