import type { CourseCreationBrief } from "@/features/assistant/assistantContract";
import { computePrerequisiteClosure } from "@/features/course/goal/goalPlanning";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { KnowledgeGraph } from "@/features/knowledge/types";

export const courseCreatorStages = ["requirements", "scope", "structure", "assets", "draft", "publish"] as const;
export type CourseCreatorStage = (typeof courseCreatorStages)[number];

export type CourseCreationRequirements = {
  goal: string;
  learnerFoundation: string;
  timeConstraint: string;
  preferences: string[];
  referenceCourseId?: string;
  referenceMaterialNames: string[];
};

export type CourseScope = {
  targetKnowledgeIds: string[];
  prerequisiteKnowledgeIds: string[];
  optionalKnowledgeIds: string[];
  excludedKnowledgeIds: string[];
};

export type CurriculumDraftChapter = { id: string; title: string; knowledgeIds: string[] };
export type CourseCurriculumDraft = { chapters: CurriculumDraftChapter[] };

export type CourseAssetPlan = {
  materialKnowledgeIds: string[];
  microKnowledgeIds: string[];
  assignmentKnowledgeIds: string[];
  availableMaterialKnowledgeIds: string[];
  availableMicroKnowledgeIds: string[];
  availableAssignmentKnowledgeIds: string[];
  desiredMaterialKnowledgeIds: string[];
  desiredMicroKnowledgeIds: string[];
  desiredAssignmentKnowledgeIds: string[];
  referenceMaterialNames: string[];
  referenceCourseId?: string;
};

export type CourseCreatorDesign = {
  requirements: CourseCreationRequirements;
  scope: CourseScope;
  curriculum: CourseCurriculumDraft;
  assets: CourseAssetPlan;
};

export type CourseCreatorOperation =
  | { type: "setRequirement"; field: "goal" | "learnerFoundation" | "timeConstraint"; value: string }
  | { type: "setPreferences"; values: string[] }
  | { type: "includeKnowledge"; nodeId: string; role: "target" | "optional" }
  | { type: "excludeKnowledge"; nodeId: string }
  | { type: "setDesiredAsset"; nodeId: string; assetType: "material" | "micro" | "assignment"; desired: boolean }
  | { type: "moveKnowledge"; nodeId: string; chapterId: string }
  | { type: "reorderKnowledge"; orderedKnowledgeIds: string[] };

export type CourseCreatorProposal = {
  id: string;
  kind?: "edit" | "explain";
  stage: CourseCreatorStage;
  title: string;
  summary: string;
  operations: CourseCreatorOperation[];
};

/** Any confirmed downstream result becomes stale after an upstream Apply. */
export function invalidateConfirmedThrough(currentConfirmedThrough: number, changedStageIndex: number) {
  return Math.min(currentConfirmedThrough, changedStageIndex - 1);
}

const unique = (values: readonly string[]) => [...new Set(values)];
const activeNodeIds = (graph: KnowledgeGraph) => new Set(graph.nodes.filter((node) => node.status === "active").map((node) => node.id));

