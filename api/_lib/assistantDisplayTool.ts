import type { SupabaseClient, User } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";
import type { AssistantContextSnapshot } from "../../src/features/assistant/assistantContract.js";
import { type AssistantCardDisplay, type AssistantCardRef } from "../../src/features/assistant/assistantCards.js";
import { assistantCardDisplaySchema, assistantComponentCatalog } from "../../src/features/assistant/componentCatalog.js";
import {
  chapterCardDisplay,
  courseMatchCardDisplay,
  evaluationCardDisplay,
  knowledgeCardDisplay,
  materialCardDisplay,
  microCardDisplay,
  miniMapCardDisplay,
  practiceCardDisplay,
  progressCardDisplay,
  routeCardDisplay
} from "../../src/features/assistant/cardDisplay.js";
import { buildFirstSegment, type AssignmentProgressStatus, type FirstSegmentMicroAsset, type FirstSegmentPracticeAsset, type LearnerEvidenceStatus } from "../../src/shared/learning/firstSegment.js";
import type { GoalPlan } from "../../src/features/course/goal/goalPlanning.js";
import { dataOrThrow } from "./query.js";
import { getAssignmentContext, getCourseContext, getKnowledge, readableCourse } from "./assistantTools.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const optionalText = (row: Row, key: string) => row[key] == null ? undefined : String(row[key]);
const minutes = (value: unknown) => value == null || Number.isNaN(Number(value)) ? undefined : Number(value);

const id = z.string().trim().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

/**
 * The only card-nomination surface the model sees. It names a card type and
 * product object identities; the server re-reads every object with the
 * authenticated learner and returns display data. Invalid nominations are
 * skipped without failing the answer.
 */
export const assistantDisplayCardInput = z.discriminatedUnion("cardType", [
  z.object({ cardType: z.literal("route"), courseId: id }).passthrough(),
  z.object({ cardType: z.literal("micro"), knowledgeId: id, courseId: id.optional(), pathId: id.optional() }).passthrough(),
  z.object({ cardType: z.literal("practice"), courseId: id, assignmentId: id, compact: z.boolean().optional() }).passthrough(),
  z.object({ cardType: z.literal("submission"), courseId: id, assignmentId: id }).passthrough(),
  z.object({ cardType: z.literal("evaluation"), courseId: id, assignmentId: id, attemptId: z.string().uuid().optional() }).passthrough(),
  z.object({ cardType: z.literal("course_chapter"), courseId: id, chapterId: id }).passthrough(),
  z.object({ cardType: z.literal("knowledge"), nodeId: id }).passthrough(),
  z.object({ cardType: z.literal("mini_map"), nodeId: id }).passthrough(),
  z.object({ cardType: z.literal("progress"), courseId: id.optional() }).passthrough(),
  z.object({ cardType: z.literal("material"), courseId: id, materialId: id, segmentId: id.optional() }).passthrough(),
  z.object({ cardType: z.literal("course_match") }).passthrough()
]);
export type AssistantDisplayCardInput = z.infer<typeof assistantDisplayCardInput>;

export type AssistantDisplayCardState = {
  lastPlan?: GoalPlan;
  accepted: number;
};

export type AssistantDisplayCardOutput = { card: AssistantCardRef; display: AssistantCardDisplay } | { skipped: string };

function orderedNodeIds(course: NonNullable<Awaited<ReturnType<typeof getCourseContext>>>): string[] {
  const lessonOrder = new Map(course.lessons.map((lesson) => [lesson.id, lesson.order]));
  return [...course.curriculumCoverage]
    .sort((left, right) => (lessonOrder.get(left.lessonId) ?? Number.MAX_SAFE_INTEGER) - (lessonOrder.get(right.lessonId) ?? Number.MAX_SAFE_INTEGER)
      || left.order - right.order
      || left.nodeId.localeCompare(right.nodeId))
    .map((coverage) => coverage.nodeId)
    .filter((nodeId, index, values) => values.indexOf(nodeId) === index);
}

