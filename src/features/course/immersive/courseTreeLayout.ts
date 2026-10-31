import type { CoursePlaneLayout } from "@/features/archive/model/coursePlaneLayout";
import type { CourseGraphData } from "../runtime/courseRuntime";
import type { LearningStatus, UserAssignmentStatus } from "../types";
import type {
  ImmersiveChapter,
  ImmersiveCourseEdge,
  ImmersiveCourseLayout,
  ImmersiveKnowledgeNode,
  ImmersivePoint
} from "./immersiveLayout";

/**
 * Presentation geometry for the two-view course page. Positions come from the
 * Archive course plane (`coursePlaneLayout`, the same ELK result the Archive
 * uses). This module only offsets the reflection layer and composes DOM route
 * coordinates; it never runs a second layout.
 */

export const REFLECTION_OFFSET = { x: 14, y: 13, z: -6 } as const;

/**
 * The course tree reserves the action row inside every card, so zooming in can
 * never make a card grow over the next one. The Archive plane keeps its 40px
 * card; only this projection uses the taller action-card footprint. Column x
 * coordinates and the ELK-derived row order are unchanged.
 */
export const COURSE_CARD_WIDTH = 176;
export const COURSE_CARD_HEIGHT = 64;
export const COURSE_ROW_GAP = 18;
export const COURSE_CHAPTER_HEADER = 56;
export const COURSE_CHAPTER_PADDING_BOTTOM = 12;
export const COURSE_ROW_PITCH = COURSE_CARD_HEIGHT + COURSE_ROW_GAP;

export type CourseSelection =
  | { kind: "knowledge"; id: string }
  | { kind: "practice"; id: string }
  | { kind: "group"; id: string }
  | { kind: "capability"; id: string };

export type CoursePracticeCard = {
  id: string;
  knowledgeId: string;
  kind: "assignment" | "group" | "empty";
  assignmentIds: string[];
  title: string;
  code: string;
  status: UserAssignmentStatus | "mixed";
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
};

type AssignmentContext = CourseGraphData["knowledgeNodes"][number]["assignmentContexts"][number];

type DependencyCard = { id: string; x: number; y: number; width: number; height: number; chapterIndex: number };
type DependencyChapter = { id: string; x: number; y: number; width: number; height: number };

/**
 * Orthogonal, card-safe course dependency routes. Lines leave a card edge, run
 * through the chapter gutters and row alleys, and never cross a card interior.
 * Coordinates are the stage's y-down layout space; every point is returned at
 * a deep z so the WebGL line layer stays behind the DOM cards.
 */
