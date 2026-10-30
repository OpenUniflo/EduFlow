import { runDeterministicForceLayout } from "@/features/knowledge/graphLayout";
import type { KnowledgeEdge } from "@/features/knowledge/types";
import type { ArchiveEdge } from "./atlasModel";

export type AtlasPoint = { x: number; y: number };
export type AtlasBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type AtlasViewport = { width: number; height: number };
export type AtlasCamera = { scale: number; x: number; y: number };
export type AtlasInsets = { left?: number; right?: number; top?: number; bottom?: number };
export type AtlasGroup = {
  id: string;
  count: number;
  centroid: AtlasPoint;
  bounds: AtlasBounds;
  nodeIds: string[];
};
export type AtlasLayout = {
  structureKey: string;
  version: 6;
  positions: Record<string, AtlasPoint>;
  bounds: AtlasBounds;
  groups: AtlasGroup[];
};

export type AtlasLayoutNode = { id: string; domainId?: string };

export type AtlasCameraIntent =
  | { type: "all" }
  | { type: "mine" }
  | { type: "knowledge"; id: string }
  | { type: "course"; id?: string }
  | { type: "search"; ids: readonly string[] }
  | { type: "draft"; ids: readonly string[] }
  | { type: "people"; ids?: readonly string[] };

const LAYOUT_VERSION = 6;
const LAYOUT_STORAGE_KEY = "eduflow:archive:layout:v6";
const WORLD_WIDTH = 1560;
const WORLD_HEIGHT = 980;
const MIN_SCALE = 0.16;
const MAX_SCALE = 4.2;
const UNCLASSIFIED_GROUP = "__unclassified";
const GOLDEN_ANGLE = 2.399963229728653;

const layoutCache = new Map<string, AtlasLayout>();
let lastLayout: AtlasLayout | null = null;
let lastKey = "";

export function archiveStructureKey(nodes: readonly AtlasLayoutNode[], edges: readonly Pick<ArchiveEdge, "id" | "source" | "target" | "relation">[]) {
  // Domain membership participates in structural identity because it drives
  // deterministic clustering; camera/search/compare state never does.
  const nodePart = nodes.map((node) => `${node.id}:${node.domainId ?? ""}`).sort().join(",");
  const edgePart = edges.map((edge) => `${edge.id}:${edge.source}:${edge.relation}:${edge.target}`).sort().join(",");
  return `archive-v${LAYOUT_VERSION}|${nodePart.length}|${nodePart}|${edgePart}`;
}

function boundsOfPositions(positions: Readonly<Record<string, AtlasPoint>>, ids?: Iterable<string>): AtlasBounds {
  const values = (ids ? Array.from(ids) : Object.keys(positions)).flatMap((id) => positions[id] ? [positions[id]] : []);
  if (!values.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return {
    minX: Math.min(...values.map((value) => value.x)),
    minY: Math.min(...values.map((value) => value.y)),
    maxX: Math.max(...values.map((value) => value.x)),
    maxY: Math.max(...values.map((value) => value.y))
  };
}

function readStoredLayout(key: string): AtlasLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AtlasLayout;
    if (parsed.version !== LAYOUT_VERSION || parsed.structureKey !== key || !parsed.positions || !parsed.groups) return null;
    return { ...parsed, bounds: boundsOfPositions(parsed.positions) };
  } catch {
    return null;
  }
}

function storeLayout(layout: AtlasLayout) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage quota/privacy failure must not affect layout; module cache remains.
  }
}

function normalizeToWorld(positions: Record<string, AtlasPoint>) {
  const values = Object.values(positions);
  if (!values.length) return;
  const minX = Math.min(...values.map((value) => value.x));
  const maxX = Math.max(...values.map((value) => value.x));
  const minY = Math.min(...values.map((value) => value.y));
  const maxY = Math.max(...values.map((value) => value.y));
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min(WORLD_WIDTH / spanX, WORLD_HEIGHT / spanY) * 0.92;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  Object.values(positions).forEach((position) => {
    position.x = (position.x - centerX) * scale;
    position.y = (position.y - centerY) * scale;
  });
}

/**
 * Domain clusters are packed deterministically after the relation-driven force
 * pass: each domain keeps its internal edge structure, then its centroid is
 * moved to a non-overlapping slot around the largest domain. This makes the
 * layout readable as domains while staying a pure function of the facts.
 */
