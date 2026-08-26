import { apiRequest } from "@/shared/api/apiClient";
import { supabaseClient } from "@/shared/api/supabaseClient";
import type { AssistantContextSnapshot, AssistantSession, AssistantSessionDetail } from "./assistantContract";
import type { GoalPlan } from "@/features/course/goal/goalPlanning";

export async function listAssistantSessions() {
  return (await apiRequest<{ sessions: AssistantSession[] }>("/api/assistant")).sessions;
}

export function getAssistantSession(sessionId: string) {
  return apiRequest<AssistantSessionDetail>(`/api/assistant?sessionId=${encodeURIComponent(sessionId)}`);
}

export async function streamAssistantMessage(input: { sessionId?: string; message: string; context: AssistantContextSnapshot }, onDelta: (delta: string) => void, onSession?: (sessionId: string) => void) {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Assistant request failed (${response.status})`);
  }
  const sessionId = response.headers.get("X-Assistant-Session-Id");
  if (!sessionId || !response.body) throw new Error("Assistant stream was incomplete");
  onSession?.(sessionId);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const delta = decoder.decode(value, { stream: true });
    text += delta;
    onDelta(delta);
  }
  text += decoder.decode();
  if (!text.trim()) throw new Error("Assistant returned an empty response");
  return { sessionId, text };
}

type StructuredAssistantResult = { sessionId: string; assistantMessage: string };

export function planAssistantGoal(input: { sessionId?: string; goalText: string; context: AssistantContextSnapshot }) {
  return apiRequest<StructuredAssistantResult & { plan: GoalPlan }>("/api/assistant", { method: "POST", body: JSON.stringify({ action: "plan-goal", ...input }) });
}

export function selectAssistantCourse(input: { sessionId?: string; goalText: string; courseId: string; context: AssistantContextSnapshot }) {
  return apiRequest<StructuredAssistantResult & { courseId: string }>("/api/assistant", { method: "POST", body: JSON.stringify({ action: "use-existing-course", ...input }) });
}

export function confirmAssistantPersonalCourse(input: { sessionId?: string; goalText: string; sourceCourseId?: string; context: AssistantContextSnapshot }) {
  return apiRequest<StructuredAssistantResult & { courseId: string }>("/api/assistant", { method: "POST", body: JSON.stringify({ action: "create-personal-course", ...input }) });
}
