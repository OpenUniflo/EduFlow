import type { ProfileAbility } from "@/features/profile/legacyTypes";

function polygonPoints(abilities: ProfileAbility[], radius: number, center: number, scale = 1) {
  return abilities
    .map((ability, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / abilities.length;
      const value = (ability.value / ability.maxValue) * radius * scale;
      return `${center + Math.cos(angle) * value},${center + Math.sin(angle) * value}`;
    })
    .join(" ");
}

export function AbilityRadar({ abilities }: { abilities: ProfileAbility[] }) {
  const size = 250;
  const center = size / 2;
  const radius = 86;
  const rings = [0.25, 0.5, 0.75, 1];

  if (!abilities.length) return null;

  return (
    <div className="ability-radar" aria-label="能力雷达图">
      <svg viewBox={`0 0 ${size} ${size}`} role="img">
        {rings.map((ring) => (
          <polygon key={ring} points={polygonPoints(abilities, radius, center, ring)} className="ability-radar-ring" />
        ))}
        {abilities.map((ability, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / abilities.length;
          const x = center + Math.cos(angle) * radius;
          const y = center + Math.sin(angle) * radius;
          const labelX = center + Math.cos(angle) * (radius + 28);
          const labelY = center + Math.sin(angle) * (radius + 28);
          return (
            <g key={ability.id}>
              <line x1={center} y1={center} x2={x} y2={y} className="ability-radar-axis" />
              <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle">
                {ability.name.replace("力", "")}
              </text>
            </g>
          );
        })}
        <polygon points={polygonPoints(abilities, radius, center)} className="ability-radar-value" />
      </svg>
    </div>
  );
}