export function buildDependencyRoutes(input: {
  nodes: readonly { id: string; x: number; y: number; width: number; height: number; chapterId: string }[];
  chapters: readonly DependencyChapter[];
  edges: readonly { id: string; source: string; target: string; relation: string }[];
}): Map<string, ImmersivePoint[]> {
  const chapterIndex = new Map(input.chapters.map((chapter, index) => [chapter.id, index]));
  const cards = new Map<string, DependencyCard>();
  input.nodes.forEach((node) => {
    const index = chapterIndex.get(node.chapterId);
    if (index === undefined) return;
    cards.set(node.id, { ...node, chapterIndex: index });
  });
  const cardsByChapter = new Map<number, DependencyCard[]>();
  cards.forEach((card) => cardsByChapter.set(card.chapterIndex, [...(cardsByChapter.get(card.chapterIndex) ?? []), card]));
  cardsByChapter.forEach((list) => list.sort((left, right) => left.y - right.y || left.id.localeCompare(right.id)));
  const point = (x: number, y: number): ImmersivePoint => ({ x, y, z: -30 });
  const routes = new Map<string, ImmersivePoint[]>();

  const sameChapter = (source: DependencyCard, target: DependencyCard) => {
    const chapter = input.chapters[source.chapterIndex];
    const between = (cardsByChapter.get(source.chapterIndex) ?? []).some((card) => (
      card.id !== source.id && card.id !== target.id
      && card.y > Math.min(source.y, target.y) + 0.5
      && card.y < Math.max(source.y, target.y) - 0.5
    ));
    if (!between) {
      const x = source.x;
      return source.y < target.y
        ? [point(x, source.y + source.height / 2), point(x, target.y - target.height / 2)]
        : [point(x, source.y - source.height / 2), point(x, target.y + target.height / 2)];
    }
    const rightGutter = chapter.x + chapter.width + 6;
    const gutter = rightGutter > Math.max(source.x, target.x) + Math.max(source.width, target.width) / 2 + 2
      ? rightGutter
      : chapter.x - 6;
    const direction = gutter > source.x ? 1 : -1;
    return [
      point(source.x + direction * source.width / 2, source.y),
      point(gutter, source.y),
      point(gutter, target.y),
      point(target.x + direction * target.width / 2, target.y)
    ];
  };

  const acrossChapters = (source: DependencyCard, target: DependencyCard) => {
    const direction = target.chapterIndex > source.chapterIndex ? 1 : -1;
    const sourceChapter = input.chapters[source.chapterIndex];
    const targetChapter = input.chapters[target.chapterIndex];
    const sourceGutter = direction > 0 ? sourceChapter.x + sourceChapter.width + 6 : sourceChapter.x - 6;
    const targetGutter = direction > 0 ? targetChapter.x - 6 : targetChapter.x + targetChapter.width + 6;
    const start = point(source.x + direction * source.width / 2, source.y);
    const end = point(target.x - direction * target.width / 2, target.y);
    if (Math.abs(target.chapterIndex - source.chapterIndex) === 1) {
      return [start, point(sourceGutter, source.y), point(sourceGutter, target.y), point(targetGutter, target.y), end];
    }
    // Distant columns: cross at a row alley next to the target row, never at a
    // card centre inside an intermediate chapter.
    const approachAbove = source.y < target.y;
    const alley = Math.max(4, (COURSE_ROW_PITCH - target.height) / 2);
    const corridorY = approachAbove
      ? target.y - target.height / 2 - alley
      : target.y + target.height / 2 + alley;
    return [
      start,
      point(sourceGutter, source.y),
      point(sourceGutter, corridorY),
      point(targetGutter, corridorY),
      point(targetGutter, target.y),
      end
    ];
  };

  input.edges.forEach((edge) => {
    if (edge.relation === "related" || edge.source === edge.target) return;
    const source = cards.get(edge.source);
    const target = cards.get(edge.target);
    if (!source || !target) return;
    const points = source.chapterIndex === target.chapterIndex ? sameChapter(source, target) : acrossChapters(source, target);
    if (points.length > 1) routes.set(edge.id, points);
  });
  return routes;
}

function assignmentState(contexts: readonly AssignmentContext[]): CoursePracticeCard["status"] {
  const states = contexts.map((context) => context.state?.status ?? "not_started");
  if (!states.length) return "not_started";
  if (states.every((state) => state === "accepted" || state === "completed")) return "accepted";
  if (states.some((state) => state === "started" || state === "submitted" || state === "needs_revision" || state === "in-progress")) return "started";
  if (states.every((state) => state === "not_started")) return "not_started";
  return "mixed";
}

export function buildPracticeCards(graphData: CourseGraphData): Map<string, CoursePracticeCard> {
  const cards = new Map<string, CoursePracticeCard>();
  graphData.knowledgeNodes.forEach((node) => {
    const contexts = node.assignmentIds
      .map((assignmentId) => node.assignmentContexts.find((context) => context.assignmentId === assignmentId))
      .filter((context): context is AssignmentContext => Boolean(context))
      .sort((left, right) => left.assignment.order - right.assignment.order || left.assignmentId.localeCompare(right.assignmentId));
    if (!contexts.length) {
      cards.set(node.id, {
        id: `empty:${node.id}`,
        knowledgeId: node.id,
        kind: "empty",
        assignmentIds: [],
        title: "暂无对应实训",
        code: "",
        status: "not_started",
        x: 0,
        y: 0,
        z: 0,
        width: 176,
        height: 28
      });
      return;
    }
    if (contexts.length === 1) {
      const context = contexts[0];
      cards.set(node.id, {
        id: `assignment:${context.assignmentId}:${node.id}`,
        knowledgeId: node.id,
        kind: "assignment",
        assignmentIds: [context.assignmentId],
        title: context.assignment.title,
        code: String(context.assignment.order + 1).padStart(2, "0"),
        status: assignmentState(contexts),
        x: 0,
        y: 0,
        z: 0,
        width: 176,
        height: 48
      });
      return;
    }
    cards.set(node.id, {
      id: `group:${node.id}`,
      knowledgeId: node.id,
      kind: "group",
      assignmentIds: contexts.map((context) => context.assignmentId),
      title: `实践组 · ${contexts.length} 项`,
      code: "组",
      status: assignmentState(contexts),
      x: 0,
      y: 0,
      z: 0,
      width: 176,
      height: 48
    });
  });
  return cards;
}

