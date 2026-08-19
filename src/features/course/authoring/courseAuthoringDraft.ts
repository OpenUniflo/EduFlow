import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { CurriculumChapter, Material, MaterialKnowledgeCoverage, CourseAssignment, AssignmentCoverage } from "@/features/course/types";
import type { MicroLearningPath } from "@/features/learning/micro/microLearning";
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from "@/features/knowledge/types";
import type { KnowledgeAccessContext, KnowledgeRepository } from "@/features/knowledge/repository/KnowledgeRepository";

export const COURSE_AUTHORING_SCHEMA_VERSION = 2;
export const UNASSIGNED_CHAPTER_ID = "authoring-unassigned";
export type MaterialLink = { nodeId: string; materialId: string };
export type DraftKnowledgeCandidate = { id: string; title: string; description: string; chapterId: string; splitFrom?: string; mergedFrom?: string[] };
export type ManualNodePosition = { x: number; y: number };
export type CourseAuthoringDraftState = {
  schemaVersion: 2;
  courseId: string;
  addedLinks: MaterialLink[];
  removedLinks: MaterialLink[];
  generatedMaterials: Material[];
  addedChapters: CurriculumChapter[];
  chapterUpdates: Record<string, Partial<Pick<CurriculumChapter, "title" | "description" | "outcome">>>;
  removedChapterIds: string[];
  chapterOrder: string[];
  addedKnowledgeNodeIds: Array<{ nodeId: string; chapterId: string }>;
  addedKnowledgeCandidates: DraftKnowledgeCandidate[];
  removedKnowledgeNodeIds: string[];
  knowledgeChapterOverrides: Record<string, string>;
  addedDependencies: KnowledgeEdge[];
  removedDependencyIds: string[];
  manualNodePositions: Record<string, ManualNodePosition>;
  /** Course-scoped Micro edits are draft-only until Publish. */
  microPaths?: MicroLearningPath[];
  /** Full course Assignment projection, retained only after an author edit. */
  assignments?: CourseAssignment[];
  assignmentCoverages?: AssignmentCoverage[];
};
type CourseAuthoringEnvelope = { schemaVersion: 2; present: CourseAuthoringDraftState; past: CourseAuthoringDraftState[]; future: CourseAuthoringDraftState[] };

const STORAGE_PREFIX = "eduflow:course-authoring:v2:";
const LEGACY_STORAGE_PREFIX = "eduflow:course-authoring:v1:";
const HISTORY_LIMIT = 50;
const listeners = new Set<() => void>();

export function emptyCourseAuthoringDraft(courseId: string): CourseAuthoringDraftState {
  return { schemaVersion: 2, courseId, addedLinks: [], removedLinks: [], generatedMaterials: [], addedChapters: [], chapterUpdates: {}, removedChapterIds: [], chapterOrder: [], addedKnowledgeNodeIds: [], addedKnowledgeCandidates: [], removedKnowledgeNodeIds: [], knowledgeChapterOverrides: {}, addedDependencies: [], removedDependencyIds: [], manualNodePositions: {}, microPaths: [] };
}
const sameLink = (left: MaterialLink, right: MaterialLink) => left.nodeId === right.nodeId && left.materialId === right.materialId;
const unique = <T,>(items: T[]) => Array.from(new Set(items));
const draftStorageKey = (courseId: string) => `${STORAGE_PREFIX}${courseId}`;
const legacyStorageKey = (courseId: string) => `${LEGACY_STORAGE_PREFIX}${courseId}`;
const notify = () => listeners.forEach((listener) => listener());

