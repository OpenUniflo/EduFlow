import type { LearningProgress, CourseStage, KnowledgeNode, Practice } from "../types";
import type {
  PersonalKnowledgeEdge,
  PersonalKnowledgeGraph,
  PersonalKnowledgeNode,
  PersonalKnowledgeStage,
  PersonalKnowledgeStatus,
  PersonalPracticeEvidence
} from "./types";

type CourseEdge = { source: string; target: string };

const practiceFallbackKnowledge: Record<string, string> = {
  "lesson-04-direct": "A05",
  "lesson-04-react": "R02",
  "lesson-04-plan": "R05",
  "lesson-04-replan": "R05",
  "lesson-04-evaluator": "R05"
};

function statusFor(node: KnowledgeNode): PersonalKnowledgeStatus {
  if (node.status === "completed") return "mastered";
  if (node.status === "learning") return "learning";
  if (node.status === "available") return "explore";
  return "gap";
}

function nodeProgress(node: KnowledgeNode, completedPracticeCount: number, practiceCount: number) {
  if (node.status === "completed") return 100;
  if (node.status === "learning") {
    const practiceProgress = practiceCount ? Math.round((completedPracticeCount / practiceCount) * 100) : 0;
    return node.lesson === 4 ? Math.max(58, practiceProgress) : 55;
  }
  return 0;
}

function connectedComponents(ids: string[], edges: CourseEdge[]) {
  const allowed = new Set(ids);
  const adjacency = new Map(ids.map((id) => [id, new Set<string>()]));
  edges.forEach((edge) => {
    if (!allowed.has(edge.source) || !allowed.has(edge.target)) return;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });

  const visited = new Set<string>();
  const components: string[][] = [];
  ids.forEach((id) => {
    if (visited.has(id)) return;
    const component: string[] = [];
    const queue = [id];
    visited.add(id);
    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      component.push(current);
      adjacency.get(current)?.forEach((neighbor) => {
        if (visited.has(neighbor)) return;
        visited.add(neighbor);
        queue.push(neighbor);
      });
    }
    components.push(component);
  });
  return components;
}

function makeStages(nodes: PersonalKnowledgeNode[], stages: CourseStage[]): PersonalKnowledgeStage[] {
  return stages.flatMap((stage) => {
    const items = nodes.filter((node) => node.stageId === stage.id);
    if (!items.length) return [];
    const minX = Math.min(...items.map((node) => node.x));
    const maxX = Math.max(...items.map((node) => node.x));
    const minY = Math.min(...items.map((node) => node.y));
    const maxY = Math.max(...items.map((node) => node.y));
    return [{
      id: stage.id,
      title: stage.title,
      x: minX - 64,
      y: minY - 70,
      width: maxX - minX + 128,
      height: maxY - minY + 140,
      nodeCount: items.length
    }];
  });
}

function makePracticeEvidence(
  practices: Practice[],
  nodes: PersonalKnowledgeNode[],
  progress: LearningProgress
): PersonalPracticeEvidence[] {
  const nodeByPractice = new Map(nodes.filter((node) => node.practiceId).map((node) => [node.practiceId as string, node.id]));
  const grouped = new Map<string, Practice[]>();
  practices.forEach((practice) => {
    const knowledgeId = nodeByPractice.get(practice.id) ?? practiceFallbackKnowledge[practice.id];
    if (!knowledgeId || !nodes.some((node) => node.id === knowledgeId)) return;
    grouped.set(knowledgeId, [...(grouped.get(knowledgeId) ?? []), practice]);
  });

  return Array.from(grouped.entries()).flatMap(([knowledgeId, items]) => {
    const node = nodes.find((entry) => entry.id === knowledgeId);
    if (!node) return [];
    return items.map((practice, index) => {
      const centeredIndex = index - (items.length - 1) / 2;
      const placeAbove = node.y < 350;
      return {
        id: practice.id,
        title: practice.title,
        knowledgeId,
        templateId: practice.templateId,
        completed: progress.completedPracticeIds.includes(practice.id),
        x: node.x + centeredIndex * 78,
        y: node.y + (placeAbove ? -86 : 92)
      };
    });
  });
}

