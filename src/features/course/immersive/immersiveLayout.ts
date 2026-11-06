import type { CapabilityModel } from "@/shared/learning/routePlanning";
import type { CourseGraphData } from "../runtime/courseRuntime";
import type { CourseAssignment, CourseSkillTreeNode, LearningStatus } from "../types";
import {
  layoutCourseChapterTree,
  type CourseChapterTree,
  type CourseChapterTreeEdge
} from "../graph/courseChapterTree";

/**
 * Layout for the learner course scene. ELK (through the P3 chapter-tree source)
 * is the only course-structure layout authority. Everything in this module is a
 * pure projection over that layout or over an already-built Capability Model;
 * presentation state never participates in a layout key.
 */

export type ImmersivePoint = { x: number; y: number; z: number };

export type ImmersiveChapter = {
  id: string;
  title: string;
  displayNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  knowledgeCount: number;
  learnedCount: number;
  assignmentCount: number;
  progress: number;
  tone: 1 | 2 | 3;
  lessonCount?: number;
  outcome?: string;
  empty?: boolean;
};

export type ImmersiveKnowledgeNode = {
  id: string;
  kind: "knowledge";
  title: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  chapterId: string;
  status: LearningStatus;
  current: boolean;
  node: CourseSkillTreeNode;
};

export type ImmersiveAssignmentNode = {
  id: string;
  kind: "assignment";
  title: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  chapterId: string;
  assignment: CourseAssignment;
  coveredNodeIds: string[];
  status: string;
};

export type ImmersiveCourseNode = ImmersiveKnowledgeNode | ImmersiveAssignmentNode;

export type ImmersiveCapabilityNode = {
  id: string;
  kind: "capability";
  title: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  status: LearningStatus;
  current: boolean;
  course: boolean;
  bridge: boolean;
  courseNode?: CourseSkillTreeNode;
  /** Factual Course Knowledge directly / indirectly supported by this capability. */
  directSupports?: string[];
  indirectSupports?: string[];
};

export type ImmersiveCourseEdge = {
  id: string;
  source: string;
  target: string;
  kind: "chapter" | "knowledge";
  relation: "prerequisite" | "enables" | "related" | "sequence";
  strength?: "hard" | "soft" | number;
  points: ImmersivePoint[];
};

export type ImmersiveCapabilityEdge = {
  id: string;
  source: string;
  target: string;
  relation: "prerequisite" | "enables";
  strength?: "hard" | "soft" | number;
  points: ImmersivePoint[];
};

export type ImmersiveCourseLayout = {
  courseId: string;
  revision: string;
  width: number;
  height: number;
  chapters: ImmersiveChapter[];
  nodes: ImmersiveCourseNode[];
  edges: ImmersiveCourseEdge[];
};

export type ImmersiveFlattenColumn = {
  kind: "acquired" | "intermediate" | "far" | "target";
  label: string;
  x: number;
  y: number;
  width: number;
  count: number;
  nodeIds: string[];
};

export type ImmersiveCapabilityLayout = {
  courseId: string;
  modelKey: string;
  nodes: ImmersiveCapabilityNode[];
  edges: ImmersiveCapabilityEdge[];
  courseNodes: ImmersiveCapabilityNode[];
  bridgeNodes: ImmersiveCapabilityNode[];
  columns?: ImmersiveFlattenColumn[];
};

const SCENE_SCALE = 1.42;

const layoutPromises = new Map<string, Promise<CourseChapterTree>>();
type TreeLoader = (graphData: CourseGraphData) => Promise<CourseChapterTree>;
let loadCount = 0;

export function immersiveLayoutKey(graphData: Pick<CourseGraphData, "courseId" | "revision">) {
  return `${graphData.courseId}:${graphData.revision}`;
}

/**
 * Loads (or reuses) the ELK-derived chapter tree for a structural revision.
 * Presentation changes never call this again: the key contains only course
 * identity and the structural revision.
 */
export function loadImmersiveCourseLayout(graphData: CourseGraphData, loader: TreeLoader = layoutCourseChapterTree) {
  const key = immersiveLayoutKey(graphData);
  const current = layoutPromises.get(key);
  if (current) return current;
  loadCount += 1;
  const promise = loader(graphData);
  layoutPromises.set(key, promise);
  promise.catch(() => layoutPromises.delete(key));
  return promise;
}

