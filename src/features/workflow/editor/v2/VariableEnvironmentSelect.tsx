import { Menu } from "lucide-react";
import type { VariableEnvironment } from "../../domain/v2/types";

/** Badge glyph for the selected environment; the implicit default-only mode reads “默”. */
export function environmentBadgeName(name: string | null | undefined): string {
  const label = name?.trim() || "仅默认值";
  return label.startsWith("仅默认值") ? "默" : Array.from(label)[0] ?? "默";
}

/**
 * Top-bar variable environment switch (M13 / R1=B) merged with the resource-panel entry.
 * This is the only user-visible “environment”: the platform runtime environment stays
 * invisible (R13). Switching is presentation-only and never relayouts the canvas or
 * clears the draft.
 */
export function VariableEnvironmentSelect({ environments, value, onChange, disabled = false, resourceUpdates = 0, resourcesOpen = false, onToggleResources }: {
  environments: readonly VariableEnvironment[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  resourceUpdates?: number;
  resourcesOpen?: boolean;
  onToggleResources?: () => void;
}) {
  const sorted = [...environments].sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.name.localeCompare(right.name));
  const badge = environmentBadgeName(sorted.find(environment => environment.id === value)?.name);
  return <div className="wf-variable-environment" data-config-field="变量环境"><span className="wf-variable-environment-badge" aria-hidden="true">{badge}</span><select aria-label="变量环境" value={value ?? ""} disabled={disabled || !environments.length} onChange={event => onChange(event.target.value)}>{!environments.length ? <option value="">暂无变量环境</option> : null}{sorted.map(environment => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select><span className="wf-variable-environment-divider" aria-hidden="true"/><button type="button" className="wf-variable-environment-resources" aria-label="打开资源面板" title="资源" aria-pressed={resourcesOpen} onClick={onToggleResources}><Menu size={16}/>{resourceUpdates > 0 ? <span className="wf-variable-environment-dot" aria-hidden="true"/> : null}</button></div>;
}
