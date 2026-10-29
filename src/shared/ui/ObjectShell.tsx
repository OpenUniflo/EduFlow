import type { ReactNode } from "react";
import "./ui.css";

export type ObjectShellSize = "s" | "l" | "panel" | "immersive";

export type ObjectShellProps = {
  size: ObjectShellSize;
  title: string;
  titleId?: string;
  kicker?: ReactNode;
  icon?: ReactNode;
  context?: ReactNode;
  badge?: ReactNode;
  tools?: ReactNode;
  footer?: ReactNode;
  stage?: ReactNode;
  inspector?: ReactNode;
  inspectorTitle?: string;
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * One object shell for all four sizes. Size changes behaviour only:
 * cards keep the header/body/footer stack; immersive adds the stage/inspector
 * split used by course and practice editors.
 */
export function ObjectShell({
  size, title, titleId, kicker, icon, context, badge, tools, footer, stage, inspector, inspectorTitle = "检查器", children, className = "", "aria-label": ariaLabel
}: ObjectShellProps) {
  const immersive = size === "immersive";
  return (
    <section
      className={`ef-ui-obj ef-ui-obj--${size} ${className}`.trim()}
      data-size={size}
      aria-label={ariaLabel ?? title}
      aria-labelledby={titleId}
    >
      <header className="ef-ui-obj-head">
        {icon ? <span className="ef-ui-obj-icon" aria-hidden="true">{icon}</span> : null}
        <div className="ef-ui-obj-copy">
          {kicker ? <div className="ef-ui-obj-kicker">{kicker}</div> : null}
          <h2 className="ef-ui-obj-title" id={titleId}>{title}</h2>
          {context ? <div className="ef-ui-obj-context">{context}</div> : null}
        </div>
        {badge ? <div className="ef-ui-obj-badge">{badge}</div> : null}
        {tools ? <div className="ef-ui-obj-tools">{tools}</div> : null}
      </header>
      {immersive ? (
        <div className="ef-ui-obj-body ef-ui-obj-body--immersive">
          <div className="ef-ui-obj-stage">{stage}</div>
          {inspector ? (
            <aside className="ef-ui-obj-inspector" aria-label={inspectorTitle}>
              <div className="ef-ui-obj-inspector-head"><b>{inspectorTitle}</b></div>
              <div className="ef-ui-obj-inspector-body">{inspector}</div>
            </aside>
          ) : null}
        </div>
      ) : (
        <div className="ef-ui-obj-body">{children}</div>
      )}
      {footer ? <footer className="ef-ui-obj-foot">{footer}</footer> : null}
    </section>
  );
}

/** A titled section inside an object shell body. */
export function ObjectShellSection({ icon, title, description, children, actions }: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="ef-ui-obj-section">
      <div className="ef-ui-obj-section-head">
        {icon ? <span className="ef-ui-obj-section-icon" aria-hidden="true">{icon}</span> : null}
        <h3 className="ef-ui-obj-section-title">
          {title}
          {description ? <em>{description}</em> : null}
        </h3>
        {actions ? <div className="ef-ui-obj-section-actions">{actions}</div> : null}
      </div>
      {children ? <div className="ef-ui-obj-section-body">{children}</div> : null}
    </section>
  );
}
