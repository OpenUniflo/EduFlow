import { describe, expect, it } from "vitest";
import { detectAtlasCommunities, type CommunityNode } from "./atlasCommunities";
import type { ArchiveEdge } from "./atlasModel";

const nodes: CommunityNode[] = [
  { id: "a1", title: "检索", domainId: "d1" },
  { id: "a2", title: "向量", domainId: "d1" },
  { id: "a3", title: "召回", domainId: "d1" },
  { id: "a4", title: "提示", domainId: "d1" },
  { id: "a5", title: "模板", domainId: "d1" },
  { id: "a6", title: "少样本", domainId: "d1" },
  { id: "b1", title: "工具", domainId: "d2" },
  { id: "b2", title: "调用", domainId: "d2" },
  { id: "u1", title: "未分类一" }
];

const edges: ArchiveEdge[] = [
  { id: "e1", source: "a1", target: "a2", relation: "prerequisite", strength: "hard" },
  { id: "e2", source: "a2", target: "a3", relation: "enables", strength: 1 },
  { id: "e3", source: "a1", target: "a3", relation: "related", strength: 1 },
  { id: "e4", source: "a4", target: "a5", relation: "prerequisite", strength: "hard" },
  { id: "e5", source: "a5", target: "a6", relation: "enables", strength: 1 },
  { id: "e6", source: "b1", target: "b2", relation: "prerequisite", strength: "hard" }
];

describe("deterministic topic communities", () => {
  it("partitions each Domain using only internal factual edges", () => {
    const communities = detectAtlasCommunities(nodes, edges);
    expect(communities.length).toBeGreaterThanOrEqual(3);
    const all = communities.flatMap((community) => community.nodeIds);
    expect(new Set(all).size).toBe(nodes.length);
    communities.forEach((community) => {
      const domain = community.nodeIds[0] === "u1" ? null : community.nodeIds[0].startsWith("a") ? "d1" : "d2";
      community.nodeIds.forEach((id) => {
        expect(nodes.find((node) => node.id === id)?.domainId ?? null).toBe(domain);
      });
    });
    const retrieval = communities.find((community) => community.nodeIds.includes("a1"));
    const prompting = communities.find((community) => community.nodeIds.includes("a4"));
    expect(retrieval?.nodeIds).toEqual(["a1", "a2", "a3"]);
    expect(prompting?.nodeIds).toEqual(["a4", "a5", "a6"]);
    expect(retrieval?.name).toBe("检索");
  });

  it("is stable under edge order reversal and repeated runs", () => {
    const first = detectAtlasCommunities(nodes, edges);
    const second = detectAtlasCommunities([...nodes].reverse(), [...edges].reverse());
    expect(second).toEqual(first);
    expect(detectAtlasCommunities(nodes, edges)).toEqual(first);
  });

  it("names a group by internal degree, breaking ties by the smaller node id", () => {
    const communities = detectAtlasCommunities(nodes, edges);
    const tools = communities.find((community) => community.nodeIds.includes("b1"));
    expect(tools?.name).toBe("工具");
    expect(tools?.nodeIds).toEqual(["b1", "b2"]);
  });
});

describe("large-map topic merging", () => {
  function buildLargeMap() {
    const mapNodes: CommunityNode[] = [];
    const mapEdges: ArchiveEdge[] = [];
    let edgeIndex = 0;
    // 14 healthy groups of 6 plus one 3-node fragment that must be folded in.
    for (let group = 0; group < 15; group += 1) {
      const size = group === 14 ? 3 : 6;
      for (let member = 0; member < size; member += 1) {
        mapNodes.push({ id: `g${String(group).padStart(2, "0")}-${member}`, title: `知识 ${group}-${member}`, domainId: "domain-a" });
        if (member > 0) {
          mapEdges.push({
            id: `large-${edgeIndex++}`,
            source: `g${String(group).padStart(2, "0")}-0`,
            target: `g${String(group).padStart(2, "0")}-${member}`,
            relation: "prerequisite",
            strength: "hard"
          });
        }
      }
    }
    // A factual bridge joins the fragment to group 0 so the fold is meaningful.
    mapEdges.push({ id: `large-${edgeIndex++}`, source: "g14-0", target: "g00-1", relation: "related", strength: 1 });
    return { mapNodes, mapEdges };
  }

  it("folds undersized groups and keeps the map reading at 8–14 topics", () => {
    const { mapNodes, mapEdges } = buildLargeMap();
    const communities = detectAtlasCommunities(mapNodes, mapEdges);
    expect(communities.length).toBeGreaterThanOrEqual(8);
    expect(communities.length).toBeLessThanOrEqual(14);
    expect(communities.every((community) => community.size >= 6)).toBe(true);
    expect(new Set(communities.flatMap((community) => community.nodeIds)).size).toBe(mapNodes.length);
  });

  it("caps a dense 20-group map at 14 deterministically", () => {
    const denseNodes: CommunityNode[] = [];
    const denseEdges: ArchiveEdge[] = [];
    for (let group = 0; group < 20; group += 1) {
      for (let member = 0; member < 6; member += 1) {
        denseNodes.push({ id: `d${String(group).padStart(2, "0")}-${member}`, title: `密集 ${group}-${member}`, domainId: "domain-a" });
        if (member > 0) denseEdges.push({ id: `dense-${group}-${member}`, source: `d${String(group).padStart(2, "0")}-0`, target: `d${String(group).padStart(2, "0")}-${member}`, relation: "enables", strength: 1 });
      }
    }
    const first = detectAtlasCommunities(denseNodes, denseEdges);
    const second = detectAtlasCommunities([...denseNodes].reverse(), [...denseEdges].reverse());
    expect(first.length).toBe(14);
    expect(second).toEqual(first);
  });
});