export function clearImmersiveLayoutCache() {
  layoutPromises.clear();
  loadCount = 0;
}

/** Test-only observation of how many structural layouts were requested. */
export function immersiveLayoutLoadCount() {
  return loadCount;
}

function centered(value: number, center: number) {
  return (value - center) * SCENE_SCALE;
}

function pathPoints(points: Array<{ x: number; y: number }>, z = 0): ImmersivePoint[] {
  return points.map((point) => ({ x: point.x, y: point.y, z }));
}

function edgeLine(from: ImmersivePoint, to: ImmersivePoint): ImmersivePoint[] {
  const midX = (from.x + to.x) / 2;
  return [
    from,
    { x: midX, y: from.y, z: from.z },
    { x: midX, y: to.y, z: to.z },
    to
  ];
}

/** Projects the ELK-derived chapter tree into scene coordinates. */
export function buildImmersiveCourseLayout(graphData: CourseGraphData, tree: CourseChapterTree): ImmersiveCourseLayout {
  const centerX = tree.width / 2;
  const centerY = tree.height / 2;
  const nodeById = new Map(tree.nodes.map((node) => [node.id, node]));
  const knowledgeById = new Map(graphData.knowledgeNodes.map((node) => [node.id, node]));
  const chapters: ImmersiveChapter[] = tree.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    displayNumber: chapter.displayNumber,
    x: centered(chapter.x + chapter.width / 2, centerX),
    y: centered(chapter.y + chapter.height / 2, centerY),
    width: chapter.width * SCENE_SCALE,
    height: chapter.height * SCENE_SCALE,
    knowledgeCount: chapter.knowledgeCount,
    learnedCount: chapter.learnedCount,
    assignmentCount: chapter.assignmentCount,
    progress: chapter.progress,
    tone: chapter.tone
  }));

  const knowledgeNodes: ImmersiveKnowledgeNode[] = tree.nodes.flatMap((node) => {
    const knowledge = knowledgeById.get(node.id);
    if (!knowledge) return [];
    return [{
      id: node.id,
      kind: "knowledge",
      title: node.title,
      x: centered(node.x + node.width / 2, centerX),
      y: centered(node.y + node.height / 2, centerY),
      z: 0,
      width: 172,
      height: 34,
      chapterId: node.chapterId,
      status: node.status,
      current: node.current,
      node: knowledge
    }];
  });
  const knowledgeNodeById = new Map(knowledgeNodes.map((node) => [node.id, node]));
  const assignmentById = new Map(graphData.knowledgeNodes.flatMap((node) => node.assignmentContexts.map((context) => [context.assignmentId, context.assignment] as const)));
  const coverageByAssignment = new Map<string, string[]>();
  graphData.knowledgeNodes.forEach((node) => node.assignmentIds.forEach((assignmentId) => {
    coverageByAssignment.set(assignmentId, [...(coverageByAssignment.get(assignmentId) ?? []), node.id]);
  }));
  // Practice cards are a deterministic per-chapter grid. They never stack on
  // the same coordinate, and the chapter region grows to contain its grid.
  const assignmentSeeds = [...coverageByAssignment.entries()]
    .sort((left, right) => (assignmentById.get(left[0])?.order ?? 0) - (assignmentById.get(right[0])?.order ?? 0) || left[0].localeCompare(right[0]))
    .flatMap(([assignmentId, coveredNodeIds]) => {
      const assignment = assignmentById.get(assignmentId);
      if (!assignment) return [];
      const covered = coveredNodeIds
        .map((id) => knowledgeNodeById.get(id))
        .filter((node): node is ImmersiveKnowledgeNode => Boolean(node))
        .sort((left, right) => left.node.primaryCoverage.lessonOrder - right.node.primaryCoverage.lessonOrder || left.id.localeCompare(right.id));
      const anchor = covered[0];
      if (!anchor) return [];
      return [{
        assignment,
        anchor,
        coveredNodeIds,
        status: anchor.node.assignmentContexts.find((context) => context.assignmentId === assignmentId)?.state?.status ?? "not_started"
      }];
    });
  const assignmentsByChapter = new Map<string, typeof assignmentSeeds>();
  assignmentSeeds.forEach((seed) => assignmentsByChapter.set(seed.anchor.chapterId, [...(assignmentsByChapter.get(seed.anchor.chapterId) ?? []), seed]));
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const assignmentNodes: ImmersiveAssignmentNode[] = [];
  assignmentsByChapter.forEach((seeds, chapterId) => {
    const chapter = chapterById.get(chapterId);
    if (!chapter) return;
    const columns = seeds.length > 1 && chapter.width >= 268 ? 2 : 1;
    const rows = Math.ceil(seeds.length / columns);
    const inset = 16;
    const gap = 6;
    const cellWidth = Math.max(112, Math.min(148, (chapter.width - inset * 2 - gap * (columns - 1)) / columns));
    const cellHeight = 30;
    const requiredHeight = 38 + rows * cellHeight + Math.max(0, rows - 1) * gap + 12;
    if (requiredHeight > chapter.height) {
      const top = chapter.y - chapter.height / 2;
      chapter.height = requiredHeight;
      chapter.y = top + chapter.height / 2;
    }
    const top = chapter.y - chapter.height / 2;
    const left = chapter.x - chapter.width / 2 + inset;
    seeds.forEach((seed, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      assignmentNodes.push({
        id: seed.assignment.id,
        kind: "assignment",
        title: seed.assignment.title,
        x: left + column * (cellWidth + gap) + cellWidth / 2,
        y: top + 34 + row * (cellHeight + gap) + cellHeight / 2,
        z: 16 + (index % 3) * 2,
        width: cellWidth,
        height: cellHeight,
        chapterId,
        assignment: seed.assignment,
        coveredNodeIds: seed.coveredNodeIds,
        status: seed.status
      });
    });
  });

  const sceneKnowledgeById = new Map(knowledgeNodes.map((node) => [node.id, node]));
  const edges: ImmersiveCourseEdge[] = [];
  graphData.chapterEdges.forEach((edge) => {
    const source = chapterById.get(edge.source);
    const target = chapterById.get(edge.target);
    if (!source || !target) return;
    edges.push({
      id: `chapter:${edge.id}`,
      source: edge.source,
      target: edge.target,
      kind: "chapter",
      relation: edge.primaryRelation,
      points: edgeLine(
        { x: source.x + source.width / 2, y: source.y, z: -8 },
        { x: target.x - target.width / 2, y: target.y, z: -8 }
      )
    });
  });
  graphData.knowledgeEdges.filter((edge) => edge.relation !== "related").forEach((edge) => {
    const source = sceneKnowledgeById.get(edge.source);
    const target = sceneKnowledgeById.get(edge.target);
    if (!source || !target) return;
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: "knowledge",
      relation: edge.relation,
      strength: edge.strength,
      points: edgeLine(
        { x: source.x + source.width / 2, y: source.y, z: 1 },
        { x: target.x - target.width / 2, y: target.y, z: 1 }
      )
    });
  });

  return {
    courseId: graphData.courseId,
    revision: graphData.revision,
    width: tree.width * SCENE_SCALE,
    height: tree.height * SCENE_SCALE,
    chapters,
    nodes: [...knowledgeNodes, ...assignmentNodes],
    edges
  };
}