async function routeFirstSegment(client: SupabaseClient, user: User, courseId: string): Promise<{ courseTitle: string; segment: ReturnType<typeof buildFirstSegment> } | null> {
  const course = await getCourseContext(client, user, courseId);
  if (!course) return null;
  const ordered = orderedNodeIds(course);
  if (!ordered.length) return null;
  const assignmentIds = course.assignments.map((assignment) => assignment.id);
  const [microResult, assignmentCoverageResult, knowledgeStateResult, assignmentStateResult] = await Promise.all([
    client.from("micro_learning_paths").select("id,knowledge_id,course_id,title,estimated_minutes,scope,status,mode").in("knowledge_id", ordered).eq("status", "published").eq("mode", "learn"),
    assignmentIds.length
      ? client.from("assignment_coverages").select("assignment_id,node_id,required").eq("course_id", courseId).in("assignment_id", assignmentIds)
      : { data: [], error: null },
    client.from("user_knowledge_states").select("node_id,status").eq("user_id", user.id).in("node_id", ordered),
    assignmentIds.length
      ? client.from("user_assignment_states").select("assignment_id,status").eq("user_id", user.id).eq("course_id", courseId).in("assignment_id", assignmentIds)
      : { data: [], error: null }
  ]);
  const microRows = dataOrThrow(microResult.data as Row[] | null, microResult.error, "Route card Micro lookup");
  const coverageRows = dataOrThrow(assignmentCoverageResult.data as Row[] | null, assignmentCoverageResult.error, "Route card Assignment coverage lookup");
  const knowledgeRows = dataOrThrow(knowledgeStateResult.data as Row[] | null, knowledgeStateResult.error, "Route card Knowledge state lookup");
  const assignmentRows = dataOrThrow(assignmentStateResult.data as Row[] | null, assignmentStateResult.error, "Route card Assignment state lookup");
  const microByNode = new Map<string, FirstSegmentMicroAsset>();
  for (const nodeId of ordered) {
    const preferred = microRows.find((row) => text(row, "knowledge_id") === nodeId && text(row, "course_id") === courseId)
      ?? microRows.find((row) => text(row, "knowledge_id") === nodeId && row.course_id == null && text(row, "scope") === "global")
      ?? microRows.find((row) => text(row, "knowledge_id") === nodeId);
    if (preferred) microByNode.set(nodeId, {
      pathId: text(preferred, "id"),
      title: text(preferred, "title"),
      ...(minutes(preferred.estimated_minutes) != null ? { estimatedMinutes: minutes(preferred.estimated_minutes)! } : {})
    });
  }
  const assignmentOrder = new Map(course.assignments.map((assignment) => [assignment.id, assignment.order]));
  const practiceByNode = new Map<string, FirstSegmentPracticeAsset>();
  for (const coverage of [...coverageRows].sort((left, right) => (assignmentOrder.get(text(left, "assignment_id")) ?? 0) - (assignmentOrder.get(text(right, "assignment_id")) ?? 0) || text(left, "assignment_id").localeCompare(text(right, "assignment_id")))) {
    const nodeId = text(coverage, "node_id");
    if (practiceByNode.has(nodeId)) continue;
    const assignment = course.assignments.find((item) => item.id === text(coverage, "assignment_id"));
    if (!assignment) continue;
    practiceByNode.set(nodeId, { assignmentId: assignment.id, title: assignment.title });
  }
  const knowledgeStatusByNode = new Map<string, LearnerEvidenceStatus>(knowledgeRows.map((row) => [text(row, "node_id"), text(row, "status") as LearnerEvidenceStatus]));
  const assignmentStatusByAssignment = new Map<string, AssignmentProgressStatus>(assignmentRows.map((row) => [text(row, "assignment_id"), text(row, "status") as AssignmentProgressStatus]));
  const segment = buildFirstSegment({ orderedNodeIds: ordered, microByNode, practiceByNode, knowledgeStatusByNode, assignmentStatusByAssignment });
  return segment.steps.length ? { courseTitle: course.course.title, segment } : null;
}

async function buildRouteCard(client: SupabaseClient, user: User, courseId: string): Promise<AssistantDisplayCardOutput | null> {
  if (!await readableCourse(client, user, courseId)) return null;
  const route = await routeFirstSegment(client, user, courseId);
  if (!route) return null;
  return {
    card: { cardType: "route", courseId },
    display: routeCardDisplay({ courseId, courseTitle: route.courseTitle, segment: route.segment })
  };
}

