import { useState } from "react";
import type { Binding, JsonSchema, JsonValue } from "../../domain/v2/types";
import { pointerFieldName } from "../../domain/v2/dataFlow";
import { readOutputPointer } from "../../domain/v2/runData";
import { escapePointer } from "./SchemaForm";
import { VariablePicker } from "./VariablePicker";

/**
 * Output table of the unified node panel (M8).
 *
 * Authoritative semantics (Worker runtime.py): `node.writes` maps a State field to a JSON
 * Pointer inside the step output — `{answer: "/text"}` means State.answer ← output.text and
 * `""` means the whole output. `outputKeys` is only the suggestion list for the output side.
 * "更新方式" is read from `definition.state.reducers[stateField]` and rendered read-only.
 */

export type NodeOutputsTableProps = {
  outputKeys: string[];
  writes: Record<string, string>;
  onChangeWrites: (writes: Record<string, string>) => void;
  stateSchema: JsonSchema;
  reducers: Record<string, { name: string }>;
  producers?: Map<string, string[]>;
  consumers?: Map<string, string[]>;
  nodeLabels?: Record<string, string>;
  environmentSchema?: JsonSchema;
  samples?: Record<string, JsonValue>;
  onCreateStateField?: (field: string, schema?: JsonSchema) => void;
  readOnly?: boolean;
};

const RESERVED_STATE_FIELD_NAMES = ["__proto__", "constructor", "prototype"];
const EMPTY_INPUT_SCHEMA: JsonSchema = { type: "object", properties: {} };

const reducerNames: Record<string, string> = { replace: "覆盖", append: "追加", messages: "合并消息", "edu.sum": "数值累计", "edu.max": "取最大", "edu.unique": "列表去重" };

export function reducerLabel(name: string): string {
  return reducerNames[name] ?? name;
}

/** JSON Pointer into the step output for one suggested output item. */
export function outputPointerFor(outputKey: string): string {
  return `/${escapePointer(outputKey)}`;
}

/** Why a "新建字段" name is invalid, or `undefined` when it can be created. */
export function stateFieldNameIssue(stateSchema: JsonSchema, field: string): string | undefined {
  const name = field.trim();
  if (!name) return "State 字段名不能为空。";
  if (RESERVED_STATE_FIELD_NAMES.includes(name)) return `「${name}」是保留名称，不能用作 State 字段。`;
  const properties = stateSchema.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties) && Object.prototype.hasOwnProperty.call(properties, name)) return `State 字段「${name}」已存在，请直接从列表选择。`;
  return undefined;
}

/**
 * Creates the State field and the write mapping as one action. Both callbacks fire exactly once;
 * the caller owns the undo entry so the pair can be reverted together (plan M8).
 */
export function commitNewStateField(args: {
  writes: Record<string, string>;
  stateField: string;
  outputPointer: string;
  schema?: JsonSchema;
  onCreateStateField?: (field: string, schema?: JsonSchema) => void;
  onChangeWrites: (writes: Record<string, string>) => void;
}) {
  if (args.schema) args.onCreateStateField?.(args.stateField, args.schema);
  else args.onCreateStateField?.(args.stateField);
  args.onChangeWrites({ ...args.writes, [args.stateField]: args.outputPointer });
}

/**
 * Infers a new State field schema from an already observed output sample. A new `summary`
 * field fed by an array output must be an array; hard-coding string made the first run fail
 * with INVALID_STATE_UPDATE (M12 acceptance item 5).
 */
