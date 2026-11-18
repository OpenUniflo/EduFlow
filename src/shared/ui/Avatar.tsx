import "./ui.css";

export type AvatarSize = 24 | 28 | 32 | 40;
export type PersonColor = "me" | "orange" | "cyan" | "rose" | "multi";

function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "·";
  const words = trimmed.split(/\s+/);
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return Array.from(trimmed).slice(0, 2).join("").toUpperCase();
}

export type AvatarProps = {
  name: string;
  src?: string;
  size?: AvatarSize;
  personColor?: PersonColor;
  className?: string;
  decorative?: boolean;
};

/** Avatar with the design's person-colour ring (conic progress ring). */
export function Avatar({ name, src, size = 32, personColor, className = "", decorative = false }: AvatarProps) {
  const ring = personColor ? `is-ring is-ring--${personColor}` : "";
  return (
    <span
      className={`ef-ui-avatar ef-ui-avatar--${size} ${ring} ${className}`.trim()}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      title={decorative ? undefined : name}
    >
      {src ? <img src={src} alt="" /> : <span aria-hidden="true">{initials(name)}</span>}
    </span>
  );
}

/** Overlapping avatar row used by people/peer surfaces. */
export function AvatarStack({ people, max = 4, size = 28, className = "" }: {
  people: Array<{ id: string; name: string; src?: string }>;
  max?: number;
  size?: 24 | 28 | 32 | 40;
  className?: string;
}) {
  const visible = people.slice(0, max);
  return (
    <span className={`ef-ui-avatar-stack ${className}`.trim()}>
      {visible.map((person) => <Avatar key={person.id} name={person.name} src={person.src} size={size} />)}
      {people.length > visible.length ? <span className="ef-ui-avatar-more" aria-label={`还有 ${people.length - visible.length} 人`}>+{people.length - visible.length}</span> : null}
    </span>
  );
}
