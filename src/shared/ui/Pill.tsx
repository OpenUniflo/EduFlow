import type { ButtonHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";
import "./ui.css";

export type PillTone = "brand" | "acquired" | "target" | "pending" | "warn" | "danger" | "ok" | "quiet";

export function Pill({ tone = "brand", dot = false, icon, children, className = "" }: {
  tone?: PillTone;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`ef-ui-pill ef-ui-pill--${tone} ${className}`.trim()} data-tone={tone}>
      {dot ? <span className="ef-ui-pill-dot" aria-hidden="true" /> : null}
      {icon}
      <span>{children}</span>
    </span>
  );
}

export type ContextPillProps = {
  label: string;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
};

/** A context chip attached to the composer. The remove control is a real button. */
export function ContextPill({ label, onRemove, removeLabel, className = "" }: ContextPillProps) {
  return (
    <span className={`ef-ui-ctx ${className}`.trim()}>
      <span className="ef-ui-ctx-label" title={label}>{label}</span>
      {onRemove ? (
        <button type="button" className="ef-ui-ctx-remove" aria-label={removeLabel ?? `移除 ${label}`} onClick={onRemove}>
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  selected?: boolean;
  className?: string;
};

export function Chip({ selected = false, className = "", type = "button", ...rest }: ChipProps) {
  return <button {...rest} type={type} className={`ef-ui-chip ${className}`.trim()} aria-pressed={selected} />;
}
