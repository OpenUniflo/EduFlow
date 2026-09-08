import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { buildMaterialDeepLink, resolveKnowledgeMaterialEntries } from "@/features/material/materialNavigation";
import type { NavigationDecision } from "@/shared/learning/navigation";

export type MicroCompletionAction = { kind: "material" | "practice" | "next"; title: string; href: string };

/** Projects real available context; neither mutates progress nor chooses the next Knowledge. */
export function resolveMicroCompletionContext(input: {
  knowledgeId: string;
  runtime?: CourseRuntimeData | null;
  decision?: NavigationDecision | null;
  hasMicro(knowledgeId: string): boolean;
}): MicroCompletionAction[] {
  const { runtime, knowledgeId, decision } = input;
  if (!runtime || !runtime.curriculumCoverages.some((coverage) => coverage.nodeId === knowledgeId)) return [];
  const courseId = runtime.course.id;
  const actions: MicroCompletionAction[] = resolveKnowledgeMaterialEntries(runtime, knowledgeId).map((entry) => ({
    kind: "material", title: entry.segmentTitle ? `${entry.materialTitle} · ${entry.segmentTitle}` : entry.materialTitle,
    href: buildMaterialDeepLink({ courseId, materialId: entry.materialId, segmentId: entry.segmentId })
  }));
  const assignmentIds = new Set(runtime.assignmentCoverages.filter((coverage) => coverage.nodeId === knowledgeId).map((coverage) => coverage.assignmentId));
  actions.push(...runtime.assignments.filter((assignment) => assignmentIds.has(assignment.id)).sort((left, right) => left.order-right.order || left.id.localeCompare(right.id)).map((assignment): MicroCompletionAction => ({
    kind: "practice", title: assignment.title, href: `/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignment.id)}`
  })));
  const next = decision?.courseId === courseId ? decision.nextAction : undefined;
  if (next?.nodeId && next.nodeId !== knowledgeId && next.resourceKind === "micro" && input.hasMicro(next.nodeId)
    && runtime.curriculumCoverages.some((coverage) => coverage.nodeId === next.nodeId)) {
    actions.push({ kind: "next", title: decision?.path.find((item) => item.nodeId === next.nodeId)?.title ?? "继续下一项",
      href: `/learn/micro/${encodeURIComponent(next.nodeId)}?${new URLSearchParams({ courseId })}` });
  }
  return actions;
}
