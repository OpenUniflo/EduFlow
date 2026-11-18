import type { ArchiveEdge } from "./atlasModel";
import type { Atlas3DLayout, Vec3 } from "./atlas3dLayout";

/**
 * Deterministic person-centred layout.
 *
 * The selected people's Knowledge forms a compact core at the origin. Every
 * other node is pushed outward by factual hop distance while keeping the
 * direction it had in the default layout, so Domains remain recognisable. The
 * result is keyed by structural revision + the selected person set and is only
 * ever a function of graph facts and that set.
 */

export type PersonLayoutEdge = Pick<ArchiveEdge, "id" | "source" | "target" | "relation" | "strength">;
export type PersonLayout = {
  positions: Record<string, Vec3>;
  hopByNodeId: Record<string, number>;
  coreRadius: number;
  coreNodeIds: string[];
  memberIds: string[];
};

type CacheEntry = { key: string; layout: PersonLayout };
const cache = new Map<string, PersonLayout>();
const MAX_CACHE = 8;

export function personLayoutKey(structureKey: string, memberIds: ReadonlySet<string> | readonly string[]) {
  return `${structureKey}|people:${Array.from(memberIds).sort().join(",")}`;
}

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

function hopsFrom(memberIds: ReadonlySet<string>, neighbours: ReadonlyMap<string, string[]>, nodeIds: readonly string[]) {
  const hop = new Map<string, number>(nodeIds.map((id) => [id, 99] as const));
  const queue: string[] = [];
  Array.from(memberIds).sort().forEach((id) => { hop.set(id, 0); queue.push(id); });
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    const nextHop = (hop.get(id) ?? 0) + 1;
    (neighbours.get(id) ?? []).forEach((neighbour) => {
      if ((hop.get(neighbour) ?? 99) <= nextHop) return;
      hop.set(neighbour, nextHop);
      queue.push(neighbour);
    });
  }
  return hop;
}

function relaxCore(
  positions: Map<string, Vec3>,
  memberIds: readonly string[],
  edges: readonly PersonLayoutEdge[],
  iterations: number
) {
  const memberSet = new Set(memberIds);
  const internal = edges.filter((edge) => memberSet.has(edge.source) && memberSet.has(edge.target) && edge.source !== edge.target);
  const velocity = new Map<string, Vec3>(memberIds.map((id) => [id, { x: 0, y: 0, z: 0 }]));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const forces = new Map<string, Vec3>(memberIds.map((id) => [id, { x: 0, y: 0, z: 0 }]));
    for (let left = 0; left < memberIds.length; left += 1) {
      const a = positions.get(memberIds[left])!;
      for (let right = left + 1; right < memberIds.length; right += 1) {
        const b = positions.get(memberIds[right])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        const distanceSquared = dx * dx + dy * dy + dz * dz;
        if (distanceSquared > 90_000 || distanceSquared < 0.01) continue;
        const distance = Math.sqrt(distanceSquared);
        const strength = 1900 / (distanceSquared + 18);
        dx /= distance; dy /= distance; dz /= distance;
        const fa = forces.get(memberIds[left])!;
        const fb = forces.get(memberIds[right])!;
        fa.x += dx * strength; fa.y += dy * strength; fa.z += dz * strength;
        fb.x -= dx * strength; fb.y -= dy * strength; fb.z -= dz * strength;
      }
    }
    internal.forEach((edge) => {
      const a = positions.get(edge.source)!;
      const b = positions.get(edge.target)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const distance = Math.hypot(dx, dy, dz) + 0.01;
      const length = edge.relation === "related" ? 82 : 54;
      const strength = (distance - length) * 0.035 / distance;
      const fa = forces.get(edge.source)!;
      const fb = forces.get(edge.target)!;
      fa.x += dx * strength; fa.y += dy * strength; fa.z += dz * strength;
      fb.x -= dx * strength; fb.y -= dy * strength; fb.z -= dz * strength;
    });
    memberIds.forEach((id) => {
      const position = positions.get(id)!;
      const force = forces.get(id)!;
      const vel = velocity.get(id)!;
      force.x -= position.x * 0.028;
      force.y -= position.y * 0.028;
      force.z -= position.z * 0.028;
      vel.x = (vel.x + force.x) * 0.82;
      vel.y = (vel.y + force.y) * 0.82;
      vel.z = (vel.z + force.z) * 0.82;
      const max = 18;
      vel.x = Math.max(-max, Math.min(max, vel.x));
      vel.y = Math.max(-max, Math.min(max, vel.y));
      vel.z = Math.max(-max, Math.min(max, vel.z));
      position.x += vel.x;
      position.y += vel.y;
      position.z += vel.z;
    });
  }
  const radius = Math.max(1, ...memberIds.map((id) => {
    const position = positions.get(id)!;
    return Math.hypot(position.x, position.y, position.z);
  }));
  const scale = Math.min(1, 132 / radius);
  memberIds.forEach((id) => {
    const position = positions.get(id)!;
    position.x *= scale; position.y *= scale; position.z *= scale;
  });
  return Math.max(24, Math.min(132, radius * scale));
}

