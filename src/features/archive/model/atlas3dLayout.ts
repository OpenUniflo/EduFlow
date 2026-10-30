import type { ArchiveEdge } from "./atlasModel";

/**
 * One deterministic, relation-driven 3D force layout for the Archive.
 *
 * Domain, community, chapter and learner state are deliberately absent from
 * this module: only the active node/edge facts shape coordinates. The result is
 * cached by structural identity, so camera, selection, search, panels and
 * learning-state updates never move a node.
 */

export type Vec3 = { x: number; y: number; z: number };
export type Atlas3DBounds = { center: Vec3; radius: number; min: Vec3; max: Vec3 };
export type Atlas3DLayout = {
  version: 3;
  structureKey: string;
  positions: Record<string, Vec3>;
  bounds: Atlas3DBounds;
};

export type Atlas3DLayoutNode = { id: string };
type LayoutEdge = Pick<ArchiveEdge, "id" | "source" | "target" | "relation" | "strength">;

const LAYOUT_VERSION = 3;
const STORAGE_KEY = "eduflow:archive:3d-layout:v3";
const WORLD_RADIUS = 900;
const GOLDEN_ANGLE = 2.399963229728653;

const layoutCache = new Map<string, Atlas3DLayout>();
let lastLayout: Atlas3DLayout | null = null;
let lastKey = "";

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function archive3DStructureKey(
  nodes: readonly Atlas3DLayoutNode[],
  edges: readonly Pick<ArchiveEdge, "id" | "source" | "target" | "relation" | "strength">[]
) {
  const nodePart = nodes.map((node) => node.id).sort().join(",");
  const edgePart = edges
    .map((edge) => `${edge.id}:${edge.source}>${edge.target}:${edge.relation}:${edge.strength ?? ""}`)
    .sort()
    .join(",");
  return `archive3d-v${LAYOUT_VERSION}|${nodePart}|${edgePart}`;
}

function boundsOf(positions: Record<string, Vec3>): Atlas3DBounds {
  const values = Object.values(positions);
  if (!values.length) return { center: { x: 0, y: 0, z: 0 }, radius: 1, min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  values.forEach((value) => {
    min.x = Math.min(min.x, value.x); min.y = Math.min(min.y, value.y); min.z = Math.min(min.z, value.z);
    max.x = Math.max(max.x, value.x); max.y = Math.max(max.y, value.y); max.z = Math.max(max.z, value.z);
  });
  const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  const radius = Math.max(1, ...values.map((value) => Math.hypot(value.x - center.x, value.y - center.y, value.z - center.z)));
  return { center, radius, min, max };
}

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

function readStored(key: string): Atlas3DLayout | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Atlas3DLayout;
    if (parsed.version !== LAYOUT_VERSION || parsed.structureKey !== key || !parsed.positions) return null;
    return { ...parsed, bounds: boundsOf(parsed.positions) };
  } catch {
    return null;
  }
}

function store(layout: Atlas3DLayout) {
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* cache only */ }
}

