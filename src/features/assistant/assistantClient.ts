import { DefaultChatTransport, readUIMessageStream, type UIMessage } from "ai";
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

type StructuredAssistantResult = { sessionId: string; assistantMessage: string; messageId?: string; status?: "ready" | "needs_clarification" | "no_match"; goalStatus?: "ready" | "needs_clarification"; catalogStatus?: "matched" | "no_match" };

export function planAssistantGoal(input: { sessionId?: string; clarificationMessageId?: string; goalText: string; context: AssistantContextSnapshot }) {
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
  return apiRequest<{ sessionId: string; intent: "explain" | "edit"; proposal: CourseCreatorProposal }>("/api/assistant", { method: "POST", body: JSON.stringify({ action: "course-creator-proposal", ...input }) });
}

/** Server-owned template reply for a button action. Never calls the model. */
export function recordAssistantButtonAction(input: {
  kind: "micro-completed" | "micro-opened" | "route-started" | "segment-cleared" | "practice-opened" | "practice-submitted";
  sessionId?: string | null;
  pathId?: string;
  knowledgeId?: string;
  courseId?: string;
  assignmentId?: string;
  attemptId?: string;
  resuming?: boolean;
  forceNewSession?: boolean;
  createSession?: boolean;
  context: AssistantContextSnapshot;
}) {
  return apiRequest<{ sessionId: string | null; message: AssistantMessage | null }>("/api/assistant", {
    method: "POST",
    body: JSON.stringify({ action: "record-action", ...input })
  });
}

/**
 * Small adapter for the secondary workspace conversation. It reuses the AI
 * SDK transport and UI-message reader instead of decoding the stream by hand.
 */
export async function streamAssistantMessage(input: { sessionId?: string; message: string; context: AssistantContextSnapshot }, onDelta: (delta: string) => void, onSession?: (sessionId: string) => void) {
  const transport = new DefaultChatTransport<UIMessage>({
    api: "/api/assistant",
    headers: async () => {
      const { data } = await supabaseClient.auth.getSession();
      return (data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) as Record<string, string>;
    },
    body: () => ({ sessionId: input.sessionId, context: input.context }),
    fetch: async (request, init) => {
      const response = await fetch(request, init);
      const sessionId = response.headers.get("X-Assistant-Session-Id");
      if (sessionId) onSession?.(sessionId);
      return response;
    }
  });
  const chunks = await transport.sendMessages({
    trigger: "submit-message",
    chatId: input.sessionId ?? "workspace",
    messageId: undefined,
    abortSignal: undefined,
    messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: input.message }] }]
  });
  let emitted = 0;
  let text = "";
  for await (const message of readUIMessageStream({ stream: chunks })) {
    text = message.parts.filter((part) => part.type === "text").map((part) => (part as { text: string }).text).join("");
    if (text.length > emitted) {
      onDelta(text.slice(emitted));
      emitted = text.length;
    }
  }
  if (!text.trim()) throw new Error("Assistant returned an empty response");
  return { sessionId: input.sessionId ?? "", text };
}
