import type { ReactNode } from "react";
import { WorkflowDialog } from "./WorkflowDialog";

/**
 * Product confirm dialog for destructive or externally visible actions. The
 * modal semantics, focus restore and Escape handling stay in WorkflowDialog.
 */
export function ConfirmDialog({ title, confirmLabel, cancelLabel = "取消", danger = false, busy = false, error, onConfirm, onCancel, children }: {
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return <WorkflowDialog title={title} error={error} className="wf-action-dialog wf-confirm-dialog" onClose={onCancel}>
    {children}
    <div className="wf-dialog-actions">
      <button type="button" onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className={danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </WorkflowDialog>;
}
