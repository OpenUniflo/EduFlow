import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import "./ui.css";

type FieldChromeProps = {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
  children: ReactNode;
  inputId: string;
  hintId?: string;
  className?: string;
};

function FieldChrome({ label, hint, error, icon, children, inputId, hintId, className = "" }: FieldChromeProps) {
  return (
    <div className={`ef-ui-field-wrap ${className}`.trim()}>
      {label ? <label className="ef-ui-field-label" htmlFor={inputId}>{label}</label> : null}
      <div className={`ef-ui-field${error ? " is-error" : ""}`.trim()} data-error={error ? "true" : undefined}>
        {icon ? <span className="ef-ui-field-icon" aria-hidden="true">{icon}</span> : null}
        {children}
      </div>
      {error || hint ? <p id={hintId} className={`ef-ui-help${error ? " is-error" : ""}`.trim()}>{error ?? hint}</p> : null}
    </div>
  );
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size"> & {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
  className?: string;
};

export function TextField({ label, hint, error, icon, className, id, ...rest }: TextFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = error || hint ? `${inputId}-help` : undefined;
  return (
    <FieldChrome label={label} hint={hint} error={error} icon={icon} inputId={inputId} hintId={hintId} className={className}>
      <input
        {...rest}
        id={inputId}
        className="ef-ui-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
      />
    </FieldChrome>
  );
}

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
};

export function Textarea({ label, hint, error, className, id, ...rest }: TextareaProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = error || hint ? `${inputId}-help` : undefined;
  return (
    <FieldChrome label={label} hint={hint} error={error} inputId={inputId} hintId={hintId} className={className}>
      <textarea
        {...rest}
        id={inputId}
        className="ef-ui-textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
      />
    </FieldChrome>
  );
}
