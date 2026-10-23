import { useState } from "react";
import type { Binding, JsonSchema, JsonValue } from "../../domain/v2/types";
import { PARAM_NAME_PATTERN, RESERVED_PARAM_NAME } from "../../domain/v2/schema";
import { defaultParamName } from "../../domain/v2/dataFlow";
import { toolParamRows } from "../../domain/v2/toolParams";
import { resolveFormSchema, SchemaForm } from "./SchemaForm";
import { typeLabel, types } from "./bindingTypes";
import { VariablePicker } from "./VariablePicker";

/**
 * Input table of the unified node panel (M8).
 *
 * `declared` mode edits the node's own parameters (name + binding, unique names, add/remove).
 * `schema` mode follows a tool/registered-function input Schema: names are read-only, rows
 * cannot be added or removed, and a required parameter without a binding is flagged.
 */

export type NodeParamsMode = "declared" | "schema";

export type NodeParamsTableProps = {
  mode: NodeParamsMode;
  inputs: Record<string, Binding>;
  onChangeInputs: (inputs: Record<string, Binding>) => void;
  inputSchema: JsonSchema;
  stateSchema: JsonSchema;
  environmentSchema?: JsonSchema;
  environmentVariables?: Record<string, string | number | boolean>;
  producers?: Map<string, string[]>;
  nodeLabels?: Record<string, string>;
  samples?: Record<string, JsonValue>;
  readOnly?: boolean;
  /** Accepts bindings dragged from the debug dialog (M9); null targets create a new parameter. */
  onDropBinding?: (target: string | null, binding: Binding) => void;
};

export const PARAM_NAME_RULES = "参数名只能使用字母、数字和下划线，不能以数字开头，节点内不可重名。";
export const DROP_BINDING_TYPE = "application/x-eduflow-binding";

/** Reads a dragged variable binding from a drop event; literals are not draggable from the data tree. */
export function readDroppedBinding(event: { dataTransfer: { getData(type: string): string } }): Binding | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(event.dataTransfer.getData(DROP_BINDING_TYPE)); } catch { return undefined; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const value = parsed as Record<string, unknown>;
  if ((value.source === "input" || value.source === "state" || value.source === "environment") && typeof value.pointer === "string") {
    return { source: value.source, pointer: value.pointer, onMissing: value.onMissing === "default" || (typeof value.onMissing === "object" && value.onMissing) ? { mode: "default", value: null } : { mode: "error" } };
  }
  if (value.source === "literal" && "value" in value) return { source: "literal", value: value.value as JsonValue };
  return undefined;
}

