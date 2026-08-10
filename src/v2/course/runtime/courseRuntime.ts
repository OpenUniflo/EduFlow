import { assertDirectedAcyclic, transitiveReduction } from "../../knowledge/graphAlgorithms";
import type { KnowledgeGraph } from "../../knowledge/types";
import type { KnowledgeAccessContext, KnowledgeRepository } from "../../knowledge/repository/KnowledgeRepository";
import { resolveKnowledgeMaterialEntries, resolveKnowledgeMaterialEntry } from "../../material/materialNavigation";
import type { UserKnowledgeRecord } from "../../profile/types";
import type {
  AssignmentCoverage, Course, CourseAssignment, CourseAssignmentSummary, CourseChapterEdge, CourseChapterProjection,
  CourseCurriculum, CourseSkillTreeEdge, CourseSkillTreeNode, CourseSummary, CurriculumChapter, CurriculumCoverage,
  CurriculumLesson, CurriculumSequence, Material, MaterialKnowledgeCoverage, UserAssignmentState, UserCourseState
} from "../../types";
import { defaultCourseUnlockPolicy, type CourseUnlockPolicy } from "./courseUnlockPolicy";
import { compareCourseCurriculumContexts, compareCourseKnowledgeOrder, selectPrimaryCurriculumCoverage } from "../curriculum/curriculumOrdering";
import { sortAssignments } from "../../material/materialOrdering";
import { MATERIAL_COVERAGE_ROLE_PRIORITY } from "../../material/materialCoverageOrdering";

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

function validateNonNegativeIntegerOrder(errors: string[], entity: string, id: string, order: number) {
  if (!Number.isInteger(order) || order < 0) errors.push(`${entity} ${id} has invalid order`);
}

function validateUniqueOrders<T>(errors: string[], items: readonly T[], order: (item: T) => number, label: string) {
  if (new Set(items.map(order)).size !== items.length) errors.push(`${label} orders must be unique`);
}

