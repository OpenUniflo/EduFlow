import type { KnowledgeEdge, KnowledgeGraphLayout, KnowledgeRelation } from "./types";

export const relationLayoutWeights: Record<KnowledgeRelation, number> = {
  prerequisite: 1.35,
  "implementation-support": 1.12,
  "practice-support": 0.88,
  conceptual: 0.7,
  related: 0.5
};

export type ForceLayoutConfig = {
  dimensions?: 2 | 3;
  iterations?: number;
  width?: number;
  height?: number;
  depth?: number;
  repulsion?: number;
  attraction?: number;
  idealEdgeLength?: number;
  centerStrength?: number;
  damping?: number;
  collisionRadius?: number;
  initialPositions?: KnowledgeGraphLayout;
  fixedNodeIds?: Iterable<string>;
  normalize?: boolean;
};

type Vector = { x: number; y: number; z: number };

function hashNumber(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableInitialPosition(id: string, dimensions: 2 | 3): Vector {
  const first = hashNumber(id);
  const second = hashNumber(`${id}:y`);
  const third = hashNumber(`${id}:z`);
  const angle = (first / 4294967296) * Math.PI * 2;
  const radius = 90 + (second % 170);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.72,
    z: dimensions === 3 ? ((third % 260) - 130) : 0
  };
}

export function getKnowledgeEdgeLayoutWeight(edge: KnowledgeEdge) {
  return relationLayoutWeights[edge.relation] * Math.max(0.15, edge.strength ?? 1);
}

function normalizePositions(positions: Map<string, Vector>, width: number, height: number, depth: number, dimensions: 2 | 3) {
  const values = Array.from(positions.values());
  if (!values.length) return;
  const minX = Math.min(...values.map((value) => value.x));
  const maxX = Math.max(...values.map((value) => value.x));
  const minY = Math.min(...values.map((value) => value.y));
  const maxY = Math.max(...values.map((value) => value.y));
  const minZ = Math.min(...values.map((value) => value.z));
  const maxZ = Math.max(...values.map((value) => value.z));
  const xScale = width / Math.max(1, maxX - minX);
  const yScale = height / Math.max(1, maxY - minY);
  const zScale = dimensions === 3 ? depth / Math.max(1, maxZ - minZ) : Number.POSITIVE_INFINITY;
  const scale = Math.min(xScale, yScale, zScale) * 0.92;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  positions.forEach((position) => {
    position.x = (position.x - centerX) * scale;
    position.y = (position.y - centerY) * scale;
    position.z = dimensions === 3 ? (position.z - centerZ) * scale : 0;
  });
}

export function runDeterministicForceLayout(
  nodeIds: Iterable<string>,
  edges: KnowledgeEdge[],
  config: ForceLayoutConfig = {}
): KnowledgeGraphLayout {
  const ids = Array.from(new Set(nodeIds)).sort();
  const allowed = new Set(ids);
  const dimensions = config.dimensions ?? 2;
  const iterations = config.iterations ?? 240;
  const width = config.width ?? 1000;
  const height = config.height ?? 700;
  const depth = config.depth ?? 360;
  const repulsion = config.repulsion ?? 3200;
  const attraction = config.attraction ?? 0.007;
  const idealEdgeLength = config.idealEdgeLength ?? 105;
  const centerStrength = config.centerStrength ?? 0.0024;
  const damping = config.damping ?? 0.82;
  const collisionRadius = config.collisionRadius ?? 30;
  const fixed = new Set(config.fixedNodeIds ?? []);
  const positions = new Map<string, Vector>();
  const velocities = new Map<string, Vector>();
  ids.forEach((id) => {
    const initial = config.initialPositions?.[id];
    positions.set(id, initial ? { x: initial.x, y: initial.y, z: dimensions === 3 ? initial.z ?? 0 : 0 } : stableInitialPosition(id, dimensions));
    velocities.set(id, { x: 0, y: 0, z: 0 });
  });
  const activeEdges = edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const forces = new Map(ids.map((id) => [id, { x: 0, y: 0, z: 0 }]));
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      const leftId = ids[leftIndex];
      const left = positions.get(leftId) as Vector;
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        const rightId = ids[rightIndex];
        const right = positions.get(rightId) as Vector;
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        let dz = dimensions === 3 ? right.z - left.z : 0;
        let distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance < 0.001) {
          const angle = (hashNumber(`${leftId}:${rightId}`) / 4294967296) * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dz = dimensions === 3 ? 0.35 : 0;
          distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        const collisionBoost = distance < collisionRadius ? (collisionRadius - distance) * 1.8 : 0;
        const magnitude = repulsion / (distance * distance + 80) + collisionBoost;
        const fx = (dx / distance) * magnitude;
        const fy = (dy / distance) * magnitude;
        const fz = (dz / distance) * magnitude;
        const leftForce = forces.get(leftId) as Vector;
        const rightForce = forces.get(rightId) as Vector;
        leftForce.x -= fx; leftForce.y -= fy; leftForce.z -= fz;
        rightForce.x += fx; rightForce.y += fy; rightForce.z += fz;
      }
    }

    activeEdges.forEach((edge) => {
      const source = positions.get(edge.source) as Vector;
      const target = positions.get(edge.target) as Vector;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = dimensions === 3 ? target.z - source.z : 0;
      const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const weight = getKnowledgeEdgeLayoutWeight(edge);
      const desiredLength = idealEdgeLength / (0.72 + weight * 0.34);
      const magnitude = (distance - desiredLength) * attraction * weight;
      const fx = (dx / distance) * magnitude;
      const fy = (dy / distance) * magnitude;
      const fz = (dz / distance) * magnitude;
      const sourceForce = forces.get(edge.source) as Vector;
      const targetForce = forces.get(edge.target) as Vector;
      sourceForce.x += fx; sourceForce.y += fy; sourceForce.z += fz;
      targetForce.x -= fx; targetForce.y -= fy; targetForce.z -= fz;
    });

    ids.forEach((id) => {
      if (fixed.has(id)) return;
      const position = positions.get(id) as Vector;
      const velocity = velocities.get(id) as Vector;
      const force = forces.get(id) as Vector;
      force.x -= position.x * centerStrength;
      force.y -= position.y * centerStrength;
      force.z -= position.z * centerStrength;
      velocity.x = (velocity.x + force.x) * damping;
      velocity.y = (velocity.y + force.y) * damping;
      velocity.z = dimensions === 3 ? (velocity.z + force.z) * damping : 0;
      const speed = Math.max(1, Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2) / 18);
      position.x += velocity.x / speed;
      position.y += velocity.y / speed;
      position.z += velocity.z / speed;
    });
  }

  if (config.normalize !== false) normalizePositions(positions, width, height, depth, dimensions);
  return Object.fromEntries(Array.from(positions, ([id, position]) => [id, { x: position.x, y: position.y, z: dimensions === 3 ? position.z : undefined }]));
}
