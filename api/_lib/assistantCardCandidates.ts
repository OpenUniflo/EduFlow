import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AssistantContextSnapshot } from "../../src/features/assistant/assistantContract.js";
import type { AssistantCardRef } from "../../src/features/assistant/assistantCards.js";
import { dataOrThrow } from "./query.js";
import { getCourseContext, readableCourse } from "./assistantTools.js";
import { readNavigationDecision } from "./navigationDecision.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const optionalText = (row: Row, key: string) => row[key] == null ? undefined : String(row[key]);
const minutes = (value: unknown) => value == null || Number.isNaN(Number(value)) ? undefined : Number(value);

export type CardCandidate = AssistantCardRef & { title: string; note?: string };
export type LearnerFacts = {
  started: boolean;
  activeCourses: Array<{ courseId: string; title: string }>;
  knowledge: { learning: number; learned: number; practicing: number; mastered: number };
  recentCourse?: { courseId: string; title: string; nextAction?: string };
  hasAnyRecord: boolean;
};

export type AssistantCardContext = { facts: LearnerFacts; candidates: CardCandidate[] };

function microByNode(rows: Row[], courseId: string | undefined) {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const nodeId = text(row, "knowledge_id");
    const current = map.get(nodeId);
    const rowCourse = optionalText(row, "course_id");
    if (!current) { map.set(nodeId, row); continue; }
    if (courseId && rowCourse === courseId && optionalText(current, "course_id") !== courseId) map.set(nodeId, row);
  }
  return map;
}

async function activeCourseStates(client: SupabaseClient, userId: string) {
  const result = await client.from("user_course_states").select("course_id,is_active,recent_lesson_id,updated_at").eq("user_id", userId).eq("is_active", true).order("updated_at", { ascending: false }).limit(8);
  return dataOrThrow(result.data as Row[] | null, result.error, "Assistant active Course facts");
}

async function courseTitles(client: SupabaseClient, courseIds: string[]) {
  if (!courseIds.length) return new Map<string, string>();
  const result = await client.from("courses").select("id,title").in("id", courseIds);
  return new Map(dataOrThrow(result.data as Row[] | null, result.error, "Assistant Course titles").map((row) => [text(row, "id"), text(row, "title")]));
}

async function knowledgeFacts(client: SupabaseClient, userId: string) {
  const result = await client.from("user_knowledge_states").select("node_id,status").eq("user_id", userId).limit(500);
  const rows = dataOrThrow(result.data as Row[] | null, result.error, "Assistant Knowledge facts");
  const counts = { learning: 0, learned: 0, practicing: 0, mastered: 0 };
  for (const row of rows) {
    const status = text(row, "status");
    if (status in counts) counts[status as keyof typeof counts] += 1;
  }
  return { counts, total: rows.length };
}

