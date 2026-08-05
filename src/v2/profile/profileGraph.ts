import type { CurriculumCoverage, CurriculumLesson, LearningProgress, Practice, PracticeCoverage } from "../types";
import { detectWeightedCommunities, type GraphCommunity } from "../knowledge/community";
import {
  calculateCrossDomainConnections,
  calculateKnowledgeConnectivity,
  findPotentialBridges
} from "../knowledge/graphAlgorithms";
import { getKnowledgeEdgeLayoutWeight } from "../knowledge/graphLayout";
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeRelation } from "../knowledge/types";
import { buildPersonalForceLayout } from "./personalLayout";
import type {
  PersonalKnowledgeEdge,
  PersonalKnowledgeGraph,
  PersonalKnowledgeIsland,
  PersonalKnowledgeNode,
  PersonalPracticeEvidence,
  UserKnowledgeRecord
} from "./types";

const COURSE_ID = "agentic-ai";

const practiceFallbackKnowledge: Record<string, string> = {
  "lesson-04-direct": "R01",
  "lesson-04-react": "R10",
  "lesson-04-plan": "R04",
  "lesson-04-replan": "R06",
  "lesson-04-evaluator": "R09"
};

const relationPriority: Record<KnowledgeRelation, number> = {
  prerequisite: 5,
  enables: 3,
  related: 1
};

function getIncidentEdges(id: string, edges: KnowledgeEdge[]) {
  return edges.filter((edge) => edge.source === id || edge.target === id);
}

function getOtherEnd(id: string, edge: KnowledgeEdge) {
  return edge.source === id ? edge.target : edge.source;
}

