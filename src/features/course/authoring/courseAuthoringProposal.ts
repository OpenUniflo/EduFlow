import type { CurriculumChapter } from "@/features/course/types";
import type { KnowledgeEdge, KnowledgeGraph } from "@/features/knowledge/types";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { addDraftChapter, addDraftDependency, addKnowledgeCandidate, moveCourseKnowledge, removeCourseKnowledge, removeDraftDependency, updateDraftChapter, type CourseAuthoringDraftState, type DraftKnowledgeCandidate } from "./courseAuthoringDraft";
import { validateCourseAuthoring, type CourseAuthoringValidation } from "./courseAuthoringValidation";

export type CourseAuthoringOperation =
  | { type: "addChapter"; chapter: CurriculumChapter }
  | { type: "renameChapter"; chapterId: string; title: string }
  | { type: "moveKnowledge"; nodeId: string; chapterId: string }
  | { type: "addKnowledgeCandidate"; candidate: DraftKnowledgeCandidate }
  | { type: "removeKnowledgeCoverage"; nodeId: string }
  | { type: "addDependency"; edge: KnowledgeEdge }
  | { type: "removeDependency"; edgeId: string };

export type CourseAuthoringProposal = { id: string; title: string; summary: string; operations: CourseAuthoringOperation[] };

export function describeCourseAuthoringOperation(operation: CourseAuthoringOperation) {
  if (operation.type === "addChapter") return `+ 篇章：${operation.chapter.title}`;
  if (operation.type === "renameChapter") return `~ 重命名篇章：${operation.title}`;
  if (operation.type === "moveKnowledge") return `→ 移动 ${operation.nodeId} 到 ${operation.chapterId}`;
  if (operation.type === "addKnowledgeCandidate") return `+ 草稿知识点：${operation.candidate.title}`;
  if (operation.type === "removeKnowledgeCoverage") return `- 从课程移除：${operation.nodeId}`;
  if (operation.type === "addDependency") return `+ 依赖：${operation.edge.source} → ${operation.edge.target}`;
  return `- 依赖：${operation.edgeId}`;
}

export function reduceCourseAuthoringProposal(state: CourseAuthoringDraftState, proposal: CourseAuthoringProposal) {
  return proposal.operations.reduce((current, operation) => {
    if (operation.type === "addChapter") return addDraftChapter(current, operation.chapter);
    if (operation.type === "renameChapter") return updateDraftChapter(current, operation.chapterId, { title: operation.title });
    if (operation.type === "moveKnowledge") return moveCourseKnowledge(current, operation.nodeId, operation.chapterId);
    if (operation.type === "addKnowledgeCandidate") return addKnowledgeCandidate(current, operation.candidate);
    if (operation.type === "removeKnowledgeCoverage") return removeCourseKnowledge(current, operation.nodeId);
    if (operation.type === "addDependency") return addDraftDependency(current, operation.edge);
    return removeDraftDependency(current, operation.edgeId);
  }, state);
}

export function validateCourseAuthoringProposal(runtime: CourseRuntimeData, graph: KnowledgeGraph, state: CourseAuthoringDraftState, proposal: CourseAuthoringProposal): { state: CourseAuthoringDraftState; validation: CourseAuthoringValidation; valid: boolean } {
  const next = reduceCourseAuthoringProposal(state, proposal);
  const validation = validateCourseAuthoring(runtime, graph, next);
  return { state: next, validation, valid: validation.fatal.length === 0 };
}
