import type { UserCourseState } from "../types";
import type { CourseRuntimeData } from "../course/runtime/courseRuntime";
import { calculateCrossDomainConnections, calculateKnowledgeConnectivity } from "../knowledge/graphAlgorithms";
import type { KnowledgeGraph } from "../knowledge/types";
import type { CurriculumContext, PersonalAssignmentContext, PersonalKnowledgeGraph, PersonalKnowledgeNode, UserKnowledgeRecord } from "./types";
import { getDomainGovernanceSnapshot, resolveNodeDomain } from "../knowledge/domain/domainStore";

function groupBy<T>(items: T[], key: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => grouped.set(key(item), [...(grouped.get(key(item)) ?? []), item]));
  return grouped;
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
  userCourseStates: UserCourseState[]
): PersonalKnowledgeGraph {
  const assignments = runtimes.flatMap((runtime) => runtime.assignments);
  const curriculum = runtimes.flatMap((runtime) => runtime.curriculumCoverages);
  const lessons = runtimes.flatMap((runtime) => runtime.lessons);
  const assignmentCoverage = runtimes.flatMap((runtime) => runtime.assignmentCoverages);
  const assignmentStateByCourse = new Map(userCourseStates.map((state) => [state.courseId, state.assignmentStates]));
  const courseByAssignment = new Map(assignments.map((assignment) => [assignment.id, assignment.courseId]));
  const materialIdsByCourseNode = new Map<string, string[]>();
  runtimes.forEach((runtime) => runtime.materialKnowledgeCoverages.forEach((coverage) => {
    const key = `${runtime.course.id}:${coverage.nodeId}`;
    materialIdsByCourseNode.set(key, Array.from(new Set([...(materialIdsByCourseNode.get(key) ?? []), coverage.materialId])));
  }));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const recordById = new Map(userKnowledge.map((record) => [record.nodeId, record]));
  const curriculumByNode = groupBy(curriculum, (coverage) => coverage.nodeId);
  const assignmentByNode = groupBy(assignmentCoverage, (coverage) => coverage.nodeId);
  const governance = getDomainGovernanceSnapshot();

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
    const curriculumContexts: CurriculumContext[] = (curriculumByNode.get(id) ?? []).flatMap((coverage) => {
      const lesson = lessonById.get(coverage.lessonId);
      if (!lesson) return [];
      return [{
        coverageId: coverage.id,
        courseId: coverage.courseId,
        lessonId: coverage.lessonId,
        lessonOrder: lesson.order,
        chapterId: lesson.chapterId,
        role: coverage.role,
        materialIds: materialIdsByCourseNode.get(`${coverage.courseId}:${id}`) ?? []
      }];
    }).sort((left, right) => left.lessonOrder - right.lessonOrder || left.coverageId.localeCompare(right.coverageId));
    const assignmentContexts: PersonalAssignmentContext[] = (assignmentByNode.get(id) ?? []).flatMap((coverage) => {
      const assignment = assignmentById.get(coverage.assignmentId);
      if (!assignment) return [];
      return [{
        coverageId: coverage.id,
        courseId: assignment.courseId,
        assignmentId: assignment.id,
        title: assignment.title,
        role: coverage.role,
        workflowTemplateId: assignment.workflowTemplateId,
        status: assignmentStateByCourse.get(courseByAssignment.get(assignment.id) ?? "")?.[assignment.id]?.status ?? "not-started"
      }];
    }).sort((left, right) => left.assignmentId.localeCompare(right.assignmentId) || left.coverageId.localeCompare(right.coverageId));
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
      completedAssignments: new Set(nodes.flatMap((node) => node.assignmentContexts.filter((context) => context.status === "completed").map((context) => context.assignmentId))).size,
      crossDomainConnections: calculateCrossDomainConnections(graph, coreIds, effectiveEdges, governance.assignments),
      connectivity: calculateKnowledgeConnectivity(coreIds, effectiveEdges),
      currentLearningId
    }
  };
}
