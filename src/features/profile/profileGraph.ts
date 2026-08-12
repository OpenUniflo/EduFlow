import type { UserCourseState } from "@/features/course/types";
import type { CourseRuntimeData } from "../course/runtime/courseRuntime";
import { calculateCrossDomainConnections, calculateKnowledgeConnectivity } from "../knowledge/graphAlgorithms";
import type { KnowledgeGraph } from "../knowledge/types";
import type { CurriculumContext, PersonalAssignmentContext, PersonalKnowledgeGraph, PersonalKnowledgeNode, UserKnowledgeRecord } from "./types";
import { resolveNodeDomain } from "../knowledge/domain/domainResolution";
import type { DomainGovernanceState } from "../knowledge/domain/DomainGovernanceRepository";
import { resolveKnowledgeMaterialEntries } from "../material/materialNavigation";
import { CURRICULUM_ROLE_PRIORITY } from "../course/curriculum/curriculumOrdering";

function appendToGroup<T>(grouped: Map<string, T[]>, key: string, item: T) {
  grouped.set(key, [...(grouped.get(key) ?? []), item]);
}

export function courseScopedId(courseId: string, entityId: string) {
  return `${courseId}:${entityId}`;
}

export function getDirectExploreNodeIds(graph: KnowledgeGraph, coreIds: Set<string>) {
  const activeIds = new Set(graph.nodes.filter((node) => node.status === "active").map((node) => node.id));
  const exploreIds = new Set<string>();
  graph.edges.forEach((edge) => {
    if (coreIds.has(edge.source) && activeIds.has(edge.target) && !coreIds.has(edge.target)) exploreIds.add(edge.target);
    if (coreIds.has(edge.target) && activeIds.has(edge.source) && !coreIds.has(edge.source)) exploreIds.add(edge.source);
  });
  return exploreIds;
}

