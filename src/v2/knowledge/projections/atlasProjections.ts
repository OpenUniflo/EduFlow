import { curriculumCoverages } from "../../data";
import type { PersonalKnowledgeGraph, PersonalKnowledgeNode } from "../../profile/types";
import { globalKnowledgeGraph } from "../graph";
import { UNCLASSIFIED_DOMAIN_COLOR } from "../domain/domainColors";
import { getDomainGovernanceSnapshot, resolveNodeDomain, type DomainGovernanceState } from "../domain/domainStore";
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
  knowledge?: KnowledgeNode;
  source?: PersonalKnowledgeNode;
  courseId?: string;
  domainId?: string;
  visualImportance: number;
};

export type AtlasSceneEdge = Pick<KnowledgeEdge, "id" | "source" | "target" | "relation" | "strength">;

export type AtlasSceneProjection = {
  nodes: AtlasSceneNode[];
  edges: AtlasSceneEdge[];
};

const FEATURED_GLOBAL_IDS = new Set(["PY01", "PY06", "PY18", "PY46", "PY57", "PY58", "PY62", "PY49", "PY50", "PY76", "T11", "RT01"]);

function importanceByNodeId(nodeIds: Set<string>, edges: AtlasSceneEdge[]) {
  const scores = new Map(Array.from(nodeIds, (id) => [id, 0]));
  edges.forEach((edge) => {
    const weight = edge.relation === "related" ? 0.45 : edge.relation === "enables" ? 0.8 : edge.strength === "hard" ? 1 : 0.75;
    scores.set(edge.source, (scores.get(edge.source) ?? 0) + weight);
    scores.set(edge.target, (scores.get(edge.target) ?? 0) + weight);
  });
  const values = [...scores.values()];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return new Map([...scores].map(([id, value]) => [id, max === min ? 0.5 : (value - min) / (max - min)]));
}

export function buildGlobalAtlasProjection(governance: DomainGovernanceState = getDomainGovernanceSnapshot()): AtlasSceneProjection {
  const activeIds = new Set(globalKnowledgeGraph.nodes.filter((node) => node.scope === "global" && node.status === "active").map((node) => node.id));
  const curriculumIds = new Set(curriculumCoverages.map((coverage) => coverage.nodeId));
  const edges = globalKnowledgeGraph.edges.filter((edge) => activeIds.has(edge.source) && activeIds.has(edge.target)).map((edge) => ({ ...edge }));
  const importance = importanceByNodeId(activeIds, edges);
  return {
    nodes: globalKnowledgeGraph.nodes
      .filter((node) => activeIds.has(node.id))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) => {
        const { domain } = resolveNodeDomain(node.id, governance);
        return {
          id: node.id,
          title: node.title,
          description: node.description,
          color: domain?.canonicalColor ?? UNCLASSIFIED_DOMAIN_COLOR,
          domainTitle: domain?.name ?? "未分类",
          domainId: domain?.id,
          status: "global" as const,
          isCore: true,
          progress: 0,
          featured: FEATURED_GLOBAL_IDS.has(node.id),
          visualImportance: importance.get(node.id) ?? 0,
          knowledge: node,
          courseId: curriculumIds.has(node.id) ? "agentic-ai" : undefined
        };
      }),
    edges
  };
}

export function buildPersonalAtlasProjection(graph: PersonalKnowledgeGraph, governance: DomainGovernanceState = getDomainGovernanceSnapshot()): AtlasSceneProjection {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const importance = importanceByNodeId(nodeIds, graph.edges);
  return {
    nodes: graph.nodes.map((node) => {
      const { domain } = resolveNodeDomain(node.id, governance);
      return {
        id: node.id,
        title: node.title,
        description: node.description,
        color: domain?.canonicalColor ?? UNCLASSIFIED_DOMAIN_COLOR,
        domainTitle: domain?.name ?? "未分类",
        domainId: domain?.id,
        status: node.status,
        isCore: node.isCore,
        progress: node.progress,
        visualImportance: importance.get(node.id) ?? 0,
        source: node
      };
    }),
    edges: graph.edges.map((edge) => ({ ...edge }))
  };
}
