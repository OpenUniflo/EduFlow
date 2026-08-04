import type { LearningProgress, CourseKnowledgeReference, Practice } from "../types";
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeRelation } from "../knowledge/types";
import {
  calculateCrossDomainConnections,
  calculateKnowledgeConnectivity,
  findConnectedComponents,
  findPotentialBridges
} from "../knowledge/graphAlgorithms";
import type {
  PersonalKnowledgeCluster,
  PersonalKnowledgeEdge,
  PersonalKnowledgeGraph,
  PersonalKnowledgeIsland,
  PersonalKnowledgeNode,
  PersonalPracticeEvidence,
  UserKnowledgeRecord
} from "./types";

const COURSE_ID = "agentic-ai";
const ISLAND_WIDTH = 540;
const ISLAND_HEIGHT = 620;
const ISLAND_GAP = 170;
const WORLD_MARGIN = 70;

const practiceFallbackKnowledge: Record<string, string> = {
  "lesson-04-direct": "A05",
  "lesson-04-react": "R02",
  "lesson-04-plan": "R05",
  "lesson-04-replan": "R05",
  "lesson-04-evaluator": "R05"
};

const relationPriority: Record<KnowledgeRelation, number> = {
  prerequisite: 5,
  "implementation-support": 4,
  "practice-support": 3,
  conceptual: 2,
  related: 1
};

function getIncidentEdges(id: string, edges: KnowledgeEdge[]) {
  return edges.filter((edge) => edge.source === id || edge.target === id);
}

function getOtherEnd(id: string, edge: KnowledgeEdge) {
  return edge.source === id ? edge.target : edge.source;
}

function makeIslandTitle(component: string[], graph: KnowledgeGraph, duplicateIndex: number) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const domainById = new Map(graph.domains.map((domain) => [domain.id, domain]));
  const counts = new Map<string, number>();
  component.forEach((id) => {
    const domainId = nodeById.get(id)?.domainId;
    if (domainId) counts.set(domainId, (counts.get(domainId) ?? 0) + 1);
  });
  const domainIds = Array.from(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([id]) => id);
  const title = domainIds.slice(0, 2).map((id) => domainById.get(id)?.title ?? id).join(" × ") || "Knowledge Island";
  return { domainIds, title: duplicateIndex > 1 ? `${title} ${duplicateIndex}` : title };
}

function selectExploreNodes(
  graph: KnowledgeGraph,
  coreIds: Set<string>,
  components: string[][],
  excludedIds: Set<string>
) {
  const componentByCore = new Map<string, number>();
  components.forEach((component, index) => component.forEach((id) => componentByCore.set(id, index)));
  const candidateScores = new Map<string, { componentIndex: number; coreNeighbors: number; relationScore: number; strength: number }>();

  graph.nodes.forEach((node) => {
    if (coreIds.has(node.id) || excludedIds.has(node.id)) return;
    const incident = getIncidentEdges(node.id, graph.edges).filter((edge) => coreIds.has(getOtherEnd(node.id, edge)));
    if (!incident.length) return;
    const componentCounts = new Map<number, number>();
    incident.forEach((edge) => {
      const componentIndex = componentByCore.get(getOtherEnd(node.id, edge));
      if (componentIndex !== undefined) componentCounts.set(componentIndex, (componentCounts.get(componentIndex) ?? 0) + 1);
    });
    const rankedComponents = Array.from(componentCounts).sort((left, right) => right[1] - left[1] || left[0] - right[0]);
    if (!rankedComponents.length) return;
    candidateScores.set(node.id, {
      componentIndex: rankedComponents[0][0],
      coreNeighbors: incident.length,
      relationScore: Math.max(...incident.map((edge) => relationPriority[edge.relation])),
      strength: Math.max(...incident.map((edge) => edge.strength ?? 0))
    });
  });

  const selected = new Map<string, number>();
  components.forEach((_, componentIndex) => {
    Array.from(candidateScores)
      .filter(([, score]) => score.componentIndex === componentIndex)
      .sort((left, right) =>
        right[1].coreNeighbors - left[1].coreNeighbors ||
        right[1].relationScore - left[1].relationScore ||
        right[1].strength - left[1].strength ||
        left[0].localeCompare(right[0])
      )
      .slice(0, 3)
      .forEach(([id]) => selected.set(id, componentIndex));
  });
  return selected;
}