function packDomainClusters(positions: Record<string, AtlasPoint>, nodes: readonly AtlasLayoutNode[]) {
  const groups = new Map<string, string[]>();
  nodes.forEach((node) => {
    const key = node.domainId ?? UNCLASSIFIED_GROUP;
    groups.set(key, [...(groups.get(key) ?? []), node.id]);
  });
  const entries = [...groups.entries()].map(([id, ids]) => {
    let values = ids.map((nodeId) => positions[nodeId]).filter(Boolean);
    // Very large context domains are compressed so the learner's active
    // cluster keeps a readable share of the near camera (about 132%).
    const compression = ids.length > 120 ? 0.62 : ids.length > 90 ? 0.8 : 1;
    if (compression < 1 && values.length) {
      const center = {
        x: values.reduce((sum, value) => sum + value.x, 0) / values.length,
        y: values.reduce((sum, value) => sum + value.y, 0) / values.length
      };
      ids.forEach((nodeId) => {
        const point = positions[nodeId];
        if (!point) return;
        point.x = center.x + (point.x - center.x) * compression;
        point.y = center.y + (point.y - center.y) * compression;
      });
      values = ids.map((nodeId) => positions[nodeId]).filter(Boolean);
    }
    const centroid = values.length
      ? { x: values.reduce((sum, value) => sum + value.x, 0) / values.length, y: values.reduce((sum, value) => sum + value.y, 0) / values.length }
      : { x: 0, y: 0 };
    const spread = Math.sqrt(values.reduce((sum, value) => sum + (value.x - centroid.x) ** 2 + (value.y - centroid.y) ** 2, 0) / Math.max(1, values.length));
    const radius = Math.max(36, spread * 0.92 + 22);
    return { id, ids, centroid, radius };
  }).sort((left, right) => right.ids.length - left.ids.length || left.id.localeCompare(right.id));

  const placed: Array<{ x: number; y: number; radius: number }> = [];
  entries.forEach((entry, index) => {
    let center = { x: 0, y: 0 };
    if (index > 0) {
      let accepted = false;
      for (let attempt = 0; attempt < 160 && !accepted; attempt += 1) {
        const maxPlaced = Math.max(...placed.map((item) => item.radius));
        const distance = maxPlaced + entry.radius + 24 + Math.floor(attempt / 10) * 26;
        const baseAngles = [Math.PI, 0, -2.2, 2.2, -0.9, 0.9, -Math.PI / 2, Math.PI / 2];
        const angle = (baseAngles[(index - 1) % baseAngles.length] ?? index * GOLDEN_ANGLE) + attempt * 0.16;
        const candidate = { x: Math.cos(angle) * distance * 1.32, y: Math.sin(angle) * distance * 0.64 };
        accepted = placed.every((item) => Math.hypot(candidate.x - item.x, candidate.y - item.y) > item.radius + entry.radius + 18);
        if (accepted) center = candidate;
      }
      if (!accepted) center = { x: index * (entry.radius + 60), y: 0 };
    }
    placed.push({ ...center, radius: entry.radius });
    const dx = center.x - entry.centroid.x;
    const dy = center.y - entry.centroid.y;
    entry.ids.forEach((nodeId) => {
      const point = positions[nodeId];
      if (!point) return;
      point.x += dx;
      point.y += dy;
    });
  });
  // Prefer a 16:9 constellation over a tall column; this keeps the far fit
  // wide and the clusters readable next to the left course panel.
  Object.values(positions).forEach((point) => { point.y *= 0.72; });
}

function groupBounds(positions: Readonly<Record<string, AtlasPoint>>, ids: readonly string[]): AtlasBounds {
  return boundsOfPositions(positions, ids);
}

function buildGroups(positions: Record<string, AtlasPoint>, nodes: readonly AtlasLayoutNode[]): AtlasGroup[] {
  const groups = new Map<string, string[]>();
  nodes.forEach((node) => {
    const key = node.domainId ?? UNCLASSIFIED_GROUP;
    groups.set(key, [...(groups.get(key) ?? []), node.id]);
  });
  return [...groups.entries()].map(([id, nodeIds]) => {
    const values = nodeIds.flatMap((nodeId) => positions[nodeId] ? [positions[nodeId]] : []);
    const centroid = values.length
      ? { x: values.reduce((sum, value) => sum + value.x, 0) / values.length, y: values.reduce((sum, value) => sum + value.y, 0) / values.length }
      : { x: 0, y: 0 };
    return { id, count: nodeIds.length, nodeIds: nodeIds.slice().sort(), centroid, bounds: groupBounds(positions, nodeIds) };
  }).sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));
}

/**
 * The Archive has exactly one deterministic, relation-driven layout. It is a
 * pure function of the active node/edge set plus domain membership and is
 * cached by structural identity; every camera, search, comparison and course
 * focus reuses it.
 */