async function resolveMicroPath(client: SupabaseClient, user: User, input: Extract<AssistantDisplayCardInput, { cardType: "micro" }>) {
  let query = client.from("micro_learning_paths")
    .select("id,knowledge_id,course_id,title,description,estimated_minutes,mode,status,scope")
    .eq("status", "published").eq("knowledge_id", input.knowledgeId);
  if (input.pathId) query = query.eq("id", input.pathId);
  const result = await query.limit(20);
  const rows = dataOrThrow(result.data as Row[] | null, result.error, "Display Micro lookup");
  const readable = async (row: Row | undefined) => {
    if (!row) return false;
    const courseId = optionalText(row, "course_id");
    return !courseId || Boolean(await readableCourse(client, user, courseId));
  };
  if (input.pathId) return rows[0] && await readable(rows[0]) ? rows[0] : null;
  const candidates = input.courseId
    ? rows.filter((row) => text(row, "course_id") === input.courseId || row.course_id == null)
    : rows;
  for (const row of candidates) if (await readable(row)) return row;
  return null;
}

/** A Course owns this Knowledge when its curriculum covers it; the path's own course_id is not the only source. */
async function courseForKnowledge(client: SupabaseClient, user: User, knowledgeId: string, preferredCourseId?: string): Promise<string | undefined> {
  if (preferredCourseId && await readableCourse(client, user, preferredCourseId)) return preferredCourseId;
  const result = await client.from("curriculum_coverages").select("course_id").eq("node_id", knowledgeId).order("course_id").limit(40);
  const rows = dataOrThrow(result.data as Row[] | null, result.error, "Micro owning Course lookup");
  for (const courseId of [...new Set(rows.map((row) => text(row, "course_id")))]) {
    if (await readableCourse(client, user, courseId)) return courseId;
  }
  return undefined;
}

async function buildMicroCard(client: SupabaseClient, user: User, input: Extract<AssistantDisplayCardInput, { cardType: "micro" }>): Promise<AssistantDisplayCardOutput | null> {
  const knowledge = await getKnowledge(client, input.knowledgeId);
  if (!knowledge) return null;
  if (input.courseId && !await readableCourse(client, user, input.courseId)) return null;
  const path = await resolveMicroPath(client, user, input);
  if (!path) return null;
  const pathId = text(path, "id");
  const courseId = optionalText(path, "course_id") ?? await courseForKnowledge(client, user, input.knowledgeId, input.courseId);
  const unitsResult = await client.from("micro_units").select("id,position").eq("path_id", pathId).order("position");
  const units = dataOrThrow(unitsResult.data as Row[] | null, unitsResult.error, "Display Micro unit lookup");
  const unitIds = units.map((unit) => text(unit, "id"));
  const stepsResult = unitIds.length
    ? await client.from("micro_steps").select("id,unit_id,title,position").in("unit_id", unitIds)
    : { data: [], error: null };
  const steps = dataOrThrow(stepsResult.data as Row[] | null, stepsResult.error, "Display Micro step lookup");
  const progressResult = await client.from("user_micro_path_progress").select("status,current_unit_id").eq("user_id", user.id).eq("path_id", pathId).maybeSingle();
  const progress = dataOrThrow(progressResult.data as Row | null, progressResult.error, "Display Micro progress lookup");
  const progressStatus = (optionalText(progress ?? {}, "status") ?? "not_started") as "not_started" | "in_progress" | "completed";
  const total = steps.length;
  const completedResult = unitIds.length
    ? await client.from("user_micro_unit_progress").select("completed_step_ids").eq("user_id", user.id).in("unit_id", unitIds)
    : { data: [], error: null };
  const completedRows = dataOrThrow(completedResult.data as Row[] | null, completedResult.error, "Display Micro completion lookup");
  const completed = progressStatus === "completed" ? total : completedRows.reduce((sum, row) => sum + (Array.isArray(row.completed_step_ids) ? row.completed_step_ids.length : 0), 0);
  const doneStepIds = new Set(completedRows.flatMap((row) => Array.isArray(row.completed_step_ids) ? row.completed_step_ids.map(String) : []));
  steps.sort((left, right) => {
    const unitOrder = (unitId: string) => units.findIndex((unit) => text(unit, "id") === unitId);
    return unitOrder(text(left, "unit_id")) - unitOrder(text(right, "unit_id")) || Number(left.position) - Number(right.position);
  });
  const courseTitle = courseId ? optionalText(await readableCourse(client, user, courseId) ?? {}, "title") : undefined;
  return {
    card: { cardType: "micro", pathId, knowledgeId: input.knowledgeId, ...(courseId ? { courseId } : {}) },
    display: microCardDisplay({ cardType: "micro", pathId, knowledgeId: input.knowledgeId, ...(courseId ? { courseId } : {}) }, {
      title: text(path, "title"),
      ...(optionalText(path, "description") ? { description: optionalText(path, "description")! } : {}),
      estimatedMinutes: minutes(path.estimated_minutes) ?? 0,
      totalSteps: total,
      completedCount: completed,
      progressStatus,
      ...(courseTitle ? { courseTitle } : {}),
      steps: steps.map((step) => ({
        id: text(step, "id"),
        title: text(step, "title"),
        done: progressStatus === "completed" || doneStepIds.has(text(step, "id"))
      }))
    })
  };
}

