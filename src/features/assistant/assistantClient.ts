import { apiRequest } from "@/shared/api/apiClient";
import { supabaseClient } from "@/shared/api/supabaseClient";
import type { AssistantContextSnapshot, AssistantMessage, AssistantSession, AssistantSessionDetail, CourseCreationBrief } from "./assistantContract";
import type { GoalPlan } from "@/features/course/goal/goalPlanning";
import type { CourseCreatorDesign, CourseCreatorProposal, CourseCreatorStage } from "@/features/course/creation/courseCreator";

export async function listAssistantSessions() {
  return (await apiRequest<{ sessions: AssistantSession[] }>("/api/assistant")).sessions;
}

export function getAssistantSession(sessionId: string) {
  return apiRequest<AssistantSessionDetail>(`/api/assistant?sessionId=${encodeURIComponent(sessionId)}`);
}

export async function getAssistantTimelineMessage(messageId: string) {
  return (await apiRequest<{ message: AssistantMessage }>(`/api/assistant?messageId=${encodeURIComponent(messageId)}`)).message;
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

type StructuredAssistantResult = { sessionId: string; assistantMessage: string; messageId?: string; status?: "ready" | "clarify" | "unsupported" };

export function planAssistantGoal(input: { sessionId?: string; goalText: string; context: AssistantContextSnapshot }) {
  return apiRequest<StructuredAssistantResult & { plan?: GoalPlan }>("/api/assistant", { method: "POST", body: JSON.stringify({ action: "plan-goal", ...input }) });
}

export function refineAssistantGoal(input: { planningMessageId: string; refinement: string; context: AssistantContextSnapshot }) {
  return apiRequest<StructuredAssistantResult & { plan?: GoalPlan }>("/api/assistant", { method: "POST", body: JSON.stringify({ action: "refine-goal", ...input }) });
}

export function selectAssistantCourse(input: { planningMessageId: string; courseId: string; context: AssistantContextSnapshot }) {
  return apiRequest<StructuredAssistantResult & { courseId: string }>("/api/assistant", { method: "POST", body: JSON.stringify({ action: "use-existing-course", ...input }) });
}

export function prepareAssistantCourseBrief(input: { planningMessageId: string; sourceCourseId?: string; requestedAdjustments?: string; referenceMaterialIntent: "none" | "upload_in_creator"; context: AssistantContextSnapshot }) {
  return apiRequest<StructuredAssistantResult & { brief: CourseCreationBrief }>("/api/assistant", { method: "POST", body: JSON.stringify({ action: "prepare-course-brief", ...input }) });
}

export function proposeCourseCreatorAdjustment(input: { briefMessageId: string; stage: CourseCreatorStage; instruction: string; current: CourseCreatorDesign; context: AssistantContextSnapshot }) {
  return apiRequest<{ sessionId: string; intent: "navigate" | "explain" | "edit"; proposal?: CourseCreatorProposal }>("/api/assistant", { method: "POST", body: JSON.stringify({ action: "course-creator-proposal", ...input }) });
}
