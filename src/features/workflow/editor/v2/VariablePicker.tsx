import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Binding, JsonSchema, JsonValue } from "../../domain/v2/types";
import { compatible, typeLabel, types } from "./bindingTypes";
import { escapePointer, resolveFormSchema } from "./SchemaForm";

/**
 * Grouped variable picker for the unified node panel (M8).
 *
 * The picker is a controlled popover: the caller owns whether it is mounted (`onClose`),
 * opens it from a parameter/output row and decides what to do with the returned `Binding`.
 * `mode="state"` is the State-only variant used by `NodeOutputsTable`.
 */

export type VariablePickerMode = "value" | "state";
export type VariablePickerTone = "input" | "node" | "state" | "environment" | "literal";

export type PickerEntry = {
  key: string;
  label: string;
  pointer: string;
  types: string[];
  binding: Binding;
  depth: number;
  disabledReason?: string;
  /** Field only known from run samples / current environment value, not a declared Schema property. */
  inferred?: boolean;
  meta?: string;
  children?: PickerEntry[];
  action?: "literal";
};

export type PickerGroup = { id: string; label: string; tone: VariablePickerTone; entries: PickerEntry[] };

export type VariablePickerModel = {
  inputSchema: JsonSchema;
  stateSchema: JsonSchema;
  environmentSchema?: JsonSchema;
  environmentVariables?: Record<string, string | number | boolean>;
  producers?: Map<string, string[]>;
  nodeLabels?: Record<string, string>;
  samples?: Record<string, JsonValue>;
  targetSchema?: JsonSchema;
  mode?: VariablePickerMode;
};

export type VariablePickerProps = VariablePickerModel & {
  value?: Binding;
  onPick: (binding: Binding) => void;
  onPickLiteral?: () => void;
  onClose: () => void;
};

const TYPE_OBJECT = "object";

