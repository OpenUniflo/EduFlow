import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode, ElkPoint } from "elkjs/lib/elk-api";
import type { CourseGraphProjection, CourseProjectionEdge, CourseProjectionNode } from "./courseGraphProjection";

export const COURSE_ATOMIC_WIDTH = 194;
export const COURSE_ATOMIC_HEIGHT = 108;
export const COURSE_CHAPTER_WIDTH = 232;
export const COURSE_CHAPTER_HEIGHT = 126;

export type CourseLayoutNode = CourseProjectionNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CourseLayoutEdge = CourseProjectionEdge & {
  path: string;
};

export type CourseLayout = {
  nodes: CourseLayoutNode[];
  edges: CourseLayoutEdge[];
  width: number;
  height: number;
};

const elk = new ELK();

function elkNode(node: CourseProjectionNode, children: CourseProjectionNode[]): ElkNode {
  const expanded = node.kind === "chapter" && node.expanded;
  return {
    id: node.id,
    ...(expanded ? {} : {
      width: node.kind === "chapter" ? COURSE_CHAPTER_WIDTH : COURSE_ATOMIC_WIDTH,
      height: node.kind === "chapter" ? COURSE_CHAPTER_HEIGHT : COURSE_ATOMIC_HEIGHT
    }),
    children: expanded ? children.map((child) => elkNode(child, [])) : undefined,
    layoutOptions: {
      "org.eclipse.elk.layered.layering.strategy": "NETWORK_SIMPLEX",
      "org.eclipse.elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "org.eclipse.elk.padding": expanded ? "[top=88,left=28,bottom=28,right=28]" : "[top=0,left=0,bottom=0,right=0]",
      "org.eclipse.elk.spacing.nodeNode": expanded ? "42" : "32"
    }
  };
}

function edgeToElk(edge: CourseProjectionEdge): ElkExtendedEdge {
  return {
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target]
  };
}

function pointsToPath(points: ElkPoint[]) {
  if (!points.length) return "";
  return points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
}

function sectionPath(edge: ElkExtendedEdge, offsetX = 0, offsetY = 0) {
  return (edge.sections ?? []).map((section) => pointsToPath([
    { x: section.startPoint.x + offsetX, y: section.startPoint.y + offsetY },
    ...(section.bendPoints ?? []).map((point) => ({ x: point.x + offsetX, y: point.y + offsetY })),
    { x: section.endPoint.x + offsetX, y: section.endPoint.y + offsetY }
  ])).join(" ");
}

const layeredOptions = {
  "org.eclipse.elk.algorithm": "layered",
  "org.eclipse.elk.direction": "RIGHT",
  "org.eclipse.elk.edgeRouting": "ORTHOGONAL",
  "org.eclipse.elk.layered.layering.strategy": "NETWORK_SIMPLEX",
  "org.eclipse.elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "org.eclipse.elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "org.eclipse.elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "org.eclipse.elk.spacing.nodeNode": "76",
  "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "130",
  "org.eclipse.elk.spacing.edgeNode": "34",
  "org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers": "42"
};