/** Front layer at the ELK coordinate; reflection sits right-down-behind. */
export function reflectionOffset(knowledgeInFront: boolean, isKnowledge: boolean): ImmersivePoint {
  const inFront = isKnowledge ? knowledgeInFront : !knowledgeInFront;
  return inFront ? { x: 0, y: 0, z: 0 } : { ...REFLECTION_OFFSET };
}

export function positionPracticeCards(
  cards: ReadonlyMap<string, CoursePracticeCard>,
  layout: Pick<ImmersiveCourseLayout, "nodes">,
  knowledgeInFront: boolean
): CoursePracticeCard[] {
  const byId = new Map(layout.nodes.filter((node): node is ImmersiveKnowledgeNode => node.kind === "knowledge").map((node) => [node.id, node]));
  return [...cards.values()].flatMap((card) => {
    const anchor = byId.get(card.knowledgeId);
    if (!anchor) return [];
    const offset = reflectionOffset(knowledgeInFront, false);
    return [{ ...card, x: anchor.x + offset.x, y: anchor.y + offset.y, z: anchor.z + offset.z }];
  });
}

export function assignmentKnowledgeMap(graphData: CourseGraphData): Map<string, string[]> {
  const map = new Map<string, string[]>();
  graphData.knowledgeNodes.forEach((node) => {
    node.assignmentIds.forEach((assignmentId) => {
      map.set(assignmentId, [...(map.get(assignmentId) ?? []), node.id]);
    });
  });
  return map;
}

export function primaryKnowledgeByAssignment(graphData: CourseGraphData): Map<string, string> {
  const order = new Map(graphData.knowledgeNodes.map((node, index) => [node.id, index]));
  const result = new Map<string, string>();
  graphData.knowledgeNodes.forEach((node) => {
    node.assignmentIds.forEach((assignmentId) => {
      const current = result.get(assignmentId);
      if (!current || (order.get(node.id) ?? 0) < (order.get(current) ?? 0)) result.set(assignmentId, node.id);
    });
  });
  return result;
}

export type CourseSelectionRelations = {
  knowledgeIds: ReadonlySet<string>;
  practiceKnowledgeIds: ReadonlySet<string>;
  capabilityIds: ReadonlySet<string>;
  relatedKeys: ReadonlySet<string>;
  /** Selection is not part of the adopted route, so the pulse beam fades. */
  onRoute: boolean;
};

export function selectionKey(selection: CourseSelection): string {
  if (selection.kind === "knowledge") return `k:${selection.id}`;
  if (selection.kind === "practice" || selection.kind === "group") return `p:${selection.id}`;
  return `c:${selection.id}`;
}

