import { curriculumCoverages } from "../../data";
import type { PersonalKnowledgeGraph, PersonalKnowledgeNode } from "../../profile/types";
import { globalKnowledgeGraph } from "../graph";
import type { KnowledgeEdge, KnowledgeNode } from "../types";

export type AtlasNodeStatus = "global" | "mastered" | "learning" | "explore";

export type AtlasSceneNode = {
  id: string;
  title: string;
  description: string;
  color: string;
  domainTitle: string;
  status: AtlasNodeStatus;
  isCore: boolean;
  progress: number;
  featured?: boolean;
  currentLearning?: boolean;
  searchMatch?: boolean;
  knowledge?: KnowledgeNode;
  source?: PersonalKnowledgeNode;
  courseId?: string;
};

export type AtlasSceneEdge = Pick<KnowledgeEdge, "id" | "source" | "target" | "relation" | "strength">;

export type AtlasSceneProjection = {
  nodes: AtlasSceneNode[];
  edges: AtlasSceneEdge[];
};

const FEATURED_GLOBAL_IDS = new Set(["PY01", "PY06", "PY18", "PY46", "PY57", "PY58", "PY62", "PY49", "PY50", "PY76", "T11", "RT01"]);

export function buildGlobalAtlasProjection(): AtlasSceneProjection {
  const activeIds = new Set(globalKnowledgeGraph.nodes.filter((node) => node.scope === "global" && node.status === "active").map((node) => node.id));
  const domainById = new Map(globalKnowledgeGraph.domains.map((domain) => [domain.id, domain]));
  const curriculumIds = new Set(curriculumCoverages.map((coverage) => coverage.nodeId));
  return {
    nodes: globalKnowledgeGraph.nodes
      .filter((node) => activeIds.has(node.id))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) => {
        const domain = domainById.get(node.domainId ?? "");
        return {
          id: node.id,
          title: node.title,
          description: node.description,
          color: domain?.color ?? "#697ee6",
          domainTitle: domain?.title ?? node.domainId ?? "知识节点",
          status: "global" as const,
          isCore: true,
          progress: 0,
          featured: FEATURED_GLOBAL_IDS.has(node.id),
          knowledge: node,
          courseId: curriculumIds.has(node.id) ? "agentic-ai" : undefined
        };
      }),
    edges: globalKnowledgeGraph.edges
      .filter((edge) => activeIds.has(edge.source) && activeIds.has(edge.target))
      .map((edge) => ({ ...edge }))
  };
}

export function buildPersonalAtlasProjection(graph: PersonalKnowledgeGraph, searchMatchId?: string | null): AtlasSceneProjection {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      description: node.description,
      color: node.domainColor ?? "#78a7ee",
      domainTitle: node.domainTitle ?? node.domainId ?? "个人知识",
      status: node.status,
      isCore: node.isCore,
      progress: node.progress,
      currentLearning: node.id === graph.summary.currentLearningId,
      searchMatch: node.id === searchMatchId,
      source: node
    })),
    edges: graph.edges.map((edge) => ({ ...edge }))
  };
}
