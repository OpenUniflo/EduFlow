import "./ui.css";

export type BrandMarkVariant = "rail" | "brand";

export type BrandMarkProps = {
  variant?: BrandMarkVariant;
  size?: number;
  className?: string;
};

/**
 * The EduFlow mark, copied from the design boards. The rail uses the knowledge
 * hub glyph (N01/N38); auth uses the three-node glyph (N48a/N48b).
 */
export function BrandMark({ variant = "rail", size, className = "" }: BrandMarkProps) {
  if (variant === "brand") {
    return (
      <svg
        className={`ef-brand-mark ${className}`.trim()}
        width={size ?? 28}
        height={size ?? 28}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="12" cy="18" r="2.5" />
        <path d="M8 7l3 9M16 7l-3 9M8.5 6h7" />
      </svg>
    );
  }

  return (
    <svg
      className={`ef-brand-mark ${className}`.trim()}
      width={size ?? 22}
      height={size ?? 22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3v6M12 15v6M5 7.5l5 3M14 13.5l5 3M19 7.5l-5 3M10 13.5l-5 3" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