export function courseSelectionRelations(input: {
  selection: CourseSelection | null;
  knowledgeIds: readonly string[];
  dependencyEdges: readonly { source: string; target: string }[];
  assignmentsByKnowledge: ReadonlyMap<string, readonly string[]>;
  assignmentKnowledge: ReadonlyMap<string, readonly string[]>;
  capabilitySupports: ReadonlyMap<string, readonly string[]>;
  routeOrder: readonly string[];
}): CourseSelectionRelations {
  const knowledge = new Set<string>();
  const practices = new Set<string>();
  const capabilities = new Set<string>();
  const related = new Set<string>();
  const selection = input.selection;
  if (!selection) return { knowledgeIds: knowledge, practiceKnowledgeIds: practices, capabilityIds: capabilities, relatedKeys: related, onRoute: false };
  const add = (key: string) => related.add(key);
  const addKnowledge = (id: string) => {
    if (!input.knowledgeIds.includes(id)) return;
    knowledge.add(id);
    add(`k:${id}`);
    const card = input.assignmentsByKnowledge.has(id) ? `p:${id}` : `p:${id}`;
    add(card);
  };
  const addDependencies = (id: string) => {
    input.dependencyEdges.forEach((edge) => {
      if (edge.source === id) addKnowledge(edge.target);
      if (edge.target === id) addKnowledge(edge.source);
    });
  };
  const addCapabilities = (id: string) => {
    input.capabilitySupports.forEach((supports, capabilityId) => {
      if (supports.includes(id)) {
        capabilities.add(capabilityId);
        add(`c:${capabilityId}`);
      }
    });
  };
  let onRoute = false;
  if (selection.kind === "knowledge") {
    addKnowledge(selection.id);
    addDependencies(selection.id);
    addCapabilities(selection.id);
    practices.add(selection.id);
    const index = input.routeOrder.indexOf(selection.id);
    if (index >= 0) {
      onRoute = true;
      if (index > 0) addKnowledge(input.routeOrder[index - 1]);
      if (index < input.routeOrder.length - 1) addKnowledge(input.routeOrder[index + 1]);
    }
  } else if (selection.kind === "practice") {
    const covered = input.assignmentKnowledge.get(selection.id) ?? [];
    covered.forEach((id) => {
      addKnowledge(id);
      practices.add(id);
      addDependencies(id);
      addCapabilities(id);
      const index = input.routeOrder.indexOf(id);
      if (index >= 0) {
        onRoute = true;
        if (index > 0) addKnowledge(input.routeOrder[index - 1]);
        if (index < input.routeOrder.length - 1) addKnowledge(input.routeOrder[index + 1]);
      }
    });
  } else if (selection.kind === "group") {
    addKnowledge(selection.id);
    practices.add(selection.id);
    addDependencies(selection.id);
    addCapabilities(selection.id);
    const index = input.routeOrder.indexOf(selection.id);
    onRoute = index >= 0;
    if (index >= 0) {
      if (index > 0) addKnowledge(input.routeOrder[index - 1]);
      if (index < input.routeOrder.length - 1) addKnowledge(input.routeOrder[index + 1]);
    }
  } else {
    capabilities.add(selection.id);
    add(`c:${selection.id}`);
    (input.capabilitySupports.get(selection.id) ?? []).forEach((id) => addKnowledge(id));
  }
  [...knowledge].forEach((id) => add(`p:${id}`));
  return { knowledgeIds: knowledge, practiceKnowledgeIds: practices, capabilityIds: capabilities, relatedKeys: related, onRoute };
}

/** Resolve the open detail facet when the skill/practice mirror swaps. */
export function resolveFacetSelection(input: {
  selection: CourseSelection;
  knowledgeInFront: boolean;
  practiceByKnowledge: ReadonlyMap<string, CoursePracticeCard>;
  assignmentKnowledge: ReadonlyMap<string, readonly string[]>;
  primaryKnowledge: ReadonlyMap<string, string>;
}): CourseSelection {
  const { selection } = input;
  if (selection.kind === "knowledge" && !input.knowledgeInFront) {
    const card = input.practiceByKnowledge.get(selection.id);
    if (!card || card.kind === "empty") return selection;
    return card.kind === "group" ? { kind: "group", id: selection.id } : { kind: "practice", id: card.assignmentIds[0] };
  }
  if (selection.kind === "practice" && input.knowledgeInFront) {
    const primary = input.primaryKnowledge.get(selection.id);
    if (primary) return { kind: "knowledge", id: primary };
  }
  if (selection.kind === "group" && input.knowledgeInFront) return { kind: "knowledge", id: selection.id };
  return selection;
}

