import type { SupabaseClient } from "@supabase/supabase-js";
import { cardHistoryLabel, type AssistantCardRef } from "../../src/features/assistant/assistantCards.js";
import { hasAssistantProtocolLeak, visibleAssistantContent, type AssistantHistoryRow } from "../../src/features/assistant/protocolGuard.js";
import { dataOrThrow } from "./query.js";
import { readNavigationDecision } from "./navigationDecision.js";
import { firstChapterFinished, readCourseSegment } from "./firstSegmentRead.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const optionalText = (row: Row, key: string) => row[key] == null ? undefined : String(row[key]);

export type TimelineTextPart = { type: "text"; text: string };
export type TimelineCardPart = {
  type: "tool-displayCard";
  toolCallId: string;
  state: "output-available";
  input: AssistantCardRef;
  output: { card: AssistantCardRef };
};
export type TimelinePart = TimelineTextPart | TimelineCardPart | { type: string; [key: string]: unknown };

function isCardPart(part: unknown): part is TimelineCardPart {
  if (!part || typeof part !== "object" || Array.isArray(part)) return false;
  const source = part as Row;
  return source.type === "tool-displayCard" && Boolean(source.output) && typeof source.output === "object" && Boolean((source.output as Row).card);
}

/** Persist only object references for a card part. Display data is rebuilt. */
export function persistedParts(parts: readonly unknown[]): TimelinePart[] {
  const output: TimelinePart[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    const source = part as Row;
    if (source.type === "text") {
      const value = typeof source.text === "string" ? source.text : "";
      if (!value) continue;
      if (hasAssistantProtocolLeak(value)) throw new Error("Assistant protocol text cannot be persisted");
      output.push({ type: "text", text: value });
      continue;
    }
    if (isCardPart(part)) {
      const card = (source.output as Row).card as AssistantCardRef;
      output.push({
        type: "tool-displayCard",
        toolCallId: String(source.toolCallId ?? crypto.randomUUID()),
        state: "output-available",
        input: card,
        output: { card }
      });
    }
  }
  return output;
}

/** API response parts: persisted parts, or a synthetic text part for legacy rows. */
export function timelineParts(row: Row): TimelinePart[] {
  const raw = row.parts;
  if (Array.isArray(raw)) {
    const parts: TimelinePart[] = [];
    for (const part of raw) {
      if (!part || typeof part !== "object" || Array.isArray(part)) continue;
      const source = part as Row;
      if (source.type === "text") {
        const value = String(source.text ?? "");
        parts.push({ type: "text", text: row.role === "assistant" ? visibleAssistantContent({ role: "assistant", content: value, invalid_reason: row.invalid_reason }) : value });
        continue;
      }
      if (isCardPart(part)) {
        const card = (source.output as Row).card;
        parts.push({ type: "tool-displayCard", toolCallId: String(source.toolCallId ?? ""), state: "output-available", input: card as AssistantCardRef, output: { card: card as AssistantCardRef } });
      }
    }
    if (parts.length) return parts;
  }
  return [{ type: "text", text: visibleAssistantContent(row as unknown as AssistantHistoryRow) }];
}

/** Compact model history: text plus card *labels*, never card payloads. */
export function compactModelContent(row: Row): string {
  let content = String(row.content ?? "");
  const parts = Array.isArray(row.parts) ? row.parts : [];
  const labels = parts.filter(isCardPart).map((part) => cardHistoryLabel(part.output.card));
  if (labels.length) content += `\n[此回复展示的卡片：${[...new Set(labels)].join("、")}]`;
  return content;
}

