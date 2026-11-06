import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MockSession } from "@/features/auth/types";
import { supabaseClient } from "@/shared/api/supabaseClient";
import type { AssistantContextSnapshot, AssistantMessage, AssistantSession, AssistantStructuredContent, AssistantTimelinePart } from "./assistantContract";
import { getAssistantSession, listAssistantSessions, planAssistantGoal, prepareAssistantCourseBrief, recordAssistantButtonAction, refineAssistantGoal, selectAssistantCourse } from "./assistantClient";

type AssistantMetadata = {
  createdAt?: string;
  messageKind?: "utterance" | "action" | "goal_clarification";
  invalidReason?: string;
  structuredContent?: AssistantStructuredContent;
  context?: AssistantContextSnapshot;
};

export type AssistantUIMessage = UIMessage<AssistantMetadata>;

type RuntimeValue = {
  session: MockSession;
  sessions: AssistantSession[];
  activeSessionId: string | null;
  /** Ordered AI SDK parts used by the Home timeline. */
  chatMessages: AssistantUIMessage[];
  /** Legacy projection kept for panels that read plain text + structured cards. */
  messages: AssistantMessage[];
  loading: boolean;
  sending: boolean;
  error: string;
  selectSession(sessionId: string | null): Promise<void>;
  send(message: string, context: AssistantContextSnapshot): Promise<boolean>;
  retry(): Promise<boolean>;
  planGoal(goalText: string, context: AssistantContextSnapshot): Promise<boolean>;
  refineGoal(planningMessageId: string, refinement: string, context: AssistantContextSnapshot): Promise<void>;
  useExistingCourse(planningMessageId: string, courseId: string, context: AssistantContextSnapshot): Promise<string>;
  prepareCourseBrief(input: { planningMessageId: string; sourceCourseId?: string; requestedAdjustments?: string; referenceMaterialIntent: "none" | "upload_in_creator" }, context: AssistantContextSnapshot): Promise<void>;
  recordAction(input: { kind: "micro-completed" | "micro-opened" | "route-started" | "segment-cleared" | "practice-opened" | "practice-submitted"; pathId?: string; knowledgeId?: string; courseId?: string; assignmentId?: string; attemptId?: string; resuming?: boolean; forceNewSession?: boolean }, context: AssistantContextSnapshot): Promise<void>;
  reloadSessions(): Promise<AssistantSession[]>;
};

const AssistantRuntimeContext = createContext<RuntimeValue | null>(null);

const allowedPartTypes = new Set(["text", "tool-displayCard"]);

function textOfParts(parts: readonly AssistantTimelinePart[] | undefined): string {
  if (!parts?.length) return "";
  return parts.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => String(part.text)).join("");
}

function toUIMessage(message: AssistantMessage): AssistantUIMessage {
  const parts = (message.parts?.length ? message.parts : [{ type: "text", text: message.content }])
    .filter((part) => allowedPartTypes.has(part.type)) as AssistantUIMessage["parts"];
  return {
    id: message.id,
    role: message.role,
    parts,
    metadata: {
      createdAt: message.createdAt,
      ...(message.messageKind ? { messageKind: message.messageKind } : {}),
      ...(message.invalidReason ? { invalidReason: message.invalidReason } : {}),
      ...(message.structuredContent ? { structuredContent: message.structuredContent } : {}),
      context: message.context
    }
  };
}

function toLegacy(message: AssistantUIMessage, sessionId: string | null): AssistantMessage {
  const parts = (message.parts ?? []) as AssistantTimelinePart[];
  return {
    id: message.id,
    sessionId: sessionId ?? "pending",
    role: message.role === "user" ? "user" : "assistant",
    content: textOfParts(parts),
    ...(message.metadata?.messageKind ? { messageKind: message.metadata.messageKind } : {}),
    ...(message.metadata?.invalidReason ? { invalidReason: message.metadata.invalidReason } : {}),
    ...(message.metadata?.structuredContent ? { structuredContent: message.metadata.structuredContent } : {}),
    parts,
    context: message.metadata?.context ?? { workspace: "learning", experienceMode: "learn" },
    createdAt: message.metadata?.createdAt ?? new Date().toISOString()
  };
}

function friendlyError(message: string): string {
  if (/protocol_leak/i.test(message)) return "助手这次的回复格式异常，正在重试…";
  if (/assistant_provider_unavailable|assistant_stream_failed|provider/i.test(message)) return "助手暂时不可用，请重试。";
  if (/assistant_empty_response|没有生成有效回复|empty/i.test(message)) return "助手这次没有生成有效回复，请重试。";
  if (/Failed to fetch|network|NetworkError/i.test(message)) return "网络连接中断，回复没有完成。请重试。";
  return message;
}