export function buildPersonalKnowledgeGraph(
  graph: KnowledgeGraph,
  userKnowledge: UserKnowledgeRecord[],
  runtimes: CourseRuntimeData[],
  userCourseStates: UserCourseState[],
  governance: DomainGovernanceState
): PersonalKnowledgeGraph {
  const assignmentStateByCourse = new Map(userCourseStates.map((state) => [state.courseId, state.assignmentStates]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const recordById = new Map(userKnowledge.map((record) => [record.nodeId, record]));
  const curriculumByNode = new Map<string, CurriculumContext[]>();
  const assignmentByNode = new Map<string, PersonalAssignmentContext[]>();

  runtimes.forEach((runtime) => {
    const courseId = runtime.course.id;
    const lessonById = new Map(runtime.lessons.map((lesson) => [lesson.id, lesson]));
    const assignmentById = new Map(runtime.assignments.map((assignment) => [assignment.id, assignment]));
    const materialIdsByNode = new Map<string, string[]>();
    runtime.materialKnowledgeCoverages.forEach((coverage) => {
      materialIdsByNode.set(coverage.nodeId, Array.from(new Set([...(materialIdsByNode.get(coverage.nodeId) ?? []), coverage.materialId])));
    });

    runtime.curriculumCoverages.forEach((coverage) => {
      const lesson = lessonById.get(coverage.lessonId);
      if (!lesson) return;
      appendToGroup(curriculumByNode, coverage.nodeId, {
        coverageId: coverage.id,
        courseId,
        lessonId: coverage.lessonId,
        lessonOrder: lesson.order,
        coverageOrder: coverage.order,
        chapterId: lesson.chapterId,
        role: coverage.role,
        materialIds: materialIdsByNode.get(coverage.nodeId) ?? [],
        materialEntries: resolveKnowledgeMaterialEntries(runtime, coverage.nodeId)
      });
    });

    runtime.assignmentCoverages.forEach((coverage) => {
      const assignment = assignmentById.get(coverage.assignmentId);
      if (!assignment) return;
      appendToGroup(assignmentByNode, coverage.nodeId, {
        coverageId: coverage.id,
        courseId,
        assignmentId: assignment.id,
        assignmentOrder: assignment.order,
        title: assignment.title,
        role: coverage.role,
        workflowTemplateId: assignment.workflowTemplateId,
        status: assignmentStateByCourse.get(courseId)?.[assignment.id]?.status ?? "not-started"
      });
    });
  });

  userKnowledge.forEach((record) => {
    if (!nodeById.has(record.nodeId)) throw new Error(`Unknown user knowledge node: ${record.nodeId}`);
  });

  const coreIds = new Set(userKnowledge
    .filter((record) => nodeById.get(record.nodeId)?.status === "active")
    .map((record) => record.nodeId));
  const exploreIds = getDirectExploreNodeIds(graph, coreIds);
  const visibleIds = new Set([...coreIds, ...exploreIds]);
  // Explore-to-Explore facts remain in the domain graph but are intentionally
  // omitted from the default Personal Atlas projection to reduce visual noise.
  const visibleEdges = graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target) && (coreIds.has(edge.source) || coreIds.has(edge.target)));
  const effectiveEdges = visibleEdges.filter((edge) => coreIds.has(edge.source) && coreIds.has(edge.target));

  const nodes: PersonalKnowledgeNode[] = Array.from(visibleIds).sort().flatMap((id) => {
    const source = nodeById.get(id);
    if (!source || source.status !== "active") return [];
    const record = recordById.get(id);
    const curriculumContexts = [...(curriculumByNode.get(id) ?? [])].sort((left, right) => left.lessonOrder - right.lessonOrder
      || left.coverageOrder - right.coverageOrder
      || CURRICULUM_ROLE_PRIORITY[left.role] - CURRICULUM_ROLE_PRIORITY[right.role]
      || left.courseId.localeCompare(right.courseId)
      || left.coverageId.localeCompare(right.coverageId));
    const assignmentContexts = [...(assignmentByNode.get(id) ?? [])].sort((left, right) => left.assignmentOrder - right.assignmentOrder
      || left.courseId.localeCompare(right.courseId)
      || left.assignmentId.localeCompare(right.assignmentId)
      || left.coverageId.localeCompare(right.coverageId));
    const domain = resolveNodeDomain(id, governance).domain;
    return [{
      id,
      title: source.title,
      description: source.description,
      scope: source.scope,
      domainId: domain?.id,
      domainTitle: domain?.name,
      status: record?.status ?? "explore",
      progress: record?.mastery ?? 0,
      isCore: coreIds.has(id),
      curriculumContexts,
      assignmentContexts,
      evidence: [
        ...(record?.evidence?.map((evidence) => evidence.label) ?? []),
        ...assignmentContexts.filter((context) => context.status === "completed").map((context) => `已完成实训 · ${context.title}`)
      ]
    }];
  });

  const expectedVisibleIds = new Set([...coreIds, ...getDirectExploreNodeIds(graph, coreIds)]);
  if (nodes.length !== expectedVisibleIds.size || nodes.some((node) => !expectedVisibleIds.has(node.id))) {
    throw new Error("Personal Atlas visible-node invariant failed");
  }

  const currentLearningId = [...userKnowledge]
    .filter((record) => record.status === "learning" && coreIds.has(record.nodeId))
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))[0]?.nodeId ?? null;

  return {
    nodes,
    edges: visibleEdges.map((edge) => ({ ...edge, effective: coreIds.has(edge.source) && coreIds.has(edge.target) })),
    summary: {
      mastered: nodes.filter((node) => node.status === "mastered").length,
      learning: nodes.filter((node) => node.status === "learning").length,
      explore: nodes.filter((node) => node.status === "explore").length,
      completedAssignments: new Set(nodes.flatMap((node) => node.assignmentContexts
        .filter((context) => context.status === "completed")
        .map((context) => courseScopedId(context.courseId, context.assignmentId)))).size,
      crossDomainConnections: calculateCrossDomainConnections(graph, coreIds, effectiveEdges, governance.assignments),
      connectivity: calculateKnowledgeConnectivity(coreIds, effectiveEdges),
      currentLearningId
    }
  };
}
