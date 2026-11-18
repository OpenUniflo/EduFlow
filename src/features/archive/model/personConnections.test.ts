import { describe, expect, it } from "vitest";
import { personConnections, personEdgeStyles } from "./personConnections";
import { oneHopSelection } from "@/shared/scene/selection";

const nodeIds = (count: number, prefix: string) => Array.from({ length: count }, (_unused, index) => `${prefix}${index + 1}`);

describe("person-centred Archive connections", () => {
  it("keeps only the four real direct edges in a sparse LOCAL_ADMIN-like core", () => {
    const core = nodeIds(14, "K");
    const edges = [
      { id: "d1", source: "K1", target: "K2" },
      { id: "d2", source: "K1", target: "K3" },
      { id: "d3", source: "K4", target: "K5" },
      { id: "d4", source: "K4", target: "K6" }
    ];
    const bridges = nodeIds(8, "B");
    bridges.forEach((bridge, index) => {
      edges.push({ id: `b${index}a`, source: bridge, target: core[index] });
      edges.push({ id: `b${index}b`, source: bridge, target: core[(index + 7) % core.length] });
    });
    // A one-hop leaf is not a bridge (it joins only one core Knowledge).
    edges.push({ id: "leaf", source: "K2", target: "LEAF" });
    const plan = personConnections({
      people: [{ colorKey: "me", nodeIds: new Set(core) }],
      edges,
      nodeIds: [...core, ...bridges, "LEAF"]
    });
    expect(plan.coreNodeIds).toEqual(core);
    expect(plan.directEdges.map((edge) => edge.id)).toEqual(["d1", "d2", "d3", "d4"]);
    expect(plan.directEdges.every((edge) => edge.colorKey === "me")).toBe(true);
    expect(plan.bridgeNodeIds).toEqual(bridges);
    expect(plan.bridgeEdges).toHaveLength(16);
    expect(plan.bridgeEdges.some((edge) => edge.source === "LEAF" || edge.target === "LEAF")).toBe(false);
  });

  it("uses each person's colour only when both endpoints are theirs", () => {
    const people = [
      { colorKey: "me", nodeIds: new Set(["K1", "K2"]) },
      { colorKey: "orange", nodeIds: new Set(["K2", "K3"]) }
    ];
    const plan = personConnections({
      people,
      edges: [
        { id: "mine", source: "K1", target: "K2" },
        { id: "theirs", source: "K2", target: "K3" },
        { id: "cross", source: "K1", target: "K3" }
      ],
      nodeIds: ["K1", "K2", "K3", "X", "Y"]
    });
    expect(plan.coreNodeIds).toEqual(["K1", "K2", "K3"]);
    // K2 is shared by both people, so its incident edges are neutral.
    expect(plan.directEdges.find((edge) => edge.id === "mine")?.colorKey).toBeNull();
    expect(plan.directEdges.find((edge) => edge.id === "theirs")?.colorKey).toBeNull();
    expect(plan.directEdges.find((edge) => edge.id === "cross")?.colorKey).toBeNull();
    // The shared node itself still belongs to both owners.
    expect(plan.coreNodeIds).toEqual(["K1", "K2", "K3"]);
  });

  it("bridges across two people and ignores one-person leaves", () => {
    const plan = personConnections({
      people: [
        { colorKey: "me", nodeIds: new Set(["K1", "K2"]) },
        { colorKey: "orange", nodeIds: new Set(["K3"]) }
      ],
      edges: [
        { id: "x1", source: "X", target: "K1" },
        { id: "x2", source: "X", target: "K3" },
        { id: "y1", source: "Y", target: "K1" },
        { id: "k1", source: "K1", target: "K2" }
      ],
      nodeIds: ["K1", "K2", "K3", "X", "Y"]
    });
    expect(plan.bridgeNodeIds).toEqual(["X"]);
    expect(plan.bridgeEdges.map((edge) => edge.id).sort()).toEqual(["x1", "x2"]);
    // K1-K2 is a direct edge; K3 has no factual edge to either of them.
    expect(plan.directEdges.map((edge) => edge.id)).toEqual(["k1"]);
  });

  it("never fabricates facts for an isolated person", () => {
    const plan = personConnections({
      people: [{ colorKey: "me", nodeIds: new Set(["A"]) }],
      edges: [{ id: "ab", source: "A", target: "B" }],
      nodeIds: ["A", "B"]
    });
    expect(plan.directEdges).toEqual([]);
    expect(plan.bridgeNodeIds).toEqual([]);
    expect(plan.bridgeEdges).toEqual([]);
  });

  it("gives an explicit selection priority over the person edge styles", () => {
    const core = ["K1", "K2", "K3", "K4"];
    const edges = [
      { id: "d1", source: "K1", target: "K2" },
      { id: "d2", source: "K3", target: "K4" },
      { id: "b1", source: "K1", target: "B1" },
      { id: "b2", source: "K2", target: "B1" },
      { id: "o1", source: "K3", target: "O1" }
    ];
    const plan = personConnections({
      people: [{ colorKey: "me", nodeIds: new Set(core) }],
      edges,
      nodeIds: [...core, "B1", "O1"]
    });
    expect(plan.directEdges.map((edge) => edge.id)).toEqual(["d1", "d2"]);
    expect(plan.bridgeEdges.map((edge) => edge.id)).toEqual(["b1", "b2"]);

    // Deselected: the person network owns its own two weights.
    const resting = personEdgeStyles({
      edges,
      directEdges: plan.directEdges,
      bridgeEdges: plan.bridgeEdges
    });
    expect(resting.find((edge) => edge.id === "d1")?.style).toBe("direct");
    expect(resting.find((edge) => edge.id === "b1")?.style).toBe("bridge");

    // Selected K1: selection rules. The incident one-hop edges are selection,
    // the unrelated direct / bridge edges fall back to the dim background and
    // no direct-edge style survives.
    const selection = oneHopSelection({
      selectedIds: ["K1"],
      nodeIds: [...core, "B1", "O1"],
      edges
    });
    const selected = personEdgeStyles({
      selectedId: "K1",
      selectionEdgeIds: selection.edgeIds,
      edges,
      directEdges: plan.directEdges,
      bridgeEdges: plan.bridgeEdges
    });
    expect(selection.edgeIds.has("d1")).toBe(true);
    expect(selection.edgeIds.has("b1")).toBe(true);
    expect(selected.find((edge) => edge.id === "d1")?.style).toBe("selection");
    expect(selected.find((edge) => edge.id === "b1")?.style).toBe("selection");
    expect(selected.find((edge) => edge.id === "d2")?.style).toBe("dim");
    expect(selected.find((edge) => edge.id === "b2")?.style).toBe("dim");
    expect(selected.some((edge) => edge.style === "direct" || edge.style === "bridge")).toBe(false);
    expect(selected.filter((edge) => edge.style === "selection").map((edge) => edge.id).sort()).toEqual(["b1", "d1"]);
  });
});
