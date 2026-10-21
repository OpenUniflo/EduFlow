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
  function trapTab(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const dialog = reference.current;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1]; const active = document.activeElement;
    if (!dialog.contains(active)) { event.preventDefault(); first.focus(); return; }
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }
  return <dialog ref={reference} className={`wf-v2-migration nokey ${className}`} aria-labelledby={id} aria-describedby={error ? errorId : undefined} onKeyDown={trapTab} onCancel={event => { event.preventDefault(); onClose(); }}><header className="wf-v2-dialog-header"><span id={id} className="wf-v2-dialog-title">{title}</span><button type="button" autoFocus aria-label={`关闭${title}`} onClick={onClose}>关闭</button>{error ? <p id={errorId} className="wf-v2-dialog-error" role="alert" tabIndex={0}>{error}</p> : null}</header>{children}</dialog>;
}
