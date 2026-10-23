import { useState } from "react";
import type { Binding, JsonSchema, WorkflowNodeV2 } from "../../domain/v2/types";
import { resolveFormSchema, SchemaForm } from "./SchemaForm";
import { JsonField } from "./JsonField";
export function BindingFields({ node, inputSchema, stateSchema, onChange, literalSchemas, environmentSchema = {type:"object",properties:{}}, section = "all" }: { node: WorkflowNodeV2; inputSchema: JsonSchema; stateSchema: JsonSchema; environmentSchema?: JsonSchema; section?: "read" | "write" | "all"; literalSchemas?: Record<string, JsonSchema>; onChange: (node: Partial<WorkflowNodeV2>) => void }) {
  const [newRead, setNewRead] = useState(""), [newWrite, setNewWrite] = useState("");
  const typeNames: Record<string, string> = { object: "对象", string: "文本", number: "数字", integer: "整数", boolean: "是或否", array: "列表", null: "空值" };
  const types = (schema: JsonSchema, root = schema): string[] => {
    const resolved = resolveFormSchema(schema, root);
    return (Array.isArray(resolved.type) ? resolved.type : [resolved.type]).filter((value): value is string => typeof value === "string");
  };
  const compatible = (source: string[], target: string[]) => !source.length || !target.length || source.some(type => target.includes(type) || type === "integer" && target.includes("number") || type === "number" && target.includes("integer"));
  const typeLabel = (value: string[]) => value.map(type => typeNames[type] ?? type).join("或") || "类型未声明";
  const options = (schema: JsonSchema) => schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? Object.entries(schema.properties).map(([name,value]) => ({ pointer: `/${name.replace(/~/g,"~0").replace(/\//g,"~1")}`, label: value && typeof value === "object" && !Array.isArray(value) && typeof value.title === "string" ? value.title : name, types: types(value && typeof value === "object" && !Array.isArray(value) ? value : {}, schema) })) : [];
  function update(name: string, binding: Binding) { onChange({ inputs: { ...node.inputs, [name]: binding } }); }
  return <>{section !== "write" ? <section className="wf-config-section"><h3><span>1</span>读取</h3><small>结果先写入共享状态，下游读取当前状态；不会读取某次历史节点输出。</small>{Object.entries(node.inputs).map(([name,binding]) => {
    const expectedSchema = literalSchemas?.[name] ?? (node.type === "core.tool" && name === "arguments" ? { type: "object" } : {});
    const expected = types(expectedSchema);
    const sourceSchema = binding.source === "environment" ? environmentSchema : binding.source === "state" ? stateSchema : inputSchema;
    const fields = [{ pointer: "", label: binding.source === "environment" ? "全部环境变量" : binding.source === "state" ? "全部共享状态" : "全部启动输入", types: types(sourceSchema) }, ...options(sourceSchema)];
    const fallback = binding.source !== "literal" && binding.onMissing.mode === "default" ? binding.onMissing.value : undefined;
    const fallbackTypes = fallback === undefined ? [] : [fallback === null ? "null" : Array.isArray(fallback) ? "array" : typeof fallback];
    const canRead = (source: string[]) => compatible(source.length ? [...source, ...fallbackTypes] : source, expected);
    const current = binding.source === "literal" ? undefined : fields.find(field => field.pointer === binding.pointer);
    const mismatch = current && !canRead(current.types);
    return <fieldset key={name} data-config-field={`inputs/${name}`}><legend>{name === "arguments" ? "工具参数（整个对象）" : name === "messages" ? "对话消息" : name === "text" ? "问题文本" : name === "toolCalls" ? "待执行工具调用" : name}</legend>
      <label>数据来源<select aria-label={`${name} 数据来源`} value={binding.source} onChange={event => update(name, event.target.value === "literal" ? { source: "literal", value: node.type==="core.llm"&&name==="messages"?[]:expected.length === 1 && expected[0] === "object" ? {} : "" } : { source: event.target.value as "input" | "state" | "environment", pointer: "", onMissing: { mode: "error" } })}><option value="literal">固定值</option><option value="input">启动输入</option><option value="state">共享状态</option><option value="environment">环境变量（只读）</option></select></label>
      {binding.source === "literal" ? <SchemaForm key={`${node.id}-${name}`} draftId={`fixed:${node.id}:${name}`} ownerNodeId={node.id} ownerInputName={name} label={`${name} 固定值`} prefix={`${node.id}-${name}`} schema={literalSchemas?.[name] ?? { type: binding.value === null ? "null" : typeof binding.value === "string" ? "string" : typeof binding.value === "number" ? "number" : typeof binding.value === "boolean" ? "boolean" : Array.isArray(binding.value) ? "array" : "object" }} value={binding.value} onChange={value => update(name, { source: "literal", value })} /> : <>
        <label>读取范围<select aria-label={`${name} 读取字段`} aria-invalid={Boolean(mismatch)} value={binding.pointer} onChange={event => update(name, { ...binding, pointer: event.target.value })}>{fields.map(field => <option value={field.pointer} key={field.pointer} disabled={!canRead(field.types)}>{field.label}（{typeLabel(field.types)}{!canRead(field.types) ? `，与${typeLabel(expected)}不兼容` : ""}）</option>)}{binding.pointer && !current ? <option value={binding.pointer}>{binding.pointer}（当前自定义读取位置）</option> : null}</select></label>
        {mismatch ? <p role="alert">当前读取的字段类型不兼容，请重新选择；原绑定已保留。</p> : null}
        {expected.includes("object") ? <small>这里读取整个对象，不会自动包装单个字段。若启动输入的字段正好就是工具参数，可选择“全部启动输入”；也可选择已有的参数对象，或用固定值表单填写。</small> : null}
        <small>缺少字段时{binding.onMissing.mode === "error" ? "停止并提示错误" : "使用显式配置的缺省值"}。类型可选择不代表内容一定有效，运行前仍会校验。</small>
      </>}
      <button type="button" className="wf-text-button" onClick={() => onChange({ inputs: Object.fromEntries(Object.entries(node.inputs).filter(([key]) => key !== name)) })}>移除此读取项</button>
    </fieldset>;
  })}{!Object.keys(node.inputs).length ? <p>此节点没有读取项。</p> : null}
    <div className="wf-inline-add"><input aria-label="新增读取项名称" placeholder="节点输入名称" value={newRead} onChange={e => setNewRead(e.target.value)}/><button type="button" disabled={!newRead.trim() || Object.prototype.hasOwnProperty.call(node.inputs,newRead.trim())} onClick={() => { update(newRead.trim(), { source: "literal", value: "" }); setNewRead(""); }}>添加读取</button></div>
    <details><summary>高级读取绑定</summary><JsonField ownerNodeId={node.id} fieldId={`${node.id}-bindings`} label="输入绑定" value={node.inputs} onChange={inputs => onChange({ inputs })}/></details></section> : null}
    {section !== "read" ? <section className="wf-config-section"><h3><span>3</span>写入</h3><small>将节点返回结果的指定位置写入 State；空位置表示完整结果。位置以 / 开头，例如 /value 取返回对象中的 value。</small>{node.type === "core.transform" ? <p className="wf-field-note">{node.config.operationRef === "core.message" ? "构造消息返回 messages 列表，写入消息 State 时填写 /messages。" : "此转换返回包含 value 的对象。要将转换后的值写入文本、数字等 State 字段，填写 /value；留空会写入整个对象。"}</p> : null}{Object.entries(node.writes).map(([name,pointer]) => <div key={name} data-config-field={`writes/${name}`} className="wf-write-row"><strong>State · {name}</strong><label>节点返回位置<input aria-label={`状态 ${name} 输出位置`} placeholder="例如 /value" value={pointer} onChange={event => onChange({ writes: { ...node.writes, [name]: event.target.value } })}/></label><button type="button" className="wf-text-button" onClick={() => onChange({ writes: Object.fromEntries(Object.entries(node.writes).filter(([key]) => key !== name)) })}>移除写入</button></div>)}{!Object.keys(node.writes).length ? <p>此节点不更新 State。</p> : null}
    <div className="wf-inline-add"><select aria-label="新增写入目标" value={newWrite} onChange={e => setNewWrite(e.target.value)}><option value="">选择 State 字段</option>{options(stateSchema).map(field => { const key = field.pointer.slice(1).replace(/~1/g,"/").replace(/~0/g,"~"); return <option disabled={Object.prototype.hasOwnProperty.call(node.writes,key)} key={key} value={key}>{field.label}</option>; })}</select><button type="button" disabled={!newWrite} onClick={() => { onChange({ writes: { ...node.writes, [newWrite]: "" } }); setNewWrite(""); }}>添加写入</button></div>
    <details><summary>高级写入映射</summary><JsonField ownerNodeId={node.id} fieldId={`${node.id}-writes`} label="状态写入" value={node.writes} onChange={writes => onChange({ writes })}/></details></section> : null}</>;
}
