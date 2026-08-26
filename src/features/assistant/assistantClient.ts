import { apiRequest } from "@/shared/api/apiClient";
import { supabaseClient } from "@/shared/api/supabaseClient";
import type { AssistantContextSnapshot, AssistantSession, AssistantSessionDetail } from "./assistantContract";

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
