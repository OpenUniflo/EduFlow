import type { CourseGraphData } from "../runtime/courseRuntime";
import type { CourseChapterEdge, CourseChapterProjection, CourseSkillTreeEdge, CourseSkillTreeNode } from "../../types";

export type CourseGraphView = "overview" | "focused" | "full";

export type CourseProjectionNode = {
  id: string;
  kind: "chapter" | "knowledge";
  parentId?: string;
  expanded?: boolean;
  chapter?: CourseChapterProjection;
  knowledge?: CourseSkillTreeNode;
  order: number;
};

export type CourseProjectionEdge = {
  id: string;
  source: string;
  target: string;
  kind: "chapter" | "knowledge";
  relation: "prerequisite" | "enables" | "related" | "sequence";
  sourceKind: "knowledge" | "curriculum-sequence";
  supportCount: number;
  strength?: "hard" | "soft" | number;
  sourceEdge: CourseChapterEdge | CourseSkillTreeEdge;
};

export type CourseGraphProjection = {
  courseId: string;
  revision: string;
  view: CourseGraphView;
  focusedChapterId: string | null;
  nodes: CourseProjectionNode[];
  edges: CourseProjectionEdge[];
};

export function buildCourseGraphProjection(graphData: CourseGraphData, view: CourseGraphView, focusedChapterId: string | null): CourseGraphProjection {
  const expandedIds = new Set(view === "full" ? graphData.chapters.map((chapter) => chapter.id) : view === "focused" && focusedChapterId ? [focusedChapterId] : []);
  const nodes: CourseProjectionNode[] = graphData.chapters.map((chapter) => ({
    id: `chapter:${chapter.id}`,
    kind: "chapter",
    expanded: expandedIds.has(chapter.id),
    chapter,
    order: chapter.order
  }));
  graphData.knowledgeNodes.forEach((knowledge) => {
    if (!expandedIds.has(knowledge.chapterId)) return;
    nodes.push({
      id: `knowledge:${knowledge.id}`,
      kind: "knowledge",
      parentId: `chapter:${knowledge.chapterId}`,
      knowledge,
      order: knowledge.lesson * 100 + knowledge.id.charCodeAt(0)
    });
  });

  const edges: CourseProjectionEdge[] = [];
  graphData.chapterEdges.forEach((edge) => edges.push({
      id: edge.id,
      source: `chapter:${edge.source}`,
      target: `chapter:${edge.target}`,
      kind: "chapter",
      relation: edge.primaryRelation,
      sourceKind: edge.sourceKind,
      supportCount: edge.supportCount,
      sourceEdge: edge
    }));

  if (view === "focused" && focusedChapterId) {
    graphData.knowledgeEdges
      .filter((edge) => edge.relation !== "related" && graphData.knowledgeNodes.find((node) => node.id === edge.source)?.chapterId === focusedChapterId && graphData.knowledgeNodes.find((node) => node.id === edge.target)?.chapterId === focusedChapterId)
      .forEach((edge) => edges.push({
        id: edge.id,
        source: `knowledge:${edge.source}`,
        target: `knowledge:${edge.target}`,
        kind: "knowledge",
        relation: edge.relation,
        sourceKind: "knowledge",
        supportCount: 1,
        strength: edge.strength,
        sourceEdge: edge
      }));
  }

  if (view === "full") {
    graphData.knowledgeEdges
      .filter((edge) => edge.relation !== "related")
      .forEach((edge) => edges.push({
        id: edge.id,
        source: `knowledge:${edge.source}`,
        target: `knowledge:${edge.target}`,
        kind: "knowledge",
        relation: edge.relation,
        sourceKind: "knowledge",
        supportCount: 1,
        strength: edge.strength,
        sourceEdge: edge
      }));
  }

  return { courseId: graphData.courseId, revision: graphData.revision, view, focusedChapterId, nodes, edges };
}
