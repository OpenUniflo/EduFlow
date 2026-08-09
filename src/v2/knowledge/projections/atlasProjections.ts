import type { CourseRuntimeData } from "../../course/runtime/courseRuntime";
import type { CurriculumCoverage } from "../../types";
import type { PersonalKnowledgeGraph, PersonalKnowledgeNode } from "../../profile/types";
import { UNCLASSIFIED_DOMAIN_COLOR } from "../domain/domainColors";
import { resolveNodeDomain, type DomainGovernanceState } from "../domain/domainStore";
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from "../types";

export type AtlasNodeStatus = "global" | "mastered" | "learning" | "explore";

export type AtlasCourseContext = {
  courseId: string;
  courseTitle: string;
  coverageRoles: CurriculumCoverage["role"][];
};

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
  courseContexts: AtlasCourseContext[];
  domainId?: string;
  visualImportance: number;
};

export type AtlasSceneEdge = Pick<KnowledgeEdge, "id" | "source" | "target" | "relation" | "strength">;

export type AtlasSceneProjection = {
  nodes: AtlasSceneNode[];
  edges: AtlasSceneEdge[];
};

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

function courseContextsByNode(runtimes: CourseRuntimeData[]) {
  const contexts = new Map<string, AtlasCourseContext[]>();
  runtimes.forEach((runtime) => {
    const rolesByNode = new Map<string, CurriculumCoverage["role"][]>();
    runtime.curriculumCoverages.forEach((coverage) => rolesByNode.set(coverage.nodeId, [...(rolesByNode.get(coverage.nodeId) ?? []), coverage.role]));
    rolesByNode.forEach((roles, nodeId) => contexts.set(nodeId, [...(contexts.get(nodeId) ?? []), { courseId: runtime.course.id, courseTitle: runtime.course.title, coverageRoles: Array.from(new Set(roles)) }]));
  });
  return contexts;
}

export function buildGlobalAtlasProjection(graph: KnowledgeGraph, governance: DomainGovernanceState, runtimes: CourseRuntimeData[]): AtlasSceneProjection {
  const activeIds = new Set(graph.nodes.filter((node) => node.scope === "global" && node.status === "active").map((node) => node.id));
  const contextsByNode = courseContextsByNode(runtimes);
  const edges = graph.edges.filter((edge) => activeIds.has(edge.source) && activeIds.has(edge.target)).map((edge) => ({ ...edge }));
  const importance = importanceByNodeId(activeIds, edges);
  return {
    nodes: graph.nodes
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
          featured: node.metadata?.featured === true || (importance.get(node.id) ?? 0) >= 0.72,
          visualImportance: importance.get(node.id) ?? 0,
          knowledge: node,
          courseContexts: contextsByNode.get(node.id) ?? []
        };
      }),
    edges
  };
}

export function buildPersonalAtlasProjection(graph: PersonalKnowledgeGraph, governance: DomainGovernanceState, runtimes: CourseRuntimeData[]): AtlasSceneProjection {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const importance = importanceByNodeId(nodeIds, graph.edges);
  const titleByCourse = new Map(runtimes.map((runtime) => [runtime.course.id, runtime.course.title]));
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
        source: node,
        courseContexts: Array.from(new Set(node.curriculumContexts.map((context) => context.courseId))).map((courseId) => ({
          courseId,
          courseTitle: titleByCourse.get(courseId) ?? courseId,
          coverageRoles: Array.from(new Set(node.curriculumContexts.filter((context) => context.courseId === courseId).map((context) => context.role)))
        }))
      };
    }),
    edges: graph.edges.map((edge) => ({ ...edge }))
  };
}
