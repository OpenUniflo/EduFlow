import { ArrowUp, Square } from "lucide-react";
import type { KeyboardEvent } from "react";

export function ComposerActionButton({ replying, canSend, onSend, onStop, idleLabel = "发送" }: {
  replying: boolean;
  canSend: boolean;
  onSend?: () => void;
  onStop?: () => void;
  idleLabel?: string;
}) {
  if (replying) {
    return <button
      type="button"
      className="ef-ui-send is-stop"
      aria-label="停止回复"
      title="停止回复"
      onClick={() => onStop?.()}
    >
      <Square size={14} fill="currentColor" aria-hidden="true" />
    </button>;
  }
  return <button
    type="button"
    className="ef-ui-send"
    aria-label={idleLabel}
    title={idleLabel}
    disabled={!canSend}
    onClick={() => onSend?.()}
  >
    <ArrowUp size={16} aria-hidden="true" />
  </button>;
}

/** Enter sends only when idle; while replying it neither sends nor clears the draft. */
export function onComposerKeyDown(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  replying: boolean,
  send: () => void
) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  if (!replying) send();
}

export function composerHint(replying: boolean) {
  return replying ? "正在回复。你可以继续输入，回复结束后再发送。" : "Enter 发送 · Shift + Enter 换行";
}
