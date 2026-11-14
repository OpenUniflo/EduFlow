import { useEffect, useRef, type ReactNode } from "react";

/** Native modal used above the resource-center dialog; keeps focus inside and restores it. */
export function McpModal({ title, subtitle, onClose, children, footer, wide = false }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    return () => {
      if (dialog?.open) dialog.close();
      previous.current?.focus?.({ preventScroll: true });
    };
  }, []);
  return <dialog
    ref={ref}
    className={`wf-mcp-modal${wide ? " is-wide" : ""}`}
    aria-label={title}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <header className="wf-mcp-modal-head">
      <div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div>
      <button type="button" autoFocus aria-label={`关闭${title}`} onClick={onClose}>关闭</button>
    </header>
    <div className="wf-mcp-modal-body">{children}</div>
    {footer ? <footer className="wf-mcp-modal-foot">{footer}</footer> : null}
  </dialog>;
}