export function AssistantRuntimeProvider({ session, children }: { session: MockSession; children: ReactNode }) {
  const storageKey = `eduflow:assistant:active:${session.userId}`;
  const newChatKey = `eduflow:assistant:new:${session.userId}`;
  const [sessions, setSessions] = useState<AssistantSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => window.localStorage.getItem(storageKey));
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState(false);
  const [pendingReply, setPendingReply] = useState(false);
  const [manualError, setManualError] = useState("");
  const [clarificationMessageId, setClarificationMessageId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(activeSessionId);
  const lastContextRef = useRef<AssistantContextSnapshot>({ workspace: "learning", experienceMode: "learn" });
  const lastMessageRef = useRef("");
  const lastSendOkRef = useRef(false);
  const retriedRef = useRef(0);
  const chatRef = useRef<ReturnType<typeof useChat<AssistantUIMessage>> | null>(null);
  const chatApiRef = useRef<{ setMessages: ReturnType<typeof useChat<AssistantUIMessage>>["setMessages"]; current: () => ReturnType<typeof useChat<AssistantUIMessage>> }>(null!);
  const replyPollRef = useRef<number | null>(null);
  const newChatEpoch = useRef(0);

  const rememberSession = useCallback((sessionId: string | null) => {
    sessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    if (sessionId) {
      window.localStorage.setItem(storageKey, sessionId);
      window.localStorage.removeItem(newChatKey);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, [newChatKey, storageKey]);

  const transport = useMemo(() => new DefaultChatTransport<AssistantUIMessage>({
    api: "/api/assistant",
    headers: async () => {
      const { data } = await supabaseClient.auth.getSession();
      return (data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) as Record<string, string>;
    },
    body: () => ({ sessionId: sessionIdRef.current ?? undefined, context: lastContextRef.current }),
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      const createdSessionId = response.headers.get("X-Assistant-Session-Id");
      if (createdSessionId) rememberSession(createdSessionId);
      return response;
    }
  }), [rememberSession]);

  const chat = useChat<AssistantUIMessage>({
    id: `assistant-${session.userId}`,
    transport,
    throttle: 40,
    onError: (error) => {
      setManualError(friendlyError(error.message));
      if (retriedRef.current < 1) {
        retriedRef.current += 1;
        window.setTimeout(() => { void chatRef.current?.regenerate().catch(() => undefined); }, 0);
      }
    },
    onFinish: () => {
      void reloadSessions().catch(() => undefined);
      const last = chatRef.current?.messages[chatRef.current.messages.length - 1];
      const hasText = Boolean(last?.parts?.some((part) => part.type === "text" && (part as { text?: string }).text?.trim()));
      const hasCard = Boolean(last?.parts?.some((part) => part.type === "tool-displayCard"));
      if (last?.role === "assistant" && !hasText && !hasCard && retriedRef.current < 1) {
        retriedRef.current += 1;
        setManualError("助手这次没有生成有效回复，正在重试…");
        window.setTimeout(() => { void chatRef.current?.regenerate().catch(() => undefined); }, 0);
        return;
      }
      if (last?.role === "assistant" && !hasText && !hasCard) {
        setManualError("助手这次没有生成有效回复，请重试。");
        return;
      }
      lastSendOkRef.current = true;
    }
  });
  chatRef.current = chat;
  chatApiRef.current = { setMessages: chat.setMessages, current: () => chatRef.current! };

  const incompleteHandled = useRef<string | null>(null);
  useEffect(() => {
    if (chat.status !== "ready") return;
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.role !== "assistant" || incompleteHandled.current === last.id) return;
    if (!last.parts?.some((part) => part.type === "data-incomplete")) return;
    incompleteHandled.current = last.id;
    if (retriedRef.current < 1) {
      retriedRef.current += 1;
      setManualError("回答没有完整生成，正在重试…");
      window.setTimeout(() => { void chatRef.current?.regenerate().catch(() => undefined); }, 0);
    } else {
      setManualError("回答没有完整生成，请重试。");
    }
  }, [chat.messages, chat.status]);

  const reloadSessions = useCallback(async () => {
    const next = await listAssistantSessions();
    setSessions(next);
    return next;
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    const detail = await getAssistantSession(sessionId);
    rememberSession(sessionId);
    chatApiRef.current.setMessages(detail.messages.map(toUIMessage));
    return detail;
  }, [rememberSession]);

  const stopReplyPoll = useCallback(() => {
    if (replyPollRef.current != null) {
      window.clearTimeout(replyPollRef.current);
      replyPollRef.current = null;
    }
  }, []);

  /** A persisted user turn can precede the first token. Wait for the
   *  server-owned answer instead of showing a failed empty turn. */
  const pollForReply = useCallback((sessionId: string) => {
    stopReplyPoll();
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const detail = await getAssistantSession(sessionId);
        const last = detail.messages[detail.messages.length - 1];
        chatApiRef.current.setMessages(detail.messages.map(toUIMessage));
        if (last?.role === "assistant") {
          setPendingReply(false);
          stopReplyPoll();
          void reloadSessions().catch(() => undefined);
          return;
        }
      } catch {
        // A transient poll failure must not discard the visible user turn.
      }
      if (attempts >= 30) {
        setPendingReply(false);
        stopReplyPoll();
        setManualError("回复仍未完成，请重试。");
        return;
      }
      replyPollRef.current = window.setTimeout(tick, 1500);
    };
    replyPollRef.current = window.setTimeout(tick, 1200);
  }, [reloadSessions, stopReplyPoll]);

  const selectSession = useCallback(async (sessionId: string | null) => {
    stopReplyPoll();
    setPendingReply(false);
    setManualError("");
    setClarificationMessageId(null);
    if (!sessionId) {
      newChatEpoch.current += 1;
      window.localStorage.setItem(newChatKey, "1");
      rememberSession(null);
      chatApiRef.current.setMessages([]);
      return;
    }
    window.localStorage.removeItem(newChatKey);
    setLoading(true);
    const epoch = newChatEpoch.current;
    try {
      const detail = await getAssistantSession(sessionId);
      if (newChatEpoch.current !== epoch) return;
      rememberSession(sessionId);
      chatApiRef.current.setMessages(detail.messages.map(toUIMessage));
      if (detail.messages[detail.messages.length - 1]?.role === "user") {
        setPendingReply(true);
        pollForReply(sessionId);
      }
    }
    catch (loadError) {
      rememberSession(null);
      chatApiRef.current.setMessages([]);
      setManualError(loadError instanceof Error ? friendlyError(loadError.message) : "对话加载失败");
    } finally { setLoading(false); }
  }, [newChatKey, pollForReply, rememberSession, stopReplyPoll]);

  useEffect(() => {
    let active = true;
    void reloadSessions().then(async (next) => {
      if (!active) return;
      const stored = window.localStorage.getItem(storageKey);
      const explicitlyNew = window.localStorage.getItem(newChatKey) === "1";
      if (stored && next.some((item) => item.id === stored)) await selectSession(stored);
      else if (!explicitlyNew && next[0]) await selectSession(next[0].id);
      else { rememberSession(null); chatApiRef.current.setMessages([]); setLoading(false); }
    }).catch((loadError) => {
      if (!active) return;
      setManualError(loadError instanceof Error ? friendlyError(loadError.message) : "对话加载失败");
      setLoading(false);
    });
    return () => { active = false; };
  }, [newChatKey, reloadSessions, rememberSession, selectSession, storageKey]);

  const send = useCallback(async (content: string, context: AssistantContextSnapshot) => {
    const message = content.trim();
    const api = chatApiRef.current.current();
    if (!message || api.status === "streaming" || api.status === "submitted") return false;
    setManualError("");
    lastContextRef.current = context;
    lastMessageRef.current = message;
    lastSendOkRef.current = false;
    retriedRef.current = 0;
    stopReplyPoll();
    setPendingReply(false);
    try {
      await api.sendMessage({ text: message }, { body: { context } });
      // A background session-list refresh is secondary and must never turn a
      // successful answer into a page-level load failure.
      await reloadSessions().catch(() => undefined);
      return lastSendOkRef.current || !chatRef.current?.error;
    } catch (sendError) {
      setManualError(sendError instanceof Error ? friendlyError(sendError.message) : "Assistant 暂时不可用");
      return false;
    }
  }, [reloadSessions, stopReplyPoll]);

  const retry = useCallback(async () => {
    setManualError("");
    retriedRef.current = 1;
    try {
      await chatApiRef.current.current().regenerate();
      return true;
    } catch {
      if (!lastMessageRef.current) return false;
      return send(lastMessageRef.current, lastContextRef.current);
    }
  }, [send]);

  const reloadStructuredSession = useCallback(async (sessionId: string) => {
    await loadSession(sessionId);
    await reloadSessions();
  }, [loadSession, reloadSessions]);

  const planGoal = useCallback(async (value: string, context: AssistantContextSnapshot) => {
    const nextGoal = value.trim();
    if (!nextGoal || ["streaming", "submitted"].includes(chatApiRef.current.current().status)) return false;
    setPendingAction(true); setManualError("");
    try {
      const result = await planAssistantGoal({ sessionId: sessionIdRef.current ?? undefined, ...(clarificationMessageId ? { clarificationMessageId } : {}), goalText: nextGoal, context });
      setClarificationMessageId(result.status === "needs_clarification" && result.messageId ? result.messageId : null);
      await reloadStructuredSession(result.sessionId);
      return true;
    } catch (planningError) {
      setManualError(planningError instanceof Error ? friendlyError(planningError.message) : "学习目标规划失败");
      return false;
    } finally { setPendingAction(false); }
  }, [clarificationMessageId, reloadStructuredSession]);

  const refineGoal = useCallback(async (planningMessageId: string, refinement: string, context: AssistantContextSnapshot) => {
    if (!refinement.trim() || ["streaming", "submitted"].includes(chatApiRef.current.current().status)) return;
    setPendingAction(true); setManualError("");
    try { const result = await refineAssistantGoal({ planningMessageId, refinement: refinement.trim(), context }); await reloadStructuredSession(result.sessionId); }
    catch (refinementError) { setManualError(refinementError instanceof Error ? friendlyError(refinementError.message) : "继续寻找失败"); }
    finally { setPendingAction(false); }
  }, [reloadStructuredSession]);

  const useExistingCourse = useCallback(async (planningMessageId: string, courseId: string, context: AssistantContextSnapshot) => {
    if (["streaming", "submitted"].includes(chatApiRef.current.current().status)) throw new Error("Assistant 正在处理另一项请求");
    setPendingAction(true); setManualError("");
    try {
      const result = await selectAssistantCourse({ planningMessageId, courseId, context });
      await reloadStructuredSession(result.sessionId);
      return result.courseId;
    } catch (selectionError) {
      const errorMessage = selectionError instanceof Error ? friendlyError(selectionError.message) : "课程选择失败";
      setManualError(errorMessage);
      throw selectionError;
    } finally { setPendingAction(false); }
  }, [reloadStructuredSession]);

  const prepareCourseBrief = useCallback(async (input: { planningMessageId: string; sourceCourseId?: string; requestedAdjustments?: string; referenceMaterialIntent: "none" | "upload_in_creator" }, context: AssistantContextSnapshot) => {
    if (["streaming", "submitted"].includes(chatApiRef.current.current().status)) throw new Error("Assistant 正在处理另一项请求");
    setPendingAction(true); setManualError("");
    try {
      const result = await prepareAssistantCourseBrief({ ...input, context });
      await reloadStructuredSession(result.sessionId);
    } catch (creationError) {
      const errorMessage = creationError instanceof Error ? friendlyError(creationError.message) : "创建需求整理失败";
      setManualError(errorMessage);
      throw creationError;
    } finally { setPendingAction(false); }
  }, [reloadStructuredSession]);

  const recordAction = useCallback(async (input: { kind: "micro-completed" | "micro-opened" | "route-started" | "segment-cleared" | "practice-opened" | "practice-submitted"; pathId?: string; knowledgeId?: string; courseId?: string; assignmentId?: string; attemptId?: string; resuming?: boolean; forceNewSession?: boolean }, context: AssistantContextSnapshot) => {
    const sessionId = input.forceNewSession ? null : sessionIdRef.current;
    const createsNew = input.forceNewSession === true || ((window.localStorage.getItem(newChatKey) === "1") && (input.kind === "practice-opened" || input.kind === "micro-opened"));
    try {
      const result = await recordAssistantButtonAction({
        ...input, sessionId,
        createSession: createsNew,
        context
      });
      // A delayed action from before "New conversation" must not resurrect the
      // old thread. The new-chat marker only yields to a newly created thread.
      const stillWanted = createsNew || !window.localStorage.getItem(newChatKey) || result.sessionId === sessionIdRef.current;
      if (result.sessionId && stillWanted) {
        if (result.sessionId !== sessionIdRef.current) rememberSession(result.sessionId);
        if (result.message) {
          await loadSession(result.sessionId);
          await reloadSessions();
        }
      }
    } catch {
      // A template reply is a convenience; the learning mutation already succeeded.
    }
  }, [loadSession, reloadSessions, rememberSession]);

  const messages = useMemo(() => chat.messages.map((message) => toLegacy(message, activeSessionId)), [activeSessionId, chat.messages]);
  const sending = pendingAction || pendingReply || chat.status === "streaming" || chat.status === "submitted";
  const error = manualError
    || (chat.error ? friendlyError(chat.error.message) : "")
    || (chat.status === "error" ? "网络连接中断，回复没有完成。请重试。" : "");

  const value = useMemo<RuntimeValue>(() => ({
    session, sessions, activeSessionId, chatMessages: chat.messages, messages, loading, sending, error,
    selectSession, send, retry, planGoal, refineGoal, useExistingCourse, prepareCourseBrief, recordAction, reloadSessions
  }), [activeSessionId, chat.messages, error, loading, messages, planGoal, prepareCourseBrief, recordAction, refineGoal, reloadSessions, retry, selectSession, send, sending, session, sessions, useExistingCourse]);

  return <AssistantRuntimeContext.Provider value={value}>{children}</AssistantRuntimeContext.Provider>;
}

export function useAssistantRuntime() {
  const value = useContext(AssistantRuntimeContext);
  if (!value) throw new Error("AssistantRuntimeProvider is missing");
  return value;
}