function asSchema(value: JsonValue | undefined): JsonSchema {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Why `to` cannot replace `from`, or `undefined` when the rename is legal. */
export function paramNameIssue(inputs: Record<string, Binding>, from: string, to: string): string | undefined {
  const name = to.trim();
  if (!name) return "参数名不能为空。";
  if (name === RESERVED_PARAM_NAME || !PARAM_NAME_PATTERN.test(name)) return PARAM_NAME_RULES;
  if (name !== from && Object.prototype.hasOwnProperty.call(inputs, name)) return `参数名「${name}」已被此节点的另一个参数使用。`;
  return undefined;
}

/** Renames a declared parameter while preserving row order; invalid/duplicate names are rejected. */
export function renameDeclaredParam(inputs: Record<string, Binding>, from: string, to: string): { inputs: Record<string, Binding>; renamed: boolean; reason?: string } {
  const name = to.trim();
  if (name === from) return { inputs, renamed: false };
  const reason = paramNameIssue(inputs, from, to);
  if (reason) return { inputs, renamed: false, reason };
  const entries = Object.entries(inputs).map(([key, binding]): [string, Binding] => [key === from ? name : key, binding]);
  return { inputs: Object.fromEntries(entries), renamed: true };
}

function uniqueParamName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  for (let suffix = 2; suffix < 10000; suffix++) {
    const candidate = `${name}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return name;
}

/** Appends a declared parameter named by `defaultParamName` (never mutates `inputs`). */
export function addDeclaredParam(inputs: Record<string, Binding>, binding: Binding = { source: "literal", value: "" }): { inputs: Record<string, Binding>; name: string } {
  // `defaultParamName` always answers "value" for a literal, so the table keeps that name unique.
  const name = uniqueParamName(defaultParamName(binding, new Set(Object.keys(inputs))), new Set(Object.keys(inputs)));
  return { inputs: { ...inputs, [name]: binding }, name };
}

/**
 * Updates one declared parameter's value. When the row still carries the default name for its
 * previous binding (e.g. `value`), picking a variable renames it to the new field's name — the
 * plan's "选 summary.topics 即为 topics" rule. Manually chosen names are preserved.
 */
export function applyDeclaredBinding(inputs: Record<string, Binding>, name: string, binding: Binding): { inputs: Record<string, Binding>; name: string } {
  const taken = new Set(Object.keys(inputs).filter(key => key !== name));
  const previous = inputs[name];
  const previousDefault = previous ? defaultParamName(previous, taken) : undefined;
  const nextName = previous && name === previousDefault ? defaultParamName(binding, taken) : name;
  const entries = Object.entries(inputs).map(([key, value]): [string, Binding] => [key === name ? nextName : key, key === name ? binding : value]);
  return { inputs: Object.fromEntries(entries), name: nextName };
}

/** Initial literal value for a parameter's sub-Schema, so switching modes stays schema-valid. */
export function initialLiteralValue(schema: JsonSchema): JsonValue {
  const resolved = resolveFormSchema(schema, schema);
  if (resolved.const !== undefined) return resolved.const;
  if (Array.isArray(resolved.enum) && resolved.enum.length) return resolved.enum[0];
  const type = Array.isArray(resolved.type) ? resolved.type.find(item => item !== "null") : resolved.type;
  if (type === "object") return {};
  if (type === "array") return [];
  if (type === "boolean") return false;
  if (type === "number" || type === "integer") return 0;
  if (type === "null") return null;
  return "";
}

function schemaForLiteral(binding: Binding | undefined, declared: JsonSchema | undefined): JsonSchema {
  if (declared && Object.keys(declared).length) return declared;
  if (!binding || binding.source !== "literal") return declared ?? {};
  const value = binding.value;
  return { type: value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "number" ? (Number.isInteger(value) ? "integer" : "number") : typeof value === "boolean" ? "boolean" : typeof value === "object" ? "object" : "string" };
}

function bindingText(binding: Binding): string {
  if (binding.source === "literal") return "固定值";
  const source = binding.source === "input" ? "启动输入" : binding.source === "state" ? "State" : "环境变量";
  return binding.pointer ? `${source} · ${binding.pointer}` : `全部${source}`;
}

function LiteralControl({ schema, value, label, readOnly, onChange }: { schema: JsonSchema; value: JsonValue; label: string; readOnly: boolean; onChange: (value: JsonValue) => void }) {
  const resolved = resolveFormSchema(schema, schema);
  const type = Array.isArray(resolved.type) ? resolved.type.find(item => item !== "null") : resolved.type;
  if (resolved.const !== undefined) return <span className="wf-params-literal-const">{JSON.stringify(resolved.const)}</span>;
  if (Array.isArray(resolved.enum)) {
    const enumValues = resolved.enum as JsonValue[];
    const index = enumValues.findIndex(item => JSON.stringify(item) === JSON.stringify(value));
    return <select aria-label={`${label} 固定值`} disabled={readOnly} value={index} onChange={event => { const next = Number(event.target.value); onChange(next < 0 ? null : enumValues[next]); }}><option value={-1}>请选择</option>{enumValues.map((item, itemIndex) => <option key={itemIndex} value={itemIndex}>{typeof item === "string" ? item : JSON.stringify(item)}</option>)}</select>;
  }
  if (type === "boolean") return <input type="checkbox" role="switch" aria-label={`${label} 固定值`} checked={value === true} disabled={readOnly} onChange={event => onChange(event.target.checked)} />;
  if (type === "number" || type === "integer") return <input type="number" aria-label={`${label} 固定值`} readOnly={readOnly} step={type === "integer" ? 1 : "any"} value={typeof value === "number" ? value : ""} onChange={event => onChange(event.target.value === "" ? null : event.target.valueAsNumber)} />;
  if (type === "string") {
    const text = typeof value === "string" ? value : "";
    const multiline = text.includes("\n") || typeof resolved.maxLength === "number" && resolved.maxLength > 120;
    return multiline
      ? <textarea aria-label={`${label} 固定值`} readOnly={readOnly} rows={3} value={text} onChange={event => onChange(event.target.value)} />
      : <input type="text" aria-label={`${label} 固定值`} readOnly={readOnly} value={text} onChange={event => onChange(event.target.value)} />;
  }
  if (type === "null") return <span className="wf-params-literal-const">null</span>;
  if (type === "object" || type === "array" || resolved.properties) {
    const fallback = type === "array" ? [] : {};
    return <details className="wf-params-literal"><summary>{type === "array" ? "列表固定值" : "对象固定值"}（表单）</summary><fieldset disabled={readOnly}><SchemaForm schema={schema} value={value ?? fallback} label={`${label} 固定值`} prefix={`fixed-${label}`} showValidation={false} onChange={onChange} /></fieldset></details>;
  }
  return <input type="text" aria-label={`${label} 固定值`} readOnly={readOnly} value={typeof value === "string" ? value : JSON.stringify(value)} onChange={event => onChange(event.target.value)} />;
}

type ParamRow = { name: string; title: string; description?: string; schema: JsonSchema; required: boolean; binding?: Binding };

export function NodeParamsTable(props: NodeParamsTableProps) {
  const { mode, inputs, onChangeInputs, inputSchema, stateSchema, environmentSchema, environmentVariables, producers, nodeLabels, samples, readOnly = false, onDropBinding } = props;
  const [pickerName, setPickerName] = useState<string | null>(null);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});

  const inputProperties = inputSchema.properties && typeof inputSchema.properties === "object" && !Array.isArray(inputSchema.properties) ? inputSchema.properties : {};
  const rows: ParamRow[] = mode === "schema"
    ? toolParamRows(inputSchema, inputs).map(row => ({ ...row }))
    : Object.entries(inputs).map(([name, binding]) => ({ name, title: String(asSchema(inputProperties[name]).title ?? name), schema: asSchema(inputProperties[name]), required: false, binding }));

  const knownNames = new Set(rows.map(row => row.name));
  const extraInputs = mode === "schema" ? Object.keys(inputs).filter(name => !knownNames.has(name)) : [];

  function changeBinding(name: string, binding: Binding, rename = mode === "declared") {
    if (rename) {
      const result = applyDeclaredBinding(inputs, name, binding);
      if (result.name !== name) {
        setNameDrafts(drafts => { const next = { ...drafts }; delete next[name]; return next; });
        setNameErrors(errors => { const next = { ...errors }; delete next[name]; return next; });
      }
      onChangeInputs(result.inputs);
      return;
    }
    onChangeInputs({ ...inputs, [name]: binding });
  }

  function toggleVariable(row: ParamRow) {
    if (readOnly) return;
    // Keep the existing value until the picker returns a binding, so closing the picker
    // never leaves an invalid placeholder binding behind.
    setPickerName(row.name);
  }

  function useLiteral(row: ParamRow) {
    if (readOnly) return;
    const schema = schemaForLiteral(row.binding, row.schema);
    changeBinding(row.name, { source: "literal", value: initialLiteralValue(schema) }, false);
  }

  function rename(row: ParamRow, next: string) {
    setNameDrafts(drafts => ({ ...drafts, [row.name]: next }));
    const result = renameDeclaredParam(inputs, row.name, next);
    if (!result.renamed) {
      if (result.reason) setNameErrors(errors => ({ ...errors, [row.name]: result.reason! }));
      else setNameErrors(errors => { const copy = { ...errors }; delete copy[row.name]; return copy; });
      return;
    }
    setNameErrors(errors => { const copy = { ...errors }; delete copy[row.name]; return copy; });
    setNameDrafts(drafts => { const copy = { ...drafts }; delete copy[row.name]; return copy; });
    onChangeInputs(result.inputs);
  }

  function add() {
    const result = addDeclaredParam(inputs);
    onChangeInputs(result.inputs);
  }

  function remove(row: ParamRow) {
    const next = { ...inputs };
    delete next[row.name];
    onChangeInputs(next);
  }

  return (
    <div className="wf-params-table" data-mode={mode} data-readonly={readOnly ? "true" : undefined}>
      <div className="wf-params-head"><span>参数名</span><span>取值</span><span aria-hidden="true" /></div>
      {rows.map(row => {
        const literal = row.binding?.source === "literal" ? row.binding : undefined;
        const variableBinding = row.binding && row.binding.source !== "literal" ? row.binding : undefined;
        const schema = schemaForLiteral(row.binding, row.schema);
        const targetSchema = mode === "schema" ? row.schema : schemaForLiteral(row.binding, row.schema);
        const requiredMissing = row.required && !row.binding;
        const rowError = nameErrors[row.name];
        return (
          <div key={row.name} className={`wf-params-row${requiredMissing ? " required-missing" : ""}`} data-param-name={row.name} data-config-field={`inputs/${row.name}`} data-required-missing={requiredMissing ? "true" : undefined} onDragOver={onDropBinding && !readOnly ? event => { if (event.dataTransfer.types.includes(DROP_BINDING_TYPE)) event.preventDefault(); } : undefined} onDrop={onDropBinding && !readOnly ? event => { const binding = readDroppedBinding(event); if (!binding) return; event.preventDefault(); onDropBinding(row.name, binding); } : undefined}>
            <div className="wf-params-name">
              {mode === "declared"
                ? <input aria-label={`参数名 ${row.name}`} aria-invalid={Boolean(rowError)} readOnly={readOnly} value={nameDrafts[row.name] ?? row.name} onChange={event => rename(row, event.target.value)} />
                : <span className="wf-params-name-readonly">{row.name}</span>}
              {mode === "schema" ? <small className="wf-params-title">{row.title}{row.title !== row.name ? "" : "（参数名）"}</small> : null}
              {row.description ? <small className="wf-params-description">{row.description}</small> : null}
              <small className="wf-params-type">{mode === "schema" ? `类型：${typeLabel(types(row.schema, inputSchema))}${row.required ? " · 必填" : ""}` : ""}</small>
              {rowError ? <span role="alert" className="wf-params-name-error">{rowError}</span> : null}
              {requiredMissing ? <span role="alert" className="wf-params-required-missing">必填参数尚未填写</span> : null}
            </div>
            <div className="wf-params-value">
              <div className="wf-params-modes">
                <button type="button" aria-pressed={Boolean(row.binding && row.binding.source !== "literal")} disabled={readOnly} onClick={() => toggleVariable(row)}>变量</button>
                <button type="button" aria-pressed={Boolean(literal)} disabled={readOnly} onClick={() => useLiteral(row)}>固定值</button>
              </div>
              {literal ? <LiteralControl schema={schema} value={literal.value} label={row.name} readOnly={readOnly} onChange={value => changeBinding(row.name, { source: "literal", value })} />
                : variableBinding ? <button type="button" className="wf-params-bound" disabled={readOnly} title={variableBinding.pointer || "（全部）"} onClick={() => setPickerName(row.name)}>{bindingText(variableBinding)}</button>
                  : <span className="wf-params-unset">未设置</span>}
              {pickerName === row.name && !readOnly ? (
                <VariablePicker
                  inputSchema={inputSchema}
                  stateSchema={stateSchema}
                  environmentSchema={environmentSchema}
                  environmentVariables={environmentVariables}
                  producers={producers}
                  nodeLabels={nodeLabels}
                  samples={samples}
                  targetSchema={targetSchema}
                  value={row.binding}
                  onPick={binding => { setPickerName(null); changeBinding(row.name, binding); }}
                  onPickLiteral={() => { setPickerName(null); useLiteral(row); }}
                  onClose={() => setPickerName(null)}
                />
              ) : null}
            </div>
            <div className="wf-params-actions">
              {mode === "declared" && !readOnly ? <button type="button" className="wf-params-remove" aria-label={`删除参数 ${row.name}`} onClick={() => remove(row)}>删除</button> : null}
            </div>
          </div>
        );
      })}
      {!rows.length ? <p className="wf-params-empty">{mode === "schema" ? "此工具的输入 Schema 没有参数。" : "此节点还没有参数。"}</p> : null}
      {mode === "declared" && !readOnly ? <div className="wf-params-add" onDragOver={onDropBinding && !readOnly ? event => { if (event.dataTransfer.types.includes(DROP_BINDING_TYPE)) event.preventDefault(); } : undefined} onDrop={onDropBinding && !readOnly ? event => { const binding = readDroppedBinding(event); if (!binding) return; event.preventDefault(); onDropBinding(null, binding); } : undefined}><button type="button" onClick={add}>新增参数</button><small>{PARAM_NAME_RULES}{onDropBinding ? "；也可以把左侧字段拖到参数行或这里。" : ""}</small></div> : null}
      {mode === "schema" ? <p className="wf-params-hint">参数来自工具的输入 Schema，参数名只读，必填参数未填时不能运行；可在每行选择变量或固定值。</p> : null}
      {extraInputs.length ? <p className="wf-params-hint" role="note">当前输入不在工具的输入 Schema 中：{extraInputs.join("、")}。这是旧版节点数据，M11 切换为新版后再编辑。</p> : null}
    </div>
  );
}
