import { beforeEach, describe, expect, it } from "vitest";
import { clearAtlas3DLayoutCache, computeAtlas3DLayout } from "./atlas3dLayout";
import { clearPersonLayoutCache, computePersonLayout } from "./personLayout";
import type { ArchiveEdge } from "./atlasModel";

function buildGraph() {
  const core = ["c0", "c1", "c2", "c3"];
  const ring1 = Array.from({ length: 8 }, (_, index) => `a${index}`);
  const ring2 = Array.from({ length: 8 }, (_, index) => `b${index}`);
  const ring3 = Array.from({ length: 6 }, (_, index) => `c${index + 10}`);
  const nodes = [...core, ...ring1, ...ring2, ...ring3].map((id) => ({ id }));
  const edges: ArchiveEdge[] = [];
  let edgeIndex = 0;
  const link = (source: string, target: string) => {
    edges.push({ id: `e${edgeIndex++}`, source, target, relation: "prerequisite", strength: "hard" });
  };
  link("c0", "c1"); link("c1", "c2"); link("c2", "c3");
  ring1.forEach((id, index) => link(core[index % core.length], id));
  ring2.forEach((id, index) => link(ring1[index % ring1.length], id));
  ring3.forEach((id, index) => link(ring2[index % ring2.length], id));
  return { nodes, edges, core: new Set(core) };
}

beforeEach(() => { clearAtlas3DLayoutCache(); clearPersonLayoutCache(); });

describe("deterministic person-centred layout", () => {
  it("puts the selected person's Knowledge in a compact core and moves others outward by factual hop", () => {
    const graph = buildGraph();
    const base = computeAtlas3DLayout(graph.nodes, graph.edges);
    const layout = computePersonLayout({
      structureKey: base.structureKey,
      defaultPositions: base.positions,
      nodes: graph.nodes,
      edges: graph.edges,
      memberIds: graph.core
    });
    const radius = (id: string) => {
      const position = layout.positions[id];
      return Math.hypot(position.x, position.y, position.z);
    };
    graph.core.forEach((id) => expect(radius(id)).toBeLessThanOrEqual(layout.coreRadius + 0.001));
    expect(layout.coreRadius).toBeGreaterThan(20);
    const hop1 = Array.from({ length: 8 }, (_, index) => radius(`a${index}`));
    const hop2 = Array.from({ length: 8 }, (_, index) => radius(`b${index}`));
    const hop3 = Array.from({ length: 6 }, (_, index) => radius(`c${index + 10}`));
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(hop1)).toBeGreaterThan(layout.coreRadius);
    expect(mean(hop2)).toBeGreaterThan(mean(hop1));
    expect(mean(hop3)).toBeGreaterThan(mean(hop2));
    expect(Math.min(...hop1)).toBeGreaterThan(layout.coreRadius);
  });

  it("is deterministic and cached by structural revision plus person set", () => {
    const graph = buildGraph();
    const base = computeAtlas3DLayout(graph.nodes, graph.edges);
    const input = { structureKey: base.structureKey, defaultPositions: base.positions, nodes: graph.nodes, edges: graph.edges };
    const first = computePersonLayout({ ...input, memberIds: graph.core });
    const second = computePersonLayout({ ...input, memberIds: Array.from(graph.core).reverse() });
    expect(second).toBe(first);
    expect(second.positions).toEqual(first.positions);
    const other = computePersonLayout({ ...input, memberIds: ["a0", "a1"] });
    expect(other).not.toBe(first);
    expect(other.coreNodeIds).toEqual(["a0", "a1"]);
  });

  it("keeps the default direction so Domains stay recognisable", () => {
    const graph = buildGraph();
    const base = computeAtlas3DLayout(graph.nodes, graph.edges);
    const layout = computePersonLayout({ structureKey: base.structureKey, defaultPositions: base.positions, nodes: graph.nodes, edges: graph.edges, memberIds: graph.core });
    ["a0", "b3", "c11"].forEach((id) => {
      const original = base.positions[id];
      const moved = layout.positions[id];
      const dot = original.x * moved.x + original.y * moved.y + original.z * moved.z;
      expect(dot).toBeGreaterThan(0);
    });
  });
});
