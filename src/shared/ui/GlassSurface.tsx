import type { HTMLAttributes, ReactNode } from "react";
import "./ui.css";

export type GlassTone = "regular" | "clear";
export type GlassRadius = 12 | 16 | 24 | "full";

export type GlassSurfaceProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  tone?: GlassTone;
  radius?: GlassRadius;
  children: ReactNode;
};

/**
 * The two design glass materials. Safari only understands the prefixed
 * `-webkit-backdrop-filter`, which is deliberately blur-only (no SVG lens), and
 * `prefers-reduced-transparency` turns the surface opaque in ui.css.
 */
export function GlassSurface({ tone = "regular", radius = 24, className = "", children, ...rest }: GlassSurfaceProps) {
  return (
    <div {...rest} className={`ef-ui-glass ef-ui-glass--${tone} ef-ui-glass--r-${radius} ${className}`.trim()} data-glass={tone}>
      {children}
    </div>
  );
}
