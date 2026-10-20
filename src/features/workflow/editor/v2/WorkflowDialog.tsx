import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Native modal dialog supplies keyboard trapping; closure restores the initiating control. */
export function WorkflowDialog({ title, error, onClose, children, className = "" }: { title: string; error?: string; className?: string; onClose: () => void; children: ReactNode }) {
  const reference = useRef<HTMLDialogElement>(null);
  const id = useId();
  // Capture before the close button's React autoFocus runs during mount.
  const [previous] = useState(() => typeof document === "undefined" ? null : document.activeElement);
  useEffect(() => {
    const dialog = reference.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [previous]);
  const errorId = `${id}-error`;
  return <dialog ref={reference} className={`wf-v2-migration nokey ${className}`} aria-labelledby={id} aria-describedby={error ? errorId : undefined} onCancel={event => { event.preventDefault(); onClose(); }}><header className="wf-v2-dialog-header"><span id={id} className="wf-v2-dialog-title">{title}</span><button type="button" autoFocus aria-label={`关闭${title}`} onClick={onClose}>关闭</button>{error ? <p id={errorId} className="wf-v2-dialog-error" role="alert" tabIndex={0}>{error}</p> : null}</header>{children}</dialog>;
}