export function capabilityModelKey(model: CapabilityModel) {
  return [
    model.orderedNodeIds.join(","),
    model.supportEdges.map((edge) => `${edge.id}:${edge.relation}`).join(","),
    model.courseKnowledgeIds.join(",")
  ].join("|");
}

/**
 * Direct and indirect Course Knowledge support for every capability, derived
 * only from the Project Capability Model's factual support edges. A capability
 * directly supports a Course Knowledge when one edge reaches it; when the path
 * runs through another capability first the target is indirect. A target that
 * is directly reachable is never also reported as indirect.
 */
export type CapabilitySupportInfo = {
  direct: string[];
  indirect: string[];
  /** Union, deterministic: direct first then indirect. */
  all: string[];
};

export function capabilitySupportByNode(model: CapabilityModel): Map<string, CapabilitySupportInfo> {
  const memberIds = new Set(model.orderedNodeIds);
  const courseIds = new Set(model.courseKnowledgeIds.filter((id) => memberIds.has(id)));
  const courseOrder = new Map(model.courseKnowledgeIds.map((id, index) => [id, index]));
  const outgoing = new Map<string, Array<{ target: string }>>();
  model.supportEdges.forEach((edge) => {
    if (!memberIds.has(edge.source) || !memberIds.has(edge.target)) return;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), { target: edge.target }]);
  });
  outgoing.forEach((list) => list.sort((left, right) => left.target.localeCompare(right.target)));
  const result = new Map<string, CapabilitySupportInfo>();
  for (const id of model.orderedNodeIds) {
    if (courseIds.has(id)) continue;
    const direct = new Set<string>();
    const indirect = new Set<string>();
    let frontier: Array<{ id: string; depth: number }> = [{ id, depth: 0 }];
    const visited = new Set<string>([id]);
    while (frontier.length) {
      const next: Array<{ id: string; depth: number }> = [];
      for (const entry of frontier) {
        for (const edge of outgoing.get(entry.id) ?? []) {
          if (visited.has(edge.target)) continue;
          visited.add(edge.target);
          if (courseIds.has(edge.target)) {
            if (entry.depth + 1 === 1) direct.add(edge.target);
            else indirect.add(edge.target);
            continue;
          }
          next.push({ id: edge.target, depth: entry.depth + 1 });
        }
      }
      frontier = next;
    }
    direct.forEach((target) => indirect.delete(target));
    const sortCourse = (ids: Iterable<string>) => [...ids].sort((left, right) =>
      (courseOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (courseOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
      || left.localeCompare(right));
    result.set(id, { direct: sortCourse(direct), indirect: sortCourse(indirect), all: [...sortCourse(direct), ...sortCourse(indirect)] });
  }
  return result;
}

export type CapabilityAnchorOptions = {
  /** Deeper plane than the Course Knowledge. */
  baseZ?: number;
  /** Grouping grid for capabilities supporting the same Knowledge region. */
  groupSize?: number;
  /** Horizontal / vertical spacing of the deterministic shared-anchor grid. */
  spread?: number;
  /** Factual support edges, used to put indirect capabilities behind theirs. */
  edges?: readonly { source: string; target: string }[];
};

/**
 * Every capability sits behind the centre of the Course Knowledge it supports.
 * A capability that only supports other capabilities is placed further behind
 * the capabilities it supports, never at a common default point. Several
 * capabilities sharing one anchor occupy a deterministic grid (not a corner
 * spiral) so their screen markers never collapse onto each other.
 */
export function placeCapabilityAnchors(
  supports: ReadonlyMap<string, readonly string[]>,
  coursePositions: ReadonlyMap<string, ImmersivePoint>,
  fallback: ReadonlyMap<string, ImmersivePoint> = new Map(),
  options: CapabilityAnchorOptions = {}
): Map<string, ImmersivePoint> {
  const baseZ = options.baseZ ?? -280;
  const groupSize = Math.max(8, options.groupSize ?? 96);
  const spacingX = Math.max(64, options.spread ?? 92);
  const spacingY = Math.max(40, Math.round(spacingX * 0.65));
  const courseIds = new Set(coursePositions.keys());
  const ids = [...supports.keys()].sort();
  const memberIds = new Set(ids);
  const incoming = new Map<string, string[]>();
  (options.edges ?? []).forEach((edge) => {
    if (!memberIds.has(edge.source)) return;
    if (!memberIds.has(edge.target) && !courseIds.has(edge.target)) return;
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  });
  // Shortest support distance from Course Knowledge, not the deepest branch.
  // Only three compressed layers exist behind the front plane, so a chain of
  // capabilities cannot stretch into one long diagonal when the camera turns.
  const distances = new Map<string, number>();
  const queue: string[] = [];
  courseIds.forEach((id) => { distances.set(id, 0); queue.push(id); });
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    const distance = distances.get(id) ?? 0;
    for (const source of incoming.get(id) ?? []) {
      if (distances.has(source)) continue;
      distances.set(source, distance + 1);
      queue.push(source);
    }
  }
  const layerOf = (id: string) => Math.min(2, Math.max(0, (distances.get(id) ?? 1) - 1));

  const groups = new Map<string, Array<{ id: string; anchor: { x: number; y: number; z: number } }>>();
  const empty: string[] = [];
  ids.forEach((id) => {
    const supported = (supports.get(id) ?? []).flatMap((courseId) => {
      const position = coursePositions.get(courseId);
      return position ? [position] : [];
    });
    if (!supported.length) { empty.push(id); return; }
    const level = layerOf(id);
    const anchor = {
      x: supported.reduce((sum, point) => sum + point.x, 0) / supported.length,
      // y is layout-down: the two/three compressed layers sit visibly behind
      // their supports without becoming a long diagonal.
      y: supported.reduce((sum, point) => sum + point.y, 0) / supported.length + level * 26,
      z: baseZ - level * 54
    };
    const key = `${level}:${Math.round(anchor.x / groupSize)}:${Math.round(anchor.y / groupSize)}`;
    groups.set(key, [...(groups.get(key) ?? []), { id, anchor }]);
  });
  const positions = new Map<string, ImmersivePoint>();
  [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([key, members]) => {
    const level = Number(key.split(":")[0]) || 0;
    // Deeper capability planes stack almost on the same screen column when
    // the course plane is turned. Give each deeper layer a deterministic
    // lateral lane so the same support anchor never reads as one dot with
    // three names (P4R6). The offset is structural, never camera-dependent.
    const anchorX = members.reduce((sum, member) => sum + member.anchor.x, 0) / members.length + level * spacingX * 0.55;
    const anchorY = members.reduce((sum, member) => sum + member.anchor.y, 0) / members.length;
    const anchorZ = Math.min(...members.map((member) => member.anchor.z));
    const sorted = [...members].sort((left, right) => left.id.localeCompare(right.id));
    const columns = sorted.length <= 2 ? sorted.length : sorted.length <= 4 ? 2 : 3;
    const rows = Math.ceil(sorted.length / columns);
    sorted.forEach((member, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      positions.set(member.id, {
        x: anchorX + (column - (columns - 1) / 2) * spacingX,
        y: anchorY + (row - (rows - 1) / 2) * spacingY,
        z: anchorZ
      });
    });
  });
  empty.forEach((id) => {
    const position = fallback.get(id) ?? { x: 0, y: 0, z: baseZ };
    positions.set(id, { x: position.x, y: position.y, z: Math.min(baseZ, position.z) });
  });
  return positions;
}