async function buildPracticeCard(client: SupabaseClient, user: User, input: Extract<AssistantDisplayCardInput, { cardType: "practice" }>): Promise<AssistantDisplayCardOutput | null> {
  const context = await getAssignmentContext(client, user, input.courseId, input.assignmentId);
  if (!context) return null;
  const stateResult = await client.from("user_assignment_states").select("status").eq("user_id", user.id).eq("course_id", input.courseId).eq("assignment_id", input.assignmentId).maybeSingle();
  const state = dataOrThrow(stateResult.data as Row | null, stateResult.error, "Display Assignment state lookup");
  return {
    card: { cardType: "practice", courseId: input.courseId, assignmentId: input.assignmentId, ...(input.compact ? { compact: true } : {}) },
    display: practiceCardDisplay("practice", {
      title: context.assignment.title,
      ...(typeof context.assignment.description === "string" ? { description: context.assignment.description } : {}),
      ...(context.assignment.estimatedMinutes != null ? { estimatedMinutes: context.assignment.estimatedMinutes } : {}),
      knowledgeCount: context.knowledge.length,
      status: optionalText(state ?? {}, "status") ?? "not_started"
    })
  };
}

async function buildSubmissionCard(client: SupabaseClient, user: User, input: Extract<AssistantDisplayCardInput, { cardType: "submission" }>): Promise<AssistantDisplayCardOutput | null> {
  const context = await getAssignmentContext(client, user, input.courseId, input.assignmentId);
  if (!context) return null;
  const stateResult = await client.from("user_assignment_states").select("status").eq("user_id", user.id).eq("course_id", input.courseId).eq("assignment_id", input.assignmentId).maybeSingle();
  const state = dataOrThrow(stateResult.data as Row | null, stateResult.error, "Display submission state lookup");
  return {
    card: { cardType: "submission", courseId: input.courseId, assignmentId: input.assignmentId },
    display: practiceCardDisplay("submission", {
      title: context.assignment.title,
      description: "填写备注、附上文件或链接，提交后由评估者给出结果。",
      ...(context.assignment.estimatedMinutes != null ? { estimatedMinutes: context.assignment.estimatedMinutes } : {}),
      knowledgeCount: context.knowledge.length,
      status: optionalText(state ?? {}, "status") ?? "not_started"
    })
  };
}

async function buildEvaluationCard(client: SupabaseClient, user: User, input: Extract<AssistantDisplayCardInput, { cardType: "evaluation" }>): Promise<AssistantDisplayCardOutput | null> {
  if (!await readableCourse(client, user, input.courseId)) return null;
  const attemptQuery = client.from("learning_attempts").select("id,attempt_number").eq("user_id", user.id).eq("course_id", input.courseId).eq("assignment_id", input.assignmentId).is("withdrawn_at", null);
  const attemptResult = input.attemptId
    ? await attemptQuery.eq("id", input.attemptId).maybeSingle()
    : await attemptQuery.order("attempt_number", { ascending: false }).limit(1).maybeSingle();
  const attempt = dataOrThrow(attemptResult.data as Row | null, attemptResult.error, "Display evaluation Attempt lookup");
  if (!attempt) return null;
  const assignmentResult = await client.from("course_assignments").select("title").eq("course_id", input.courseId).eq("id", input.assignmentId).maybeSingle();
  const assignment = dataOrThrow(assignmentResult.data as Row | null, assignmentResult.error, "Display evaluation Assignment lookup");
  if (!assignment) return null;
  const resultQuery = await client.from("performance_results").select("outcome,feedback,evaluator_kind,version").eq("attempt_id", text(attempt, "id")).order("version", { ascending: false }).limit(1).maybeSingle();
  const result = dataOrThrow(resultQuery.data as Row | null, resultQuery.error, "Display evaluation Result lookup");
  const outcome = optionalText(result ?? {}, "outcome") || "pending";
  const feedback = (result?.feedback ?? {}) as Row;
  const criteria = Array.isArray(feedback.criteria) ? feedback.criteria as Row[] : [];
  return {
    card: { cardType: "evaluation", courseId: input.courseId, assignmentId: input.assignmentId, attemptId: text(attempt, "id") },
    display: evaluationCardDisplay({
      assignmentTitle: text(assignment, "title"),
      ...(Number(attempt.attempt_number) ? { attemptNumber: Number(attempt.attempt_number) } : {}),
      outcome: outcome === "passed" ? "passed" : outcome === "failed" ? "failed" : "pending",
      ...(typeof feedback.message === "string" ? { feedbackMessage: feedback.message } : {}),
      criteriaPassed: criteria.filter((criterion) => criterion.passed === true).length,
      criteriaTotal: criteria.length
    })
  };
}