export function buildPersonalKnowledgeGraph(
  knowledgeNodes: KnowledgeNode[],
  courseEdges: CourseEdge[],
  practices: Practice[],
  courseStages: CourseStage[],
  progress: LearningProgress
): PersonalKnowledgeGraph {
  const coreIds = new Set(knowledgeNodes.filter((node) => node.status === "completed" || node.status === "learning").map((node) => node.id));
  const oneHopIds = new Set<string>();
  courseEdges.forEach((edge) => {
    if (coreIds.has(edge.source)) oneHopIds.add(edge.target);
    if (coreIds.has(edge.target)) oneHopIds.add(edge.source);
  });

  const visibleSourceNodes = knowledgeNodes.filter((node) =>
    coreIds.has(node.id) || (oneHopIds.has(node.id) && node.status === "available")
  );
  const visibleIds = new Set(visibleSourceNodes.map((node) => node.id));
  const visibleCourseEdges = courseEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));

  const minX = Math.min(...visibleSourceNodes.map((node) => node.x));
  const minY = Math.min(...visibleSourceNodes.map((node) => node.y));
  const xScale = 0.5;
  const yScale = 1.25;
  const completedPracticeCount = progress.completedPracticeIds.filter((id) => practices.some((practice) => practice.id === id)).length;
  const stageById = new Map(courseStages.map((stage) => [stage.id, stage]));

  const nodes: PersonalKnowledgeNode[] = visibleSourceNodes.map((node) => {
    const relatedPracticeIds = practices
      .filter((practice) => (node.practiceId && practice.id === node.practiceId) || practiceFallbackKnowledge[practice.id] === node.id)
      .map((practice) => practice.id);
    const completedEvidence = practices.filter((practice) =>
      relatedPracticeIds.includes(practice.id) && progress.completedPracticeIds.includes(practice.id)
    );
    const prerequisiteIds = visibleCourseEdges.filter((edge) => edge.target === node.id).map((edge) => edge.source);
    const nextIds = visibleCourseEdges.filter((edge) => edge.source === node.id).map((edge) => edge.target);
    const stage = stageById.get(node.stageId);
    return {
      id: node.id,
      title: node.title,
      description: node.description,
      status: statusFor(node),
      progress: nodeProgress(node, completedPracticeCount, practices.length),
      lesson: node.lesson,
      stageId: node.stageId,
      stageTitle: stage?.title ?? "Agentic AI",
      x: 500 + (node.x - minX) * xScale,
      y: 260 + (node.y - minY) * yScale,
      isCore: coreIds.has(node.id),
      materialId: node.materialIds[0],
      practiceId: node.practiceId,
      practiceTitle: node.practiceTitle,
      prerequisiteIds,
      nextIds,
      evidence: [
        `Agentic AI · 第 ${node.lesson} 课`,
        ...completedEvidence.map((practice) => `已完成实训 · ${practice.title}`)
      ]
    };
  });

  const edges: PersonalKnowledgeEdge[] = visibleCourseEdges.map((edge) => ({ ...edge, kind: "dependency" }));
  const practiceEvidence = makePracticeEvidence(practices, nodes, progress);
  const coreIdList = Array.from(coreIds).filter((id) => visibleIds.has(id));
  const components = connectedComponents(coreIdList, visibleCourseEdges);
  const structuredIds = new Set(components.filter((component) => component.length > 1).flat());
  const largestIsland = components.sort((left, right) => right.length - left.length)[0] ?? [];
  const currentLearningId = nodes.find((node) => node.status === "learning")?.id ?? null;
  const exploreTargetId = nodes.find((node) => node.status === "explore")?.id ?? null;

  return {
    nodes,
    edges,
    practices: practiceEvidence,
    stages: makeStages(nodes, courseStages),
    summary: {
      mastered: nodes.filter((node) => node.status === "mastered").length,
      learning: nodes.filter((node) => node.status === "learning").length,
      verifiedPractices: practiceEvidence.filter((practice) => practice.completed).length,
      projects: 0,
      islandCount: components.length,
      largestIslandName: "Agentic AI",
      largestIslandSize: largestIsland.length,
      crossDomainConnections: 0,
      connectivity: coreIdList.length ? Math.round((structuredIds.size / coreIdList.length) * 100) : 0,
      dependencyConnections: visibleCourseEdges.length,
      practiceConnections: practiceEvidence.filter((practice) => practice.completed).length,
      projectConnections: 0,
      currentLearningId,
      exploreTargetId
    }
  };
}
