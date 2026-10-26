import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { pointerFieldName } from "../../domain/v2/dataFlow";
import type { Binding, JsonSchema, JsonValue } from "../../domain/v2/types";
import { stateFieldNameIssue, STATE_FIELD_TYPE_LABELS, type StateFieldType } from "../../domain/v2/stateAuthoring";
import { outputTypeMismatch, schemaOutputType } from "../../domain/v2/outputStructure";
import { typeLabel, types } from "./bindingTypes";

export type BindingSelectProps = {
  value?: Binding;
  mode?: "value" | "state";
  /** Workflow startup input structure (`definition.inputSchema`); never a tool/parameter definition. */
  startInputSchema: JsonSchema;
  /** Schema of the parameter being filled; incompatible State fields are disabled. */
  valueSchema?: JsonSchema;
  stateSchema: JsonSchema;
  environmentSchema?: JsonSchema;
  environmentVariables?: Record<string, string | number | boolean>;
  producers?: Map<string, string[]>;
  /** State fields only written by nodes that run after this one. */
  laterProducerFields?: ReadonlySet<string>;
  nodeLabels?: Record<string, string>;
  samples?: Record<string, JsonValue>;
  /** State fields initialized from startup input; shown as 启动输入 when no node writes them. */
  inputInitializedFields?: ReadonlySet<string>;
  /** Output destinations show the field itself; source rows show who wrote it. */
  showWriter?: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
  /** Placeholder for an optional parameter left empty; runtime omits it. */
  unsetLabel?: string;
  /** Enables the "不填" choice for optional parameters. */
  clearable?: boolean;
  onSelect: (binding: Binding) => void;
  onClear?: () => void;
  onLiteral?: () => void;
  onCreateStateField?: (field: string, type: StateFieldType) => void;
};

