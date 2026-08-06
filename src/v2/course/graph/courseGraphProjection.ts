import { courseChapterEdges, courseChapters, courseSkillTreeEdges, courseSkillTreeNodes } from "../../data";
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
  view: CourseGraphView;
  focusedChapterId: string | null;
  nodes: CourseProjectionNode[];
  edges: CourseProjectionEdge[];
};

export function buildCourseGraphProjection(view: CourseGraphView, focusedChapterId: string | null): CourseGraphProjection {
  const expandedIds = new Set(view === "full" ? courseChapters.map((chapter) => chapter.id) : view === "focused" && focusedChapterId ? [focusedChapterId] : []);
  const nodes: CourseProjectionNode[] = courseChapters.map((chapter) => ({
    id: `chapter:${chapter.id}`,
    kind: "chapter",
    expanded: expandedIds.has(chapter.id),
    chapter,
    order: chapter.order
  }));
  courseSkillTreeNodes.forEach((knowledge) => {
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
  courseChapterEdges.forEach((edge) => edges.push({
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
    courseSkillTreeEdges
      .filter((edge) => edge.relation !== "related" && courseSkillTreeNodes.find((node) => node.id === edge.source)?.chapterId === focusedChapterId && courseSkillTreeNodes.find((node) => node.id === edge.target)?.chapterId === focusedChapterId)
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
    courseSkillTreeEdges
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

  return { view, focusedChapterId, nodes, edges };
}