export function validateCourseRuntime(runtime: CourseRuntimeData, knowledgeRepository: KnowledgeRepository, access: KnowledgeAccessContext) {
  const errors: string[] = [];
  const nodeIds = new Set(knowledgeRepository.getVisibleGraph(access).nodes.map((node) => node.id));
  const chapterIds = new Set(runtime.chapters.map((chapter) => chapter.id));
  const lessonIds = new Set(runtime.lessons.map((lesson) => lesson.id));
  const courseNodeIds = new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId));
  const assignmentIds = new Set(runtime.assignments.map((assignment) => assignment.id));
  const materialIds = new Set(runtime.materials.map((material) => material.id));
  const curriculumCoverageIds = new Set(runtime.curriculumCoverages.map((coverage) => coverage.id));
  const curriculumSequenceIds = new Set(runtime.curriculumSequences.map((sequence) => sequence.id));
  const assignmentCoverageIds = new Set(runtime.assignmentCoverages.map((coverage) => coverage.id));
  const materialKnowledgeCoverageIds = new Set(runtime.materialKnowledgeCoverages.map((coverage) => coverage.id));
  const segmentIds = new Set(runtime.materials.flatMap((material) => material.segments.map((segment) => `${material.id}:${segment.id}`)));

  if (!runtime.curriculum.id.trim()) errors.push("Curriculum id must be a non-empty string");
  if (runtime.curriculum.courseId !== runtime.course.id) errors.push(`Curriculum ${runtime.curriculum.id} belongs to another Course`);
  if (chapterIds.size !== runtime.chapters.length) errors.push("Chapter ids must be unique");
  if (lessonIds.size !== runtime.lessons.length) errors.push("Lesson ids must be unique");
  if (assignmentIds.size !== runtime.assignments.length) errors.push("Assignment ids must be unique");
  if (materialIds.size !== runtime.materials.length) errors.push("Material ids must be unique");
  if (curriculumCoverageIds.size !== runtime.curriculumCoverages.length) errors.push("CurriculumCoverage ids must be unique");
  if (curriculumSequenceIds.size !== runtime.curriculumSequences.length) errors.push("CurriculumSequence ids must be unique");
  if (assignmentCoverageIds.size !== runtime.assignmentCoverages.length) errors.push("AssignmentCoverage ids must be unique");
  if (materialKnowledgeCoverageIds.size !== runtime.materialKnowledgeCoverages.length) errors.push("MaterialKnowledgeCoverage ids must be unique");

  runtime.chapters.forEach((chapter) => {
    if (chapter.courseId !== runtime.course.id) errors.push(`Chapter ${chapter.id} belongs to another Course`);
    validateNonNegativeIntegerOrder(errors, "Chapter", chapter.id, chapter.order);
  });
  validateUniqueOrders(errors, runtime.chapters, (chapter) => chapter.order, "Chapter");
  runtime.lessons.forEach((lesson) => {
    if (lesson.courseId !== runtime.course.id) errors.push(`Lesson ${lesson.id} belongs to another Course`);
    if (!chapterIds.has(lesson.chapterId)) errors.push(`Lesson ${lesson.id} references unknown Chapter ${lesson.chapterId}`);
    validateNonNegativeIntegerOrder(errors, "Lesson", lesson.id, lesson.order);
  });
  validateUniqueOrders(errors, runtime.lessons, (lesson) => lesson.order, "Lesson");
  runtime.curriculumCoverages.forEach((coverage) => {
    if (coverage.courseId !== runtime.course.id) errors.push(`Coverage ${coverage.id} belongs to another Course`);
    if (!lessonIds.has(coverage.lessonId)) errors.push(`Coverage ${coverage.id} references unknown Lesson ${coverage.lessonId}`);
    if (!nodeIds.has(coverage.nodeId)) errors.push(`Coverage ${coverage.id} references unknown or invisible KnowledgeNode ${coverage.nodeId}`);
    if (!Number.isInteger(coverage.order) || coverage.order < 0) errors.push(`Coverage ${coverage.id} has invalid Lesson order`);
  });
  groupBy(runtime.curriculumCoverages, (coverage) => coverage.lessonId).forEach((coverages, lessonId) => validateUniqueOrders(errors, coverages, (coverage) => coverage.order, `CurriculumCoverage in Lesson ${lessonId}`));
  const sequencePairs = new Set<string>();
  runtime.curriculumSequences.forEach((sequence) => {
    if (sequence.courseId !== runtime.course.id) errors.push(`CurriculumSequence ${sequence.id} belongs to another Course`);
    if (!lessonIds.has(sequence.sourceLessonId)) errors.push(`CurriculumSequence ${sequence.id} has unknown source Lesson`);
    if (!lessonIds.has(sequence.targetLessonId)) errors.push(`CurriculumSequence ${sequence.id} has unknown target Lesson`);
    if (sequence.sourceLessonId === sequence.targetLessonId) errors.push(`CurriculumSequence ${sequence.id} cannot reference the same Lesson twice`);
    const pair = `${sequence.sourceLessonId}:${sequence.targetLessonId}`;
    if (sequencePairs.has(pair)) errors.push(`Duplicate CurriculumSequence relation ${pair}`);
    sequencePairs.add(pair);
  });
  runtime.assignments.forEach((assignment) => {
    if (assignment.courseId !== runtime.course.id) errors.push(`Assignment ${assignment.id} belongs to another Course`);
    validateNonNegativeIntegerOrder(errors, "Assignment", assignment.id, assignment.order);
    if (assignment.mode === "workflow" && !assignment.workflowTemplateId) errors.push(`Workflow Assignment ${assignment.id} has no template`);
  });
  validateUniqueOrders(errors, runtime.assignments, (assignment) => assignment.order, "Assignment");
  const assignmentRelations = new Set<string>();
  runtime.assignmentCoverages.forEach((coverage) => {
    if (!assignmentIds.has(coverage.assignmentId)) errors.push(`AssignmentCoverage ${coverage.id} references unknown Assignment`);
    if (!courseNodeIds.has(coverage.nodeId)) errors.push(`AssignmentCoverage ${coverage.id} references a node outside the Course`);
    if (!nodeIds.has(coverage.nodeId)) errors.push(`AssignmentCoverage ${coverage.id} references invisible KnowledgeNode ${coverage.nodeId}`);
    const relation = `${coverage.assignmentId}:${coverage.nodeId}`;
    if (assignmentRelations.has(relation)) errors.push(`Duplicate AssignmentCoverage relation ${relation}`);
    assignmentRelations.add(relation);
  });
  const covered = new Set(runtime.assignmentCoverages.map((coverage) => coverage.nodeId));
  courseNodeIds.forEach((nodeId) => { if (!covered.has(nodeId)) errors.push(`KnowledgeNode ${nodeId} has no AssignmentCoverage`); });
  runtime.materials.forEach((material) => {
    if (material.courseId !== runtime.course.id) errors.push(`Material ${material.id} belongs to another Course`);
    if (!lessonIds.has(material.lessonId)) errors.push(`Material ${material.id} references unknown Lesson`);
    validateNonNegativeIntegerOrder(errors, "Material", material.id, material.order);
    if (new Set(material.segments.map((segment) => segment.id)).size !== material.segments.length) errors.push(`Material ${material.id} Segment ids must be unique`);
    material.segments.forEach((segment) => validateNonNegativeIntegerOrder(errors, "MaterialSegment", segment.id, segment.order));
    validateUniqueOrders(errors, material.segments, (segment) => segment.order, `MaterialSegment in Material ${material.id}`);
    if (material.type === "pdf") {
      if (!material.source || material.source.kind !== "pdf") errors.push(`PDF Material ${material.id} requires a PDF source`);
      else {
        if (!material.source.url.trim()) errors.push(`PDF Material ${material.id} source URL is empty`);
        if (!Number.isInteger(material.source.pageCount) || material.source.pageCount <= 0) errors.push(`PDF Material ${material.id} has invalid pageCount`);
        if (material.segments.length !== material.source.pageCount) errors.push(`PDF Material ${material.id} pageCount does not match Segments`);
        const pages = material.segments.map((segment) => segment.page);
        if (pages.some((page) => !Number.isInteger(page) || (page ?? 0) < 1 || (page ?? 0) > material.source!.pageCount)) errors.push(`PDF Material ${material.id} has an invalid Segment page`);
        if (new Set(pages).size !== pages.length) errors.push(`PDF Material ${material.id} Segment pages must be unique`);
        for (let page = 1; page <= material.source.pageCount; page += 1) {
          if (!pages.includes(page)) errors.push(`PDF Material ${material.id} is missing page ${page}`);
        }
      }
    }
  });
  groupBy(runtime.materials, (material) => material.lessonId).forEach((materials, lessonId) => validateUniqueOrders(errors, materials, (material) => material.order, `Material in Lesson ${lessonId}`));
  const materialRelations = new Set<string>();
  runtime.materialKnowledgeCoverages.forEach((coverage) => {
    if (!materialIds.has(coverage.materialId)) errors.push(`MaterialKnowledgeCoverage ${coverage.id} references unknown Material`);
    if (!segmentIds.has(`${coverage.materialId}:${coverage.segmentId}`)) errors.push(`MaterialKnowledgeCoverage ${coverage.id} references unknown Segment`);
    if (!courseNodeIds.has(coverage.nodeId)) errors.push(`MaterialKnowledgeCoverage ${coverage.id} references a node outside the Course`);
    if (!nodeIds.has(coverage.nodeId)) errors.push(`MaterialKnowledgeCoverage ${coverage.id} references invisible KnowledgeNode ${coverage.nodeId}`);
    const relation = `${coverage.materialId}:${coverage.segmentId}:${coverage.nodeId}:${coverage.role}`;
    if (materialRelations.has(relation)) errors.push(`Duplicate MaterialKnowledgeCoverage relation ${relation}`);
    materialRelations.add(relation);
  });
  if (errors.length) throw new Error(`Invalid CourseRuntimeData ${runtime.course.id}: ${errors.join("; ")}`);
  return true;
}

