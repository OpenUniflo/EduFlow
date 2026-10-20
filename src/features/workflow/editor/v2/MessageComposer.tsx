import type { JsonValue } from "../../domain/v2/types";
const object = (value: JsonValue) => value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
/** Edits the text-only subset of the existing MessageV1 authoring contract. Execution stays server-side. */
export function MessageComposer({ value, onChange }: { value: JsonValue; onChange: (value: JsonValue) => void }) {
  const messages = Array.isArray(value) ? value : [];
  const update = (index: number, patch: Record<string, JsonValue>) => onChange(messages.map((message, i) => i === index ? { ...object(message), ...patch } : message));
  return <section aria-label="固定对话消息"><p className="wf-field-note">添加用户问题或系统指令。消息身份由编辑器生成，无需填写 JSON。</p>{!Array.isArray(value) ? <p role="alert">当前值不是消息列表。原值保留在高级读取绑定中；添加消息会替换当前固定值。</p> : null}{messages.map((message, index) => {
    const item = object(message); const blocks = Array.isArray(item?.content) ? item.content : [];
    const simple = blocks.every(block => object(block)?.type === "text");
    const text = blocks.map(block => String(object(block)?.text ?? "")).join("\n");
    return <fieldset key={String(item?.id ?? index)}><legend>消息 {index + 1}</legend><label>角色<select aria-label={`消息 ${index + 1} 角色`} value={String(item?.role ?? "user")} onChange={e => update(index, { role: e.target.value })}><option value="user">用户问题</option><option value="system">系统指令</option>{!["user", "system"].includes(String(item?.role ?? "user")) ? <option value={String(item?.role)}>{String(item?.role)}（高级消息）</option> : null}</select></label>{simple ? <label>内容<textarea aria-label={`消息 ${index + 1} 内容`} value={text} placeholder="填写这条消息的内容" onChange={e => update(index, { content: [{ type: "text", text: e.target.value }] })}/></label> : <p>此消息包含高级内容，请在高级读取绑定中编辑；已有数据已保留。</p>}<button type="button" onClick={() => onChange(messages.filter((_, i) => i !== index))}>删除消息 {index + 1}</button></fieldset>;
  })}<button type="button" onClick={() => onChange([...messages, { id: crypto.randomUUID(), role: "user", content: [{ type: "text", text: "" }] }])}>添加消息</button></section>;
}
