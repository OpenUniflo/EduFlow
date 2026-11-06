import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";

export type ChapterProgressState = "done" | "current" | "quiet";

export type ChapterProgress = {
  id: string;
  number: number;
  title: string;
  nodeIds: string[];
  doneCount: number;
  totalCount: number;
  state: ChapterProgressState;
};


/**
 * Real per-chapter progress over the curriculum and learner state. Node order in
 * a chapter follows CurriculumCoverage order; counts always cover the full
 * chapter, never a truncated preview.
 */
export function buildChapterProgress(input: {
  course: CourseRuntimeData;
  statusByNode: ReadonlyMap<string, string | undefined>;
  currentKnowledgeId?: string;
  recentLessonId?: string;
}): ChapterProgress[] {
  const chapterOfLesson = new Map(input.course.lessons.map((lesson) => [lesson.id, lesson.chapterId]));
  const nodeIdsByChapter = new Map<string, string[]>();
  for (const coverage of [...input.course.curriculumCoverages].sort((left, right) => left.order - right.order)) {
    const chapterId = chapterOfLesson.get(coverage.lessonId);
    if (!chapterId) continue;
    const list = nodeIdsByChapter.get(chapterId) ?? [];
    if (!list.includes(coverage.nodeId)) list.push(coverage.nodeId);
    nodeIdsByChapter.set(chapterId, list);
  }
  const recentChapterId = input.recentLessonId ? chapterOfLesson.get(input.recentLessonId) : undefined;
  return [...input.course.chapters].sort((left, right) => left.order - right.order).map((chapter, index) => {
    const nodeIds = nodeIdsByChapter.get(chapter.id) ?? [];
    let doneCount = 0;
    let hasLearning = false;
    for (const nodeId of nodeIds) {
      const status = input.statusByNode.get(nodeId);
      if (status && satisfiesTeachingPrerequisite(status)) doneCount += 1;
      if (status === "learning" || nodeId === input.currentKnowledgeId) hasLearning = true;
    }
    const state: ChapterProgressState = hasLearning || chapter.id === recentChapterId
      ? "current"
      : nodeIds.length > 0 && doneCount === nodeIds.length
        ? "done"
        : "quiet";
    return { id: chapter.id, number: index + 1, title: chapter.title, nodeIds, doneCount, totalCount: nodeIds.length, state };
  });
}
