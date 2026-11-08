import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserCourseState } from "@/features/course/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { buildFirstSegment, type AssignmentProgressStatus, type FirstSegment, type LearnerEvidenceStatus } from "@/shared/learning/firstSegment";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";

export type HomeMicroAsset = { pathId: string; title: string; estimatedMinutes?: number };

export type CourseChapterGroup = {
  id: string;
  title: string;
  order: number;
  nodeIds: string[];
  microCount: number;
  learnedCount: number;
};

export type HomeCourseProjection = {
  orderedNodeIds: string[];
  segment: FirstSegment;
  chapters: CourseChapterGroup[];
  microByNode: ReadonlyMap<string, HomeMicroAsset>;
  practiceByNode: ReadonlyMap<string, { assignmentId: string; title: string; estimatedMinutes?: number }>;
  titleByNode: ReadonlyMap<string, string>;
  knowledgeStatusByNode: ReadonlyMap<string, LearnerEvidenceStatus>;
  currentChapterId?: string;
  currentChapterTitle?: string;
};

/** Canonical Course presentation order: Lesson order, coverage order, stable id. */
export function orderedCourseNodeIds(runtime: CourseRuntimeData): string[] {
  const lessonOrder = new Map(runtime.lessons.map((lesson) => [lesson.id, lesson.order]));
  return [...runtime.curriculumCoverages]
    .sort((left, right) => (lessonOrder.get(left.lessonId) ?? Number.MAX_SAFE_INTEGER) - (lessonOrder.get(right.lessonId) ?? Number.MAX_SAFE_INTEGER)
      || left.order - right.order
      || left.nodeId.localeCompare(right.nodeId))
    .map((coverage) => coverage.nodeId)
    .filter((nodeId, index, values) => values.indexOf(nodeId) === index);
}

export function chapterForNode(runtime: CourseRuntimeData, nodeId: string) {
  const coverage = runtime.curriculumCoverages.find((item) => item.nodeId === nodeId);
  const lesson = coverage ? runtime.lessons.find((item) => item.id === coverage.lessonId) : undefined;
  return lesson ? runtime.chapters.find((item) => item.id === lesson.chapterId) : undefined;
}

export function buildHomeCourseProjection(input: {
  runtime: CourseRuntimeData;
  records: readonly UserKnowledgeRecord[];
  courseState: UserCourseState;
  decision?: NavigationDecision | null;
  microFor(nodeId: string): HomeMicroAsset | undefined;
  titleFor?(nodeId: string): string | undefined;
}): HomeCourseProjection {
  const orderedNodeIds = orderedCourseNodeIds(input.runtime);
  const statusByNode = new Map(input.records.map((record) => [record.nodeId, record.status as LearnerEvidenceStatus]));
  const assignmentStatus = new Map<string, AssignmentProgressStatus>();
  for (const [assignmentId, state] of Object.entries(input.courseState.assignmentStates)) {
    const status = state?.status;
    if (status) assignmentStatus.set(assignmentId, status as AssignmentProgressStatus);
  }
  const microByNode = new Map<string, HomeMicroAsset>();
  for (const nodeId of orderedNodeIds) {
    const asset = input.microFor(nodeId);
    if (asset) microByNode.set(nodeId, asset);
  }
  const assignmentOrder = new Map(input.runtime.assignments.map((assignment) => [assignment.id, assignment.order]));
  const practiceByNode = new Map<string, { assignmentId: string; title: string; estimatedMinutes?: number }>();
  for (const coverage of [...input.runtime.assignmentCoverages].sort((left, right) => (assignmentOrder.get(left.assignmentId) ?? 0) - (assignmentOrder.get(right.assignmentId) ?? 0))) {
    if (practiceByNode.has(coverage.nodeId)) continue;
    const assignment = input.runtime.assignments.find((item) => item.id === coverage.assignmentId);
    if (assignment) practiceByNode.set(coverage.nodeId, {
      assignmentId: assignment.id,
      title: assignment.title,
      ...(assignment.estimatedMinutes ? { estimatedMinutes: assignment.estimatedMinutes } : {})
    });
  }
  const segment = buildFirstSegment({
    orderedNodeIds,
    microByNode,
    practiceByNode,
    knowledgeStatusByNode: statusByNode,
    assignmentStatusByAssignment: assignmentStatus
  });
  const chapters = [...input.runtime.chapters].sort((left, right) => left.order - right.order).map((chapter): CourseChapterGroup => {
    const nodeIds = orderedNodeIds.filter((nodeId) => chapterForNode(input.runtime, nodeId)?.id === chapter.id);
    return {
      id: chapter.id,
      title: chapter.title,
      order: chapter.order,
      nodeIds,
      microCount: nodeIds.filter((nodeId) => microByNode.has(nodeId)).length,
      learnedCount: nodeIds.filter((nodeId) => satisfiesTeachingPrerequisite(statusByNode.get(nodeId))).length
    };
  });
  const nextNodeId = input.decision?.nextAction.nodeId;
  const current = nextNodeId ? chapterForNode(input.runtime, nextNodeId) : chapters.find((chapter) => chapter.learnedCount < chapter.nodeIds.length);
  const titleByNode = new Map(orderedNodeIds.map((nodeId) => [nodeId, microByNode.get(nodeId)?.title ?? practiceByNode.get(nodeId)?.title ?? input.titleFor?.(nodeId) ?? nodeId]));
  return {
    orderedNodeIds,
    segment,
    chapters,
    microByNode,
    practiceByNode,
    titleByNode,
    knowledgeStatusByNode: statusByNode,
    ...(current ? { currentChapterId: current.id, currentChapterTitle: current.title } : {})
  };
}

export type CourseRouteActionChoice =
  | { kind: "micro"; pathId: string; assignmentId?: undefined }
  | { kind: "practice"; assignmentId: string; pathId?: undefined }
  | { kind: "none"; pathId?: undefined; assignmentId?: undefined };

/**
 * The one action the current route step should open. Preference follows the
 * first-segment step, not asset existence: a completed Micro with an open
 * practice opens the practice. The old asset-first rule reopened learned Micros.
 */
export function resolveCourseRouteAction(input: {
  nodeId: string;
  micro?: { pathId: string };
  practice?: { assignmentId: string };
  currentStep?: { nodeId: string; kind: "micro" | "practice" };
  microLearned: boolean;
  practiceDone: boolean;
}): CourseRouteActionChoice {
  const { micro, practice, currentStep, nodeId } = input;
  if (currentStep?.nodeId === nodeId) {
    if (currentStep.kind === "practice" && practice) return { kind: "practice", assignmentId: practice.assignmentId };
    if (currentStep.kind === "micro" && micro) return { kind: "micro", pathId: micro.pathId };
  }
  if (micro && !input.microLearned) return { kind: "micro", pathId: micro.pathId };
  if (practice && !input.practiceDone) return { kind: "practice", assignmentId: practice.assignmentId };
  if (micro) return { kind: "micro", pathId: micro.pathId };
  if (practice) return { kind: "practice", assignmentId: practice.assignmentId };
  return { kind: "none" };
}
