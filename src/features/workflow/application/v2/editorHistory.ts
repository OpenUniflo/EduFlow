import type { EditorDocumentV2, JsonValue, WorkflowDefinitionV2 } from "../../domain/v2/types";
import canonicalize from "canonicalize";

export type EditorSnapshot = { definition: WorkflowDefinitionV2; editor: EditorDocumentV2 };
export type EditorHistory = { past: EditorSnapshot[]; present: EditorSnapshot; future: EditorSnapshot[]; group?: string };
export type WorkflowControllerRecovery = {
  timeline: EditorHistory;
  savedDocument: EditorSnapshot;
  base: { revision: number; editorRevision: number };
  input: JsonValue;
  inputDirty: boolean;
  inputInvalid: string;
  environmentRef: string;
  pendingRunRequest: { fingerprint: string; key: string } | null;
  observedRunId: string | null;
  runOrigin: "current" | "history" | null;
  runPreparationFailure: "preflight" | "save" | "submit" | null;
  requestId?: string;
};
const same = (a: EditorSnapshot, b: EditorSnapshot) => canonicalize(a) === canonicalize(b);
export function snapshotChanges(current: EditorSnapshot, saved: EditorSnapshot) {
  const definitionDirty = canonicalize(current.definition) !== canonicalize(saved.definition);
  const layout = (editor: EditorDocumentV2) => { const copy = { ...editor }; delete copy.viewport; if(copy.graphs) copy.graphs=Object.fromEntries(Object.entries(copy.graphs).map(([key,layout])=>{const next={...layout};delete next.viewport;return [key,next];})); return copy; };
  return { definitionDirty, dirty: definitionDirty || canonicalize(layout(current.editor)) !== canonicalize(layout(saved.editor)) };
}
export function recordEdit(history: EditorHistory, next: EditorSnapshot, group?: string): EditorHistory {
  if (same(history.present, next)) return history;
  return { past: group && history.group === group ? history.past : [...history.past, history.present].slice(-50), present: next, future: [], group };
}
export function travelHistory(history: EditorHistory, direction: "undo" | "redo"): EditorHistory {
  const from = direction === "undo" ? history.past : history.future;
  if (!from.length) return history;
  const present = from[from.length - 1];
  return direction === "undo" ? { past: history.past.slice(0, -1), present, future: [...history.future, history.present] } : { past: [...history.past, history.present].slice(-50), present, future: history.future.slice(0, -1) };
}
export function rebaseSnapshot(snapshot: EditorSnapshot, revision: number, editorRevision: number): EditorSnapshot {
  return { definition: { ...snapshot.definition, revision }, editor: { ...snapshot.editor, definitionRevision: revision, editorRevision } };
}
