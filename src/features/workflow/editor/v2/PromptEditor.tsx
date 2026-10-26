import { useLayoutEffect, useRef, useState } from "react";
import type { Binding, LlmConfigV2, PromptSegment } from "../../domain/v2/types";

type Prompt = LlmConfigV2["prompt"];
type Target = { target: "system" } | { target: "message"; message: number };
type ChipMenu = Target & { index: number };

export type PromptEditorProps = {
  prompt: Prompt;
  /** Declared node parameters; `history` is not a prompt parameter. */
  inputs: Record<string, Binding>;
  onChange: (prompt: Prompt) => void;
  readOnly?: boolean;
};

function replaceSegment(segments: PromptSegment[], index: number, next: PromptSegment): PromptSegment[] {
  return segments.map((segment, position) => position === index ? next : segment);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

/** One inline HTML flow: plain text and atomic parameter chips share the same baseline. */
function flowHtml(segments: PromptSegment[]): string {
  return segments.map((segment, index) => segment.type === "text"
    ? escapeHtml(segment.text)
    : `<span class="wf-prompt-chip" contenteditable="false" role="button" tabindex="0" data-prompt-param="${index}" data-param-name="${escapeAttribute(segment.name)}" data-param-format="${segment.format === "json" ? "json" : "text"}" aria-label="参数 ${escapeAttribute(segment.name)} 设置">${escapeHtml(segment.name)}</span>`).join("");
}

function appendText(segments: PromptSegment[], text: string) {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last?.type === "text") last.text += text;
  else segments.push({ type: "text", text });
}

/** Reads the editable DOM back into the existing PromptSegment structure. */
function parseFlow(root: HTMLElement): PromptSegment[] {
  const segments: PromptSegment[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { appendText(segments, node.textContent ?? ""); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (element.dataset.paramName) {
      segments.push({ type: "param", name: element.dataset.paramName, ...(element.dataset.paramFormat === "json" ? { format: "json" as const } : {}) });
      return;
    }
    if (element.tagName === "BR") { appendText(segments, "\n"); return; }
    const block = element.tagName === "DIV" || element.tagName === "P";
    if (block && segments.length) appendText(segments, "\n");
    element.childNodes.forEach(visit);
  };
  root.childNodes.forEach(visit);
  return segments;
}

function PromptFlow({ segments, readOnly, ariaLabel, onChange, onChip }: {
  segments: PromptSegment[];
  readOnly: boolean;
  ariaLabel: string;
  onChange: (segments: PromptSegment[]) => void;
  onChip: (index: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const last = useRef(JSON.stringify(segments));
  const mounted = useRef(false);

  // React must not manage this subtree: re-rendering children after every
  // keystroke would reset the caret. The DOM is written once, then only when an
  // external prompt/format change differs from the last emitted segments.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const signature = JSON.stringify(segments);
    if (mounted.current && signature === last.current) return;
    element.innerHTML = flowHtml(segments);
    mounted.current = true;
    last.current = signature;
  }, [segments]);

  function sync() {
    const element = root.current;
    if (!element) return;
    const next = parseFlow(element);
    last.current = JSON.stringify(next);
    onChange(next);
  }

  return <div
    ref={root}
    className={`wf-prompt-flow${readOnly ? " readonly" : ""}`}
    contentEditable={!readOnly}
    suppressContentEditableWarning
    role="textbox"
    aria-label={ariaLabel}
    aria-multiline="true"
    data-empty={segments.length ? "false" : "true"}
    data-placeholder="输入提示词，或插入参数…"
    onInput={sync}
    onClick={event => {
      if (readOnly) return;
      const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-prompt-param]");
      if (!chip) return;
      event.preventDefault();
      onChip(Number(chip.dataset.promptParam));
    }}
    onKeyDown={event => {
      const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-prompt-param]");
      if (chip && !readOnly && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onChip(Number(chip.dataset.promptParam)); return; }
      if (readOnly || event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      if (!document.execCommand("insertLineBreak")) document.execCommand("insertText", false, "\n");
      sync();
    }}
    onPaste={event => {
      if (readOnly) return;
      event.preventDefault();
      document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
      sync();
    }}
  />;
}

/**
 * Inline prompt editor. Text and parameter chips share one contenteditable flow, so a chip
 * sits on the text baseline and wraps with the sentence instead of becoming its own block.
 * The persisted PromptSegment structure is unchanged.
 */
