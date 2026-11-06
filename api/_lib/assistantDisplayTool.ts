import type { SupabaseClient, User } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";
import type { AssistantContextSnapshot } from "../../src/features/assistant/assistantContract.js";
import { cardLimitReached, type AssistantCardDisplay, type AssistantCardRef, type AssistantCardStatus, type AssistantCardStatusTone, type AssistantCardStep } from "../../src/features/assistant/assistantCards.js";
import type { GoalPlan } from "../../src/features/course/goal/goalPlanning.js";
import { dataOrThrow } from "./query.js";
import { getAssignmentContext, getCourseContext, getKnowledge, readableCourse } from "./assistantTools.js";
import { readNavigationDecision } from "./navigationDecision.js";

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
  z.object({ cardType: z.literal("route"), courseId: id }),
  z.object({ cardType: z.literal("micro"), knowledgeId: id, courseId: id.optional(), pathId: id.optional() }),
  z.object({ cardType: z.literal("practice"), courseId: id, assignmentId: id }),
  z.object({ cardType: z.literal("evaluation"), courseId: id, assignmentId: id, attemptId: z.string().uuid().optional() }),
  z.object({ cardType: z.literal("course_chapter"), courseId: id, chapterId: id }),
  z.object({ cardType: z.literal("knowledge"), nodeId: id }),
  z.object({ cardType: z.literal("progress"), courseId: id.optional() }),
  z.object({ cardType: z.literal("material"), courseId: id, materialId: id, segmentId: id.optional() }),
  z.object({ cardType: z.literal("course_match") })
]);
export type AssistantDisplayCardInput = z.infer<typeof assistantDisplayCardInput>;

export type AssistantDisplayCardState = {
  lastPlan?: GoalPlan;
  accepted: number;
};

export type AssistantDisplayCardOutput = { card: AssistantCardRef; display: AssistantCardDisplay } | { skipped: string };

const statusLabels: Record<string, { label: string; tone: AssistantCardStatusTone }> = {
  not_started: { label: "未开始", tone: "quiet" },
  started: { label: "进行中", tone: "brand" },
  in_progress: { label: "进行中", tone: "brand" },
  submitted: { label: "待评价", tone: "warn" },
  accepted: { label: "已通过", tone: "ok" },
  completed: { label: "已完成", tone: "ok" },
  needs_revision: { label: "需要修改", tone: "warn" },
  learned: { label: "已学习", tone: "ok" },
  practicing: { label: "练习中", tone: "brand" },
  mastered: { label: "已掌握", tone: "ok" },
  explore: { label: "未开始", tone: "quiet" }
};

function statusOf(value: unknown, fallback?: string): AssistantCardStatus {
  const key = typeof value === "string" ? value : "";
  return statusLabels[key] ?? { label: fallback ?? "状态未知", tone: "quiet" };
}

