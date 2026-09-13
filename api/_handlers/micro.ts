import { z } from "zod";
import { learningDataHash, readLearningData } from "../_lib/learningData.js";
import { CRITERION_ESTIMATOR_VERSION, type CriterionReference } from "../../src/shared/learning/criterionState.js";
import { decodeLearningContent } from "../../src/shared/content/richText.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createOptionalUserSupabase, createServerSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";
import { activateCourse, requireCourseKnowledge, requireMicroTeachingEligibility } from "../_lib/courseMembership.js";
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
  if (request.method === "GET" && request.query.view === "learning-data") {
    if (!user) throw new ApiError(401, "unauthorized", "A valid session is required");
    const cutoff = request.query.throughSequence === undefined ? undefined : Number(request.query.throughSequence);
    if (cutoff !== undefined && (!Number.isSafeInteger(cutoff) || cutoff < 0)) throw new ApiError(400, "invalid_cutoff", "Invalid evidence cutoff");
    if (request.query.decisionId !== undefined) {
      const parsed = z.uuid().safeParse(request.query.decisionId);
      if (!parsed.success) throw new ApiError(400,"invalid_decision_id","Invalid decision identity");
      const result=await client.from("navigation_decisions").select("*").eq("id",parsed.data).eq("user_id",user.id).maybeSingle();
      const decision=dataOrThrow(result.data as Row|null,result.error,"Historical decision lookup");
      if (!decision) throw new ApiError(404,"decision_not_found","Decision unavailable");
      if (decision.estimator_version!==CRITERION_ESTIMATOR_VERSION||!Array.isArray(decision.state_snapshot)) throw new ApiError(422,"unsupported_state_version","Decision has no supported historical state");
      const refs=(decision.state_snapshot as CriterionReference[]).map(item=>({criterionId:item.criterionId,version:item.version}));
      const replay=await readLearningData(client,user.id,undefined,cutoff??Number(decision.evidence_cutoff),refs);
      if (cutoff===undefined && replay.stateHash!==decision.state_hash) throw new ApiError(409,"state_replay_mismatch","Historical evidence does not reproduce the saved state");
      json(response,200,{...replay,decision});return;
    }
    json(response, 200, await readLearningData(client, user.id, undefined, cutoff));
    return;
  }
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
          steps: steps.filter((step) => text(step, "unit_id") === text(unit, "id")).map((step) => ({ id: text(step, "id"), kind: text(step, "kind"), title: text(step, "title"), body: decodeLearningContent(value(step, "content")), interaction: value(step, "interaction") ?? undefined, successFeedback: decodeLearningContent(value(step, "success_feedback")) ?? undefined, retryFeedback: decodeLearningContent(value(step, "retry_feedback")) ?? undefined, transition: value(step, "transition") ?? undefined }))
        }))
      })),
      pathProgress: pathProgress.map(mapProgress),
      unitProgress: unitProgress.map((row) => ({ unitId: text(row, "unit_id"), pathId: text(row, "path_id"), status: text(row, "status"), currentStepId: optionalText(row, "current_step_id"), completedStepIds: value(row, "completed_step_ids") ?? [], startedAt: optionalText(row, "started_at"), completedAt: optionalText(row, "completed_at"), updatedAt: text(row, "updated_at") }))
    });
    return;
  }
  if (request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);
  const body = request.body as { action?: string; pathId?: string; unitId?: string; stepId?: string; submission?: unknown; answer?: NativeAnswer; contentRef?: string; contextCourseId?: string; idempotencyKey?: string; decisionId?: string; clientDurationMs?: number };
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
    const effectiveCourse = body.contextCourseId ?? pathCourseId;
    if (user && effectiveCourse) await requireMicroTeachingEligibility(client, user.id, effectiveCourse, text(path, "knowledge_id"));
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
    const write = await createServerSupabase().from("user_micro_path_progress").upsert(progress, { onConflict: "user_id,path_id", ignoreDuplicates: true });
    dataOrThrow(write.data, write.error, "Micro start");
    const knowledge = await client.from("user_knowledge_states").select("status").eq("user_id", user.id).eq("node_id", text(path, "knowledge_id")).maybeSingle();
    const existing = dataOrThrow(knowledge.data as Row | null, knowledge.error, "Knowledge state lookup");
    if (!existing || ["explore", "learning"].includes(text(existing, "status"))) {
      const stateWrite = await createServerSupabase().from("user_knowledge_states").upsert({ user_id: user.id, node_id: text(path, "knowledge_id"), status: "learning", updated_at: now });
      dataOrThrow(stateWrite.data, stateWrite.error, "Knowledge start");
    }
    json(response, 200, { progress: { pathId: body.pathId, status: "in_progress", currentUnitId: firstUnit ? text(firstUnit, "id") : undefined, currentStepId: firstStep ? text(firstStep, "id") : undefined, startedAt: now, updatedAt: now } });
    return;
  }
  if (body.action !== "complete-step" || !body.unitId || !body.stepId) throw new ApiError(400, "invalid_micro_action", "Unsupported Micro action");
  const [unitResult, stepResult] = await Promise.all([
    client.from("micro_units").select("*").eq("id", body.unitId).eq("path_id", body.pathId).maybeSingle(),
    client.from("micro_steps").select("*").eq("id", body.stepId).eq("unit_id", body.unitId).maybeSingle()
  ]);
  const unit = dataOrThrow(unitResult.data as Row | null, unitResult.error, "Micro unit lookup");
  const step = dataOrThrow(stepResult.data as Row | null, stepResult.error, "Micro step lookup");
  if (!unit || !step) throw new ApiError(404, "micro_step_not_found", "Micro step is unavailable");
  const pathCourseId=optionalText(path,"course_id");
  const effectiveCourseId = body.contextCourseId ?? pathCourseId;
  if (effectiveCourseId) {
    await requireCourseKnowledge(client, effectiveCourseId, text(path, "knowledge_id"));
    if(pathCourseId && pathCourseId !== effectiveCourseId) throw new ApiError(400, "micro_context_mismatch", "Micro path does not belong to the selected Course");
  }
  const interaction = object(value(step, "interaction"));
  let correct = true;
  if (interaction?.type === "h5p") {
    const completion = parseH5PCompletion(body.submission);
    if (!completion) throw new ApiError(400, "invalid_h5p_completion", "H5P completion payload is invalid");
    if (completion.contentRef !== interaction.contentRef) throw new ApiError(400, "h5p_content_mismatch", "H5P completion does not match this Micro step");
    const contentResult = await client.from("h5p_contents").select("id,completion_policy").eq("id", completion.contentRef).eq("status", "published").maybeSingle();
    const content = dataOrThrow(contentResult.data as Row | null, contentResult.error, "H5P completion content lookup");
    if (!content) throw new ApiError(404, "h5p_content_unavailable", "H5P content is unavailable");
    const policy = (interaction.completionPolicy ?? value(content,"completion_policy")) as "completed"|"passed";
    if (interaction.completionPolicy && interaction.completionPolicy !== value(content,"completion_policy")) throw new ApiError(409, "h5p_policy_mismatch", "H5P completion policy does not match published content");
    correct = h5pCompletionPasses(completion,policy);
  } else correct = nativeInteractionCorrect(interaction, body.submission === undefined ? body.answer : body.submission as NativeAnswer);
  if (!user) { json(response, 200, { correct, completed: false }); return; }
  const metadata = z.object({ idempotencyKey: z.string().min(8).max(160).optional(), decisionId: z.uuid().optional(),
    clientDurationMs: z.number().int().min(0).max(86400000).optional() }).safeParse(body);
  if (!metadata.success) throw new ApiError(400, "invalid_attempt_metadata", "Invalid attempt metadata");
  const submission = body.submission === undefined ? body.answer ?? null : body.submission;
  if (JSON.stringify(submission).length > 65536) throw new ApiError(400, "response_too_large", "Micro response is too large");
  const instruction = !interaction || interaction.mode === "explore" || step.kind === "explanation" || step.kind === "summary";
  const outcome = interaction?.type === "h5p" ? "reported_completion" : instruction ? "observed" : correct ? "correct" : "incorrect";
  const recorded = await createServerSupabase().rpc("record_micro_step_attempt", {
    p_user_id: user.id, p_path_id: body.pathId, p_unit_id: body.unitId, p_step_id: body.stepId,
    p_context_course_id: effectiveCourseId ?? null,
    p_key: metadata.data.idempotencyKey ?? `legacy-${learningDataHash([body.pathId,body.unitId,body.stepId,effectiveCourseId,submission])}`,
    p_response: submission, p_correct: correct, p_outcome: outcome,
    p_step_hash: learningDataHash({ interaction, kind: step.kind, revision: path.revision }),
    p_expected_step: { interaction, kind: step.kind, revision: path.revision },
    p_duration: metadata.data.clientDurationMs ?? null, p_decision_id: metadata.data.decisionId ?? null,
  });
  if (recorded.error?.code === "40001") throw new ApiError(409, "micro_content_changed", "Learning content changed; reload before submitting");
  if (recorded.error?.code === "23505") throw new ApiError(409, "micro_idempotency_conflict", "Attempt key was already used with different work");
  if (recorded.error?.code === "42501") throw new ApiError(403, "micro_action_ineligible", "Learning prerequisites or recommendation context do not permit this action");
  const result = dataOrThrow(recorded.data as Row | null, recorded.error, "Atomic Micro attempt");
  if (!result) throw new Error("Micro attempt returned no result");
  const progress = object(result.progress);
  const attempt = object(result.attempt);
  json(response, 200, { correct: attempt ? Boolean(attempt.completion_accepted) : correct,
    completed: progress?.status === "completed", attemptId: attempt?.id, evidenceSequence: attempt?.sequence,
    duplicate: result.duplicate, pathProgress: progress ? mapProgress(progress) : undefined });
});