function parseAdjustments(value: string | undefined) {
  if (!value) return [];
  return value.split(/[，,；;。\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function sourceKnowledgeIds(source: CourseRuntimeData | null) {
  return source ? unique(source.curriculumCoverages.map((coverage) => coverage.nodeId)) : [];
}

function sourceChapters(source: CourseRuntimeData, included: Set<string>): CurriculumDraftChapter[] {
  const lessonById = new Map(source.lessons.map((lesson) => [lesson.id, lesson]));
  const byChapter = new Map<string, string[]>();
  [...source.curriculumCoverages]
    .sort((left, right) => (lessonById.get(left.lessonId)?.order ?? 0) - (lessonById.get(right.lessonId)?.order ?? 0) || left.order - right.order || left.id.localeCompare(right.id))
    .forEach((coverage) => {
      if (!included.has(coverage.nodeId)) return;
      const chapterId = lessonById.get(coverage.lessonId)?.chapterId;
      if (!chapterId) return;
      byChapter.set(chapterId, unique([...(byChapter.get(chapterId) ?? []), coverage.nodeId]));
    });
  return [...source.chapters]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .flatMap((chapter, index) => {
      const knowledgeIds = byChapter.get(chapter.id) ?? [];
      return knowledgeIds.length ? [{ id: `creator-chapter-${index + 1}`, title: chapter.title, knowledgeIds }] : [];
    });
}

export function createInitialCourseDesign(brief: CourseCreationBrief, graph: KnowledgeGraph, source: CourseRuntimeData | null, referenceMaterialNames: string[] = []): CourseCreatorDesign {
  const visible = activeNodeIds(graph);
  const targetKnowledgeIds = unique(brief.targetKnowledge.map((item) => item.id)).filter((id) => visible.has(id));
  const closure = computePrerequisiteClosure(targetKnowledgeIds, graph.edges);
  const prerequisiteKnowledgeIds = closure.prerequisiteKnowledgeIds.filter((id) => visible.has(id) && !targetKnowledgeIds.includes(id));
  const included = new Set([...prerequisiteKnowledgeIds, ...targetKnowledgeIds]);
  const excludedKnowledgeIds = sourceKnowledgeIds(source).filter((id) => visible.has(id) && !included.has(id));
  let chapters = source ? sourceChapters(source, included) : [];
  const placed = new Set(chapters.flatMap((chapter) => chapter.knowledgeIds));
  const remainingPrerequisites = prerequisiteKnowledgeIds.filter((id) => !placed.has(id));
  const remainingTargets = targetKnowledgeIds.filter((id) => !placed.has(id));
  if (remainingPrerequisites.length) chapters.push({ id: "creator-chapter-foundation", title: "基础与前置", knowledgeIds: remainingPrerequisites });
  if (remainingTargets.length) chapters.push({ id: "creator-chapter-outcome", title: "核心与成果", knowledgeIds: remainingTargets });
  if (!chapters.length) chapters = [{ id: "creator-chapter-outcome", title: "目标路线", knowledgeIds: targetKnowledgeIds }];
  return {
    requirements: {
      goal: brief.goal,
      learnerFoundation: "按当前 Learner Context，创建前再次确认",
      timeConstraint: "未指定",
      preferences: parseAdjustments(brief.requestedAdjustments),
      ...(brief.sourceCourseId ? { referenceCourseId: brief.sourceCourseId } : {}),
      referenceMaterialNames
    },
    scope: { targetKnowledgeIds, prerequisiteKnowledgeIds, optionalKnowledgeIds: [], excludedKnowledgeIds },
    curriculum: { chapters },
    assets: {
      materialKnowledgeIds: [], microKnowledgeIds: [], assignmentKnowledgeIds: [],
      availableMaterialKnowledgeIds: source ? unique(source.materialKnowledgeCoverages.map((coverage) => coverage.nodeId)).filter((id) => included.has(id)) : [],
      availableMicroKnowledgeIds: [],
      availableAssignmentKnowledgeIds: source ? unique(source.assignmentCoverages.map((coverage) => coverage.nodeId)).filter((id) => included.has(id)) : [],
      desiredMaterialKnowledgeIds: [], desiredMicroKnowledgeIds: [], desiredAssignmentKnowledgeIds: [], referenceMaterialNames,
      ...(brief.sourceCourseId ? { referenceCourseId: brief.sourceCourseId } : {})
    }
  };
}

/** Rebuilds the editable projection from the persisted Draft authority after refresh/re-open. */
export function restoreCourseCreatorDesign(base: CourseCreatorDesign, runtime: CourseRuntimeData, graph: KnowledgeGraph): CourseCreatorDesign {
  const visible = activeNodeIds(graph);
  const includedIds = unique(runtime.curriculumCoverages.map((coverage) => coverage.nodeId)).filter((id) => visible.has(id));
  const included = new Set(includedIds);
  const targetKnowledgeIds = unique((runtime.targetKnowledge ?? []).map((target) => target.nodeId)).filter((id) => included.has(id));
  const factualPrerequisites = new Set(computePrerequisiteClosure(targetKnowledgeIds, graph.edges).prerequisiteKnowledgeIds);
  const prerequisiteKnowledgeIds = includedIds.filter((id) => factualPrerequisites.has(id) && !targetKnowledgeIds.includes(id));
  const prerequisiteSet = new Set(prerequisiteKnowledgeIds);
  const optionalKnowledgeIds = includedIds.filter((id) => !targetKnowledgeIds.includes(id) && !prerequisiteSet.has(id));
  return normalizeCourseCreatorDesign({
    ...base,
    requirements: { ...base.requirements, goal: runtime.course.targetOutcome?.trim() || runtime.course.title },
    scope: { targetKnowledgeIds, prerequisiteKnowledgeIds, optionalKnowledgeIds, excludedKnowledgeIds: base.scope.excludedKnowledgeIds.filter((id) => !included.has(id)) },
    curriculum: { chapters: sourceChapters(runtime, included) },
    assets: {
      ...base.assets,
      materialKnowledgeIds: unique(runtime.materialKnowledgeCoverages.map((coverage) => coverage.nodeId)).filter((id) => included.has(id)),
      assignmentKnowledgeIds: unique(runtime.assignmentCoverages.map((coverage) => coverage.nodeId)).filter((id) => included.has(id))
    }
  }, graph);
}

export function includedCourseKnowledgeIds(scope: CourseScope) {
  return unique([...scope.prerequisiteKnowledgeIds, ...scope.optionalKnowledgeIds, ...scope.targetKnowledgeIds]);
}

/** Factual prerequisite labels are rebuilt after every manual or AI Scope edit. */
export function normalizeCourseCreatorDesign(design: CourseCreatorDesign, graph: KnowledgeGraph): CourseCreatorDesign {
  const visible = activeNodeIds(graph);
  const targetKnowledgeIds = unique(design.scope.targetKnowledgeIds).filter((id) => visible.has(id));
  const closure = computePrerequisiteClosure(targetKnowledgeIds, graph.edges);
  const prerequisiteKnowledgeIds = closure.prerequisiteKnowledgeIds.filter((id) => visible.has(id) && !targetKnowledgeIds.includes(id));
  const prerequisiteSet = new Set(prerequisiteKnowledgeIds);
  const optionalKnowledgeIds = unique(design.scope.optionalKnowledgeIds).filter((id) => visible.has(id) && !targetKnowledgeIds.includes(id) && !prerequisiteSet.has(id));
  const included = new Set([...prerequisiteKnowledgeIds, ...optionalKnowledgeIds, ...targetKnowledgeIds]);
  const previousIncluded = includedCourseKnowledgeIds(design.scope);
  let chapters = design.curriculum.chapters.map((chapter) => ({ ...chapter, knowledgeIds: unique(chapter.knowledgeIds).filter((id) => included.has(id)) }));
  const placed = new Set(chapters.flatMap((chapter) => chapter.knowledgeIds));
  const missing = [...prerequisiteKnowledgeIds, ...optionalKnowledgeIds, ...targetKnowledgeIds].filter((id) => !placed.has(id));
  if (missing.length) {
    chapters = chapters.length
      ? chapters.map((chapter, index) => index ? chapter : { ...chapter, knowledgeIds: unique([...missing, ...chapter.knowledgeIds]) })
      : [{ id: "creator-chapter-outcome", title: "目标路线", knowledgeIds: missing }];
  }
  chapters = chapters.filter((chapter) => chapter.knowledgeIds.length);
  const excludedKnowledgeIds = unique([
    ...design.scope.excludedKnowledgeIds,
    ...previousIncluded.filter((id) => !included.has(id))
  ]).filter((id) => visible.has(id) && !included.has(id));
  return {
    ...design,
    scope: { targetKnowledgeIds, prerequisiteKnowledgeIds, optionalKnowledgeIds, excludedKnowledgeIds },
    curriculum: { chapters },
    assets: {
      ...design.assets,
      materialKnowledgeIds: design.assets.materialKnowledgeIds.filter((id) => included.has(id)),
      microKnowledgeIds: design.assets.microKnowledgeIds.filter((id) => included.has(id)),
      assignmentKnowledgeIds: design.assets.assignmentKnowledgeIds.filter((id) => included.has(id))
      ,availableMaterialKnowledgeIds: design.assets.availableMaterialKnowledgeIds.filter((id) => included.has(id))
      ,availableMicroKnowledgeIds: design.assets.availableMicroKnowledgeIds.filter((id) => included.has(id))
      ,availableAssignmentKnowledgeIds: design.assets.availableAssignmentKnowledgeIds.filter((id) => included.has(id))
      ,desiredMaterialKnowledgeIds: design.assets.desiredMaterialKnowledgeIds.filter((id) => included.has(id))
      ,desiredMicroKnowledgeIds: design.assets.desiredMicroKnowledgeIds.filter((id) => included.has(id))
      ,desiredAssignmentKnowledgeIds: design.assets.desiredAssignmentKnowledgeIds.filter((id) => included.has(id))
    }
  };
}

export function validateCourseCreatorDesign(design: CourseCreatorDesign, graph: KnowledgeGraph) {
  const visible = activeNodeIds(graph);
  const fatal: string[] = [];
  const technicalDetails: string[] = [];
  const warnings: string[] = [];
  if (!design.requirements.goal.trim()) fatal.push("课程目标不能为空。");
  const targetIds = unique(design.scope.targetKnowledgeIds);
  if (!targetIds.length) fatal.push("至少需要一个目标 Knowledge。");
  const included = includedCourseKnowledgeIds(design.scope);
  const unavailable = included.filter((id) => !visible.has(id));
  if (unavailable.length) { fatal.push("当前范围包含不可用的学习内容。"); technicalDetails.push(`Unavailable Knowledge: ${unavailable.join(", ")}`); }
  const closure = computePrerequisiteClosure(targetIds, graph.edges);
  const factualClosure = new Set(closure.prerequisiteKnowledgeIds);
  const nonFactual = design.scope.prerequisiteKnowledgeIds.filter((id) => !factualClosure.has(id));
  const missingFactual = [...factualClosure].filter((id) => !targetIds.includes(id) && !design.scope.prerequisiteKnowledgeIds.includes(id));
  if (closure.cycleDetected || nonFactual.length || missingFactual.length) {
    fatal.push("当前目标范围无法形成有效的必要基础关系。");
    if (closure.cycleDetected) technicalDetails.push(`Prerequisite cycle: ${closure.cycleNodeIds.join(", ")}`);
    if (nonFactual.length) technicalDetails.push(`Non-factual prerequisites: ${nonFactual.join(", ")}`);
    if (missingFactual.length) technicalDetails.push(`Missing factual prerequisites: ${missingFactual.join(", ")}`);
  }
  const placements = design.curriculum.chapters.flatMap((chapter) => chapter.knowledgeIds);
  if (new Set(design.curriculum.chapters.map((chapter) => chapter.id)).size !== design.curriculum.chapters.length) fatal.push("章节 ID 必须唯一。");
  if (new Set(placements).size !== placements.length) fatal.push("Knowledge 不能重复放入多个章节。");
  const unplaced = included.filter((id) => !placements.includes(id));
  const outOfScope = placements.filter((id) => !included.includes(id));
  if (unplaced.length) { fatal.push("部分学习内容尚未进入课程结构。"); technicalDetails.push(`Unplaced Knowledge: ${unplaced.join(", ")}`); }
  if (outOfScope.length) { fatal.push("课程结构包含范围外的学习内容。"); technicalDetails.push(`Out-of-scope Knowledge: ${outOfScope.join(", ")}`); }
  if (!design.assets.materialKnowledgeIds.length) warnings.push("当前 Course 没有 Material；可以继续创建。");
  if (!design.assets.microKnowledgeIds.length) warnings.push("当前 Course 没有 Micro；可以继续创建。");
  if (!design.assets.assignmentKnowledgeIds.length) warnings.push("当前 Course 没有 Assignment；可以继续创建。");
  return { fatal: unique(fatal), warnings, technicalDetails, valid: fatal.length === 0 };
}

function removeEverywhere(design: CourseCreatorDesign, nodeId: string): CourseCreatorDesign {
  return {
    ...design,
    scope: {
      ...design.scope,
      targetKnowledgeIds: design.scope.targetKnowledgeIds.filter((id) => id !== nodeId),
      prerequisiteKnowledgeIds: design.scope.prerequisiteKnowledgeIds.filter((id) => id !== nodeId),
      optionalKnowledgeIds: design.scope.optionalKnowledgeIds.filter((id) => id !== nodeId),
      excludedKnowledgeIds: unique([...design.scope.excludedKnowledgeIds, nodeId])
    },
    curriculum: { chapters: design.curriculum.chapters.map((chapter) => ({ ...chapter, knowledgeIds: chapter.knowledgeIds.filter((id) => id !== nodeId) })) }
  };
}

export function applyCourseCreatorProposal(design: CourseCreatorDesign, proposal: CourseCreatorProposal, graph: KnowledgeGraph): CourseCreatorDesign {
  const changed = proposal.operations.reduce((current, operation) => {
    if (operation.type === "setRequirement") return { ...current, requirements: { ...current.requirements, [operation.field]: operation.value } };
    if (operation.type === "setPreferences") return { ...current, requirements: { ...current.requirements, preferences: unique(operation.values.map((value) => value.trim()).filter(Boolean)) } };
    if (operation.type === "excludeKnowledge") return removeEverywhere(current, operation.nodeId);
    if (operation.type === "setDesiredAsset") {
      const key = operation.assetType === "material" ? "desiredMaterialKnowledgeIds" : operation.assetType === "micro" ? "desiredMicroKnowledgeIds" : "desiredAssignmentKnowledgeIds";
      return { ...current, assets: { ...current.assets, [key]: operation.desired ? unique([...current.assets[key], operation.nodeId]) : current.assets[key].filter((id) => id !== operation.nodeId) } };
    }
    if (operation.type === "includeKnowledge") {
      const without = removeEverywhere(current, operation.nodeId);
      const key = operation.role === "target" ? "targetKnowledgeIds" : "optionalKnowledgeIds";
      const firstChapter = without.curriculum.chapters[0];
      return {
        ...without,
        scope: { ...without.scope, [key]: unique([...without.scope[key], operation.nodeId]), excludedKnowledgeIds: without.scope.excludedKnowledgeIds.filter((id) => id !== operation.nodeId) },
        curriculum: { chapters: firstChapter ? without.curriculum.chapters.map((chapter, index) => index ? chapter : { ...chapter, knowledgeIds: unique([...chapter.knowledgeIds, operation.nodeId]) }) : [{ id: "creator-chapter-outcome", title: "目标路线", knowledgeIds: [operation.nodeId] }] }
      };
    }
    if (operation.type === "moveKnowledge") return {
      ...current,
      curriculum: { chapters: current.curriculum.chapters.map((chapter) => ({ ...chapter, knowledgeIds: chapter.id === operation.chapterId ? unique([...chapter.knowledgeIds, operation.nodeId]) : chapter.knowledgeIds.filter((id) => id !== operation.nodeId) })) }
    };
    const rank = new Map(operation.orderedKnowledgeIds.map((id, index) => [id, index]));
    return { ...current, curriculum: { chapters: current.curriculum.chapters.map((chapter) => ({ ...chapter, knowledgeIds: [...chapter.knowledgeIds].sort((left, right) => (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER)) })) } };
  }, design);
  return normalizeCourseCreatorDesign(changed, graph);
}

export function createCoursePreviewRuntime(design: CourseCreatorDesign, courseId = "creator-preview"): CourseRuntimeData {
  const chapters = design.curriculum.chapters.map((chapter, index) => ({ id: chapter.id, courseId, title: chapter.title, description: "Course Creator 结构草稿", order: index, color: ["#7567e8", "#3aa68f", "#e59645", "#5c8ddc"][index % 4], outcome: design.requirements.goal }));
  const lessons = chapters.map((chapter, index) => ({ id: `${chapter.id}:lesson`, courseId, chapterId: chapter.id, title: chapter.title, order: index }));
  const curriculumCoverages = design.curriculum.chapters.flatMap((chapter, chapterIndex) => chapter.knowledgeIds.map((nodeId, order) => ({ id: `${courseId}:coverage:${chapterIndex}:${order}`, courseId, lessonId: `${chapter.id}:lesson`, nodeId, role: design.scope.targetKnowledgeIds.includes(nodeId) ? "assess" as const : "introduce" as const, order })));
  return {
    course: { id: courseId, title: design.requirements.goal.slice(0, 80), description: design.requirements.goal, targetOutcome: design.requirements.goal, lifecycle: "draft", courseType: "personal", ownerUserId: "creator-preview-owner", sourceCourseId: design.requirements.referenceCourseId, generationStatus: "draft", accentColor: "#7567e8" },
    curriculum: { id: `${courseId}:curriculum`, courseId, generationMode: "manual" }, chapters, lessons, curriculumCoverages,
    curriculumSequences: lessons.slice(1).map((lesson, index) => ({ id: `${courseId}:sequence:${index}`, courseId, sourceLessonId: lessons[index].id, targetLessonId: lesson.id })),
    assignments: [], assignmentCoverages: [], assignmentDependencies: [], chapterOutcomes: [], assignmentOutcomeCompositions: [], finalProjects: [], finalProjectOutcomeCompositions: [], materials: [], materialKnowledgeCoverages: [],
    targetKnowledge: design.scope.targetKnowledgeIds.map((nodeId) => ({ courseId, nodeId, required: true })), revision: `creator-${design.curriculum.chapters.map((chapter) => chapter.knowledgeIds.join(",")).join("|")}`
  };
}
