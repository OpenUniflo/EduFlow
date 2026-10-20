import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { jsonValueSchema } from "../../domain/v2/schema";
import canonicalize from "canonicalize";

export type JsonDraftStore = Map<string, { text: string; baseline: string; error: string; fields?: Record<string, string>; mode?: "form" | "json"; ownerNodeId?: string; ownerInputName?: string; ownerStateField?: string }>;
const DraftContext = createContext<{ drafts: JsonDraftStore; onPending: (id: string, pending: boolean) => void } | null>(null);
export function JsonDraftProvider({ drafts, onPending, children }: { drafts: JsonDraftStore; onPending: (id: string, pending: boolean) => void; children: ReactNode }) {
  const value = useMemo(() => ({ drafts, onPending }), [drafts, onPending]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}
export function useJsonDraftContext() { return useContext(DraftContext); }
export function JsonField<T>({ label, fieldId = label, value, onChange, rows = 5, help, validate, ownerNodeId }: { label: string; fieldId?: string; value: T; onChange: (value: T) => void; rows?: number; help?: string; validate?: (value: unknown) => string | undefined; ownerNodeId?: string }) {
  const context = useContext(DraftContext); const serialized = JSON.stringify(value, null, 2);
  const cached = context?.drafts.get(fieldId);
  const [text, setText] = useState(cached?.baseline === serialized ? cached.text : serialized);
  const [error, setError] = useState(cached?.error ?? "");
  useEffect(() => { const prior = context?.drafts.get(fieldId); if (prior?.baseline === serialized) { setText(prior.text); setError(prior.error); return; } setText(serialized); setError(""); context?.drafts.set(fieldId, { text: serialized, baseline: serialized, error: "", ownerNodeId }); context?.onPending(fieldId, false); }, [serialized, fieldId, context, ownerNodeId]);
  function change(text: string, error = "") { setText(text); setError(error); context?.drafts.set(fieldId, { text, baseline: serialized, error, ownerNodeId }); context?.onPending(fieldId, text !== serialized); }
  function apply() {
    try { const parsed = jsonValueSchema.parse(JSON.parse(text)) as T;
      if (value && typeof value === "object" && !Array.isArray(value) && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) { change(text, "此配置必须是 JSON 对象。"); return; }
      const invalid = validate?.(parsed); if (invalid) { change(text, invalid); return; }
      onChange(parsed);
      // Applying formatting alone is still a completed edit when the parent keeps its equivalent value.
      setText(canonicalize(parsed) === canonicalize(value) ? serialized : JSON.stringify(parsed, null, 2));
      context?.drafts.delete(fieldId); context?.onPending(fieldId, false); setError(""); }
    catch { change(text, "JSON 格式有误，请修正后应用。"); }
  }
  return <div className="wf-v2-json" data-config-field={label} data-draft-id={fieldId}><label><span>{label}</span><textarea aria-label={label} aria-invalid={Boolean(error)} rows={rows} value={text} onChange={event => change(event.target.value)} spellCheck={false} /></label>{help ? <small>{help}</small> : null}<div><button type="button" onClick={apply} disabled={text === serialized}>应用{label}</button>{text !== serialized ? <button type="button" onClick={() => change(serialized)}>放弃{label}未应用编辑</button> : null}{error ? <span role="alert">{error}</span> : null}{text !== serialized && !error ? <small>未应用的编辑已保留，请应用后保存或运行</small> : null}</div></div>;
}
