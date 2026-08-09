import { globalKnowledgeGraph } from "../../knowledge/graph";
import { assertDirectedAcyclic, transitiveReduction } from "../../knowledge/graphAlgorithms";
import type { KnowledgeGraph } from "../../knowledge/types";
import type {
  AssignmentCoverage,
  Course,
  CourseAssignment,
  CourseAssignmentSummary,
  CourseChapterEdge,
  CourseChapterProjection,
  CourseCurriculum,
  CourseSkillTreeEdge,
  CourseSkillTreeNode,
  CourseSummary,
  CurriculumChapter,
  CurriculumCoverage,
  CurriculumLesson,
  CurriculumSequence,
  Material,
  MaterialKnowledgeCoverage,
  UserAssignmentState,
  UserCourseState
} from "../../types";

export type CourseRuntimeData = {
  course: Course;
  curriculum: CourseCurriculum;
  chapters: CurriculumChapter[];
  lessons: CurriculumLesson[];
  curriculumCoverages: CurriculumCoverage[];
  curriculumSequences: CurriculumSequence[];
  assignments: CourseAssignment[];
  assignmentCoverages: AssignmentCoverage[];
  materials: Material[];
  materialKnowledgeCoverages: MaterialKnowledgeCoverage[];
  revision: string;
};

export type CourseGraphData = {
  courseId: string;
  revision: string;
  chapters: CourseChapterProjection[];
  knowledgeNodes: CourseSkillTreeNode[];
  knowledgeEdges: CourseSkillTreeEdge[];
  chapterEdges: CourseChapterEdge[];
  assignmentSummary: CourseAssignmentSummary;
};

function groupBy<T>(items: T[], key: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => grouped.set(key(item), [...(grouped.get(key(item)) ?? []), item]));
  return grouped;
}

export function validateCourseRuntime(runtime: CourseRuntimeData, graph: KnowledgeGraph = globalKnowledgeGraph) {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const courseNodeIds = new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId));
  const assignmentIds = new Set(runtime.assignments.map((assignment) => assignment.id));
  const materialIds = new Set(runtime.materials.map((material) => material.id));
  const segmentIds = new Set(runtime.materials.flatMap((material) => material.segments.map((segment) => `${material.id}:${segment.id}`)));
  runtime.curriculumCoverages.forEach((coverage) => {
    if (coverage.courseId !== runtime.course.id) errors.push(`Coverage ${coverage.id} belongs to another Course`);
    if (!nodeIds.has(coverage.nodeId)) errors.push(`Coverage ${coverage.id} references unknown KnowledgeNode ${coverage.nodeId}`);
  });
  runtime.assignmentCoverages.forEach((coverage) => {
    if (!assignmentIds.has(coverage.assignmentId)) errors.push(`AssignmentCoverage ${coverage.id} references unknown Assignment`);
    if (!courseNodeIds.has(coverage.nodeId)) errors.push(`AssignmentCoverage ${coverage.id} references a node outside the Course`);
  });
  runtime.assignments.forEach((assignment) => {
    if (assignment.courseId !== runtime.course.id) errors.push(`Assignment ${assignment.id} belongs to another Course`);
    if (assignment.mode === "workflow" && !assignment.workflowTemplateId) errors.push(`Workflow Assignment ${assignment.id} has no template`);
  });
  const covered = new Set(runtime.assignmentCoverages.map((coverage) => coverage.nodeId));
  courseNodeIds.forEach((nodeId) => { if (!covered.has(nodeId)) errors.push(`KnowledgeNode ${nodeId} has no AssignmentCoverage`); });
  runtime.materialKnowledgeCoverages.forEach((coverage) => {
    if (!materialIds.has(coverage.materialId)) errors.push(`MaterialKnowledgeCoverage ${coverage.id} references unknown Material`);
    if (!segmentIds.has(`${coverage.materialId}:${coverage.segmentId}`)) errors.push(`MaterialKnowledgeCoverage ${coverage.id} references unknown Segment`);
    if (!courseNodeIds.has(coverage.nodeId)) errors.push(`MaterialKnowledgeCoverage ${coverage.id} references a node outside the Course`);
  });
  if (errors.length) throw new Error(`Invalid CourseRuntimeData ${runtime.course.id}: ${errors.join("; ")}`);
  return true;
}

function summarizeAssignmentIds(assignmentIds: string[], assignmentStateById: Map<string, UserAssignmentState>) {
  const uniqueIds = Array.from(new Set(assignmentIds));
  const states = uniqueIds.map((id) => assignmentStateById.get(id));
  const completedCount = states.filter((state) => state?.status === "completed").length;
  const inProgressCount = states.filter((state) => state?.status === "in-progress").length;
  const progress = uniqueIds.length
    ? Math.round(states.reduce((sum, state) => sum + (state?.progress ?? (state?.status === "completed" ? 100 : 0)), 0) / uniqueIds.length)
    : 0;
  return { assignmentIds: uniqueIds, assignmentCount: uniqueIds.length, completedCount, inProgressCount, notStartedCount: uniqueIds.length - completedCount - inProgressCount, progress };
}