/** Compose the Archive plane into the immersive course layout (knowledge only). */
export function buildPlaneCourseLayout(graphData: CourseGraphData, plane: CoursePlaneLayout): ImmersiveCourseLayout {
  const chapterMeta = new Map(graphData.chapters.map((chapter) => [chapter.id, chapter]));
  const chapterIds = new Set(graphData.chapters.map((chapter) => chapter.id));
  const nodeMeta = new Map(graphData.knowledgeNodes.map((node) => [node.id, node]));
  const nodeIds = new Set(nodeMeta.keys());
  const chapters: ImmersiveChapter[] = plane.chapters.filter((chapter) => chapterIds.has(chapter.id)).map((chapter, index) => {
    const meta = chapterMeta.get(chapter.id);
    const rows = graphData.knowledgeNodes.filter((node) => node.chapterId === chapter.id);
    const height = COURSE_CHAPTER_HEADER + Math.max(1, rows.length) * COURSE_CARD_HEIGHT + Math.max(0, rows.length - 1) * COURSE_ROW_GAP + COURSE_CHAPTER_PADDING_BOTTOM;
    // Stage world centre = -chapter.y. The Archive gives the chapter top in
    // y-up space, so recomputing the centre keeps the header pinned to its top.
    const topWorld = chapter.y;
    return {
      id: chapter.id,
      title: chapter.title,
      displayNumber: meta?.displayNumber ?? index + 1,
      x: chapter.x + chapter.width / 2,
      y: -(topWorld - height / 2),
      width: chapter.width,
      height,
      knowledgeCount: rows.length,
      learnedCount: rows.filter((node) => node.status === "completed").length,
      assignmentCount: meta?.assignmentSummary.assignmentCount ?? 0,
      progress: meta?.knowledgeProgress ?? 0,
      tone: ((index % 3) + 1) as 1 | 2 | 3,
      lessonCount: meta?.lessonCount ?? 0,
      outcome: meta?.outcome,
      empty: rows.length === 0
    };
  });
  const orderedByChapter = new Map<string, typeof graphData.knowledgeNodes>();
  graphData.knowledgeNodes.forEach((node) => {
    orderedByChapter.set(node.chapterId, [...(orderedByChapter.get(node.chapterId) ?? []), node]);
  });
  // The Archive plane already encodes the ELK row order in y; keep that order
  // and only stretch the pitch so the action row has a reserved slot.
  orderedByChapter.forEach((rows, chapterId) => {
    orderedByChapter.set(chapterId, rows.slice().sort((left, right) => {
      const leftY = plane.positions[left.id]?.y ?? 0;
      const rightY = plane.positions[right.id]?.y ?? 0;
      return rightY - leftY || left.primaryCoverage.lessonOrder - right.primaryCoverage.lessonOrder || left.id.localeCompare(right.id);
    }));
  });
  const nodes: ImmersiveKnowledgeNode[] = [];
  chapters.forEach((chapter) => {
    const rows = orderedByChapter.get(chapter.id) ?? [];
    const chapterTopWorld = -chapter.y + chapter.height / 2;
    rows.forEach((node, rowIndex) => {
      const centerWorld = chapterTopWorld - COURSE_CHAPTER_HEADER - COURSE_CARD_HEIGHT / 2 - rowIndex * COURSE_ROW_PITCH;
      nodes.push({
        id: node.id,
        kind: "knowledge" as const,
        title: node.title,
        x: chapter.x,
        y: -centerWorld,
        z: 0,
        width: COURSE_CARD_WIDTH,
        height: COURSE_CARD_HEIGHT,
        chapterId: node.chapterId,
        status: node.status as LearningStatus,
        current: node.status === "learning",
        node
      });
    });
  });
  // Centre the recomputed chapter boxes/nodes on the scene origin. The Archive
  // plane was centred for its 40px cards; stretching the row pitch moves the
  // vertical centre, so recentre without touching column x.
  const minWorldY = Math.min(
    ...chapters.map((chapter) => -chapter.y - chapter.height / 2),
    ...nodes.map((node) => -node.y - node.height / 2)
  );
  const maxWorldY = Math.max(
    ...chapters.map((chapter) => -chapter.y + chapter.height / 2),
    ...nodes.map((node) => -node.y + node.height / 2)
  );
  const offsetY = -(minWorldY + maxWorldY) / 2;
  chapters.forEach((chapter) => { chapter.y -= offsetY; });
  nodes.forEach((node) => { node.y -= offsetY; });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const dependencyRoutes = buildDependencyRoutes({
    nodes,
    chapters,
    edges: graphData.knowledgeEdges
  });
  const edges: ImmersiveCourseEdge[] = graphData.knowledgeEdges.flatMap((edge) => {
    if (edge.relation === "related" || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return [];
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return [];
    const points = dependencyRoutes.get(edge.id);
    if (!points) return [];
    return [{
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: "knowledge" as const,
      relation: edge.relation as "prerequisite" | "enables" | "related" | "sequence",
      strength: edge.strength,
      points
    }];
  });
  return {
    courseId: graphData.courseId,
    revision: graphData.revision,
    width: Math.max(...chapters.map((chapter) => chapter.width), plane.width),
    height: Math.max(...chapters.map((chapter) => chapter.height), plane.height),
    chapters,
    nodes,
    edges
  };
}

export type RouteTrackCard = { id: string; x: number; y: number; width: number; height: number; chapterId: string };
export type RouteTrackChapter = { id: string; x: number; y: number; width: number; height: number };

/**
 * Route light band in the scene's world space. It leaves/appends at card side
 * edges, runs in the chapter gutters and is placed behind the card plane. It
 * never cuts across a card interior, which is what made the old Catmull-Rom
 * band read as a thick arc thrown over the course.
 */
export function buildRouteTrack(
  orderedIds: readonly string[],
  cards: ReadonlyMap<string, RouteTrackCard>,
  chapterById: ReadonlyMap<string, RouteTrackChapter>
): { x: number; y: number; z: number }[] {
  const route = orderedIds.flatMap((id) => {
    const card = cards.get(id);
    return card ? [card] : [];
  });
  if (route.length < 2) return [];
  const points: Array<{ x: number; y: number; z: number }> = [];
  const push = (x: number, y: number) => {
    const previous = points[points.length - 1];
    if (previous && Math.abs(previous.x - x) < 0.01 && Math.abs(previous.y - y) < 0.01) return;
    points.push({ x, y, z: -24 });
  };
  const box = (card: RouteTrackCard) => ({
    left: card.x - card.width / 2,
    right: card.x + card.width / 2,
    top: card.y + card.height / 2,
    bottom: card.y - card.height / 2
  });
  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1];
    const to = route[index];
    const fromChapter = chapterById.get(from.chapterId);
    const toChapter = chapterById.get(to.chapterId);
    const fromBox = box(from);
    const toBox = box(to);
    // Route order normally walks a chapter column top-to-bottom, then the next
    // column. Right-hand gutters stay outside the 14px practice reflection.
    const moveRight = !fromChapter || !toChapter ? to.x >= from.x : toChapter.x > fromChapter.x;
    if (from.chapterId === to.chapterId && fromChapter) {
      const lane = fromChapter.x + fromChapter.width / 2 + 7;
      push(fromBox.right + 2, from.y);
      push(lane, from.y);
      push(lane, to.y);
      push(toBox.right + 2, to.y);
      continue;
    }
    if (moveRight && fromChapter && toChapter && toChapter.x - fromChapter.x > fromChapter.width) {
      // Non-adjacent jump: travel above the chapter headers so no intermediate
      // column is crossed.
      const top = Math.max(fromChapter.y + fromChapter.height / 2, toChapter.y + toChapter.height / 2) + 18;
      const fromLane = fromChapter.x + fromChapter.width / 2 + 7;
      const toLane = toChapter.x - toChapter.width / 2 - 7;
      push(fromBox.right + 2, from.y);
      push(fromLane, from.y);
      push(fromLane, top);
      push(toLane, top);
      push(toLane, to.y);
      push(toBox.left - 2, to.y);
      continue;
    }
    if (moveRight) {
      const lane = fromChapter ? fromChapter.x + fromChapter.width / 2 + 7 : fromBox.right + 24;
      push(fromBox.right + 2, from.y);
      push(lane, from.y);
      push(lane, to.y);
      push(toBox.left - 2, to.y);
    } else if (fromChapter) {
      const lane = fromChapter.x - fromChapter.width / 2 - 7;
      push(fromBox.left - 2, from.y);
      push(lane, from.y);
      push(lane, to.y);
      push(toBox.right + 2, to.y);
    } else {
      push(from.x, from.y);
      push(to.x, to.y);
    }
  }
  return points;
}

