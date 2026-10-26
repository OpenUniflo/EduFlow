import { useMemo, useRef, useState } from "react";
import type { JsonSchema, JsonValue, WorkflowDefinitionV2 } from "../../domain/v2/types";
import { stateFieldConsumers, stateFieldProducers, definitionScopes, GRAPH_OUTPUT_NODE_ID } from "../../domain/v2/dataFlow";
import {
  STATE_FIELD_TYPE_LABELS, removeStateField, renameStateField, stateFieldNameIssue, stateTypeLabel, withStateField,
  withStateFieldInitial, withStateFieldSchema, withStateReducer, type StateFieldType,
} from "../../domain/v2/stateAuthoring";
import { JsonField } from "./JsonField";

const reducerOptions: Record<string, string> = { replace: "替换", append: "追加", messages: "合并消息", "edu.sum": "数值累计", "edu.max": "最大值", "edu.unique": "列表去重" };
const fieldNamePattern = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Node label lookup across the root graph and its subgraphs (editor-only, read-only). */
export function nodeLabelIndex(definition: WorkflowDefinitionV2): Map<string, string> {
  const labels = new Map<string, string>([[GRAPH_OUTPUT_NODE_ID, "工作流输出"]]);
  for (const scope of definitionScopes(definition)) for (const node of scope.definition.nodes) if (node && typeof node.id === "string" && !labels.has(node.id)) labels.set(node.id, node.label || node.id);
  return labels;
}

function defaultInitialValue(type: StateFieldType): JsonValue {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "array") return [];
  if (type === "object") return {};
  return "";
}

function shortValue(value: JsonValue | undefined): string {
  if (value === undefined) return "未设置";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "空文本";
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}

/**
 * The data panel: every field, its Chinese type and the node that writes it. Field editing
 * stays inside each row's disclosure; adding a field is one inline action.
 */
