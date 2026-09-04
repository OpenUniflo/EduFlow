import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createOptionalUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";
import { recomputeMastery } from "../_lib/mastery.js";
import { activateCourse, requireCourseKnowledge } from "../_lib/courseMembership.js";
import { h5pCompletionPasses, nativeInteractionCorrect, parseH5PCompletion, type NativeAnswer } from "../_lib/microInteraction.js";

type Row = Record<string, unknown>;
const value = (row: Row, field: string) => row[field];
const text = (row: Row, field: string) => String(value(row, field));
const optionalText = (row: Row, field: string) => value(row, field) == null ? undefined : String(value(row, field));

const object = (candidate: unknown): Record<string, unknown> | null => candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : null;

function mapProgress(row: Row) {
  return { pathId: text(row, "path_id"), status: text(row, "status"), currentUnitId: optionalText(row, "current_unit_id"), currentStepId: optionalText(row, "current_step_id"), startedAt: optionalText(row, "started_at"), completedAt: optionalText(row, "completed_at"), updatedAt: text(row, "updated_at") };
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  const { client, user } = await createOptionalUserSupabase(request);
  if (request.method === "GET") {
    const [pathsResult, unitsResult, stepsResult, pathProgressResult, unitProgressResult] = await Promise.all([
      client.from("micro_learning_paths").select("*").eq("status", "published").order("id"),
      client.from("micro_units").select("*").order("path_id").order("position"),
      client.from("micro_steps").select("*").order("unit_id").order("position"),
      user ? client.from("user_micro_path_progress").select("*").eq("user_id", user.id) : Promise.resolve({ data: [], error: null }),
      user ? client.from("user_micro_unit_progress").select("*").eq("user_id", user.id) : Promise.resolve({ data: [], error: null })
    ]);
    const paths = dataOrThrow(pathsResult.data as Row[] | null, pathsResult.error, "Micro paths query");
    const units = dataOrThrow(unitsResult.data as Row[] | null, unitsResult.error, "Micro units query");
    const steps = dataOrThrow(stepsResult.data as Row[] | null, stepsResult.error, "Micro steps query");
    const pathProgress = dataOrThrow(pathProgressResult.data as Row[] | null, pathProgressResult.error, "Micro path progress query");
    const unitProgress = dataOrThrow(unitProgressResult.data as Row[] | null, unitProgressResult.error, "Micro unit progress query");
    json(response, 200, {
      paths: paths.map((path) => ({
        id: text(path, "id"), knowledgeId: text(path, "knowledge_id"), courseId: optionalText(path, "course_id"), scope: text(path, "scope"), title: text(path, "title"), description: optionalText(path, "description"), mode: text(path, "mode"), estimatedMinutes: Number(value(path, "estimated_minutes")), required: Boolean(value(path, "required")), status: text(path, "status"),
        units: units.filter((unit) => text(unit, "path_id") === text(path, "id")).map((unit) => ({
          id: text(unit, "id"), pathId: text(unit, "path_id"), title: text(unit, "title"), description: optionalText(unit, "description"), position: Number(value(unit, "position")), estimatedMinutes: Number(value(unit, "estimated_minutes")), required: Boolean(value(unit, "required")),
          steps: steps.filter((step) => text(step, "unit_id") === text(unit, "id")).map((step) => ({ id: text(step, "id"), kind: text(step, "kind"), title: text(step, "title"), body: text(step, "content"), interaction: value(step, "interaction") ?? undefined, successFeedback: optionalText(step, "success_feedback"), retryFeedback: optionalText(step, "retry_feedback"), transition: value(step, "transition") ?? undefined }))
        }))
      })),
      pathProgress: pathProgress.map(mapProgress),
      unitProgress: unitProgress.map((row) => ({ unitId: text(row, "unit_id"), pathId: text(row, "path_id"), status: text(row, "status"), currentStepId: optionalText(row, "current_step_id"), completedStepIds: value(row, "completed_step_ids") ?? [], startedAt: optionalText(row, "started_at"), completedAt: optionalText(row, "completed_at"), updatedAt: text(row, "updated_at") }))
    });
    return;
  }
  if (request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);
  const body = request.body as { action?: string; pathId?: string; unitId?: string; stepId?: string; submission?: unknown; answer?: NativeAnswer; contentRef?: string; contextCourseId?: string };
  if (!body.action) throw new ApiError(400, "invalid_micro_action", "action is required");
  if(body.action==="resolve-h5p-content") {
    if(!body.contentRef)throw new ApiError(400,"invalid_h5p_request","contentRef is required");
    const contentResult=await client.from("h5p_contents").select("*").eq("id",body.contentRef).eq("status","published").maybeSingle();const content=dataOrThrow(contentResult.data as Row|null,contentResult.error,"H5P authoring content lookup");
    if(!content)throw new ApiError(404,"h5p_content_unavailable","H5P content is unavailable");const {data:publicAsset}=client.storage.from("micro-h5p").getPublicUrl(text(content,"storage_path"));
    json(response,200,{id:text(content,"id"),title:text(content,"title"),contentType:text(content,"content_type"),libraryName:text(content,"library_name"),libraryVersion:`${text(content,"library_major")}.${text(content,"library_minor")}`,contentUrl:publicAsset.publicUrl,completionPolicy:text(content,"completion_policy")});return;
  }
  if (!body.pathId) throw new ApiError(400, "invalid_micro_action", "pathId is required");
  const pathResult = await client.from("micro_learning_paths").select("*").eq("id", body.pathId).eq("status", "published").maybeSingle();
  const path = dataOrThrow(pathResult.data as Row | null, pathResult.error, "Micro path lookup");
  if (!path) throw new ApiError(404, "micro_path_not_found", "Micro Learning path is unavailable");
  const now = new Date().toISOString();
  if (body.action === "resolve-h5p") {
    if (!body.unitId || !body.stepId || !body.contentRef) throw new ApiError(400, "invalid_h5p_request", "H5P step identity and contentRef are required");
    const [unitLookup, stepLookup, contentLookup] = await Promise.all([
      client.from("micro_units").select("id").eq("id", body.unitId).eq("path_id", body.pathId).maybeSingle(),
      client.from("micro_steps").select("interaction").eq("id", body.stepId).eq("unit_id", body.unitId).maybeSingle(),
      client.from("h5p_contents").select("*").eq("id", body.contentRef).eq("status", "published").maybeSingle()
    ]);
    const unit = dataOrThrow(unitLookup.data as Row | null, unitLookup.error, "H5P unit lookup");
    const step = dataOrThrow(stepLookup.data as Row | null, stepLookup.error, "H5P step lookup");
    const content = dataOrThrow(contentLookup.data as Row | null, contentLookup.error, "H5P content lookup");
    const interaction = object(step?.interaction);
    if (!unit || !step || interaction?.type !== "h5p" || interaction.contentRef !== body.contentRef) throw new ApiError(404, "h5p_step_not_found", "H5P content is not attached to this Micro step");
    if (!content) throw new ApiError(404, "h5p_content_unavailable", "H5P content is unavailable");
    const storagePath = text(content, "storage_path");
    const { data: publicAsset } = client.storage.from("micro-h5p").getPublicUrl(storagePath);
    json(response, 200, { id: text(content,"id"), title: text(content,"title"), contentType: text(content,"content_type"), libraryName: text(content,"library_name"), libraryVersion: `${text(content,"library_major")}.${text(content,"library_minor")}`, contentUrl: publicAsset.publicUrl, completionPolicy: text(content,"completion_policy") });
    return;
  }
  if (body.action === "start") {
    const pathCourseId = optionalText(path, "course_id");
    if (body.contextCourseId) {
      await requireCourseKnowledge(client, body.contextCourseId, text(path, "knowledge_id"));
      if (pathCourseId && pathCourseId !== body.contextCourseId) throw new ApiError(400, "micro_context_mismatch", "Micro path does not belong to the selected Course context");
      if (user) await activateCourse(client, user.id, body.contextCourseId);
    } else if (pathCourseId) {
      await requireCourseKnowledge(client, pathCourseId, text(path, "knowledge_id"));
      if (user) await activateCourse(client, user.id, pathCourseId);
    }
    const firstUnitResult = await client.from("micro_units").select("*").eq("path_id", body.pathId).order("position").limit(1).maybeSingle();
    const firstUnit = dataOrThrow(firstUnitResult.data as Row | null, firstUnitResult.error, "Micro first unit lookup");
    const firstStepResult = firstUnit ? await client.from("micro_steps").select("id").eq("unit_id", text(firstUnit, "id")).order("position").limit(1).maybeSingle() : null;
    const firstStep = firstStepResult ? dataOrThrow(firstStepResult.data as Row | null, firstStepResult.error, "Micro first step lookup") : null;
    if (!user) {
      json(response, 200, { progress: { pathId: body.pathId, status: "in_progress", currentUnitId: firstUnit ? text(firstUnit, "id") : undefined, currentStepId: firstStep ? text(firstStep, "id") : undefined, startedAt: now, updatedAt: now } });
      return;
    }
    const progress = { user_id: user.id, path_id: body.pathId, status: "in_progress", current_unit_id: firstUnit ? text(firstUnit, "id") : null, current_step_id: firstStep ? text(firstStep, "id") : null, started_at: now, updated_at: now };
    const write = await client.from("user_micro_path_progress").upsert(progress, { onConflict: "user_id,path_id", ignoreDuplicates: true });
    dataOrThrow(write.data, write.error, "Micro start");
    const knowledge = await client.from("user_knowledge_states").select("status").eq("user_id", user.id).eq("node_id", text(path, "knowledge_id")).maybeSingle();
    const existing = dataOrThrow(knowledge.data as Row | null, knowledge.error, "Knowledge state lookup");
    if (!existing || ["explore", "learning"].includes(text(existing, "status"))) {
      const stateWrite = await client.from("user_knowledge_states").upsert({ user_id: user.id, node_id: text(path, "knowledge_id"), status: "learning", updated_at: now });
      dataOrThrow(stateWrite.data, stateWrite.error, "Knowledge start");
    }
    json(response, 200, { progress: { pathId: body.pathId, status: "in_progress", currentUnitId: firstUnit ? text(firstUnit, "id") : undefined, currentStepId: firstStep ? text(firstStep, "id") : undefined, startedAt: now, updatedAt: now } });
    return;
  }
  if (body.action !== "complete-step" || !body.unitId || !body.stepId) throw new ApiError(400, "invalid_micro_action", "Unsupported Micro action");
  const [unitResult, stepResult, allStepsResult, pathUnitsResult] = await Promise.all([
    client.from("micro_units").select("*").eq("id", body.unitId).eq("path_id", body.pathId).maybeSingle(),
    client.from("micro_steps").select("*").eq("id", body.stepId).eq("unit_id", body.unitId).maybeSingle(),
    client.from("micro_steps").select("id,position").eq("unit_id", body.unitId).order("position"),
    client.from("micro_units").select("id,required,position").eq("path_id", body.pathId).order("position")
  ]);
  const unit = dataOrThrow(unitResult.data as Row | null, unitResult.error, "Micro unit lookup");
  const step = dataOrThrow(stepResult.data as Row | null, stepResult.error, "Micro step lookup");
  if (!unit || !step) throw new ApiError(404, "micro_step_not_found", "Micro step is unavailable");
  const interaction = object(value(step, "interaction"));
  if (interaction?.type === "h5p") {
    const completion = parseH5PCompletion(body.submission);
    if (!completion) throw new ApiError(400, "invalid_h5p_completion", "H5P completion payload is invalid");
    if (completion.contentRef !== interaction.contentRef) throw new ApiError(400, "h5p_content_mismatch", "H5P completion does not match this Micro step");
    const contentResult = await client.from("h5p_contents").select("id,completion_policy").eq("id", completion.contentRef).eq("status", "published").maybeSingle();
    const content = dataOrThrow(contentResult.data as Row | null, contentResult.error, "H5P completion content lookup");
    if (!content) throw new ApiError(404, "h5p_content_unavailable", "H5P content is unavailable");
    const policy = (interaction.completionPolicy ?? value(content,"completion_policy")) as "completed"|"passed";
    if (interaction.completionPolicy && interaction.completionPolicy !== value(content,"completion_policy")) throw new ApiError(409, "h5p_policy_mismatch", "H5P completion policy does not match published content");
    if (!h5pCompletionPasses(completion,policy)) { json(response, 200, { correct: false, completed: false }); return; }
  } else if (!nativeInteractionCorrect(interaction, body.submission === undefined ? body.answer : body.submission as NativeAnswer)) { json(response, 200, { correct: false, completed: false }); return; }
  const allSteps = dataOrThrow(allStepsResult.data as Row[] | null, allStepsResult.error, "Micro unit steps lookup");
  if (!user) { json(response, 200, { correct: true, completed: false }); return; }
  const existingResult = await client.from("user_micro_unit_progress").select("*").eq("user_id", user.id).eq("unit_id", body.unitId).maybeSingle();
  const existing = dataOrThrow(existingResult.data as Row | null, existingResult.error, "Micro unit progress lookup");
  const completed = new Set<string>(Array.isArray(existing?.completed_step_ids) ? existing.completed_step_ids.map(String) : []);
  completed.add(body.stepId);
  const unitCompleted = allSteps.length > 0 && allSteps.every((item) => completed.has(text(item, "id")));
  const nextStep = allSteps.find((item) => !completed.has(text(item, "id")));
  const unitWrite = await client.from("user_micro_unit_progress").upsert({ user_id: user.id, unit_id: body.unitId, path_id: body.pathId, status: unitCompleted ? "completed" : "in_progress", current_step_id: nextStep ? text(nextStep, "id") : null, completed_step_ids: [...completed], started_at: existing?.started_at ?? now, completed_at: unitCompleted ? (existing?.completed_at ?? now) : null, updated_at: now });
  dataOrThrow(unitWrite.data, unitWrite.error, "Micro unit progress update");
  const pathUnits = dataOrThrow(pathUnitsResult.data as Row[] | null, pathUnitsResult.error, "Micro path units lookup");
  const requiredUnits = pathUnits.filter((item) => Boolean(value(item, "required")));
  const progresses = await client.from("user_micro_unit_progress").select("unit_id,status").eq("user_id", user.id).eq("path_id", body.pathId);
  const unitProgress = dataOrThrow(progresses.data as Row[] | null, progresses.error, "Micro aggregate progress lookup");
  const completedUnitIds = new Set(unitProgress.filter((item) => text(item, "status") === "completed").map((item) => text(item, "unit_id")));
  if (unitCompleted) completedUnitIds.add(body.unitId);
  const pathCompleted = requiredUnits.length > 0 && requiredUnits.every((item) => completedUnitIds.has(text(item, "id")));
  const nextUnit = pathUnits.find((item) => !completedUnitIds.has(text(item, "id")));
  const nextUnitSteps = unitCompleted && nextUnit ? await client.from("micro_steps").select("id").eq("unit_id", text(nextUnit, "id")).order("position").limit(1).maybeSingle() : null;
  const nextStepRow = nextStep ?? (nextUnitSteps ? dataOrThrow(nextUnitSteps.data as Row | null, nextUnitSteps.error, "Micro next step lookup") : null);
  const currentUnitId = unitCompleted ? (nextUnit ? text(nextUnit, "id") : null) : body.unitId;
  const pathWrite = await client.from("user_micro_path_progress").upsert({ user_id: user.id, path_id: body.pathId, status: pathCompleted ? "completed" : "in_progress", current_unit_id: currentUnitId, current_step_id: nextStepRow ? text(nextStepRow, "id") : null, started_at: now, completed_at: pathCompleted ? now : null, updated_at: now });
  dataOrThrow(pathWrite.data, pathWrite.error, "Micro path progress update");
  if (pathCompleted && text(path, "mode") === "learn" && Boolean(value(path, "required"))) {
    const evidence = await client.from("knowledge_evidence").upsert({ user_id: user.id, node_id: text(path, "knowledge_id"), event_type: "micro_path_completed", source_entity_id: body.pathId, outcome: "completed", context: { pathId: body.pathId, courseId: optionalText(path, "course_id") ?? null }, occurred_at: now }, { onConflict: "user_id,node_id,event_type,source_entity_id", ignoreDuplicates: true });
    dataOrThrow(evidence.data, evidence.error, "Micro completion evidence");
    const current = await client.from("user_knowledge_states").select("status").eq("user_id", user.id).eq("node_id", text(path, "knowledge_id")).maybeSingle();
    const state = dataOrThrow(current.data as Row | null, current.error, "Knowledge state lookup");
    if (!state || ["explore", "learning", "learned"].includes(text(state, "status"))) {
      const stateWrite = await client.from("user_knowledge_states").upsert({ user_id: user.id, node_id: text(path, "knowledge_id"), status: "learned", updated_at: now });
      dataOrThrow(stateWrite.data, stateWrite.error, "Knowledge learned");
    }
    const courseId = optionalText(path, "course_id");
    if (courseId) await recomputeMastery(client, user.id, text(path, "knowledge_id"), courseId);
    else {
      const coverages = await client.from("assignment_coverages").select("course_id").eq("node_id", text(path, "knowledge_id")).eq("required", true);
      const rows = dataOrThrow(coverages.data as Row[] | null, coverages.error, "Global Micro course contexts lookup");
      for (const candidate of new Set(rows.map((row)=>text(row,"course_id")))) await recomputeMastery(client,user.id,text(path,"knowledge_id"),candidate);
    }
  }
  json(response, 200, { correct: true, completed: pathCompleted, pathProgress: { pathId: body.pathId, status: pathCompleted ? "completed" : "in_progress", currentUnitId: currentUnitId ?? undefined, currentStepId: nextStepRow ? text(nextStepRow, "id") : undefined, startedAt: now, completedAt: pathCompleted ? now : undefined, updatedAt: now } });
});
