/**
 * Keyboard shortcuts for the Workflow editor.
 *
 * The listener is owned by the window, not by the editor surface: deleting a
 * field or a selected node can remove the focused element and leave focus on
 * `document.body`, whose keydown events never pass through the editor subtree.
 */
const editableSelector = "input,textarea,select,[contenteditable=true],dialog,.nokey";

export interface WorkflowShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
}

export interface WorkflowShortcutActions {
  readOnly: boolean;
  pendingFieldCount: number;
  activeElement?: EventTarget | null;
  save: () => void;
  reportPendingFields: () => void;
  undo: () => void;
  redo: () => void;
}

/** `closest` is absent on window/document, which are valid synthetic or fallback targets. */
function insideEditable(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return Boolean((target as Element).closest(editableSelector));
}

/**
 * Handles one keydown. Returns true when the event was consumed so callers can
 * keep the browser's native handling for every other key.
 */
export function handleWorkflowShortcut(event: WorkflowShortcutEvent, actions: WorkflowShortcutActions): boolean {
  if (actions.readOnly) return false;
  const modifier = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();

  if (modifier && key === "s") {
    event.preventDefault();
    if (actions.pendingFieldCount) actions.reportPendingFields();
    else actions.save();
    return true;
  }

  // Text fields keep native text undo/redo. check both the event target and the
  // current focus because a removed focused element can redirect the target.
  if (insideEditable(event.target) || insideEditable(actions.activeElement)) return false;

  if (modifier && key === "z") {
    event.preventDefault();
    if (event.shiftKey) actions.redo();
    else actions.undo();
    return true;
  }
  if (event.ctrlKey && key === "y") {
    event.preventDefault();
    actions.redo();
    return true;
  }
  return false;
}
