import type { GraphCommunity } from "../knowledge/community";
import { getKnowledgeEdgeLayoutWeight, runDeterministicForceLayout } from "../knowledge/graphLayout";
import type { PotentialBridge } from "../knowledge/graphAlgorithms";
import type { KnowledgeEdge, KnowledgeGraphLayout } from "../knowledge/types";

export const PERSONAL_WORLD_WIDTH = 1440;
export const PERSONAL_WORLD_HEIGHT = 900;

type Point = { x: number; y: number };

function convexHull(points: Point[]) {
  if (points.length <= 2) return points;
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
  const cross = (origin: Point, left: Point, right: Point) =>
    (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  const lower: Point[] = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper: Point[] = [];
  [...sorted].reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  });
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function organicContour(points: Point[], padding = 68) {
  if (!points.length) return { path: "", bounds: { x: 0, y: 0, width: 0, height: 0 }, label: { x: 0, y: 0 } };
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
  let hull = convexHull(points);
  if (hull.length < 3) {
    const minX = Math.min(...points.map((point) => point.x)) - padding;
    const maxX = Math.max(...points.map((point) => point.x)) + padding;
    const minY = Math.min(...points.map((point) => point.y)) - padding;
    const maxY = Math.max(...points.map((point) => point.y)) + padding;
    const radiusX = Math.max(90, (maxX - minX) / 2);
    const radiusY = Math.max(75, (maxY - minY) / 2);
    return {
      path: `M${center.x - radiusX} ${center.y} C${center.x - radiusX} ${center.y - radiusY}, ${center.x + radiusX} ${center.y - radiusY}, ${center.x + radiusX} ${center.y} C${center.x + radiusX} ${center.y + radiusY}, ${center.x - radiusX} ${center.y + radiusY}, ${center.x - radiusX} ${center.y} Z`,
      bounds: { x: center.x - radiusX, y: center.y - radiusY, width: radiusX * 2, height: radiusY * 2 },
      label: { x: center.x - radiusX + 24, y: center.y - radiusY + 30 }
    };
  }
  hull = hull.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    return { x: point.x + (dx / distance) * padding, y: point.y + (dy / distance) * padding };
  });
  const midpoints = hull.map((point, index) => {
    const next = hull[(index + 1) % hull.length];
    return { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
  });
  let path = `M${midpoints[midpoints.length - 1].x} ${midpoints[midpoints.length - 1].y}`;
  hull.forEach((point, index) => {
    path += ` Q${point.x} ${point.y} ${midpoints[index].x} ${midpoints[index].y}`;
  });
  path += " Z";
  const minX = Math.min(...hull.map((point) => point.x));
  const maxX = Math.max(...hull.map((point) => point.x));
  const minY = Math.min(...hull.map((point) => point.y));
  const maxY = Math.max(...hull.map((point) => point.y));
  return {
    path,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    label: { x: minX + 24, y: minY + 30 }
  };
}

function assignVisibleNodesToCommunities(normalNodeIds: string[], edges: KnowledgeEdge[], communities: GraphCommunity[]) {
  const communityByNode = new Map<string, string>();
  communities.forEach((community) => community.nodeIds.forEach((id) => communityByNode.set(id, community.id)));
  normalNodeIds.filter((id) => !communityByNode.has(id)).sort().forEach((id) => {
    const weights = new Map<string, number>();
    edges.filter((edge) => edge.source === id || edge.target === id).forEach((edge) => {
      const neighbor = edge.source === id ? edge.target : edge.source;
      const communityId = communityByNode.get(neighbor);
      if (communityId) weights.set(communityId, (weights.get(communityId) ?? 0) + getKnowledgeEdgeLayoutWeight(edge));
    });
    const communityId = Array.from(weights).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
    if (communityId) communityByNode.set(id, communityId);
  });
  return communityByNode;
}

