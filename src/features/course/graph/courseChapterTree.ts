import type { CourseGraphData } from "../runtime/courseRuntime";
import type { LearningStatus } from "../types";
import { getCourseLayoutBasis } from "./elkCourseLayout";

/**
 * Compact chapter-tree projection of the real course graph. Chapter layers and
 * order come from the same ELK macro layout used by the course graph
 * (`getCourseLayoutBasis`); only the visual footprint is compressed into
 * capsule-sized knowledge nodes so P4 and the Archive can share it.
 */
export type CourseChapterTreeMode = "skill" | "practice";

export type CourseChapterTreeNode = {
  id: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  status: LearningStatus;
  current: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CourseChapterTreeChapter = {
  id: string;
  title: string;
  displayNumber: number;
  layer: number;
  orderInLayer: number;
  x: number;
  y: number;
  width: number;
  height: number;
  knowledgeCount: number;
  learnedCount: number;
  assignmentCount: number;
  progress: number;
  tone: 1 | 2 | 3;
};

export type CourseChapterTreeEdge = {
  id: string;
  source: string;
  target: string;
  kind: "chapter" | "knowledge";
  crossChapter: boolean;
  path: string;
};

export type CourseChapterTree = {
  width: number;
  height: number;
  chapters: CourseChapterTreeChapter[];
  nodes: CourseChapterTreeNode[];
  edges: CourseChapterTreeEdge[];
};

export const TREE_CAPSULE_WIDTH = 116;
export const TREE_CAPSULE_HEIGHT = 28;
export const TREE_CAPSULE_GAP_X = 8;
export const TREE_CAPSULE_GAP_Y = 7;
export const TREE_CHAPTER_PADDING = 12;
export const TREE_CHAPTER_HEADER = 32;
export const TREE_COLUMN_GAP = 54;
export const TREE_ROW_GAP = 52;
const MAX_COLUMNS = 4;

function chapterTone(index: number): 1 | 2 | 3 {
  return (index % 3 + 1) as 1 | 2 | 3;
}

function pathBetween(source: { x: number; y: number }, target: { x: number; y: number }, midX: number) {
  return `M${source.x} ${source.y}L${midX} ${source.y}L${midX} ${target.y}L${target.x} ${target.y}`;
}

export async function layoutCourseChapterTree(graphData: CourseGraphData): Promise<CourseChapterTree> {
  const basis = await getCourseLayoutBasis(graphData);
  const macroById = new Map(basis.macro.map((macro) => [macro.chapterId, macro]));
  const chapters = graphData.chapters.slice().sort((left, right) => left.displayNumber - right.displayNumber || left.id.localeCompare(right.id));
  const maxLayer = Math.max(0, ...chapters.map((chapter) => macroById.get(chapter.id)?.layer ?? 0));
  const columns = Math.min(MAX_COLUMNS, maxLayer + 1);
  const rowGroups = Math.ceil((maxLayer + 1) / columns);
  const knowledgeByChapter = new Map<string, CourseGraphData["knowledgeNodes"]>();
  graphData.knowledgeNodes.forEach((node) => {
    knowledgeByChapter.set(node.chapterId, [...(knowledgeByChapter.get(node.chapterId) ?? []), node]);
  });
  const firstLearningId = graphData.knowledgeNodes
    .filter((node) => node.status === "learning")
    .sort((left, right) => left.chapterId.localeCompare(right.chapterId) || left.lesson - right.lesson || left.id.localeCompare(right.id))[0]?.id;

  type Placed = { chapter: CourseChapterTreeChapter; knowledge: CourseGraphData["knowledgeNodes"] };
  const placedByCell = new Map<string, Placed[]>();
  chapters.forEach((chapter, index) => {
    const macro = macroById.get(chapter.id);
    const layer = macro?.layer ?? index;
    const orderInLayer = macro?.orderInLayer ?? index;
    const key = `${Math.floor(layer / columns)}:${layer % columns}`;
    const knowledge = (knowledgeByChapter.get(chapter.id) ?? [])
      .slice()
      .sort((left, right) => left.lesson - right.lesson || left.id.localeCompare(right.id));
    const cols = knowledge.length > 2 ? 2 : 1;
    const rows = Math.max(1, Math.ceil(knowledge.length / cols));
    const width = Math.max(158, TREE_CHAPTER_PADDING * 2 + cols * TREE_CAPSULE_WIDTH + (cols - 1) * TREE_CAPSULE_GAP_X);
    const height = TREE_CHAPTER_HEADER + rows * TREE_CAPSULE_HEIGHT + (rows - 1) * TREE_CAPSULE_GAP_Y + TREE_CHAPTER_PADDING;
    placedByCell.set(key, [...(placedByCell.get(key) ?? []), {
      chapter: {
        id: chapter.id,
        title: chapter.title,
        displayNumber: chapter.displayNumber,
        layer,
        orderInLayer,
        x: 0,
        y: 0,
        width,
        height,
        knowledgeCount: knowledge.length,
        learnedCount: knowledge.filter((node) => node.status === "completed").length,
        assignmentCount: chapter.assignmentSummary.assignmentCount,
        progress: chapter.knowledgeProgress,
        tone: chapterTone(index)
      },
      knowledge
    }]);
  });

  // Compose ELK layers into at most four columns, preserving each layer's
  // internal order. Rows grow downward; columns grow rightward.
  const columnWidths = Array.from({ length: columns }, () => 0);
  const rowGroupHeights = Array.from({ length: Math.max(1, rowGroups) }, () => 0);
  const cellSizes = new Map<string, { width: number; height: number }>();
  placedByCell.forEach((items, key) => {
    const [rowGroupText, columnText] = key.split(":");
    const rowGroup = Number(rowGroupText);
    const column = Number(columnText);
    const width = Math.max(...items.map((item) => item.chapter.width));
    const height = items.reduce((sum, item) => sum + item.chapter.height, 0) + Math.max(0, items.length - 1) * 26;
    cellSizes.set(key, { width, height });
    columnWidths[column] = Math.max(columnWidths[column] ?? 0, width);
    rowGroupHeights[rowGroup] = Math.max(rowGroupHeights[rowGroup] ?? 0, height);
  });
  const columnX: number[] = [];
  columnWidths.reduce((cursor, width, index) => {
    columnX[index] = cursor;
    return cursor + width + TREE_COLUMN_GAP;
  }, 0);
  const rowGroupY: number[] = [];
  rowGroupHeights.reduce((cursor, height, index) => {
    rowGroupY[index] = cursor;
    return cursor + height + TREE_ROW_GAP;
  }, 0);

  const placedChapters: Array<{ chapter: CourseChapterTreeChapter; knowledge: CourseGraphData["knowledgeNodes"] }> = [];
  placedByCell.forEach((items, key) => {
    const [rowGroupText, columnText] = key.split(":");
    const rowGroup = Number(rowGroupText);
    const column = Number(columnText);
    const sorted = items.slice().sort((left, right) => left.chapter.orderInLayer - right.chapter.orderInLayer || left.chapter.id.localeCompare(right.chapter.id));
    let cursorY = rowGroupY[rowGroup] ?? 0;
    sorted.forEach((item) => {
      item.chapter.x = columnX[column] ?? 0;
      item.chapter.y = cursorY;
      cursorY += item.chapter.height + 26;
      placedChapters.push(item);
    });
  });

  const nodes: CourseChapterTreeNode[] = [];
  const chapterById = new Map(placedChapters.map((item) => [item.chapter.id, item.chapter]));
  placedChapters.forEach(({ chapter, knowledge }) => {
    const cols = knowledge.length > 2 ? 2 : 1;
    knowledge.forEach((node, index) => {
      const column = index % cols;
      const row = Math.floor(index / cols);
      nodes.push({
        id: node.id,
        title: node.title,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        status: node.status,
        current: node.id === firstLearningId,
        x: chapter.x + TREE_CHAPTER_PADDING + column * (TREE_CAPSULE_WIDTH + TREE_CAPSULE_GAP_X),
        y: chapter.y + TREE_CHAPTER_HEADER + row * (TREE_CAPSULE_HEIGHT + TREE_CAPSULE_GAP_Y),
        width: TREE_CAPSULE_WIDTH,
        height: TREE_CAPSULE_HEIGHT
      });
    });
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const edges: CourseChapterTreeEdge[] = [];
  graphData.chapterEdges.forEach((edge) => {
    const source = chapterById.get(edge.source);
    const target = chapterById.get(edge.target);
    if (!source || !target) return;
    const from = { x: source.x + source.width, y: source.y + TREE_CHAPTER_HEADER };
    const to = { x: target.x, y: target.y + TREE_CHAPTER_HEADER };
    if (target.x <= source.x) {
      from.x = source.x + source.width / 2;
      from.y = source.y + source.height;
      to.x = target.x + target.width / 2;
      to.y = target.y + target.height;
      const midY = (from.y + to.y) / 2;
      edges.push({ id: `chapter:${edge.id}`, source: edge.source, target: edge.target, kind: "chapter", crossChapter: true, path: `M${from.x} ${from.y}L${from.x} ${midY}L${to.x} ${midY}L${to.x} ${to.y}` });
      return;
    }
    const midX = (from.x + to.x) / 2;
    edges.push({ id: `chapter:${edge.id}`, source: edge.source, target: edge.target, kind: "chapter", crossChapter: true, path: pathBetween(from, to, midX) });
  });
  graphData.knowledgeEdges.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return;
    const from = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const crossChapter = source.chapterId !== target.chapterId;
    const mid = crossChapter ? (from.y + to.y) / 2 : 0;
    edges.push({
      id: `knowledge:${edge.id}`,
      source: edge.source,
      target: edge.target,
      kind: "knowledge",
      crossChapter,
      path: crossChapter ? `M${from.x} ${from.y}L${from.x} ${mid}L${to.x} ${mid}L${to.x} ${to.y}` : `M${from.x} ${from.y}L${to.x} ${to.y}`
    });
  });

  const width = Math.max(320, ...Array.from(chapterById.values(), (chapter) => chapter.x + chapter.width));
  const height = Math.max(240, ...Array.from(chapterById.values(), (chapter) => chapter.y + chapter.height));
  return { width, height, chapters: Array.from(chapterById.values()), nodes, edges };
}

export function courseChapterTreeCounts(tree: CourseChapterTree) {
  const counts = { learned: 0, learning: 0, current: 0, target: 0, pending: 0 };
  tree.nodes.forEach((node) => {
    if (node.status === "completed") counts.learned += 1;
    else if (node.status === "learning") counts.learning += 1;
    else if (node.status === "available") counts.target += 1;
    else counts.pending += 1;
    if (node.current) counts.current += 1;
  });
  return counts;
}

export function truncateCapsuleTitle(title: string, maxUnits = 15) {
  const units = (value: string) => Array.from(value).reduce((sum, character) => sum + (/[\u3400-\u9fff]/.test(character) ? 2 : 1), 0);
  if (units(title) <= maxUnits) return title;
  let result = "";
  let used = 0;
  for (const character of Array.from(title)) {
    const size = /[\u3400-\u9fff]/.test(character) ? 2 : 1;
    if (used + size > maxUnits - 1) break;
    result += character;
    used += size;
  }
  return `${result}…`;
}
