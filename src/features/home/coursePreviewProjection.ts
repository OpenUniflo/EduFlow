import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserCourseState } from "@/features/course/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import { buildChapterProgress } from "@/features/home/courseChapterProgress";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";

type TreeNodeState = "done" | "now" | "quiet";

type PreviewNode = { id: string; title: string; state: TreeNodeState };

type PreviewChapter = {
  id: string;
  number: number;
  title: string;
  nodes: PreviewNode[];
  doneCount: number;
  totalCount: number;
  hiddenNodeCount: number;
  assignments: Array<{ id: string; title: string; status: string }>;
};

const previewChapterLimit = 3;
const previewNodeLimit = 4;

/** Read-only skill/practice projection over the real course runtime and learner state. */
export function buildCoursePreview(input: {
  course: CourseRuntimeData;
  records: readonly UserKnowledgeRecord[];
  courseState?: UserCourseState;
  currentKnowledgeId?: string;
  nodeTitles?: ReadonlyMap<string, string>;
}): { chapters: PreviewChapter[]; totalChapters: number; hiddenChapterCount: number; totals: { done: number; learning: number; quiet: number }; nodeCount: number } {
  const recordByNode = new Map(input.records.map((record) => [record.nodeId, record.status]));
  const progress = buildChapterProgress({
    course: input.course,
    statusByNode: recordByNode,
    currentKnowledgeId: input.currentKnowledgeId,
    recentLessonId: input.courseState?.recentLessonId
  });
  const chapters = progress.slice(0, previewChapterLimit).map((chapter) => {
    const nodes = chapter.nodeIds.slice(0, previewNodeLimit).map((nodeId) => {
      const status = recordByNode.get(nodeId);
      const state: TreeNodeState = nodeId === input.currentKnowledgeId || status === "learning" ? "now" : status && satisfiesTeachingPrerequisite(status) ? "done" : "quiet";
      return { id: nodeId, title: input.nodeTitles?.get(nodeId) ?? nodeId, state };
    });
    const nodeIdSet = new Set(chapter.nodeIds);
    const assignmentIds = [...new Set(input.course.assignmentCoverages.filter((coverage) => nodeIdSet.has(coverage.nodeId)).map((coverage) => coverage.assignmentId))];
    const assignments = assignmentIds.flatMap((assignmentId) => {
      const assignment = input.course.assignments.find((item) => item.id === assignmentId);
      if (!assignment) return [];
      return [{ id: assignment.id, title: assignment.title, status: input.courseState?.assignmentStates[assignment.id]?.status ?? "not_started" }];
    });
    return {
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      nodes,
      doneCount: chapter.doneCount,
      totalCount: chapter.totalCount,
      hiddenNodeCount: Math.max(0, chapter.totalCount - nodes.length),
      assignments
    };
  });
  const totals = { done: 0, learning: 0, quiet: 0 };
  for (const nodeId of new Set(input.course.curriculumCoverages.map((coverage) => coverage.nodeId))) {
    const status = recordByNode.get(nodeId);
    if (status && satisfiesTeachingPrerequisite(status)) totals.done += 1;
    else if (status === "learning" || nodeId === input.currentKnowledgeId) totals.learning += 1;
    else totals.quiet += 1;
  }
  return {
    chapters,
    totalChapters: progress.length,
    hiddenChapterCount: Math.max(0, progress.length - chapters.length),
    totals,
    nodeCount: new Set(input.course.curriculumCoverages.map((coverage) => coverage.nodeId)).size
  };
}