function capabilityPositions(courseLayout: ImmersiveCourseLayout, model: CapabilityModel) {
  const courseNodes = new Map(courseLayout.nodes.filter((node): node is ImmersiveKnowledgeNode => node.kind === "knowledge").map((node) => [node.id, node]));
  const memberIds = new Set(model.orderedNodeIds);
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  model.supportEdges.forEach((edge) => {
    if (!memberIds.has(edge.source) || !memberIds.has(edge.target)) return;
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  });
  const courseIds = new Set(model.courseKnowledgeIds);
  const positions = new Map<string, ImmersivePoint>();
  const courseEntries = model.orderedNodeIds.filter((id) => courseIds.has(id));
  courseEntries.forEach((id, index) => {
    const node = courseNodes.get(id);
    if (node) positions.set(id, { x: node.x, y: node.y, z: 0 });
    else {
      const column = index % 5;
      positions.set(id, { x: (column - 2) * 210, y: Math.floor(index / 5) * 90 - 120, z: 0 });
    }
  });
  const supportInfo = capabilitySupportByNode(model);
  const supports = new Map<string, string[]>();
  supportInfo.forEach((info, id) => supports.set(id, info.all));
  const bridgeIds = model.orderedNodeIds.filter((id) => !courseIds.has(id) && memberIds.has(id));
  // The old fan-out is only a fallback for a member that has no factual path
  // to Course Knowledge (it must not happen in a valid model, but a fallback
  // keeps the renderer deterministic instead of stacking at the origin).
  const courseCentre = [...positions.values()][0] ?? { x: 0, y: 0, z: 0 };
  const fallback = new Map<string, ImmersivePoint>();
  bridgeIds.forEach((id, index) => {
    fallback.set(id, { x: courseCentre.x + (index % 3) * 18, y: courseCentre.y - 40 - index * 6, z: -280 });
  });
  const anchors = placeCapabilityAnchors(supports, positions, fallback, { edges: model.supportEdges });
  anchors.forEach((position, id) => positions.set(id, position));
  model.orderedNodeIds.forEach((id, index) => {
    if (positions.has(id)) return;
    positions.set(id, { x: (index % 5 - 2) * 210, y: Math.floor(index / 5) * 90 - 120, z: 0 });
  });
  return { positions, incoming, outgoing, courseIds };
}