function stableUnit(id: string, salt: string) {
  let hash = 2166136261;
  for (const character of `${salt}:${id}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function buildCommunityInitialPositions(normalNodeIds: string[], communityByNode: Map<string, string>, communities: GraphCommunity[]) {
  const initial: KnowledgeGraphLayout = {};
  const radius = Math.min(360, 175 + communities.length * 34);
  const anchors = new Map<string, Point>();
  communities.forEach((community, index) => {
    const angle = index * 2.399963229728653 + 0.35;
    anchors.set(community.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.62 });
  });
  normalNodeIds.forEach((id) => {
    const anchor = anchors.get(communityByNode.get(id) ?? "") ?? { x: 0, y: 0 };
    const angle = stableUnit(id, "personal-angle") * Math.PI * 2;
    const distance = 34 + stableUnit(id, "personal-radius") * 88;
    initial[id] = { x: anchor.x + Math.cos(angle) * distance, y: anchor.y + Math.sin(angle) * distance };
  });
  return initial;
}

function initialPotentialPosition(id: string, bridges: PotentialBridge[], base: KnowledgeGraphLayout) {
  const relevantCoreIds = Array.from(new Set(bridges
    .filter((bridge) => bridge.missingNodeIds.includes(id))
    .flatMap((bridge) => bridge.pathNodeIds)
    .filter((nodeId) => base[nodeId])));
  const points = relevantCoreIds.map((nodeId) => base[nodeId]);
  const stableOffset = id.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0);
  if (!points.length) return { x: Math.sin(stableOffset) * 30, y: Math.cos(stableOffset) * 30 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length + Math.sin(stableOffset) * 22,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length + Math.cos(stableOffset) * 22
  };
}

export function buildPersonalForceLayout(
  normalNodeIds: string[],
  potentialNodeIds: string[],
  edges: KnowledgeEdge[],
  communities: GraphCommunity[],
  bridges: PotentialBridge[]
) {
  const normalSet = new Set(normalNodeIds);
  const normalEdges = edges.filter((edge) => normalSet.has(edge.source) && normalSet.has(edge.target));
  const communityByNode = assignVisibleNodesToCommunities(normalNodeIds, normalEdges, communities);
  const communityInitialPositions = buildCommunityInitialPositions(normalNodeIds, communityByNode, communities);
  const base = runDeterministicForceLayout(normalNodeIds, normalEdges, {
    dimensions: 2,
    iterations: 320,
    width: 1080,
    height: 620,
    repulsion: 6200,
    attraction: 0.009,
    idealEdgeLength: 112,
    centerStrength: 0.0012,
    collisionRadius: 64,
    initialPositions: communityInitialPositions
  });
  const initial: KnowledgeGraphLayout = { ...base };
  potentialNodeIds.forEach((id) => { initial[id] = initialPotentialPosition(id, bridges, base); });
  const allNodeIds = [...normalNodeIds, ...potentialNodeIds];
  const relaxed = potentialNodeIds.length ? runDeterministicForceLayout(allNodeIds, edges, {
    dimensions: 2,
    iterations: 180,
    repulsion: 2600,
    attraction: 0.009,
    idealEdgeLength: 105,
    centerStrength: 0,
    collisionRadius: 48,
    initialPositions: initial,
    fixedNodeIds: normalNodeIds,
    normalize: false
  }) : base;
  const positions: KnowledgeGraphLayout = Object.fromEntries(allNodeIds.map((id) => [id, {
    x: (relaxed[id]?.x ?? 0) + PERSONAL_WORLD_WIDTH / 2,
    y: (relaxed[id]?.y ?? 0) + PERSONAL_WORLD_HEIGHT / 2
  }]));
  const communityLayouts = communities.map((community) => {
    const visualNodeIds = normalNodeIds.filter((id) => communityByNode.get(id) === community.id);
    const contour = organicContour(visualNodeIds.map((id) => ({ x: positions[id].x, y: positions[id].y })));
    return { ...community, visualNodeIds, ...contour };
  });
  return { positions, communityByNode, communityLayouts };
}
