import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const optionalText = (row: Row, key: string) => row[key] == null ? undefined : String(row[key]);

async function readCourseMicroPaths(server: ReturnType<typeof createServerSupabase>, courseId: string) {
  const [pathsResult, unitsResult, stepsResult] = await Promise.all([
    server.from("micro_learning_paths").select("*").eq("course_id", courseId).order("id"),
    server.from("micro_units").select("*").order("path_id").order("position"),
    server.from("micro_steps").select("*").order("unit_id").order("position")
  ]);
  const paths = dataOrThrow(pathsResult.data as Row[] | null, pathsResult.error, "Authoring Micro paths read");
  const units = dataOrThrow(unitsResult.data as Row[] | null, unitsResult.error, "Authoring Micro units read");
  const steps = dataOrThrow(stepsResult.data as Row[] | null, stepsResult.error, "Authoring Micro steps read");
  return paths.map((path) => ({
    id: text(path, "id"), knowledgeId: text(path, "knowledge_id"), courseId: optionalText(path, "course_id"), scope: text(path, "scope"), title: text(path, "title"), description: optionalText(path, "description"), mode: text(path, "mode"), estimatedMinutes: Number(path.estimated_minutes), required: Boolean(path.required), status: text(path, "status"),
    units: units.filter((unit) => text(unit, "path_id") === text(path, "id")).map((unit) => ({
      id: text(unit, "id"), pathId: text(unit, "path_id"), title: text(unit, "title"), description: optionalText(unit, "description"), position: Number(unit.position), estimatedMinutes: Number(unit.estimated_minutes), required: Boolean(unit.required),
      steps: steps.filter((step) => text(step, "unit_id") === text(unit, "id")).map((step) => ({ id: text(step, "id"), kind: text(step, "kind"), title: text(step, "title"), body: text(step, "content"), interaction: step.interaction ?? undefined, successFeedback: optionalText(step, "success_feedback"), retryFeedback: optionalText(step, "retry_feedback"), transition: step.transition ?? undefined }))
    }))
  }));
}

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
  const preview = previewRuntime as { course?: { id?: unknown }; chapters?: unknown; lessons?: unknown };
  if (draft.courseId !== courseId || draft.schemaVersion !== 2 || preview.course?.id !== courseId) throw new ApiError(400, "invalid_authoring_draft", "Draft identity does not match the Course");
  if (!Array.isArray(preview.chapters) || !Array.isArray(preview.lessons)) throw new ApiError(400, "invalid_authoring_preview", "Preview runtime is incomplete");
}

async function readAuthoringDraftPayload(server:ReturnType<typeof createServerSupabase>,courseId:string) {
  const result=await server.from("course_authoring_drafts").select("payload").eq("course_id",courseId).maybeSingle();
  const row=dataOrThrow(result.data as Row|null,result.error,"Authoring draft publish lookup");
  if(!row)throw new ApiError(404,"authoring_draft_not_found","The requested Course draft does not exist");
  return row.payload as Record<string,unknown>;
}

function assertPublishablePreview(payload:Record<string,unknown>) {
  const runtime=payload.previewRuntime as Record<string,unknown>|undefined;
  const chapters=runtime?.chapters; const lessons=runtime?.lessons; const coverages=runtime?.curriculumCoverages;
  if(!Array.isArray(chapters)||!chapters.length||!Array.isArray(lessons)||!lessons.length||!Array.isArray(coverages)||!coverages.length) {
    throw new ApiError(422,"course_learning_route_required","A Published Course requires a Chapter, Lesson, and Knowledge route");
  }
}

async function assertPublishedH5PReferences(server:ReturnType<typeof createServerSupabase>,payload:Record<string,unknown>) {
  const state=payload.state as Record<string,unknown>|undefined;
  if(state?.microPathsEdited!==true)return;
  const refs=new Set<string>();
  for(const path of Array.isArray(state.microPaths)?state.microPaths:[])for(const unit of Array.isArray((path as Row).units)?(path as Row).units as unknown[]:[])for(const step of Array.isArray((unit as Row).steps)?(unit as Row).steps as unknown[]:[]) {
    const interaction=(step as Row).interaction as Row|undefined;if(interaction?.type==="h5p"&&typeof interaction.contentRef==="string")refs.add(interaction.contentRef);
  }
  if(!refs.size)return;
  const contents=await server.from("h5p_contents").select("id").in("id",[...refs]).eq("status","published");
  const rows=dataOrThrow(contents.data as Row[]|null,contents.error,"Authoring H5P references lookup"); const found=new Set(rows.map((item)=>text(item,"id")));
  const missing=[...refs].filter((id)=>!found.has(id));if(missing.length)throw new ApiError(422,"h5p_content_unavailable",`Published H5P content is unavailable: ${missing.join(", ")}`);
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  const courseId = typeof request.query.courseId === "string" ? request.query.courseId : undefined;
  if (!courseId) throw new ApiError(400, "course_id_required", "courseId is required");
  const { user, server } = await requireTeacher(request);

  if (request.method === "GET") {
    const [result, baseMicroPaths] = await Promise.all([
      server.from("course_authoring_drafts").select("payload,revision,updated_at").eq("course_id", courseId).maybeSingle(),
      readCourseMicroPaths(server, courseId)
    ]);
    const row = dataOrThrow(result.data as Row | null, result.error, "Authoring draft read");
    if (!row) { json(response, 200, { draft: null, baseMicroPaths }); return; }
    const payload = row.payload as Record<string, unknown>;
    json(response, 200, { draft: { state: payload.state, previewRuntime: payload.previewRuntime, revision: Number(row.revision), updatedAt: text(row, "updated_at") }, baseMicroPaths });
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
    const payload=await readAuthoringDraftPayload(server,courseId);
    assertPublishablePreview(payload);
    await assertPublishedH5PReferences(server,payload);
    const result = await server.rpc("publish_course_authoring_draft", { p_course_id: courseId, p_expected_revision: expectedRevision });
    const rows = rpcRows(result, "Course publish");
    if (!rows[0]) throw new ApiError(500, "course_publish_failed", "Course was not published");
    json(response, 200, { revision: text(rows[0], "revision"), published: true });
    return;
  }
  return methodNotAllowed(response, ["GET", "PUT", "POST"]);
});