/**
 * The capability model lives in the same scene. Course Knowledge keeps its ELK
 * position on the front plane; non-course ancestors sit directly behind the
 * course Knowledge they support on deeper planes. No layer frame is drawn.
 */
export function buildCapabilitySceneLayout(courseLayout: ImmersiveCourseLayout, model: CapabilityModel): ImmersiveCapabilityLayout {
  const { positions, courseIds } = capabilityPositions(courseLayout, model);
  const supportInfo = capabilitySupportByNode(model);
  const memberIds = new Set(model.orderedNodeIds);
  const supportEdges = model.supportEdges.filter((edge) => memberIds.has(edge.source) && memberIds.has(edge.target));
  const nodes: ImmersiveCapabilityNode[] = model.orderedNodeIds.map((id) => {
    const course = courseIds.has(id);
    const position = positions.get(id) ?? { x: 0, y: 0, z: 0 };
    const knowledge = courseLayout.nodes.find((node): node is ImmersiveKnowledgeNode => node.kind === "knowledge" && node.id === id);
    const info = supportInfo.get(id);
    return {
      id,
      kind: "capability",
      title: knowledge?.title ?? id,
      x: position.x,
      y: position.y,
      z: position.z,
      width: course ? 168 : 148,
      height: course ? 30 : 46,
      status: knowledge?.status ?? "available",
      current: model.currentKnowledgeIds.includes(id),
      course,
      bridge: !course,
      courseNode: knowledge?.node,
      directSupports: info?.direct,
      indirectSupports: info?.indirect
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const routeZ = (id: string) => (courseIds.has(id) ? 6 : (nodeById.get(id)?.z ?? 0) + 4);
  const edges: ImmersiveCapabilityEdge[] = supportEdges.flatMap((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return [];
    return [{
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation: edge.relation as "prerequisite" | "enables",
      strength: edge.strength,
      // Support relations are point-to-point, not orthogonal card routes:
      // the capability markers have no card body to hide a folded segment, so
      // a straight segment keeps the only visible vertices on the two nodes.
      points: [
        { x: source.x, y: source.y, z: routeZ(source.id) },
        { x: target.x, y: target.y, z: routeZ(target.id) }
      ]
    }];
  });
  return {
    courseId: courseLayout.courseId,
    modelKey: capabilityModelKey(model),
    nodes,
    edges,
    courseNodes: nodes.filter((node) => node.course),
    bridgeNodes: nodes.filter((node) => node.bridge)
  };
}

/**
 * Deterministic 2D route-editing layout: columns by factual dependency depth,
 * acquired → intermediate → farther support → targets. Large bands wrap into
 * sub-columns so 27 targets never become one endless screen-height column.
 * Positions are a pure function of the model structure.
 */
export type FlattenLayout = {
  positions: Map<string, { x: number; y: number }>;
  columns: ImmersiveFlattenColumn[];
};

export type FlattenLayoutOptions = {
  /**
   * Route-editing groups the learner's real acquired Knowledge (learned,
   * practicing and mastered) in 已获得; everything still ahead is split into
   * intermediate support and target columns.
   */
  acquiredNodeIds?: readonly string[];
  /**
   * Optional explicit course destination Knowledge. When absent, terminal
   * course Knowledge (no outgoing support edge) is the target column and the
   * remaining unacquired Knowledge is ordered by dependency depth as
   * intermediate capability.
   */
  targetNodeIds?: readonly string[];
};

export function layoutCapabilityFlattenLayout(model: CapabilityModel, options?: FlattenLayoutOptions): FlattenLayout {
  const memberIds = new Set(model.orderedNodeIds);
  const acquired = new Set((options?.acquiredNodeIds ?? model.currentKnowledgeIds).filter((id) => memberIds.has(id)));
  const course = new Set(model.courseKnowledgeIds.filter((id) => memberIds.has(id)));
  const outgoing = new Set(model.supportEdges
    .filter((edge) => course.has(edge.source) && course.has(edge.target))
    .map((edge) => edge.source));
  const requestedTargets = options?.targetNodeIds?.length
    ? options.targetNodeIds.filter((id) => course.has(id))
    : model.courseKnowledgeIds.filter((id) => course.has(id) && !outgoing.has(id));
  const explicitTargets = requestedTargets.length ? requestedTargets : [...course];
  const targets = new Set(explicitTargets.filter((id) => !acquired.has(id)));
  const intermediate = model.orderedNodeIds.filter((id) => !acquired.has(id) && !targets.has(id)).sort();
  const incoming = new Map<string, string[]>();
  model.supportEdges.forEach((edge) => {
    if (!memberIds.has(edge.source) || !memberIds.has(edge.target)) return;
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source].sort());
  });
  const depth = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    if (acquired.has(id)) return 0;
    if (depth.has(id)) return depth.get(id)!;
    if (stack.has(id)) return 1;
    stack.add(id);
    const sources = incoming.get(id) ?? [];
    const value = sources.length ? Math.max(...sources.map((source) => visit(source, stack))) + 1 : 1;
    stack.delete(id);
    depth.set(id, value);
    return value;
  };
  intermediate.forEach((id) => visit(id, new Set()));
  const sortByDepth = (left: string, right: string) => (depth.get(left) ?? 1) - (depth.get(right) ?? 1) || left.localeCompare(right);
  const support = [...intermediate].sort(sortByDepth);

  // Fewer sub-columns keep the three semantic bands readable in the narrowed
  // editor stage; tall columns are browsed by vertical panning.
  const maxRows = 32;
  const subColumnWidth = 186;
  const subColumnGap = 20;
  // Keep the three groups narrow enough that the readable 12px floor fits the
  // editor stage width without a horizontal scroll at 1440.
  const groupGap = 60;
  const rowGap = 50;
  // Exactly three semantic columns (acquired → intermediate → target). Large
  // bands wrap into deterministic sub-columns ordered by dependency depth.
  const groups = [
    { kind: "acquired" as const, label: "已获得", ids: [...acquired].sort() },
    { kind: "intermediate" as const, label: "中间能力", ids: support },
    { kind: "target" as const, label: "目标", ids: [...targets].sort() }
  ].filter((group) => group.ids.length > 0);

  const split = groups.map((group) => {
    const chunks: string[][] = [];
    for (let index = 0; index < group.ids.length; index += maxRows) chunks.push(group.ids.slice(index, index + maxRows));
    return { ...group, chunks };
  });
  const totalWidth = split.reduce((width, group, groupIndex) => {
    const groupWidth = group.chunks.length * subColumnWidth + Math.max(0, group.chunks.length - 1) * subColumnGap;
    return width + groupWidth + (groupIndex === split.length - 1 ? 0 : groupGap);
  }, 0);
  const positions = new Map<string, { x: number; y: number }>();
  const columns: ImmersiveFlattenColumn[] = [];
  let cursor = -totalWidth / 2;
  const tallest = Math.max(1, ...split.flatMap((group) => group.chunks.map((chunk) => chunk.length)));
  const topY = -((tallest - 1) / 2) * rowGap;
  split.forEach((group) => {
    const groupWidth = group.chunks.length * subColumnWidth + Math.max(0, group.chunks.length - 1) * subColumnGap;
    let minY = Infinity;
    let maxY = -Infinity;
    group.chunks.forEach((chunk, chunkIndex) => {
      const chunkX = cursor + chunkIndex * (subColumnWidth + subColumnGap) + subColumnWidth / 2;
      chunk.forEach((id, index) => {
        const y = topY + index * rowGap;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        positions.set(id, { x: chunkX, y });
      });
    });
    columns.push({
      kind: group.kind,
      label: group.label,
      x: cursor + groupWidth / 2,
      y: (minY + maxY) / 2,
      width: groupWidth,
      count: group.ids.length,
      nodeIds: group.ids
    });
    cursor += groupWidth + groupGap;
  });
  return { positions, columns };
}

