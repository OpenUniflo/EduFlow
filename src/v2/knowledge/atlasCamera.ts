import type { AtlasSceneEdge, AtlasSceneNode } from "./projections/atlasProjections";

export type PositionableAtlasNode = { id: string; x?: number; y?: number; z?: number; fx?: number; fy?: number; fz?: number };

export function atlasStructureKey(nodes: Pick<AtlasSceneNode, "id">[], edges: Pick<AtlasSceneEdge, "source" | "target" | "relation">[], variant: "global" | "personal") {
  return `${variant}|${nodes.map((node) => node.id).sort().join(",")}|${edges.map((edge) => `${edge.source}:${edge.relation}:${edge.target}`).sort().join(",")}`;
}

export function freezeAtlasNodePositions(nodes: PositionableAtlasNode[]) {
  nodes.forEach((node) => { node.fx = node.x; node.fy = node.y; node.fz = node.z; });
}

export function canonicalAtlasCamera(variant: "global" | "personal") {
  return { position: { x: 0, y: 0, z: variant === "personal" ? 520 : 620 }, lookAt: { x: 0, y: 0, z: 0 } };
}

export function resetAtlasCamera(variant: "global" | "personal", transition: (position: { x: number; y: number; z: number }, lookAt: { x: number; y: number; z: number }, duration: number) => void) {
  const camera = canonicalAtlasCamera(variant);
  transition(camera.position, camera.lookAt, 500);
}
