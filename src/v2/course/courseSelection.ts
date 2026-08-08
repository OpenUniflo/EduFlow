import type { AssignmentContext, CourseAssignment, CourseChapterProjection, CourseSkillTreeNode } from "../types";

export type SelectedAnchor =
  | { kind: "chapter"; id: string }
  | { kind: "knowledge"; id: string };

export type CourseDetailFacet = "knowledge" | "assignment";

export type AssignmentDrawerProjection =
  | { kind: "group"; contexts: AssignmentContext[] }
  | { kind: "detail"; context: AssignmentContext; canReturnToGroup: boolean };

export type ChapterAssignmentProjection = {
  chapter: CourseChapterProjection;
  assignments: Array<{ assignment: CourseAssignment; context: AssignmentContext }>;
  projectContributions: string[];
};

export type CourseDrawerProjectionKind = "chapter-knowledge" | "chapter-assignment" | "atomic-knowledge" | "assignment-group" | "assignment-detail";

export function detailFacetForMode(mode: "knowledge" | "assignment"): CourseDetailFacet {
  return mode;
}

export function flowIdForAnchor(anchor: SelectedAnchor | null) {
  return anchor ? `${anchor.kind}:${anchor.id}` : null;
}

export function courseDrawerProjectionKind(anchor: SelectedAnchor, mode: "knowledge" | "assignment", node?: CourseSkillTreeNode, activeAssignmentId: string | null = null): CourseDrawerProjectionKind {
  if (anchor.kind === "chapter") return mode === "knowledge" ? "chapter-knowledge" : "chapter-assignment";
  if (mode === "knowledge") return "atomic-knowledge";
  if (!node) throw new Error(`Missing CourseSkillTreeNode for anchor ${anchor.id}`);
  return assignmentProjectionForNode(node, activeAssignmentId).kind === "group" ? "assignment-group" : "assignment-detail";
}

export function assignmentProjectionForNode(node: CourseSkillTreeNode, activeAssignmentId: string | null): AssignmentDrawerProjection {
  if (node.assignmentContexts.length > 1 && !activeAssignmentId) return { kind: "group", contexts: node.assignmentContexts };
  const context = node.assignmentContexts.find((item) => item.assignmentId === activeAssignmentId) ?? (node.assignmentContexts.length === 1 ? node.assignmentContexts[0] : undefined);
  if (!context) return { kind: "group", contexts: node.assignmentContexts };
  return { kind: "detail", context, canReturnToGroup: node.assignmentContexts.length > 1 };
}

export function buildChapterAssignmentProjection(chapter: CourseChapterProjection, nodes: CourseSkillTreeNode[]): ChapterAssignmentProjection {
  const contextByAssignmentId = new Map<string, AssignmentContext>();
  nodes.filter((node) => node.curriculumContexts.some((context) => context.chapterId === chapter.id)).forEach((node) => node.assignmentContexts.forEach((context) => {
    if (!contextByAssignmentId.has(context.assignmentId)) contextByAssignmentId.set(context.assignmentId, context);
  }));
  const assignments = chapter.assignmentSummary.assignmentIds.flatMap((assignmentId) => {
    const context = contextByAssignmentId.get(assignmentId);
    return context ? [{ assignment: context.assignment, context }] : [];
  });
  return {
    chapter,
    assignments,
    projectContributions: Array.from(new Set(assignments.flatMap(({ assignment }) => assignment.projectContribution ? [assignment.projectContribution] : [])))
  };
}
