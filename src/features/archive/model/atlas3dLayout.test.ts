import { beforeEach, describe, expect, it } from "vitest";
import { archive3DStructureKey, clearAtlas3DLayoutCache, computeAtlas3DLayout, getAtlas3DLayout } from "./atlas3dLayout";
import type { ArchiveEdge } from "./atlasModel";

const nodes = Array.from({ length: 32 }, (_, index) => ({ id: `K${String(index).padStart(2, "0")}` }));
const edges: ArchiveEdge[] = nodes.slice(1).map((node, index) => ({
  id: `e${String(index).padStart(2, "0")}`,
  source: nodes[index % 8].id,
  target: node.id,
  relation: index % 5 === 0 ? "related" : index % 3 === 0 ? "enables" : "prerequisite",
  strength: index % 5 === 0 || index % 3 === 0 ? 1 : "hard"
}));

beforeEach(() => clearAtlas3DLayoutCache());

describe("deterministic relation-driven 3D archive layout", () => {
  it("is a pure function of node/edge facts, independent of input order", () => {
    const first = computeAtlas3DLayout(nodes, edges);
    const second = computeAtlas3DLayout([...nodes].reverse(), [...edges].reverse());
    expect(second.structureKey).toBe(first.structureKey);
    expect(second.positions).toEqual(first.positions);
    expect(second.bounds.radius).toBeGreaterThan(100);
  });

  it("caches by structural identity and never moves under presentation changes", () => {
    const layout = getAtlas3DLayout(nodes, edges);
    const snapshot = structuredClone(layout.positions);
    expect(getAtlas3DLayout(nodes, edges)).toBe(layout);
    expect(layout.positions).toEqual(snapshot);
    expect(archive3DStructureKey(nodes, edges)).toBe(layout.structureKey);
  });

  it("puts Domain membership into the structural key and recomputes when it changes", () => {
    const assigned = nodes.map((node, index) => ({ ...node, domainId: `domain-${index % 3}` }));
    const first = computeAtlas3DLayout(nodes, edges);
    const second = computeAtlas3DLayout(assigned, edges);
    expect(second.structureKey).not.toBe(first.structureKey);
    expect(second.positions).not.toEqual(first.positions);
    expect(archive3DStructureKey(assigned, edges)).toContain("@domain-0");
  });

  function clusterMetrics(layout: ReturnType<typeof computeAtlas3DLayout>, groups: Record<string, string[]>) {
    const metrics = Object.entries(groups).map(([id, groupIds]) => {
      const center = groupIds.reduce((sum, nodeId) => {
        const position = layout.positions[nodeId];
        return { x: sum.x + position.x, y: sum.y + position.y, z: sum.z + position.z };
      }, { x: 0, y: 0, z: 0 });
      center.x /= groupIds.length; center.y /= groupIds.length; center.z /= groupIds.length;
      const radius = Math.max(...groupIds.map((nodeId) => {
        const position = layout.positions[nodeId];
        return Math.hypot(position.x - center.x, position.y - center.y, position.z - center.z);
      }));
      return { id, center, radius };
    });
    const [a, b] = metrics;
    return { a, b, distance: Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y, a.center.z - b.center.z) };
  }

  function twoDomainGraph(crossEdges: number) {
    const a = Array.from({ length: 14 }, (_, index) => `A${String(index).padStart(2, "0")}`);
    const b = Array.from({ length: 14 }, (_, index) => `B${String(index).padStart(2, "0")}`);
    const clusterNodes = [
      ...a.map((id) => ({ id, domainId: "domain-a" })),
      ...b.map((id) => ({ id, domainId: "domain-b" }))
    ];
    const clusterEdges: ArchiveEdge[] = [];
    const add = (source: string, target: string) => clusterEdges.push({
      id: `e${clusterEdges.length}`,
      source,
      target,
      relation: "prerequisite",
      strength: "hard"
    });
    a.slice(1).forEach((id, index) => add(a[index], id));
    b.slice(1).forEach((id, index) => add(b[index], id));
    for (let index = 0; index < crossEdges; index += 1) add(a[index * 3], b[index * 3]);
    return { nodes: clusterNodes, edges: clusterEdges, groups: { a, b } };
  }

  it.each([0, 2])("keeps two Domains as separated clusters with %i cross-Domain edges", (crossEdges) => {
    const graph = twoDomainGraph(crossEdges);
    const before = structuredClone(graph.edges);
    const layout = computeAtlas3DLayout(graph.nodes, graph.edges);
    const metrics = clusterMetrics(layout, graph.groups);
    expect(metrics.distance).toBeGreaterThan((metrics.a.radius + metrics.b.radius) * 1.08);
    expect(metrics.distance).toBeGreaterThan(Math.max(metrics.a.radius, metrics.b.radius) * 2);
    // Layout never rewrites, adds or removes a factual edge.
    expect(graph.edges).toEqual(before);
    expect(archive3DStructureKey(graph.nodes, graph.edges)).toBe(layout.structureKey);
  });

  it("keeps linked Knowledge much closer than unrelated Knowledge", () => {
    const layout = computeAtlas3DLayout(nodes, edges);
    const linked = edges.map((edge) => {
      const a = layout.positions[edge.source];
      const b = layout.positions[edge.target];
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    });
    const ids = nodes.map((node) => node.id);
    const random: number[] = [];
    for (let index = 0; index < ids.length; index += 1) {
      for (let other = index + 1; other < ids.length; other += 1) {
        const a = layout.positions[ids[index]];
        const b = layout.positions[ids[other]];
        random.push(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
    }
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(linked)).toBeLessThan(mean(random) * 0.65);
  });
});
