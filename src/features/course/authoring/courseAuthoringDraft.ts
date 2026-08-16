import type { Material, MaterialKnowledgeCoverage } from "@/features/course/types";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";

export type MaterialLink = { nodeId: string; materialId: string };
export type CourseAuthoringDraftState = { courseId: string; addedLinks: MaterialLink[]; removedLinks: MaterialLink[]; generatedMaterials: Material[] };

const STORAGE_PREFIX = "eduflow:course-authoring:v1:";
const listeners = new Set<() => void>();

export function emptyCourseAuthoringDraft(courseId: string): CourseAuthoringDraftState {
  return { courseId, addedLinks: [], removedLinks: [], generatedMaterials: [] };
}
function sameLink(left: MaterialLink, right: MaterialLink) { return left.nodeId === right.nodeId && left.materialId === right.materialId; }

export function addMaterialLink(state: CourseAuthoringDraftState, link: MaterialLink) {
  if (state.addedLinks.some((item) => sameLink(item, link)) && !state.removedLinks.some((item) => sameLink(item, link))) return state;
  return { ...state, addedLinks: state.addedLinks.some((item) => sameLink(item, link)) ? state.addedLinks : [...state.addedLinks, link], removedLinks: state.removedLinks.filter((item) => !sameLink(item, link)) };
}

export function removeMaterialLink(state: CourseAuthoringDraftState, link: MaterialLink) {
  if (state.removedLinks.some((item) => sameLink(item, link))) return state;
  return { ...state, addedLinks: state.addedLinks.filter((item) => !sameLink(item, link)), removedLinks: [...state.removedLinks, link] };
}

export function addGeneratedMaterial(state: CourseAuthoringDraftState, material: Material, nodeId: string) {
  const next = state.generatedMaterials.some((item) => item.id === material.id) ? state : { ...state, generatedMaterials: [...state.generatedMaterials, material] };
  return addMaterialLink(next, { nodeId, materialId: material.id });
}

export function applyCourseAuthoringDraft(runtime: CourseRuntimeData, state: CourseAuthoringDraftState): CourseRuntimeData {
  const removed = (nodeId: string, materialId: string) => state.removedLinks.some((link) => link.nodeId === nodeId && link.materialId === materialId);
  const materials = [...runtime.materials, ...state.generatedMaterials.filter((draft) => !runtime.materials.some((material) => material.id === draft.id))];
  const coverages = runtime.materialKnowledgeCoverages.filter((coverage) => !removed(coverage.nodeId, coverage.materialId));
  const additions: MaterialKnowledgeCoverage[] = state.addedLinks.flatMap((link) => {
    if (removed(link.nodeId, link.materialId) || coverages.some((coverage) => coverage.nodeId === link.nodeId && coverage.materialId === link.materialId)) return [];
    const segment = materials.find((item) => item.id === link.materialId)?.segments[0];
    return segment ? [{ id: `authoring-coverage:${link.materialId}:${link.nodeId}`, materialId: link.materialId, segmentId: segment.id, nodeId: link.nodeId, role: "explain" as const }] : [];
  });
  return { ...runtime, materials, materialKnowledgeCoverages: [...coverages, ...additions] };
}

export function createGeneratedArticleDraft(input: { runtime: CourseRuntimeData; nodeId: string; nodeTitle: string; createId?: () => string }): Material {
  const lessonId = input.runtime.curriculumCoverages.find((coverage) => coverage.nodeId === input.nodeId)?.lessonId;
  if (!lessonId) throw new Error(`Cannot generate Material for KnowledgeNode ${input.nodeId} without CurriculumCoverage`);
  const id = `draft-material-${(input.createId ?? (() => crypto.randomUUID()))()}`;
  const order = Math.max(-1, ...input.runtime.materials.filter((material) => material.lessonId === lessonId).map((material) => material.order)) + 1;
  return {
    id, courseId: input.runtime.course.id, lessonId, order, title: `${input.nodeTitle} · AI 课件草稿`,
    description: `围绕“${input.nodeTitle}”生成的 Article Material，供教师继续预览与修改。`, type: "article", duration: "12 分钟",
    segments: [
      { id: `${id}-overview`, order: 0, title: "学习目标与核心概念", content: { lead: `理解 ${input.nodeTitle} 的核心目标、适用边界与关键术语。`, bullets: ["明确可观察的学习目标", "建立概念与工程场景的联系", "识别常见误区"], visual: "overview" } },
      { id: `${id}-example`, order: 1, title: "工程示例", content: { lead: `通过一个最小工程案例拆解 ${input.nodeTitle}。`, paragraphs: ["先确认输入、输出与约束，再观察关键决策如何影响结果。", "示例保留可复核的中间产物，便于课堂讨论与后续实训。"], visual: "flow" } },
      { id: `${id}-practice`, order: 2, title: "检查与延伸", content: { lead: "使用以下问题检查理解，并为对应实训准备证据。", bullets: ["能否解释为什么采用该方案？", "失败时最先检查哪一项？", "产出如何被后续课程步骤复用？"], visual: "practice" } }
    ]
  };
}

function storageKey(courseId: string) { return `${STORAGE_PREFIX}${courseId}`; }
export function readCourseAuthoringDraft(courseId: string, storage: Pick<Storage, "getItem"> = localStorage) {
  const raw = storage.getItem(storageKey(courseId));
  if (!raw) return emptyCourseAuthoringDraft(courseId);
  try {
    const parsed = JSON.parse(raw) as CourseAuthoringDraftState;
    return parsed.courseId === courseId && Array.isArray(parsed.addedLinks) && Array.isArray(parsed.removedLinks) && Array.isArray(parsed.generatedMaterials) ? parsed : emptyCourseAuthoringDraft(courseId);
  } catch { return emptyCourseAuthoringDraft(courseId); }
}
export function writeCourseAuthoringDraft(state: CourseAuthoringDraftState, storage: Pick<Storage, "setItem"> = localStorage) {
  storage.setItem(storageKey(state.courseId), JSON.stringify(state));
  listeners.forEach((listener) => listener());
}
export function subscribeCourseAuthoringDraft(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
