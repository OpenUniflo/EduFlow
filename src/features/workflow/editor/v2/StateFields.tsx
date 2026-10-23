import { useMemo, useState } from "react";
import type { JsonSchema, JsonValue, WorkflowDefinitionV2 } from "../../domain/v2/types";
import { stateFieldConsumers, stateFieldProducers, definitionScopes, GRAPH_OUTPUT_NODE_ID } from "../../domain/v2/dataFlow";
import { JsonField } from "./JsonField";

const reducerOptions: Record<string, string> = { replace: "替换当前值", append: "追加列表项", messages: "合并对话消息（按消息身份）", "edu.sum": "注册 Reducer · 数值累计 @1", "edu.max": "注册 Reducer · 数值最大 @1", "edu.unique": "注册 Reducer · 列表去重 @1" };
const fieldNamePattern = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Node label lookup across the root graph and its subgraphs (editor-only, read-only). */
export function nodeLabelIndex(definition: WorkflowDefinitionV2): Map<string, string> {
  const labels = new Map<string, string>([[GRAPH_OUTPUT_NODE_ID, "工作流输出"]]);
  for (const scope of definitionScopes(definition)) for (const node of scope.definition.nodes) if (node && typeof node.id === "string" && !labels.has(node.id)) labels.set(node.id, node.label || node.id);
  return labels;
}

function defaultInitialValue(type: string): JsonValue {
  if (type === "number" || type === "integer") return 0;
  if (type === "boolean") return false;
  if (type === "array") return [];
  if (type === "object") return {};
  return "";
}

function shortValue(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}

/**
 * State editor as a table: field, type, initial value, reducer, writers and readers.
 * Writers/readers are derived from the definition (plan 3.4); nothing is persisted here.
 */