/** A real, read-only snapshot of objects this learner can act on right now. */
export async function buildAssistantCardContext(client: SupabaseClient, user: User, context: AssistantContextSnapshot): Promise<AssistantCardContext> {
  const [activeStates, knowledge] = await Promise.all([activeCourseStates(client, user.id), knowledgeFacts(client, user.id)]);
  const activeIds = activeStates.map((row) => text(row, "course_id"));
  const titles = await courseTitles(client, activeIds);
  const facts: LearnerFacts = {
    started: activeStates.length > 0 || knowledge.total > 0,
    activeCourses: activeStates.flatMap((row) => {
      const courseId = text(row, "course_id");
      const title = titles.get(courseId);
      return title ? [{ courseId, title }] : [];
    }),
    knowledge: knowledge.counts,
    hasAnyRecord: knowledge.total > 0
  };

  const candidates: CardCandidate[] = [];
  const contextCourseId = context.courseId && await readableCourse(client, user, context.courseId) ? context.courseId : undefined;
  const selectedCourseId = contextCourseId ?? activeIds[0];

  if (selectedCourseId) {
    const course = await getCourseContext(client, user, selectedCourseId);
    if (course) {
      const courseTitle = course.course.title;
      const active = activeIds.includes(selectedCourseId);
      let routeNodes = course.curriculumCoverage.map((coverage) => coverage.nodeId);
      let nextNodeId: string | undefined;
      let nextActionLabel: string | undefined;
      let nextAssignmentId: string | undefined;
      if (active || contextCourseId) {
        try {
          const decision = await readNavigationDecision(client, user.id, selectedCourseId);
          nextNodeId = decision.nextAction.nodeId;
          nextActionLabel = decision.nextAction.reason;
          nextAssignmentId = decision.nextAction.resourceKind === "assignment" ? decision.nextAction.resourceId : undefined;
          routeNodes = decision.path.slice(Math.max(0, decision.path.findIndex((item) => item.state === "underway" || item.state === "eligible"))).map((item) => item.nodeId);
        } catch {
          // A route read is optional for facts; the curriculum order remains authoritative.
        }
      }
      const ids = [...new Set([nextNodeId, ...routeNodes].filter((id): id is string => Boolean(id)))].slice(0, 6);
      const microIds = nextAssignmentId ? ids.filter((id) => id !== nextNodeId) : ids;
      const microResult = microIds.length
        ? await client.from("micro_learning_paths").select("id,knowledge_id,course_id,title,estimated_minutes,mode,status").in("knowledge_id", microIds).eq("status", "published").eq("mode", "learn").limit(30)
        : { data: [], error: null };
      const microRows = dataOrThrow(microResult.data as Row[] | null, microResult.error, "Assistant card Micro candidates");
      const micros = microByNode(microRows, selectedCourseId);
      candidates.push({ cardType: "route", courseId: selectedCourseId, title: courseTitle, note: nextNodeId ? "当前路线" : "课程起步" });
      if (nextAssignmentId) {
        const assignmentResult = await client.from("course_assignments").select("id,title,estimated_minutes").eq("course_id", selectedCourseId).eq("id", nextAssignmentId).maybeSingle();
        const assignment = dataOrThrow(assignmentResult.data as Row | null, assignmentResult.error, "Assistant current Assignment candidate");
        if (assignment) candidates.push({ cardType: "practice", courseId: selectedCourseId, assignmentId: text(assignment, "id"), title: text(assignment, "title"), note: `当前下一步 · ${minutes(assignment.estimated_minutes) ?? 15} 分钟动手任务` });
      }
      for (const [index, nodeId] of ids.slice(0, 6).entries()) {
        const node = course.knowledge.find((item) => item.id === nodeId);
        const micro = micros.get(nodeId);
        if (micro) {
          candidates.push({ cardType: "micro", pathId: text(micro, "id"), knowledgeId: nodeId, ...(optionalText(micro, "course_id") ? { courseId: text(micro, "course_id") } : {}), title: text(micro, "title"), note: nodeId === nextNodeId ? "当前下一步" : "相关小练习" });
        }
        if (node && index < 4) candidates.push({ cardType: "knowledge", nodeId, title: micro ? text(micro, "title") : node.title, note: "要点" });
      }
      const chapter = course.chapters.find((item) => course.curriculumCoverage.some((coverage) => coverage.nodeId === nextNodeId && course.lessons.find((lesson) => lesson.id === coverage.lessonId)?.chapterId === item.id)) ?? course.chapters[0];
      if (chapter) candidates.push({ cardType: "course_chapter", courseId: selectedCourseId, chapterId: chapter.id, title: chapter.title, note: `第 ${chapter.order} 章` });
      if (active) candidates.push({ cardType: "progress", courseIds: activeIds.slice(0, 4), title: "学习进度", note: "已开始的课程" });
      if (active) facts.recentCourse = { courseId: selectedCourseId, title: courseTitle, ...(nextActionLabel ? { nextAction: nextActionLabel } : {}) };
      const materialResult = await client.from("materials").select("id,title").eq("course_id", selectedCourseId).limit(1);
      const material = dataOrThrow(materialResult.data as Row[] | null, materialResult.error, "Assistant card Material candidates")[0];
      if (material) candidates.push({ cardType: "material", courseId: selectedCourseId, materialId: text(material, "id"), title: text(material, "title"), note: "学习资料" });
      if (!nextAssignmentId) {
        const assignmentQuery = context.assignmentId
          ? client.from("course_assignments").select("id,title,estimated_minutes,mode").eq("course_id", selectedCourseId).eq("id", context.assignmentId).limit(1)
          : client.from("course_assignments").select("id,title,estimated_minutes,mode").eq("course_id", selectedCourseId).limit(3);
        const assignmentResult = await assignmentQuery;
        const assignments = dataOrThrow(assignmentResult.data as Row[] | null, assignmentResult.error, "Assistant card Assignment candidates");
        for (const assignment of assignments) {
          candidates.push({ cardType: "practice", courseId: selectedCourseId, assignmentId: text(assignment, "id"), title: text(assignment, "title"), note: `${minutes(assignment.estimated_minutes) ?? 15} 分钟动手任务` });
          break;
        }
      }
    }
  }

  // No Course context at all: choose a startable published Course from its
  // real curriculum order (not by title or a fixed ID), then offer its first
  // real Micro paths. This is a data snapshot, not intent classification.
  if (!selectedCourseId) {
    const courseResult = await client.from("courses").select("id,title,lifecycle").eq("lifecycle", "published").limit(20);
    const courses = dataOrThrow(courseResult.data as Row[] | null, courseResult.error, "Assistant starter Course candidates");
    const courseIds = courses.map((course) => text(course, "id"));
    let starterCourse: Row | undefined;
    let starterNodes: string[] = [];
    let starterMicroRows: Row[] = [];
    if (courseIds.length) {
      const [lessonResult, coverageResult] = await Promise.all([
        client.from("curriculum_lessons").select("id,course_id,display_order").in("course_id", courseIds).order("display_order"),
        client.from("curriculum_coverages").select("course_id,lesson_id,node_id,display_order").in("course_id", courseIds).order("display_order")
      ]);
      const lessons = dataOrThrow(lessonResult.data as Row[] | null, lessonResult.error, "Assistant starter Lesson order");
      const coverages = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Assistant starter coverage order");
      const lessonOrder = new Map(lessons.map((lesson) => [`${text(lesson, "course_id")}:${text(lesson, "id")}`, Number(lesson.display_order)]));
      let bestCount = -1;
      for (const course of courses) {
        const courseId = text(course, "id");
        const courseCoverages = coverages.filter((coverage) => text(coverage, "course_id") === courseId)
          .sort((left, right) => (lessonOrder.get(`${courseId}:${text(left, "lesson_id")}`) ?? 0) - (lessonOrder.get(`${courseId}:${text(right, "lesson_id")}`) ?? 0) || Number(left.display_order) - Number(right.display_order));
        const nodes = [...new Set(courseCoverages.map((coverage) => text(coverage, "node_id")))].slice(0, 8);
        if (!nodes.length) continue;
        const pathsResult = await client.from("micro_learning_paths").select("id,knowledge_id,course_id,title,estimated_minutes,mode,status").in("knowledge_id", nodes).eq("status", "published").eq("mode", "learn").limit(40);
        const paths = dataOrThrow(pathsResult.data as Row[] | null, pathsResult.error, "Assistant starter Micro paths");
        const ready = nodes.slice(0, 4).filter((nodeId) => paths.some((path) => text(path, "knowledge_id") === nodeId && (text(path, "course_id") === courseId || path.course_id == null))).length;
        if (ready > bestCount) { bestCount = ready; starterCourse = course; starterNodes = nodes; starterMicroRows = paths; }
        if (ready >= 4) break;
      }
    }
    if (starterCourse) {
      const courseId = text(starterCourse, "id");
      candidates.push({ cardType: "route", courseId, title: text(starterCourse, "title"), note: "课程起步" });
      const micros = microByNode(starterMicroRows, courseId);
      for (const nodeId of starterNodes.slice(0, 6)) {
        const micro = micros.get(nodeId);
        if (!micro) continue;
        candidates.push({ cardType: "micro", pathId: text(micro, "id"), knowledgeId: nodeId, courseId, title: text(micro, "title"), note: "真实小练习" });
      }
      for (const nodeId of starterNodes.slice(0, 4)) {
        const micro = micros.get(nodeId);
        candidates.push({ cardType: "knowledge", nodeId, title: micro ? text(micro, "title") : nodeId, note: "要点" });
      }
      const courseContext = await getCourseContext(client, user, courseId);
      const chapter = courseContext?.chapters[0];
      if (chapter) candidates.push({ cardType: "course_chapter", courseId, chapterId: chapter.id, title: chapter.title, note: `第 ${chapter.order} 章` });
      const assignmentResult = await client.from("course_assignments").select("id,title,estimated_minutes").eq("course_id", courseId).limit(1);
      const assignment = dataOrThrow(assignmentResult.data as Row[] | null, assignmentResult.error, "Assistant starter Assignment")[0];
      if (assignment) candidates.push({ cardType: "practice", courseId, assignmentId: text(assignment, "id"), title: text(assignment, "title"), note: `${minutes(assignment.estimated_minutes) ?? 15} 分钟动手任务` });
    }
  }

  // Deduplicate by type + identity and cap the prompt payload.
  const seen = new Set<string>();
  const unique = candidates.filter((candidate) => {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 16);
  return { facts, candidates: unique };
}

export function cardContextPrompt(input: AssistantCardContext) {
  const facts = input.facts;
  return [
    "REAL LEARNER FACTS (authoritative; never claim more than this):",
    JSON.stringify({
      started: facts.started,
      activeCourses: facts.activeCourses,
      knowledge: facts.knowledge,
      recentCourse: facts.recentCourse ?? null
    }),
    "CARD CANDIDATES (real objects the learner can use right now; nominate by exact IDs only):",
    JSON.stringify(input.candidates),
    "Card rules: choose at most 3 cards. Use only these candidates or IDs returned by a tool in this turn. When the learner asks for a practice, nominate a candidate micro card; never write your own exercise questions. If no candidate is relevant, say plainly that this content is not available and continue the answer. For a learning question (concept, how to start, progress, a specific topic), prefer one relevant card when a candidate fits. A general definition can carry one knowledge or micro card. Capability questions ('你能做什么'), identity/meta conversation and small talk are not learning questions: use zero learning cards there.",
    "If started is false, never say the learner is studying, has studied, or has a current course. If started is true, answer progress questions from these facts (recentCourse and knowledge counts), not from a missing courseId.",
    "A learner statement such as '我已经学过 Agent' is a claim, not a learning record. Acknowledge it, record nothing, and never say required prerequisites can be skipped. You may offer the route card as the way to continue, but not as proof of progress.",
    "When the learner asks how far they have got, prefer the progress card if started is true. When the learner asks what to do next, prefer the route card and its current-step action. When they ask for an exercise, prefer the micro card. Do not substitute a different card type when the matching candidate exists.",
    "If the learner asks what they have learned and started is true, use the progress or route card; if started is false, say the account has no learning record yet and offer the starter route.",
    "Never narrate a lookup ('我先帮你查看', '我先确认一下'). Do not put process talk in the answer. Tool progress is shown by the interface.",
    "Use each candidate's title as its learner-facing name. If you mention a specific candidate as something the learner can start, nominate that same candidate with displayCard in the same answer; otherwise do not name it as startable."
  ].join("\n");
}
