import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { buildMaterialDeepLink, resolveKnowledgeMaterialEntries } from "@/features/material/materialNavigation";
import type { NavigationDecision } from "@/shared/learning/navigation";

export type MicroCompletionAction = { kind: "material" | "practice" | "next"; title: string; href: string };

/** Projects real available context; neither mutates progress nor chooses the next Knowledge. */
export function resolveMicroCompletionContext(input: {
  knowledgeId: string;
  runtime?: CourseRuntimeData | null;
  decision?: NavigationDecision | null;
  actionExecution?: boolean;
  hasMicro(knowledgeId: string): boolean;
}): MicroCompletionAction[] {
  const { runtime, knowledgeId, decision } = input;
  if (!runtime) return [];
  const routeDecision = decision?.courseId === runtime.course.id ? decision : undefined;
  const inContext = (id: string) => runtime.curriculumCoverages.some(coverage => coverage.nodeId === id)
    || Boolean(routeDecision?.path.some(item => item.nodeId === id));
  if (!inContext(knowledgeId)) return [];
  const courseId = runtime.course.id;
  const actions: MicroCompletionAction[] = resolveKnowledgeMaterialEntries(runtime, knowledgeId).map((entry) => ({
    kind: "material", title: entry.segmentTitle ? `${entry.materialTitle} · ${entry.segmentTitle}` : entry.materialTitle,
    href: buildMaterialDeepLink({ courseId, materialId: entry.materialId, segmentId: entry.segmentId })
  }));
  const assignmentIds = new Set(runtime.assignmentCoverages.filter((coverage) => coverage.nodeId === knowledgeId).map((coverage) => coverage.assignmentId));
  if (!input.actionExecution) actions.push(...runtime.assignments.filter((assignment) => assignmentIds.has(assignment.id)).sort((left, right) => left.order-right.order || left.id.localeCompare(right.id)).map((assignment): MicroCompletionAction => ({
    kind: "practice", title: assignment.title, href: `/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignment.id)}`
  })));
  const next = !input.actionExecution && decision?.courseId === courseId ? decision.nextAction : undefined;
  if (next?.nodeId && next.nodeId !== knowledgeId
    && inContext(next.nodeId)) {
    const material = next.resourceKind === "material" ? resolveKnowledgeMaterialEntries(runtime, next.nodeId).find((entry) => entry.materialId === next.resourceId) : undefined;
    const href = next.resourceKind === "micro" && input.hasMicro(next.nodeId)
      ? `/learn/micro/${encodeURIComponent(next.nodeId)}?${new URLSearchParams({ courseId })}`
      : material ? buildMaterialDeepLink({ courseId, materialId: material.materialId, segmentId: material.segmentId }) : undefined;
    if (href) actions.push({ kind: "next", title: decision?.path.find((item) => item.nodeId === next.nodeId)?.title ?? "继续下一项", href });
  }
  return actions;
}
