import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { CourseSkillTreeEdge } from "../../types";
import type { CourseLayout, CourseLayoutEdge, CourseLayoutNode } from "./elkCourseLayout";

export type CourseFlowNodeData = CourseLayoutNode & {
  mode: "knowledge" | "assignment";
  selected: boolean;
  searchMatch: boolean;
  onChapterDoubleClick?: (chapter: NonNullable<CourseLayoutNode["chapter"]>) => void;
  onAssignmentClick?: (knowledge: NonNullable<CourseLayoutNode["knowledge"]>) => void;
} & Record<string, unknown>;

export type CourseFlowEdgeData = CourseLayoutEdge & { highlighted: boolean } & Record<string, unknown>;

export function toReactFlow(
  layout: CourseLayout,
  knowledgeEdges: CourseSkillTreeEdge[],
  mode: "knowledge" | "assignment",
  selectedId: string | null,
  searchMatchId: string | null,
  onChapterDoubleClick?: CourseFlowNodeData["onChapterDoubleClick"],
  onAssignmentClick?: CourseFlowNodeData["onAssignmentClick"]
) {
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
    data: {
      ...node,
      mode,
      selected: selectedId === node.id,
      searchMatch: searchMatchId === node.id,
      onChapterDoubleClick: node.kind === "chapter" ? onChapterDoubleClick : undefined,
      onAssignmentClick: node.kind === "knowledge" ? onAssignmentClick : undefined
    },
    style: { width: node.width, height: node.height }
  }));

  const visibleIds = new Set(nodes.map((node) => node.id));
  const relatedOverlays: CourseLayoutEdge[] = selectedId?.startsWith("knowledge:") ? knowledgeEdges
    .filter((edge) => edge.relation === "related")
    .filter((edge) => {
      const source = `knowledge:${edge.source}`;
      const target = `knowledge:${edge.target}`;
      return visibleIds.has(source) && visibleIds.has(target) && (source === selectedId || target === selectedId);
    })
    .map((edge) => ({
      id: `related-overlay:${edge.id}`,
      source: `knowledge:${edge.source}`,
      target: `knowledge:${edge.target}`,
      kind: "knowledge",
      relation: "related",
      sourceKind: "knowledge",
      supportCount: 1,
      strength: edge.strength,
      sourceEdge: edge,
      routing: "react-flow"
    })) : [];

  const edges: Array<Edge<CourseFlowEdgeData>> = [...layout.edges, ...relatedOverlays]
    .filter((edge) => edge.path || edge.routing === "react-flow")
    .map((edge) => {
      const highlighted = selectedId === edge.source || selectedId === edge.target;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "course",
        data: { ...edge, highlighted },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: highlighted ? "#6078db" : edge.sourceKind === "curriculum-sequence" ? "#aeb9c7" : "#8493aa"
        },
        selectable: false,
        focusable: false,
        zIndex: edge.relation === "related" ? 3 : 0
      };
    });
  return { nodes, edges };
}
