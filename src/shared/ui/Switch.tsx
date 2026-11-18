import "./ui.css";

export type SwitchProps = {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
};

/** Token-only toggle for real and Feature Preview settings. */
export function Switch({ checked, onChange, label, disabled = false, className = "" }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`ef-ui-switch ${className}`.trim()}
      onClick={() => onChange?.(!checked)}
    />
  );
}