export function PromptEditor({ prompt, inputs, onChange, readOnly = false }: PromptEditorProps) {
  const [menu, setMenu] = useState<Target | null>(null);
  const [chipMenu, setChipMenu] = useState<ChipMenu | null>(null);
  const parameterNames = Object.keys(inputs).filter(name => name !== "history");

  function updateSystem(segments: PromptSegment[]) { onChange({ ...prompt, system: segments }); }
  function updateMessage(index: number, content: PromptSegment[], role = prompt.messages[index].role) {
    onChange({ ...prompt, messages: prompt.messages.map((message, position) => position === index ? { role, content } : message) });
  }
  function insertParameter(target: Target, name: string) {
    const segment: PromptSegment = { type: "param", name };
    if (target.target === "system") updateSystem([...prompt.system, segment]);
    else updateMessage(target.message, [...prompt.messages[target.message].content, segment]);
    setMenu(null);
  }
  function addMessage() { onChange({ ...prompt, messages: [...prompt.messages, { role: "user", content: [] }] }); }
  function removeMessage(index: number) { if (prompt.messages.length > 1) onChange({ ...prompt, messages: prompt.messages.filter((_, position) => position !== index) }); }
  function setChipFormat(target: Target, index: number, format: "text" | "json") {
    const segments = target.target === "system" ? prompt.system : prompt.messages[target.message].content;
    const next = replaceSegment(segments, index, { ...segments[index], type: "param", format } as PromptSegment);
    if (target.target === "system") updateSystem(next); else updateMessage(target.message, next);
    setChipMenu(null);
  }
  function removeChip(target: Target, index: number) {
    const segments = target.target === "system" ? prompt.system : prompt.messages[target.message].content;
    const next = segments.filter((_, position) => position !== index);
    if (target.target === "system") updateSystem(next); else updateMessage(target.message, next);
    setChipMenu(null);
  }

  function segmentsView(segments: PromptSegment[], target: Target) {
    const setSegments = target.target === "system" ? updateSystem : (next: PromptSegment[]) => updateMessage(target.message, next);
    const signature = target.target === "system" ? "system" : `message-${target.message}`;
    const openChip = chipMenu && `${chipMenu.target === "system" ? "system" : `message-${chipMenu.message}`}:${chipMenu.index}` === `${signature}:${chipMenu.index}` ? chipMenu : null;
    const chipSegment = openChip ? segments[openChip.index] : undefined;
    return <>
      <PromptFlow
        segments={segments}
        readOnly={readOnly}
        ariaLabel={target.target === "system" ? "系统提示词" : `消息 ${target.message + 1} 提示词`}
        onChange={next => { setChipMenu(null); setSegments(next); }}
        onChip={index => setChipMenu({ ...target, index })}
      />
      {openChip && chipSegment?.type === "param" ? <span className="wf-prompt-chip-menu" role="menu" aria-label={`参数 ${chipSegment.name} 设置`}>
        <button type="button" role="menuitemradio" aria-checked={(chipSegment.format ?? "text") === "text"} className={(chipSegment.format ?? "text") === "text" ? "active" : ""} onClick={() => setChipFormat(openChip, openChip.index, "text")}>按文本</button>
        <button type="button" role="menuitemradio" aria-checked={chipSegment.format === "json"} className={chipSegment.format === "json" ? "active" : ""} onClick={() => setChipFormat(openChip, openChip.index, "json")}>按 JSON</button>
        <button type="button" role="menuitem" className="danger" onClick={() => removeChip(openChip, openChip.index)}>移除</button>
      </span> : null}
      {menu && JSON.stringify(menu) === JSON.stringify(target) ? <div className="wf-prompt-menu" role="menu">{parameterNames.length ? parameterNames.map(name => <button type="button" role="menuitem" key={name} onClick={() => insertParameter(target, name)}>{name}</button>) : <small>先在输入里添加参数</small>}</div> : null}
    </>;
  }

  return <section className="wf-prompt-editor" aria-label="提示词" data-config-field="提示词">
    <div className="wf-prompt-hint">直接输入文字；需要字段时点「插入参数」，输入 <code>{ "{" }</code> 可快速插入。</div>
    <div className="wf-prompt-block">
      <div className="wf-prompt-block-head"><span>系统提示词</span><span className="wf-prompt-block-spacer" /><button type="button" className="wf-text-button" disabled={readOnly || !parameterNames.length} onClick={() => setMenu({ target: "system" })}>插入参数</button></div>
      {segmentsView(prompt.system, { target: "system" })}
    </div>
    <div className="wf-prompt-block">
      <div className="wf-prompt-block-head"><span>用户消息</span><span className="wf-prompt-block-spacer" /><button type="button" className="wf-text-button" disabled={readOnly || !parameterNames.length} onClick={() => setMenu({ target: "message", message: 0 })}>插入参数</button></div>
      {prompt.messages.map((message, index) => <article className="wf-prompt-message" key={index}>
        <div className="wf-prompt-message-head"><span>{index === 0 ? "用户消息" : `消息 ${index + 1}`}</span><select aria-label={`消息 ${index + 1} 角色`} disabled={readOnly} value={message.role} onChange={event => updateMessage(index, message.content, event.target.value as "user" | "assistant")}><option value="user">用户</option><option value="assistant">助手</option></select>{prompt.messages.length > 1 ? <button type="button" className="wf-text-button" disabled={readOnly} onClick={() => removeMessage(index)}>删除</button> : null}</div>
        {segmentsView(message.content, { target: "message", message: index })}
      </article>)}
      <button type="button" className="wf-text-button" disabled={readOnly} onClick={addMessage}>＋ 添加消息</button>
    </div>
  </section>;
}