function asSchema(value: JsonValue | undefined): JsonSchema {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function schemaProperties(schema: JsonSchema): [string, JsonSchema][] {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.entries(properties).map(([name, value]) => [name, asSchema(value)]);
}

/** Options shown in the 启动输入 group; the workflow start Schema is their only source. */
export function startInputOptions(startInputSchema: JsonSchema): [string, JsonSchema][] {
  return schemaProperties(startInputSchema);
}

function shortValue(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 18 ? `${text.slice(0, 18)}…` : text;
}

/**
 * Why an input source cannot fill a parameter. The target field type names the
 * mismatch (e.g. "列表，类型不符"); an empty/undecidable schema never grays.
 */
export function bindingOptionReason(valueSchema: JsonSchema | undefined, optionSchema: JsonSchema | undefined, later = false): string | undefined {
  const reasons: string[] = [];
  if (valueSchema && Object.keys(valueSchema).length) {
    const mismatch = outputTypeMismatch(schemaOutputType(valueSchema), optionSchema ?? {});
    if (mismatch) reasons.push(mismatch);
  }
  if (later) reasons.push("后续节点才会写入");
  return reasons.length ? reasons.join("；") : undefined;
}

/**
 * One "取值" dropdown shared by the parameter table and output rows. It exposes start input,
 * State (grouped by the node that writes each field), environment variables, literal values and
 * an inline "add to State" form, so binding a fresh State field never leaves the row.
 */
export function BindingSelect(props: BindingSelectProps) {
  const { value, mode = "value", startInputSchema, valueSchema, stateSchema, environmentSchema, environmentVariables, producers, laterProducerFields, nodeLabels, inputInitializedFields, showWriter = true, readOnly = false, ariaLabel = "选择取值", unsetLabel, clearable = false, onSelect, onClear, onLiteral, onCreateStateField } = props;
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [field, setField] = useState("");
  const [fieldType, setFieldType] = useState<StateFieldType>("string");
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); setCreating(false); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const inputFields = mode === "value" ? startInputOptions(startInputSchema) : [];
  const stateFields = schemaProperties(stateSchema);
  const environmentFields = mode === "value" ? schemaProperties(environmentSchema ?? {}) : [];
  const labelOf = (nodeId: string) => nodeLabels?.[nodeId] ?? nodeId;
  const currentField = value && value.source !== "literal" ? pointerFieldName(value.pointer) ?? "" : "";
  const sourceLabel = value?.source === "input" ? "启动输入" : value?.source === "state" ? producers?.get(currentField)?.[0] ? `来自 ${labelOf(producers.get(currentField)![0])}` : inputInitializedFields?.has(currentField) ? "启动输入" : "流程数据" : value?.source === "environment" ? "环境变量" : "";
  let currentType = "";
  if (value?.source === "literal") currentType = typeof value.value === "number" ? "数字" : typeof value.value === "boolean" ? "是或否" : Array.isArray(value.value) ? "列表" : value.value && typeof value.value === "object" ? "对象" : "文本";
  else if (currentField) {
    const schema = value?.source === "input" ? inputFields.find(([name]) => name === currentField)?.[1] : stateFields.find(([name]) => name === currentField)?.[1];
    if (schema) currentType = typeLabel(types(schema, value?.source === "input" ? startInputSchema : stateSchema));
  }
  const currentText = value?.source === "literal" ? `固定值 · ${shortValue(value.value)}` : currentField ? showWriter ? `${currentField} · ${sourceLabel}` : currentField : "";

  function pick(binding: Binding) {
    onSelect(binding);
    setOpen(false);
    setCreating(false);
    setError("");
  }

  function startCreate() {
    setCreating(true);
    setField("");
    setFieldType("string");
    setError("");
  }

  function confirmCreate() {
    const issue = stateFieldNameIssue(stateSchema, field);
    if (issue) { setError(issue); return; }
    onCreateStateField?.(field.trim(), fieldType);
    setOpen(false);
    setCreating(false);
    setError("");
    setField("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.stopPropagation(); setOpen(false); setCreating(false); }
  }

  return <div className="wf-binding-select" ref={root} data-mode={mode}>
    <button type="button" className={`wf-binding-trigger${currentText ? " has-value" : ""}`} aria-label={ariaLabel} aria-expanded={open} disabled={readOnly} onClick={() => setOpen(current => !current)}>
      {currentText ? <span className={`wf-binding-chip ${value?.source ?? "unset"}`}>{currentText}</span> : <span className="wf-binding-placeholder">{unsetLabel ?? "选择取值"}</span>}
      <span className="wf-binding-spacer" />
      {currentType ? <small className="wf-binding-type">{currentType}</small> : null}
      <span className="wf-binding-caret" aria-hidden="true">⌄</span>
    </button>
    {open && !readOnly ? <div className="wf-binding-menu" role="group" aria-label="选择输入来源" onKeyDown={onKeyDown}>
      {inputFields.length ? <section className="wf-binding-group">
        <h4>启动输入</h4>
        {inputFields.map(([name, schema]) => {
          const reason = bindingOptionReason(valueSchema, schema);
          return <button type="button" key={`input:${name}`} className={value?.source === "input" && currentField === name ? "current" : ""} disabled={Boolean(reason)} title={reason} onClick={() => pick({ source: "input", pointer: `/${name}`, onMissing: { mode: "error" } })}>
            <span className="wf-binding-option-name">{name}</span><small>{typeLabel(types(schema, startInputSchema))}</small>{reason ? <small className="wf-binding-reason">{reason}</small> : null}
          </button>;
        })}
      </section> : null}
      {stateFields.length ? <section className="wf-binding-group">
        <h4>流程数据（上游节点写入）</h4>
        {stateFields.map(([name, schema]) => {
          const writer = producers?.get(name)?.[0];
          const startedFromInput = inputInitializedFields?.has(name);
          const laterOnly = laterProducerFields?.has(name) && !startedFromInput;
          const reason = bindingOptionReason(valueSchema, schema, laterOnly);
          return <button type="button" key={`state:${name}`} className={value?.source === "state" && currentField === name ? "current" : ""} disabled={Boolean(reason)} title={reason} onClick={() => pick({ source: "state", pointer: `/${name}`, onMissing: { mode: "error" } })}>
            <span className="wf-binding-option-name">{name}{writer ? <small className="wf-binding-writer">来自 {labelOf(writer)}</small> : startedFromInput ? <small className="wf-binding-writer">启动输入</small> : <small className="wf-binding-no-writer">没有节点写入</small>}</span><small>{typeLabel(types(schema, stateSchema))}</small>{reason ? <small className="wf-binding-reason">{reason}</small> : null}
          </button>;
        })}
      </section> : <p className="wf-binding-empty">还没有流程数据字段，可在下方新建。</p>}
      {environmentFields.length ? <section className="wf-binding-group">
        <h4>环境变量</h4>
        {environmentFields.map(([name, schema]) => {
          const reason = bindingOptionReason(valueSchema, schema);
          return <button type="button" key={`env:${name}`} className={value?.source === "environment" && currentField === name ? "current" : ""} disabled={Boolean(reason)} title={reason} onClick={() => pick({ source: "environment", pointer: `/${name}`, onMissing: { mode: "error" } })}>
            <span className="wf-binding-option-name">{name}</span><small>{typeLabel(types(schema, environmentSchema ?? {}))}</small>{reason ? <small className="wf-binding-reason">{reason}</small> : null}
          </button>;
        })}
      </section> : null}
      {mode === "value" && Object.keys(environmentVariables ?? {}).length && !environmentFields.length ? <section className="wf-binding-group">
        <h4>环境变量</h4>
        {Object.keys(environmentVariables ?? {}).map(name => <button type="button" key={`env-value:${name}`} onClick={() => pick({ source: "environment", pointer: `/${name}`, onMissing: { mode: "error" } })}>
          <span className="wf-binding-option-name">{name}</span><small>{typeof environmentVariables?.[name]}</small>
        </button>)}
      </section> : null}
      <div className="wf-binding-divider" />
      <div className="wf-binding-footer-actions">
        {clearable ? <button type="button" className="wf-binding-literal" onClick={() => { onClear?.(); setOpen(false); }}>不填</button> : null}
        {onCreateStateField ? <button type="button" className="wf-binding-create" onClick={startCreate}>＋ 新建字段…</button> : null}
        {mode === "value" && onLiteral ? <button type="button" className="wf-binding-literal" onClick={() => { onLiteral(); setOpen(false); }}>固定值</button> : null}
      </div>
      {creating ? <div className="wf-binding-create-form" role="group" aria-label="新增流程数据字段">
        <label>字段名<input aria-label="新流程数据字段名" value={field} onChange={event => { setField(event.target.value); setError(""); }} placeholder="例如 summary" /></label>
        <label>类型<select aria-label="新流程数据字段类型" value={fieldType} onChange={event => setFieldType(event.target.value as StateFieldType)}>{Object.entries(STATE_FIELD_TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
        {error ? <p role="alert">{error}</p> : null}
        <div><button type="button" className="primary" onClick={confirmCreate}>确认</button><button type="button" onClick={() => { setCreating(false); setError(""); }}>取消</button></div>
      </div> : null}
    </div> : null}
  </div>;
}