function summarizeAssignmentIds(assignmentIds: string[], assignmentStateById: Map<string, UserAssignmentState>, assignmentOrderById: ReadonlyMap<string, number>) {
  const uniqueIds = Array.from(new Set(assignmentIds)).sort((left, right) => (assignmentOrderById.get(left) ?? Number.MAX_SAFE_INTEGER) - (assignmentOrderById.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right));
  const states = uniqueIds.map((id) => assignmentStateById.get(id));
  const completedCount = states.filter((state) => state?.status === "completed").length;
  const inProgressCount = states.filter((state) => state?.status === "in-progress").length;
  const progress = uniqueIds.length ? Math.round(states.reduce((sum, state) => sum + (state?.progress ?? (state?.status === "completed" ? 100 : 0)), 0) / uniqueIds.length) : 0;
  return { assignmentIds: uniqueIds, assignmentCount: uniqueIds.length, completedCount, inProgressCount, notStartedCount: uniqueIds.length - completedCount - inProgressCount, progress };
}

export function buildCourseGraphData(runtime: CourseRuntimeData, userState: UserCourseState, graph: KnowledgeGraph, userKnowledge: UserKnowledgeRecord[] = [], unlockPolicy: CourseUnlockPolicy = defaultCourseUnlockPolicy): CourseGraphData {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  runtime.curriculumCoverages.forEach((coverage) => {
    if (!nodeById.has(coverage.nodeId)) throw new Error(`Course ${runtime.course.id} cannot resolve visible KnowledgeNode ${coverage.nodeId}`);
  });
  const lessonById = new Map(runtime.lessons.map((lesson) => [lesson.id, lesson]));
  const chapterById = new Map(runtime.chapters.map((chapter) => [chapter.id, chapter]));
  const assignmentById = new Map(runtime.assignments.map((assignment) => [assignment.id, assignment]));
  const assignmentOrderById = new Map(runtime.assignments.map((assignment) => [assignment.id, assignment.order]));
  const assignmentStateById = new Map(Object.values(userState.assignmentStates).map((state) => [state.assignmentId, state]));
  const userKnowledgeById = new Map(userKnowledge.map((record) => [record.nodeId, record]));
  const curriculumByNode = groupBy(runtime.curriculumCoverages, (coverage) => coverage.nodeId);
  const assignmentByNode = groupBy(runtime.assignmentCoverages, (coverage) => coverage.nodeId);
  const materialCoverageByNode = groupBy(runtime.materialKnowledgeCoverages, (coverage) => coverage.nodeId);
  const materialById = new Map(runtime.materials.map((material) => [material.id, material]));
  const courseNodeIds = new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId).filter((id) => nodeById.get(id)?.status === "active"));
  const knowledgeEdges = graph.edges.filter((edge) => courseNodeIds.has(edge.source) && courseNodeIds.has(edge.target)).map((edge) => ({ ...edge }));

  const primaryCoverageByNode = new Map(Array.from(courseNodeIds, (nodeId) => {
    const primary = selectPrimaryCurriculumCoverage(curriculumByNode.get(nodeId) ?? [], runtime.lessons);
    return [nodeId, primary];
  }));
  const primaryChapterByNode = new Map(Array.from(primaryCoverageByNode, ([nodeId, coverage]) => [nodeId, lessonById.get(coverage.lessonId)?.chapterId]));

  const knowledgeNodes: CourseSkillTreeNode[] = Array.from(courseNodeIds).map((nodeId) => {
    const knowledge = nodeById.get(nodeId);
    const primaryCoverage = primaryCoverageByNode.get(nodeId);
    const lesson = primaryCoverage ? lessonById.get(primaryCoverage.lessonId) : undefined;
    const chapter = lesson ? chapterById.get(lesson.chapterId) : undefined;
    if (!knowledge || !primaryCoverage || !lesson || !chapter) throw new Error(`Cannot project Course KnowledgeNode ${nodeId}`);
    const curriculumContexts = (curriculumByNode.get(nodeId) ?? []).map((coverage) => {
      const contextLesson = lessonById.get(coverage.lessonId);
      if (!contextLesson) throw new Error(`Unknown lesson for coverage ${coverage.id}`);
      return { ...coverage, lessonOrder: contextLesson.order, chapterId: contextLesson.chapterId };
    }).sort(compareCourseCurriculumContexts);
    const assignmentContexts = (assignmentByNode.get(nodeId) ?? []).map((coverage) => {
      const assignment = assignmentById.get(coverage.assignmentId);
      if (!assignment) throw new Error(`Unknown Assignment ${coverage.assignmentId}`);
      return { ...coverage, assignment, state: assignmentStateById.get(assignment.id) };
    }).sort((left, right) => left.assignment.order - right.assignment.order || left.assignment.id.localeCompare(right.assignment.id));
    const assignmentStateSummary = summarizeAssignmentIds(assignmentContexts.map((context) => context.assignmentId), assignmentStateById, assignmentOrderById);
    const materialEntryOrder = new Map(resolveKnowledgeMaterialEntries(runtime, nodeId).map((entry, index) => [entry.materialId, index]));
    const materialContexts = Array.from(groupBy(materialCoverageByNode.get(nodeId) ?? [], (coverage) => coverage.materialId)).flatMap(([materialId, coverages]) => {
      const material = materialById.get(materialId);
      const entry = resolveKnowledgeMaterialEntry(runtime, nodeId, materialId);
      return material && entry ? [{
        materialId, materialTitle: material.title, lessonId: material.lessonId,
        segmentIds: Array.from(new Set(coverages.map((coverage) => coverage.segmentId))).sort((left, right) => {
          const leftSegment = material.segments.find((segment) => segment.id === left);
          const rightSegment = material.segments.find((segment) => segment.id === right);
          return (leftSegment?.page ?? leftSegment?.order ?? Number.MAX_SAFE_INTEGER) - (rightSegment?.page ?? rightSegment?.order ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right);
        }),
        roles: Array.from(new Set(coverages.map((coverage) => coverage.role))).sort((left, right) => MATERIAL_COVERAGE_ROLE_PRIORITY[left] - MATERIAL_COVERAGE_ROLE_PRIORITY[right]),
        primarySegmentId: entry.segmentId, primarySegmentTitle: entry.segmentTitle,
        primarySegmentOrder: entry.segmentOrder, primaryRole: entry.role
      }] : [];
    }).sort((left, right) => (materialEntryOrder.get(left.materialId) ?? Number.MAX_SAFE_INTEGER) - (materialEntryOrder.get(right.materialId) ?? Number.MAX_SAFE_INTEGER));
    const knowledgeState = userKnowledgeById.get(nodeId);
    return {
      id: knowledge.id, knowledge, title: knowledge.title, description: knowledge.description, scope: knowledge.scope,
      primaryCoverage: { ...primaryCoverage, lessonOrder: lesson.order, chapterId: chapter.id }, curriculumContexts,
      assignmentContexts, assignmentCount: assignmentStateSummary.assignmentCount, assignmentStateSummary,
      lessonId: lesson.id, lesson: lesson.order, chapterId: chapter.id,
      coverageRoles: Array.from(new Set(curriculumContexts.map((coverage) => coverage.role))),
      materialIds: materialContexts.map((context) => context.materialId), materialContexts,
      assignmentIds: assignmentStateSummary.assignmentIds,
      status: unlockPolicy({ knowledge, lesson, lessons: runtime.lessons, sequences: runtime.curriculumSequences, userCourseState: userState, userKnowledge: knowledgeState }),
      knowledgeProgress: knowledgeState?.mastery ?? 0, hasKnowledgeEvidence: Boolean(knowledgeState), color: chapter.color
    };
  }).sort(compareCourseKnowledgeOrder);

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
  const chapters: CourseChapterProjection[] = [...runtime.chapters].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)).map((chapter) => {
    const chapterLessonIds = new Set(runtime.lessons.filter((lesson) => lesson.chapterId === chapter.id).map((lesson) => lesson.id));
    const chapterNodeIds = new Set(runtime.curriculumCoverages.filter((coverage) => chapterLessonIds.has(coverage.lessonId)).map((coverage) => coverage.nodeId));
    const summary = summarizeAssignmentIds(runtime.assignmentCoverages.filter((coverage) => chapterNodeIds.has(coverage.nodeId)).map((coverage) => coverage.assignmentId), assignmentStateById, assignmentOrderById);
    const knowledgeEvidenceCount = Array.from(chapterNodeIds).filter((nodeId) => userKnowledgeById.has(nodeId)).length;
    const knowledgeProgress = chapterNodeIds.size ? Math.round(Array.from(chapterNodeIds).reduce((sum, nodeId) => sum + (userKnowledgeById.get(nodeId)?.mastery ?? 0), 0) / chapterNodeIds.size) : 0;
    return { ...chapter, lessonCount: chapterLessonIds.size, knowledgeProgress, knowledgeEvidenceCount, assignmentSummary: { chapterId: chapter.id, ...summary, outcome: chapter.outcome } };
  });
  const aggregate = summarizeAssignmentIds(sortAssignments(runtime.assignments).map((assignment) => assignment.id), assignmentStateById, assignmentOrderById);
  return { courseId: runtime.course.id, revision: runtime.revision, chapters, knowledgeNodes, knowledgeEdges, chapterEdges, assignmentSummary: { courseId: runtime.course.id, ...aggregate } };
}

export function buildCourseSummary(runtime: CourseRuntimeData, state: UserCourseState, graphData: CourseGraphData): CourseSummary {
  const materialStates = Object.values(state.materialStates).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const progress = graphData.assignmentSummary.progress;
  return {
    id: runtime.course.id, title: runtime.course.title, subtitle: runtime.course.subtitle,
    description: runtime.course.description, accentColor: runtime.course.accentColor,
    status: progress >= 100 ? "completed" : progress > 0 || state.recentLessonId ? "learning" : "not-started",
    progress, chapterCount: runtime.chapters.length, lessonCount: runtime.lessons.length,
    knowledgeNodeCount: graphData.knowledgeNodes.length, assignmentCount: runtime.assignments.length,
    recentLessonId: state.recentLessonId, recentMaterialId: materialStates[0]?.materialId, updatedAt: state.updatedAt
  };
}
