import { useState } from "react";
import type { Binding, LlmConfigV2, PromptSegment } from "../../domain/v2/types";

type Prompt = LlmConfigV2["prompt"];

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

/**
 * Parameter-style prompt editor (plan 3.3 / M10). Parameters are declared in the input table;
 * the prompt only references their names and persists structured segments (never `{{...}}` text).
 * Typing `{{` in a text segment is just an insertion gesture for the parameter menu.
 */
export function PromptEditor({ prompt, inputs, onChange, readOnly = false }: PromptEditorProps) {
  const [menu, setMenu] = useState<{ target: "system" } | { target: "message"; message: number } | null>(null);
  const parameterNames = Object.keys(inputs).filter(name => name !== "history");

  function updateSystem(segments: PromptSegment[]) { onChange({ ...prompt, system: segments }); }
  function updateMessage(index: number, content: PromptSegment[], role = prompt.messages[index].role) {
    onChange({ ...prompt, messages: prompt.messages.map((message, position) => position === index ? { role, content } : message) });
  }
  function insertParameter(target: { target: "system" } | { target: "message"; message: number }, name: string) {
    const segment: PromptSegment = { type: "param", name };
    if (target.target === "system") updateSystem([...prompt.system, segment]);
    else updateMessage(target.message, [...prompt.messages[target.message].content, segment]);
    setMenu(null);
  }
  function addMessage() {
    onChange({ ...prompt, messages: [...prompt.messages, { role: "user", content: [] }] });
  }
  function removeMessage(index: number) {
    if (prompt.messages.length <= 1) return;
    onChange({ ...prompt, messages: prompt.messages.filter((_, position) => position !== index) });
  }
  function addText(target: { target: "system" } | { target: "message"; message: number }) {
    if (target.target === "system") updateSystem([...prompt.system, { type: "text", text: "" }]);
    else updateMessage(target.message, [...prompt.messages[target.message].content, { type: "text", text: "" }]);
  }

  function segmentsView(segments: PromptSegment[], target: { target: "system" } | { target: "message"; message: number }) {
    const setSegments = target.target === "system" ? updateSystem : (next: PromptSegment[]) => updateMessage(target.message, next);
    return <div className="wf-prompt-segments">{segments.map((segment, index) => segment.type === "text" ? <div key={`text-${index}`} className="wf-prompt-text"><textarea aria-label={target.target === "system" ? "系统提示词文本" : `消息 ${target.message + 1} 文本`} readOnly={readOnly} value={segment.text} rows={Math.min(8, Math.max(2, segment.text.split("\n").length))} onChange={event => { const value = event.target.value; if (value.endsWith("{{")) { setSegments(replaceSegment(segments, index, { type: "text", text: value.slice(0, -2) })); setMenu(target); return; } setSegments(replaceSegment(segments, index, { type: "text", text: value })); }}/><button type="button" className="wf-text-button" disabled={readOnly} onClick={() => setSegments(segments.filter((_, position) => position !== index))}>移除文本</button></div> : <span key={`param-${index}`} className="wf-prompt-chip"><strong>{"{{"}{segment.name}{"}}"}</strong><select aria-label={`参数 ${segment.name} 格式`} disabled={readOnly} value={segment.format ?? "text"} onChange={event => setSegments(replaceSegment(segments, index, { ...segment, format: event.target.value as "text" | "json" }))}><option value="text">文本</option><option value="json">JSON</option></select><button type="button" aria-label={`移除参数 ${segment.name}`} disabled={readOnly} onClick={() => setSegments(segments.filter((_, position) => position !== index))}>×</button></span>)}
      {!segments.length ? <small className="wf-field-note">这一段还是空的。可输入文本或插入参数。</small> : null}
      <div className="wf-prompt-segment-actions"><button type="button" className="wf-text-button" disabled={readOnly} onClick={() => addText(target)}>+ 文本</button><button type="button" className="wf-text-button" disabled={readOnly || !parameterNames.length} title={parameterNames.length ? undefined : "先在输入中声明参数"} onClick={() => setMenu(target)}>+ 参数</button></div>
      {menu && JSON.stringify(menu) === JSON.stringify(target) ? <div className="wf-prompt-menu" role="menu">{parameterNames.length ? parameterNames.map(name => <button type="button" role="menuitem" key={name} onClick={() => insertParameter(target, name)}>{"{{"}{name}{"}}"}</button>) : <small>还没有已声明的参数；请先在「输入」中新增。</small>}</div> : null}
    </div>;
  }

  return <section className="wf-prompt-editor" aria-label="提示词" data-config-field="提示词">
    <header><h4>提示词</h4><small>先在上方「输入」声明参数，这里只引用参数名；输入 {"{{"} 或点「+ 参数」插入。</small></header>
    <div className="wf-prompt-block"><h5>System <small>{prompt.system.length ? `${prompt.system.length} 段` : "可留空"}</small></h5>{segmentsView(prompt.system, { target: "system" })}</div>
    <div className="wf-prompt-block"><h5>消息 <small>{prompt.messages.length} 条</small></h5>{prompt.messages.map((message, index) => <article className="wf-prompt-message" key={index}><div className="wf-prompt-message-head"><select aria-label={`消息 ${index + 1} 角色`} disabled={readOnly} value={message.role} onChange={event => updateMessage(index, message.content, event.target.value as "user" | "assistant")}><option value="user">User</option><option value="assistant">Assistant</option></select><button type="button" className="wf-text-button" disabled={readOnly || prompt.messages.length <= 1} onClick={() => removeMessage(index)}>删除消息</button></div>{segmentsView(message.content, { target: "message", message: index })}</article>)}<button type="button" className="wf-text-button" disabled={readOnly} onClick={addMessage}>+ 消息</button></div>
  </section>;
}