export function getArchiveLayout(
  nodes: readonly AtlasLayoutNode[],
  edges: readonly Pick<ArchiveEdge, "id" | "source" | "target" | "relation" | "strength">[]
): AtlasLayout {
  const key = archiveStructureKey(nodes, edges);
  if (lastLayout && lastKey === key) return lastLayout;
  const cached = layoutCache.get(key);
  if (cached) {
    lastLayout = cached;
    lastKey = key;
    return cached;
  }
  const stored = readStoredLayout(key);
  if (stored) {
    layoutCache.set(key, stored);
    lastLayout = stored;
    lastKey = key;
    return stored;
  }
  const nodeCount = nodes.length;
  const iterations = nodeCount > 1_200 ? 70 : nodeCount > 700 ? 140 : nodeCount > 380 ? 190 : 250;
  const layoutEdges = edges.slice().sort((left, right) => left.id.localeCompare(right.id)).map((edge) => ({ ...edge, reason: "relation-driven atlas layout" })) as KnowledgeEdge[];
  const raw = runDeterministicForceLayout(nodes.map((node) => node.id), layoutEdges, {
    dimensions: 2,
    iterations,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    // Fact edges still shape each cluster; repulsion keeps dense areas legible.
    repulsion: nodeCount > 700 ? 2400 : 3600,
    attraction: 0.0068,
    idealEdgeLength: nodeCount > 700 ? 44 : 76,
    centerStrength: 0.0022,
    collisionRadius: nodeCount > 700 ? 8 : 18,
    normalize: true
  });
  const positions: Record<string, AtlasPoint> = {};
  Object.entries(raw).forEach(([id, point]) => { positions[id] = { x: point.x, y: point.y }; });
  packDomainClusters(positions, nodes);
  normalizeToWorld(positions);
  const layout: AtlasLayout = {
    structureKey: key,
    version: LAYOUT_VERSION,
    positions,
    bounds: boundsOfPositions(positions),
    groups: buildGroups(positions, nodes)
  };
  layoutCache.set(key, layout);
  if (layoutCache.size > 4) layoutCache.delete(layoutCache.keys().next().value as string);
  lastLayout = layout;
  lastKey = key;
  storeLayout(layout);
  return layout;
}

/** Test/isolated-run helper: no positions are ever mutated by presentation. */
export function clearArchiveLayoutCache() {
  layoutCache.clear();
  lastLayout = null;
  lastKey = "";
}

export type AtlasLayoutQuality = {
  linkedMean: number;
  randomMean: number;
  linkedRatio: number;
  sameDomainMean: number | null;
  crossDomainMean: number | null;
  domainRatio: number | null;
  sampledPairs: number;
};

function mean(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function pairDistance(left: AtlasPoint, right: AtlasPoint) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

/**
 * Deterministic quality probe over the exact public positions. Linked pairs are
 * compared with a fixed-stride sample of all pairs; same-domain pairs are
 * compared with cross-domain pairs. No randomness is involved.
 */
export function measureAtlasLayoutQuality(
  layout: AtlasLayout,
  nodes: readonly AtlasLayoutNode[],
  edges: readonly Pick<ArchiveEdge, "source" | "target">[]
): AtlasLayoutQuality {
  const domainById = new Map(nodes.map((node) => [node.id, node.domainId ?? null]));
  const ids = nodes.map((node) => node.id).filter((id) => layout.positions[id]).sort();
  const stride = Math.max(1, Math.floor(ids.length / 160));
  const sampled = ids.filter((_, index) => index % stride === 0);
  const allPairs: number[] = [];
  const sameDomain: number[] = [];
  const crossDomain: number[] = [];
  for (let leftIndex = 0; leftIndex < sampled.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sampled.length; rightIndex += 1) {
      const leftId = sampled[leftIndex];
      const rightId = sampled[rightIndex];
      const distance = pairDistance(layout.positions[leftId], layout.positions[rightId]);
      allPairs.push(distance);
      const leftDomain = domainById.get(leftId);
      const rightDomain = domainById.get(rightId);
      if (!leftDomain || !rightDomain) continue;
      if (leftDomain === rightDomain) sameDomain.push(distance);
      else crossDomain.push(distance);
    }
  }
  const linked = edges.flatMap((edge) => layout.positions[edge.source] && layout.positions[edge.target]
    ? [pairDistance(layout.positions[edge.source], layout.positions[edge.target])]
    : []);
  const linkedMean = mean(linked);
  const randomMean = mean(allPairs);
  const sameDomainMean = sameDomain.length ? mean(sameDomain) : null;
  const crossDomainMean = crossDomain.length ? mean(crossDomain) : null;
  return {
    linkedMean,
    randomMean,
    linkedRatio: randomMean ? linkedMean / randomMean : 1,
    sameDomainMean,
    crossDomainMean,
    domainRatio: sameDomainMean !== null && crossDomainMean ? sameDomainMean / crossDomainMean : null,
    sampledPairs: allPairs.length
  };
}

