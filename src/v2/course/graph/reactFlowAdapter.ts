import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { CourseLayout, CourseLayoutEdge, CourseLayoutNode } from "./elkCourseLayout";

export type CourseFlowNodeData = CourseLayoutNode & { mode: "knowledge" | "practice"; selected: boolean; searchMatch: boolean; onChapterDoubleClick?: (chapter: NonNullable<CourseLayoutNode["chapter"]>) => void } & Record<string, unknown>;
export type CourseFlowEdgeData = CourseLayoutEdge & { highlighted: boolean } & Record<string, unknown>;

export function toReactFlow(layout: CourseLayout, mode: "knowledge" | "practice", selectedId: string | null, searchMatchId: string | null) {
  const nodes: Array<Node<CourseFlowNodeData>> = layout.nodes.map((node) => ({
    id: node.id,
    type: node.kind === "chapter" ? "chapter" : "knowledge",
    parentId: node.parentId,
    extent: node.parentId ? "parent" : undefined,
    expandParent: false,
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    draggable: false,
    selectable: true,
    zIndex: node.kind === "chapter" ? (node.expanded ? -1 : 1) : 2,
    data: { ...node, mode, selected: selectedId === node.id, searchMatch: searchMatchId === node.id },
    style: { width: node.width, height: node.height }
  }));
  const edges: Array<Edge<CourseFlowEdgeData>> = layout.edges.filter((edge) => edge.path).map((edge) => {
    const highlighted = selectedId === edge.source || selectedId === edge.target;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "course",
      data: { ...edge, highlighted },
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: highlighted ? "#6078db" : edge.sourceKind === "curriculum-sequence" ? "#aeb9c7" : "#8493aa" },
      selectable: false,
      focusable: false,
      zIndex: 0
    };
  });
  return { nodes, edges };
}
