import { describe, expect, it } from "vitest";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import { buildKnowledgeNeighborhood } from "./knowledgeMiniMap";

function graph(status: "explore" | "learned" = "explore"): KnowledgeGraph {
  const node = (id: string, title: string) => ({ id, title, description: "", scope: "global" as const, status: "active" as const, nodeType: "concept" as const, masteryCriteria: [], tags: [], createdAt: "", updatedAt: "" });
  return {
    nodes: [node("center", "Center"), node("b", "Beta"), node("a", "Alpha")],
    edges: [
      { id: "edge-1", source: "center", target: "a", relation: "prerequisite", strength: "hard", reason: "", lifecycleStatus: "active", createdAt: "", updatedAt: "" },
      { id: "edge-2", source: "b", target: "center", relation: "related", strength: "soft", reason: "", lifecycleStatus: "active", createdAt: "", updatedAt: "" },
      { id: "edge-3", source: "a", target: "b", relation: "related", strength: "soft", reason: "", lifecycleStatus: "active", createdAt: "", updatedAt: "" }
    ],
    knowledgeStates: [{ nodeId: "center", status }]
  } as unknown as KnowledgeGraph;
}

describe("knowledge mini map", () => {
  it("draws only real edges and a deterministic order", () => {
    const first = buildKnowledgeNeighborhood(graph(), "center");
    const second = buildKnowledgeNeighborhood(graph(), "center");
    expect(first).toEqual(second);
    expect(first.nodes.map((node) => node.id)).toEqual(["center", "a", "b"]);
    expect(first.edges.map((edge) => edge.id)).toEqual(["edge-1", "edge-2"]);
  });

  it("does not move nodes when the learner's state changes", () => {
    const before = buildKnowledgeNeighborhood(graph("explore"), "center");
    const after = buildKnowledgeNeighborhood(graph("learned"), "center");
    expect(after.nodes.map((node) => [node.id, node.x, node.y])).toEqual(before.nodes.map((node) => [node.id, node.x, node.y]));
  });

  it("ignores edges whose other endpoint is not visible", () => {
    const input = graph();
    input.nodes = input.nodes.filter((node) => node.id !== "b");
    const layout = buildKnowledgeNeighborhood(input, "center");
    expect(layout.nodes.map((node) => node.id)).toEqual(["center", "a"]);
    expect(layout.edges.map((edge) => edge.id)).toEqual(["edge-1"]);
  });
});
