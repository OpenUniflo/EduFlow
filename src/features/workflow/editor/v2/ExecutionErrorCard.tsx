import { AlertCircle } from "lucide-react";
import type { PresentedExecutionError, ErrorActionHint } from "./errorPresentation";

/** Readable error card shared by node run data and the run result. */
export function ExecutionErrorCard({ error, onAction }: { error: PresentedExecutionError; onAction?: (hint: ErrorActionHint) => void }) {
  return <section className="wf-error-card" aria-label={error.title}>
    <div className="wf-error-card-head"><span className="wf-error-card-icon" aria-hidden="true"><AlertCircle size={14}/></span><strong>{error.title}</strong></div>
    <p className="wf-error-card-reason">{error.message}</p>
    {error.savedAtLabel ? <p className="wf-error-card-saved">{error.savedAtLabel}</p> : null}
    {onAction ? <div className="wf-error-card-actions">{error.actions.map(action => <button type="button" key={action.hint} className={action.hint === "run" || action.hint === "fix-field-type" ? "primary" : ""} onClick={() => onAction(action.hint)}>{action.label}</button>)}</div> : null}
    <details className="wf-error-card-details"><summary>技术详情</summary><code>{error.code}</code>{error.technical !== error.code ? <p>{error.technical}</p> : null}</details>
  </section>;
}
