import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";
import { recomputeMastery } from "../_lib/mastery.js";

type Row = Record<string, unknown>;
type Answer = string | string[] | undefined;
const value = (row: Row, field: string) => row[field];
const text = (row: Row, field: string) => String(value(row, field));
const optionalText = (row: Row, field: string) => value(row, field) == null ? undefined : String(value(row, field));

function interactionCorrect(interaction: unknown, answer: Answer) {
  if (!interaction || typeof interaction !== "object" || Array.isArray(interaction)) return true;
  const item = interaction as Record<string, unknown>;
  if (item.type === "choice") return answer === (item.options as unknown[] | undefined)?.[Number(item.correctIndex)];
  if (item.type === "trace") return answer === item.correctStepId;
  if (item.type === "ordering" || item.type === "mini-workflow") return Array.isArray(answer) && Array.isArray(item.correctOrder) && answer.join("|") === item.correctOrder.join("|");
  return false; // h5p and unknown interaction types require an installed adapter.
}

function mapProgress(row: Row) {
  return { pathId: text(row, "path_id"), status: text(row, "status"), currentUnitId: optionalText(row, "current_unit_id"), currentStepId: optionalText(row, "current_step_id"), startedAt: optionalText(row, "started_at"), completedAt: optionalText(row, "completed_at"), updatedAt: text(row, "updated_at") };
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  const { client, user } = await createUserSupabase(request);
  if (request.method === "GET") {
    const [pathsResult, unitsResult, stepsResult, pathProgressResult, unitProgressResult] = await Promise.all([
      client.from("micro_learning_paths").select("*").eq("status", "published").order("id"),
      client.from("micro_units").select("*").order("path_id").order("position"),
      client.from("micro_steps").select("*").order("unit_id").order("position"),
      client.from("user_micro_path_progress").select("*").eq("user_id", user.id),
      client.from("user_micro_unit_progress").select("*").eq("user_id", user.id)
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
  const body = request.body as { action?: string; pathId?: string; unitId?: string; stepId?: string; answer?: Answer };
  if (!body.pathId || !body.action) throw new ApiError(400, "invalid_micro_action", "pathId and action are required");
  const pathResult = await client.from("micro_learning_paths").select("*").eq("id", body.pathId).eq("status", "published").maybeSingle();
  const path = dataOrThrow(pathResult.data as Row | null, pathResult.error, "Micro path lookup");
  if (!path) throw new ApiError(404, "micro_path_not_found", "Micro Learning path is unavailable");
  const now = new Date().toISOString();
  if (body.action === "start") {
    const firstUnitResult = await client.from("micro_units").select("*").eq("path_id", body.pathId).order("position").limit(1).maybeSingle();
    const firstUnit = dataOrThrow(firstUnitResult.data as Row | null, firstUnitResult.error, "Micro first unit lookup");
    const firstStepResult = firstUnit ? await client.from("micro_steps").select("id").eq("unit_id", text(firstUnit, "id")).order("position").limit(1).maybeSingle() : null;
    const firstStep = firstStepResult ? dataOrThrow(firstStepResult.data as Row | null, firstStepResult.error, "Micro first step lookup") : null;
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
  if (!interactionCorrect(value(step, "interaction"), body.answer)) { json(response, 200, { correct: false, completed: false }); return; }
  const allSteps = dataOrThrow(allStepsResult.data as Row[] | null, allStepsResult.error, "Micro unit steps lookup");
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
  }
  json(response, 200, { correct: true, completed: pathCompleted, pathProgress: { pathId: body.pathId, status: pathCompleted ? "completed" : "in_progress", currentUnitId: currentUnitId ?? undefined, currentStepId: nextStepRow ? text(nextStepRow, "id") : undefined, startedAt: now, completedAt: pathCompleted ? now : undefined, updatedAt: now } });
});