async function buildRouteCard(client: SupabaseClient, user: User, courseId: string): Promise<AssistantDisplayCardOutput | null> {
  if (!await readableCourse(client, user, courseId)) return null;
  const decision = await readNavigationDecision(client, user.id, courseId);
  const course = await getCourseContext(client, user, courseId);
  if (!course) return null;
  const start = Math.max(0, decision.path.findIndex((item) => item.state === "underway" || item.state === "eligible"));
  const route = decision.path.slice(start, start + 4);
  if (!route.length) return null;
  const nodeIds = route.map((item) => item.nodeId);
  const microResult = await client.from("micro_learning_paths")
    .select("id,knowledge_id,course_id,title,estimated_minutes,mode,status")
    .in("knowledge_id", nodeIds).eq("status", "published").eq("mode", "learn");
  const microRows = dataOrThrow(microResult.data as Row[] | null, microResult.error, "Route card Micro lookup");
  const microMinutes = new Map<string, number>();
  const microTitles = new Map<string, string>();
  for (const nodeId of nodeIds) {
    const preferred = microRows.find((row) => text(row, "knowledge_id") === nodeId && text(row, "course_id") === courseId)
      ?? microRows.find((row) => text(row, "knowledge_id") === nodeId && row.course_id == null)
      ?? microRows.find((row) => text(row, "knowledge_id") === nodeId);
    const value = preferred ? minutes(preferred.estimated_minutes) : undefined;
    if (value != null) microMinutes.set(nodeId, value);
    if (preferred) microTitles.set(nodeId, text(preferred, "title"));
  }
  const steps: AssistantCardStep[] = route.map((item) => ({
    id: item.nodeId,
    title: microTitles.get(item.nodeId) ?? item.title,
    state: item.state === "learned" ? "done" : item.nodeId === decision.nextAction.nodeId ? "now" : "quiet",
    ...(microMinutes.has(item.nodeId) ? { meta: `约 ${microMinutes.get(item.nodeId)} 分钟` } : {})
  }));
  const nextTitle = decision.nextAction.nodeId ? (microTitles.get(decision.nextAction.nodeId) ?? decision.path.find((item) => item.nodeId === decision.nextAction.nodeId)?.title) : undefined;
  const nextMicro = decision.nextAction.resourceKind === "micro"
    ? microRows.find((row) => text(row, "id") === decision.nextAction.resourceId)
      ?? microRows.find((row) => text(row, "knowledge_id") === decision.nextAction.nodeId)
    : undefined;
  const action: AssistantCardDisplay["action"] = nextMicro
    ? { kind: "micro", pathId: text(nextMicro, "id"), knowledgeId: decision.nextAction.nodeId ?? text(nextMicro, "knowledge_id"), ...(optionalText(nextMicro, "course_id") ? { courseId: text(nextMicro, "course_id") } : { courseId }), label: "开始当前这一步" }
    : decision.nextAction.resourceKind === "assignment" && decision.nextAction.resourceId
      ? { kind: "practice", courseId, assignmentId: decision.nextAction.resourceId, label: "打开动手任务" }
      : { kind: "course", courseId, label: "打开课程" };
  return {
    card: { cardType: "route", courseId },
    display: {
      title: course.course.title,
      kicker: "起步路线",
      description: nextTitle ? `从「${nextTitle}」开始，这一段是接下来要走的路。` : "这一段是接下来要走的路。",
      meta: [`${route.length} 步`],
      steps,
      action
    }
  };
}

async function resolveMicroPath(client: SupabaseClient, input: Extract<AssistantDisplayCardInput, { cardType: "micro" }>) {
  let query = client.from("micro_learning_paths")
    .select("id,knowledge_id,course_id,title,description,estimated_minutes,mode,status")
    .eq("status", "published").eq("knowledge_id", input.knowledgeId);
  if (input.pathId) query = query.eq("id", input.pathId);
  const result = await query.limit(20);
  const rows = dataOrThrow(result.data as Row[] | null, result.error, "Display Micro lookup");
  return rows.find((row) => input.courseId && text(row, "course_id") === input.courseId)
    ?? rows.find((row) => input.courseId && row.course_id == null)
    ?? rows.find((row) => row.course_id == null)
    ?? rows[0]
    ?? null;
}

async function buildMicroCard(client: SupabaseClient, user: User, input: Extract<AssistantDisplayCardInput, { cardType: "micro" }>): Promise<AssistantDisplayCardOutput | null> {
  const knowledge = await getKnowledge(client, input.knowledgeId);
  if (!knowledge) return null;
  if (input.courseId && !await readableCourse(client, user, input.courseId)) return null;
  const path = await resolveMicroPath(client, input);
  if (!path) return null;
  const pathId = text(path, "id");
  const courseId = optionalText(path, "course_id");
  const unitsResult = await client.from("micro_units").select("id,position").eq("path_id", pathId).order("position");
  const units = dataOrThrow(unitsResult.data as Row[] | null, unitsResult.error, "Display Micro unit lookup");
  const unitIds = units.map((unit) => text(unit, "id"));
  const stepsResult = unitIds.length ? await client.from("micro_steps").select("id,unit_id").in("unit_id", unitIds) : { data: [], error: null };
  const steps = dataOrThrow(stepsResult.data as Row[] | null, stepsResult.error, "Display Micro step lookup");
  const progressResult = await client.from("user_micro_path_progress").select("status,current_unit_id").eq("user_id", user.id).eq("path_id", pathId).maybeSingle();
  const progress = dataOrThrow(progressResult.data as Row | null, progressResult.error, "Display Micro progress lookup");
  const progressStatus = optionalText(progress ?? {}, "status") ?? "not_started";
  const total = steps.length;
  const completedResult = unitIds.length
    ? await client.from("user_micro_unit_progress").select("completed_step_ids").eq("user_id", user.id).in("unit_id", unitIds)
    : { data: [], error: null };
  const completedRows = dataOrThrow(completedResult.data as Row[] | null, completedResult.error, "Display Micro completion lookup");
  const completed = progressStatus === "completed" ? total : completedRows.reduce((sum, row) => sum + (Array.isArray(row.completed_step_ids) ? row.completed_step_ids.length : 0), 0);
  return {
    card: { cardType: "micro", pathId, knowledgeId: input.knowledgeId, ...(courseId ? { courseId } : {}) },
    display: {
      title: text(path, "title"),
      kicker: "小练习",
      description: optionalText(path, "description"),
      meta: [`约 ${minutes(path.estimated_minutes) ?? 0} 分钟`, `${completed} / ${total} 步`],
      status: statusOf(progressStatus || "not_started"),
      percent: total ? Math.round(completed / total * 100) : 0,
      actionLabel: progressStatus === "completed" ? "重新展开" : progressStatus === "in_progress" ? "继续" : "开始"
    }
  };
}

