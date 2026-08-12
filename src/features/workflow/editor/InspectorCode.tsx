import type { ReactNode } from "react";
import { Check, Code2, Square } from "lucide-react";

export function InspectorCode({ title, code, action }: { title: string; code: string; action?: ReactNode }) {
  return <div className="inspector-code"><div className="code-heading"><div><Code2 size={15} /><span>{title}</span></div>{action}</div><pre className="code-view">{code}</pre></div>;
}

export function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return <div className={`status-line ${ok ? "ok" : "error"}`}>{ok ? <Check size={15} /> : <Square size={15} />}<span>{label}</span></div>;
}