async function buildChapterCard(client: SupabaseClient, user: User, input: Extract<AssistantDisplayCardInput, { cardType: "course_chapter" }>): Promise<AssistantDisplayCardOutput | null> {
  const course = await getCourseContext(client, user, input.courseId);
  if (!course) return null;
  const chapter = course.chapters.find((item) => item.id === input.chapterId);
  if (!chapter) return null;
  const lessonIds = new Set(course.lessons.filter((lesson) => lesson.chapterId === input.chapterId).map((lesson) => lesson.id));
  const nodeIds = [...new Set(course.curriculumCoverage.filter((coverage) => lessonIds.has(coverage.lessonId)).map((coverage) => coverage.nodeId))];
  const stateResult = nodeIds.length ? await client.from("user_knowledge_states").select("node_id,status").eq("user_id", user.id).in("node_id", nodeIds) : { data: [], error: null };
  const states = dataOrThrow(stateResult.data as Row[] | null, stateResult.error, "Display Chapter progress lookup");
  const learned = new Set(states.filter((row) => ["learned", "practicing", "mastered"].includes(text(row, "status"))).map((row) => text(row, "node_id")));
  return {
    card: { cardType: "course_chapter", courseId: input.courseId, chapterId: input.chapterId },
    display: chapterCardDisplay({
      title: chapter.title,
      order: chapter.order,
      ...(chapter.outcome ? { outcome: chapter.outcome } : {}),
      nodeCount: nodeIds.length,
      learnedCount: nodeIds.filter((nodeId) => learned.has(nodeId)).length
    })
  };
}

async function buildCourseMatchCard(client: SupabaseClient, user: User, state: AssistantDisplayCardState): Promise<AssistantDisplayCardOutput | null> {
  const plan = state.lastPlan;
  if (!plan || plan.resolution.status !== "ready") return null;
  const allMatches = plan.matches.filter((match) => match.targetCoverage > 0 || match.requiredCoverage > 0);
  if (!allMatches.length) return null;
  const targetIds = plan.resolution.targetKnowledge.map((item) => item.id).slice(0, 20);
  const candidateCourseIds = allMatches.map((match) => match.courseId);
  const [microResult, coverageResult] = await Promise.all([
    targetIds.length ? client.from("micro_learning_paths").select("knowledge_id,course_id,status,mode").in("knowledge_id", targetIds).eq("status", "published").eq("mode", "learn").limit(100) : { data: [], error: null },
    candidateCourseIds.length ? client.from("curriculum_coverages").select("course_id,node_id").in("course_id", candidateCourseIds).limit(1000) : { data: [], error: null }
  ]);
  const microRows = dataOrThrow(microResult.data as Row[] | null, microResult.error, "Course match card Micro readiness");
  const coverageRows = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Course match card coverage");
  const courses = allMatches.map((match) => {
    const coveredNodeIds = new Set(coverageRows.filter((row) => text(row, "course_id") === match.courseId).map((row) => text(row, "node_id")));
    const microNodeIds = new Set(microRows.filter((row) => coveredNodeIds.has(text(row, "knowledge_id")) && (text(row, "course_id") === match.courseId || row.course_id == null)).map((row) => text(row, "knowledge_id")));
    return { id: match.courseId, title: match.courseTitle, coveredNodeIds, microNodeIds };
  });
  for (const course of courses) if (!await readableCourse(client, user, course.id)) return null;
  const card = {
    cardType: "course_match" as const,
    courseIds: courses.map((course) => course.id),
    targetKnowledgeIds: targetIds,
    goalText: plan.resolution.goalText.slice(0, 400)
  };
  return {
    card,
    display: courseMatchCardDisplay(card, {
      goalText: card.goalText,
      targetKnowledgeIds: targetIds,
      targetTitles: plan.resolution.targetKnowledge.map((item) => item.title),
      courses
    })
  };
}

