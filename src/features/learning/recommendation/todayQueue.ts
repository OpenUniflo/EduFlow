import { sortCurriculumCoverages } from "@/features/course/curriculum/curriculumOrdering";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserCourseState } from "@/features/course/types";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";

export type TodayQueueReason = "continue" | "review" | "new" | "prerequisite" | "enrichment";
export type TodayQueueItem = {
  courseId: string;
  courseTitle: string;
  knowledgeId: string;
  knowledgeTitle: string;
  lessonId: string;
  lessonOrder: number;
  coverageOrder: number;
  reason: TodayQueueReason;
  estimatedMinutes: number;
};

export function buildTodayQueue({ runtimes, graph, userKnowledge, courseStates, limit = 3 }: {
  runtimes: CourseRuntimeData[];
  graph: KnowledgeGraph;
  userKnowledge: UserKnowledgeRecord[];
  courseStates: UserCourseState[];
  limit?: number;
}) {
  const recordById = new Map(userKnowledge.map((record) => [record.nodeId, record]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const stateByCourse = new Map(courseStates.map((state) => [state.courseId, state]));
  const prerequisitesByNode = new Map<string, string[]>();
  graph.edges.filter((edge) => edge.relation === "prerequisite").forEach((edge) => prerequisitesByNode.set(edge.target, [...(prerequisitesByNode.get(edge.target) ?? []), edge.source]));
  const mastered = (nodeId: string) => recordById.get(nodeId)?.status === "mastered";
  const candidates: Array<TodayQueueItem & { priority: number; courseOrder: number }> = [];

  runtimes.forEach((runtime, courseOrder) => {
    const state = stateByCourse.get(runtime.course.id);
    const ordered = sortCurriculumCoverages(runtime.curriculumCoverages, runtime.lessons);
    const seen = new Set<string>();
    ordered.forEach((coverage) => {
      if (seen.has(coverage.nodeId)) return;
      seen.add(coverage.nodeId);
      const node = nodeById.get(coverage.nodeId);
      const lesson = runtime.lessons.find((item) => item.id === coverage.lessonId);
      if (!node || node.status !== "active" || !lesson || mastered(node.id)) return;
      const record = recordById.get(node.id);
      const prerequisites = prerequisitesByNode.get(node.id) ?? [];
      const eligible = prerequisites.every(mastered);
      if (!eligible && record?.status !== "learning") return;
      const hasRecentCourseActivity = Boolean(state?.recentLessonId || Object.keys(state?.materialStates ?? {}).length);
      const reason: TodayQueueReason = record?.status === "learning" ? "continue" : coverage.role === "introduce" ? "new" : "enrichment";
      candidates.push({ courseId:runtime.course.id, courseTitle:runtime.course.title, knowledgeId:node.id, knowledgeTitle:node.title, lessonId:lesson.id, lessonOrder:lesson.order, coverageOrder:coverage.order, reason, estimatedMinutes:reason === "continue" ? 8 : 10, priority:record?.status === "learning" ? 1 : hasRecentCourseActivity ? 3 : 4, courseOrder });
    });
  });

  return candidates.sort((left, right) => left.priority - right.priority || left.courseOrder - right.courseOrder || left.lessonOrder - right.lessonOrder || left.coverageOrder - right.coverageOrder || left.knowledgeId.localeCompare(right.knowledgeId)).slice(0, limit).map(({ priority: _priority, courseOrder: _courseOrder, ...item }) => item);
}
