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

  it("does not read Domain membership: the same facts always produce the same coordinates", () => {
    const withDomains = nodes.map((node, index) => ({ ...node, domainId: `domain-${index % 3}` }));
    const first = computeAtlas3DLayout(nodes, edges);
    const second = computeAtlas3DLayout(withDomains, edges);
    expect(second.positions).toEqual(first.positions);
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