export function inferStateSchemaFromSample(samples: Record<string, JsonValue> | undefined, outputPointer: string): JsonSchema {
  const value = samples ? readOutputPointer(samples as JsonValue, outputPointer) : undefined;
  if (Array.isArray(value)) return { type: "array", items: { type: "object" } };
  if (value !== null && typeof value === "object") return { type: "object" };
  if (typeof value === "number") return { type: "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  return { type: "string" };
}

function outputPointerLabel(pointer: string, outputKeys: string[]): string {
  if (!pointer) return "整个输出";
  const matched = outputKeys.find(key => outputPointerFor(key) === pointer);
  return matched ? `输出项 ${matched}` : pointer;
}

function replaceField(writes: Record<string, string>, from: string, to: string): Record<string, string> {
  return Object.fromEntries(Object.entries(writes).map(([field, pointer]): [string, string] => [field === from ? to : field, pointer]));
}

type MappingDraft = { outputPointer: string; stateField: string; createField: boolean };

export function NodeOutputsTable(props: NodeOutputsTableProps) {
  const { outputKeys, writes, onChangeWrites, stateSchema, reducers, producers, consumers, nodeLabels, environmentSchema, samples, onCreateStateField, readOnly = false } = props;
  const [pickerField, setPickerField] = useState<string | null>(null);
  const [outputEditor, setOutputEditor] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [mapping, setMapping] = useState<MappingDraft | null>(null);
  const [mappingError, setMappingError] = useState("");

  const labelOf = (nodeId: string) => nodeLabels?.[nodeId] ?? nodeId;
  const stateFields = stateSchema.properties && typeof stateSchema.properties === "object" && !Array.isArray(stateSchema.properties) ? Object.keys(stateSchema.properties) : [];
  const pointerOptions = ["", ...outputKeys.map(outputPointerFor)];

  function setPointer(field: string, pointer: string) {
    onChangeWrites({ ...writes, [field]: pointer });
  }

  function remove(field: string) {
    const next = { ...writes };
    delete next[field];
    onChangeWrites(next);
  }

  function renameField(field: string, binding: Binding) {
    if (binding.source !== "state") return;
    const next = pointerFieldName(binding.pointer);
    if (!next || next === field) { setPickerField(null); return; }
    if (Object.prototype.hasOwnProperty.call(writes, next)) {
      setFieldError({ field, message: `State 字段「${next}」已有写入映射，请先移除原映射。` });
      return;
    }
    setFieldError(null);
    setPickerField(null);
    onChangeWrites(replaceField(writes, field, next));
  }

  function openMapping(outputKey?: string) {
    const outputPointer = outputKey === undefined ? "" : outputPointerFor(outputKey);
    const unused = stateFields.filter(field => !Object.prototype.hasOwnProperty.call(writes, field));
    // The generic "新建字段" button always creates a field; a suggestion row for one output
    // item prefers an unused declared State field but falls back to creating one.
    const createField = outputKey === undefined || !unused.length;
    const stateField = createField ? outputKey ?? "" : unused[0];
    setPickerField(null);
    setOutputEditor(null);
    setMappingError("");
    setMapping({ outputPointer, stateField, createField });
  }

  function confirmMapping() {
    if (!mapping) return;
    if (mapping.createField) {
      const issue = stateFieldNameIssue(stateSchema, mapping.stateField);
      if (issue) { setMappingError(issue); return; }
      commitNewStateField({ writes, stateField: mapping.stateField.trim(), outputPointer: mapping.outputPointer, schema: inferStateSchemaFromSample(samples, mapping.outputPointer), ...(onCreateStateField ? { onCreateStateField } : {}), onChangeWrites });
    } else {
      onChangeWrites({ ...writes, [mapping.stateField]: mapping.outputPointer });
    }
    setMapping(null);
    setMappingError("");
  }

  const rows = Object.entries(writes);
  const mappedPointers = rows.map(([, pointer]) => pointer);
  const unwritten = outputKeys.filter(key => {
    const pointer = outputPointerFor(key);
    return !mappedPointers.some(mapped => mapped === pointer || mapped.startsWith(`${pointer}/`));
  });

  return (
    <div className="wf-outputs-table" data-readonly={readOnly ? "true" : undefined}>
      <div className="wf-outputs-head"><span>State 字段</span><span>输出项（写入位置）</span><span>更新</span><span aria-hidden="true" /></div>
      {rows.map(([field, pointer]) => (
        <div key={field} className="wf-outputs-row written" data-state-field={field}>
          <div className="wf-outputs-field">
            <button type="button" className="wf-outputs-target" disabled={readOnly} onClick={() => { setPickerField(pickerField === field ? null : field); setFieldError(null); }}>State · {field}</button>
            {fieldError?.field === field ? <span role="alert" className="wf-outputs-field-error">{fieldError.message}</span> : null}
            {pickerField === field && !readOnly ? (
              <VariablePicker
                mode="state"
                inputSchema={EMPTY_INPUT_SCHEMA}
                stateSchema={stateSchema}
                environmentSchema={environmentSchema}
                producers={producers}
                nodeLabels={nodeLabels}
                samples={samples}
                value={{ source: "state", pointer: `/${escapePointer(field)}`, onMissing: { mode: "error" } }}
                onPick={binding => renameField(field, binding)}
                onClose={() => setPickerField(null)}
              />
            ) : null}
          </div>
          <div className="wf-outputs-write">
            <button type="button" className="wf-outputs-source" disabled={readOnly} title={pointer || "整个输出"} onClick={() => setOutputEditor(outputEditor === field ? null : field)}>
              {outputPointerLabel(pointer, outputKeys)}{pointer ? <small>{pointer}</small> : null}
            </button>
            {outputEditor === field && !readOnly ? (
              <div className="wf-outputs-source-editor">
                <select aria-label={`${field} 输出项`} value={pointer} onChange={event => setPointer(field, event.target.value)}>
                  {pointerOptions.map(option => <option key={option} value={option}>{outputPointerLabel(option, outputKeys)}</option>)}
                  {!pointerOptions.includes(pointer) ? <option value={pointer}>{pointer}（自定义）</option> : null}
                </select>
                <input aria-label={`${field} 自定义输出位置`} value={pointer} placeholder="例如 /value；留空表示整个输出" onChange={event => setPointer(field, event.target.value)} />
              </div>
            ) : null}
          </div>
          <span className="wf-outputs-reducer">{reducerLabel(reducers[field]?.name ?? "replace")}</span>
          <div className="wf-outputs-actions">{!readOnly ? <button type="button" className="wf-outputs-clear" onClick={() => remove(field)} aria-label={`移除 ${field} 的写入`}>不写入</button> : null}</div>
        </div>
      ))}
      {!rows.length ? <p className="wf-outputs-empty">此节点还没有写入 State 字段。</p> : null}
      {!readOnly ? (
        <div className="wf-outputs-add">
          <button type="button" className="wf-outputs-new-field" onClick={() => openMapping()}>新建字段</button>
          <small>每个 State 字段对应一个输出位置；选择输出项或填写自定义 JSON Pointer。</small>
        </div>
      ) : null}
      {mapping ? (
        <div className="wf-outputs-new-field-form" role="group" aria-label="新建写入映射">
          <label>输出项<select aria-label="新建映射输出项" value={mapping.outputPointer} onChange={event => setMapping({ ...mapping, outputPointer: event.target.value })}>{pointerOptions.map(option => <option key={option} value={option}>{outputPointerLabel(option, outputKeys)}</option>)}</select></label>
          <label>State 字段<select aria-label="新建映射 State 字段" value={mapping.createField ? "__new__" : mapping.stateField} onChange={event => {
            const value = event.target.value;
            if (value === "__new__") setMapping({ ...mapping, createField: true, stateField: mapping.stateField && !stateFields.includes(mapping.stateField) ? mapping.stateField : "" });
            else setMapping({ ...mapping, createField: false, stateField: value });
          }}>
            <option value="__new__">新建字段…</option>
            {stateFields.map(field => <option key={field} value={field}>{field}</option>)}
          </select></label>
          {mapping.createField ? <label>新 State 字段名<input aria-label="新 State 字段名" value={mapping.stateField} onChange={event => setMapping({ ...mapping, stateField: event.target.value })} /></label> : null}
          <div className="wf-outputs-form-actions"><button type="button" onClick={confirmMapping}>创建并写入</button><button type="button" onClick={() => { setMapping(null); setMappingError(""); }}>取消</button></div>
          {mappingError ? <span role="alert" className="wf-outputs-new-field-error">{mappingError}</span> : null}
        </div>
      ) : null}
      {unwritten.length ? (
        <div className="wf-outputs-unwritten-list">
          <p>未写入的输出项（选择 State 字段后写入）：</p>
          {unwritten.map(key => <button key={key} type="button" disabled={readOnly} onClick={() => openMapping(key)}>输出项 {key} · 选择 State 字段</button>)}
        </div>
      ) : null}
      <footer className="wf-outputs-consumers">
        {rows.length
          ? rows.map(([field]) => {
            const readers = consumers?.get(field) ?? [];
            return <p key={field}>下游读取 {field}：{readers.length ? readers.map(labelOf).join("、") : "无"}</p>;
          })
          : <p>此节点还没有写入 State 字段。</p>}
      </footer>
    </div>
  );
}
