import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MockSession } from "@/features/auth/types";
import type { AssistantContextSnapshot, AssistantMessage, AssistantSession } from "./assistantContract";
import { getAssistantSession, listAssistantSessions, planAssistantGoal, prepareAssistantCourseBrief, refineAssistantGoal, selectAssistantCourse, streamAssistantMessage } from "./assistantClient";

type RuntimeValue = {
  sessions: AssistantSession[];
  activeSessionId: string | null;
  messages: AssistantMessage[];
  loading: boolean;
  sending: boolean;
  error: string;
  selectSession(sessionId: string | null): Promise<void>;
  send(message: string, context: AssistantContextSnapshot): Promise<void>;
  planGoal(goalText: string, context: AssistantContextSnapshot): Promise<boolean>;
  refineGoal(planningMessageId: string, refinement: string, context: AssistantContextSnapshot): Promise<void>;
  useExistingCourse(planningMessageId: string, courseId: string, context: AssistantContextSnapshot): Promise<string>;
  prepareCourseBrief(input: { planningMessageId: string; sourceCourseId?: string; requestedAdjustments?: string; referenceMaterialIntent: "none" | "upload_in_creator" }, context: AssistantContextSnapshot): Promise<void>;
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
  const [clarificationMessageId, setClarificationMessageId] = useState<string | null>(null);

  const reloadSessions = useCallback(async () => {
    const next = await listAssistantSessions();
    setSessions(next);
    return next;
  }, []);

  const selectSession = useCallback(async (sessionId: string | null) => {
    setError("");
    setActiveSessionId(sessionId);
    setClarificationMessageId(null);
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

  const reloadStructuredSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId);
    window.localStorage.setItem(storageKey, sessionId);
    setMessages((await getAssistantSession(sessionId)).messages);
    await reloadSessions();
  }, [reloadSessions, storageKey]);

  const planGoal = useCallback(async (value: string, context: AssistantContextSnapshot) => {
    const nextGoal = value.trim();
    if (!nextGoal || sending) return false;
    setSending(true); setError("");
    try {
      const result = await planAssistantGoal({ sessionId: activeSessionId ?? undefined, ...(clarificationMessageId ? { clarificationMessageId } : {}), goalText: nextGoal, context });
      setClarificationMessageId(result.status === "needs_clarification" && result.messageId ? result.messageId : null);
      await reloadStructuredSession(result.sessionId);
      return true;
    } catch (planningError) { setError(planningError instanceof Error ? planningError.message : "学习目标规划失败"); return false; }
    finally { setSending(false); }
  }, [activeSessionId, clarificationMessageId, reloadStructuredSession, sending]);

  const refineGoal = useCallback(async (planningMessageId: string, refinement: string, context: AssistantContextSnapshot) => {
    if (!refinement.trim() || sending) return;
    setSending(true); setError("");
    try { const result = await refineAssistantGoal({ planningMessageId, refinement: refinement.trim(), context }); await reloadStructuredSession(result.sessionId); }
    catch (refinementError) { setError(refinementError instanceof Error ? refinementError.message : "继续寻找失败"); }
    finally { setSending(false); }
  }, [reloadStructuredSession, sending]);

  const useExistingCourse = useCallback(async (planningMessageId: string, courseId: string, context: AssistantContextSnapshot) => {
    if (sending) throw new Error("Assistant 正在处理另一项请求");
    setSending(true); setError("");
    try {
      const result = await selectAssistantCourse({ planningMessageId, courseId, context });
      await reloadStructuredSession(result.sessionId);
      return result.courseId;
    } catch (selectionError) { const message = selectionError instanceof Error ? selectionError.message : "课程选择失败"; setError(message); throw selectionError; }
    finally { setSending(false); }
  }, [reloadStructuredSession, sending]);

  const prepareCourseBrief = useCallback(async (input: { planningMessageId: string; sourceCourseId?: string; requestedAdjustments?: string; referenceMaterialIntent: "none" | "upload_in_creator" }, context: AssistantContextSnapshot) => {
    if (sending) throw new Error("Assistant 正在处理另一项请求");
    setSending(true); setError("");
    try {
      const result = await prepareAssistantCourseBrief({ ...input, context });
      await reloadStructuredSession(result.sessionId);
    } catch (creationError) { const message = creationError instanceof Error ? creationError.message : "创建需求整理失败"; setError(message); throw creationError; }
    finally { setSending(false); }
  }, [reloadStructuredSession, sending]);

  const value = useMemo<RuntimeValue>(() => ({ sessions, activeSessionId, messages, loading, sending, error, selectSession, send, planGoal, refineGoal, useExistingCourse, prepareCourseBrief, reloadSessions }), [activeSessionId, error, loading, messages, planGoal, prepareCourseBrief, refineGoal, reloadSessions, selectSession, send, sending, sessions, useExistingCourse]);
  return <AssistantRuntimeContext.Provider value={value}>{children}</AssistantRuntimeContext.Provider>;
}

export function useAssistantRuntime() {
  const value = useContext(AssistantRuntimeContext);
  if (!value) throw new Error("AssistantRuntimeProvider is missing");
  return value;
}
