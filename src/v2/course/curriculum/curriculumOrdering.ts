import type { CourseCurriculumContext, CourseSkillTreeNode, CurriculumCoverage, CurriculumLesson } from "../../types";

export const CURRICULUM_ROLE_PRIORITY: Record<CurriculumCoverage["role"], number> = {
  introduce: 0,
  reinforce: 1,
  apply: 2,
  assess: 3
};

type CurriculumOrderContext = {
  lessonOrderById: ReadonlyMap<string, number>;
};

export function compareCurriculumCoverages(left: CurriculumCoverage, right: CurriculumCoverage, context: CurriculumOrderContext) {
  return (context.lessonOrderById.get(left.lessonId) ?? Number.MAX_SAFE_INTEGER)
    - (context.lessonOrderById.get(right.lessonId) ?? Number.MAX_SAFE_INTEGER)
    || left.order - right.order
    || CURRICULUM_ROLE_PRIORITY[left.role] - CURRICULUM_ROLE_PRIORITY[right.role]
    || left.nodeId.localeCompare(right.nodeId)
    || left.id.localeCompare(right.id);
}

export function sortCurriculumCoverages(coverages: readonly CurriculumCoverage[], lessons: readonly CurriculumLesson[]) {
  const lessonOrderById = new Map(lessons.map((lesson) => [lesson.id, lesson.order]));
  return [...coverages].sort((left, right) => compareCurriculumCoverages(left, right, { lessonOrderById }));
}

export function selectPrimaryCurriculumCoverage(coverages: readonly CurriculumCoverage[], lessons: readonly CurriculumLesson[]) {
  const introduced = coverages.filter((coverage) => coverage.role === "introduce");
  return sortCurriculumCoverages(introduced.length ? introduced : coverages, lessons)[0];
}

export function compareCourseCurriculumContexts(left: CourseCurriculumContext, right: CourseCurriculumContext) {
  return left.lessonOrder - right.lessonOrder
    || left.order - right.order
    || CURRICULUM_ROLE_PRIORITY[left.role] - CURRICULUM_ROLE_PRIORITY[right.role]
    || left.nodeId.localeCompare(right.nodeId)
    || left.id.localeCompare(right.id);
}

export function compareCourseKnowledgeOrder(left: CourseSkillTreeNode, right: CourseSkillTreeNode) {
  return compareCourseCurriculumContexts(left.primaryCoverage, right.primaryCoverage)
    || left.id.localeCompare(right.id);
}
