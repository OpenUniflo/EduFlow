import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MockSession } from "@/features/auth/types";
import type { AssistantContextSnapshot, AssistantMessage, AssistantSession } from "./assistantContract";
import { getAssistantSession, listAssistantSessions, streamAssistantMessage } from "./assistantClient";

type RuntimeValue = {
  sessions: AssistantSession[];
  activeSessionId: string | null;
  messages: AssistantMessage[];
  loading: boolean;
  sending: boolean;
  error: string;
  selectSession(sessionId: string | null): Promise<void>;
  send(message: string, context: AssistantContextSnapshot): Promise<void>;
  reloadSessions(): Promise<AssistantSession[]>;
};

const AssistantRuntimeContext = createContext<RuntimeValue | null>(null);

export function AssistantRuntimeProvider({ session, children }: { session: MockSession; children: ReactNode }) {
  const storageKey = `eduflow:assistant:active:${session.userId}`;
  const [sessions, setSessions] = useState<AssistantSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => window.localStorage.getItem(storageKey));
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const reloadSessions = useCallback(async () => {
    const next = await listAssistantSessions();
    setSessions(next);
    return next;
  }, []);

  const selectSession = useCallback(async (sessionId: string | null) => {
    setError("");
    setActiveSessionId(sessionId);
    if (!sessionId) {
      window.localStorage.removeItem(storageKey);
      setMessages([]);
      return;
    }
    window.localStorage.setItem(storageKey, sessionId);
    setLoading(true);
    try { setMessages((await getAssistantSession(sessionId)).messages); }
    catch (loadError) {
      window.localStorage.removeItem(storageKey);
      setActiveSessionId(null);
      setMessages([]);
      setError(loadError instanceof Error ? loadError.message : "对话加载失败");
    } finally { setLoading(false); }
  }, [storageKey]);

  useEffect(() => {
    let active = true;
    void reloadSessions().then(async (next) => {
      if (!active) return;
      const stored = window.localStorage.getItem(storageKey);
      if (stored && next.some((item) => item.id === stored)) await selectSession(stored);
      else { window.localStorage.removeItem(storageKey); setActiveSessionId(null); setMessages([]); setLoading(false); }
    }).catch((loadError) => { if (active) { setError(loadError instanceof Error ? loadError.message : "对话加载失败"); setLoading(false); } });
    return () => { active = false; };
  }, [reloadSessions, selectSession, storageKey]);

  const send = useCallback(async (content: string, context: AssistantContextSnapshot) => {
    const message = content.trim();
    if (!message || sending) return;
    setSending(true); setError("");
    const optimisticUser: AssistantMessage = { id: `pending-user-${crypto.randomUUID()}`, sessionId: activeSessionId ?? "pending", role: "user", content: message, context, createdAt: new Date().toISOString() };
    const optimisticAssistant: AssistantMessage = { id: `pending-assistant-${crypto.randomUUID()}`, sessionId: activeSessionId ?? "pending", role: "assistant", content: "", context, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, optimisticUser, optimisticAssistant]);
    try {
      const result = await streamAssistantMessage({ sessionId: activeSessionId ?? undefined, message, context }, (delta) => {
        setMessages((current) => current.map((item) => item.id === optimisticAssistant.id ? { ...item, content: item.content + delta } : item));
      }, (sessionId) => {
        setActiveSessionId(sessionId);
        window.localStorage.setItem(storageKey, sessionId);
      });
      if (result.sessionId !== activeSessionId) {
        setActiveSessionId(result.sessionId);
        window.localStorage.setItem(storageKey, result.sessionId);
      }
      await reloadSessions();
    } catch (sendError) {
      setMessages((current) => current.filter((item) => item.id !== optimisticAssistant.id));
      setError(sendError instanceof Error ? sendError.message : "Assistant 暂时不可用");
    } finally { setSending(false); }
  }, [activeSessionId, reloadSessions, sending, storageKey]);

  const value = useMemo<RuntimeValue>(() => ({ sessions, activeSessionId, messages, loading, sending, error, selectSession, send, reloadSessions }), [activeSessionId, error, loading, messages, reloadSessions, selectSession, send, sending, sessions]);
  return <AssistantRuntimeContext.Provider value={value}>{children}</AssistantRuntimeContext.Provider>;
}

export function useAssistantRuntime() {
  const value = useContext(AssistantRuntimeContext);
  if (!value) throw new Error("AssistantRuntimeProvider is missing");
  return value;
}