async function buildPracticeCard(client: SupabaseClient, user: User, input: Extract<AssistantDisplayCardInput, { cardType: "practice" }>): Promise<AssistantDisplayCardOutput | null> {
  const context = await getAssignmentContext(client, user, input.courseId, input.assignmentId);
  if (!context) return null;
  const stateResult = await client.from("user_assignment_states").select("status").eq("user_id", user.id).eq("course_id", input.courseId).eq("assignment_id", input.assignmentId).maybeSingle();
  const state = dataOrThrow(stateResult.data as Row | null, stateResult.error, "Display Assignment state lookup");
  const estimated = context.assignment.estimatedMinutes;
  return {
    card: { cardType: "practice", courseId: input.courseId, assignmentId: input.assignmentId },
    display: {
      title: context.assignment.title,
      kicker: "动手任务",
      description: typeof context.assignment.description === "string" ? context.assignment.description : undefined,
      meta: [estimated == null ? "动手做一次" : `约 ${estimated} 分钟`, `${context.knowledge.length} 个要点`],
      status: statusOf(optionalText(state ?? {}, "status") ?? "not_started"),
      actionLabel: "打开动手任务"
    }
  };
}

async function buildEvaluationCard(client: SupabaseClient, user: User, input: Extract<AssistantDisplayCardInput, { cardType: "evaluation" }>): Promise<AssistantDisplayCardOutput | null> {
  if (!await readableCourse(client, user, input.courseId)) return null;
  const attemptQuery = client.from("learning_attempts").select("id,attempt_number").eq("user_id", user.id).eq("course_id", input.courseId).eq("assignment_id", input.assignmentId);
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
  const passed = criteria.filter((criterion) => criterion.passed === true).length;
  const status = outcome === "passed" ? { label: "已通过", tone: "ok" as const } : outcome === "failed" ? { label: "需要修改", tone: "warn" as const } : { label: "评价中", tone: "quiet" as const };
  return {
    card: { cardType: "evaluation", courseId: input.courseId, assignmentId: input.assignmentId, attemptId: text(attempt, "id") },
    display: {
      title: text(assignment, "title"),
      kicker: "动手任务评价",
      description: typeof feedback.message === "string" ? feedback.message : undefined,
      meta: [`第 ${Number(attempt.attempt_number)} 次提交`, criteria.length ? `${passed} / ${criteria.length} 条标准通过` : "等待逐条评价"],
      status,
      actionLabel: "查看评价"
    }
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
  const done = nodeIds.filter((nodeId) => learned.has(nodeId)).length;
  return {
    card: { cardType: "course_chapter", courseId: input.courseId, chapterId: input.chapterId },
    display: {
      title: chapter.title,
      kicker: `第 ${chapter.order} 章`,
      description: chapter.outcome,
      meta: [`${nodeIds.length} 个要点`, `${done} 个已学`],
      status: done >= nodeIds.length && nodeIds.length ? { label: "已学完", tone: "ok" } : done ? { label: "学习中", tone: "brand" } : { label: "未开始", tone: "quiet" },
      percent: nodeIds.length ? Math.round(done / nodeIds.length * 100) : 0,
      actionLabel: "打开这一章"
    }
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
  const microCount = (courseId: string) => {
    const covered = new Set(coverageRows.filter((row) => text(row, "course_id") === courseId).map((row) => text(row, "node_id")));
    return new Set(microRows.filter((row) => covered.has(text(row, "knowledge_id")) && (text(row, "course_id") === courseId || row.course_id == null)).map((row) => text(row, "knowledge_id"))).size;
  };
  const startable = (courseId: string) => microCount(courseId) > 0;
  allMatches.sort((left, right) => Number(startable(right.courseId)) - Number(startable(left.courseId)) || microCount(right.courseId) - microCount(left.courseId) || right.targetCoverage - left.targetCoverage || left.courseTitle.localeCompare(right.courseTitle));
  const matches = allMatches.slice(0, 3);
  for (const match of matches) if (!await readableCourse(client, user, match.courseId)) return null;
  return {
    card: {
      cardType: "course_match",
      courseIds: matches.map((match) => match.courseId),
      targetKnowledgeIds: targetIds,
      goalText: plan.resolution.goalText.slice(0, 400)
    },
    display: {
      title: "课程匹配",
      kicker: matches.some((match) => startable(match.courseId)) ? "可以马上开始的课程" : "课程匹配",
      description: plan.resolution.targetKnowledge.slice(0, 3).map((item) => item.title).join("、"),
      items: matches.map((match) => ({
        id: match.courseId,
        title: match.courseTitle,
        meta: `${startable(match.courseId) ? `可立刻开始 · ${microCount(match.courseId)} 个真实小练习 · ` : "暂不能立刻开始 · "}目标覆盖 ${Math.round(match.targetCoverage * 100)}% · 必要范围 ${Math.round(match.requiredCoverage * 100)}%`,
        state: startable(match.courseId) ? "now" : "quiet"
      })),
      actionLabel: "查看课程"
    }
  };
}

async function buildKnowledgeCard(client: SupabaseClient, user: User, nodeId: string): Promise<AssistantDisplayCardOutput | null> {
  const knowledge = await getKnowledge(client, nodeId);
  if (!knowledge) return null;
  const [stateResult, microResult] = await Promise.all([
    client.from("user_knowledge_states").select("status").eq("user_id", user.id).eq("node_id", nodeId).maybeSingle(),
    client.from("micro_learning_paths").select("id,course_id,title,estimated_minutes").eq("knowledge_id", nodeId).eq("status", "published").eq("mode", "learn").limit(1)
  ]);
  const state = dataOrThrow(stateResult.data as Row | null, stateResult.error, "Display Knowledge state lookup");
  const micro = dataOrThrow(microResult.data as Row[] | null, microResult.error, "Display Knowledge Micro lookup")[0];
  const status = optionalText(state ?? {}, "status");
  return {
    card: { cardType: "knowledge", nodeId, ...(micro ? { pathId: text(micro, "id") } : {}), ...(micro && optionalText(micro, "course_id") ? { courseId: text(micro, "course_id") } : {}) },
    display: {
      title: micro ? text(micro, "title") : knowledge.title,
      kicker: "要点",
      description: typeof knowledge.description === "string" ? knowledge.description : undefined,
      meta: [micro ? `约 ${minutes(micro.estimated_minutes) ?? 0} 分钟` : "暂无可做的小练习"],
      status: status ? statusOf(status === "learning" ? "in_progress" : status) : { label: "未开始", tone: "quiet" },
      ...(micro ? { actionLabel: "开始这道小练习" } : {})
    }
  };
}

async function buildProgressCard(client: SupabaseClient, user: User, courseId?: string): Promise<AssistantDisplayCardOutput | null> {
  let stateQuery = client.from("user_course_states").select("course_id,is_active,updated_at").eq("user_id", user.id).eq("is_active", true);
  if (courseId) stateQuery = stateQuery.eq("course_id", courseId);
  const stateResult = await stateQuery.order("updated_at", { ascending: false }).limit(8);
  const states = dataOrThrow(stateResult.data as Row[] | null, stateResult.error, "Display progress Course lookup");
  if (!states.length) return null;
  const courseIds = states.map((row) => text(row, "course_id"));
  const courseResult = await client.from("courses").select("id,title").in("id", courseIds);
  const courses = dataOrThrow(courseResult.data as Row[] | null, courseResult.error, "Display progress title lookup");
  const titleById = new Map(courses.map((course) => [text(course, "id"), text(course, "title")]));
  const coverageResult = await client.from("curriculum_coverages").select("course_id,node_id").in("course_id", courseIds);
  const coverages = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Display progress coverage lookup");
  const knowledgeResult = await client.from("user_knowledge_states").select("node_id,status").eq("user_id", user.id);
  const knowledge = dataOrThrow(knowledgeResult.data as Row[] | null, knowledgeResult.error, "Display progress Knowledge lookup");
  const learned = new Set(knowledge.filter((row) => ["learned", "practicing", "mastered"].includes(text(row, "status"))).map((row) => text(row, "node_id")));
  const items = courseIds.flatMap((courseIdValue) => {
    const nodes = [...new Set(coverages.filter((coverage) => text(coverage, "course_id") === courseIdValue).map((coverage) => text(coverage, "node_id")))];
    const title = titleById.get(courseIdValue);
    if (!title) return [];
    const done = nodes.filter((nodeId) => learned.has(nodeId)).length;
    return [{ id: courseIdValue, title, meta: `${done} / ${nodes.length} 个要点已学`, state: done >= nodes.length && nodes.length ? "done" as const : done ? "now" as const : "quiet" as const }];
  });
  if (!items.length) return null;
  return {
    card: { cardType: "progress", courseIds: items.map((item) => item.id) },
    display: { title: "学习进度", kicker: "我的课程", items, actionLabel: "继续学习" }
  };
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
    display: {
      title: text(material, "title"),
      kicker: "资料片段",
      description: segment ? [optionalText(segment, "section"), optionalText(segment, "title")].filter(Boolean).join(" · ") : optionalText(material, "description"),
      meta: [segment?.page == null ? "学习资料" : `第 ${Number(segment.page)} 页`],
      actionLabel: "查看资料"
    }
  };
}

async function build(client: SupabaseClient, user: User, context: AssistantContextSnapshot, input: AssistantDisplayCardInput, state: AssistantDisplayCardState): Promise<AssistantDisplayCardOutput | null> {
  switch (input.cardType) {
    case "route": return buildRouteCard(client, user, input.courseId);
    case "micro": return buildMicroCard(client, user, input);
    case "practice": return buildPracticeCard(client, user, input);
    case "evaluation": return buildEvaluationCard(client, user, input);
    case "course_chapter": return buildChapterCard(client, user, input);
    case "course_match": return buildCourseMatchCard(client, user, state);
    case "knowledge": return buildKnowledgeCard(client, user, input.nodeId);
    case "progress": return buildProgressCard(client, user, input.courseId ?? context.courseId);
    case "material": return buildMaterialCard(client, user, input);
  }
}

export function createDisplayCardTool(client: SupabaseClient, user: User, context: AssistantContextSnapshot, state: AssistantDisplayCardState) {
  return tool({
    description: [
      "Show one product card inside the answer. Nominate only a card type and existing object IDs returned by EduFlow tools.",
      "Available cardType values: route (courseId), micro (knowledgeId, optional courseId/pathId), practice (courseId, assignmentId), evaluation (courseId, assignmentId), course_chapter (courseId, chapterId), knowledge (nodeId), progress (optional courseId), material (courseId, materialId, optional segmentId), course_match (no IDs; uses the latest planLearningGoal result).",
      "Call this at the exact point in your reply where the card belongs. Never call it more than 3 times. Never describe the card contents or repeat its numbers in the text.",
      "Every ID must come from a real tool result. If you do not have a valid ID, do not call the tool."
    ].join(" "),
    inputSchema: assistantDisplayCardInput,
    execute: async (input: AssistantDisplayCardInput): Promise<AssistantDisplayCardOutput> => {
      if (cardLimitReached(state.accepted)) return { skipped: "card_limit_reached" };
      try {
        const output = await build(client, user, context, input, state);
        if (!output || "skipped" in output) return { skipped: "card_not_available" };
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
