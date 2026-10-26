import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Binding, JsonSchema, JsonValue, WorkflowTool } from "../../domain/v2/types";
import { PARAM_NAME_PATTERN, RESERVED_PARAM_NAME } from "../../domain/v2/schema";
import { defaultParamName } from "../../domain/v2/dataFlow";
import { toolParamRows } from "../../domain/v2/toolParams";
import { resolveFormSchema, SchemaForm } from "./SchemaForm";
import { typeLabel, types } from "./bindingTypes";
import { BindingSelect } from "./BindingSelect";
import type { StateFieldType } from "../../domain/v2/stateAuthoring";

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
  /** Parameter definition structure: which rows exist, their types and required flags (tool/function Schema). */
  paramSchema: JsonSchema;
  /** Workflow startup input structure (`definition.inputSchema`), used only by the 启动输入 menu. */
  startInputSchema: JsonSchema;
  stateSchema: JsonSchema;
  environmentSchema?: JsonSchema;
  environmentVariables?: Record<string, string | number | boolean>;
  producers?: Map<string, string[]>;
  laterProducerFields?: ReadonlySet<string>;
  nodeLabels?: Record<string, string>;
  samples?: Record<string, JsonValue>;
  inputInitializedFields?: ReadonlySet<string>;
  readOnly?: boolean;
  /** Tool whose API resource the footer's 编辑工具 action opens. */
  tool?: WorkflowTool;
  onEditTool?: () => void;
  /** Accepts bindings dragged from the workbench; null targets create a new parameter. */
  onDropBinding?: (target: string | null, binding: Binding) => void;
  /** Creates the State field and binds this parameter in one caller-owned edit. */
  onCreateStateField?: (field: string, type: StateFieldType, paramName: string) => void;
  /** The section header owns the add action; the table omits its own footer button. */
  showAdd?: boolean;
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

