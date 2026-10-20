import { expect, it } from "vitest";
import { createEditorV2, createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import { recordEdit, rebaseSnapshot, snapshotChanges, travelHistory, type EditorHistory } from "./editorHistory";
it("atomically restores deleted nodes, incident transitions and their layout", () => {
  const definition = createWorkflowV2(); const editor = createEditorV2(definition);
  const initial: EditorHistory = { past: [], present: { definition, editor }, future: [] };
  const next = recordEdit(initial, { definition: { ...definition, nodes: [], transitions: [] }, editor: { ...editor, nodes: {}, edges: {} } });
  expect(travelHistory(next, "undo").present).toEqual(initial.present);
  expect(travelHistory(travelHistory(next, "undo"), "redo").present).toEqual(next.present);
});
it("groups a drag, keeps 50 reversible operations and clears redo on new edits", () => {
  const definition = createWorkflowV2(); let h: EditorHistory = { past: [], present: { definition, editor: createEditorV2(definition) }, future: [] };
  for (let i = 1; i <= 51; i++) h = recordEdit(h, { ...h.present, definition: { ...h.present.definition, name: String(i) } });
  expect(h.past).toHaveLength(50);
  h = recordEdit(h, { ...h.present, definition: { ...h.present.definition, name: "a" } }, "drag");
  h = recordEdit(h, { ...h.present, definition: { ...h.present.definition, name: "b" } }, "drag");
  expect(travelHistory(h, "undo").present.definition.name).toBe("51");
  h = recordEdit(travelHistory(h, "undo"), { ...h.present, definition: { ...h.present.definition, name: "c" } });
  expect(h.future).toHaveLength(0);
});
it("keeps graph B unsaved when captured graph A completes a delayed save", () => {
  const definition = createWorkflowV2(); const editor = createEditorV2(definition);
  const capturedA = { definition: { ...definition, name: "A" }, editor };
  const currentB = { ...capturedA, definition: { ...capturedA.definition, name: "B" } };
  expect(snapshotChanges(rebaseSnapshot(currentB, 2, 2), rebaseSnapshot(capturedA, 2, 2))).toEqual({ dirty: true, definitionDirty: true });
  expect(snapshotChanges(rebaseSnapshot(capturedA, 2, 2), rebaseSnapshot(capturedA, 2, 2))).toEqual({ dirty: false, definitionDirty: false });
});
it("ignores viewport navigation while retaining later routing edits after a layout save", () => {
  const definition = createWorkflowV2(); const saved = { definition, editor: createEditorV2(definition) };
  expect(snapshotChanges({ ...saved, editor: { ...saved.editor, viewport: { x: 20, y: 10, zoom: .9 } } }, saved).dirty).toBe(false);
  const later = { ...saved, editor: { ...saved.editor, edges: { "start-next-end": { routing: { version: 1 as const, mode: "manual" as const, points: [{ x: 50, y: 40 }] } } } } };
  expect(snapshotChanges(later, saved)).toEqual({ dirty: true, definitionDirty: false });
});
it("does not create an edit or unsaved state when a form restores a binding in a different key order", () => {
  const definition = createWorkflowV2();
  const node = createNodeV2("core.transform", "calc");
  node.inputs.value = { value: 17, source: "literal" };
  definition.nodes.splice(1, 0, node);
  definition.transitions = [{ id: "start-calc", from: "start", outlet: "next", to: "calc" }, { id: "calc-end", from: "calc", outlet: "next", to: "end" }];
  const saved = { definition, editor: createEditorV2(definition) };
  const restored = { ...saved, definition: { ...definition, nodes: definition.nodes.map(item => item.id === "calc" ? { ...item, inputs: { value: { source: "literal" as const, value: 17 } } } : item) } };
  expect(snapshotChanges(restored, saved)).toEqual({ dirty: false, definitionDirty: false });
  const history: EditorHistory = { past: [], present: saved, future: [] };
  expect(recordEdit(history, restored)).toBe(history);
});
it("preserves ordered literal values while ignoring object key order", () => {
  const definition = createWorkflowV2();
  const node = createNodeV2("core.transform", "calc");
  node.inputs.value = { source: "literal", value: { steps: [1, 2], enabled: false } };
  definition.nodes.push(node);
  const saved = { definition, editor: createEditorV2(definition) };
  const reorderedValue = { ...saved, definition: { ...definition, nodes: definition.nodes.map(item => item.id === "calc" ? { ...item, inputs: { value: { source: "literal" as const, value: { enabled: false, steps: [2, 1] } } } } : item) } };
  expect(snapshotChanges(reorderedValue, saved)).toEqual({ dirty: true, definitionDirty: true });
});