export function layoutCapabilityFlatten(model: CapabilityModel): Map<string, { x: number; y: number }> {
  return layoutCapabilityFlattenLayout(model).positions;
}

/** Pure flattened projection used by the route editor; node/edge sets are unchanged. */
export function flattenCapabilityLayout(layout: ImmersiveCapabilityLayout, model: CapabilityModel, options?: FlattenLayoutOptions): ImmersiveCapabilityLayout {
  const { positions, columns } = layoutCapabilityFlattenLayout(model, options);
  const acquired = new Set((options?.acquiredNodeIds ?? model.currentKnowledgeIds).filter((id) => positions.has(id)));
  return {
    ...layout,
    columns,
    nodes: layout.nodes.map((node) => ({
      ...node,
      x: positions.get(node.id)?.x ?? node.x,
      y: positions.get(node.id)?.y ?? node.y,
      z: 0,
      current: acquired.has(node.id)
    })),
    edges: layout.edges.map((edge) => {
      const source = layout.nodes.find((node) => node.id === edge.source);
      const target = layout.nodes.find((node) => node.id === edge.target);
      const from = positions.get(edge.source) ?? { x: source?.x ?? 0, y: source?.y ?? 0 };
      const to = positions.get(edge.target) ?? { x: target?.x ?? 0, y: target?.y ?? 0 };
      return {
        ...edge,
        points: [
          { x: from.x, y: from.y, z: 4 },
          { x: to.x, y: to.y, z: 4 }
        ]
      };
    })
  };
}