function layoutComponents(components: string[][], exploreById: Map<string, number>, graph: KnowledgeGraph) {
  const positions = new Map<string, { x: number; y: number; islandId: string | null }>();
  const bounds = new Map<string, PersonalKnowledgeIsland["bounds"]>();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  components.forEach((component, componentIndex) => {
    const islandId = `personal-island-${componentIndex + 1}`;
    const x = WORLD_MARGIN + componentIndex * (ISLAND_WIDTH + ISLAND_GAP);
    const y = 135;
    bounds.set(islandId, { x, y, width: ISLAND_WIDTH, height: ISLAND_HEIGHT });
    const columns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(component.length))));
    const rows = Math.ceil(component.length / columns);
    const xStep = (ISLAND_WIDTH - 150) / Math.max(1, columns - 1);
    const yStep = Math.min(125, (ISLAND_HEIGHT - 230) / Math.max(1, rows - 1));
    const layoutOrder = [...component].sort((left, right) =>
      (nodeById.get(left)?.clusterId ?? "").localeCompare(nodeById.get(right)?.clusterId ?? "") || left.localeCompare(right)
    );
    layoutOrder.forEach((id, index) => {
      positions.set(id, {
        x: x + 75 + (index % columns) * xStep,
        y: y + 105 + Math.floor(index / columns) * yStep,
        islandId
      });
    });
    const exploreIds = Array.from(exploreById).filter(([, owner]) => owner === componentIndex).map(([id]) => id);
    exploreIds.forEach((id, index) => {
      positions.set(id, { x: x + 110 + index * 145, y: y + ISLAND_HEIGHT - 62, islandId });
    });
  });
  return { positions, bounds };
}

function layoutPotentialNodes(ids: string[], positions: Map<string, { x: number; y: number; islandId: string | null }>, componentCount: number) {
  const firstGapX = WORLD_MARGIN + ISLAND_WIDTH + ISLAND_GAP / 2;
  ids.forEach((id, index) => {
    if (positions.has(id)) return;
    positions.set(id, {
      x: componentCount > 1 ? firstGapX + ((index % 2) * 56 - 28) : WORLD_MARGIN + ISLAND_WIDTH + 100,
      y: 235 + index * 78,
      islandId: null
    });
  });
}