function dominantDomainId(nodeIds: string[], graph: KnowledgeGraph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const counts = new Map<string, number>();
  nodeIds.forEach((id) => {
    const domainId = nodeById.get(id)?.domainId;
    if (domainId) counts.set(domainId, (counts.get(domainId) ?? 0) + 1);
  });
  return Array.from(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
}

function makeIslandTitle(nodeIds: string[], graph: KnowledgeGraph, duplicateIndex: number, qualifyWithCluster: boolean) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const domainById = new Map(graph.domains.map((domain) => [domain.id, domain]));
  const clusterById = new Map(graph.clusters.map((cluster) => [cluster.id, cluster]));
  const counts = new Map<string, number>();
  nodeIds.forEach((id) => {
    const domainId = nodeById.get(id)?.domainId;
    if (domainId) counts.set(domainId, (counts.get(domainId) ?? 0) + 1);
  });
  const domainIds = Array.from(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([id]) => id);
  const primaryCount = counts.get(domainIds[0]) ?? 0;
  const visibleDomains = primaryCount / Math.max(1, nodeIds.length) >= 0.66 ? domainIds.slice(0, 1) : domainIds.slice(0, 2);
  let title = visibleDomains.map((id) => domainById.get(id)?.title ?? id).join(" × ") || "Knowledge Island";
  if (qualifyWithCluster && visibleDomains.length === 1) {
    const clusterCounts = new Map<string, number>();
    nodeIds.forEach((id) => {
      const node = nodeById.get(id);
      if (node?.domainId === visibleDomains[0] && node.clusterId) {
        clusterCounts.set(node.clusterId, (clusterCounts.get(node.clusterId) ?? 0) + 1);
      }
    });
    const clusterId = Array.from(clusterCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
    if (clusterId) title = `${title} · ${clusterById.get(clusterId)?.title ?? clusterId}`;
  }
  return { domainIds, title: duplicateIndex > 1 ? `${title} ${duplicateIndex}` : title };
}

function selectExploreNodes(
  graph: KnowledgeGraph,
  coreIds: Set<string>,
  communities: GraphCommunity[],
  excludedIds: Set<string>
) {
  const communityByCore = new Map<string, string>();
  communities.forEach((community) => community.nodeIds.forEach((id) => communityByCore.set(id, community.id)));
  const candidates = new Map<string, {
    communityId: string;
    coreNeighbors: number;
    relationScore: number;
    layoutWeight: number;
  }>();

  graph.nodes.forEach((node) => {
    if (coreIds.has(node.id) || excludedIds.has(node.id)) return;
    const incident = getIncidentEdges(node.id, graph.edges).filter((edge) => coreIds.has(getOtherEnd(node.id, edge)));
    if (!incident.length) return;
    const weightsByCommunity = new Map<string, number>();
    incident.forEach((edge) => {
      const communityId = communityByCore.get(getOtherEnd(node.id, edge));
      if (communityId) {
        weightsByCommunity.set(communityId, (weightsByCommunity.get(communityId) ?? 0) + getKnowledgeEdgeLayoutWeight(edge));
      }
    });
    const communityId = Array.from(weightsByCommunity)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
    if (!communityId) return;
    candidates.set(node.id, {
      communityId,
      coreNeighbors: incident.length,
      relationScore: Math.max(...incident.map((edge) => relationPriority[edge.relation])),
      layoutWeight: incident.reduce((sum, edge) => sum + getKnowledgeEdgeLayoutWeight(edge), 0)
    });
  });

  const selected = new Map<string, string>();
  communities.forEach((community) => {
    Array.from(candidates)
      .filter(([, score]) => score.communityId === community.id)
      .sort((left, right) =>
        right[1].coreNeighbors - left[1].coreNeighbors ||
        right[1].relationScore - left[1].relationScore ||
        right[1].layoutWeight - left[1].layoutWeight ||
        left[0].localeCompare(right[0])
      )
      .slice(0, 3)
      .forEach(([id]) => selected.set(id, community.id));
  });
  return selected;
}

function makePracticeEvidence(
  practices: Practice[],
  practiceCoverage: PracticeCoverage[],
  nodes: PersonalKnowledgeNode[],
  progress: LearningProgress
): PersonalPracticeEvidence[] {
  const nodeByPractice = new Map(practiceCoverage.map((coverage) => [coverage.practiceId, coverage.nodeId]));
  return practices.flatMap((practice, index) => {
    const knowledgeId = nodeByPractice.get(practice.id) ?? practiceFallbackKnowledge[practice.id];
    const node = nodes.find((entry) => entry.id === knowledgeId);
    if (!node || node.isPotentialBridge) return [];
    const offset = (index % 3 - 1) * 70;
    return [{
      id: practice.id,
      title: practice.title,
      knowledgeId,
      templateId: practice.templateId,
      completed: progress.completedPracticeIds.includes(practice.id),
      x: node.x + offset,
      y: node.y + (node.y < 430 ? -82 : 88)
    }];
  });
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
  const clusterById = new Map(graph.clusters.map((cluster) => [cluster.id, cluster]));
  const recordById = new Map(userKnowledge.map((record) => [record.nodeId, record]));
  const curriculumById = new Map(curriculum.map((coverage) => [coverage.nodeId, coverage]));
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const practiceByNode = new Map(practiceCoverage.map((coverage) => [coverage.nodeId, coverage.practiceId]));
  const coreIds = new Set(userKnowledge.map((record) => record.nodeId));
  userKnowledge.forEach((record) => {
    if (!nodeById.has(record.nodeId)) throw new Error(`Unknown user knowledge node: ${record.nodeId}`);
  });

  const effectiveEdges = graph.edges.filter((edge) => coreIds.has(edge.source) && coreIds.has(edge.target));
  const communities = detectWeightedCommunities(coreIds, effectiveEdges, { resolution: 0.32 });
  const potentialBridges = findPotentialBridges(graph, communities.map((community) => community.nodeIds), coreIds, { maxDepth: 6, limit: 3 });
  const potentialPathIds = new Set(potentialBridges.flatMap((bridge) => bridge.missingNodeIds));
  const potentialEdgeIds = new Set(potentialBridges.flatMap((bridge) => bridge.pathEdgeIds));
  const exploreById = selectExploreNodes(graph, coreIds, communities, potentialPathIds);
  const visibleIds = new Set([...coreIds, ...exploreById.keys(), ...potentialPathIds]);
  const visibleGraphEdges = graph.edges.filter((edge) => {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return false;
    if (!potentialPathIds.has(edge.source) && !potentialPathIds.has(edge.target)) return true;
    return potentialEdgeIds.has(edge.id);
  });
  const normalNodeIds = Array.from(visibleIds).filter((id) => !potentialPathIds.has(id)).sort();
  const potentialNodeIds = Array.from(potentialPathIds).sort();
  const personalLayout = buildPersonalForceLayout(
    normalNodeIds,
    potentialNodeIds,
    visibleGraphEdges,
    communities,
    potentialBridges
  );

  const islands: PersonalKnowledgeIsland[] = [];
  const duplicateTitles = new Map<string, number>();
  const domainCommunityCounts = new Map<string, number>();
  personalLayout.communityLayouts.forEach((communityLayout) => {
    const domainId = dominantDomainId(communityLayout.nodeIds, graph);
    if (domainId) domainCommunityCounts.set(domainId, (domainCommunityCounts.get(domainId) ?? 0) + 1);
  });
  personalLayout.communityLayouts.forEach((communityLayout) => {
    const domainId = dominantDomainId(communityLayout.nodeIds, graph);
    const qualifyWithCluster = Boolean(domainId && (domainCommunityCounts.get(domainId) ?? 0) > 1);
    const base = makeIslandTitle(communityLayout.nodeIds, graph, 1, qualifyWithCluster);
    const duplicateIndex = (duplicateTitles.get(base.title) ?? 0) + 1;
    duplicateTitles.set(base.title, duplicateIndex);
    const titled = makeIslandTitle(communityLayout.nodeIds, graph, duplicateIndex, qualifyWithCluster);
    islands.push({
      id: communityLayout.id,
      nodeIds: communityLayout.nodeIds,
      domainIds: titled.domainIds,
      title: titled.title,
      size: communityLayout.nodeIds.length,
      learningCount: communityLayout.nodeIds.filter((id) => recordById.get(id)?.status === "learning").length,
      bounds: communityLayout.bounds,
      contourPath: communityLayout.path,
      label: communityLayout.label
    });
  });

  const nodes: PersonalKnowledgeNode[] = Array.from(visibleIds).flatMap((id) => {
    const source = nodeById.get(id);
    const position = personalLayout.positions[id];
    if (!source || !position) return [];
    const record = recordById.get(id);
    const course = curriculumById.get(id);
    const lesson = course ? lessonById.get(course.lessonId) : undefined;
    const incident = visibleGraphEdges.filter((edge) => edge.source === id || edge.target === id);
    const completedEvidence = practices.filter((practice) => {
      const knowledgeId = practiceCoverage.find((item) => item.practiceId === practice.id)?.nodeId ?? practiceFallbackKnowledge[practice.id];
      return knowledgeId === id && progress.completedPracticeIds.includes(practice.id);
    });
    return [{
      id,
      title: source.title,
      description: source.description,
      scope: source.scope,
      domainId: source.domainId ?? "personal",
      domainTitle: domainById.get(source.domainId ?? "")?.title ?? (source.scope === "user" ? "个人知识" : source.domainId ?? "Knowledge"),
      domainColor: domainById.get(source.domainId ?? "")?.color ?? (source.scope === "user" ? "#f2a65a" : "#78a7ee"),
      clusterId: source.clusterId,
      clusterTitle: clusterById.get(source.clusterId ?? "")?.title ?? domainById.get(source.domainId ?? "")?.title ?? (source.scope === "user" ? "个人知识" : source.domainId ?? "Knowledge"),
      islandId: potentialPathIds.has(id) ? null : personalLayout.communityByNode.get(id) ?? null,
      status: record?.status ?? "explore",
      progress: record?.mastery ?? 0,
      x: position.x,
      y: position.y,
      isCore: Boolean(record),
      isPotentialBridge: potentialPathIds.has(id),
      courseId: course ? COURSE_ID : undefined,
      lesson: lesson?.order,
      materialId: lesson?.id === "L04" ? "lesson-04" : undefined,
      practiceId: practiceByNode.get(id),
      practiceTitle: practices.find((practice) => practice.id === practiceByNode.get(id))?.title,
      prerequisiteIds: incident.filter((edge) => edge.relation === "prerequisite" && edge.target === id).map((edge) => edge.source),
      nextIds: incident.filter((edge) => edge.relation === "prerequisite" && edge.source === id).map((edge) => edge.target),
      evidence: [
        ...(record?.evidence?.map((evidence) => evidence.label) ?? []),
        ...completedEvidence.map((practice) => `已完成实训 · ${practice.title}`)
      ]
    }];
  });
  const personalNodeById = new Map(nodes.map((node) => [node.id, node]));
  const personalEdges: PersonalKnowledgeEdge[] = visibleGraphEdges.map((edge) => {
    const source = personalNodeById.get(edge.source);
    const target = personalNodeById.get(edge.target);
    const isPotential = potentialPathIds.has(edge.source) || potentialPathIds.has(edge.target);
    const isCrossIsland = Boolean(source?.islandId && target?.islandId && source.islandId !== target.islandId);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      effective: coreIds.has(edge.source) && coreIds.has(edge.target),
      isPotential,
      isCrossIsland,
      kind: isPotential ? "potential" : isCrossIsland ? "cross" : "dependency"
    };
  });
  const practiceEvidence = makePracticeEvidence(practices, practiceCoverage, nodes, progress);
  const largestIsland = [...islands].sort((left, right) => right.size - left.size || left.id.localeCompare(right.id))[0];
  const currentLearningId = [...userKnowledge]
    .filter((record) => record.status === "learning")
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))[0]?.nodeId ?? null;
  const exploreTargetId = nodes.find((node) => node.status === "explore" && !node.isPotentialBridge)?.id ?? null;

  return {
    nodes,
    edges: personalEdges,
    practices: practiceEvidence,
    islands,
    potentialBridges: potentialBridges.map((bridge) => ({
      nodeId: bridge.nodeId,
      title: nodeById.get(bridge.nodeId)?.title ?? bridge.nodeId,
      pathNodeIds: bridge.pathNodeIds,
      missingNodeIds: bridge.missingNodeIds,
      description: `完成 ${bridge.missingNodeIds.map((id) => nodeById.get(id)?.title ?? id).join("、")}，可以在当前知识岛之间形成新的有效连接。`
    })),
    summary: {
      mastered: userKnowledge.filter((record) => record.status === "mastered").length,
      learning: userKnowledge.filter((record) => record.status === "learning").length,
      verifiedPractices: practiceEvidence.filter((practice) => practice.completed).length,
      projects: 0,
      islandCount: islands.length,
      largestIslandName: largestIsland?.title ?? "—",
      largestIslandSize: largestIsland?.size ?? 0,
      crossDomainConnections: calculateCrossDomainConnections(graph, coreIds, effectiveEdges),
      crossIslandConnections: personalEdges.filter((edge) => edge.effective && edge.isCrossIsland).length,
      connectivity: calculateKnowledgeConnectivity(coreIds, effectiveEdges),
      dependencyConnections: effectiveEdges.length,
      practiceConnections: practiceEvidence.filter((practice) => practice.completed).length,
      projectConnections: 0,
      potentialBridgeCount: potentialBridges.length,
      currentLearningId,
      exploreTargetId
    }
  };
}