function migrateLegacy(courseId: string, value: unknown): CourseAuthoringDraftState {
  const next = emptyCourseAuthoringDraft(courseId);
  if (!value || typeof value !== "object") return next;
  const legacy = value as Partial<CourseAuthoringDraftState>;
  if (legacy.courseId !== courseId) return next;
  return { ...next, addedLinks: Array.isArray(legacy.addedLinks) ? legacy.addedLinks : [], removedLinks: Array.isArray(legacy.removedLinks) ? legacy.removedLinks : [], generatedMaterials: Array.isArray(legacy.generatedMaterials) ? legacy.generatedMaterials : [] };
}
function parseEnvelope(courseId: string, raw: string | null): CourseAuthoringEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CourseAuthoringEnvelope>;
    if (parsed.schemaVersion !== 2 || parsed.present?.courseId !== courseId || parsed.present.schemaVersion !== 2) return null;
    return { schemaVersion: 2, present: parsed.present, past: Array.isArray(parsed.past) ? parsed.past : [], future: Array.isArray(parsed.future) ? parsed.future : [] };
  } catch { return null; }
}
function readEnvelope(courseId: string, storage: Pick<Storage, "getItem"> = localStorage): CourseAuthoringEnvelope {
  const current = parseEnvelope(courseId, storage.getItem(draftStorageKey(courseId)));
  if (current) return current;
  let legacy: unknown = null;
  try { legacy = JSON.parse(storage.getItem(legacyStorageKey(courseId)) ?? "null"); } catch { legacy = null; }
  return { schemaVersion: 2, present: migrateLegacy(courseId, legacy), past: [], future: [] };
}
function saveEnvelope(envelope: CourseAuthoringEnvelope, storage: Pick<Storage, "setItem"> = localStorage) {
  storage.setItem(draftStorageKey(envelope.present.courseId), JSON.stringify(envelope));
  notify();
}
export function readCourseAuthoringDraft(courseId: string, storage: Pick<Storage, "getItem"> = localStorage) { return readEnvelope(courseId, storage).present; }
export function writeCourseAuthoringDraft(state: CourseAuthoringDraftState, storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {
  const envelope = readEnvelope(state.courseId, storage);
  if (JSON.stringify(envelope.present) === JSON.stringify(state)) return false;
  saveEnvelope({ schemaVersion: 2, present: state, past: [...envelope.past, envelope.present].slice(-HISTORY_LIMIT), future: [] }, storage);
  return true;
}
export function undoCourseAuthoringDraft(courseId: string, storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {
  const envelope = readEnvelope(courseId, storage); const previous = envelope.past[envelope.past.length - 1]; if (!previous) return false;
  saveEnvelope({ schemaVersion: 2, present: previous, past: envelope.past.slice(0, -1), future: [envelope.present, ...envelope.future] }, storage); return true;
}
export function redoCourseAuthoringDraft(courseId: string, storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {
  const envelope = readEnvelope(courseId, storage); const next = envelope.future[0]; if (!next) return false;
  saveEnvelope({ schemaVersion: 2, present: next, past: [...envelope.past, envelope.present].slice(-HISTORY_LIMIT), future: envelope.future.slice(1) }, storage); return true;
}
export function getCourseAuthoringHistoryStatus(courseId: string, storage: Pick<Storage, "getItem"> = localStorage) { const envelope = readEnvelope(courseId, storage); return { canUndo: envelope.past.length > 0, canRedo: envelope.future.length > 0 }; }
export function subscribeCourseAuthoringDraft(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function addMaterialLink(state: CourseAuthoringDraftState, link: MaterialLink) {
  if (state.addedLinks.some((item) => sameLink(item, link)) && !state.removedLinks.some((item) => sameLink(item, link))) return state;
  return { ...state, addedLinks: state.addedLinks.some((item) => sameLink(item, link)) ? state.addedLinks : [...state.addedLinks, link], removedLinks: state.removedLinks.filter((item) => !sameLink(item, link)) };
}
export function removeMaterialLink(state: CourseAuthoringDraftState, link: MaterialLink) {
  if (state.removedLinks.some((item) => sameLink(item, link))) return state;
  return { ...state, addedLinks: state.addedLinks.filter((item) => !sameLink(item, link)), removedLinks: [...state.removedLinks, link] };
}
export function addGeneratedMaterial(state: CourseAuthoringDraftState, material: Material, nodeId: string) { const next = state.generatedMaterials.some((item) => item.id === material.id) ? state : { ...state, generatedMaterials: [...state.generatedMaterials, material] }; return addMaterialLink(next, { nodeId, materialId: material.id }); }
export function addDraftChapter(state: CourseAuthoringDraftState, chapter: CurriculumChapter) { return state.addedChapters.some((item) => item.id === chapter.id) ? state : { ...state, addedChapters: [...state.addedChapters, chapter] }; }
export function updateDraftChapter(state: CourseAuthoringDraftState, chapterId: string, changes: CourseAuthoringDraftState["chapterUpdates"][string]) { return { ...state, chapterUpdates: { ...state.chapterUpdates, [chapterId]: { ...state.chapterUpdates[chapterId], ...changes } } }; }
export function reorderDraftChapter(state: CourseAuthoringDraftState, orderedIds: string[]) { return { ...state, chapterOrder: unique(orderedIds) }; }
export function removeDraftChapter(state: CourseAuthoringDraftState, chapterId: string, nodeIds: string[] = []) {
  return { ...state, addedChapters: state.addedChapters.filter((chapter) => chapter.id !== chapterId), removedChapterIds: state.addedChapters.some((chapter) => chapter.id === chapterId) ? state.removedChapterIds : unique([...state.removedChapterIds, chapterId]), chapterOrder: state.chapterOrder.filter((id) => id !== chapterId), knowledgeChapterOverrides: { ...state.knowledgeChapterOverrides, ...Object.fromEntries(nodeIds.map((nodeId) => [nodeId, UNASSIGNED_CHAPTER_ID])) } };
}
export function addExistingKnowledge(state: CourseAuthoringDraftState, nodeId: string, chapterId: string) {
  if (state.addedKnowledgeNodeIds.some((item) => item.nodeId === nodeId) && !state.removedKnowledgeNodeIds.includes(nodeId)) return state;
  return { ...state, addedKnowledgeNodeIds: [...state.addedKnowledgeNodeIds.filter((item) => item.nodeId !== nodeId), { nodeId, chapterId }], removedKnowledgeNodeIds: state.removedKnowledgeNodeIds.filter((id) => id !== nodeId) };
}
export function addKnowledgeCandidate(state: CourseAuthoringDraftState, candidate: DraftKnowledgeCandidate) { return state.addedKnowledgeCandidates.some((item) => item.id === candidate.id) ? state : { ...state, addedKnowledgeCandidates: [...state.addedKnowledgeCandidates, candidate], removedKnowledgeNodeIds: state.removedKnowledgeNodeIds.filter((id) => id !== candidate.id) }; }
export function removeCourseKnowledge(state: CourseAuthoringDraftState, nodeId: string) {
  return { ...state, addedKnowledgeNodeIds: state.addedKnowledgeNodeIds.filter((item) => item.nodeId !== nodeId), addedKnowledgeCandidates: state.addedKnowledgeCandidates.filter((item) => item.id !== nodeId), removedKnowledgeNodeIds: unique([...state.removedKnowledgeNodeIds, nodeId]), addedDependencies: state.addedDependencies.filter((edge) => edge.source !== nodeId && edge.target !== nodeId), knowledgeChapterOverrides: Object.fromEntries(Object.entries(state.knowledgeChapterOverrides).filter(([id]) => id !== nodeId)) };
}
export function moveCourseKnowledge(state: CourseAuthoringDraftState, nodeId: string, chapterId: string) { return { ...state, addedKnowledgeNodeIds: state.addedKnowledgeNodeIds.map((item) => item.nodeId === nodeId ? { ...item, chapterId } : item), addedKnowledgeCandidates: state.addedKnowledgeCandidates.map((item) => item.id === nodeId ? { ...item, chapterId } : item), knowledgeChapterOverrides: { ...state.knowledgeChapterOverrides, [nodeId]: chapterId } }; }
export function setManualNodePosition(state: CourseAuthoringDraftState, nodeId: string, position: ManualNodePosition) { return { ...state, manualNodePositions: { ...state.manualNodePositions, [nodeId]: position } }; }
export function clearManualNodePositions(state: CourseAuthoringDraftState) { return { ...state, manualNodePositions: {} }; }

export type DependencyValidation = { valid: true } | { valid: false; reason: "self" | "duplicate" | "cycle" | "missing-node" };
export function validateDependencyAddition(nodeIds: string[], edges: Pick<KnowledgeEdge, "source" | "target">[], source: string, target: string): DependencyValidation {
  const nodes = new Set(nodeIds); if (!nodes.has(source) || !nodes.has(target)) return { valid: false, reason: "missing-node" }; if (source === target) return { valid: false, reason: "self" }; if (edges.some((edge) => edge.source === source && edge.target === target)) return { valid: false, reason: "duplicate" };
  const outgoing = new Map<string, string[]>(); edges.forEach((edge) => outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]));
  const stack = [target]; const visited = new Set<string>();
  while (stack.length) { const current = stack.pop()!; if (current === source) return { valid: false, reason: "cycle" }; if (visited.has(current)) continue; visited.add(current); stack.push(...(outgoing.get(current) ?? [])); }
  return { valid: true };
}
export function addDraftDependency(state: CourseAuthoringDraftState, edge: KnowledgeEdge) { return { ...state, addedDependencies: [...state.addedDependencies.filter((item) => item.id !== edge.id), edge], removedDependencyIds: state.removedDependencyIds.filter((id) => id !== edge.id) }; }
export function removeDraftDependency(state: CourseAuthoringDraftState, edgeId: string) { return { ...state, addedDependencies: state.addedDependencies.filter((edge) => edge.id !== edgeId), removedDependencyIds: unique([...state.removedDependencyIds, edgeId]) }; }

const chapterLessonId = (chapterId: string) => `authoring-lesson:${chapterId}`;
function structuralRevision(state: CourseAuthoringDraftState) {
  const structural = { addedChapters: state.addedChapters, chapterUpdates: state.chapterUpdates, removedChapterIds: state.removedChapterIds, chapterOrder: state.chapterOrder, addedKnowledgeNodeIds: state.addedKnowledgeNodeIds, addedKnowledgeCandidates: state.addedKnowledgeCandidates, removedKnowledgeNodeIds: state.removedKnowledgeNodeIds, knowledgeChapterOverrides: state.knowledgeChapterOverrides, addedDependencies: state.addedDependencies, removedDependencyIds: state.removedDependencyIds };
  let hash = 2166136261; for (const character of JSON.stringify(structural)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36);
}

export function applyCourseAuthoringDraft(runtime: CourseRuntimeData, state: CourseAuthoringDraftState): CourseRuntimeData {
  const removedChapterIds = new Set(state.removedChapterIds);
  let chapters = [...runtime.chapters.filter((chapter) => !removedChapterIds.has(chapter.id)), ...state.addedChapters.filter((chapter) => !removedChapterIds.has(chapter.id) && !runtime.chapters.some((base) => base.id === chapter.id))].map((chapter) => ({ ...chapter, ...state.chapterUpdates[chapter.id] }));
  const needsUnassigned = [...Object.values(state.knowledgeChapterOverrides), ...state.addedKnowledgeNodeIds.map((item) => item.chapterId), ...state.addedKnowledgeCandidates.map((item) => item.chapterId)].includes(UNASSIGNED_CHAPTER_ID);
  if (needsUnassigned && !chapters.some((chapter) => chapter.id === UNASSIGNED_CHAPTER_ID)) chapters.push({ id: UNASSIGNED_CHAPTER_ID, courseId: runtime.course.id, title: "未分组", description: "课程设计暂存区", order: Number.MAX_SAFE_INTEGER, color: "#9aa4b7", outcome: "待整理" });
  const orderedIds = [...state.chapterOrder, ...chapters.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map((chapter) => chapter.id)]; const orderIndex = new Map(unique(orderedIds).map((id, index) => [id, index + 1]));
  chapters = chapters.map((chapter) => ({ ...chapter, order: orderIndex.get(chapter.id) ?? chapter.order })).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const activeChapterIds = new Set(chapters.map((chapter) => chapter.id));
  const baseLessons = runtime.lessons.filter((lesson) => activeChapterIds.has(lesson.chapterId));
  const missingLessonChapterIds = chapters.filter((chapter) => !baseLessons.some((lesson) => lesson.chapterId === chapter.id)).map((chapter) => chapter.id);
  const maxLessonOrder = Math.max(0, ...baseLessons.map((lesson) => lesson.order));
  const lessons = [...baseLessons, ...missingLessonChapterIds.map((chapterId, index) => ({ id: chapterLessonId(chapterId), courseId: runtime.course.id, chapterId, title: chapters.find((chapter) => chapter.id === chapterId)?.title ?? "课程设计课", order: maxLessonOrder + index + 1 }))];
  const activeLessonIds = new Set(lessons.map((lesson) => lesson.id));
  const primaryLessonByChapter = new Map(chapters.map((chapter) => [chapter.id, lessons.filter((lesson) => lesson.chapterId === chapter.id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))[0]?.id])); const chapterByLesson = new Map(lessons.map((lesson) => [lesson.id, lesson.chapterId]));
  const removedNodes = new Set(state.removedKnowledgeNodeIds); const movedNodes = new Set(Object.keys(state.knowledgeChapterOverrides));
  let curriculumCoverages = runtime.curriculumCoverages.filter((coverage) => !removedNodes.has(coverage.nodeId) && activeChapterIds.has(chapterByLesson.get(coverage.lessonId) ?? ""));
  curriculumCoverages = curriculumCoverages.filter((coverage, index, items) => !movedNodes.has(coverage.nodeId) || items.findIndex((item) => item.nodeId === coverage.nodeId) === index).map((coverage) => { const chapterId = state.knowledgeChapterOverrides[coverage.nodeId]; return chapterId ? { ...coverage, lessonId: primaryLessonByChapter.get(chapterId) ?? coverage.lessonId } : coverage; });
  const coveredNodeIds = new Set(curriculumCoverages.map((coverage) => coverage.nodeId));
  const additions = [...state.addedKnowledgeNodeIds, ...state.addedKnowledgeCandidates.map((candidate) => ({ nodeId: candidate.id, chapterId: candidate.chapterId }))].filter((item) => !removedNodes.has(item.nodeId) && !coveredNodeIds.has(item.nodeId) && activeChapterIds.has(item.chapterId)).map((item) => ({ id: `authoring-coverage:${item.nodeId}`, courseId: runtime.course.id, lessonId: primaryLessonByChapter.get(item.chapterId)!, nodeId: item.nodeId, role: "introduce" as const, order: 0 }));
  curriculumCoverages = [...curriculumCoverages, ...additions]; const grouped = new Map<string, typeof curriculumCoverages>(); curriculumCoverages.forEach((coverage) => grouped.set(coverage.lessonId, [...(grouped.get(coverage.lessonId) ?? []), coverage])); curriculumCoverages = Array.from(grouped.values()).flatMap((items) => items.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map((coverage, order) => ({ ...coverage, order })));
  const removedMaterialLink = (nodeId: string, materialId: string) => state.removedLinks.some((link) => link.nodeId === nodeId && link.materialId === materialId);
  const materials = [...runtime.materials.filter((material) => activeLessonIds.has(material.lessonId)), ...state.generatedMaterials.filter((draft) => activeLessonIds.has(draft.lessonId) && !runtime.materials.some((material) => material.id === draft.id))];
  const materialKnowledgeCoverages = runtime.materialKnowledgeCoverages.filter((coverage) => !removedNodes.has(coverage.nodeId) && !removedMaterialLink(coverage.nodeId, coverage.materialId));
  const materialAdditions: MaterialKnowledgeCoverage[] = state.addedLinks.flatMap((link) => { if (removedNodes.has(link.nodeId) || removedMaterialLink(link.nodeId, link.materialId) || materialKnowledgeCoverages.some((coverage) => coverage.nodeId === link.nodeId && coverage.materialId === link.materialId)) return []; const segment = materials.find((item) => item.id === link.materialId)?.segments[0]; return segment ? [{ id: `authoring-material-coverage:${link.materialId}:${link.nodeId}`, materialId: link.materialId, segmentId: segment.id, nodeId: link.nodeId, role: "explain" as const }] : []; });
  const chapterOutcomes = runtime.chapterOutcomes.filter((outcome) => activeChapterIds.has(outcome.chapterId));
  const outcomeIds = new Set(chapterOutcomes.map((outcome) => outcome.id));
  return { ...runtime, chapters, lessons, curriculumCoverages, curriculumSequences:runtime.curriculumSequences.filter((sequence)=>activeLessonIds.has(sequence.sourceLessonId)&&activeLessonIds.has(sequence.targetLessonId)), assignments: state.assignments ?? runtime.assignments, assignmentCoverages: (state.assignmentCoverages ?? runtime.assignmentCoverages).filter((coverage) => !removedNodes.has(coverage.nodeId)), chapterOutcomes, assignmentOutcomeCompositions:runtime.assignmentOutcomeCompositions.filter((composition)=>outcomeIds.has(composition.outcomeId)), finalProjectOutcomeCompositions:runtime.finalProjectOutcomeCompositions.filter((composition)=>outcomeIds.has(composition.outcomeId)), materials, materialKnowledgeCoverages: [...materialKnowledgeCoverages, ...materialAdditions], revision: `${runtime.revision}:authoring:${structuralRevision(state)}` };
}

export function upsertDraftMicroPath(state: CourseAuthoringDraftState, path: MicroLearningPath) { return { ...state, microPaths: [...(state.microPaths ?? []).filter((item) => item.id !== path.id), path] }; }
export function removeDraftMicroPath(state: CourseAuthoringDraftState, pathId: string) { return { ...state, microPaths: (state.microPaths ?? []).filter((item) => item.id !== pathId) }; }
export function upsertDraftAssignment(state: CourseAuthoringDraftState, assignment: CourseAssignment, coverage: AssignmentCoverage) {
  const assignments = state.assignments ?? []; const coverages = state.assignmentCoverages ?? [];
  return { ...state, assignments: [...assignments.filter((item) => item.id !== assignment.id), assignment], assignmentCoverages: [...coverages.filter((item) => item.assignmentId !== assignment.id || item.nodeId !== coverage.nodeId), coverage] };
}

export function createEditableKnowledgeGraph(base: KnowledgeGraph, state: CourseAuthoringDraftState): KnowledgeGraph {
  const candidateNodes: KnowledgeNode[] = state.addedKnowledgeCandidates.map((candidate) => ({ id: candidate.id, title: candidate.title, description: candidate.description, type: "conceptual", masteryCriteria: [], scope: "user", ownerId: `course:${state.courseId}`, provenance: [{ sourceType: "course", sourceId: state.courseId, courseId: state.courseId }], currentRevisionId: `draft-revision:${candidate.id}`, status: "active", splitFrom: candidate.splitFrom, mergedFrom: candidate.mergedFrom, metadata: { courseDraftCandidate: true } }));
  return { nodes: [...base.nodes, ...candidateNodes.filter((candidate) => !base.nodes.some((node) => node.id === candidate.id))], revisions: base.revisions, edges: [...base.edges.filter((edge) => !state.removedDependencyIds.includes(edge.id)), ...state.addedDependencies.filter((edge) => !base.edges.some((baseEdge) => baseEdge.id === edge.id) && !state.removedDependencyIds.includes(edge.id))] };
}
export function createEditableKnowledgeRepository(base: KnowledgeRepository, state: CourseAuthoringDraftState): KnowledgeRepository {
  const graphFor = (context: KnowledgeAccessContext) => createEditableKnowledgeGraph(base.getVisibleGraph(context), state);
  return { getVisibleGraph: graphFor, getNode(nodeId, context) { return graphFor(context).nodes.find((node) => node.id === nodeId) ?? null; }, getNodes(nodeIds, context) { const ids = new Set(nodeIds); return graphFor(context).nodes.filter((node) => ids.has(node.id)); } };
}

export function createGeneratedArticleDraft(input: { runtime: CourseRuntimeData; nodeId: string; nodeTitle: string; createId?: () => string }): Material {
  const lessonId = input.runtime.curriculumCoverages.find((coverage) => coverage.nodeId === input.nodeId)?.lessonId; if (!lessonId) throw new Error(`Cannot generate Material for KnowledgeNode ${input.nodeId} without CurriculumCoverage`);
  const id = `draft-material-${(input.createId ?? (() => crypto.randomUUID()))()}`; const order = Math.max(-1, ...input.runtime.materials.filter((material) => material.lessonId === lessonId).map((material) => material.order)) + 1;
  return { id, courseId: input.runtime.course.id, lessonId, order, title: `${input.nodeTitle} · AI 课件草稿`, description: `围绕“${input.nodeTitle}”生成的 Article Material，供教师继续预览与修改。`, type: "article", duration: "12 分钟", segments: [
    { id: `${id}-overview`, order: 0, title: "学习目标与核心概念", content: { lead: `理解 ${input.nodeTitle} 的核心目标、适用边界与关键术语。`, bullets: ["明确可观察的学习目标", "建立概念与工程场景的联系", "识别常见误区"], visual: "overview" } },
    { id: `${id}-example`, order: 1, title: "工程示例", content: { lead: `通过一个最小工程案例拆解 ${input.nodeTitle}。`, paragraphs: ["先确认输入、输出与约束，再观察关键决策如何影响结果。", "示例保留可复核的中间产物，便于课堂讨论与后续实训。"], visual: "flow" } },
    { id: `${id}-practice`, order: 2, title: "检查与延伸", content: { lead: "使用以下问题检查理解，并为对应实训准备证据。", bullets: ["能否解释为什么采用该方案？", "失败时最先检查哪一项？", "产出如何被后续课程步骤复用？"], visual: "practice" } }
  ] };
}