function asSchema(value: JsonValue | undefined): JsonSchema {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function inferTypes(value: JsonValue | undefined): string[] {
  if (value === null) return ["null"];
  if (Array.isArray(value)) return ["array"];
  if (typeof value === "boolean") return ["boolean"];
  if (typeof value === "number") return Number.isInteger(value) ? ["integer"] : ["number"];
  if (typeof value === "string") return ["string"];
  if (typeof value === "object") return [TYPE_OBJECT];
  return [];
}

function objectProperties(schema: JsonSchema | undefined, root: JsonSchema): [string, JsonSchema][] {
  if (!schema) return [];
  const resolved = resolveFormSchema(schema, root);
  const properties = resolved.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.entries(properties).map(([name, value]) => [name, asSchema(value)]);
}

function bindingFor(source: "input" | "state" | "environment", pointer: string, current?: Binding): Binding {
  if (current && current.source === source) return { source, pointer, onMissing: current.onMissing };
  return { source, pointer, onMissing: { mode: "error" } };
}

function sampleOf(samples: Record<string, JsonValue> | undefined, field: string): JsonValue | undefined {
  if (!samples) return undefined;
  if (Object.prototype.hasOwnProperty.call(samples, field)) return samples[field];
  if (Object.prototype.hasOwnProperty.call(samples, `/${field}`)) return samples[`/${field}`];
  return undefined;
}

function sampleProperty(sample: JsonValue | undefined, key: string): JsonValue | undefined {
  return sample && typeof sample === "object" && !Array.isArray(sample) && Object.prototype.hasOwnProperty.call(sample, key) ? sample[key] : undefined;
}

type EntryDraft = Omit<PickerEntry, "key"> & { key: string };

function makeEntry(draft: EntryDraft): PickerEntry {
  return { ...draft };
}

/**
 * Builds nested child entries for an object-shaped field. Declared Schema properties come
 * first (and may be expanded further); sample-only properties follow and are marked
 * "样例推断，未声明类型". Arrays stay leaves because a JSON Pointer cannot address "every item".
 */
function buildChildren(args: { pointer: string; schema?: JsonSchema; root: JsonSchema; source: "input" | "state" | "environment"; depth: number; sample?: JsonValue }): PickerEntry[] {
  if (args.depth > 4) return [];
  const declared = objectProperties(args.schema, args.root);
  const declaredNames = new Set(declared.map(([name]) => name));
  const entries: PickerEntry[] = [];
  for (const [name, propertySchema] of declared) {
    const childPointer = `${args.pointer}/${escapePointer(name)}`;
    const declaredTypes = types(propertySchema, args.root);
    const childSample = sampleProperty(args.sample, name);
    const inferred = !declaredTypes.length && childSample !== undefined;
    const entryTypes = inferred ? inferTypes(childSample) : declaredTypes;
    const children = buildChildren({ pointer: childPointer, schema: propertySchema, root: args.root, source: args.source, depth: args.depth + 1, sample: childSample });
    entries.push(makeEntry({
      key: `${args.source}:${childPointer}`,
      label: typeof propertySchema.title === "string" ? propertySchema.title : name,
      pointer: childPointer,
      types: entryTypes,
      binding: bindingFor(args.source, childPointer),
      depth: args.depth,
      ...(inferred ? { inferred: true } : {}),
      meta: typeLabel(entryTypes),
      ...(children.length ? { children } : {}),
    }));
  }
  if (args.sample && typeof args.sample === "object" && !Array.isArray(args.sample)) {
    for (const name of Object.keys(args.sample)) {
      if (declaredNames.has(name)) continue;
      const childPointer = `${args.pointer}/${escapePointer(name)}`;
      const childSample = (args.sample as Record<string, JsonValue>)[name];
      const entryTypes = inferTypes(childSample);
      const children = buildChildren({ pointer: childPointer, schema: undefined, root: args.root, source: args.source, depth: args.depth + 1, sample: childSample });
      entries.push(makeEntry({
        key: `${args.source}:${childPointer}`,
        label: name,
        pointer: childPointer,
        types: entryTypes,
        binding: bindingFor(args.source, childPointer),
        depth: args.depth,
        inferred: true,
        meta: typeLabel(entryTypes),
        ...(children.length ? { children } : {}),
      }));
    }
  }
  return entries;
}

function applyCompatibility(groups: PickerGroup[], targetTypes: string[]): PickerGroup[] {
  if (!targetTypes.length) return groups;
  const visit = (entry: PickerEntry) => {
    if (entry.action !== "literal" && entry.types.length && !compatible(entry.types, targetTypes)) entry.disabledReason = `与${typeLabel(targetTypes)}不兼容`;
    entry.children?.forEach(visit);
  };
  groups.forEach(group => group.entries.forEach(visit));
  return groups;
}

/** Pure model builder, exported so tables/tests can inspect exactly what the picker renders. */
export function buildPickerGroups(model: VariablePickerModel): PickerGroup[] {
  const { inputSchema, stateSchema, environmentSchema, environmentVariables, producers, nodeLabels, samples, targetSchema, mode = "value" } = model;
  const targetTypes = targetSchema ? types(targetSchema, targetSchema) : [];
  const labelOf = (nodeId: string) => nodeLabels?.[nodeId] ?? nodeId;
  const groups: PickerGroup[] = [];

  if (mode === "value") {
    const inputTypes = types(inputSchema, inputSchema);
    groups.push({
      id: "input",
      label: "启动输入",
      tone: "input",
      entries: [makeEntry({
        key: "input:/",
        label: "全部启动输入",
        pointer: "",
        types: inputTypes,
        binding: bindingFor("input", ""),
        depth: 0,
        meta: typeLabel(inputTypes),
        children: buildChildren({ pointer: "", schema: inputSchema, root: inputSchema, source: "input", depth: 1 }),
      })],
    });
  }

  const stateProperties = new Map(objectProperties(stateSchema, stateSchema));
  const orderedFields: string[] = [];
  const pushField = (field: string) => { if (!orderedFields.includes(field)) orderedFields.push(field); };
  stateProperties.forEach((_, field) => pushField(field));
  producers?.forEach((_, field) => pushField(field));
  if (samples) Object.keys(samples).forEach(key => pushField(key.replace(/^\//, "")));

  const fieldEntry = (field: string): PickerEntry => {
    const declared = stateProperties.get(field);
    const sample = sampleOf(samples, field);
    const pointer = `/${escapePointer(field)}`;
    let entryTypes = declared ? types(declared, stateSchema) : [];
    let inferred = !declared;
    if (!entryTypes.length && sample !== undefined) {
      entryTypes = inferTypes(sample);
      inferred = true;
    }
    const owners = producers?.get(field) ?? [];
    const otherOwners = owners.slice(1).map(labelOf);
    const meta = [typeLabel(entryTypes), otherOwners.length ? `也由 ${otherOwners.join("、")} 写入` : ""].filter(Boolean).join(" · ");
    const children = buildChildren({ pointer, schema: declared, root: stateSchema, source: "state", depth: 1, sample });
    return makeEntry({
      key: `state:${pointer}`,
      label: declared && typeof declared.title === "string" ? declared.title : field,
      pointer,
      types: entryTypes,
      binding: bindingFor("state", pointer),
      depth: 0,
      ...(inferred ? { inferred: true } : {}),
      meta,
      ...(children.length ? { children } : {}),
    });
  };

  const nodeGroups = new Map<string, PickerEntry[]>();
  const shared: PickerEntry[] = [];
  for (const field of orderedFields) {
    const owners = producers?.get(field) ?? [];
    if (!owners.length) { shared.push(fieldEntry(field)); continue; }
    const owner = owners[0];
    const entries = nodeGroups.get(owner) ?? [];
    entries.push(fieldEntry(field));
    nodeGroups.set(owner, entries);
  }
  for (const [nodeId, entries] of nodeGroups) groups.push({ id: `node:${nodeId}`, label: `${labelOf(nodeId)} 的输出`, tone: "node", entries });
  if (shared.length) groups.push({ id: "state", label: "共享 State", tone: "state", entries: shared });

  if (mode === "value") {
    const environmentRoot = environmentSchema ?? {};
    const environmentProperties = new Map(objectProperties(environmentRoot, environmentRoot));
    const environmentKeys: string[] = [...environmentProperties.keys()];
    for (const key of Object.keys(environmentVariables ?? {})) if (!environmentKeys.includes(key)) environmentKeys.push(key);
    const environmentEntries = environmentKeys.map(field => {
      const declared = environmentProperties.get(field);
      const value = environmentVariables?.[field];
      const pointer = `/${escapePointer(field)}`;
      const entryTypes = declared ? types(declared, environmentRoot) : inferTypes(value as JsonValue | undefined);
      const children = buildChildren({ pointer, schema: declared, root: environmentRoot, source: "environment", depth: 1 });
      return makeEntry({
        key: `environment:${pointer}`,
        label: declared && typeof declared.title === "string" ? declared.title : field,
        pointer,
        types: entryTypes,
        binding: bindingFor("environment", pointer),
        depth: 0,
        meta: declared ? typeLabel(entryTypes) : `${typeLabel(entryTypes)} · 当前值类型`,
        ...(children.length ? { children } : {}),
      });
    });
    if (environmentEntries.length) groups.push({ id: "environment", label: "环境变量", tone: "environment", entries: environmentEntries });
    groups.push({
      id: "literal",
      label: "固定值",
      tone: "literal",
      entries: [makeEntry({ key: "literal:/", label: "固定值…", pointer: "", types: [], binding: { source: "literal", value: null }, depth: 0, action: "literal", meta: "在行内填写固定值" })],
    });
  }

  return applyCompatibility(groups, targetTypes);
}

function matches(entry: PickerEntry, query: string): boolean {
  return [entry.label, entry.pointer, entry.meta ?? "", typeLabel(entry.types)].some(text => text.toLowerCase().includes(query));
}

/** Keeps tree shape while hiding non-matching leaves; matching parents keep their declared children. */
export function filterPickerGroups(groups: PickerGroup[], query: string): PickerGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  const filterEntry = (entry: PickerEntry): PickerEntry | undefined => {
    if (matches(entry, needle)) return entry;
    const children = entry.children?.map(filterEntry).filter((item): item is PickerEntry => Boolean(item));
    return children && children.length ? { ...entry, children } : undefined;
  };
  return groups
    .map(group => ({ ...group, entries: group.entries.map(filterEntry).filter((item): item is PickerEntry => Boolean(item)) }))
    .filter(group => group.entries.length > 0);
}

/** Flattens the visible tree in render order; expanded parents expose their children. */
export function visiblePickerEntries(groups: PickerGroup[], expanded: ReadonlySet<string>): PickerEntry[] {
  const rows: PickerEntry[] = [];
  const walk = (entries: PickerEntry[]) => {
    for (const entry of entries) {
      rows.push(entry);
      if (entry.children?.length && expanded.has(entry.key)) walk(entry.children);
    }
  };
  groups.forEach(group => walk(group.entries));
  return rows;
}

export function firstEnabledIndex(rows: PickerEntry[]): number {
  return rows.findIndex(row => !row.disabledReason);
}

export function nextPickerIndex(rows: PickerEntry[], from: number, delta: 1 | -1): number {
  if (!rows.length) return -1;
  let index = from;
  for (let step = 0; step < rows.length; step++) {
    if (index < 0) index = delta > 0 ? 0 : rows.length - 1;
    else index = (index + delta + rows.length) % rows.length;
    if (!rows[index].disabledReason) return index;
  }
  return -1;
}

export type PickerKeyAction = { type: "move"; index: number } | { type: "pick"; index: number } | { type: "close" } | { type: "none" };

/** Keyboard contract: Up/Down move over enabled rows, Enter picks, Escape closes. */
export function pickerKeyAction(rows: PickerEntry[], activeIndex: number, key: string): PickerKeyAction {
  if (key === "Escape") return { type: "close" };
  if (key === "ArrowDown" || key === "ArrowUp") {
    const index = nextPickerIndex(rows, activeIndex, key === "ArrowDown" ? 1 : -1);
    return index < 0 ? { type: "none" } : { type: "move", index };
  }
  if (key === "Enter" || key === " ") {
    const row = activeIndex >= 0 ? rows[activeIndex] : undefined;
    return row && !row.disabledReason ? { type: "pick", index: activeIndex } : { type: "none" };
  }
  return { type: "none" };
}

function sameBinding(value: Binding | undefined, entry: PickerEntry): boolean {
  if (!value || value.source === "literal" || entry.action === "literal" || entry.binding.source === "literal") return false;
  return value.source === entry.binding.source && value.pointer === entry.binding.pointer;
}

export function VariablePicker(props: VariablePickerProps) {
  const { value, onPick, onPickLiteral, onClose } = props;
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [activeIndex, setActiveIndex] = useState(-1);

  const groups = useMemo(() => filterPickerGroups(buildPickerGroups(props), query), [props, query]);
  const rows = useMemo(() => visiblePickerEntries(groups, expanded), [groups, expanded]);
  const effectiveActive = activeIndex >= 0 && activeIndex < rows.length ? activeIndex : firstEnabledIndex(rows);
  const rowIndex = useMemo(() => new Map(rows.map((row, index) => [row.key, index])), [rows]);

  function toggle(key: string) {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function choose(entry: PickerEntry) {
    if (entry.disabledReason) return;
    if (entry.action === "literal") {
      onPickLiteral?.();
      onClose();
      return;
    }
    onPick(entry.binding);
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const action = pickerKeyAction(rows, effectiveActive, event.key);
    if (action.type === "none") return;
    event.preventDefault();
    if (action.type === "close") { onClose(); return; }
    if (action.type === "move") { setActiveIndex(action.index); return; }
    const entry = rows[action.index];
    if (entry) choose(entry);
  }

  function renderEntries(entries: PickerEntry[]): ReactNode[] {
    return entries.flatMap(entry => {
      const index = rowIndex.get(entry.key) ?? -1;
      const hasChildren = Boolean(entry.children?.length);
      const isOpen = expanded.has(entry.key);
      const current = sameBinding(value, entry);
      const node = (
        <div key={entry.key} className={`wf-variable-picker-item${entry.depth ? " nested" : ""}`} style={{ paddingLeft: `${6 + entry.depth * 14}px` }}>
          {hasChildren ? <button type="button" className="wf-variable-picker-toggle" aria-label={`${isOpen ? "收起" : "展开"}${entry.label}`} aria-expanded={isOpen} onClick={() => toggle(entry.key)}>{isOpen ? "▾" : "▸"}</button> : <span className="wf-variable-picker-toggle" aria-hidden="true" />}
          <button
            type="button"
            role="option"
            aria-selected={index === effectiveActive}
            aria-disabled={Boolean(entry.disabledReason)}
            disabled={Boolean(entry.disabledReason)}
            className={`wf-variable-picker-entry${current ? " current" : ""}${entry.action === "literal" ? " literal" : ""}`}
            onClick={() => choose(entry)}
            onMouseEnter={() => setActiveIndex(index)}
          >
            <span className="wf-variable-picker-entry-label">{entry.label}</span>
            {entry.meta || entry.types.length ? <small className="wf-variable-picker-entry-meta">{entry.meta ?? typeLabel(entry.types)}</small> : null}
            {entry.inferred ? <small className="wf-variable-picker-inferred">样例推断，未声明类型</small> : null}
            {entry.disabledReason ? <small className="wf-variable-picker-reason">{entry.disabledReason}</small> : null}
            {current ? <span className="wf-variable-picker-current">当前</span> : null}
          </button>
        </div>
      );
      return hasChildren && isOpen ? [node, ...renderEntries(entry.children ?? [])] : [node];
    });
  }

  return (
    <div className="wf-variable-picker" role="dialog" aria-label="选择变量" onKeyDown={handleKeyDown} data-mode={props.mode ?? "value"}>
      <header className="wf-variable-picker-head">
        <strong>{props.mode === "state" ? "选择 State 字段" : "选择变量"}</strong>
        <button type="button" className="wf-variable-picker-close" aria-label="关闭变量选择" onClick={onClose}>关闭</button>
      </header>
      <label className="wf-variable-picker-search">搜索变量<input aria-label="搜索变量" value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(-1); }} placeholder="按名称、类型或路径过滤" autoFocus /></label>
      <div className="wf-variable-picker-list" role="listbox" aria-label="可选变量">
        {groups.map(group => (
          <section key={group.id} className="wf-variable-picker-group" data-tone={group.tone}>
            <h4 className="wf-variable-picker-group-label"><span className={`wf-variable-picker-chip ${group.tone}`}>{group.label}</span></h4>
            {renderEntries(group.entries)}
          </section>
        ))}
        {!groups.length ? <p className="wf-variable-picker-empty">没有匹配的变量。</p> : null}
      </div>
      <footer className="wf-variable-picker-footer">↑↓ 选择 · 回车确认 · Esc 关闭</footer>
    </div>
  );
}
