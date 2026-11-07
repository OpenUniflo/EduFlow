import { useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { GlassSurface } from "./GlassSurface";
import { ContextPill } from "./Pill";
import { ComposerActionButton, composerHint, onComposerKeyDown } from "./ComposerAction";
import "./ui.css";

export type ComposerContext = { id: string; label: string };

export type HomeComposerProps = {
  contexts?: ComposerContext[];
  onRemoveContext?: (id: string) => void;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onStop?: () => void;
  placeholder?: string;
  hint?: ReactNode;
  submitLabel?: string;
  disabled?: boolean;
  /** A reply is active: the field stays editable, the send control becomes stop. */
  replying?: boolean;
  className?: string;
};

/** Home conversation composer: context pills, one field, one explicit send/stop action. */
export function HomeComposer({
  contexts = [],
  onRemoveContext,
  value,
  defaultValue = "",
  onChange,
  onSubmit,
  onStop,
  placeholder = "问点什么，或把材料交给助手…",
  hint,
  submitLabel = "发送",
  disabled = false,
  replying = false,
  className = ""
}: HomeComposerProps) {
  const [draft, setDraft] = useState(defaultValue);
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const current = value ?? draft;
  const canSend = !disabled && !replying && current.trim().length > 0;

  function update(next: string) {
    if (value === undefined) setDraft(next);
    onChange?.(next);
  }

  function sendDraft() {
    if (!canSend) return;
    onSubmit?.(current.trim());
    if (value === undefined) setDraft("");
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (replying) {
      onStop?.();
      return;
    }
    sendDraft();
  }

  useLayoutEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 32), 160)}px`;
  }, [current]);

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
          <div className="ef-ui-field-wrap">
            <div className="ef-ui-field">
              <textarea
                ref={inputRef}
                id={inputId}
                className="ef-ui-textarea ef-ui-composer-input"
                aria-label="给助手发消息"
                placeholder={placeholder}
                value={current}
                rows={1}
                disabled={disabled}
                onChange={(event) => update(event.target.value)}
                onKeyDown={(event) => onComposerKeyDown(event, replying, sendDraft)}
                autoComplete="off"
              />
            </div>
          </div>
          <ComposerActionButton replying={replying} canSend={canSend} onSend={sendDraft} onStop={onStop} idleLabel={submitLabel} />
        </div>
        {hint || replying ? <p className="ef-ui-composer-hint">{replying ? composerHint(true) : hint}</p> : null}
      </GlassSurface>
    </form>
  );
}
