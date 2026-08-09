import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode, ElkPoint } from "elkjs/lib/elk-api";
import type { CourseSkillTreeEdge } from "../../types";
import type { CourseGraphData } from "../runtime/courseRuntime";
import type { CourseGraphProjection, CourseProjectionEdge, CourseProjectionNode } from "./courseGraphProjection";

export const KNOWLEDGE_CARD_WIDTH = 194;
export const KNOWLEDGE_CARD_HEIGHT = 108;
export const COMPANION_OFFSET_X = 12;
export const COMPANION_OFFSET_Y = 12;
export const ATOMIC_FOOTPRINT_WIDTH = KNOWLEDGE_CARD_WIDTH + COMPANION_OFFSET_X;
export const ATOMIC_FOOTPRINT_HEIGHT = KNOWLEDGE_CARD_HEIGHT + COMPANION_OFFSET_Y;
export const COURSE_ATOMIC_WIDTH = ATOMIC_FOOTPRINT_WIDTH;
export const COURSE_ATOMIC_HEIGHT = ATOMIC_FOOTPRINT_HEIGHT;
export const COURSE_CHAPTER_WIDTH = 232;
export const COURSE_CHAPTER_HEIGHT = 126;

const CHAPTER_HEADER_HEIGHT = 88;
const CHAPTER_PADDING_X = 28;
const CHAPTER_PADDING_BOTTOM = 28;
const MACRO_LAYER_GAP = 150;
const MACRO_NODE_GAP = 84;
const GRAPH_PADDING = 54;

export type ChapterMacroLayout = {
  chapterId: string;
  nodeId: string;
  layer: number;
  orderInLayer: number;
  x: number;
  y: number;
  collapsedWidth: number;
  collapsedHeight: number;
};

export type ChapterLocalLayout = {
  chapterId: string;
  width: number;
  height: number;
  nodes: Array<{ nodeId: string; x: number; y: number; width: number; height: number }>;
  edgePaths: Map<string, string>;
};

export type CourseLayoutNode = CourseProjectionNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CourseLayoutEdge = CourseProjectionEdge & {
  path?: string;
  routing: "elk" | "react-flow";
};

export type CourseLayout = {
  nodes: CourseLayoutNode[];
  edges: CourseLayoutEdge[];
  width: number;
  height: number;
};

type CourseLayoutBasis = {
  macro: ChapterMacroLayout[];
  macroEdgePaths: Map<string, string>;
  locals: Map<string, ChapterLocalLayout>;
};

const elk = new ELK();
const basisPromises = new Map<string, Promise<CourseLayoutBasis>>();