async function buildKnowledgeCard(client: SupabaseClient, user: User, nodeId: string): Promise<AssistantDisplayCardOutput | null> {
  const knowledge = await getKnowledge(client, nodeId);
  if (!knowledge) return null;
  const stateResult = await client.from("user_knowledge_states").select("status").eq("user_id", user.id).eq("node_id", nodeId).maybeSingle();
  const state = dataOrThrow(stateResult.data as Row | null, stateResult.error, "Display Knowledge state lookup");
  return {
    card: { cardType: "knowledge", nodeId },
    display: knowledgeCardDisplay({
      title: knowledge.title,
      ...(typeof knowledge.description === "string" ? { description: knowledge.description } : {}),
      scope: knowledge.scope,
      status: optionalText(state ?? {}, "status") ?? "explore"
    })
  };
}

async function buildMiniMapCard(client: SupabaseClient, user: User, nodeId: string): Promise<AssistantDisplayCardOutput | null> {
  const knowledge = await getKnowledge(client, nodeId);
  if (!knowledge) return null;
  const edgeResult = await client.from("knowledge_edges").select("id").or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`).eq("lifecycle_status", "active").limit(60);
  const edges = dataOrThrow(edgeResult.data as Row[] | null, edgeResult.error, "Display mini map edge lookup");
  return {
    card: { cardType: "mini_map", nodeId },
    display: miniMapCardDisplay({ title: knowledge.title, edgeCount: edges.length })
  };
}

async function buildProgressCard(client: SupabaseClient, user: User, courseId?: string): Promise<AssistantDisplayCardOutput | null> {
  let stateQuery = client.from("user_course_states").select("course_id,is_active,updated_at").eq("user_id", user.id).eq("is_active", true);
  if (courseId) stateQuery = stateQuery.eq("course_id", courseId);
  const stateResult = await stateQuery.order("updated_at", { ascending: false });
  const states = dataOrThrow(stateResult.data as Row[] | null, stateResult.error, "Display progress Course lookup");
  if (!states.length) return null;
  const courseIds = states.map((row) => text(row, "course_id"));
  const [courseResult, coverageResult, knowledgeResult] = await Promise.all([
    client.from("courses").select("id,title").in("id", courseIds),
    client.from("curriculum_coverages").select("course_id,node_id").in("course_id", courseIds),
    client.from("user_knowledge_states").select("node_id,status").eq("user_id", user.id)
  ]);
  const courses = dataOrThrow(courseResult.data as Row[] | null, courseResult.error, "Display progress title lookup");
  const coverages = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Display progress coverage lookup");
  const knowledge = dataOrThrow(knowledgeResult.data as Row[] | null, knowledgeResult.error, "Display progress Knowledge lookup");
  const titleById = new Map(courses.map((course) => [text(course, "id"), text(course, "title")]));
  const learnedNodeIds = new Set(knowledge.filter((row) => ["learned", "practicing", "mastered"].includes(text(row, "status"))).map((row) => text(row, "node_id")));
  const display = progressCardDisplay({
    courses: courseIds.flatMap((courseIdValue) => {
      const title = titleById.get(courseIdValue);
      if (!title) return [];
      return [{
        id: courseIdValue,
        title,
        nodeIds: [...new Set(coverages.filter((coverage) => text(coverage, "course_id") === courseIdValue).map((coverage) => text(coverage, "node_id")))],
        learnedNodeIds
      }];
    })
  });
  if (!display) return null;
  return { card: { cardType: "progress", courseIds }, display };
}

async function buildMaterialCard(client: SupabaseClient, user: User, input: Extract<AssistantDisplayCardInput, { cardType: "material" }>): Promise<AssistantDisplayCardOutput | null> {
  if (!await readableCourse(client, user, input.courseId)) return null;
  const materialResult = await client.from("materials").select("id,course_id,title,description,material_type").eq("course_id", input.courseId).eq("id", input.materialId).maybeSingle();
  const material = dataOrThrow(materialResult.data as Row | null, materialResult.error, "Display Material lookup");
  if (!material) return null;
  let segment: Row | null = null;
  if (input.segmentId) {
    const segmentResult = await client.from("material_segments").select("id,title,section,page").eq("course_id", input.courseId).eq("material_id", input.materialId).eq("id", input.segmentId).maybeSingle();
    segment = dataOrThrow(segmentResult.data as Row | null, segmentResult.error, "Display MaterialSegment lookup");
  }
  return {
    card: { cardType: "material", courseId: input.courseId, materialId: input.materialId, ...(input.segmentId ? { segmentId: input.segmentId } : {}) },
    display: materialCardDisplay({
      title: text(material, "title"),
      ...(optionalText(material, "description") ? { description: optionalText(material, "description")! } : {}),
      ...(segment ? {
        ...(optionalText(segment, "section") ? { segmentSection: optionalText(segment, "section")! } : {}),
        ...(optionalText(segment, "title") ? { segmentTitle: optionalText(segment, "title")! } : {}),
        ...(segment.page == null ? {} : { page: Number(segment.page) })
      } : {})
    })
  };
}

async function build(client: SupabaseClient, user: User, context: AssistantContextSnapshot, input: AssistantDisplayCardInput, state: AssistantDisplayCardState): Promise<AssistantDisplayCardOutput | null> {
  switch (input.cardType) {
    case "route": return buildRouteCard(client, user, input.courseId);
    case "micro": return buildMicroCard(client, user, input);
    case "practice": return buildPracticeCard(client, user, input);
    case "submission": return buildSubmissionCard(client, user, input);
    case "evaluation": return buildEvaluationCard(client, user, input);
    case "course_chapter": return buildChapterCard(client, user, input);
    case "course_match": return buildCourseMatchCard(client, user, state);
    case "knowledge": return buildKnowledgeCard(client, user, input.nodeId);
    case "mini_map": return buildMiniMapCard(client, user, input.nodeId);
    case "progress": return buildProgressCard(client, user, input.courseId ?? context.courseId);
    case "material": return buildMaterialCard(client, user, input);
  }
}

export function createDisplayCardTool(client: SupabaseClient, user: User, context: AssistantContextSnapshot, state: AssistantDisplayCardState) {
  return tool({
    description: [
      "Show one product card inside the answer. Nominate only a card type and existing object IDs returned by EduFlow tools.",
      `Available cardType values from the product component directory: ${assistantComponentCatalog.filter((component) => component.nominatable !== false).map((component) => `${component.cardType} (${component.label})`).join(", ")}.`,
      "Fields by cardType: route (courseId), micro (knowledgeId, optional courseId/pathId), practice (courseId, assignmentId), submission (courseId, assignmentId), evaluation (courseId, assignmentId, optional attemptId), course_chapter (courseId, chapterId), knowledge (nodeId), mini_map (nodeId), progress (optional courseId), material (courseId, materialId, optional segmentId), course_match (no IDs; uses the latest planLearningGoal result).",
      "After a successful submitAssignment, call displayCard practice with compact true to add the one-line task card that shares the live state; the original task card updates in place. Call this at the exact point in your reply where the card belongs. Use only as many cards as the answer needs; there is no fixed count. Never describe the card contents or repeat its numbers in the text.",
      "Every ID must come from a real tool result. If you do not have a valid ID, do not call the tool."
    ].join(" "),
    inputSchema: assistantDisplayCardInput,
    execute: async (input: AssistantDisplayCardInput): Promise<AssistantDisplayCardOutput> => {
      try {
        const output = await build(client, user, context, input, state);
        if (!output || "skipped" in output) return { skipped: "card_not_available" };
        assistantCardDisplaySchema.parse(output.display);
        state.accepted += 1;
        console.info(`assistant_card type=${output.card.cardType} index=${state.accepted}`);
        return output;
      } catch (error) {
        console.error(`assistant_card_failed type=${input.cardType} error=${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`);
        return { skipped: "card_lookup_failed" };
      }
    },
    toModelOutput: ({ output }) => ({
      type: "json",
      value: "card" in output
        ? { shown: true, cardType: output.card.cardType }
        : { shown: false, reason: output.skipped }
    })
  });
}
