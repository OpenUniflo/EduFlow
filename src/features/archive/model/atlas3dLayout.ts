import type { ArchiveEdge } from "./atlasModel";

/**
 * One deterministic, relation-driven 3D force layout for the Archive.
 *
 * Factual KnowledgeEdges decide which nodes connect. A weak same-Domain
 * attraction (Unclassified counts as one group) then compacts each Domain into
 * its own cluster, and a final group separation keeps the clusters visibly
 * apart without adding or removing any drawn edge. Domain membership is part
 * of the structural key; presentation state never moves a node.
 */

export type Vec3 = { x: number; y: number; z: number };
export type Atlas3DBounds = { center: Vec3; radius: number; min: Vec3; max: Vec3 };
export type Atlas3DLayout = {
  version: 4;
  structureKey: string;
  positions: Record<string, Vec3>;
  bounds: Atlas3DBounds;
};

export type Atlas3DLayoutNode = { id: string; domainId?: string };
type LayoutEdge = Pick<ArchiveEdge, "id" | "source" | "target" | "relation" | "strength">;

const LAYOUT_VERSION = 4;
const STORAGE_KEY = "eduflow:archive:3d-layout:v4";
const WORLD_RADIUS = 900;
const GOLDEN_ANGLE = 2.399963229728653;
const UNCLASSIFIED_GROUP = "__unclassified";
const GROUP_GAP = 90;

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

function groupId(node: Atlas3DLayoutNode) {
  return node.domainId?.trim() || UNCLASSIFIED_GROUP;
}

