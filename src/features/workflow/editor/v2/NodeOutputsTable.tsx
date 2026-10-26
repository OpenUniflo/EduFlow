import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CompositionEvent as ReactCompositionEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Trash2 } from "lucide-react";
import type { JsonSchema, JsonValue, StructuredOutputField, StructuredOutputFieldType, WorkflowNodeV2, WorkflowTool } from "../../domain/v2/types";
import { readOutputPointer } from "../../domain/v2/runData";
import { GRAPH_OUTPUT_NODE_ID } from "../../domain/v2/dataFlow";
import { stateFieldNameIssue, stateTypeLabel, type StateFieldType } from "../../domain/v2/stateAuthoring";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  OUTPUT_TYPE_LABELS, outputSchemaItems, outputTypeMismatch, outputValueItems,
  stateFieldOutputType, stateTypeForOutput, structuredOutputFields, writeOutputItem, writeOutputType,
  type NodeOutputItem, type OutputValueType,
} from "../../domain/v2/outputStructure";

/**
 * Output table of the unified node panel.
 *
 * One row exists per write, so deleting a row deletes exactly that write. The
 * output type is derived from the node's declared output structure (never from
 * a sample value); a sample is used only when no structure exists. The
 * destination menu creates a new field named after the output item or selects
 * a type-compatible existing field.
 */

export { stateFieldNameIssue };

export type NewOutputRow = { field: string; type: StructuredOutputFieldType | StateFieldType; pointer: string };

export type NodeOutputsTableProps = {
  node: WorkflowNodeV2;
  writes: Record<string, string>;
  onChangeWrites: (writes: Record<string, string>) => void;
  stateSchema: JsonSchema;
  tool?: WorkflowTool;
  lastOutput?: JsonValue;
  consumers?: Map<string, string[]>;
  nodeLabels?: Record<string, string>;
  readOnly?: boolean;
  addOpen?: boolean;
  onCloseAdd?: () => void;
  /** Creates a State field and its write. `replaceField` removes the row being renamed. */
  onCreateStateField?: (field: string, type: StateFieldType, pointer: string, replaceField?: string) => void;
  /** Adds several writes (and their fields) from the output-structure tree in one edit. */
  onAddOutputs?: (rows: NewOutputRow[]) => void;
  /** Adds one model structured-output field plus its write. */
  onAddStructuredField?: (field: StructuredOutputField) => void;
  /** Removes one model structured-output field definition and its write. */
  onRemoveStructuredField?: (name: string) => void;
  /** Renames a model structured-output field, its write and every reader in one edit. */
  onRenameStructuredField?: (from: string, to: string) => void;
  /** Renames a State field and every reader/writer in one edit (single-writer rows only). */
  onRenameWriteField?: (from: string, to: string) => void;
  /** State fields written by each node, used to block multi-writer direct renames. */
  producers?: Map<string, string[]>;
  /** Repairs a write type conflict by changing the State field to the output type. */
  onChangeFieldType?: (field: string, type: StateFieldType) => void;
};

const reducerNames: Record<string, string> = { replace: "替换", append: "追加", messages: "合并消息", "edu.sum": "数值累计", "edu.max": "取最大值", "edu.unique": "列表去重" };

export function reducerLabel(name: string): string {
  return reducerNames[name] ?? "自定义更新方式";
}

