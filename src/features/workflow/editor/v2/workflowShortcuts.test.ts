import { describe, expect, it, vi } from "vitest";
import { handleWorkflowShortcut, type WorkflowShortcutActions, type WorkflowShortcutEvent } from "./workflowShortcuts";

function keyEvent(overrides: Partial<WorkflowShortcutEvent> = {}): WorkflowShortcutEvent {
  return {
    key: "z",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    target: { closest: () => null } as unknown as EventTarget,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

function actionSpies(overrides: Partial<WorkflowShortcutActions> = {}): WorkflowShortcutActions {
  return {
    readOnly: false,
    pendingFieldCount: 0,
    activeElement: { closest: () => null } as unknown as EventTarget,
    save: vi.fn(),
    reportPendingFields: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    ...overrides,
  };
}

function inside(selectorPart: string): EventTarget {
  return { closest: (selector: string) => selector.includes(selectorPart) ? {} : null } as unknown as EventTarget;
}

describe("workflow editor keyboard shortcuts", () => {
  it("undoes on Meta+Z when focus fell back to body and the event reaches window", () => {
    const windowTarget = new EventTarget();
    const actions = actionSpies();
    windowTarget.addEventListener("keydown", event => {
      handleWorkflowShortcut(event as unknown as WorkflowShortcutEvent, actions);
    });
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key: "z", metaKey: true, ctrlKey: false, shiftKey: false });

    windowTarget.dispatchEvent(event);

    expect(actions.undo).toHaveBeenCalledTimes(1);
    expect(actions.redo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("maps Ctrl+Z to undo and Meta+Shift+Z / Ctrl+Y to redo", () => {
    const ctrlZ = actionSpies();
    expect(handleWorkflowShortcut(keyEvent({ ctrlKey: true }), ctrlZ)).toBe(true);
    expect(ctrlZ.undo).toHaveBeenCalledTimes(1);

    const shiftZ = actionSpies();
    expect(handleWorkflowShortcut(keyEvent({ metaKey: true, shiftKey: true, key: "Z" }), shiftZ)).toBe(true);
    expect(shiftZ.redo).toHaveBeenCalledTimes(1);
    expect(shiftZ.undo).not.toHaveBeenCalled();

    const ctrlY = actionSpies();
    expect(handleWorkflowShortcut(keyEvent({ ctrlKey: true, key: "y" }), ctrlY)).toBe(true);
    expect(ctrlY.redo).toHaveBeenCalledTimes(1);
  });

  it("keeps native text undo inside inputs, textareas, selects, contenteditable and dialogs", () => {
    for (const part of ["input", "textarea", "select", "contenteditable", "dialog"]) {
      const actions = actionSpies({ activeElement: inside(part) });
      const event = keyEvent({ metaKey: true, target: inside(part) });
      expect(handleWorkflowShortcut(event, actions), part).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(actions.undo).not.toHaveBeenCalled();
    }
  });

  it("does not run editor undo when only the current focus is an editable control", () => {
    const actions = actionSpies({ activeElement: inside("input") });
    const event = keyEvent({ metaKey: true });
    expect(handleWorkflowShortcut(event, actions)).toBe(false);
    expect(actions.undo).not.toHaveBeenCalled();
  });

  it("stays inert in read-only mode", () => {
    const actions = actionSpies({ readOnly: true });
    expect(handleWorkflowShortcut(keyEvent({ metaKey: true }), actions)).toBe(false);
    expect(actions.undo).not.toHaveBeenCalled();
  });

  it("saves with Meta+S and blocks the save while advanced fields are pending", () => {
    const saved = actionSpies();
    expect(handleWorkflowShortcut(keyEvent({ metaKey: true, key: "s" }), saved)).toBe(true);
    expect(saved.save).toHaveBeenCalledTimes(1);

    const blocked = actionSpies({ pendingFieldCount: 1 });
    expect(handleWorkflowShortcut(keyEvent({ metaKey: true, key: "s" }), blocked)).toBe(true);
    expect(blocked.save).not.toHaveBeenCalled();
    expect(blocked.reportPendingFields).toHaveBeenCalledTimes(1);
  });
});