export function getCourseLayoutCacheKey(courseId: string, revision: string) {
  return `${courseId}:${revision}`;
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

function edgeToElk(edge: { id: string; source: string; target: string }): ElkExtendedEdge {
  return { id: edge.id, sources: [edge.source], targets: [edge.target] };
}

function knowledgeProjectionEdge(edge: CourseSkillTreeEdge): CourseProjectionEdge {
  return {
    id: edge.id,
    source: `knowledge:${edge.source}`,
    target: `knowledge:${edge.target}`,
    kind: "knowledge",
    relation: edge.relation,
    sourceKind: "knowledge",
    supportCount: 1,
    strength: edge.strength,
    sourceEdge: edge
  };
}

async function buildMacroLayout(graphData: CourseGraphData) {
  const macroEdges: CourseProjectionEdge[] = graphData.chapterEdges.map((edge) => ({
    id: edge.id,
    source: `chapter:${edge.source}`,
    target: `chapter:${edge.target}`,
    kind: "chapter",
    relation: edge.primaryRelation,
    sourceKind: edge.sourceKind,
    supportCount: edge.supportCount,
    sourceEdge: edge
  }));
  const graph: ElkNode = {
    id: "course-macro",
    children: graphData.chapters
      .slice()
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((chapter) => ({ id: `chapter:${chapter.id}`, width: COURSE_CHAPTER_WIDTH, height: COURSE_CHAPTER_HEIGHT })),
    edges: macroEdges.map(edgeToElk),
    layoutOptions: { ...layeredOptions, "org.eclipse.elk.padding": `[top=${GRAPH_PADDING},left=${GRAPH_PADDING},bottom=${GRAPH_PADDING},right=${GRAPH_PADDING}]` }
  };
  const result = await elk.layout(graph);
  const children = result.children ?? [];
  const layerXs = Array.from(new Set(children.map((node) => Math.round(node.x ?? 0)))).sort((left, right) => left - right);
  const macro: ChapterMacroLayout[] = [];
  layerXs.forEach((layerX, layer) => {
    children
      .filter((node) => Math.abs((node.x ?? 0) - layerX) < 2)
      .sort((left, right) => (left.y ?? 0) - (right.y ?? 0) || left.id.localeCompare(right.id))
      .forEach((node, orderInLayer) => macro.push({
        chapterId: node.id.replace("chapter:", ""),
        nodeId: node.id,
        layer,
        orderInLayer,
        x: node.x ?? 0,
        y: node.y ?? 0,
        collapsedWidth: COURSE_CHAPTER_WIDTH,
        collapsedHeight: COURSE_CHAPTER_HEIGHT
      }));
  });
  return {
    macro,
    macroEdgePaths: new Map((result.edges ?? []).map((edge) => [edge.id, sectionPath(edge)]))
  };
}

export async function buildChapterLocalLayout(graphData: CourseGraphData, chapterId: string): Promise<ChapterLocalLayout> {
  const nodes = graphData.knowledgeNodes
    .filter((node) => node.chapterId === chapterId)
    .sort((left, right) => left.lesson - right.lesson || left.id.localeCompare(right.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graphData.knowledgeEdges
    .filter((edge) => edge.relation !== "related" && nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map(knowledgeProjectionEdge);
  const graph: ElkNode = {
    id: `chapter:${chapterId}:local`,
    children: nodes.map((node) => ({ id: `knowledge:${node.id}`, width: COURSE_ATOMIC_WIDTH, height: COURSE_ATOMIC_HEIGHT })),
    edges: edges.map(edgeToElk),
    layoutOptions: {
      ...layeredOptions,
      "org.eclipse.elk.padding": `[top=${CHAPTER_HEADER_HEIGHT},left=${CHAPTER_PADDING_X},bottom=${CHAPTER_PADDING_BOTTOM},right=${CHAPTER_PADDING_X}]`,
      "org.eclipse.elk.spacing.nodeNode": "42",
      "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "74"
    }
  };
  const result = await elk.layout(graph);
  return {
    chapterId,
    width: Math.max(COURSE_CHAPTER_WIDTH, result.width ?? COURSE_CHAPTER_WIDTH),
    height: Math.max(COURSE_CHAPTER_HEIGHT, result.height ?? COURSE_CHAPTER_HEIGHT),
    nodes: (result.children ?? []).map((node) => ({
      nodeId: node.id,
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width ?? COURSE_ATOMIC_WIDTH,
      height: node.height ?? COURSE_ATOMIC_HEIGHT
    })),
    edgePaths: new Map((result.edges ?? []).map((edge) => [edge.id, sectionPath(edge)]))
  };
}

async function buildCourseLayoutBasis(graphData: CourseGraphData): Promise<CourseLayoutBasis> {
  const [macroResult, localResults] = await Promise.all([
    buildMacroLayout(graphData),
    Promise.all(graphData.chapters.map((chapter) => buildChapterLocalLayout(graphData, chapter.id)))
  ]);
  return {
    ...macroResult,
    locals: new Map(localResults.map((local) => [local.chapterId, local]))
  };
}

export function getCourseLayoutBasis(graphData: CourseGraphData) {
  const key = getCourseLayoutCacheKey(graphData.courseId, graphData.revision);
  const current = basisPromises.get(key) ?? buildCourseLayoutBasis(graphData);
  basisPromises.set(key, current);
  return current;
}

export function clearCourseLayoutCache(courseId?: string) {
  if (!courseId) return basisPromises.clear();
  Array.from(basisPromises.keys()).filter((key) => key.startsWith(`${courseId}:`)).forEach((key) => basisPromises.delete(key));
}

function composeChapterPositions(basis: CourseLayoutBasis, expandedIds: Set<string>) {
  const sizeById = new Map(basis.macro.map((macro) => {
    const local = basis.locals.get(macro.chapterId);
    const expanded = expandedIds.has(macro.chapterId);
    return [macro.chapterId, {
      width: expanded ? local?.width ?? COURSE_CHAPTER_WIDTH : COURSE_CHAPTER_WIDTH,
      height: expanded ? local?.height ?? COURSE_CHAPTER_HEIGHT : COURSE_CHAPTER_HEIGHT
    }];
  }));
  const layerIndexes = Array.from(new Set(basis.macro.map((macro) => macro.layer))).sort((left, right) => left - right);
  const layerLeft = new Map<number, number>();
  let cursorX = Math.min(...basis.macro.map((macro) => macro.x));
  layerIndexes.forEach((layer) => {
    layerLeft.set(layer, cursorX);
    const width = Math.max(...basis.macro.filter((macro) => macro.layer === layer).map((macro) => sizeById.get(macro.chapterId)?.width ?? COURSE_CHAPTER_WIDTH));
    cursorX += width + MACRO_LAYER_GAP;
  });

  const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
  layerIndexes.forEach((layer) => {
    const entries = basis.macro.filter((macro) => macro.layer === layer).sort((left, right) => left.orderInLayer - right.orderInLayer);
    const desiredCenters = entries.map((entry) => entry.y + entry.collapsedHeight / 2);
    const centers: number[] = [];
    entries.forEach((entry, index) => {
      const height = sizeById.get(entry.chapterId)?.height ?? COURSE_CHAPTER_HEIGHT;
      if (!index) centers.push(desiredCenters[index]);
      else {
        const previous = entries[index - 1];
        const previousHeight = sizeById.get(previous.chapterId)?.height ?? COURSE_CHAPTER_HEIGHT;
        centers.push(Math.max(desiredCenters[index], centers[index - 1] + previousHeight / 2 + MACRO_NODE_GAP + height / 2));
      }
    });
    const desiredMean = desiredCenters.reduce((sum, value) => sum + value, 0) / Math.max(1, desiredCenters.length);
    const actualMean = centers.reduce((sum, value) => sum + value, 0) / Math.max(1, centers.length);
    const shift = desiredMean - actualMean;
    entries.forEach((entry, index) => {
      const size = sizeById.get(entry.chapterId) ?? { width: COURSE_CHAPTER_WIDTH, height: COURSE_CHAPTER_HEIGHT };
      positions.set(entry.chapterId, { x: layerLeft.get(layer) ?? entry.x, y: centers[index] + shift - size.height / 2, ...size });
    });
  });

  const minX = Math.min(...Array.from(positions.values(), (position) => position.x));
  const minY = Math.min(...Array.from(positions.values(), (position) => position.y));
  const offsetX = minX < GRAPH_PADDING ? GRAPH_PADDING - minX : 0;
  const offsetY = minY < GRAPH_PADDING ? GRAPH_PADDING - minY : 0;
  positions.forEach((position, id) => positions.set(id, { ...position, x: position.x + offsetX, y: position.y + offsetY }));
  return positions;
}

export async function layoutCourseGraph(graphData: CourseGraphData, projection: CourseGraphProjection): Promise<CourseLayout> {
  const basis = await getCourseLayoutBasis(graphData);
  const expandedIds = new Set(projection.nodes.filter((node) => node.kind === "chapter" && node.expanded).map((node) => node.chapter!.id));
  const chapterPositions = composeChapterPositions(basis, expandedIds);
  const projectionById = new Map(projection.nodes.map((node) => [node.id, node]));
  const nodes: CourseLayoutNode[] = [];

  projection.nodes.filter((node) => node.kind === "chapter").forEach((node) => {
    const position = chapterPositions.get(node.chapter!.id);
    nodes.push({
      ...node,
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      width: position?.width ?? COURSE_CHAPTER_WIDTH,
      height: position?.height ?? COURSE_CHAPTER_HEIGHT
    });
  });
  projection.nodes.filter((node) => node.kind === "knowledge" && node.parentId).forEach((node) => {
    const local = basis.locals.get(node.knowledge!.chapterId);
    const localNode = local?.nodes.find((item) => item.nodeId === node.id);
    nodes.push({
      ...node,
      x: localNode?.x ?? CHAPTER_PADDING_X,
      y: localNode?.y ?? CHAPTER_HEADER_HEIGHT,
      width: localNode?.width ?? COURSE_ATOMIC_WIDTH,
      height: localNode?.height ?? COURSE_ATOMIC_HEIGHT
    });
  });

  const edges = projection.edges.map<CourseLayoutEdge>((edge) => {
    if (edge.kind === "chapter") {
      return {
        ...edge,
        path: projection.view === "overview" ? basis.macroEdgePaths.get(edge.id) : undefined,
        routing: projection.view === "overview" ? "elk" : "react-flow"
      };
    }
    const source = projectionById.get(edge.source);
    const target = projectionById.get(edge.target);
    const sameChapter = source?.parentId && source.parentId === target?.parentId;
    if (!sameChapter || !source?.knowledge) return { ...edge, routing: "react-flow" };
    const chapterPosition = chapterPositions.get(source.knowledge.chapterId);
    const localPath = basis.locals.get(source.knowledge.chapterId)?.edgePaths.get(edge.id);
    return {
      ...edge,
      path: localPath && chapterPosition ? localPath.replace(/([ML])(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_match, command: string, x: string, y: string) => `${command}${Number(x) + chapterPosition.x} ${Number(y) + chapterPosition.y}`) : undefined,
      routing: localPath ? "elk" : "react-flow"
    };
  });

  const width = Math.max(...nodes.filter((node) => node.kind === "chapter").map((node) => node.x + node.width), 1200) + GRAPH_PADDING;
  const height = Math.max(...nodes.filter((node) => node.kind === "chapter").map((node) => node.y + node.height), 720) + GRAPH_PADDING;
  return { nodes, edges, width, height };
}
