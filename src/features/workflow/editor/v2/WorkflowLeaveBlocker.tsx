import { useEffect, type RefObject } from "react";
import { useBlocker } from "react-router-dom";

export type WorkflowBlockerControl = { proceed: () => void; reset: () => void };

/**
 * One editor instance owns at most one router blocker. A nested reference
 * target unmounts its caller's blocker while it is open, so React Router never
 * has to choose between two mounted editors and a dismissed prompt cannot
 * resume a navigation that belonged to the other editor.
 */
export function WorkflowLeaveBlocker({ dirty, pendingFields, allowLeave, control, onBlockedChange }: {
  dirty: boolean;
  pendingFields: number;
  allowLeave: RefObject<boolean>;
  control: RefObject<WorkflowBlockerControl | null>;
  onBlockedChange: (blocked: boolean) => void;
}) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !allowLeave.current && (dirty || pendingFields > 0) && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    control.current = blocker.state === "blocked"
      ? { proceed: () => blocker.proceed(), reset: () => blocker.reset() }
      : null;
    onBlockedChange(blocker.state === "blocked");
  }, [blocker, control, onBlockedChange]);
  return null;
}
