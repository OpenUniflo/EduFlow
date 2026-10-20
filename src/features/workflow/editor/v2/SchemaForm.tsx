import { useEffect, useMemo, useRef, useState } from "react";
import type { JsonSchema, JsonValue } from "../../domain/v2/types";
import { schemaDiagnostics, validateSchemaValue } from "../../domain/v2/validation";
import { jsonValueSchema } from "../../domain/v2/schema";
import { useJsonDraftContext } from "./JsonField";

export const escapePointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
export function valueAt(value: JsonValue | undefined, pointer: string): JsonValue | undefined {
  return pointer.split("/").slice(1).reduce<JsonValue | undefined>((current, key) => { const decoded = key.replace(/~1/g, "/").replace(/~0/g, "~"); return current && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, decoded) ? (current as Record<string, JsonValue>)[decoded] : undefined; }, value);
}
export function putValue(value: JsonValue | undefined, pointer: string, next: JsonValue | undefined): JsonValue {
  if (!pointer) return next === undefined ? {} : next;
  const keys = pointer.split("/").slice(1).map(key => key.replace(/~1/g, "/").replace(/~0/g, "~"));
  function assign(current: JsonValue | undefined, index: number): JsonValue {
    const key = keys[index]; const copy: Record<string, JsonValue> | JsonValue[] = Array.isArray(current) ? [...current] : current && typeof current === "object" ? { ...current } : {};
    if (index === keys.length - 1) { if (next === undefined) delete (copy as Record<string, JsonValue>)[key]; else Object.defineProperty(copy, key, { value: next, enumerable: true, configurable: true, writable: true }); }
    else Object.defineProperty(copy, key, { value: assign((copy as Record<string, JsonValue>)[key], index + 1), enumerable: true, configurable: true, writable: true });
    return copy;
  }
  return assign(value, 0);
}
const asSchema = (value: JsonValue | undefined): JsonSchema => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const asFormSchema = (value: JsonValue | undefined) => typeof value === "boolean" ? value : asSchema(value);
const formTypeLabels: Record<string,string> = { string:"文本", number:"数字", integer:"整数", boolean:"是或否", object:"对象", array:"列表", null:"空值 null" };
export function resolveFormSchema(schema: JsonSchema, root: JsonSchema, seen = new Set<string>()): JsonSchema {
  if (typeof schema.$ref !== "string" || seen.has(schema.$ref)) return schema;
  const resolved = valueAt(root, schema.$ref.slice(1));
  return { ...resolveFormSchema(asSchema(resolved), root, new Set([...seen, schema.$ref])), ...Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$ref")) };
}
function initialValue(schema: JsonSchema): JsonValue {
  const type = Array.isArray(schema.type) ? schema.type.find(item => item !== "null") : schema.type;
  return type === "object" ? {} : type === "array" ? [] : type === "boolean" ? false : type === "number" || type === "integer" ? 0 : type === "null" ? null : "";
}
function constraintHint(schema: JsonSchema, type: JsonValue | undefined) {
  const parts: string[] = [];
  if (type === "number" || type === "integer") {
    if (type === "integer") parts.push("需整数");
    if (typeof schema.minimum === "number") parts.push(`最小值 ${schema.minimum}`);
    if (typeof schema.maximum === "number") parts.push(`最大值 ${schema.maximum}`);
    if (typeof schema.multipleOf === "number") parts.push(`需为 ${schema.multipleOf} 的倍数`);
  } else if (type === "string") {
    if (typeof schema.minLength === "number") parts.push(`至少 ${schema.minLength} 个字符`);
    if (typeof schema.maxLength === "number") parts.push(`最多 ${schema.maxLength} 个字符`);
  } else if (type === "array") {
    if (typeof schema.minItems === "number") parts.push(`至少 ${schema.minItems} 项`);
    if (typeof schema.maxItems === "number") parts.push(`最多 ${schema.maxItems} 项`);
  }
  return parts.join("；");
}
export function SchemaForm({ schema, value, onChange, label, prefix = "input", onInvalid, draftId, draftKind = "definition", ownerNodeId, ownerInputName, ownerStateField, focusErrorRequest = 0, focusPointer, showValidation = true }: { schema: JsonSchema; value: JsonValue; onChange: (value: JsonValue) => void; label: string; prefix?: string; onInvalid?: (message: string) => void; draftId?: string; draftKind?: "definition" | "run-input"; ownerNodeId?: string; ownerInputName?: string; ownerStateField?: string; focusErrorRequest?: number; focusPointer?: string | null; showValidation?:boolean }) {
  const context = useJsonDraftContext(); const serialized = JSON.stringify(value, null, 2);
  const cached = draftId ? context?.drafts.get(draftId) : undefined;
  const validCache = cached?.baseline === serialized ? cached : undefined;
  const [mode, setMode] = useState<"form" | "json">(validCache?.mode ?? "form");
  const [raw, setRaw] = useState<string | null>(validCache?.text ?? null);
  const [jsonError, setJsonError] = useState(validCache?.error ?? "");
  const [fieldInvalid, setFieldInvalid] = useState<Record<string, string>>(validCache?.fields ?? {});
  const invalidFields = useRef(fieldInvalid);
  const section = useRef<HTMLElement>(null);
  const focusedRequest = useRef(0);
  const jsonFallbackRequest = useRef(0);
  useEffect(() => {
    if (!focusErrorRequest || focusedRequest.current === focusErrorRequest) return;
    const desiredMode = jsonError || jsonFallbackRequest.current === focusErrorRequest ? "json" : "form";
    // Wait for the requested mode to commit before looking for its controls.
    if (mode !== desiredMode) { setMode(desiredMode); return; }
    const frame = requestAnimationFrame(() => {
      const matching = focusPointer !== null && focusPointer !== undefined ? [...(section.current?.querySelectorAll<HTMLElement>("[data-field-pointer]") ?? [])].find(element => element.dataset.fieldPointer === focusPointer) : undefined;
      const field = mode === "json" ? section.current?.querySelector<HTMLElement>("textarea") : matching?.querySelector<HTMLElement>("input,select,textarea,button") ?? (focusPointer !== null && focusPointer !== undefined ? undefined : section.current?.querySelector<HTMLElement>('[aria-invalid="true"]'));
      if (field) { field.scrollIntoView({ block: "center" }); field.focus(); focusedRequest.current = focusErrorRequest; }
      else if (mode !== "json") { jsonFallbackRequest.current = focusErrorRequest; setMode("json"); }
    });
    return () => cancelAnimationFrame(frame);
  }, [focusErrorRequest, jsonError, focusPointer, mode]);
  useEffect(() => {
    if (!draftId || !context) return;
    const prior = context.drafts.get(draftId);
    if (prior?.baseline === serialized) { setRaw(prior.text); setJsonError(prior.error); setFieldInvalid(prior.fields ?? {}); invalidFields.current = prior.fields ?? {}; context.onPending(draftId, draftKind === "definition" && Boolean(prior.error || Object.values(prior.fields ?? {}).find(Boolean))); }
    else { setRaw(null); setJsonError(""); setFieldInvalid({}); invalidFields.current = {}; context.drafts.delete(draftId); context.onPending(draftId, false); }
  }, [draftId, draftKind, context, serialized]);
  function cache(text: string, error: string, nextValue = value, nextMode = mode) {
    if (!draftId || !context) return;
    context.drafts.set(draftId, { text, error, baseline: JSON.stringify(nextValue, null, 2), fields: invalidFields.current, mode: nextMode, ownerNodeId, ownerInputName, ownerStateField });
    context.onPending(draftId, draftKind === "definition" && Boolean(error || Object.values(invalidFields.current).find(Boolean)));
  }
  const unsupported = useMemo(() => schemaDiagnostics(schema), [schema]);
  const result = useMemo(() => validateSchemaValue(schema, value), [schema, value]);
  function invalidField(path: string, invalid: string) { const next = { ...invalidFields.current, [path]: invalid }; invalidFields.current = next; setFieldInvalid(next); onInvalid?.(Object.values(next).find(Boolean) || ""); cache(raw ?? serialized, jsonError); }
  function change(next: JsonValue) { setRaw(null); setJsonError(""); cache(JSON.stringify(next, null, 2), "", next); onChange(next); }
  function field(original: JsonSchema | boolean, pointer: string, name: string, required: boolean): React.ReactNode {
    const definition = resolveFormSchema(typeof original === "boolean" ? {} : original, schema);
    const current = valueAt(value, pointer); const title = typeof definition.title === "string" ? definition.title : name;
    const id = `${prefix}:${pointer || "/"}`;
    const type = Array.isArray(definition.type) ? definition.type.find(item => item !== "null") : definition.type;
    const nullable = definition.type === "null" || Array.isArray(definition.type) && definition.type.includes("null");
    const set = (next: JsonValue | undefined) => { invalidField(pointer, ""); change(putValue(value, pointer, next)); };
    const errors = showValidation ? result.issues.filter(error => error.pointer === pointer) : [];
    if (showValidation && required && pointer && current === undefined && !errors.some(error=>error.keyword==="required")) errors.push({ pointer, keyword: "required" });
    const header = <span>{title}{required ? <span className="wf-required"> *必填</span> : null}</span>;
    const hint = constraintHint(definition, type);
    const expectedTypes = (Array.isArray(definition.type) ? definition.type : [definition.type]).map(item=>formTypeLabels[String(item)] ?? "声明的类型").join("或");
    const annotation = <>{typeof definition.description === "string" ? <small>{definition.description}</small> : null}{hint ? <small>填写要求：{hint}</small> : null}{(errors.length || fieldInvalid[pointer]) ? <span role="alert" id={`${id}-error`} className="wf-field-error">{fieldInvalid[pointer] || `请检查${title}：${errors.some(error=>error.keyword==="required") ? "请填写此必填字段" : errors.some(error=>error.keyword==="type") ? `需要${expectedTypes}` : errors.some(error=>error.keyword==="enum") ? "请选择列表中的一个值" : "输入不符合此字段的结构或范围要求"}`}</span> : null}</>;
    const optionalControls = <div className="wf-field-options">{nullable ? <button type="button" onClick={() => set(current === null ? initialValue(definition) : null)}>{current === null ? "填写完整值" : "设为空值 null"}</button> : null}{current === null ? <small>当前值：null</small> : null}{definition.default !== undefined ? <button type="button" onClick={() => set(definition.default)}>采用建议值</button> : null}</div>;
    if (original === false) return <div key={pointer} data-field-pointer={pointer}>{header}<p>{required ? "该字段的结构不接受任何值，但被声明为必填；请修正结构后再运行。" : "该字段不接受任何值，请省略此字段。"}</p>{!required ? <button type="button" onClick={() => set(undefined)}>省略此字段</button> : null}{annotation}</div>;
    if ((!type && !definition.properties || Array.isArray(definition.type) && definition.type.filter(item => item !== "null").length > 1) && definition.const === undefined && !definition.enum) return <div key={pointer} data-field-pointer={pointer}>{header}<p>此字段允许多种值类型，当前请通过高级 JSON 编辑。原数据已保留，执行仍按原结构校验。</p><button type="button" onClick={() => setMode("json")}>高级编辑{title}</button>{annotation}</div>;
    if ((type === "object" || definition.properties) && definition.const === undefined && !definition.enum) {
      const properties = asSchema(definition.properties); const requiredKeys = Array.isArray(definition.required) ? definition.required : [];
      const additionalKeys = current && typeof current === "object" && !Array.isArray(current) ? Object.keys(current).filter(key => !Object.prototype.hasOwnProperty.call(properties, key)) : [];
      const needsJson = definition.additionalProperties !== false;
      const fixedEmptyObject = !pointer && !Object.keys(properties).length && !requiredKeys.length && !needsJson && current !== null && typeof current === "object" && !Array.isArray(current) && !Object.keys(current).length && result.valid && !unsupported.length;
      return <fieldset key={pointer} className="wf-form-group" data-field-pointer={pointer}><legend>{fixedEmptyObject ? title : header}</legend>{fixedEmptyObject ? <p>{title}无需填写，当前值为 {"{}"}。</p> : null}{pointer && !required ? <button type="button" onClick={() => set(current === undefined ? {} : undefined)}>{current === undefined ? `填写${title}` : `省略${title}`}</button> : null}{current !== null && (current !== undefined || !pointer || required) ? Object.entries(properties).map(([key, property]) => field(asFormSchema(property), `${pointer}/${escapePointer(key)}`, key, requiredKeys.includes(key))) : null}{additionalKeys.length ? <p>{additionalKeys.length} 个额外字段已保留；请在高级 JSON 中查看或修改。</p> : null}{needsJson ? <small>此对象允许动态字段，表单只编辑已声明的字段；其他字段请使用高级 JSON，执行仍按原结构校验。</small> : null}{optionalControls}{annotation}</fieldset>;
    }
    if (type === "array" && definition.const === undefined && !definition.enum) {
      const values = Array.isArray(current) ? current : [];
      return <fieldset key={pointer} className="wf-form-group" data-field-pointer={pointer}><legend>{header}</legend>{values.map((_, index) => <div key={index}>{field(asFormSchema(definition.items), `${pointer}/${index}`, `${title} 第 ${index + 1} 项`, true)}<button type="button" onClick={() => set(values.filter((_, i) => i !== index))}>删除第 {index + 1} 项</button></div>)}<button type="button" onClick={() => set([...values, initialValue(resolveFormSchema(asSchema(definition.items), schema))])}>添加{title}</button>{!required ? <button type="button" onClick={() => set(undefined)}>省略{title}</button> : null}{optionalControls}{annotation}</fieldset>;
    }
    let control: React.ReactNode;
    if (type === "null") control = <><output>null</output><button type="button" onClick={() => set(null)}>使用空值</button></>;
    else if (definition.const !== undefined) control = <><output>{JSON.stringify(definition.const)}</output><button type="button" onClick={() => set(definition.const)}>使用固定值</button></>;
    else if (Array.isArray(definition.enum)) control = <select id={id} aria-describedby={`${id}-error`} aria-required={required} aria-invalid={errors.length > 0 || Boolean(fieldInvalid[pointer])} aria-label={title} value={definition.enum.findIndex(item => JSON.stringify(item) === JSON.stringify(current))} onChange={event => { const index = Number(event.target.value); set(index < 0 ? undefined : (definition.enum as JsonValue[])[index]); }}><option value={-1}>请选择</option>{definition.enum.map((item, index) => <option key={index} value={index}>{typeof item === "string" ? item : JSON.stringify(item)}</option>)}</select>;
    else if (type === "boolean") control = <select id={id} aria-describedby={`${id}-error`} aria-required={required} aria-invalid={errors.length > 0 || Boolean(fieldInvalid[pointer])} aria-label={title} value={current === undefined ? "" : String(current)} onChange={event => set(event.target.value === "" ? undefined : event.target.value === "true")}><option value="">请选择</option><option value="true">是</option><option value="false">否</option></select>;
    else if (type === "number" || type === "integer") control = <input id={id} type="number" aria-describedby={`${id}-error`} aria-required={required} aria-invalid={errors.length > 0 || Boolean(fieldInvalid[pointer])} aria-label={title} value={fieldInvalid[pointer] ? "" : typeof current === "number" ? current : ""} step={type === "integer" ? 1 : "any"} onChange={event => { if (event.target.validity.badInput || event.target.value !== "" && !Number.isFinite(event.target.valueAsNumber)) { invalidField(pointer, `${title}需要有限数字`); return; } if (event.target.value === "" && !pointer && required) { invalidField(pointer, `请填写${title}`); return; } set(event.target.value === "" ? undefined : event.target.valueAsNumber); }} />;
    else control = <textarea id={id} aria-describedby={`${id}-error`} aria-required={required} aria-invalid={errors.length > 0 || Boolean(fieldInvalid[pointer])} aria-label={title} rows={pointer === "/question" ? 4 : 2} value={typeof current === "string" ? current : ""} placeholder={typeof definition.description === "string" ? definition.description : `请填写${title}`} onChange={event => set(event.target.value)} />;
    return <div className="wf-form-field" key={pointer} data-field-pointer={pointer}><label htmlFor={id}>{header}</label>{control}{annotation}<div className="wf-field-options">{!required ? <button type="button" onClick={() => set(undefined)}>省略此字段</button> : null}{nullable ? <button type="button" onClick={() => set(null)}>设为空值 null</button> : null}{current === null ? <small>当前值：null</small> : null}{definition.default !== undefined ? <button type="button" onClick={() => set(definition.default)}>采用建议值：{JSON.stringify(definition.default)}</button> : null}</div></div>;
  }
  return <section ref={section} className="wf-schema-form" aria-label={label} data-draft-id={draftId}><div className="wf-form-tabs"><strong>{label}</strong><button type="button" onClick={() => { setMode("form"); cache(raw ?? serialized, jsonError, value, "form"); }} aria-pressed={mode === "form"}>表单</button><button type="button" onClick={() => { setMode("json"); cache(raw ?? serialized, jsonError, value, "json"); }} aria-pressed={mode === "json"}>高级 JSON</button></div>{unsupported.length ? <div role="alert">该结构当前不能执行：{unsupported.map(item => item.message).join("；")}</div> : null}{mode === "form" ? <>{raw !== null && jsonError ? <div role="alert">高级 JSON 尚有错误，请返回修正；当前不能运行。</div> : null}<fieldset disabled={Boolean(jsonError)} className="wf-form-body">{unsupported.length ? <p>该结构暂不能生成表单。原输入已保留，可在高级 JSON 中查看或修改；请修正结构后再运行。</p> : field(schema, "", label, true)}</fieldset>{jsonError ? <button type="button" onClick={() => { invalidFields.current = {}; setFieldInvalid({}); setRaw(null); setJsonError(""); cache(serialized, ""); onInvalid?.(""); }}>放弃错误原文，返回已生效值</button> : null}</> : <label>高级 {label}<textarea aria-label={label === "运行输入" ? "运行输入 JSON" : `${label} JSON`} aria-invalid={Boolean(jsonError)} spellCheck={false} rows={8} value={raw ?? serialized} onChange={event => { const text = event.target.value; setRaw(text); try { const parsed = jsonValueSchema.parse(JSON.parse(text)); invalidFields.current = {}; cache(text, "", parsed); onChange(parsed); setJsonError(""); onInvalid?.(""); setFieldInvalid({}); } catch { const message = "JSON 格式有误，请修正；不会使用旧值运行。"; setJsonError(message); cache(text, message); onInvalid?.(`${label} JSON 格式有误，请修正。`); } }} />{jsonError ? <span role="alert">{jsonError}</span> : null}</label>}{showValidation&&!result.valid ? <details><summary>查看输入检查详情</summary>{result.errors.map(error => <p key={error}>{error}</p>)}</details> : null}</section>;
}
