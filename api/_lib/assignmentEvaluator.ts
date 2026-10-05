import type { AssignmentResponse, PerformanceOutcome } from "../../src/shared/learning/assignmentAttempt.js";

type Row = Record<string, unknown>;
export type RuleEvaluation = { outcome: PerformanceOutcome; score?: number; feedback: { code: string; message: string }; evaluatorKind: "rule" | "manual" };

const object = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;

function parseCoreResponse(value: unknown): AssignmentResponse | null {
  const response = object(value);
  if (response?.kind === "trace" && typeof response.selectedStepId === "string" && response.selectedStepId.trim()) return { kind: "trace", selectedStepId: response.selectedStepId };
  if (response?.kind === "answer" && (response.text == null || typeof response.text === "string") && (String(response.text ?? "").trim() || (Array.isArray(response.attachmentSourceIds) && response.attachmentSourceIds.length))) return { kind: "answer", text: String(response.text ?? "").trim() };
  if (response?.kind === "code") {
    const ids = response.attachmentSourceIds;
    if (ids != null && (!Array.isArray(ids) || ids.length > 5 || !ids.every(id => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || new Set(ids).size !== ids.length)) return null;
    if ((response.code != null && typeof response.code !== 'string') || (response.fileName != null && typeof response.fileName !== 'string')) return null;
    if (!String(response.code ?? "").trim() && !(Array.isArray(ids) && ids.length)) return null;
    return { kind:"code", code:typeof response.code === "string" ? response.code : undefined, fileName:typeof response.fileName === "string" ? response.fileName : undefined, ...(Array.isArray(ids) ? { attachmentSourceIds:ids as string[] } : {}) };
  }
  if (response?.kind === "workflow" && typeof response.runId === "string" && response.runId.trim()) return { kind: "workflow", runId: response.runId };
  return null;
}

export function parseAssignmentResponse(value: unknown): AssignmentResponse | null {
  const source=object(value);const ids=source?.attachmentSourceIds;
  if(ids!=null&&(!Array.isArray(ids)||ids.length>4||!ids.every(id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))||new Set(ids).size!==ids.length))return null;
  const response=parseCoreResponse(value);
  return response?{...response,...(Array.isArray(ids)?{attachmentSourceIds:ids as string[]}:{})}:null;
}

export function evaluateAssignmentResponse(assignment: Row, response: AssignmentResponse): RuleEvaluation {
  const experience = object(assignment.experience);
  const type = typeof experience?.type === "string" ? experience.type : assignment.mode === "workflow" ? "workflow" : "answer";
  if (type === "trace") {
    if (response.kind !== "trace" || typeof experience?.faultyStepId !== "string") return { outcome: "failed", score: 0, feedback: { code: "trace_response_invalid", message: "Trace response does not match the published validator." }, evaluatorKind: "rule" };
    const passed = response.selectedStepId === experience.faultyStepId;
    return { outcome: passed ? "passed" : "failed", score: passed ? 1 : 0, feedback: { code: passed ? "trace_root_cause_found" : "trace_root_cause_missed", message: passed ? "The earliest failing step was identified." : "Review the trace and locate the earliest failing step." }, evaluatorKind: "rule" };
  }
  if ((type === "answer" && response.kind !== "answer") || (type === "code" && response.kind !== "code") || (type === "workflow" && response.kind !== "workflow")) return { outcome: "failed", score: 0, feedback: { code: "response_kind_mismatch", message: "The response does not match this Assignment experience." }, evaluatorKind: "rule" };
  return { outcome: "pending", feedback: { code: "manual_review_required", message: "The response is recorded and requires teacher review." }, evaluatorKind: "manual" };
}