async function layoutFocusedGraph(projection: CourseGraphProjection): Promise<CourseLayout> {
  const expandedChapter = projection.nodes.find((node) => node.kind === "chapter" && node.expanded);
  if (!expandedChapter) throw new Error("Focused course projection has no expanded chapter");
  const atomicNodes = projection.nodes.filter((node) => node.parentId === expandedChapter.id).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const atomicEdges = projection.edges.filter((edge) => edge.kind === "knowledge");
  const internalGraph: ElkNode = {
    id: `${expandedChapter.id}:internal`,
    children: atomicNodes.map((node) => elkNode(node, [])),
    edges: atomicEdges.map(edgeToElk),
    layoutOptions: { ...layeredOptions, "org.eclipse.elk.padding": "[top=88,left=28,bottom=28,right=28]", "org.eclipse.elk.spacing.nodeNode": "42", "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "74" }
  };
  const internalResult = await elk.layout(internalGraph);
  const expandedWidth = Math.max(COURSE_CHAPTER_WIDTH, internalResult.width ?? COURSE_CHAPTER_WIDTH);
  const expandedHeight = Math.max(COURSE_CHAPTER_HEIGHT, internalResult.height ?? COURSE_CHAPTER_HEIGHT);
  const chapterNodes = projection.nodes.filter((node) => node.kind === "chapter").sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const chapterEdges = projection.edges.filter((edge) => edge.kind === "chapter");
  const macroGraph: ElkNode = {
    id: "course-root",
    children: chapterNodes.map((node) => ({ id: node.id, width: node.id === expandedChapter.id ? expandedWidth : COURSE_CHAPTER_WIDTH, height: node.id === expandedChapter.id ? expandedHeight : COURSE_CHAPTER_HEIGHT })),
    edges: chapterEdges.map(edgeToElk),
    layoutOptions: { ...layeredOptions, "org.eclipse.elk.padding": "[top=54,left=54,bottom=54,right=54]" }
  };
  const macroResult = await elk.layout(macroGraph);
  const macroById = new Map((macroResult.children ?? []).map((node) => [node.id, node]));
  const expandedMacro = macroById.get(expandedChapter.id);
  const nodes: CourseLayoutNode[] = chapterNodes.map((node) => {
    const result = macroById.get(node.id);
    return { ...node, x: result?.x ?? 0, y: result?.y ?? 0, width: result?.width ?? COURSE_CHAPTER_WIDTH, height: result?.height ?? COURSE_CHAPTER_HEIGHT };
  });
  (internalResult.children ?? []).forEach((child) => {
    const source = atomicNodes.find((node) => node.id === child.id);
    if (source) nodes.push({ ...source, x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? COURSE_ATOMIC_WIDTH, height: child.height ?? COURSE_ATOMIC_HEIGHT });
  });
  const macroPaths = new Map((macroResult.edges ?? []).map((edge) => [edge.id, sectionPath(edge)]));
  const internalPaths = new Map((internalResult.edges ?? []).map((edge) => [edge.id, sectionPath(edge, expandedMacro?.x ?? 0, expandedMacro?.y ?? 0)]));
  return {
    nodes,
    edges: projection.edges.map((edge) => ({ ...edge, path: edge.kind === "chapter" ? macroPaths.get(edge.id) ?? "" : internalPaths.get(edge.id) ?? "" })),
    width: macroResult.width ?? 1200,
    height: macroResult.height ?? 720
  };
}

async function layoutFullGraph(projection: CourseGraphProjection): Promise<CourseLayout> {
  const chapterNodes = projection.nodes.filter((node) => node.kind === "chapter").sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const knowledgeEdges = projection.edges.filter((edge) => edge.kind === "knowledge");
  const childrenByParent = new Map(chapterNodes.map((chapter) => [
    chapter.id,
    projection.nodes
      .filter((node) => node.parentId === chapter.id)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
  ]));
  const parentByKnowledgeId = new Map(
    projection.nodes
      .filter((node) => node.kind === "knowledge" && node.parentId)
      .map((node) => [node.id, node.parentId!])
  );
  const internalEdgesByChapter = new Map<string, CourseProjectionEdge[]>();
  const crossChapterEdges: CourseProjectionEdge[] = [];
  knowledgeEdges.forEach((edge) => {
    const sourceParent = parentByKnowledgeId.get(edge.source);
    const targetParent = parentByKnowledgeId.get(edge.target);
    if (sourceParent && sourceParent === targetParent) {
      internalEdgesByChapter.set(sourceParent, [...(internalEdgesByChapter.get(sourceParent) ?? []), edge]);
    } else {
      crossChapterEdges.push(edge);
    }
  });
  const graph: ElkNode = {
    id: "course-root",
    children: chapterNodes.map((chapter) => ({
      ...elkNode(chapter, childrenByParent.get(chapter.id) ?? []),
      edges: (internalEdgesByChapter.get(chapter.id) ?? []).map(edgeToElk)
    })),
    edges: crossChapterEdges.map(edgeToElk),
    layoutOptions: {
      ...layeredOptions,
      "org.eclipse.elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "org.eclipse.elk.padding": "[top=54,left=54,bottom=54,right=54]",
      "org.eclipse.elk.spacing.nodeNode": "96",
      "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "160"
    }
  };
  const result = await elk.layout(graph);
  const projectionById = new Map(projection.nodes.map((node) => [node.id, node]));
  const nodes: CourseLayoutNode[] = [];
  const edgePaths = new Map<string, string>();

  function collect(container: ElkNode, offsetX: number, offsetY: number) {
    (container.edges ?? []).forEach((edge) => edgePaths.set(edge.id, sectionPath(edge, offsetX, offsetY)));
    (container.children ?? []).forEach((child) => {
      const source = projectionById.get(child.id);
      const localX = child.x ?? 0;
      const localY = child.y ?? 0;
      if (source) nodes.push({ ...source, x: localX, y: localY, width: child.width ?? COURSE_ATOMIC_WIDTH, height: child.height ?? COURSE_ATOMIC_HEIGHT });
      collect(child, offsetX + localX, offsetY + localY);
    });
  }
  collect(result, 0, 0);

  return {
    nodes,
    edges: knowledgeEdges.map((edge) => ({ ...edge, path: edgePaths.get(edge.id) ?? "" })),
    width: result.width ?? 2400,
    height: result.height ?? 1600
  };
}

export async function layoutCourseGraph(projection: CourseGraphProjection): Promise<CourseLayout> {
  // ELK compound graphs cannot mix edges terminating on a parent with edges
  // terminating on that parent's children. Focused mode therefore uses two
  // ELK passes: one for the expanded chapter and one for the shared macro DAG.
  if (projection.view === "focused") return layoutFocusedGraph(projection);
  if (projection.view === "full") return layoutFullGraph(projection);
  const childrenByParent = new Map<string, CourseProjectionNode[]>();
  projection.nodes.filter((node) => node.parentId).forEach((node) => childrenByParent.set(node.parentId!, [...(childrenByParent.get(node.parentId!) ?? []), node]));
  childrenByParent.forEach((children) => children.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)));
  const rootNodes = projection.nodes.filter((node) => !node.parentId).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const graph: ElkNode = {
    id: "course-root",
    children: rootNodes.map((node) => elkNode(node, childrenByParent.get(node.id) ?? [])),
    edges: projection.edges.map(edgeToElk),
    layoutOptions: {
      ...layeredOptions,
      "org.eclipse.elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "org.eclipse.elk.padding": "[top=54,left=54,bottom=54,right=54]"
    }
  };
  const result = await elk.layout(graph);
  const projectionById = new Map(projection.nodes.map((node) => [node.id, node]));
  const nodes: CourseLayoutNode[] = [];
  const edgePaths = new Map<string, string>();

  function collect(container: ElkNode, offsetX: number, offsetY: number) {
    (container.edges ?? []).forEach((edge) => edgePaths.set(edge.id, sectionPath(edge, offsetX, offsetY)));
    (container.children ?? []).forEach((child) => {
      const source = projectionById.get(child.id);
      const localX = child.x ?? 0;
      const localY = child.y ?? 0;
      if (source) nodes.push({ ...source, x: localX, y: localY, width: child.width ?? COURSE_ATOMIC_WIDTH, height: child.height ?? COURSE_ATOMIC_HEIGHT });
      collect(child, offsetX + localX, offsetY + localY);
    });
  }
  collect(result, 0, 0);

  return {
    nodes,
    edges: projection.edges.map((edge) => ({ ...edge, path: edgePaths.get(edge.id) ?? "" })),
    width: result.width ?? 1200,
    height: result.height ?? 720
  };
}
