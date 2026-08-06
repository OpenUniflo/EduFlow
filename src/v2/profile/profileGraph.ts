import type { CurriculumCoverage, CurriculumLesson, LearningProgress, Practice, PracticeCoverage } from "../types";
import { calculateCrossDomainConnections, calculateKnowledgeConnectivity } from "../knowledge/graphAlgorithms";
import type { KnowledgeGraph } from "../knowledge/types";
import { buildPersonalForceLayout } from "./personalLayout";
import type { CurriculumContext, PersonalKnowledgeGraph, PersonalKnowledgeNode, PracticeContext, UserKnowledgeRecord } from "./types";

const MATERIAL_BY_LESSON: Record<string, string[]> = { L04: ["lesson-04"] };

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
  practices: Practice[],
  curriculum: CurriculumCoverage[],
  lessons: CurriculumLesson[],
  practiceCoverage: PracticeCoverage[],
  progress: LearningProgress
): PersonalKnowledgeGraph {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const domainById = new Map(graph.domains.map((domain) => [domain.id, domain]));
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const practiceById = new Map(practices.map((practice) => [practice.id, practice]));
  const recordById = new Map(userKnowledge.map((record) => [record.nodeId, record]));
  const curriculumByNode = groupBy(curriculum, (coverage) => coverage.nodeId);
  const practiceByNode = groupBy(practiceCoverage, (coverage) => coverage.nodeId);

  userKnowledge.forEach((record) => {
    if (!nodeById.has(record.nodeId)) throw new Error(`Unknown user knowledge node: ${record.nodeId}`);
  });

  const coreIds = new Set(userKnowledge
    .filter((record) => nodeById.get(record.nodeId)?.status === "active")
    .map((record) => record.nodeId));
  const exploreIds = getDirectExploreNodeIds(graph, coreIds);
  const visibleIds = new Set([...coreIds, ...exploreIds]);
  const visibleEdges = graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  const positions = buildPersonalForceLayout(visibleIds, visibleEdges);
  const effectiveEdges = visibleEdges.filter((edge) => coreIds.has(edge.source) && coreIds.has(edge.target));

  const nodes: PersonalKnowledgeNode[] = Array.from(visibleIds).sort().flatMap((id) => {
    const source = nodeById.get(id);
    const position = positions[id];
    if (!source || source.status !== "active" || !position) return [];
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
        materialIds: MATERIAL_BY_LESSON[coverage.lessonId] ?? []
      }];
    }).sort((left, right) => left.lessonOrder - right.lessonOrder || left.coverageId.localeCompare(right.coverageId));
    const practiceContexts: PracticeContext[] = (practiceByNode.get(id) ?? []).flatMap((coverage) => {
      const practice = practiceById.get(coverage.practiceId);
      if (!practice) return [];
      return [{
        coverageId: coverage.id,
        practiceId: practice.id,
        title: practice.title,
        role: coverage.role,
        templateId: practice.templateId,
        completed: progress.completedPracticeIds.includes(practice.id)
      }];
    }).sort((left, right) => left.practiceId.localeCompare(right.practiceId) || left.coverageId.localeCompare(right.coverageId));
    return [{
      id,
      title: source.title,
      description: source.description,
      scope: source.scope,
      domainId: source.domainId,
      domainTitle: domainById.get(source.domainId ?? "")?.title ?? (source.scope === "user" ? "个人知识" : source.domainId),
      domainColor: domainById.get(source.domainId ?? "")?.color ?? (source.scope === "user" ? "#f2a65a" : "#78a7ee"),
      status: record?.status ?? "explore",
      progress: record?.mastery ?? 0,
      x: position.x,
      y: position.y,
      isCore: coreIds.has(id),
      curriculumContexts,
      practiceContexts,
      evidence: [
        ...(record?.evidence?.map((evidence) => evidence.label) ?? []),
        ...practiceContexts.filter((context) => context.completed).map((context) => `已完成实训 · ${context.title}`)
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
      verifiedPractices: new Set(nodes.flatMap((node) => node.practiceContexts.filter((context) => context.completed).map((context) => context.practiceId))).size,
      crossDomainConnections: calculateCrossDomainConnections(graph, coreIds, effectiveEdges),
      connectivity: calculateKnowledgeConnectivity(coreIds, effectiveEdges),
      currentLearningId
    }
  };
}
