import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./ui.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "icon";
export type ButtonSize = "32" | "40";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
};

export function Button({ variant = "secondary", size = "40", loading = false, disabled = false, icon, children, className = "", type = "button", ...rest }: ButtonProps) {
  const classes = ["ef-ui-btn", `ef-ui-btn--${variant}`, `ef-ui-btn--${size}`, loading ? "is-loading" : "", className].filter(Boolean).join(" ");
  return (
    <button {...rest} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? <span className="ef-ui-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
