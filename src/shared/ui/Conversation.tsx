import type { ReactNode } from "react";
import "./ui.css";

export function Bubble({ from = "assistant", meta, children, className = "" }: {
  from?: "assistant" | "user";
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ef-ui-bubble ef-ui-bubble--${from} ${className}`.trim()} data-from={from}>
      {children}
      {meta ? <small className="ef-ui-bubble-meta">{meta}</small> : null}
    </div>
  );
}

/** Event rows span the full conversation column. */
export function EventRow({ icon, title, detail, action, children, className = "" }: {
  icon?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <article className={`ef-ui-event-row ${className}`.trim()}>
      {icon ? <span className="ef-ui-event-icon" aria-hidden="true">{icon}</span> : null}
      <div className="ef-ui-event-copy">
        <div className="ef-ui-event-title">{title}</div>
        {detail ? <div className="ef-ui-event-detail">{detail}</div> : null}
        {children}
      </div>
      {action ? <div className="ef-ui-event-action">{action}</div> : null}
    </article>
  );
}

export type ConversationCardSize = "s" | "l";

/**
 * Conversation object card: S is 480px and centred in the column, L spans it.
 * ObjectShell owns the object layout; this wrapper owns the column placement.
 */
export function ConversationCard({ size = "s", children, className = "", label }: {
  size?: ConversationCardSize;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={`ef-ui-conversation-card ef-ui-conversation-card--${size} ${className}`.trim()} data-card-size={size} aria-label={label}>
      {children}
    </div>
  );
}