/** N10 vertical execution path; coordinates are a pure function of step order. */
export function layoutVerticalRoute(nodeIds: readonly string[], viewportWidth = 760) {
  const unique = [...new Set(nodeIds)];
  return new Map(unique.map((id, index) => [id, {
    x: 0,
    y: -260 + index * 112
  }]));
}

export type VerticalRouteStep = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
};

export type VerticalRouteHeader = {
  id: string;
  chapterId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stepCount: number;
};

/**
 * N10 step flow: chapter strips and step rows occupy their own vertical slots,
 * top to bottom. No chapter label can sit on a step and no step is duplicated.
 */
export function layoutVerticalRouteFlow(steps: readonly VerticalRouteStep[], viewportWidth = 760) {
  const unique: VerticalRouteStep[] = [];
  const seen = new Set<string>();
  steps.forEach((step) => { if (!seen.has(step.id)) { seen.add(step.id); unique.push(step); } });
  const rowGap = viewportWidth >= 1000 ? 148 : 144;
  const headerHeight = 44;
  const headerGap = 92;
  const positions = new Map<string, { x: number; y: number }>();
  const headers: VerticalRouteHeader[] = [];
  let cursor = 0;
  let lastChapter = "";
  unique.forEach((step, index) => {
    if (step.chapterId !== lastChapter) {
      lastChapter = step.chapterId;
      // Keep a clear runway before each chapter strip: route cards are taller
      // than their layout slot and must never tuck under the strip.
      cursor += 44;
      const count = unique.filter((item) => item.chapterId === step.chapterId).length;
      headers.push({
        id: `route-chapter:${step.chapterId}:${index}`,
        chapterId: step.chapterId,
        title: `第 ${step.chapterNumber} 章 · ${step.chapterTitle}`,
        x: 0,
        y: cursor + headerHeight / 2,
        width: Math.min(520, viewportWidth - 40),
        height: headerHeight,
        stepCount: count
      });
      cursor += headerHeight + headerGap;
    }
    positions.set(step.id, { x: 0, y: cursor + 30 });
    cursor += rowGap;
  });
  const totalHeight = Math.max(1, cursor);
  const offset = -totalHeight / 2;
  positions.forEach((point, id) => positions.set(id, { x: point.x, y: point.y + offset }));
  headers.forEach((header) => { header.y += offset; });
  return { positions, headers };
}

export function routeNodePoints(layout: { nodes: Array<{ id: string; x: number; y: number; z: number }> }, nodeIds: readonly string[]) {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  return nodeIds.flatMap((id) => {
    const node = byId.get(id);
    return node ? [{ x: node.x, y: node.y, z: node.z + 4 }] : [];
  });
}

export type { CourseChapterTreeEdge };