function makeClusters(nodes: PersonalKnowledgeNode[], graph: KnowledgeGraph): PersonalKnowledgeCluster[] {
  const clusterById = new Map(graph.clusters.map((cluster) => [cluster.id, cluster]));
  const grouped = new Map<string, PersonalKnowledgeNode[]>();
  nodes.filter((node) => node.islandId && !node.isPotentialBridge).forEach((node) => {
    const key = `${node.islandId}:${node.clusterId ?? node.domainId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), node]);
  });
  return Array.from(grouped.entries()).map(([id, items]) => {
    const minX = Math.min(...items.map((node) => node.x));
    const maxX = Math.max(...items.map((node) => node.x));
    const minY = Math.min(...items.map((node) => node.y));
    const maxY = Math.max(...items.map((node) => node.y));
    return {
      id,
      title: clusterById.get(items[0].clusterId ?? "")?.title ?? items[0].domainTitle,
      islandId: items[0].islandId as string,
      x: minX - 48,
      y: minY - 58,
      width: maxX - minX + 96,
      height: maxY - minY + 116,
      nodeCount: items.length
    };
  });
}

function makePracticeEvidence(
  practices: Practice[],
  nodes: PersonalKnowledgeNode[],
  progress: LearningProgress
): PersonalPracticeEvidence[] {
  const nodeByPractice = new Map(nodes.filter((node) => node.practiceId).map((node) => [node.practiceId as string, node.id]));
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
  curriculum: CourseKnowledgeReference[],
  progress: LearningProgress
): PersonalKnowledgeGraph {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const domainById = new Map(graph.domains.map((domain) => [domain.id, domain]));
  const clusterById = new Map(graph.clusters.map((cluster) => [cluster.id, cluster]));
  const recordById = new Map(userKnowledge.map((record) => [record.nodeId, record]));
  const curriculumById = new Map(curriculum.map((reference) => [reference.nodeId, reference]));
  const coreIds = new Set(userKnowledge.map((record) => record.nodeId));
  userKnowledge.forEach((record) => {
    if (!nodeById.has(record.nodeId)) throw new Error(`Unknown user knowledge node: ${record.nodeId}`);
  });

  const effectiveEdges = graph.edges.filter((edge) => coreIds.has(edge.source) && coreIds.has(edge.target));
  const components = findConnectedComponents(coreIds, effectiveEdges);
  const potentialBridges = findPotentialBridges(graph, components, coreIds, { maxDepth: 6, limit: 3 });
  const potentialPathIds = new Set(potentialBridges.flatMap((bridge) => bridge.missingNodeIds));
  const potentialEdgeIds = new Set(potentialBridges.flatMap((bridge) => bridge.pathEdgeIds));
  const exploreById = selectExploreNodes(graph, coreIds, components, potentialPathIds);
  const { positions, bounds } = layoutComponents(components, exploreById, graph);
  layoutPotentialNodes(Array.from(potentialPathIds), positions, components.length);

  const visibleIds = new Set([...coreIds, ...exploreById.keys(), ...potentialPathIds]);
  const visibleGraphEdges = graph.edges.filter((edge) => {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return false;
    if (!potentialPathIds.has(edge.source) && !potentialPathIds.has(edge.target)) return true;
    return potentialEdgeIds.has(edge.id);
  });
  const islands: PersonalKnowledgeIsland[] = [];
  const duplicateTitles = new Map<string, number>();
  components.forEach((component, index) => {
    const base = makeIslandTitle(component, graph, 1);
    const duplicateIndex = (duplicateTitles.get(base.title) ?? 0) + 1;
    duplicateTitles.set(base.title, duplicateIndex);
    const titled = makeIslandTitle(component, graph, duplicateIndex);
    const islandId = `personal-island-${index + 1}`;
    islands.push({
      id: islandId,
      nodeIds: component,
      domainIds: titled.domainIds,
      title: titled.title,
      size: component.length,
      learningCount: component.filter((id) => recordById.get(id)?.status === "learning").length,
      bounds: bounds.get(islandId) as PersonalKnowledgeIsland["bounds"]
    });
  });

  const nodes: PersonalKnowledgeNode[] = Array.from(visibleIds).flatMap((id) => {
    const source = nodeById.get(id);
    const position = positions.get(id);
    if (!source || !position) return [];
    const record = recordById.get(id);
    const course = curriculumById.get(id);
    const incident = visibleGraphEdges.filter((edge) => edge.source === id || edge.target === id);
    const completedEvidence = practices.filter((practice) => {
      const knowledgeId = practiceFallbackKnowledge[practice.id] ?? curriculum.find((item) => item.practiceId === practice.id)?.nodeId;
      return knowledgeId === id && progress.completedPracticeIds.includes(practice.id);
    });
    return [{
      id,
      title: source.title,
      description: source.description,
      domainId: source.domainId,
      domainTitle: domainById.get(source.domainId)?.title ?? source.domainId,
      clusterId: source.clusterId,
      clusterTitle: clusterById.get(source.clusterId ?? "")?.title ?? domainById.get(source.domainId)?.title ?? source.domainId,
      islandId: position.islandId,
      status: record?.status ?? "explore",
      progress: record?.mastery ?? 0,
      x: position.x,
      y: position.y,
      isCore: Boolean(record),
      isPotentialBridge: potentialPathIds.has(id),
      courseId: course ? COURSE_ID : undefined,
      lesson: course?.lesson,
      materialId: course?.materialIds[0],
      practiceId: course?.practiceId,
      practiceTitle: course?.practiceTitle,
      prerequisiteIds: incident.filter((edge) => edge.target === id).map((edge) => edge.source),
      nextIds: incident.filter((edge) => edge.source === id).map((edge) => edge.target),
      evidence: [
        ...(record?.evidence?.map((evidence) => evidence.label) ?? []),
        ...completedEvidence.map((practice) => `已完成实训 · ${practice.title}`)
      ]
    }];
  });

  const personalEdges: PersonalKnowledgeEdge[] = visibleGraphEdges.map((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    const isPotential = potentialPathIds.has(edge.source) || potentialPathIds.has(edge.target);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      effective: coreIds.has(edge.source) && coreIds.has(edge.target),
      isPotential,
      kind: isPotential ? "potential" : source?.domainId !== target?.domainId ? "cross" : "dependency"
    };
  });
  const practiceEvidence = makePracticeEvidence(practices, nodes, progress);
  const largestIsland = islands[0];
  const currentLearningId = [...userKnowledge]
    .filter((record) => record.status === "learning")
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))[0]?.nodeId ?? null;
  const exploreTargetId = nodes.find((node) => node.status === "explore" && !node.isPotentialBridge)?.id ?? null;

  return {
    nodes,
    edges: personalEdges,
    practices: practiceEvidence,
    clusters: makeClusters(nodes, graph),
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
