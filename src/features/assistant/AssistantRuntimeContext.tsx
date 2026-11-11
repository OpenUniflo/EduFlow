import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MockSession } from "@/features/auth/types";
import { supabaseClient } from "@/shared/api/supabaseClient";
import type { AssistantContextSnapshot, AssistantMessage, AssistantSession, AssistantStructuredContent, AssistantTimelinePart } from "./assistantContract";
import { deleteAssistantSession, getAssistantSession, listAssistantSessions, planAssistantGoal, prepareAssistantCourseBrief, refineAssistantGoal, renameAssistantSession, selectAssistantCourse } from "./assistantClient";
import { ApiRequestError, apiRequest } from "@/shared/api/apiClient";
import { refreshLearnerState } from "@/app/services/applicationServices";

type AssistantMetadata = {
  createdAt?: string;
  messageKind?: "utterance" | "action" | "goal_clarification";
  /** Stable server action identity (micro-completed, practice-evaluated, …). */
  dedupeKey?: string;
  invalidReason?: string;
  stopped?: boolean;
  /** The server persisted a failed generation; partial text/cards stay visible. */
  failedReason?: string;
  structuredContent?: AssistantStructuredContent;
  context?: AssistantContextSnapshot;
};

export type AssistantUIMessage = UIMessage<AssistantMetadata>;

export type SessionActionResult = { ok: true } | { ok: false; code: string; message: string };

type RuntimeValue = {
  session: MockSession;
  sessions: AssistantSession[];
  activeSessionId: string | null;
  activeSessionTitle: string;
  sessionsHasMore: boolean;
  sessionsQuery: string;
  sessionsLoadingMore: boolean;
  searchSessions(query: string): Promise<void>;
  loadMoreSessions(): Promise<void>;
  renameSession(sessionId: string, title: string): Promise<SessionActionResult>;
  deleteSession(sessionId: string): Promise<SessionActionResult>;
  /** Ordered AI SDK parts used by the Home timeline. */
  chatMessages: AssistantUIMessage[];
  /** Legacy projection kept for panels that read plain text + structured cards. */
  messages: AssistantMessage[];
  loading: boolean;
  sending: boolean;
  /** A model reply is actively streaming (or awaiting its first chunk). */
  replying: boolean;
  error: string;
  selectSession(sessionId: string | null): Promise<void>;
  send(message: string, context: AssistantContextSnapshot, extras?: AssistantSendExtras): Promise<boolean>;
  stop(): Promise<void>;
  retry(): Promise<boolean>;
  planGoal(goalText: string, context: AssistantContextSnapshot): Promise<boolean>;
  refineGoal(planningMessageId: string, refinement: string, context: AssistantContextSnapshot): Promise<void>;
  useExistingCourse(planningMessageId: string, courseId: string, context: AssistantContextSnapshot): Promise<string>;
  prepareCourseBrief(input: { planningMessageId: string; sourceCourseId?: string; requestedAdjustments?: string; referenceMaterialIntent: "none" | "upload_in_creator" }, context: AssistantContextSnapshot): Promise<void>;
  reloadSessions(): Promise<AssistantSession[]>;
};

export type AssistantSendAttachment = { id: string; name: string };
export type AssistantSendExtras = {
  attachments?: AssistantSendAttachment[];
  draft?: { note?: string; link?: string };
  mentions?: string[];
  links?: string[];
};

const AssistantRuntimeContext = createContext<RuntimeValue | null>(null);

const allowedPartTypes = new Set(["text", "tool-displayCard", "data-tool-progress", "data-follow-ups", "data-attachment", "data-write-result", "data-failed"]);

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
      ...(message.dedupeKey ? { dedupeKey: message.dedupeKey } : {}),
      ...(message.invalidReason ? { invalidReason: message.invalidReason } : {}),
      ...(message.stopped ? { stopped: true } : {}),
      ...(message.failedReason ? { failedReason: message.failedReason } : {}),
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
    ...(message.metadata?.dedupeKey ? { dedupeKey: message.metadata.dedupeKey } : {}),
    ...(message.metadata?.invalidReason ? { invalidReason: message.metadata.invalidReason } : {}),
    ...(message.metadata?.stopped ? { stopped: true } : {}),
    ...(message.metadata?.failedReason ? { failedReason: message.metadata.failedReason } : {}),
    ...(message.metadata?.structuredContent ? { structuredContent: message.metadata.structuredContent } : {}),
    parts,
    context: message.metadata?.context ?? { workspace: "learning", experienceMode: "learn" },
    createdAt: message.metadata?.createdAt ?? new Date().toISOString()
  };
}