export async function touchSession(client: SupabaseClient, sessionId: string) {
  await client.from("assistant_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
}

/**
 * Insert an assistant row once per dedupe key. A client retry or a repeated
 * evaluation write must not duplicate the timeline entry.
 */
export async function insertAssistantRowOnce(client: SupabaseClient, row: Row): Promise<Row | null> {
  const key = typeof row.dedupe_key === "string" ? row.dedupe_key : null;
  if (key) {
    const existing = await client.from("assistant_messages").select("*").eq("dedupe_key", key).maybeSingle();
    const found = dataOrThrow(existing.data as Row | null, existing.error, "Assistant timeline dedupe lookup");
    if (found) return found;
  }
  const write = await client.from("assistant_messages").insert(row).select("*").single();
  if (write.error?.code === "23505" && key) {
    const existing = await client.from("assistant_messages").select("*").eq("dedupe_key", key).maybeSingle();
    return dataOrThrow(existing.data as Row | null, existing.error, "Assistant timeline dedupe retry");
  }
  return dataOrThrow(write.data as Row | null, write.error, "Assistant timeline write");
}

export async function ownedAssistantSession(client: SupabaseClient, userId: string, sessionId: unknown): Promise<Row | null> {
  if (typeof sessionId !== "string" || !sessionId.trim()) return null;
  const result = await client.from("assistant_sessions").select("id,user_id").eq("id", sessionId.trim()).eq("user_id", userId).maybeSingle();
  return dataOrThrow(result.data as Row | null, result.error, "Assistant action session ownership");
}

async function latestAssistantSession(client: SupabaseClient, userId: string): Promise<Row | null> {
  const result = await client.from("assistant_sessions").select("id,user_id").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return dataOrThrow(result.data as Row | null, result.error, "Assistant latest session lookup");
}

async function resolveThread(client: SupabaseClient, userId: string, requested: unknown): Promise<string | null> {
  const owned = await ownedAssistantSession(client, userId, requested);
  if (owned) return String(owned.id);
  const latest = await latestAssistantSession(client, userId);
  return latest ? String(latest.id) : null;
}

async function createAssistantSession(client: SupabaseClient, userId: string, title: string): Promise<string | null> {
  const created = await client.from("assistant_sessions").insert({ user_id: userId, title: title.slice(0, 80) }).select("id").single();
  const row = dataOrThrow(created.data as Row | null, created.error, "Assistant session creation");
  return row ? String(row.id) : null;
}

/**
 * Submission fallback: an Attempt always gets an owned thread. If the client
 * had no active conversation, reuse the most recent owned session or create
 * one. Linking and the submitted template are idempotent by Attempt.
 */
export async function ensureAttemptAssistantSession(client: SupabaseClient, userId: string, input: {
  attemptId: string; courseId: string; assignmentId: string; requestedSessionId?: string | null; context?: Row;
}): Promise<string | null> {
  const attemptResult = await client.from("learning_attempts")
    .select("id,assistant_session_id")
    .eq("id", input.attemptId).eq("user_id", userId).maybeSingle();
  const attempt = dataOrThrow(attemptResult.data as Row | null, attemptResult.error, "Attempt assistant session lookup");
  if (!attempt) return null;
  const linked = await ownedAssistantSession(client, userId, optionalText(attempt, "assistant_session_id"));
  const requested = linked ? null : await ownedAssistantSession(client, userId, input.requestedSessionId);
  let sessionId = linked ? String(linked.id) : requested ? String(requested.id) : null;
  if (!sessionId) {
    const latest = await latestAssistantSession(client, userId);
    sessionId = latest ? String(latest.id) : null;
  }
  if (!sessionId) sessionId = await createAssistantSession(client, userId, "继续学习");
  if (!sessionId) return null;
  if (!linked) {
    const update = await client.from("learning_attempts").update({ assistant_session_id: sessionId }).eq("id", input.attemptId).eq("user_id", userId).is("assistant_session_id", null);
    dataOrThrow(update.data, update.error, "Attempt assistant session fallback link");
  }
  await recordButtonAction(client, userId, {
    kind: "practice-submitted", sessionId, courseId: input.courseId,
    assignmentId: input.assignmentId, attemptId: input.attemptId, context: input.context ?? {}
  });
  return sessionId;
}

/**
 * Server-owned, idempotent reply for a button action. No model call.
 * The caller has already performed and validated the learning mutation.
 */
export async function recordButtonAction(client: SupabaseClient, userId: string, body: Row): Promise<{ sessionId: string | null; message: Row | null }> {
  const kind = String(body.kind ?? "");
  if (!["micro-completed", "micro-opened", "route-started", "segment-cleared", "practice-opened", "practice-submitted", "practice-evaluation"].includes(kind)) throw new Error("Unsupported assistant action event");
  let sessionId = body.createSession === true
    ? null
    : await resolveThread(client, userId, body.sessionId);

  if (kind === "route-started") {
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const configResult = await client.from("home_mainline_config").select("starter_course_id").eq("id", "default").maybeSingle();
    const config = dataOrThrow(configResult.data as Row | null, configResult.error, "Home starter config");
    const configuredCourseId = config ? optionalText(config, "starter_course_id") : undefined;
    if (!courseId || configuredCourseId !== courseId) return { sessionId: null, message: null };
    const courseResult = await client.from("courses").select("id,title,lifecycle").eq("id", courseId).maybeSingle();
    const course = dataOrThrow(courseResult.data as Row | null, courseResult.error, "Home starter Course");
    if (!course || text(course, "lifecycle") !== "published") return { sessionId: null, message: null };
    if (!sessionId) {
      const created = await client.from("assistant_sessions").insert({ user_id: userId, title: "带我从最简单的开始" }).select("id").single();
      const row = dataOrThrow(created.data as Row | null, created.error, "Starter conversation creation");
      sessionId = row ? String(row.id) : null;
    }
    if (!sessionId) return { sessionId: null, message: null };
    const reply = "好，我们从最简单的开始。先把这几个小练习走完，再动手试一次；每一步都可以在这里完成。";
    const card = { cardType: "route" as const, courseId };
    const userRow = await insertAssistantRowOnce(client, {
      session_id: sessionId, role: "user", message_kind: "action",
      content: "带我从最简单的开始",
      parts: [{ type: "text", text: "带我从最简单的开始" }],
      context_snapshot: body.context ?? {}, dedupe_key: `route-started:${sessionId}:${courseId}:user`
    });
    const message = await insertAssistantRowOnce(client, {
      session_id: sessionId, role: "assistant", message_kind: "action", content: reply,
      parts: [{ type: "text", text: reply }, { type: "tool-displayCard", toolCallId: crypto.randomUUID(), state: "output-available", input: card, output: { card } }],
      context_snapshot: body.context ?? {}, dedupe_key: `route-started:${sessionId}:${courseId}:assistant`
    });
    await touchSession(client, sessionId);
    return { sessionId, message: message ?? userRow };
  }

  if (!sessionId && (kind === "micro-opened" || kind === "practice-opened")) {
    sessionId = await createAssistantSession(client, userId, "继续学习");
  }
  if (!sessionId) return { sessionId: null, message: null };

  if (kind === "micro-opened") {
    const pathId = typeof body.pathId === "string" ? body.pathId : "";
    const courseId = typeof body.courseId === "string" && body.courseId ? body.courseId : undefined;
    const pathResult = await client.from("micro_learning_paths").select("id,knowledge_id,course_id,title,status,mode").eq("id", pathId).eq("status", "published").maybeSingle();
    const path = dataOrThrow(pathResult.data as Row | null, pathResult.error, "Assistant action Micro open lookup");
    if (!path) return { sessionId, message: null };
    const resuming = body.resuming === true;
    const reply = resuming ? `继续「${text(path, "title")}」。` : `先做「${text(path, "title")}」。`;
    const card = { cardType: "micro" as const, pathId, knowledgeId: text(path, "knowledge_id"), ...(courseId ?? optionalText(path, "course_id") ? { courseId: courseId ?? optionalText(path, "course_id") } : {}) };
    const message = await insertAssistantRowOnce(client, {
      session_id: sessionId, role: "assistant", message_kind: "action", content: reply,
      parts: [{ type: "text", text: reply }, { type: "tool-displayCard", toolCallId: crypto.randomUUID(), state: "output-available", input: card, output: { card } }],
      context_snapshot: body.context ?? {}, dedupe_key: `micro-opened:${sessionId}:${pathId}`
    });
    await touchSession(client, sessionId);
    return { sessionId, message };
  }

  if (kind === "segment-cleared") {
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId : "";
    const attemptResult = await client.from("learning_attempts").select("id").eq("user_id", userId).eq("course_id", courseId).eq("assignment_id", assignmentId).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
    const attempt = dataOrThrow(attemptResult.data as Row | null, attemptResult.error, "Segment summary Attempt lookup");
    if (!attempt) return { sessionId, message: null };
    const resultRow = await client.from("performance_results").select("outcome").eq("attempt_id", text(attempt, "id")).order("version", { ascending: false }).limit(1).maybeSingle();
    const outcome = text(dataOrThrow(resultRow.data as Row | null, resultRow.error, "Segment summary Result") ?? {}, "outcome");
    if (outcome !== "passed") return { sessionId, message: null };
    const read = await readCourseSegment(client, userId, courseId);
    if (!read.segment.complete) return { sessionId, message: null };
    const card = { cardType: "segment_summary" as const, courseId };
    const reply = "第一段完成了。这是你学到的内容；打开地图可以看完整的关系。";
    const message = await insertAssistantRowOnce(client, {
      session_id: sessionId, role: "assistant", message_kind: "action", content: reply,
      parts: [{ type: "text", text: reply }, { type: "tool-displayCard", toolCallId: crypto.randomUUID(), state: "output-available", input: card, output: { card } }],
      context_snapshot: body.context ?? {}, dedupe_key: `segment-cleared:${sessionId}:${courseId}:${assignmentId}`
    });
    await touchSession(client, sessionId);
    return { sessionId, message };
  }

  if (kind === "practice-opened") {
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId : "";
    const assignmentResult = await client.from("course_assignments").select("id,title").eq("course_id", courseId).eq("id", assignmentId).maybeSingle();
    const assignment = dataOrThrow(assignmentResult.data as Row | null, assignmentResult.error, "Assistant action Assignment lookup");
    if (!assignment) return { sessionId, message: null };
    const message = await insertAssistantRowOnce(client, {
      session_id: sessionId, role: "assistant", message_kind: "action",
      content: `动手任务已打开：${text(assignment, "title")}`,
      parts: [{ type: "text", text: `动手任务已打开：${text(assignment, "title")}` }],
      context_snapshot: body.context ?? {}, dedupe_key: `practice-opened:${sessionId}:${courseId}:${assignmentId}`
    });
    await touchSession(client, sessionId);
    return { sessionId, message };
  }

  if (kind === "micro-completed") {
    const pathId = typeof body.pathId === "string" ? body.pathId : "";
    const knowledgeId = typeof body.knowledgeId === "string" ? body.knowledgeId : "";
    const courseId = typeof body.courseId === "string" && body.courseId ? body.courseId : undefined;
    const [pathResult, progressResult, knowledgeResult] = await Promise.all([
      client.from("micro_learning_paths").select("id,title,knowledge_id,course_id,status").eq("id", pathId).maybeSingle(),
      client.from("user_micro_path_progress").select("status").eq("user_id", userId).eq("path_id", pathId).maybeSingle(),
      client.from("knowledge_nodes").select("id,title,status").eq("id", knowledgeId).eq("status", "active").maybeSingle()
    ]);
    const path = dataOrThrow(pathResult.data as Row | null, pathResult.error, "Assistant action Micro lookup");
    const progress = dataOrThrow(progressResult.data as Row | null, progressResult.error, "Assistant action Micro progress");
    const knowledge = dataOrThrow(knowledgeResult.data as Row | null, knowledgeResult.error, "Assistant action Knowledge lookup");
    if (!path || !knowledge || text(progress ?? {}, "status") !== "completed") return { sessionId, message: null };
    if (text(path, "knowledge_id") !== knowledgeId) return { sessionId, message: null };
    const cardCourseId = courseId ?? optionalText(path, "course_id");
    const cardRefs: AssistantCardRef[] = [{ cardType: "knowledge", nodeId: knowledgeId, pathId, ...(cardCourseId ? { courseId: cardCourseId } : {}) }];
    let nextTitle = "";
    if (courseId) {
      try {
        const decision = await readNavigationDecision(client, userId, courseId);
        if (decision.nextAction.resourceKind === "assignment" && decision.nextAction.resourceId) {
          const assignmentResult = await client.from("course_assignments").select("id,title").eq("course_id", courseId).eq("id", decision.nextAction.resourceId).maybeSingle();
          const assignment = dataOrThrow(assignmentResult.data as Row | null, assignmentResult.error, "Assistant action next Assignment");
          if (assignment) {
            cardRefs.push({ cardType: "practice", courseId, assignmentId: text(assignment, "id") });
            nextTitle = text(assignment, "title");
          }
        } else {
          const nextNodeId = decision.nextAction.nodeId;
          const nextPath = decision.nextAction.resourceKind === "micro" && decision.nextAction.resourceId
            ? await client.from("micro_learning_paths").select("id,title,knowledge_id,course_id,status").eq("id", decision.nextAction.resourceId).eq("status", "published").maybeSingle()
            : null;
          const nextPathRow = nextPath ? nextPath.data as Row | null : (nextNodeId
            ? (await client.from("micro_learning_paths").select("id,title,knowledge_id,course_id,status").eq("knowledge_id", nextNodeId).eq("status", "published").eq("mode", "learn").limit(1).maybeSingle()).data as Row | null
            : null);
          if (nextPathRow) {
            cardRefs.push({ cardType: "micro", pathId: text(nextPathRow, "id"), knowledgeId: text(nextPathRow, "knowledge_id"), ...(nextPathRow.course_id ? { courseId: text(nextPathRow, "course_id") } : {}) });
            nextTitle = text(nextPathRow, "title");
          }
        }
      } catch {
        // The navigation read is optional here: the completion reply still stands.
      }
    }
    const reply = nextTitle
      ? `做完了「${text(path, "title")}」。接着从这里继续。`
      : `做完了「${text(path, "title")}」。这一步的要点已经记下。`;
    const userRow = await insertAssistantRowOnce(client, {
      session_id: sessionId, role: "user", message_kind: "action",
      content: `完成小练习：${text(path, "title")}`,
      parts: [{ type: "text", text: `完成小练习：${text(path, "title")}` }],
      context_snapshot: body.context ?? {}, dedupe_key: `micro-completed:${sessionId}:${pathId}:user`
    });
    const message = await insertAssistantRowOnce(client, {
      session_id: sessionId, role: "assistant", message_kind: "action", content: reply,
      parts: [{ type: "text", text: reply }, ...cardRefs.map((card) => ({ type: "tool-displayCard", toolCallId: crypto.randomUUID(), state: "output-available", input: card, output: { card } }))],
      context_snapshot: body.context ?? {}, dedupe_key: `micro-completed:${sessionId}:${pathId}:assistant`
    });
    if (courseId) {
      try {
        const read = await readCourseSegment(client, userId, courseId);
        if (firstChapterFinished(read)) {
          const reply = "这一章的小练习都做完了。后面的章节目前以动手任务为主，部分章节还没有配套小练习；完整课程可以在路线里查看。";
          const card = { cardType: "route" as const, courseId };
          await insertAssistantRowOnce(client, {
            session_id: sessionId, role: "assistant", message_kind: "action", content: reply,
            parts: [{ type: "text", text: reply }, { type: "tool-displayCard", toolCallId: crypto.randomUUID(), state: "output-available", input: card, output: { card } }],
            context_snapshot: body.context ?? {}, dedupe_key: `chapter-completed:${sessionId}:${courseId}:1`
          });
        }
      } catch {
        // The completion reply stands even if the chapter projection is unavailable.
      }
    }
    await touchSession(client, sessionId);
    return { sessionId, message: message ?? userRow };
  }

  // practice-submitted: the Attempt already exists and was written by the
  // learning boundary. The reply only records the conversation event.
  const courseId = typeof body.courseId === "string" ? body.courseId : "";
  const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId : "";
  const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
  const attemptResult = await client.from("learning_attempts").select("id,attempt_number,assistant_session_id").eq("id", attemptId).eq("user_id", userId).eq("course_id", courseId).eq("assignment_id", assignmentId).maybeSingle();
  const attempt = dataOrThrow(attemptResult.data as Row | null, attemptResult.error, "Assistant action Attempt lookup");
  if (!attempt) return { sessionId, message: null };
  const assignmentResult = await client.from("course_assignments").select("title").eq("course_id", courseId).eq("id", assignmentId).maybeSingle();
  const assignment = dataOrThrow(assignmentResult.data as Row | null, assignmentResult.error, "Assistant action Assignment title");
  if (!assignment) return { sessionId, message: null };
  const reply = `已提交「${text(assignment, "title")}」。评价结果会自动出现在这条对话里。`;
  const userRow = await insertAssistantRowOnce(client, {
    session_id: sessionId, role: "user", message_kind: "action",
    content: `提交动手任务：${text(assignment, "title")}`,
    parts: [{ type: "text", text: `提交动手任务：${text(assignment, "title")}` }],
    context_snapshot: body.context ?? {}, dedupe_key: `practice-submitted:${attemptId}:user`
  });
  const message = await insertAssistantRowOnce(client, {
    session_id: sessionId, role: "assistant", message_kind: "action", content: reply,
    // The evaluation Result owns the only result card. Showing a pending
    // evaluation card here would duplicate it after refresh.
    parts: [{ type: "text", text: reply }],
    context_snapshot: body.context ?? {}, dedupe_key: `practice-submitted:${attemptId}:assistant`
  });
  await touchSession(client, sessionId);
  return { sessionId, message: message ?? userRow };
}

/**
 * A final evaluation Result writes one timeline reply by itself, independent of
 * the practice component. Idempotent by Attempt + Result.
 */
export async function recordEvaluationTimeline(client: SupabaseClient, input: {
  userId: string; courseId: string; assignmentId: string; attemptId: string; resultId: string; outcome: string;
}): Promise<Row | null> {
  const attemptResult = await client.from("learning_attempts").select("id,assistant_session_id,attempt_number").eq("id", input.attemptId).eq("user_id", input.userId).maybeSingle();
  const attempt = dataOrThrow(attemptResult.data as Row | null, attemptResult.error, "Evaluation timeline Attempt lookup");
  if (!attempt) return null;
  // Only a conversation-originated Attempt may write a timeline reply. Do not
  // guess a thread from the latest session: that could leak a result into an
  // unrelated conversation.
  const requestedSessionId = optionalText(attempt, "assistant_session_id");
  if (!requestedSessionId) return null;
  const owned = await ownedAssistantSession(client, input.userId, requestedSessionId);
  if (!owned) return null;
  const sessionId = String(owned.id);
  const assignmentResult = await client.from("course_assignments").select("title").eq("course_id", input.courseId).eq("id", input.assignmentId).maybeSingle();
  const assignment = dataOrThrow(assignmentResult.data as Row | null, assignmentResult.error, "Evaluation timeline Assignment lookup");
  if (!assignment) return null;
  const passed = input.outcome === "passed";
  const title = text(assignment, "title");
  const reply = passed
    ? `「${title}」这次通过了评价。具体判断在下面的结果卡里，可以逐条查看。`
    : `「${title}」这次还需要修改。具体原因在下面的结果卡里，可以补充后再交。`;
  const message = await insertAssistantRowOnce(client, {
    session_id: sessionId, role: "assistant", message_kind: "action", content: reply,
    parts: [
      { type: "text", text: reply },
      { type: "tool-displayCard", toolCallId: crypto.randomUUID(), state: "output-available", input: { cardType: "evaluation", courseId: input.courseId, assignmentId: input.assignmentId, attemptId: input.attemptId }, output: { card: { cardType: "evaluation", courseId: input.courseId, assignmentId: input.assignmentId, attemptId: input.attemptId } } }
    ],
    context_snapshot: {},
    dedupe_key: `practice-evaluated:${input.attemptId}:${input.resultId}`
  });
  await touchSession(client, sessionId);
  if (passed) {
    await recordButtonAction(client, input.userId, {
      kind: "segment-cleared", sessionId, courseId: input.courseId,
      assignmentId: input.assignmentId, context: {}
    }).catch(() => undefined);
  }
  return message;
}
