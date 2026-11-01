import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import "./ui.css";

export type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

/** Shared token-only content card (settings, records, preview panels). */
export const Card = forwardRef<HTMLElement, CardProps>(function Card({ className = "", children, ...rest }, ref) {
  return <section ref={ref} className={`ef-ui-card ${className}`.trim()} {...rest}>{children}</section>;
});