/**
 * Pure person-centred projection over the frozen default layout.
 */
export function computePersonLayout(input: {
  structureKey: string;
  defaultPositions: Record<string, Vec3>;
  nodes: readonly { id: string }[];
  edges: readonly PersonLayoutEdge[];
  memberIds: ReadonlySet<string> | readonly string[];
}): PersonLayout {
  const memberIds = Array.from(new Set(input.memberIds)).filter((id) => input.defaultPositions[id]).sort();
  const key = personLayoutKey(input.structureKey, memberIds);
  const cached = cache.get(key);
  if (cached) return cached;
  const nodeIds = input.nodes.map((node) => node.id).filter((id) => input.defaultPositions[id]).sort();
  if (!memberIds.length) {
    const empty: PersonLayout = { positions: Object.fromEntries(nodeIds.map((id) => [id, { ...input.defaultPositions[id] }])), hopByNodeId: {}, coreRadius: 0, coreNodeIds: [], memberIds: [] };
    cache.set(key, empty);
    return empty;
  }

  const memberSet = new Set(memberIds);
  const centroid = memberIds.reduce((sum, id) => {
    const position = input.defaultPositions[id];
    sum.x += position.x; sum.y += position.y; sum.z += position.z;
    return sum;
  }, { x: 0, y: 0, z: 0 });
  centroid.x /= memberIds.length; centroid.y /= memberIds.length; centroid.z /= memberIds.length;

  const positions = new Map<string, Vec3>();
  memberIds.forEach((id) => {
    const position = input.defaultPositions[id];
    positions.set(id, { x: (position.x - centroid.x) * 0.3, y: (position.y - centroid.y) * 0.3, z: (position.z - centroid.z) * 0.3 });
  });
  const coreRadius = relaxCore(positions, memberIds, input.edges, input.nodes.length > 900 ? 80 : 130);

  const neighbours = new Map<string, string[]>();
  nodeIds.forEach((id) => neighbours.set(id, []));
  input.edges.forEach((edge) => {
    if (!neighbours.has(edge.source) || !neighbours.has(edge.target)) return;
    neighbours.get(edge.source)!.push(edge.target);
    neighbours.get(edge.target)!.push(edge.source);
  });
  const hop = hopsFrom(memberSet, neighbours, nodeIds);
  const random = rng(hashString(key));
  const radialTarget = new Map<string, number>();
  nodeIds.forEach((id) => {
    if (memberSet.has(id)) return;
    const base = input.defaultPositions[id];
    let dx = base.x - centroid.x;
    let dy = base.y - centroid.y;
    let dz = base.z - centroid.z;
    let distance = Math.hypot(dx, dy, dz);
    if (distance < 0.01) {
      dx = random() - 0.5; dy = random() - 0.5; dz = random() - 0.5;
      distance = Math.hypot(dx, dy, dz) || 1;
    }
    const h = Math.min(6, Math.max(1, hop.get(id) ?? 6));
    const radius = coreRadius + 74 + (h - 1) * 104 + random() * 26;
    radialTarget.set(id, radius);
    positions.set(id, { x: dx / distance * radius, y: dy / distance * radius, z: dz / distance * radius });
  });

  // One light global pass keeps rings from intersecting; the radial constraint
  // is re-applied afterwards so hop ordering is never broken by repulsion.
  const iterations = nodeIds.length > 900 ? 26 : 42;
  const velocity = new Map<string, Vec3>(nodeIds.map((id) => [id, { x: 0, y: 0, z: 0 }]));
  const edges = input.edges.filter((edge) => positions.has(edge.source) && positions.has(edge.target));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const forces = new Map<string, Vec3>(nodeIds.map((id) => [id, { x: 0, y: 0, z: 0 }]));
    for (let left = 0; left < nodeIds.length; left += 1) {
      const a = positions.get(nodeIds[left])!;
      for (let right = left + 1; right < nodeIds.length; right += 1) {
        const b = positions.get(nodeIds[right])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        const distanceSquared = dx * dx + dy * dy + dz * dz;
        if (distanceSquared > 160_000 || distanceSquared < 0.01) continue;
        const distance = Math.sqrt(distanceSquared);
        const strength = 1200 / (distanceSquared + 60);
        dx /= distance; dy /= distance; dz /= distance;
        const fa = forces.get(nodeIds[left])!;
        const fb = forces.get(nodeIds[right])!;
        fa.x += dx * strength; fa.y += dy * strength; fa.z += dz * strength;
        fb.x -= dx * strength; fb.y -= dy * strength; fb.z -= dz * strength;
      }
    }
    edges.forEach((edge) => {
      const a = positions.get(edge.source)!;
      const b = positions.get(edge.target)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const distance = Math.hypot(dx, dy, dz) + 0.01;
      const strength = (distance - 78) * 0.008 / distance;
      const fa = forces.get(edge.source)!;
      const fb = forces.get(edge.target)!;
      fa.x += dx * strength; fa.y += dy * strength; fa.z += dz * strength;
      fb.x -= dx * strength; fb.y -= dy * strength; fb.z -= dz * strength;
    });
    nodeIds.forEach((id) => {
      if (memberSet.has(id)) return;
      const position = positions.get(id)!;
      const force = forces.get(id)!;
      const vel = velocity.get(id)!;
      vel.x = (vel.x + force.x) * 0.8;
      vel.y = (vel.y + force.y) * 0.8;
      vel.z = (vel.z + force.z) * 0.8;
      position.x += vel.x; position.y += vel.y; position.z += vel.z;
      const radius = Math.hypot(position.x, position.y, position.z) || 1;
      const target = radialTarget.get(id) ?? coreRadius + 74;
      const next = Math.max(target * 0.97, radius);
      const scale = next / radius;
      position.x *= scale; position.y *= scale; position.z *= scale;
    });
  }

  const layout: PersonLayout = {
    positions: Object.fromEntries(nodeIds.map((id) => [id, positions.get(id) ?? { ...input.defaultPositions[id] }])),
    hopByNodeId: Object.fromEntries(nodeIds.map((id) => [id, hop.get(id) ?? 99])),
    coreRadius,
    coreNodeIds: memberIds.slice(),
    memberIds
  };
  cache.set(key, layout);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
  return layout;
}

export function clearPersonLayoutCache() {
  cache.clear();
}

export function personLayoutPositions(layout: PersonLayout) {
  return layout.positions;
}

export function personLayoutFromAtlas(
  layout: Atlas3DLayout,
  nodes: readonly { id: string }[],
  edges: readonly PersonLayoutEdge[],
  memberIds: ReadonlySet<string> | readonly string[]
) {
  return computePersonLayout({
    structureKey: layout.structureKey,
    defaultPositions: layout.positions,
    nodes,
    edges,
    memberIds
  });
}