export function boundsForIds(layout: AtlasLayout, ids: Iterable<string> | null | undefined, fallbackToAll = true): AtlasBounds {
  const selected = ids ? Array.from(ids).filter((id) => layout.positions[id]) : [];
  return selected.length ? boundsOfPositions(layout.positions, selected) : fallbackToAll ? layout.bounds : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
}

export function fitCamera(bounds: AtlasBounds, viewport: AtlasViewport, padding = 72, maxScale?: number, insets: AtlasInsets = {}): AtlasCamera {
  const left = Math.max(0, insets.left ?? 0);
  const right = Math.max(0, insets.right ?? 0);
  const top = Math.max(0, insets.top ?? 0);
  const bottom = Math.max(0, insets.bottom ?? 0);
  const availableWidth = Math.max(1, viewport.width - left - right);
  const availableHeight = Math.max(1, viewport.height - top - bottom);
  const width = Math.max(1, availableWidth - padding * 2);
  const height = Math.max(1, availableHeight - padding * 2);
  const spanX = Math.max(40, bounds.maxX - bounds.minX);
  const spanY = Math.max(40, bounds.maxY - bounds.minY);
  const fitted = Math.min(width / spanX, height / spanY);
  const scale = clampScale(maxScale ? Math.min(fitted, maxScale) : fitted);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    x: left + availableWidth / 2 - centerX * scale,
    y: top + availableHeight / 2 - centerY * scale
  };
}

export function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function zoomCamera(camera: AtlasCamera, factor: number, anchor?: AtlasPoint): AtlasCamera {
  const nextScale = clampScale(camera.scale * factor);
  if (nextScale === camera.scale) return camera;
  if (!anchor) return { ...camera, scale: nextScale };
  const worldX = (anchor.x - camera.x) / camera.scale;
  const worldY = (anchor.y - camera.y) / camera.scale;
  return { scale: nextScale, x: anchor.x - worldX * nextScale, y: anchor.y - worldY * nextScale };
}

export function panCamera(camera: AtlasCamera, dx: number, dy: number): AtlasCamera {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

export function worldToScreen(camera: AtlasCamera, point: AtlasPoint): AtlasPoint {
  return { x: point.x * camera.scale + camera.x, y: point.y * camera.scale + camera.y };
}

export function screenToWorld(camera: AtlasCamera, point: AtlasPoint): AtlasPoint {
  return { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale };
}

/** Default near camera: centre my subset in the area right of the course panel. */
export const MINE_LEFT_INSET = 372;
export const MINE_ZOOM_RATIO = 1.32;

export function cameraForIntent(input: {
  intent: AtlasCameraIntent;
  layout: AtlasLayout;
  viewport: AtlasViewport;
  mineNodeIds: ReadonlySet<string>;
  courseIds?: ReadonlySet<string>;
  peopleIds?: readonly ReadonlySet<string>[];
  knowledgeNeighborhood?: ReadonlySet<string>;
  insets?: AtlasInsets;
}): AtlasCamera {
  const { intent, layout, viewport, mineNodeIds } = input;
  const padding = Math.min(96, Math.max(52, Math.min(viewport.width, viewport.height) * 0.075));
  const allCamera = fitCamera(layout.bounds, viewport, padding);
  if (intent.type === "all") return fitCamera(layout.bounds, viewport, 54);
  if (intent.type === "mine") {
    if (!mineNodeIds.size) return fitCamera(layout.bounds, viewport, 54);
    return fitCamera(boundsForIds(layout, mineNodeIds, true), viewport, padding, allCamera.scale * MINE_ZOOM_RATIO, input.insets ?? { left: MINE_LEFT_INSET });
  }
  if (intent.type === "knowledge") {
    const id = intent.id;
    const neighborIds = input.knowledgeNeighborhood ? new Set([id, ...input.knowledgeNeighborhood]) : new Set([id]);
    return fitCamera(boundsForIds(layout, neighborIds, true), viewport, Math.max(120, padding * 1.6));
  }
  if (intent.type === "course") return fitCamera(boundsForIds(layout, input.courseIds ?? [], true), viewport, padding);
  if (intent.type === "search") return fitCamera(boundsForIds(layout, intent.ids, true), viewport, Math.max(100, padding * 1.2));
  if (intent.type === "draft") return fitCamera(boundsForIds(layout, intent.ids, true), viewport, Math.max(110, padding * 1.3));
  if (intent.type === "people") {
    const union = new Set<string>(mineNodeIds);
    (input.peopleIds ?? []).forEach((ids) => ids.forEach((id) => union.add(id)));
    return fitCamera(boundsForIds(layout, union, true), viewport, padding);
  }
  return allCamera;
}

export function cameraPercent(camera: AtlasCamera, allCamera: AtlasCamera) {
  if (!allCamera.scale) return 100;
  return Math.round(camera.scale / allCamera.scale * 100);
}