export function StateFields({ definition, onChange, readOnly = false, onLocateNode }: { definition: WorkflowDefinitionV2; onChange: (definition: WorkflowDefinitionV2) => void; readOnly?: boolean; onLocateNode?: (nodeId: string) => void }) {
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<StateFieldType>("string");
  const [addError, setAddError] = useState("");
  const [query, setQuery] = useState("");
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});
  const composing = useRef(false);
  const skipNameBlur = useRef<string | null>(null);
  const properties = (definition.state.schema.properties ?? {}) as Record<string, JsonSchema>;
  const producers = useMemo(() => stateFieldProducers(definition), [definition]);
  const consumers = useMemo(() => stateFieldConsumers(definition), [definition]);
  const labels = useMemo(() => nodeLabelIndex(definition), [definition]);
  const fields = Object.keys(properties);
  const visible = fields.filter(name => !query.trim() || name.toLowerCase().includes(query.trim().toLowerCase()) || stateTypeLabel(properties[name]?.type).includes(query.trim()));

  function modify(name: string, patch: JsonSchema) {
    onChange(withStateFieldSchema(definition, name, patch));
  }
  function setInitial(name: string, value: JsonValue | undefined) {
    onChange(withStateFieldInitial(definition, name, value));
  }
  function setReducer(name: string, reducerName: string) {
    onChange(withStateReducer(definition, name, reducerName));
  }
  function remove(name: string) {
    onChange(removeStateField(definition, name));
  }
  function draftFieldName(name: string, value: string) {
    setNameDrafts(drafts => ({ ...drafts, [name]: value }));
    const issue = value === name ? undefined : stateFieldNameIssue(definition.state.schema, value);
    setNameErrors(errors => {
      const next = { ...errors };
      if (issue) next[name] = issue; else delete next[name];
      return next;
    });
  }
  /** Commits a field-name draft once; an invalid name is reported and the old name restored. */
  function commitFieldName(name: string) {
    const draft = nameDrafts[name];
    if (draft === undefined) return;
    const value = draft.trim();
    setNameDrafts(drafts => { const next = { ...drafts }; delete next[name]; return next; });
    if (value === name) {
      setNameErrors(errors => { const next = { ...errors }; delete next[name]; return next; });
      return;
    }
    const issue = stateFieldNameIssue(definition.state.schema, value);
    if (issue) {
      setNameErrors(errors => ({ ...errors, [name]: issue }));
      return;
    }
    setNameErrors(errors => { const next = { ...errors }; delete next[name]; return next; });
    onChange(renameStateField(definition, name, value));
  }
  function cancelFieldName(name: string) {
    setNameDrafts(drafts => { const next = { ...drafts }; delete next[name]; return next; });
    setNameErrors(errors => { const next = { ...errors }; delete next[name]; return next; });
  }
  function addField() {
    const name = newName.trim();
    const issue = stateFieldNameIssue(definition.state.schema, name);
    if (issue) { setAddError(issue); return; }
    onChange(withStateField(definition, name, newType));
    setNewName("");
    setAddError("");
  }
  function owners(ids: string[] | undefined, empty: string) {
    if (!ids?.length) return <span className="wf-state-muted">{empty}</span>;
    return <span className="wf-state-owners">{ids.map(id => <button type="button" key={id} className="wf-text-button" title={id} onClick={() => onLocateNode?.(id)}>{labels.get(id) ?? id}</button>)}</span>;
  }

  return <section className="wf-config-section wf-state-section">
    <div className="wf-state-toolbar">
      <input aria-label="搜索字段" placeholder="搜索字段…" value={query} onChange={event => setQuery(event.target.value)} />
      <small>节点输出会自动出现在这里</small>
    </div>
    <div className="wf-state-table" role="table" aria-label="数据字段表">
      <div className="wf-state-row wf-state-head" role="row"><span>字段名</span><span>类型</span><span>写入节点</span><span aria-hidden="true" /></div>
      {visible.map(name => {
        const schema = properties[name] ?? {};
        const rawType = typeof schema.type === "string" ? schema.type : "string";
        const type = (rawType === "integer" ? "number" : rawType in STATE_FIELD_TYPE_LABELS ? rawType : "string") as StateFieldType;
        const reducer = definition.state.reducers[name]?.name ?? "replace";
        const isCustom = !Object.prototype.hasOwnProperty.call(reducerOptions, reducer);
        const inputBound = Object.prototype.hasOwnProperty.call(definition.state.inputBindings ?? {}, name);
        const hasInitial = Object.prototype.hasOwnProperty.call(definition.state.initial, name);
        const noWriter = !inputBound && !producers.get(name)?.length;
        const orphan = noWriter && !consumers.get(name)?.length;
        return <details key={name} data-config-field={`state/${name}`} data-no-writer={noWriter ? "true" : undefined} className="wf-state-row-details">
          <summary className="wf-state-row" role="row">
            <strong className="wf-state-field">{name}{orphan ? <small className="wf-state-unused">未使用</small> : null}</strong>
            <span>{stateTypeLabel(type)}</span>
            <span>{inputBound ? <span className="wf-state-owner-static">启动输入</span> : producers.get(name)?.length ? owners(producers.get(name), "无") : <span className="wf-state-no-writer" title={orphan ? "没有节点写入，也没有节点读取" : "没有节点写入，但仍被下游读取"}>没有节点写入</span>}</span>
            {orphan && !readOnly ? <button type="button" className="wf-state-remove-orphan" aria-label={`删除字段 ${name}`} title="这个字段没有节点写入或读取，可以删除" onClick={event => { event.preventDefault(); event.stopPropagation(); remove(name); }}>删除</button> : <span className="wf-state-expand">编辑</span>}
          </summary>
          <fieldset className="wf-node-form wf-form-body" disabled={readOnly}>
            {(() => {
              const writerCount = producers.get(name)?.length ?? 0;
              const shared = writerCount > 1;
              const nameError = nameErrors[name];
              return <>
                <label>字段名<input
                  aria-label={`${name} 字段名`}
                  aria-invalid={Boolean(nameError)}
                  disabled={shared}
                  value={nameDrafts[name] ?? name}
                  onChange={event => draftFieldName(name, event.target.value)}
                  onFocus={() => setNameErrors(errors => { const next = { ...errors }; delete next[name]; return next; })}
                  onBlur={() => {
                    if (skipNameBlur.current === name) { skipNameBlur.current = null; return; }
                    commitFieldName(name);
                  }}
                  onCompositionStart={() => { composing.current = true; }}
                  onCompositionEnd={() => { composing.current = false; }}
                  onKeyDown={event => {
                    if (event.key === "Enter") {
                      if (event.nativeEvent.isComposing || composing.current) return;
                      event.preventDefault();
                      commitFieldName(name);
                      skipNameBlur.current = name;
                      event.currentTarget.blur();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      cancelFieldName(name);
                    }
                  }}
                /></label>
                {shared ? <small role="note" className="wf-state-rename-lock">有 {writerCount} 个节点写入此字段，不能直接改名。请先让其他节点改用别的字段。</small> : null}
                {nameError ? <p role="alert" className="wf-state-name-error">{nameError}</p> : null}
              </>;
            })()}
            <label>类型<select aria-label={`${name} 字段类型`} value={type} onChange={event => modify(name, { type: event.target.value, ...(event.target.value === "array" ? { items: schema.items ?? {} } : {}) })}>{Object.entries(STATE_FIELD_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>字段说明<input aria-label={`${name} 字段说明`} value={String(schema.description ?? "")} onChange={event => modify(name, { description: event.target.value })} /></label>
            <label>初始值{type === "boolean" ? <select aria-label={`${name} 初始值`} value={String(definition.state.initial[name] === true)} onChange={event => setInitial(name, event.target.value === "true")}><option value="false">否</option><option value="true">是</option></select> : type === "array" || type === "object" ? null : <input aria-label={`${name} 初始值`} type={type === "number" ? "number" : "text"} value={hasInitial ? String(definition.state.initial[name] ?? "") : ""} placeholder="未设置" onChange={event => setInitial(name, event.target.value === "" ? undefined : type === "number" ? Number(event.target.value) : event.target.value)} />}</label>
            {type === "array" || type === "object" ? <JsonField label={`${name} 初始值`} value={definition.state.initial[name] ?? defaultInitialValue(type)} onChange={value => setInitial(name, value)} /> : null}
            <label>更新方式<select aria-label={`${name} 更新方式`} value={isCustom ? "custom.reducer" : reducer} onChange={event => setReducer(name, event.target.value)}>{Object.entries(reducerOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}{isCustom ? <option value="custom.reducer">自定义</option> : null}</select></label>
            {isCustom ? <small>当前字段使用自定义更新方式。</small> : null}
            <div className="wf-state-row-actions"><small>缺少字段时运行会停止；所有写入共享同一份数据。</small><button type="button" className="wf-text-button" onClick={() => remove(name)}>删除字段</button></div>
          </fieldset>
        </details>;
      })}
    </div>
    {!fields.length ? <p className="wf-empty-note">还没有数据字段。可在下方添加，或让节点写入时自动创建。</p> : null}
    {fields.length && !visible.length ? <p className="wf-empty-note">没有匹配的字段。</p> : null}
    <fieldset className="wf-state-add" disabled={readOnly}>
      <legend>新增字段</legend>
      <label>字段名称<input aria-label="流程数据新字段名称" value={newName} onChange={event => { setNewName(event.target.value); setAddError(""); }} placeholder="例如 answer" /></label>
      <label>类型<select aria-label="流程数据新字段类型" value={newType} onChange={event => setNewType(event.target.value as StateFieldType)}>{Object.entries(STATE_FIELD_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="button" disabled={!newName.trim() || !fieldNamePattern.test(newName.trim())} onClick={addField}>添加字段</button>
      {addError ? <p role="alert">{addError}</p> : null}
    </fieldset>
  </section>;
}