export type WindingStepInput = {
  id: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  status: "done" | "current" | "locked";
  /** Read-only label from learnerStateProjection: 已学 / 在学 / 待学. */
  stateLabel: string;
  minutes?: number;
  meta?: string;
};

export type WindingStep = WindingStepInput & { index: number; x: number; y: number; side: "left" | "right" };
export type WindingHeader = {
  id: string;
  chapterId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stepCount: number;
};
export type WindingRouteLayout = {
  steps: WindingStep[];
  headers: WindingHeader[];
  path: string;
  donePath: string;
  currentIndex: number;
  width: number;
  height: number;
};

const ROUTE_STEP_GAP = 144;
const ROUTE_CHAPTER_HEIGHT = 44;
const ROUTE_CHAPTER_GAP = 92;
const ROUTE_START_CARD_HEIGHT = 150;

function curvePath(points: ReadonlyArray<{ x: number; y: number }>) {
  if (!points.length) return "";
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const previous = points[index - 1];
    const mid = (previous.y + point.y) / 2;
    return `${path} C ${previous.x.toFixed(1)} ${mid.toFixed(1)}, ${point.x.toFixed(1)} ${mid.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, "");
}

/**
 * Duolingo/Brilliant-style winding execution path. Positions are a pure
 * function of step order and chapter transitions; no graph layout runs.
 */
export function buildWindingRoute(stepInputs: readonly WindingStepInput[], width = 560): WindingRouteLayout {
  const unique: WindingStepInput[] = [];
  const seen = new Set<string>();
  stepInputs.forEach((step) => {
    if (seen.has(step.id)) return;
    seen.add(step.id);
    unique.push(step);
  });
  const center = Math.max(200, width) / 2;
  const amplitude = Math.min(120, Math.max(200, width) * 0.22);
  const steps: WindingStep[] = [];
  const headers: WindingHeader[] = [];
  let y = 0;
  let lastChapter = "";
  unique.forEach((step, index) => {
    if (step.chapterId !== lastChapter) {
      lastChapter = step.chapterId;
      y += 44;
      headers.push({
        id: `route-chapter:${step.chapterId}`,
        chapterId: step.chapterId,
        title: step.chapterNumber > 0 ? `第 ${step.chapterNumber} 章 · ${step.chapterTitle}` : step.chapterTitle,
        x: center,
        y: y + ROUTE_CHAPTER_HEIGHT / 2,
        width: Math.min(520, Math.max(240, width - 40)),
        height: ROUTE_CHAPTER_HEIGHT,
        stepCount: unique.filter((item) => item.chapterId === step.chapterId).length
      });
      y += ROUTE_CHAPTER_HEIGHT + ROUTE_CHAPTER_GAP;
    }
    const x = center + Math.sin(index * 0.95) * amplitude;
    steps.push({ ...step, index, x, y: y + 30, side: x <= center + 4 ? "right" : "left" });
    y += ROUTE_STEP_GAP;
    if (step.status === "current") y += ROUTE_START_CARD_HEIGHT;
  });
  const currentIndex = steps.findIndex((step) => step.status === "current");
  const path = curvePath(steps.map((step) => ({ x: step.x, y: step.y })));
  const donePath = currentIndex >= 0 ? curvePath(steps.slice(0, currentIndex + 1).map((step) => ({ x: step.x, y: step.y }))) : "";
  return {
    steps,
    headers,
    path,
    donePath,
    currentIndex,
    width: Math.max(200, width),
    height: Math.max(240, y + 40)
  };
}

export function routeStepNumber(routeOrder: readonly string[], knowledgeId: string) {
  const index = routeOrder.indexOf(knowledgeId);
  return index >= 0 ? index + 1 : null;
}
