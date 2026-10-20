import { useEffect, useState } from "react";
import type { JsonValue, WorkflowDocumentV2 } from "../../domain/v2/types";
import { advancePreview, createFrontendPreview, forkPreview, respondPreview, type FrontendPreview } from "./frontendPreview";
export function useFrontendPreview() {
  const [session, setSession] = useState<FrontendPreview | null>(null);
  const [history, setHistory] = useState<FrontendPreview[]>([]);
  const [historical, setHistorical] = useState(false);
  useEffect(() => {
    if (!session || historical || session.status !== "running") return;
    const timer = window.setTimeout(() => setSession(current => current?.id === session.id ? advancePreview(current) : current), 650);
    return () => window.clearTimeout(timer);
  }, [session, historical]);
  useEffect(() => {
    if (!session || historical || !["success", "failed", "cancelled"].includes(session.status)) return;
    setHistory(current => [session, ...current.filter(item => item.id !== session.id)].slice(0, 20));
  }, [session, historical]);
  return { session, history, historical,
    start: (snapshot: WorkflowDocumentV2, scenario: FrontendPreview["scenario"], input:JsonValue = {}) => { setHistorical(false); setSession(createFrontendPreview(snapshot, `preview-${crypto.randomUUID()}`, scenario, input)); },
    respond: (response: Record<string, JsonValue>) => setSession(current => current && !historical ? respondPreview(current, response) : current),
    cancel: () => setSession(current => current && !historical ? { ...current, status: "cancelled",stream:undefined,steps:current.steps.map(step=>["running","waiting"].includes(step.status)?{...step,status:"cancelled",finishedAt:new Date().toISOString()}:step) } : current),
    select: (record: FrontendPreview) => { setHistorical(true); setSession(record); },
    fork: (stepId: string) => { if (session) { setSession(forkPreview(session, stepId, `preview-${crypto.randomUUID()}`)); setHistorical(false); } },
    close: () => { if (!session || ["success", "failed", "cancelled"].includes(session.status) || historical) { setSession(null); setHistorical(false); } },
  };
}