/** Drops every binding the tool's Schema does not declare (extra inputs from older node versions). */
export function removeUnknownToolInputs(inputs: Record<string, Binding>, inputSchema: JsonSchema): Record<string, Binding> {
  const known = new Set(toolParamRows(inputSchema).map(row => row.name));
  const next = { ...inputs };
  for (const name of Object.keys(next)) if (!known.has(name)) delete next[name];
  return next;
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
  const { mode, inputs, onChangeInputs, paramSchema, startInputSchema, stateSchema, environmentSchema, environmentVariables, producers, laterProducerFields, nodeLabels, samples, inputInitializedFields, readOnly = false, onDropBinding, onCreateStateField, showAdd = true, tool, onEditTool } = props;
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});
  const rowIds = useRef(new Map<string, string>());
  const nextRowId = useRef(0);
  const composing = useRef(false);
  const skipBlur = useRef<string | null>(null);

  /** Stable row identity: a rename moves the id with the parameter instead of remounting the row. */
  function rowId(name: string): string {
    const existing = rowIds.current.get(name);
    if (existing) return existing;
    const id = `param-row-${nextRowId.current += 1}`;
    rowIds.current.set(name, id);
    return id;
  }

  function moveRowId(from: string, to: string) {
    const id = rowIds.current.get(from);
    if (!id) return;
    rowIds.current.delete(from);
    rowIds.current.set(to, id);
  }

  function forgetRow(name: string) {
    const id = rowIds.current.get(name);
    rowIds.current.delete(name);
    if (!id) return;
    setNameDrafts(drafts => { const next = { ...drafts }; delete next[id]; return next; });
    setNameErrors(errors => { const next = { ...errors }; delete next[id]; return next; });
  }

  function clearNameError(id: string) {
    setNameErrors(errors => {
      if (!Object.prototype.hasOwnProperty.call(errors, id)) return errors;
      const next = { ...errors }; delete next[id]; return next;
    });
  }

  function draftName(id: string, from: string, value: string) {
    setNameDrafts(drafts => ({ ...drafts, [id]: value }));
    const issue = value === from ? undefined : paramNameIssue(inputs, from, value);
    setNameErrors(errors => {
      const next = { ...errors };
      if (issue) next[id] = issue; else delete next[id];
      return next;
    });
  }

  /** Commits the draft once; an invalid name is reported and the original is restored. */
  function commitName(id: string, from: string) {
    const draft = nameDrafts[id];
    if (draft === undefined) return;
    const name = draft.trim();
    if (name === from) {
      setNameDrafts(drafts => { const next = { ...drafts }; delete next[id]; return next; });
      clearNameError(id);
      return;
    }
    const result = renameDeclaredParam(inputs, from, draft);
    setNameDrafts(drafts => { const next = { ...drafts }; delete next[id]; return next; });
    if (!result.renamed) {
      if (result.reason) setNameErrors(errors => ({ ...errors, [id]: result.reason! }));
      else clearNameError(id);
      return;
    }
    moveRowId(from, name);
    clearNameError(id);
    onChangeInputs(result.inputs);
  }

  function cancelName(id: string) {
    setNameDrafts(drafts => { const next = { ...drafts }; delete next[id]; return next; });
    clearNameError(id);
  }

  const inputProperties = paramSchema.properties && typeof paramSchema.properties === "object" && !Array.isArray(paramSchema.properties) ? paramSchema.properties : {};
  const rows: ParamRow[] = mode === "schema"
    ? toolParamRows(paramSchema, inputs).map(row => ({ ...row }))
    : Object.entries(inputs).map(([name, binding]) => ({ name, title: String(asSchema(inputProperties[name]).title ?? name), schema: asSchema(inputProperties[name]), required: false, binding }));

  const knownNames = new Set(rows.map(row => row.name));
  const extraInputs = mode === "schema" ? Object.keys(inputs).filter(name => !knownNames.has(name)) : [];

  function changeBinding(name: string, binding: Binding, rename = mode === "declared") {
    if (rename) {
      const id = rowIds.current.get(name);
      const result = applyDeclaredBinding(inputs, name, binding);
      if (result.name !== name && id) {
        moveRowId(name, result.name);
        setNameDrafts(drafts => { const next = { ...drafts }; delete next[id]; return next; });
        setNameErrors(errors => { const next = { ...errors }; delete next[id]; return next; });
      }
      onChangeInputs(result.inputs);
      return;
    }
    onChangeInputs({ ...inputs, [name]: binding });
  }

  function useLiteral(row: ParamRow) {
    if (readOnly) return;
    const schema = schemaForLiteral(row.binding, row.schema);
    changeBinding(row.name, { source: "literal", value: initialLiteralValue(schema) }, false);
  }

  function add() {
    const result = addDeclaredParam(inputs);
    onChangeInputs(result.inputs);
  }

  function remove(row: ParamRow) {
    forgetRow(row.name);
    const next = { ...inputs };
    delete next[row.name];
    onChangeInputs(next);
  }

  const showAction = mode === "declared" && !readOnly && rows.length > 0;

  return (
    <div className="wf-params-table" data-mode={mode} data-readonly={readOnly ? "true" : undefined} data-actions={showAction ? "true" : undefined}>
      <div className="wf-params-head"><span>参数名</span><span>取值来源</span>{showAction ? <span aria-hidden="true" /> : null}</div>
      {rows.map(row => {
        const literal = row.binding?.source === "literal" ? row.binding : undefined;
        const schema = schemaForLiteral(row.binding, row.schema);
        const requiredMissing = row.required && !row.binding;
        const key = rowId(row.name);
        const rowError = nameErrors[key];
        return (
          <div key={key} className={`wf-params-row${requiredMissing ? " required-missing" : ""}`} data-param-name={row.name} data-config-field={`inputs/${row.name}`} data-required-missing={requiredMissing ? "true" : undefined} onDragOver={onDropBinding && !readOnly ? event => { if (event.dataTransfer.types.includes(DROP_BINDING_TYPE)) event.preventDefault(); } : undefined} onDrop={onDropBinding && !readOnly ? event => { const binding = readDroppedBinding(event); if (!binding) return; event.preventDefault(); onDropBinding(row.name, binding); } : undefined}>
            <div className="wf-params-name" title={mode === "schema" ? [row.title !== row.name ? row.title : "", row.description ?? ""].filter(Boolean).join(" · ") || undefined : undefined}>
              {mode === "declared"
                ? <input
                  aria-label={`参数名 ${row.name}`}
                  aria-invalid={Boolean(rowError)}
                  readOnly={readOnly}
                  value={nameDrafts[key] ?? row.name}
                  onChange={event => draftName(key, row.name, event.target.value)}
                  onFocus={() => clearNameError(key)}
                  onBlur={() => {
                    if (skipBlur.current === key) { skipBlur.current = null; return; }
                    commitName(key, row.name);
                  }}
                  onCompositionStart={() => { composing.current = true; }}
                  onCompositionEnd={() => { composing.current = false; }}
                  onKeyDown={event => {
                    if (event.key === "Enter") {
                      if (event.nativeEvent.isComposing || composing.current) return;
                      event.preventDefault();
                      commitName(key, row.name);
                      skipBlur.current = key;
                      event.currentTarget.blur();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      cancelName(key);
                    }
                  }}
                />
                : <div className="wf-params-name-line"><code className="wf-params-name-readonly">{row.name}</code><span className="wf-params-type-badge">{typeLabel(types(row.schema, paramSchema))}</span>{row.required ? <span className="wf-params-required-badge">必填</span> : <span className="wf-params-optional-badge">可选</span>}</div>}
              {rowError ? <span role="alert" className="wf-params-name-error">{rowError}</span> : null}
              {requiredMissing ? <span role="alert" className="wf-params-required-missing">必填参数尚未填写</span> : null}
            </div>
            <div className="wf-params-value">
              <BindingSelect
                value={row.binding}
                startInputSchema={startInputSchema}
                valueSchema={row.schema}
                stateSchema={stateSchema}
                environmentSchema={environmentSchema}
                environmentVariables={environmentVariables}
                producers={producers}
                laterProducerFields={laterProducerFields}
                nodeLabels={nodeLabels}
                samples={samples}
                inputInitializedFields={inputInitializedFields}
                readOnly={readOnly}
                ariaLabel={`参数 ${row.name} 取值`}
                {...(mode === "schema" && !row.required ? { unsetLabel: "不填", clearable: true, onClear: () => remove(row) } : {})}
                onSelect={binding => changeBinding(row.name, binding)}
                onLiteral={() => useLiteral(row)}
                {...(onCreateStateField ? { onCreateStateField: (field, type) => onCreateStateField(field, type, row.name) } : {})}
              />
              {literal ? <LiteralControl schema={schema} value={literal.value} label={row.name} readOnly={readOnly} onChange={value => changeBinding(row.name, { source: "literal", value })} /> : null}
            </div>
            {showAction ? <div className="wf-params-actions">
              <button type="button" className="wf-params-remove" aria-label={`删除参数 ${row.name}`} title="删除参数" onClick={() => remove(row)}><Trash2 size={13}/></button>
            </div> : null}
          </div>
        );
      })}
      {!rows.length ? <p className="wf-params-empty">{mode === "schema" ? "这个工具没有输入参数。" : "此节点还没有参数。"}</p> : null}
      {mode === "declared" && !readOnly && showAdd ? <div className="wf-params-add" onDragOver={onDropBinding ? event => { if (event.dataTransfer.types.includes(DROP_BINDING_TYPE)) event.preventDefault(); } : undefined} onDrop={onDropBinding ? event => { const binding = readDroppedBinding(event); if (!binding) return; event.preventDefault(); onDropBinding(null, binding); } : undefined}><button type="button" onClick={add}>＋ 添加输入</button>{onDropBinding ? <small>也可以把左侧字段拖到参数行或这里。</small> : null}</div> : null}
      {mode === "schema" ? <div className="wf-params-tool-footer" title={tool ? `${tool.name} 的参数` : undefined}>
        <span>参数由工具定义</span><span aria-hidden="true">·</span>
        <button type="button" title="打开 API 资源编辑器" disabled={!onEditTool || readOnly} onClick={() => onEditTool?.()}>编辑工具</button>
        <span className="wf-params-tool-footer-spacer" />
        <span>{rows.length} 个参数</span>
      </div> : null}
      {extraInputs.length ? <div className="wf-params-extra" role="note">
        <p>这些输入不是当前工具的参数，运行时不会使用：{extraInputs.join("、")}。</p>
        <button type="button" className="wf-params-extra-remove" onClick={() => onChangeInputs(removeUnknownToolInputs(inputs, paramSchema))}>移除</button>
      </div> : null}
    </div>
  );
}