function hasVisibleReply(message: AssistantUIMessage | undefined): boolean {
  if (!message) return false;
  return (message.parts ?? []).some((part) => (
    (part.type === "text" && Boolean((part as { text?: string }).text?.trim())) || part.type === "tool-displayCard"
  ));
}

export const ASSISTANT_REPLY_FAILURE = "回复没有完成，请重试。";
export const ASSISTANT_NO_REPLY = "没有回答，可重试。";

/** One learner-facing failure wording; the retry control is the only next step. */
function friendlyError(_message: string): string {
  return ASSISTANT_REPLY_FAILURE;
}

/** Operation rows are never rendered; structured Brief/Search rows stay. */
function visibleMessages(messages: AssistantMessage[]): AssistantMessage[] {
  return messages.filter((message) => message.messageKind !== "action" || Boolean(message.structuredContent));
}

export function AssistantRuntimeProvider({ session, children }: { session: MockSession; children: ReactNode }) {
  const storageKey = `eduflow:assistant:active:${session.userId}`;
  const newChatKey = `eduflow:assistant:new:${session.userId}`;
  const [sessions, setSessions] = useState<AssistantSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => window.localStorage.getItem(storageKey));
  const [activeSessionTitle, setActiveSessionTitle] = useState("");
  const [sessionsHasMore, setSessionsHasMore] = useState(false);
  const [sessionsQuery, setSessionsQuery] = useState("");
  const [sessionsLoadingMore, setSessionsLoadingMore] = useState(false);
  const sessionsRef = useRef<AssistantSession[]>([]);
  const sessionsQueryRef = useRef("");
  const sessionsCursorRef = useRef<string | null>(null);
  const historyEpochRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);
  const [manualError, setManualError] = useState("");
  const [clarificationMessageId, setClarificationMessageId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(activeSessionId);
  const lastContextRef = useRef<AssistantContextSnapshot>({ workspace: "learning", experienceMode: "learn" });
  const sendExtrasRef = useRef<AssistantSendExtras>({});
  const lastMessageRef = useRef("");
  const lastSendOkRef = useRef(false);
  const chatRef = useRef<ReturnType<typeof useChat<AssistantUIMessage>> | null>(null);
  const chatApiRef = useRef<{ setMessages: ReturnType<typeof useChat<AssistantUIMessage>>["setMessages"]; current: () => ReturnType<typeof useChat<AssistantUIMessage>> }>(null!);
  /**
   * The stop marker is local until the server has persisted the aborted turn.
   * An empty assistant shell is removed; the marker then belongs to the user
   * turn, which is the row that survives a stop before the first token.
   */
  const markStoppedLocally = useCallback(() => {
    if (streamSessionRef.current !== sessionIdRef.current) return;
    chatApiRef.current.setMessages((messages) => {
      if (!messages.length) return messages;
      const next = [...messages];
      const last = next[next.length - 1];
      if (last.role === "assistant") {
        if (hasVisibleReply(last)) {
          next[next.length - 1] = { ...last, metadata: { ...last.metadata, stopped: true } };
          return next;
        }
        next.pop();
      }
      for (let index = next.length - 1; index >= 0; index -= 1) {
        if (next[index].role !== "user") continue;
        next[index] = { ...next[index], metadata: { ...next[index].metadata, stopped: true } };
        break;
      }
      return next;
    });
  }, []);
  const newChatEpoch = useRef(0);
  const stoppedRef = useRef(false);
  const streamSessionRef = useRef<string | null>(null);
  const sessionEpochRef = useRef(0);
  const streamEpochRef = useRef(0);
  const sendAbortRef = useRef<AbortController | null>(null);
  const pendingSendRef = useRef(false);
  const retryTargetRef = useRef<{ userId: string; assistantMessageId?: string } | null>(null);

  const rememberSession = useCallback((sessionId: string | null) => {
    sessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    if (sessionId) {
      const known = sessionsRef.current.find((item) => item.id === sessionId);
      setActiveSessionTitle(known?.title ?? "");
      window.localStorage.setItem(storageKey, sessionId);
      window.localStorage.removeItem(newChatKey);
    } else {
      setActiveSessionTitle("");
      window.localStorage.removeItem(storageKey);
    }
  }, [newChatKey, storageKey]);

  /**
   * The server creates the session before it sends the first byte. Show that
   * row immediately so the conversation the learner just started is visible and
   * highlighted while the reply is still streaming; the finished reply replaces
   * it with the server's canonical page.
   */
  const rememberCreatedSession = useCallback((sessionId: string, title: string) => {
    if (sessionsRef.current.some((item) => item.id === sessionId)) return;
    const now = new Date().toISOString();
    const session = { id: sessionId, title: title.slice(0, 80).trim() || "新对话", createdAt: now, updatedAt: now, hasCourse: false };
    const next = [session, ...sessionsRef.current];
    sessionsRef.current = next;
    setSessions(next);
  }, []);

  const transport = useMemo(() => new DefaultChatTransport<AssistantUIMessage>({
    api: "/api/assistant",
    headers: async () => {
      const { data } = await supabaseClient.auth.getSession();
      return (data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) as Record<string, string>;
    },
    body: () => ({
      sessionId: sessionIdRef.current ?? undefined,
      context: lastContextRef.current,
      ...(sendExtrasRef.current.attachments?.length ? { attachments: sendExtrasRef.current.attachments.map((attachment) => attachment.id) } : {}),
      ...(sendExtrasRef.current.draft ? { draft: sendExtrasRef.current.draft } : {}),
      ...(sendExtrasRef.current.mentions?.length ? { mentions: sendExtrasRef.current.mentions } : {}),
      ...(sendExtrasRef.current.links?.length ? { links: sendExtrasRef.current.links } : {}),
      ...(retryTargetRef.current ? { retry: retryTargetRef.current } : {})
    }),
    fetch: async (input, init) => {
      // The chat only exposes its own abort controller once response headers
      // arrive. Keep a transport-level controller so "stop" also covers the
      // short window while the request is still in flight.
      const requestAbort = new AbortController();
      sendAbortRef.current = requestAbort;
      const upstreamSignal = init?.signal;
      const forwardAbort = () => requestAbort.abort(upstreamSignal?.reason);
      if (upstreamSignal?.aborted) forwardAbort();
      else upstreamSignal?.addEventListener("abort", forwardAbort, { once: true });
      try {
        const response = await fetch(input, { ...init, signal: requestAbort.signal });
        const createdSessionId = response.headers.get("X-Assistant-Session-Id");
        if (createdSessionId && streamEpochRef.current === sessionEpochRef.current) {
          const isNewConversation = sessionIdRef.current == null;
          streamSessionRef.current = createdSessionId;
          if (isNewConversation) {
            const title = lastMessageRef.current.slice(0, 80).trim() || "新对话";
            rememberCreatedSession(createdSessionId, title);
            setActiveSessionTitle(title);
          }
          rememberSession(createdSessionId);
        }
        return response;
      } finally {
        upstreamSignal?.removeEventListener("abort", forwardAbort);
        if (sendAbortRef.current === requestAbort) sendAbortRef.current = null;
      }
    }
  }), [rememberCreatedSession, rememberSession]);

  const chat = useChat<AssistantUIMessage>({
    id: `assistant-${session.userId}`,
    transport,
    throttle: 40,
    onError: (error) => {
      // An aborted request is not a provider failure and must never retry.
      if (stoppedRef.current) return;
      setManualError(friendlyError(error.message));
    },
    onFinish: ({ isAbort }) => {
      if (stoppedRef.current || isAbort) {
        stoppedRef.current = true;
        setManualError("");
        markStoppedLocally();
        return;
      }
      void reloadSessions().catch(() => undefined);
      const last = chatRef.current?.messages[chatRef.current.messages.length - 1];
      const hasText = Boolean(last?.parts?.some((part) => part.type === "text" && (part as { text?: string }).text?.trim()));
      const hasCard = Boolean(last?.parts?.some((part) => part.type === "tool-displayCard"));
      const failed = Boolean(last?.parts?.some((part) => part.type === "data-failed"));
      if (!last || last.role !== "assistant" || failed || (!hasText && !hasCard)) {
        // The failed turn renders its own inline reason and retry control; a
        // second page-level banner would duplicate it.
        setManualError("");
        return;
      }
      lastSendOkRef.current = true;
    }
  });
  chatRef.current = chat;
  chatApiRef.current = { setMessages: chat.setMessages, current: () => chatRef.current! };

  // Every write tool emits one structured result part. The client reacts to
  // that part, never to the model's prose or a particular tool name.
  const handledWriteResults = useRef(new Set<string>());
  useEffect(() => {
    for (const message of chat.messages) {
      for (const part of message.parts ?? []) {
        if (part.type !== "data-write-result" || !part.data || typeof part.data !== "object") continue;
        const data = part.data as {
          id?: string; ok?: boolean; title?: string; card?: { courseId?: string; assignmentId?: string };
          attemptId?: string; evaluationPending?: boolean;
        };
        if (!data.id || handledWriteResults.current.has(data.id)) continue;
        handledWriteResults.current.add(data.id);
        window.dispatchEvent(new CustomEvent("eduflow:write-result", { detail: data }));
        void refreshLearnerState(session.userId).catch(() => undefined);
        if (data.evaluationPending && data.attemptId && data.card?.courseId && data.card.assignmentId) {
          const { courseId, assignmentId } = data.card;
          void apiRequest("/api/learning", {
            method: "POST",
            body: JSON.stringify({ action: "evaluate-assignment", courseId, assignmentId, attemptId: data.attemptId }),
            keepalive: true
          }).then(async () => {
            await refreshLearnerState(session.userId).catch(() => undefined);
            window.dispatchEvent(new CustomEvent("eduflow:write-result", { detail: data }));
          }).catch(() => undefined);
        }
      }
    }
  }, [chat.messages, session.userId]);

  const handledToolEvents = useRef(new Set<string>());
  useEffect(() => {
    for (const message of chat.messages) {
      for (const part of message.parts ?? []) {
        const source = part as { type?: string; toolCallId?: string; state?: string; output?: Record<string, unknown> };
        if (source.state !== "output-available" || !source.output) continue;
        const key = source.toolCallId ?? `${source.type}:${String(source.output.attemptId ?? source.output.panel ?? "")}`;
        if (handledToolEvents.current.has(key)) continue;
        if (source.type === "tool-openWorkspacePanel" && source.output.status === "opened") {
          handledToolEvents.current.add(key);
          window.dispatchEvent(new CustomEvent("eduflow:open-panel", { detail: source.output }));
        }
      }
    }
  }, [chat.messages, session.userId]);

  const reloadSessions = useCallback(async () => {
    const page = await listAssistantSessions({ q: sessionsQueryRef.current });
    setSessions(page.sessions);
    sessionsRef.current = page.sessions;
    sessionsCursorRef.current = page.nextCursor;
    setSessionsHasMore(page.hasMore);
    const active = page.sessions.find((item) => item.id === sessionIdRef.current);
    if (active) setActiveSessionTitle(active.title ?? "");
    return page.sessions;
  }, []);

  const searchSessions = useCallback(async (query: string) => {
    const nextQuery = query.trim();
    sessionsQueryRef.current = nextQuery;
    setSessionsQuery(nextQuery);
    historyEpochRef.current += 1;
    const epoch = historyEpochRef.current;
    setSessionsLoadingMore(false);
    loadingMoreRef.current = false;
    const page = await listAssistantSessions({ q: nextQuery });
    if (epoch !== historyEpochRef.current) return;
    setSessions(page.sessions);
    sessionsRef.current = page.sessions;
    sessionsCursorRef.current = page.nextCursor;
    setSessionsHasMore(page.hasMore);
  }, []);

  const loadMoreSessions = useCallback(async () => {
    const cursor = sessionsCursorRef.current;
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setSessionsLoadingMore(true);
    try {
      const page = await listAssistantSessions({ q: sessionsQueryRef.current, cursor });
      const seen = new Set(sessionsRef.current.map((item) => item.id));
      const merged = [...sessionsRef.current, ...page.sessions.filter((item) => !seen.has(item.id))];
      setSessions(merged);
      sessionsRef.current = merged;
      sessionsCursorRef.current = page.nextCursor;
      setSessionsHasMore(page.hasMore);
    } finally {
      loadingMoreRef.current = false;
      setSessionsLoadingMore(false);
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    const detail = await getAssistantSession(sessionId);
    rememberSession(sessionId);
    setActiveSessionTitle(detail.title ?? "");
    chatApiRef.current.setMessages(visibleMessages(detail.messages).map(toUIMessage));
    return detail;
  }, [rememberSession]);

  const selectSession = useCallback(async (sessionId: string | null) => {
    setManualError("");
    setClarificationMessageId(null);
    // Switching during a reply aborts it in the old conversation. The user
    // turn is already persisted there; the server writes the stopped marker.
    const active = chatApiRef.current.current();
    if (sendAbortRef.current != null || active.status === "streaming" || active.status === "submitted") {
      stoppedRef.current = true;
      sendAbortRef.current?.abort();
      try { await active.stop(); } catch { /* the switch still proceeds */ }
      markStoppedLocally();
    }
    sessionEpochRef.current += 1;
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
      setActiveSessionTitle(detail.title ?? "");
      chatApiRef.current.setMessages(visibleMessages(detail.messages).map(toUIMessage));
    }
    catch (loadError) {
      rememberSession(null);
      chatApiRef.current.setMessages([]);
      setManualError(loadError instanceof Error ? friendlyError(loadError.message) : "对话加载失败");
    } finally { setLoading(false); }
  }, [newChatKey, rememberSession]);

  const sessionError = useCallback((error: unknown, fallback: string): SessionActionResult => {
    const code = error instanceof ApiRequestError ? error.code ?? "request_failed" : "request_failed";
    if (code === "assistant_session_has_course") return { ok: false, code, message: "这个对话创建了一门课程，不能删除" };
    if (code === "assistant_session_not_found") return { ok: false, code, message: "这个对话不存在或已被删除" };
    if (code === "invalid_session_title") return { ok: false, code, message: "标题不能为空，且不能超过 80 个字符" };
    return { ok: false, code, message: fallback };
  }, []);

  const renameSession = useCallback(async (sessionId: string, title: string): Promise<SessionActionResult> => {
    try {
      const result = await renameAssistantSession(sessionId, title);
      const merged = sessionsRef.current.map((item) => item.id === sessionId ? { ...item, ...result.session } : item);
      setSessions(merged);
      sessionsRef.current = merged;
      if (sessionIdRef.current === sessionId) setActiveSessionTitle(result.session.title ?? "");
      return { ok: true };
    } catch (error) {
      return sessionError(error, "重命名失败，请重试。");
    }
  }, [sessionError]);

  const deleteSession = useCallback(async (sessionId: string): Promise<SessionActionResult> => {
    const active = sessionIdRef.current === sessionId;
    if (active) {
      const api = chatApiRef.current.current();
      if (sendAbortRef.current != null || api.status === "streaming" || api.status === "submitted") {
        // Reuse the stage C stop path, then give the server a moment to persist
        // the stopped turn before the session row disappears underneath it.
        stoppedRef.current = true;
        setManualError("");
        sendAbortRef.current?.abort();
        try { await api.stop(); } catch { /* the abort still ends the stream */ }
        markStoppedLocally();
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
    }
    try {
      await deleteAssistantSession(sessionId);
    } catch (error) {
      return sessionError(error, "删除失败，请重试。");
    }
    const list = sessionsRef.current;
    const index = list.findIndex((item) => item.id === sessionId);
    let next = active ? list[index + 1] ?? list[index - 1] ?? null : null;
    if (active && !next) {
      try {
        const page = await listAssistantSessions({});
        next = page.sessions.find((item) => item.id !== sessionId) ?? null;
      } catch { /* a fresh conversation is still a valid empty state */ }
    }
    const remaining = list.filter((item) => item.id !== sessionId);
    setSessions(remaining);
    sessionsRef.current = remaining;
    if (active) {
      if (next) await selectSession(next.id);
      else await selectSession(null);
    }
    void reloadSessions().catch(() => undefined);
    return { ok: true };
  }, [markStoppedLocally, reloadSessions, selectSession, sessionError]);

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

  const send = useCallback(async (content: string, context: AssistantContextSnapshot, extras: AssistantSendExtras = {}) => {
    const message = content.trim();
    const api = chatApiRef.current.current();
    if (!message || pendingSendRef.current || api.status === "streaming" || api.status === "submitted") return false;
    setManualError("");
    lastContextRef.current = context;
    sendExtrasRef.current = extras;
    lastMessageRef.current = message;
    lastSendOkRef.current = false;
    stoppedRef.current = false;
    streamSessionRef.current = sessionIdRef.current;
    streamEpochRef.current = sessionEpochRef.current;
    pendingSendRef.current = true;
    setPendingSend(true);
    try {
      await api.sendMessage({ text: message }, { body: { context } });
      if (stoppedRef.current) return false;
      // A background session-list refresh is secondary and must never turn a
      // successful answer into a page-level load failure.
      await reloadSessions().catch(() => undefined);
      return lastSendOkRef.current;
    } catch (sendError) {
      if (stoppedRef.current) return false;
      setManualError(sendError instanceof Error ? friendlyError(sendError.message) : ASSISTANT_REPLY_FAILURE);
      return false;
    } finally {
      pendingSendRef.current = false;
      sendExtrasRef.current = {};
      setPendingSend(false);
    }
  }, [reloadSessions]);

  const stop = useCallback(async () => {
    const api = chatApiRef.current.current();
    const pending = sendAbortRef.current != null && api.status !== "streaming" && api.status !== "submitted";
    if (!pending && api.status !== "streaming" && api.status !== "submitted") return;
    stoppedRef.current = true;
    setManualError("");
    // Give the already-created request a brief chance to reach the server so
    // its user turn is persisted, then abort before the model can answer.
    if (pending) await new Promise((resolve) => window.setTimeout(resolve, 80));
    sendAbortRef.current?.abort();
    try { await api.stop(); } catch { /* the abort still ends the stream */ }
    markStoppedLocally();
  }, [markStoppedLocally]);

  const retry = useCallback(async () => {
    setManualError("");
    const messages = chatApiRef.current.current().messages;
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    if (!lastUser) return false;
    retryTargetRef.current = {
      userId: lastUser.id,
      ...(lastAssistant?.id ? { assistantMessageId: lastAssistant.id } : {})
    };
    try {
      // Regenerate the same turn; the server reuses its user row and replaces
      // the failed assistant row, so a reload never shows a duplicate.
      await chatApiRef.current.current().regenerate();
      return true;
    } catch {
      return false;
    } finally {
      retryTargetRef.current = null;
    }
  }, []);

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

  const messages = useMemo(() => chat.messages.map((message) => toLegacy(message, activeSessionId)), [activeSessionId, chat.messages]);
  const replying = pendingSend || chat.status === "streaming" || chat.status === "submitted";
  // `sending` is current-page activity only. A persisted user turn without an
  // assistant row is a failure, not an in-flight reply.
  const sending = pendingAction || replying;
  const error = manualError
    || (chat.error ? friendlyError(chat.error.message) : "")
    || (chat.status === "error" ? ASSISTANT_REPLY_FAILURE : "");

  const value = useMemo<RuntimeValue>(() => ({
    session, sessions, activeSessionId, activeSessionTitle, sessionsHasMore, sessionsQuery, sessionsLoadingMore,
    chatMessages: chat.messages, messages, loading, sending, replying, error,
    selectSession, searchSessions, loadMoreSessions, renameSession, deleteSession,
    send, stop, retry, planGoal, refineGoal, useExistingCourse, prepareCourseBrief, reloadSessions
  }), [activeSessionId, activeSessionTitle, chat.messages, deleteSession, error, loadMoreSessions, loading, messages, planGoal, prepareCourseBrief, refineGoal, reloadSessions, renameSession, replying, retry, searchSessions, selectSession, send, sending, session, sessions, sessionsHasMore, sessionsLoadingMore, sessionsQuery, stop, useExistingCourse]);

  return <AssistantRuntimeContext.Provider value={value}>{children}</AssistantRuntimeContext.Provider>;
}

export function useAssistantRuntime() {
  const value = useContext(AssistantRuntimeContext);
  if (!value) throw new Error("AssistantRuntimeProvider is missing");
  return value;
}
