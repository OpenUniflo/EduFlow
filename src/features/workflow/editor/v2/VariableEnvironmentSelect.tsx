import type { VariableEnvironment } from "../../domain/v2/types";

/**
 * Top-bar variable environment switch (M13 / R1=B). This is the only user-visible
 * “environment”: the platform runtime environment stays invisible (R13).
 * Switching is presentation-only and never relayouts the canvas or clears the draft.
 */
export function VariableEnvironmentSelect({ environments, value, onChange, disabled = false }: {
  environments: readonly VariableEnvironment[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return <label className="wf-variable-environment" data-config-field="变量环境">变量环境<select aria-label="变量环境" value={value ?? ""} disabled={disabled || !environments.length} onChange={event => onChange(event.target.value)}>{!environments.length ? <option value="">暂无变量环境</option> : null}{[...environments].sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.name.localeCompare(right.name)).map(environment => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select></label>;
}
