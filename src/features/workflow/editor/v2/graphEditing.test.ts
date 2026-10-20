import { expect, it } from "vitest";
import { createEditorV2, createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import { recordEdit, travelHistory } from "../../application/v2/editorHistory";
import { additionPosition, removeCanvasElements } from "./graphEditing";
import { sendTargetEdgeId, sendTargetRelations } from "./sendProjection";

it("one undo restores a deleted node, both incident edges and their manual layouts", () => {
  const base = createWorkflowV2();
  const definition = { ...base, nodes: [...base.nodes, createNodeV2("core.transform", "middle")], transitions: [{ id: "a", from: "start", outlet: "next", to: "middle" }, { id: "b", from: "middle", outlet: "next", to: "end" }] };
  const editor = createEditorV2(definition);
  editor.edges.a = { routing: { version: 1, mode: "manual", points: [{ x: 10, y: 15 }] } };
  const initial = { definition, editor };
  const deleted = recordEdit({ past: [], present: initial, future: [] }, removeCanvasElements(initial, ["middle"]));
  expect(deleted.present.definition.transitions).toEqual([]);
  expect(deleted.present.editor.edges).toEqual({});
  expect(travelHistory(deleted, "undo").present).toEqual(initial);
  expect(travelHistory(travelHistory(deleted, "undo"), "redo").present).toEqual(deleted.present);
});
it("projects Send targets as editable relations without serializing a normal transition", () => {
  const definition = createWorkflowV2();
  const send = { ...createNodeV2("control.send", "send"), config: { target: "target", items: "/items" } };
  definition.nodes.push(send, createNodeV2("core.function", "target"));
  const document = { definition, editor: createEditorV2(definition) };
  expect(sendTargetRelations(definition)).toEqual([{ id: sendTargetEdgeId("send"), from: "send", outlet: "item", to: "target" }]);
  expect(definition.transitions).toHaveLength(1);
  const disconnected = removeCanvasElements(document, [], [sendTargetEdgeId("send")]);
  expect(disconnected.definition.nodes.find(node => node.id === "send")?.config.target).toBe("");
  expect(disconnected.definition.transitions).toEqual(definition.transitions);
  expect(removeCanvasElements(document, ["target"]).definition.nodes.find(node => node.id === "send")?.config.target).toBe("");
  expect(send.config.target).toBe("target");
});

it("adds before the end column with clearance and preserves existing layout and connections", () => {
  const definition = createWorkflowV2();
  const editor = createEditorV2(definition);
  const end = definition.nodes.find(node => node.type === "core.end")!;
  editor.nodes[end.id] = {x: 800, y: 160};
  editor.nodes[definition.entryNodeId] = {x: 80, y: 160};
  const document = {definition, editor};
  const snapshot = structuredClone(document);
  const first = additionPosition(document);
  expect(first.x).toBeLessThan(800);
  expect(document).toEqual(snapshot);
  document.editor.nodes.extra = first;
  const next = additionPosition(document);
  expect(next.x).toBeLessThan(800);
  expect(Math.abs(next.y - first.y)).toBeGreaterThanOrEqual(220);
  expect(document.definition.transitions).toEqual(snapshot.definition.transitions);
});
