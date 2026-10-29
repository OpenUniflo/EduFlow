import { ArrowUp } from "lucide-react";
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { GlassSurface } from "./GlassSurface";
import { ContextPill } from "./Pill";
import { TextField } from "./Field";
import "./ui.css";

export type ComposerContext = { id: string; label: string };

export type HomeComposerProps = {
  contexts?: ComposerContext[];
  onRemoveContext?: (id: string) => void;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  submitLabel?: string;
  disabled?: boolean;
  className?: string;
};

/** Home conversation composer: context pills, one field, one explicit send action. */
export function HomeComposer({
  contexts = [],
  onRemoveContext,
  value,
  defaultValue = "",
  onChange,
  onSubmit,
  placeholder = "问点什么，或把材料交给助手…",
  hint,
  submitLabel = "发送",
  disabled = false,
  className = ""
}: HomeComposerProps) {
  const [draft, setDraft] = useState(defaultValue);
  const inputId = useId();
  const current = value ?? draft;
  const canSend = !disabled && current.trim().length > 0;

  function update(next: string) {
    if (value === undefined) setDraft(next);
    onChange?.(next);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    onSubmit?.(current.trim());
    if (value === undefined) setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className={`ef-ui-composer-wrap ${className}`.trim()} onSubmit={submit} aria-label="向助手发送消息">
      <GlassSurface tone="regular" radius={24} className="ef-ui-composer">
        {contexts.length ? (
          <div className="ef-ui-composer-contexts" aria-label="对话上下文">
            {contexts.map((context) => (
              <ContextPill key={context.id} label={context.label} onRemove={onRemoveContext ? () => onRemoveContext(context.id) : undefined} />
            ))}
          </div>
        ) : null}
        <div className="ef-ui-composer-bar">
          <TextField
            id={inputId}
            aria-label="给助手发消息"
            placeholder={placeholder}
            value={current}
            disabled={disabled}
            onChange={(event) => update(event.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
          />
          <button type="submit" className="ef-ui-send" aria-label={submitLabel} title={submitLabel} disabled={!canSend}>
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        </div>
        {hint ? <p className="ef-ui-composer-hint">{hint}</p> : null}
      </GlassSurface>
    </form>
  );
}
