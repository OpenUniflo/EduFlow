import type { UserKnowledgeRecord } from "@/features/profile/types";
import { chapterDisplayNumbers, chapterNumberLabel } from "@/shared/learning/chapterNumbering";
import { selectPrimaryCurriculumCoverage } from "../curriculum/curriculumOrdering";
import { learnerCategory } from "../immersive/learnerStateProjection";
import type { CourseRuntimeData } from "../runtime/courseRuntime";
import type { CurriculumCoverage } from "../types";

type HeaderRuntime = Pick<CourseRuntimeData, "chapters" | "lessons" | "curriculumCoverages">;
type HeaderRecord = Pick<UserKnowledgeRecord, "nodeId" | "status">;

export type CourseHeaderModel = {
  total: number;
  learned: number;
  chapterCount: number;
  progress: number;
  /** One-based chapter of the current Knowledge, if any. */
  currentChapter: string | null;
};

/**
 * The shared Course header reads the same durable UserKnowledgeState as the
 * route and tree. Order comes from primary curriculum coverage, never from
 * repository array order, so both views show one progress summary.
 */
export function buildCourseHeaderModel(runtime: HeaderRuntime, records: readonly HeaderRecord[]): CourseHeaderModel {
  const lessonById = new Map(runtime.lessons.map((lesson) => [lesson.id, lesson]));
  const chapterById = new Map(runtime.chapters.map((chapter) => [chapter.id, chapter]));
  const chapterNumbers = chapterDisplayNumbers(runtime.chapters);
  const byNode = new Map<string, CurriculumCoverage[]>();
  runtime.curriculumCoverages.forEach((coverage) => {
    byNode.set(coverage.nodeId, [...(byNode.get(coverage.nodeId) ?? []), coverage]);
  });
  const ordered = [...byNode.entries()].flatMap(([nodeId, coverages]) => {
    const primary = selectPrimaryCurriculumCoverage(coverages, runtime.lessons);
    const lesson = primary ? lessonById.get(primary.lessonId) : undefined;
    if (!primary || !lesson) return [];
    return [{ nodeId, primary, lesson }];
  }).sort((left, right) => (
    left.lesson.order - right.lesson.order
    || left.primary.order - right.primary.order
    || left.nodeId.localeCompare(right.nodeId)
  ));
  const statusByNode = new Map(records.map((record) => [record.nodeId, record.status]));
  const learned = ordered.filter(({ nodeId }) => learnerCategory(statusByNode.get(nodeId)) === "acquired").length;
  const currentId = ordered.find(({ nodeId }) => statusByNode.get(nodeId) === "learning")?.nodeId
    ?? ordered.find(({ nodeId }) => learnerCategory(statusByNode.get(nodeId)) === "acquired")?.nodeId
    ?? null;
  const current = currentId ? ordered.find((item) => item.nodeId === currentId) : undefined;
  const chapter = current ? chapterById.get(current.lesson.chapterId) : undefined;
  const chapterNumber = chapter ? chapterNumbers.get(chapter.id) : undefined;
  return {
    total: ordered.length,
    learned,
    chapterCount: runtime.chapters.length,
    progress: ordered.length ? Math.round((learned / ordered.length) * 100) : 0,
    currentChapter: chapter ? [chapterNumberLabel(chapterNumber), chapter.title].filter(Boolean).join(" · ") : null
  };
}