/** JSON Pointer into the step output for one suggested output item. */
export function outputPointerFor(outputKey: string): string {
  return `/${outputKey.replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

export const WORKFLOW_OUTPUT_LABEL = "工作流输出";

/** Human name of one reader; the graph output (end node) is never shown as a raw identity. */
export function outputReaderName(readerId: string, nodeLabels?: Record<string, string>): string {
  return readerId === GRAPH_OUTPUT_NODE_ID ? WORKFLOW_OUTPUT_LABEL : nodeLabels?.[readerId] ?? readerId;
}

/** Deduplicated, real downstream names for a State field; the writing node itself is not a reader. */
export function outputReaderNames(readers: readonly string[] | undefined, nodeLabels?: Record<string, string>, writerNodeId?: string): string[] {
  const names: string[] = [];
  for (const readerId of readers ?? []) {
    if (readerId === writerNodeId) continue;
    const name = outputReaderName(readerId, nodeLabels);
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** Hint for the retained raw model answer row once structured output exists. */
export function structuredAnswerHint(readerNames: readonly string[]): string {
  if (!readerNames.length) return "已改用结构化字段，可删除这一行";
  return `下游仍在读取（${readerNames.join("、")}），回答现在是 JSON 文本；如需改用结构化字段，请先修改下游`;
}

/** Second confirmation before deleting a write that downstream still reads. */
export function deleteWriteConfirmation(field: string, readerNames: readonly string[]): string | undefined {
  if (!readerNames.length) return undefined;
  return `删除「${field}」后，以下下游会受到影响：${readerNames.join("、")}。仍要删除吗？`;
}

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

export function inferStateSchemaFromSample(samples: Record<string, JsonValue> | undefined, outputPointer: string): JsonSchema {
  const value = samples ? readOutputPointer(samples as JsonValue, outputPointer) : undefined;
  if (Array.isArray(value)) return { type: "array", items: { type: "object" } };
  if (value !== null && typeof value === "object") return { type: "object" };
  if (typeof value === "number") return { type: "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  return { type: "string" };
}

/** Turns an output key into a legal State field candidate (letters, digits, underscore). */
export function safeOutputFieldName(outputKey: string): string {
  const token = outputKey.trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_");
  const prefixed = /^[A-Za-z_]/.test(token) ? token : `_${token}`;
  return prefixed.slice(0, 64) || "output";
}

/** State field name used when an output creates a new field. */
export function outputFieldName(outputKey: string, stateSchema: JsonSchema): string {
  const declared = stateSchema.properties && typeof stateSchema.properties === "object" && !Array.isArray(stateSchema.properties) ? Object.keys(stateSchema.properties) : [];
  const candidate = safeOutputFieldName(outputKey);
  const declaredMatch = declared.find(field => field === outputKey.trim());
  if (declaredMatch) return declaredMatch;
  if (!stateFieldNameIssue(stateSchema, candidate)) return candidate;
  let suffix = 2;
  while (suffix < 1000) {
    const next = `${candidate.slice(0, 60)}_${suffix}`;
    if (!declared.includes(next) && !stateFieldNameIssue(stateSchema, next)) return next;
    suffix += 1;
  }
  return candidate;
}

function uniqueFieldName(base: string, declared: ReadonlySet<string>, current?: string): string {
  const candidate = safeOutputFieldName(base);
  if (candidate === current || !declared.has(candidate)) return candidate;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const next = `${candidate.slice(0, 60)}_${suffix}`;
    if (next === current || !declared.has(next)) return next;
  }
  return candidate;
}

function stateFields(stateSchema: JsonSchema): [string, JsonSchema][] {
  const properties = stateSchema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.entries(properties).map(([name, value]) => [name, value && typeof value === "object" && !Array.isArray(value) ? value as JsonSchema : {}]);
}

function typeLabel(type: OutputValueType): string {
  return OUTPUT_TYPE_LABELS[type];
}

function asFieldType(type: OutputValueType): StructuredOutputFieldType {
  return type === "any" ? "object" : type;
}

type WriteRow = {
  field: string;
  pointer: string;
  item?: NodeOutputItem;
  type: OutputValueType;
  mismatch?: string;
  fixType?: StateFieldType;
};

function writeRows(node: WorkflowNodeV2, writes: Record<string, string>, tool: WorkflowTool | undefined, lastOutput: JsonValue | undefined, schema: JsonSchema): WriteRow[] {
  return Object.entries(writes).flatMap(([field, pointer]) => {
    if (typeof pointer !== "string") return [];
    const item = writeOutputItem(node, pointer, tool, lastOutput);
    const type = writeOutputType(node, pointer, tool, lastOutput);
    const fieldSchema = stateFields(schema).find(([name]) => name === field)?.[1];
    const mismatch = outputTypeMismatch(type, fieldSchema);
    const fixType = stateTypeForOutput(type);
    return [{ field, pointer, ...(item ? { item } : {}), type, ...(mismatch ? { mismatch } : {}), ...(mismatch && fixType ? { fixType } : {}) }];
  });
}

/** Destination menu options, exposed for tests and the row UI. */
export function destinationChoices(args: {
  item: NodeOutputItem;
  rowField: string;
  rowPointer: string;
  writes: Record<string, string>;
  stateSchema: JsonSchema;
}): { auto: { field: string; type: OutputValueType }; existing: { field: string; type: OutputValueType; typeLabel: string; compatible: boolean; reason?: string; selected: boolean }[] } {
  const declared = new Set(stateFields(args.stateSchema).map(([name]) => name));
  // Chinese display labels (回答) have no legal identifier; keep the current write field.
  const baseName = /[A-Za-z0-9_]/.test(args.item.key) ? args.item.key : args.rowField;
  // The "new field" group must never repeat an existing field; suffix it instead.
  const autoField = uniqueFieldName(baseName, declared);
  const existing = stateFields(args.stateSchema).map(([field, schema]) => {
    const type = stateFieldOutputType(schema);
    const reason = outputTypeMismatch(args.item.type, schema);
    const usedByOther = Object.entries(args.writes).find(([name, pointer]) => name !== args.rowField && pointer === args.rowPointer)?.[0];
    return { field, type, typeLabel: typeLabel(type), compatible: !reason && !usedByOther, ...(reason ? { reason } : usedByOther ? { reason: "已被其他输出使用" } : {}), selected: field === args.rowField };
  });
  return { auto: { field: autoField, type: args.item.type }, existing };
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function pointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function keyDown(event: KeyboardEvent) { if (event.key === "Escape") close(); }
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("keydown", keyDown);
    return () => { document.removeEventListener("pointerdown", pointerDown); document.removeEventListener("keydown", keyDown); };
  }, [open, close]);
  return ref;
}

function DestinationMenu({ row, choices, stateSchema, readOnly, onSelect, onCreateCustom, onClose }: {
  row: WriteRow;
  choices: ReturnType<typeof destinationChoices>;
  stateSchema: JsonSchema;
  readOnly: boolean;
  onSelect: (field: string, create: boolean) => void;
  onCreateCustom: (field: string) => void;
  onClose: () => void;
}) {
  const ref = useOutsideClose(true, onClose);
  const [opensUp, setOpensUp] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customError, setCustomError] = useState("");
  const customInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const popover = ref.current;
    const trigger = popover?.parentElement?.getBoundingClientRect();
    if (popover && trigger && trigger.bottom + Math.min(popover.offsetHeight, 360) > window.innerHeight - 12) setOpensUp(true);
  }, [ref]);
  function submitCustom() {
    const value = (customInput.current?.value ?? customName).trim();
    if (!value) { setCustomError("字段名不能为空。"); return; }
    if (value === row.field) { setCustomError("与当前写入字段相同。"); return; }
    const issue = stateFieldNameIssue(stateSchema, value);
    if (issue) { setCustomError(issue); return; }
    onCreateCustom(value);
    onClose();
  }
  return <div className={`wf-outputs-popover${opensUp ? " opens-up" : ""}`} role="listbox" aria-label="写入到" ref={ref}>
    <div className="wf-outputs-popover-head"><strong>写入到</strong><span>{row.item?.key ?? row.field} · {typeLabel(row.type)}</span><span className="wf-outputs-popover-spacer" /><small>仅显示类型兼容的字段</small></div>
    <div className="wf-outputs-popover-group">新建字段（自动命名）</div>
    <button type="button" role="option" aria-selected={choices.auto.field === row.field} className={`wf-outputs-destination${choices.auto.field === row.field ? " selected" : ""}`} disabled={readOnly} onClick={() => onSelect(choices.auto.field, true)}>
      <span className="wf-outputs-check" aria-hidden="true">{choices.auto.field === row.field ? "✓" : ""}</span>
      <span className="wf-outputs-destination-copy"><code>{choices.auto.field}</code><small>{typeLabel(choices.auto.type)} · 按输出名自动命名</small></span>
      <span className="wf-outputs-type-pill">{typeLabel(choices.auto.type)}</span>
    </button>
    <button type="button" className="wf-outputs-destination wf-outputs-custom-trigger" aria-expanded={customOpen} disabled={readOnly} onClick={() => { setCustomOpen(open => !open); setCustomError(""); }}>
      <span className="wf-outputs-check" aria-hidden="true">＋</span>
      <span className="wf-outputs-destination-copy"><code>新建字段…</code><small>自己指定字段名，类型取自该输出（{typeLabel(row.type)}）</small></span>
    </button>
    {customOpen ? <div className="wf-outputs-custom-form">
      <input ref={customInput} autoFocus aria-label="新写入字段名" value={customName} onChange={event => { setCustomName(event.target.value); setCustomError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); submitCustom(); } }} placeholder="例如 search_results" />
      <div className="wf-outputs-custom-actions"><small>类型：{typeLabel(row.type)}</small><button type="button" onClick={() => setCustomOpen(false)}>取消</button><button type="button" className="primary" onClick={submitCustom}>创建字段</button></div>
      {customError ? <p role="alert" className="wf-outputs-custom-error">{customError}</p> : null}
    </div> : null}
    <div className="wf-outputs-popover-divider" />
    <div className="wf-outputs-popover-group">已有字段</div>
    {choices.existing.map(choice => <button type="button" role="option" key={choice.field} aria-selected={choice.selected} disabled={!choice.compatible || readOnly} title={choice.reason ?? choice.field} className={`wf-outputs-destination${choice.selected ? " selected" : ""}${choice.compatible ? "" : " incompatible"}`} onClick={() => choice.compatible && onSelect(choice.field, false)}>
      <span className="wf-outputs-check" aria-hidden="true">{choice.selected ? "✓" : ""}</span>
      <code>{choice.field}</code>
      <span className="wf-outputs-type-pill">{choice.typeLabel}</span>
      {choice.reason ? <><span className="wf-outputs-popover-spacer" /><span className="wf-outputs-reason">{choice.reason}</span></> : null}
    </button>)}
    {!choices.existing.length ? <p className="wf-outputs-popover-empty">还没有已有字段；先用上面的自动命名或新建字段创建。</p> : null}
  </div>;
}

function OutputStructurePicker({ node, tool, writes, stateSchema, lastOutput, onAdd, onClose }: {
  node: WorkflowNodeV2;
  tool?: WorkflowTool;
  writes: Record<string, string>;
  stateSchema: JsonSchema;
  lastOutput?: JsonValue;
  onAdd: (rows: NewOutputRow[]) => void;
  onClose: () => void;
}) {
  const base = node.type === "core.tool" ? "/result" : "";
  const declaredSchema = node.type === "core.tool" ? tool?.outputSchema : node.type === "core.function" ? (node.config.outputSchema as JsonSchema | undefined) : undefined;
  const items = useMemo(() => {
    const declared = outputSchemaItems(declaredSchema, base);
    if (declared.length) return declared;
    const sample = node.type === "core.tool" && lastOutput !== undefined ? readOutputPointer(lastOutput, "/result") : lastOutput;
    return outputValueItems(sample, base);
  }, [base, declaredSchema, lastOutput, node.type]);
  const [selected, setSelected] = useState<string[]>([]);
  const ref = useOutsideClose(true, onClose);
  const written = new Set(Object.values(writes));
  const parentPointer = useMemo(() => new Map(items.flatMap(item => (item.children ?? []).map(child => [child.pointer, item.pointer] as const))), [items]);
  const selectedSet = new Set(selected);
  const blocked = (pointer: string) => {
    const parent = parentPointer.get(pointer);
    if (parent && selectedSet.has(parent)) return true;
    if (selectedSet.has(pointer)) return true;
    return items.some(item => item.pointer === pointer ? false : (item.children ?? []).some(child => child.pointer === pointer && selectedSet.has(item.pointer)));
  };
  function toggle(pointer: string) {
    if (written.has(pointer)) return;
    const target = items.flatMap(item => [item, ...(item.children ?? [])]).find(item => item.pointer === pointer);
    if (target?.displayOnly) return;
    setSelected(current => current.includes(pointer) ? current.filter(value => value !== pointer) : [...current, pointer]);
  }
  const chosen = items.flatMap(item => [item, ...(item.children ?? [])]).filter(item => !item.displayOnly && selectedSet.has(item.pointer));
  return <div className="wf-outputs-popover wf-outputs-add-popover" role="dialog" aria-label="添加输出" ref={ref}>
    <div className="wf-outputs-popover-head"><div className="wf-outputs-popover-title"><strong>添加输出</strong><p>来自 {tool?.name ?? node.label}的返回结构</p></div><button type="button" className="wf-outputs-popover-close" aria-label="关闭添加输出" onClick={onClose}>×</button></div>
    <div className="wf-outputs-tree">
      <p className="wf-outputs-tree-hint">勾选整组列表或其中某个字段</p>
      {items.length ? <ul className="wf-outputs-tree-list">{items.map(item => <li key={item.pointer}>
        <label className={`wf-outputs-tree-row${selectedSet.has(item.pointer) ? " selected" : ""}`}>
          <input type="checkbox" aria-label={`添加输出 ${item.key}`} checked={written.has(item.pointer) || (selectedSet.has(item.pointer) && !item.displayOnly)} disabled={written.has(item.pointer) || item.displayOnly || (item.children ?? []).some(child => selectedSet.has(child.pointer))} onChange={() => toggle(item.pointer)} />
          <span><code>{item.key}</code><span className="wf-outputs-type-pill">{typeLabel(item.type)}</span>{written.has(item.pointer) ? <small>已写入</small> : null}{item.displayOnly ? <small className="wf-outputs-array-note">列表中的字段，请写入整组列表</small> : null}</span>
        </label>
        {item.children?.length ? <ul className="wf-outputs-tree-children">{item.children.map(child => <li key={child.pointer}>
          <label className={`wf-outputs-tree-row${selectedSet.has(child.pointer) ? " selected" : ""}`}>
            <input type="checkbox" aria-label={`添加输出 ${item.key} 的 ${child.key}`} checked={written.has(child.pointer) || (selectedSet.has(child.pointer) && !child.displayOnly)} disabled={written.has(child.pointer) || child.displayOnly || blocked(child.pointer)} onChange={() => toggle(child.pointer)} />
            <span><code>{item.key} › {child.key}</code><span className="wf-outputs-type-pill">{typeLabel(child.type)}</span>{written.has(child.pointer) ? <small>已写入</small> : null}{child.displayOnly ? <small className="wf-outputs-array-note">列表中的字段，请写入整组列表</small> : null}</span>
          </label>
        </li>)}</ul> : null}
      </li>)}</ul> : <p className="wf-outputs-popover-empty">这个节点还没有可用的返回结构。运行或测试一次后，可从实际结果中选择。</p>}
    </div>
    <div className="wf-outputs-popover-footer"><small>已选 {chosen.length} 项</small><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" disabled={!chosen.length} onClick={() => {
      const fields = new Map(stateFields(stateSchema));
      const declared = new Set(fields.keys());
      const additions = chosen.map(item => {
        const preferred = safeOutputFieldName(item.key);
        // Reuse the same-named compatible field; only create a suffix when it is new or incompatible.
        const field = fields.has(preferred) && !outputTypeMismatch(item.type, fields.get(preferred)) ? preferred : uniqueFieldName(item.key, declared);
        declared.add(field);
        return { field, type: asFieldType(item.type), pointer: item.pointer };
      });
      onAdd(additions);
      onClose();
    }}>添加</button></div>
  </div>;
}


function NewStructuredFieldForm({ node, existing, answerReaderIds, nodeLabels, onAdd, onClose }: {
  node: WorkflowNodeV2;
  existing: ReadonlySet<string>;
  answerReaderIds: readonly string[];
  nodeLabels?: Record<string, string>;
  onAdd: (field: StructuredOutputField) => void;
  onClose: () => void;
}) {
  const firstField = structuredOutputFields(node).length === 0;
  const answerReaderNames = firstField ? outputReaderNames(answerReaderIds, nodeLabels, node.id) : [];
  const workflowOutputReadsAnswer = firstField && answerReaderIds.includes(GRAPH_OUTPUT_NODE_ID);
  const otherAnswerReaders = answerReaderNames.filter(name => name !== WORKFLOW_OUTPUT_LABEL);
  const [name, setName] = useState("");
  const [type, setType] = useState<StructuredOutputFieldType>("string");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  const descriptionInput = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const skipStructuredBlur = useRef<string | null>(null);
  const skipWriteBlur = useRef<string | null>(null);
  const pointerSubmitted = useRef(false);
  const ref = useOutsideClose(true, onClose);
  function submit() {
    // Read the live inputs: after IME composition the controlled value can lag
    // one render behind the committed text, and the first click must still work.
    const value = (nameInput.current?.value ?? name).trim();
    if (!value) { setError("字段名不能为空。"); return; }
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value)) { setError("字段名需以字母或下划线开头，只含字母、数字、下划线。"); return; }
    if (["text", "messages", "toolCalls"].includes(value)) { setError(`字段「${value}」与模型内置输出重名。`); return; }
    if (existing.has(value)) { setError(`字段「${value}」已存在。`); return; }
    const notes = (descriptionInput.current?.value ?? description).trim();
    onAdd({ name: value, type, ...(notes ? { description: notes } : {}) });
    onClose();
  }
  function submitFromClick() {
    if (pointerSubmitted.current) { pointerSubmitted.current = false; return; }
    submit();
  }
  function onEnter(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    // Enter that commits an IME candidate selects the candidate, not the form.
    if (event.nativeEvent.isComposing || composing.current) return;
    event.preventDefault();
    submit();
  }
  function onCompositionEnd(event: ReactCompositionEvent<HTMLInputElement>) {
    composing.current = false;
    if (event.currentTarget === nameInput.current) setName(event.currentTarget.value);
    else setDescription(event.currentTarget.value);
  }
  return <div className="wf-outputs-popover wf-outputs-new-field" role="dialog" aria-label="新建输出字段" ref={ref}>
    <div className="wf-outputs-popover-head"><div className="wf-outputs-popover-title"><strong>新建输出字段</strong><p>字段会加入输出表，模型按它返回</p></div><button type="button" className="wf-outputs-popover-close" aria-label="关闭新建输出字段" onClick={onClose}>×</button></div>
    <div className="wf-outputs-new-field-body">
      <label>字段名<input ref={nameInput} aria-label="字段名" value={name} onChange={event => { setName(event.target.value); setError(""); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={onCompositionEnd} onKeyDown={onEnter} placeholder="例如 category" /></label>
      <label>类型<select aria-label="字段类型" value={type} onChange={event => setType(event.target.value as StructuredOutputFieldType)}>{(Object.keys(OUTPUT_TYPE_LABELS) as OutputType[]).filter(value => value !== "any").map(value => <option key={value} value={value}>{typeLabel(value)}</option>)}</select></label>
      <label>说明<input ref={descriptionInput} aria-label="字段说明" value={description} onChange={event => { setDescription(event.target.value); setError(""); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={onCompositionEnd} onKeyDown={onEnter} placeholder="告诉模型这个字段要填什么" /></label>
      <p>说明会告诉模型这个字段要填什么。</p>
      {workflowOutputReadsAnswer ? <p role="note" className="wf-outputs-new-field-warning">开启后，这个模型的回答会变成 JSON，工作流最终输出也会是 JSON。</p> : null}
      {otherAnswerReaders.length ? <p role="note" className="wf-outputs-new-field-warning">下游仍在读取回答：{otherAnswerReaders.join("、")}；开启后回答会变成 JSON 文本，请先修改下游。</p> : null}
      {error ? <p role="alert" className="wf-outputs-new-field-error">{error}</p> : null}
      <div className="wf-outputs-new-field-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" onPointerDown={event => { if (event.button !== 0) return; pointerSubmitted.current = true; submit(); }} onClick={submitFromClick}>添加字段</button></div>
    </div>
  </div>;
}

type OutputType = OutputValueType;

export function NodeOutputsTable(props: NodeOutputsTableProps) {
  const { node, writes, onChangeWrites, stateSchema, tool, lastOutput, consumers, nodeLabels, readOnly = false, addOpen = false, onCloseAdd, onCreateStateField, onAddOutputs, onAddStructuredField, onRemoveStructuredField, onRenameStructuredField, onRenameWriteField, producers, onChangeFieldType } = props;
  const [openDestination, setOpenDestination] = useState("");
  const [pendingDelete, setPendingDelete] = useState<WriteRow | null>(null);
  const [structuredEdit, setStructuredEdit] = useState<{ field: string; draft: string } | null>(null);
  const [structuredErrors, setStructuredErrors] = useState<Record<string, string>>({});
  const [writeEdit, setWriteEdit] = useState<{ field: string; draft: string } | null>(null);
  const [writeErrors, setWriteErrors] = useState<Record<string, string>>({});
  const composing = useRef(false);
  const skipStructuredBlur = useRef<string | null>(null);
  const skipWriteBlur = useRef<string | null>(null);
  const rows = writeRows(node, writes, tool, lastOutput, stateSchema);
  const writtenFields = Object.entries(writes);
  const readerNamesFor = (field: string) => outputReaderNames(consumers?.get(field), nodeLabels, node.id);
  const answerReaderIds = [...new Set(Object.entries(writes).filter(([, pointer]) => pointer === "/text").flatMap(([field]) => consumers?.get(field) ?? []))];
  const structured = new Set(structuredOutputFields(node).map(field => field.name));
  const declaredFields = new Set(stateFields(stateSchema).map(([name]) => name));

  const producerCount = (field: string) => producers?.get(field)?.length ?? 0;
  const fieldExists = (field: string) => declaredFields.has(field);
  // The model key and the write destination are independent: the output-name
  // rename changes the model key, every destination edit only moves the write.
  const structuredName = (row: WriteRow) => row.item?.structured ? row.item.key : undefined;

  function setOneError(setter: typeof setStructuredErrors, field: string, message: string | undefined) {
    setter(current => {
      const next = { ...current };
      if (message) next[field] = message; else delete next[field];
      return next;
    });
  }

  function performRemove(row: WriteRow) {
    if (row.item?.structured && onRemoveStructuredField) { onRemoveStructuredField(row.field); return; }
    onChangeWrites(Object.fromEntries(Object.entries(writes).filter(([field]) => field !== row.field)));
  }

  function removeRow(row: WriteRow) {
    if (readOnly) return;
    if (deleteWriteConfirmation(row.field, readerNamesFor(row.field))) { setPendingDelete(row); return; }
    performRemove(row);
  }

  function chooseDestination(row: WriteRow, field: string, create: boolean) {
    setOpenDestination("");
    if (readOnly) return;
    if (field === row.field) return;
    if (create) {
      if (onCreateStateField) onCreateStateField(field, asFieldType(row.type), row.pointer, row.field);
      else onChangeWrites({ ...Object.fromEntries(Object.entries(writes).filter(([name]) => name !== row.field)), [field]: row.pointer });
      return;
    }
    onChangeWrites({ ...Object.fromEntries(Object.entries(writes).filter(([name]) => name !== row.field)), [field]: row.pointer });
  }

  /**
   * A custom destination name is a rename when this is the field's only writer:
   * the State field and all readers keep their data instead of being split into
   * a new empty field. Shared fields fall back to creating a separate field.
   * This never changes a model structured-output key.
   */
  function chooseCustomDestination(row: WriteRow, field: string) {
    setOpenDestination("");
    if (readOnly || field === row.field) return;
    if (fieldExists(row.field) && producerCount(row.field) <= 1 && onRenameWriteField) {
      onRenameWriteField(row.field, field);
      return;
    }
    if (onCreateStateField) onCreateStateField(field, asFieldType(row.type), row.pointer, row.field);
    else onChangeWrites({ ...Object.fromEntries(Object.entries(writes).filter(([name]) => name !== row.field)), [field]: row.pointer });
  }

  function startStructuredRename(row: WriteRow) {
    const key = structuredName(row);
    if (readOnly || !onRenameStructuredField || !key) return;
    const count = producerCount(row.field);
    if (count > 1) {
      setOneError(setStructuredErrors, row.field, `有 ${count} 个节点写入字段「${row.field}」，不能直接改名。请先让其他节点改用别的字段。`);
      return;
    }
    setOneError(setStructuredErrors, row.field, undefined);
    setStructuredEdit({ field: key, draft: key });
  }

  function commitStructuredRename(row: WriteRow) {
    const key = structuredName(row);
    if (!key || !structuredEdit || structuredEdit.field !== key) return;
    const value = structuredEdit.draft.trim();
    setStructuredEdit(null);
    if (value === key) { setOneError(setStructuredErrors, row.field, undefined); return; }
    const issue = stateFieldNameIssue(stateSchema, value);
    if (issue) { setOneError(setStructuredErrors, row.field, issue); return; }
    if (!onRenameStructuredField) { setOneError(setStructuredErrors, row.field, "当前节点不支持修改输出字段名。"); return; }
    setOneError(setStructuredErrors, row.field, undefined);
    onRenameStructuredField(key, value);
  }

  function startWriteRename(row: WriteRow) {
    if (readOnly) return;
    const count = producerCount(row.field);
    if (count > 1) {
      setOneError(setWriteErrors, row.field, `有 ${count} 个节点写入字段「${row.field}」，不能直接改名。请先让其他节点改用别的字段。`);
      return;
    }
    if (!onRenameWriteField || !fieldExists(row.field)) return;
    setOneError(setWriteErrors, row.field, undefined);
    setWriteEdit({ field: row.field, draft: row.field });
  }

  function commitWriteRename(row: WriteRow) {
    if (!writeEdit || writeEdit.field !== row.field) return;
    const value = writeEdit.draft.trim();
    setWriteEdit(null);
    if (value === row.field) { setOneError(setWriteErrors, row.field, undefined); return; }
    const issue = stateFieldNameIssue(stateSchema, value);
    if (issue) { setOneError(setWriteErrors, row.field, issue); return; }
    if (!onRenameWriteField) { setOneError(setWriteErrors, row.field, "当前节点不支持直接改名。"); return; }
    setOneError(setWriteErrors, row.field, undefined);
    onRenameWriteField(row.field, value);
  }

  function addRows(newRows: NewOutputRow[]) {
    if (readOnly || !newRows.length) return;
    if (onAddOutputs) { onAddOutputs(newRows); return; }
    if (onCreateStateField) for (const row of newRows) onCreateStateField(row.field, row.type as StateFieldType, row.pointer);
  }

  const canAdd = !readOnly && (node.type === "core.llm" ? Boolean(onAddStructuredField) : Boolean(onAddOutputs));
  const existingStructured = new Set([...structured, "text", "messages", "toolCalls"]);

  return <div className="wf-outputs-table" data-readonly={readOnly ? "true" : undefined}>
    <div className="wf-outputs-row wf-outputs-head" aria-hidden="true">
      <span>输出项</span><span>类型</span><span>写入到</span><span />
    </div>
    {rows.map(row => {
      const item = row.item ?? { key: row.field, pointer: row.pointer, type: row.type };
      const choices = destinationChoices({ item, rowField: row.field, rowPointer: row.pointer, writes, stateSchema });
      const readerNames = readerNamesFor(row.field);
      const legacyHint = row.item?.replacedByStructured ? structuredAnswerHint(readerNames) : undefined;
      const producerTotal = producerCount(row.field);
      const sharedWrite = producerTotal > 1;
      const structuredLocked = Boolean(row.item?.structured) && (sharedWrite || !onRenameStructuredField || readOnly);
      const structuredError = structuredErrors[row.field];
      const writeError = writeErrors[row.field];
      const canRenameWrite = !readOnly && !sharedWrite && Boolean(onRenameWriteField) && fieldExists(row.field);
      const splitWrite = Boolean(row.item?.structured) && row.field !== row.item?.key;
      return <div key={row.field} className="wf-outputs-row" data-state-field={row.field} data-invalid={row.mismatch ? "true" : undefined}>
        <div className="wf-outputs-name">
          {row.item?.structured && !readOnly && onRenameStructuredField && structuredEdit?.field === row.item.key
            ? <input
              className="wf-outputs-name-input"
              aria-label={`结构化字段名 ${row.item.key}`}
              aria-invalid={Boolean(structuredError)}
              autoFocus
              value={structuredEdit.draft}
              onChange={event => { setStructuredEdit({ field: row.item?.key ?? row.field, draft: event.target.value }); setOneError(setStructuredErrors, row.field, undefined); }}
              onBlur={() => {
                if (skipStructuredBlur.current === row.field) { skipStructuredBlur.current = null; return; }
                commitStructuredRename(row);
              }}
              onCompositionStart={() => { composing.current = true; }}
              onCompositionEnd={() => { composing.current = false; }}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  if (event.nativeEvent.isComposing || composing.current) return;
                  event.preventDefault();
                  commitStructuredRename(row);
                  skipStructuredBlur.current = row.field;
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setStructuredEdit(null);
                  setOneError(setStructuredErrors, row.field, undefined);
                }
              }}
            />
            : row.item?.structured
              ? <button type="button" className="wf-outputs-name-button" aria-label={`重命名字段 ${row.field}`} title={structuredLocked ? (sharedWrite ? `有 ${producerTotal} 个节点写入该字段，不能直接改名` : undefined) : "点击修改字段名"} disabled={structuredLocked} onClick={() => startStructuredRename(row)}><code title={row.item?.pointer ?? row.pointer}>{row.item?.key ?? row.field}</code><span>改名</span></button>
              : <code title={row.item?.pointer ?? row.pointer}>{row.item?.key ?? row.field}</code>}
          {row.item?.advanced ? <small>高级</small> : null}
          {row.item?.structured ? <small>结构化</small> : null}
          {sharedWrite ? <small className="wf-outputs-rename-lock" role="note">有 {producerTotal} 个节点写入此字段，不能直接改名</small> : null}
          {structuredError ? <small role="alert" className="wf-outputs-name-error">{structuredError}</small> : null}
          {legacyHint ? <small className={`wf-outputs-legacy-hint${readerNames.length ? " downstream" : ""}`}>{legacyHint}</small> : null}
        </div>
        <span className="wf-outputs-type">{typeLabel(row.type)}</span>
        <div className="wf-outputs-field">
          <div className="wf-outputs-destination-wrap">
            {writeEdit?.field === row.field
              ? <input
                className="wf-outputs-write-input"
                aria-label={`写入字段名 ${row.field}`}
                aria-invalid={Boolean(writeError)}
                autoFocus
                value={writeEdit.draft}
                onChange={event => { setWriteEdit({ field: row.field, draft: event.target.value }); setOneError(setWriteErrors, row.field, undefined); }}
                onBlur={() => {
                  if (skipWriteBlur.current === row.field) { skipWriteBlur.current = null; return; }
                  commitWriteRename(row);
                }}
                onCompositionStart={() => { composing.current = true; }}
                onCompositionEnd={() => { composing.current = false; }}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    if (event.nativeEvent.isComposing || composing.current) return;
                    event.preventDefault();
                    commitWriteRename(row);
                    skipWriteBlur.current = row.field;
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setWriteEdit(null);
                    setOneError(setWriteErrors, row.field, undefined);
                  }
                }}
              />
              : <>
                <button type="button" className="wf-outputs-destination-trigger" aria-expanded={openDestination === row.field} aria-label={`${row.field} 写入到`} disabled={readOnly} onClick={() => setOpenDestination(current => current === row.field ? "" : row.field)}><span>{row.field}</span><span aria-hidden="true">⌄</span></button>
                {openDestination === row.field ? <DestinationMenu row={row} choices={choices} stateSchema={stateSchema} readOnly={readOnly} onSelect={(field, create) => chooseDestination(row, field, create)} onCreateCustom={field => chooseCustomDestination(row, field)} onClose={() => setOpenDestination("")} /> : null}
              </>}
          </div>
          {canRenameWrite ? <button type="button" className="wf-outputs-rename" aria-label={`重命名写入字段 ${row.field}`} onClick={() => startWriteRename(row)}>改名</button> : null}
          {writeError ? <small role="alert" className="wf-outputs-rename-error">{writeError}</small> : null}
          {splitWrite ? <small role="note" className="wf-outputs-write-key-hint">写入到 {row.field}；模型仍返回键 {row.item?.key}，值会写到 {row.field}。</small> : null}
          {row.mismatch ? <div className="wf-outputs-mismatch-line"><small role="alert" className="wf-outputs-mismatch">{row.mismatch}</small>{!readOnly && row.fixType && onChangeFieldType ? <button type="button" className="wf-outputs-fix" onClick={() => onChangeFieldType(row.field, row.fixType!)}>把字段改为{stateTypeLabel(row.fixType)}</button> : null}</div> : null}
        </div>
        <div className="wf-outputs-actions">
          {!readOnly ? <button type="button" className="wf-outputs-remove" aria-label={`删除输出 ${row.field}`} title={row.item?.structured ? "删除字段和写入" : "删除这条写入"} onClick={() => removeRow(row)}><Trash2 size={13}/></button> : null}
        </div>
      </div>;
    })}
    {!rows.length ? <p className="wf-outputs-empty">这个节点还没有写入流程数据的输出。点击右上角「＋ 添加输出」。</p> : null}
    {addOpen && !readOnly && canAdd ? (node.type === "core.llm"
      ? <NewStructuredFieldForm node={node} existing={existingStructured} answerReaderIds={answerReaderIds} nodeLabels={nodeLabels} onAdd={field => onAddStructuredField?.(field)} onClose={() => onCloseAdd?.()} />
      : <OutputStructurePicker node={node} tool={tool} writes={writes} stateSchema={stateSchema} lastOutput={lastOutput} onAdd={addRows} onClose={() => onCloseAdd?.()} />) : null}
    {!readOnly && rows.length ? <p className="wf-outputs-hint">每一行就是一条写入；删除这一行会删除对应的写入。字段名可点击改名；只有一个写入者时才能直接改名。</p> : null}
    <footer className="wf-outputs-consumers">
      {writtenFields.length
        ? writtenFields.flatMap(([field]) => {
          const readers = readerNamesFor(field);
          return readers.length ? [<p key={field}>下游读取 {field}：{readers.join("、")}</p>] : [];
        })
        : <p>此节点还没有写入流程数据。</p>}
    </footer>
    {pendingDelete ? <ConfirmDialog title="删除这条输出？" confirmLabel="仍要删除" danger onCancel={() => setPendingDelete(null)} onConfirm={() => { const row = pendingDelete; setPendingDelete(null); performRemove(row); }}>
      <p>删除「{pendingDelete.field}」后，以下下游会受到影响：</p>
      <ul className="wf-confirm-list">{readerNamesFor(pendingDelete.field).map(name => <li key={name}>{name}</li>)}</ul>
      <p>如果这个字段不再被任何节点写入或读取，会一并从流程数据中删除。此操作无法撤销。</p>
    </ConfirmDialog> : null}
  </div>;
}