export function archive3DStructureKey(
  nodes: readonly Atlas3DLayoutNode[],
  edges: readonly Pick<ArchiveEdge, "id" | "source" | "target" | "relation" | "strength">[]
) {
  // Domain membership is structural for the default layout: an assignment
  // change must produce a new cached layout, never a live relayout.
  const nodePart = nodes
    .map((node) => `${node.id}@${groupId(node)}`)
    .sort()
    .join(",");
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

function fibonacciDirection(index: number, count: number) {
  if (count <= 1) return { x: 0, y: 0, z: 0 };
  const y = 1 - (index / (count - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN_ANGLE * index;
  return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
}

/**
 * Seed one compact cloud per Domain around a deterministic group direction.
 * These are only initial coordinates; the force pass below is still driven by
 * factual edges plus same-Domain attraction, never by fixed group anchors.
 */
function seedPositions(ids: readonly string[], groupOf: ReadonlyMap<string, string>, random: () => number) {
  const positions = new Map<string, Vec3>();
  const members = new Map<string, string[]>();
  ids.forEach((id) => {
    const group = groupOf.get(id) ?? UNCLASSIFIED_GROUP;
    members.set(group, [...(members.get(group) ?? []), id]);
  });
  const groups = [...members.entries()].sort(([left], [right]) => left.localeCompare(right));
  groups.forEach(([, groupIds], groupIndex) => {
    const direction = fibonacciDirection(groupIndex, groups.length);
    const centerRadius = groups.length > 1 ? WORLD_RADIUS * 0.56 : 0;
    const center = { x: direction.x * centerRadius, y: direction.y * centerRadius, z: direction.z * centerRadius };
    const localRadius = Math.min(210, 34 + Math.sqrt(groupIds.length) * 34);
    groupIds.forEach((id, index) => {
      const local = fibonacciDirection(index, groupIds.length);
      const jitter = localRadius * 0.18;
      positions.set(id, {
        x: center.x + local.x * localRadius + (random() - 0.5) * jitter,
        y: center.y + local.y * localRadius + (random() - 0.5) * jitter,
        z: center.z + local.z * localRadius + (random() - 0.5) * jitter
      });
    });
  });
  return positions;
}

type GroupBounds = { id: string; ids: string[]; center: Vec3; radius: number };

function groupBounds(positions: ReadonlyMap<string, Vec3>, members: ReadonlyMap<string, string[]>): GroupBounds[] {
  return [...members.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, ids]) => {
    const center = ids.reduce((sum, nodeId) => {
      const position = positions.get(nodeId)!;
      sum.x += position.x; sum.y += position.y; sum.z += position.z;
      return sum;
    }, { x: 0, y: 0, z: 0 });
    center.x /= Math.max(1, ids.length);
    center.y /= Math.max(1, ids.length);
    center.z /= Math.max(1, ids.length);
    const radius = Math.max(24, ...ids.map((nodeId) => {
      const position = positions.get(nodeId)!;
      return Math.hypot(position.x - center.x, position.y - center.y, position.z - center.z);
    }));
    return { id, ids, center, radius };
  });
}

/**
 * Same-Domain attraction gathers each group; this final translation pass keeps
 * group centres at least their own radii plus a gap apart. It moves whole
 * groups, so every within-Domain relation keeps its shape and the set of
 * drawn edges is unchanged.
 */
function separateGroups(positions: Map<string, Vec3>, members: ReadonlyMap<string, string[]>) {
  for (let iteration = 0; iteration < 96; iteration += 1) {
    const groups = groupBounds(positions, members);
    let moved = false;
    for (let left = 0; left < groups.length; left += 1) {
      for (let right = left + 1; right < groups.length; right += 1) {
        const a = groups[left];
        const b = groups[right];
        let dx = b.center.x - a.center.x;
        let dy = b.center.y - a.center.y;
        let dz = b.center.z - a.center.z;
        let distance = Math.hypot(dx, dy, dz);
        if (distance < 0.01) {
          dx = 0.31; dy = 0.47; dz = 0.83;
          distance = 1;
        }
        const required = (a.radius + b.radius) * 1.12 + GROUP_GAP;
        if (distance >= required) continue;
        const push = (required - distance) / distance * 0.52;
        a.ids.forEach((id) => {
          const position = positions.get(id)!;
          position.x -= dx * push; position.y -= dy * push; position.z -= dz * push;
        });
        b.ids.forEach((id) => {
          const position = positions.get(id)!;
          position.x += dx * push; position.y += dy * push; position.z += dz * push;
        });
        // Refresh centres before the next pair so every group is evaluated
        // against the positions that actually exist in this pass.
        a.center.x -= dx * push; a.center.y -= dy * push; a.center.z -= dz * push;
        b.center.x += dx * push; b.center.y += dy * push; b.center.z += dz * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  // Re-centre the settled cluster cloud without changing inter-group spacing.
  const all = [...positions.values()];
  const center = all.reduce((sum, position) => ({ x: sum.x + position.x, y: sum.y + position.y, z: sum.z + position.z }), { x: 0, y: 0, z: 0 });
  center.x /= Math.max(1, all.length); center.y /= Math.max(1, all.length); center.z /= Math.max(1, all.length);
  all.forEach((position) => { position.x -= center.x; position.y -= center.y; position.z -= center.z; });
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
  const domainByNode = new Map<string, string>();
  nodes.forEach((node) => domainByNode.set(node.id, groupId(node)));
  const ids = Array.from(new Set(nodes.map((node) => node.id))).sort();
  const idSet = new Set(ids);
  const groupOf = new Map(ids.map((id) => [id, domainByNode.get(id) ?? UNCLASSIFIED_GROUP]));
  const members = new Map<string, string[]>();
  ids.forEach((id) => {
    const group = groupOf.get(id)!;
    members.set(group, [...(members.get(group) ?? []), id]);
  });
  const random = rng(hashString(key));
  const positions = seedPositions(ids, groupOf, random);
  const velocity = new Map<string, Vec3>(ids.map((id) => [id, { x: 0, y: 0, z: 0 }]));
  const springs = edges
    .filter((edge) => idSet.has(edge.source) && idSet.has(edge.target) && edge.source !== edge.target)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((edge) => ({
      source: edge.source,
      target: edge.target,
      length: springLength(edge),
      strength: springStrength(edge) * (groupOf.get(edge.source) === groupOf.get(edge.target) ? 1 : 0.45)
    }));

  const count = ids.length;
  const iterations = count > 900 ? 90 : count > 500 ? 130 : count > 260 ? 175 : 240;
  const repulsion = count > 500 ? 6800 : 5600;
  const cutoff = 340;
  const cutoffSquared = cutoff * cutoff;
  const centerPull = 0.0018;
  const damping = 0.86;
  const domainPull = 0.0042;
  const domainRest = 34;

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
        const sameDomain = groupOf.get(leftId) === groupOf.get(rightId);
        // Same-Domain pairs keep attracting at any distance; unrelated pairs
        // skip early beyond the repulsion cutoff.
        if (!sameDomain && distanceSquared > cutoffSquared) continue;
        if (distanceSquared < 0.01) continue;
        const distance = Math.sqrt(distanceSquared);
        const strength = repulsion / (distanceSquared + 40);
        dx /= distance; dy /= distance; dz /= distance;
        const leftForce = forces.get(leftId)!;
        const rightForce = forces.get(rightId)!;
        leftForce.x += dx * strength; leftForce.y += dy * strength; leftForce.z += dz * strength;
        rightForce.x -= dx * strength; rightForce.y -= dy * strength; rightForce.z -= dz * strength;
        if (sameDomain) {
          const pull = (distance - domainRest) * domainPull / distance;
          leftForce.x -= dx * pull; leftForce.y -= dy * pull; leftForce.z -= dz * pull;
          rightForce.x += dx * pull; rightForce.y += dy * pull; rightForce.z += dz * pull;
        }
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

  separateGroups(positions, members);

  // Normalize uniformly into a stable world sphere. A non-uniform widening
  // would stretch a Domain's internal radius and erase the separation the
  // cluster pass just established.
  const rawBounds = boundsOf(Object.fromEntries(positions));
  const scale = WORLD_RADIUS / Math.max(1, rawBounds.radius);
  const normalized: Record<string, Vec3> = {};
  ids.forEach((id) => {
    const position = positions.get(id)!;
    normalized[id] = {
      x: (position.x - rawBounds.center.x) * scale,
      y: (position.y - rawBounds.center.y) * scale,
      z: (position.z - rawBounds.center.z) * scale
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