function learningStatus(lesson: CurriculumLesson, lessons: CurriculumLesson[], state: UserCourseState) {
  const recent = state.recentLessonId ? lessons.find((item) => item.id === state.recentLessonId) : undefined;
  if (!recent) return lesson.order === Math.min(...lessons.map((item) => item.order)) ? "available" as const : "locked" as const;
  if (lesson.order < recent.order) return "completed" as const;
  if (lesson.id === recent.id) return "learning" as const;
  return lesson.order <= recent.order + 2 ? "available" as const : "locked" as const;
}

export function buildCourseGraphData(runtime: CourseRuntimeData, userState: UserCourseState, graph: KnowledgeGraph = globalKnowledgeGraph): CourseGraphData {
  validateCourseRuntime(runtime, graph);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const lessonById = new Map(runtime.lessons.map((lesson) => [lesson.id, lesson]));
  const chapterById = new Map(runtime.chapters.map((chapter) => [chapter.id, chapter]));
  const assignmentById = new Map(runtime.assignments.map((assignment) => [assignment.id, assignment]));
  const assignmentStateById = new Map(Object.values(userState.assignmentStates).map((state) => [state.assignmentId, state]));
  const curriculumByNode = groupBy(runtime.curriculumCoverages, (coverage) => coverage.nodeId);
  const assignmentByNode = groupBy(runtime.assignmentCoverages, (coverage) => coverage.nodeId);
  const materialCoverageByNode = groupBy(runtime.materialKnowledgeCoverages, (coverage) => coverage.nodeId);
  const materialById = new Map(runtime.materials.map((material) => [material.id, material]));
  const courseNodeIds = new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId).filter((id) => nodeById.get(id)?.status === "active"));
  const knowledgeEdges = graph.edges.filter((edge) => courseNodeIds.has(edge.source) && courseNodeIds.has(edge.target)).map((edge) => ({ ...edge }));

  const primaryCoverageByNode = new Map(Array.from(courseNodeIds, (nodeId) => {
    const coverages = curriculumByNode.get(nodeId) ?? [];
    const introduced = coverages.filter((coverage) => coverage.role === "introduce");
    const primary = [...(introduced.length ? introduced : coverages)].sort((left, right) => (lessonById.get(left.lessonId)?.order ?? Number.MAX_SAFE_INTEGER) - (lessonById.get(right.lessonId)?.order ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id))[0];
    return [nodeId, primary];
  }));
  const primaryChapterByNode = new Map(Array.from(primaryCoverageByNode, ([nodeId, coverage]) => [nodeId, lessonById.get(coverage.lessonId)?.chapterId]));

  const knowledgeNodes: CourseSkillTreeNode[] = Array.from(courseNodeIds).sort().map((nodeId) => {
    const knowledge = nodeById.get(nodeId);
    const primaryCoverage = primaryCoverageByNode.get(nodeId);
    const lesson = primaryCoverage ? lessonById.get(primaryCoverage.lessonId) : undefined;
    const chapter = lesson ? chapterById.get(lesson.chapterId) : undefined;
    if (!knowledge || !primaryCoverage || !lesson || !chapter) throw new Error(`Cannot project Course KnowledgeNode ${nodeId}`);
    const curriculumContexts = (curriculumByNode.get(nodeId) ?? []).map((coverage) => {
      const contextLesson = lessonById.get(coverage.lessonId);
      if (!contextLesson) throw new Error(`Unknown lesson for coverage ${coverage.id}`);
      return { ...coverage, lessonOrder: contextLesson.order, chapterId: contextLesson.chapterId };
    }).sort((left, right) => left.lessonOrder - right.lessonOrder || left.id.localeCompare(right.id));
    const assignmentContexts = (assignmentByNode.get(nodeId) ?? []).map((coverage) => {
      const assignment = assignmentById.get(coverage.assignmentId);
      if (!assignment) throw new Error(`Unknown Assignment ${coverage.assignmentId}`);
      return { ...coverage, assignment, state: assignmentStateById.get(assignment.id) };
    });
    const assignmentStateSummary = summarizeAssignmentIds(assignmentContexts.map((context) => context.assignmentId), assignmentStateById);
    const materialContexts = Array.from(groupBy(materialCoverageByNode.get(nodeId) ?? [], (coverage) => coverage.materialId)).flatMap(([materialId, coverages]) => {
      const material = materialById.get(materialId);
      return material ? [{ materialId, materialTitle: material.title, lessonId: material.lessonId, segmentIds: Array.from(new Set(coverages.map((coverage) => coverage.segmentId))), roles: Array.from(new Set(coverages.map((coverage) => coverage.role))) }] : [];
    });
    return {
      id: knowledge.id,
      knowledge,
      title: knowledge.title,
      description: knowledge.description,
      scope: knowledge.scope,
      primaryCoverage: { ...primaryCoverage, lessonOrder: lesson.order, chapterId: chapter.id },
      curriculumContexts,
      assignmentContexts,
      assignmentCount: assignmentStateSummary.assignmentCount,
      assignmentStateSummary,
      lessonId: lesson.id,
      lesson: lesson.order,
      chapterId: chapter.id,
      coverageRoles: Array.from(new Set(curriculumContexts.map((coverage) => coverage.role))),
      materialIds: materialContexts.map((context) => context.materialId),
      materialContexts,
      assignmentIds: assignmentStateSummary.assignmentIds,
      status: learningStatus(lesson, runtime.lessons, userState),
      color: chapter.color
    };
  });

  const chapterEdgeByPair = new Map<string, CourseChapterEdge>();
  knowledgeEdges.filter((edge) => edge.relation !== "related").forEach((edge) => {
    const source = primaryChapterByNode.get(edge.source);
    const target = primaryChapterByNode.get(edge.target);
    if (!source || !target || source === target) return;
    const key = `${source}:${target}`;
    const current = chapterEdgeByPair.get(key) ?? { id: `chapter-projection-${runtime.course.id}-${source}-${target}`, source, target, primaryRelation: edge.relation === "prerequisite" ? "prerequisite" as const : "enables" as const, sourceKind: "knowledge" as const, prerequisiteCount: 0, enablesCount: 0, supportCount: 0 };
    if (edge.relation === "prerequisite") current.prerequisiteCount += 1; else current.enablesCount += 1;
    current.supportCount += 1;
    current.primaryRelation = current.prerequisiteCount ? "prerequisite" : "enables";
    chapterEdgeByPair.set(key, current);
  });
  const incidentChapterIds = new Set(Array.from(chapterEdgeByPair.values()).flatMap((edge) => [edge.source, edge.target]));
  runtime.chapters.filter((chapter) => chapter.order > 1 && !incidentChapterIds.has(chapter.id)).forEach((chapter) => {
    const sequence = [...runtime.curriculumSequences].reverse().find((item) => lessonById.get(item.targetLessonId)?.chapterId === chapter.id && lessonById.get(item.sourceLessonId)?.chapterId !== chapter.id);
    const source = sequence ? lessonById.get(sequence.sourceLessonId)?.chapterId : undefined;
    if (source) chapterEdgeByPair.set(`${source}:${chapter.id}`, { id: `chapter-sequence-${runtime.course.id}-${source}-${chapter.id}`, source, target: chapter.id, primaryRelation: "sequence", sourceKind: "curriculum-sequence", prerequisiteCount: 0, enablesCount: 0, supportCount: 0 });
  });
  const aggregatedChapterEdges = Array.from(chapterEdgeByPair.values()).sort((left, right) => left.source.localeCompare(right.source) || left.target.localeCompare(right.target));
  assertDirectedAcyclic(runtime.chapters.map((chapter) => chapter.id), aggregatedChapterEdges);
  const chapterEdges = transitiveReduction(runtime.chapters.map((chapter) => chapter.id), aggregatedChapterEdges);
  const chapters: CourseChapterProjection[] = runtime.chapters.map((chapter) => {
    const chapterNodeIds = new Set(runtime.curriculumCoverages.filter((coverage) => chapter.lessonIds.includes(coverage.lessonId)).map((coverage) => coverage.nodeId));
    const summary = summarizeAssignmentIds(runtime.assignmentCoverages.filter((coverage) => chapterNodeIds.has(coverage.nodeId)).map((coverage) => coverage.assignmentId), assignmentStateById);
    return { ...chapter, progress: summary.progress, assignmentSummary: { chapterId: chapter.id, ...summary, outcome: chapter.outcome } };
  });
  const aggregate = summarizeAssignmentIds(runtime.assignments.map((assignment) => assignment.id), assignmentStateById);
  return { courseId: runtime.course.id, revision: runtime.revision, chapters, knowledgeNodes, knowledgeEdges, chapterEdges, assignmentSummary: { courseId: runtime.course.id, ...aggregate } };
}

export function buildCourseSummary(runtime: CourseRuntimeData, state: UserCourseState, graphData = buildCourseGraphData(runtime, state)): CourseSummary {
  const materialStates = Object.values(state.materialStates).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const progress = graphData.assignmentSummary.progress;
  return {
    id: runtime.course.id,
    title: runtime.course.title,
    subtitle: runtime.course.subtitle,
    description: runtime.course.description,
    accentColor: runtime.course.accentColor,
    status: progress >= 100 ? "completed" : progress > 0 || state.recentLessonId ? "learning" : "not-started",
    progress,
    chapterCount: runtime.chapters.length,
    lessonCount: runtime.lessons.length,
    knowledgeNodeCount: graphData.knowledgeNodes.length,
    assignmentCount: runtime.assignments.length,
    recentLessonId: state.recentLessonId,
    recentMaterialId: materialStates[0]?.materialId,
    updatedAt: state.updatedAt
  };
}