function seedPositions(ids: readonly string[], random: () => number) {
  const positions = new Map<string, Vec3>();
  ids.forEach((id, index) => {
    // Fibonacci sphere gives an even, deterministic starting cloud; the small
    // seeded jitter only avoids perfectly symmetric local minima.
    const y = 1 - (index / Math.max(1, ids.length - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * index;
    const jitter = 0.22;
    positions.set(id, {
      x: Math.cos(theta) * radius * WORLD_RADIUS * 0.42 + (random() - 0.5) * WORLD_RADIUS * jitter,
      y: y * WORLD_RADIUS * 0.42 + (random() - 0.5) * WORLD_RADIUS * jitter,
      z: Math.sin(theta) * radius * WORLD_RADIUS * 0.42 + (random() - 0.5) * WORLD_RADIUS * jitter
    });
  });
  return positions;
}

function springLength(edge: LayoutEdge) {
  if (edge.relation === "related") return 118;
  if (edge.strength === "hard") return 66;
  if (edge.strength === "soft") return 92;
  return 76;
}

function springStrength(edge: LayoutEdge) {
  if (edge.relation === "related") return 0.018;
  return edge.strength === "hard" ? 0.055 : 0.034;
}

/**
 * Pure synchronous relaxation. O(n²) repulsion is intentionally bounded to the
 * local Archive size (a few hundred active Knowledge nodes); pair beyond the
 * cutoff is skipped before any square root work.
 */
export function computeAtlas3DLayout(
  nodes: readonly Atlas3DLayoutNode[],
  edges: readonly Pick<ArchiveEdge, "id" | "source" | "target" | "relation" | "strength">[]
): Atlas3DLayout {
  const key = archive3DStructureKey(nodes, edges);
  const ids = Array.from(new Set(nodes.map((node) => node.id))).sort();
  const idSet = new Set(ids);
  const random = rng(hashString(key));
  const positions = seedPositions(ids, random);
  const velocity = new Map<string, Vec3>(ids.map((id) => [id, { x: 0, y: 0, z: 0 }]));
  const springs = edges
    .filter((edge) => idSet.has(edge.source) && idSet.has(edge.target) && edge.source !== edge.target)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((edge) => ({ source: edge.source, target: edge.target, length: springLength(edge), strength: springStrength(edge) }));

  const count = ids.length;
  const iterations = count > 900 ? 90 : count > 500 ? 130 : count > 260 ? 175 : 240;
  const repulsion = count > 500 ? 6800 : 5600;
  const cutoff = 340;
  const cutoffSquared = cutoff * cutoff;
  const centerPull = 0.0018;
  const damping = 0.86;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const forces = new Map<string, Vec3>();
    ids.forEach((id) => forces.set(id, { x: 0, y: 0, z: 0 }));
    const cooling = 1 - iteration / (iterations * 1.15);

    for (let left = 0; left < count; left += 1) {
      const leftId = ids[left];
      const leftPosition = positions.get(leftId)!;
      for (let right = left + 1; right < count; right += 1) {
        const rightId = ids[right];
        const rightPosition = positions.get(rightId)!;
        let dx = leftPosition.x - rightPosition.x;
        let dy = leftPosition.y - rightPosition.y;
        let dz = leftPosition.z - rightPosition.z;
        const distanceSquared = dx * dx + dy * dy + dz * dz;
        if (distanceSquared > cutoffSquared || distanceSquared < 0.01) continue;
        const distance = Math.sqrt(distanceSquared);
        const strength = repulsion / (distanceSquared + 40);
        dx /= distance; dy /= distance; dz /= distance;
        const leftForce = forces.get(leftId)!;
        const rightForce = forces.get(rightId)!;
        leftForce.x += dx * strength; leftForce.y += dy * strength; leftForce.z += dz * strength;
        rightForce.x -= dx * strength; rightForce.y -= dy * strength; rightForce.z -= dz * strength;
      }
    }

    springs.forEach((spring) => {
      const source = positions.get(spring.source)!;
      const target = positions.get(spring.target)!;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = target.z - source.z;
      const distance = Math.hypot(dx, dy, dz) + 0.01;
      const strength = (distance - spring.length) * spring.strength / distance;
      const sourceForce = forces.get(spring.source)!;
      const targetForce = forces.get(spring.target)!;
      sourceForce.x += dx * strength; sourceForce.y += dy * strength; sourceForce.z += dz * strength;
      targetForce.x -= dx * strength; targetForce.y -= dy * strength; targetForce.z -= dz * strength;
    });

    ids.forEach((id) => {
      const position = positions.get(id)!;
      const force = forces.get(id)!;
      const velocityValue = velocity.get(id)!;
      force.x -= position.x * centerPull;
      force.y -= position.y * centerPull;
      force.z -= position.z * centerPull;
      velocityValue.x = (velocityValue.x + force.x) * damping;
      velocityValue.y = (velocityValue.y + force.y) * damping;
      velocityValue.z = (velocityValue.z + force.z) * damping;
      const maxStep = 34 * (0.35 + cooling * 0.65);
      velocityValue.x = Math.max(-maxStep, Math.min(maxStep, velocityValue.x));
      velocityValue.y = Math.max(-maxStep, Math.min(maxStep, velocityValue.y));
      velocityValue.z = Math.max(-maxStep, Math.min(maxStep, velocityValue.z));
      position.x += velocityValue.x * cooling;
      position.y += velocityValue.y * cooling;
      position.z += velocityValue.z * cooling;
    });
  }

  // Normalize to a stable world sphere without changing relative structure.
  const rawBounds = boundsOf(Object.fromEntries(positions));
  const rawSpanX = Math.max(1, rawBounds.max.x - rawBounds.min.x);
  const rawSpanY = Math.max(1, rawBounds.max.y - rawBounds.min.y);
  const rawSpanZ = Math.max(1, rawBounds.max.z - rawBounds.min.z);
  const widest = Math.max(rawSpanX, rawSpanY, rawSpanZ);
  // Gently widen the two axes that a front-ish camera compresses. This is an
  // isotropic-free normalisation only: topology and distances remain driven by
  // the factual springs, never by Domain or other metadata.
  const axisX = 1 + (widest / rawSpanX - 1) * 0.45;
  const axisZ = 1 + (widest / rawSpanZ - 1) * 0.3;
  const scale = WORLD_RADIUS / Math.max(1, rawBounds.radius);
  const normalized: Record<string, Vec3> = {};
  ids.forEach((id) => {
    const position = positions.get(id)!;
    normalized[id] = {
      x: (position.x - rawBounds.center.x) * scale * axisX,
      y: (position.y - rawBounds.center.y) * scale,
      z: (position.z - rawBounds.center.z) * scale * axisZ
    };
  });
  const normalizedBounds = boundsOf(normalized);
  const fitScale = WORLD_RADIUS / Math.max(1, normalizedBounds.radius);
  if (fitScale !== 1) {
    ids.forEach((id) => {
      normalized[id].x *= fitScale;
      normalized[id].y *= fitScale;
      normalized[id].z *= fitScale;
    });
  }
  return {
    version: LAYOUT_VERSION,
    structureKey: key,
    positions: normalized,
    bounds: boundsOf(normalized)
  };
}

export function getAtlas3DLayout(
  nodes: readonly Atlas3DLayoutNode[],
  edges: readonly Pick<ArchiveEdge, "id" | "source" | "target" | "relation" | "strength">[]
): Atlas3DLayout {
  const cached = readAtlas3DLayoutCache(nodes, edges);
  if (cached) return cached;
  const layout = computeAtlas3DLayout(nodes, edges);
  cacheAtlas3DLayout(layout);
  return layout;
}

/** Synchronous cache lookup used before deciding whether a worker is needed. */
export function readAtlas3DLayoutCache(
  nodes: readonly Atlas3DLayoutNode[],
  edges: readonly Pick<ArchiveEdge, "id" | "source" | "target" | "relation" | "strength">[]
): Atlas3DLayout | null {
  const key = archive3DStructureKey(nodes, edges);
  if (lastLayout && lastKey === key) return lastLayout;
  const cached = layoutCache.get(key);
  if (cached) { lastLayout = cached; lastKey = key; return cached; }
  const stored = readStored(key);
  if (stored) {
    layoutCache.set(key, stored);
    lastLayout = stored;
    lastKey = key;
    return stored;
  }
  return null;
}

export function cacheAtlas3DLayout(layout: Atlas3DLayout) {
  layoutCache.set(layout.structureKey, layout);
  if (layoutCache.size > 4) layoutCache.delete(layoutCache.keys().next().value as string);
  lastLayout = layout;
  lastKey = layout.structureKey;
  store(layout);
}

export function clearAtlas3DLayoutCache() {
  layoutCache.clear();
  lastLayout = null;
  lastKey = "";
}

export function defaultPositionsArray(layout: Atlas3DLayout, nodes: readonly Atlas3DLayoutNode[]) {
  const positions = new Float32Array(nodes.length * 3);
  nodes.forEach((node, index) => {
    const position = layout.positions[node.id];
    positions[index * 3] = position?.x ?? 0;
    positions[index * 3 + 1] = position?.y ?? 0;
    positions[index * 3 + 2] = position?.z ?? 0;
  });
  return positions;
}
