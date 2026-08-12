import { describe, expect, it } from "vitest";
import { edge, node, systemNode } from "./graphOperations";
import { createBlankWorkflow, createPaletteNode, getUniqueWorkflowName } from "./workflowFactory";
import { addEdge, deleteCustomWorkflow, deleteEdge, deleteNode, reconnectEdge, renameNode, renameWorkflow, updateControlBranch } from "../editor/workflowEditorOperations";
import type { WorkflowDefinition } from "./types";

function definition(): WorkflowDefinition {
  return {
    id: "flow",
    name: "Flow",
    description: "Flow",
    nodes: [systemNode("start", "START", 0, 0), node("router", "Router", "Router", "router", 100, 0, [], [], "route", { branches: ["a"] }), node("task", "Task", "Task", "function", 200, 0, [], ["final_answer"], "task"), systemNode("end", "END", 300, 0)],
    edges: [edge("e-start", "start", "router"), edge("e-a", "router", "task", "a"), edge("e-end", "task", "end")],
    runOrder: ["start", "e-start", "router", "e-a", "task", "e-end", "end"],
    result: "ok",
    code: ""
  };
}

describe("Workflow domain and editor operations", () => {
  it("creates stable blank workflow structure and unique names", () => {
    const blank = createBlankWorkflow("New", 42);
    expect(blank.id).toBe("blank-42");
    expect(blank.nodes.map((item) => item.id)).toEqual(["start", "end"]);
    expect(getUniqueWorkflowName("New", [blank])).toBe("New 2");
    expect(createPaletteNode({ label: "LLM Node", kind: "llm" }, 2, blank.nodes).kind).toBe("llm");
  });

  it("renames workflows without collisions and only deletes custom workflows", () => {
    const custom = createBlankWorkflow("Flow", 7);
    const renamed = renameWorkflow([definition(), custom], custom.id, "Flow");
    expect(renamed.find((item) => item.id === custom.id)?.name).toBe("Flow 2");
    expect(deleteCustomWorkflow(renamed, "flow")).toBe(renamed);
    expect(deleteCustomWorkflow(renamed, custom.id).some((item) => item.id === custom.id)).toBe(false);
  });

  it("renames and deletes nodes while preserving graph references", () => {
    const renamed = renameNode(definition(), "task", "Answer");
    expect(renamed.result).toEqual({ ok: true, name: "Answer" });
    expect(renamed.definition.edges.some((item) => item.to === "Answer")).toBe(true);
    expect(renamed.definition.runOrder).toContain("Answer");
    expect(renameNode(definition(), "start", "Begin").result.ok).toBe(false);
    const deleted = deleteNode(renamed.definition, "Answer");
    expect(deleted.nodes.some((item) => item.id === "Answer")).toBe(false);
    expect(deleted.edges.some((item) => item.from === "Answer" || item.to === "Answer")).toBe(false);
    expect(deleteNode(definition(), "start")).toEqual(definition());
  });

  it("keeps control branches aligned through edge add, reconnect, update, and delete", () => {
    const extra = edge("e-b", "router", "end", "b", "right", "left");
    const added = addEdge(definition(), extra);
    expect(added.nodes.find((item) => item.id === "router")?.control?.branches).toContain("b");
    const reconnected = reconnectEdge(added, "e-b", { source: "task", target: "end", sourceHandle: "right", targetHandle: "left" });
    expect(reconnected.nodes.find((item) => item.id === "router")?.control?.branches).not.toContain("b");
    const updated = updateControlBranch(definition(), "router", "a", { label: "approved", target: "end" }, {});
    expect(updated.edges.find((item) => item.id === "e-a")).toMatchObject({ label: "approved", to: "end" });
    expect(deleteEdge(definition(), "e-a").nodes.find((item) => item.id === "router")?.control?.branches).not.toContain("a");
  });
});