export function StateFields({ definition, onChange, readOnly = false, onLocateNode }: { definition: WorkflowDefinitionV2; onChange: (definition: WorkflowDefinitionV2) => void; readOnly?: boolean; onLocateNode?: (nodeId: string) => void }) {
  const [newName, setNewName] = useState(""), [newType, setNewType] = useState("string"), [newInitial, setNewInitial] = useState(""), [addError, setAddError] = useState("");
  const properties = (definition.state.schema.properties ?? {}) as Record<string, JsonSchema>;
  const producers = useMemo(() => stateFieldProducers(definition), [definition]);
  const consumers = useMemo(() => stateFieldConsumers(definition), [definition]);
  const labels = useMemo(() => nodeLabelIndex(definition), [definition]);
  const fields = Object.keys(properties);

  function replace(next: { properties?: Record<string, JsonSchema>; initial?: Record<string, JsonValue>; reducers?: WorkflowDefinitionV2["state"]["reducers"] }) {
    onChange({ ...definition, state: { ...definition.state, ...(next.properties ? { schema: { ...definition.state.schema, properties: next.properties } } : {}), ...(next.initial ? { initial: next.initial } : {}), ...(next.reducers ? { reducers: next.reducers } : {}) } });
  }
  function modify(name: string, patch: JsonSchema) { replace({ properties: { ...properties, [name]: { ...properties[name], ...patch } } }); }
  function remove(name: string) {
    const nextProperties = { ...properties }; delete nextProperties[name];
    const nextInitial = { ...definition.state.initial }; delete nextInitial[name];
    const nextReducers = { ...definition.state.reducers }; delete nextReducers[name];
    replace({ properties: nextProperties, initial: nextInitial, reducers: nextReducers });
  }
  function setInitial(name: string, value: JsonValue | undefined) {
    const nextInitial = { ...definition.state.initial };
    if (value === undefined) delete nextInitial[name]; else nextInitial[name] = value;
    replace({ initial: nextInitial });
  }
  function setReducer(name: string, reducerName: string) {
    replace({ reducers: { ...definition.state.reducers, [name]: { name: reducerName, version: 1 } } });
  }
  function addField() {
    const name = newName.trim();
    if (!name) { setAddError("请填写字段名称。"); return; }
    if (!fieldNamePattern.test(name)) { setAddError("字段名需以字母或下划线开头，只含字母、数字、下划线，最长 64。"); return; }
    if (Object.prototype.hasOwnProperty.call(properties, name)) { setAddError("字段已存在。"); return; }
    const initial: JsonValue = newInitial.trim() === "" ? defaultInitialValue(newType) : newType === "number" || newType === "integer" ? (Number.isFinite(Number(newInitial)) ? Number(newInitial) : 0) : newType === "boolean" ? newInitial === "true" : newInitial;
    onChange({ ...definition, state: { ...definition.state, schema: { ...definition.state.schema, properties: { ...properties, [name]: { type: newType, ...(newType === "array" ? { items: {} } : {}) } } }, initial: { ...definition.state.initial, [name]: initial } } });
    setNewName(""); setNewInitial(""); setAddError("");
  }
  function owners(ids: string[] | undefined, empty: string) {
    if (!ids?.length) return <span className="wf-state-muted">{empty}</span>;
    return <span className="wf-state-owners">{ids.map(id => <button type="button" key={id} className="wf-text-button" title={id} onClick={() => onLocateNode?.(id)}>{labels.get(id) ?? id}</button>)}</span>;
  }

  return <section className="wf-config-section wf-state-section">
    <h3>状态字段</h3>
    <p>State 是当前图的共享数据：节点写入、下游读取。「更新方式」决定新值替换、追加还是合并。</p>
    <div className="wf-state-table" role="table" aria-label="状态字段表">
      <div className="wf-state-row wf-state-head" role="row"><span>字段</span><span>类型</span><span>初始值</span><span>更新方式</span><span>写入节点</span><span>读取节点</span><span aria-hidden="true"/></div>
      {fields.map(name => {
        const schema = properties[name] ?? {};
        const type = String(schema.type ?? "未指定");
        const reducer = definition.state.reducers[name]?.name ?? "replace";
        const isCustom = !Object.prototype.hasOwnProperty.call(reducerOptions, reducer);
        const hasInitial = Object.prototype.hasOwnProperty.call(definition.state.initial, name);
        const unused = !producers.get(name)?.length && !consumers.get(name)?.length;
        return <details key={name} data-config-field={`state/${name}`} className="wf-state-row-details">
          <summary className="wf-state-row" role="row">
            <strong className="wf-state-field">{name}{unused ? <small className="wf-state-unused">可以删除</small> : null}</strong>
            <span>{type === "未指定" ? "未指定" : type}</span>
            <span title={shortValue(definition.state.initial[name])}>{hasInitial ? shortValue(definition.state.initial[name]) || "空文本" : <span className="wf-state-muted">未设置</span>}</span>
            <span>{reducerOptions[reducer]?.replace(/^注册 Reducer · /, "") ?? reducer}</span>
            <span>{owners(producers.get(name), "无")}</span>
            <span>{owners(consumers.get(name), "无")}</span>
            <span className="wf-state-expand">编辑</span>
          </summary>
          <fieldset className="wf-node-form wf-form-body" disabled={readOnly}>
            <label>类型<select aria-label={`${name} 字段类型`} value={type === "未指定" ? "string" : type} onChange={event => modify(name, { type: event.target.value, ...(event.target.value === "array" ? { items: schema.items ?? {} } : {}) })}>{Object.entries({ string: "文本", number: "数字", integer: "整数", boolean: "是或否", array: "列表", object: "对象" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>字段说明<input aria-label={`${name} 字段说明`} value={String(schema.description ?? "")} onChange={event => modify(name, { description: event.target.value })}/></label>
            <label>初始值{type === "boolean" ? <select aria-label={`${name} 初始值`} value={String(definition.state.initial[name] === true)} onChange={event => setInitial(name, event.target.value === "true")}><option value="false">否</option><option value="true">是</option></select> : type === "array" || type === "object" ? null : <input aria-label={`${name} 初始值`} type={type === "number" || type === "integer" ? "number" : "text"} value={hasInitial ? String(definition.state.initial[name] ?? "") : ""} placeholder="未设置" onChange={event => setInitial(name, event.target.value === "" ? undefined : type === "number" || type === "integer" ? Number(event.target.value) : event.target.value)}/>}</label>
            {type === "array" || type === "object" ? <JsonField label={`${name} 初始值`} value={definition.state.initial[name] ?? (type === "array" ? [] : {})} onChange={value => setInitial(name, value)}/> : null}
            <label>更新方式<select aria-label={`${name} 更新方式`} value={isCustom ? "custom.reducer" : reducer} onChange={event => setReducer(name, event.target.value)}>{Object.entries(reducerOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="custom.reducer">自定义 Reducer</option></select></label>
            {isCustom ? <label>Reducer 函数标识<input aria-label={`${name} Reducer 标识`} value={reducer} placeholder="例如 team.normalize" onChange={event => setReducer(name, event.target.value)}/><small>保存注册函数的引用，不在浏览器执行。</small></label> : null}
            <div className="wf-state-row-actions"><small>缺少字段时运行会停止；所有写入共享同一份 State。</small><button type="button" className="wf-text-button" onClick={() => remove(name)}>删除字段</button></div>
          </fieldset>
        </details>;
      })}
    </div>
    {!fields.length ? <p className="wf-empty-note">还没有状态字段。可在下方添加，或让节点写入时自动创建。</p> : null}
    <fieldset className="wf-state-add" disabled={readOnly}>
      <legend>添加状态字段</legend>
      <label>字段名称<input aria-label="State 新字段名称" value={newName} onChange={event => { setNewName(event.target.value); setAddError(""); }} placeholder="例如 answer"/></label>
      <label>字段类型<select aria-label="State 新字段类型" value={newType} onChange={event => setNewType(event.target.value)}>{Object.entries({ string: "文本", number: "数字", boolean: "是或否", array: "列表", object: "对象" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="button" disabled={!newName.trim() || ["__proto__", "constructor", "prototype"].includes(newName.trim())} onClick={addField}>添加字段</button>
      {addError ? <p role="alert">{addError}</p> : null}
    </fieldset>
  </section>;
}
