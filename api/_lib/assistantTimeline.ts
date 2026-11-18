import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelMessage, ToolCallPart, ToolResultPart } from "ai";
import { cardHistoryLabel, type AssistantCardRef } from "../../src/features/assistant/assistantCards.js";
import { assistantToolProgressLabel } from "./toolProgress.js";
import { normalizeFollowUps, type FollowUpSuggestion } from "./assistantSuggestions.js";
import { hasAssistantProtocolLeak, stripCardHistoryMarkers, visibleAssistantContent, type AssistantHistoryRow } from "../../src/features/assistant/protocolGuard.js";
import { dataOrThrow } from "./query.js";

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
export type TimelineProgressPart = { type: "data-tool-progress"; data: { toolName: string; label: string } };
export type TimelineFollowUpPart = { type: "data-follow-ups"; data: { items: FollowUpSuggestion[] } };
export type TimelineAttachmentPart = { type: "data-attachment"; data: { id: string; title: string } };
export type TimelineWriteResultPart = { type: "data-write-result"; data: { toolName: string; ok: boolean; title: string; detail?: string; card?: AssistantCardRef } };
export type TimelineFailurePart = { type: "data-failed"; data: { reason: string } };
export type TimelinePart = TimelineTextPart | TimelineCardPart | TimelineProgressPart | TimelineFollowUpPart | TimelineAttachmentPart | TimelineFailurePart | { type: string; [key: string]: unknown };

/** A failed generation is persisted (partial text/cards + one marker) and can be retried. */
export function isFailurePart(part: unknown): part is TimelineFailurePart {
  return Boolean(part) && typeof part === "object" && (part as Row).type === "data-failed";
}

export function failureReasonFromParts(parts: unknown): string | undefined {
  if (!Array.isArray(parts)) return undefined;
  const failure = parts.find(isFailurePart);
  return failure ? String(failure.data?.reason ?? "failed").slice(0, 40) : undefined;
}

export function hasFailureMarker(parts: unknown): boolean {
  return failureReasonFromParts(parts) !== undefined;
}

function progressPart(part: Row): TimelineProgressPart | null {
  const type = typeof part.type === "string" ? part.type : "";
  if (!type.startsWith("tool-") || type === "tool-displayCard" || type === "tool-suggestFollowUps") return null;
  if (part.state !== "output-available") return null;
  const toolName = type.slice("tool-".length);
  return { type: "data-tool-progress", data: { toolName, label: assistantToolProgressLabel(toolName) } };
}

function followUpPart(part: Row): TimelineFollowUpPart | null {
  if (part.type !== "tool-suggestFollowUps" || part.state !== "output-available") return null;
  const output = part.output && typeof part.output === "object" ? part.output as Row : {};
  const items = Array.isArray(output.suggestions) ? normalizeFollowUps(output.suggestions) : [];
  return items.length ? { type: "data-follow-ups", data: { items } } : null;
}

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
      const value = stripCardHistoryMarkers(typeof source.text === "string" ? source.text : "").trim();
      if (!value) continue;
      if (hasAssistantProtocolLeak(value)) throw new Error("Assistant protocol text cannot be persisted");
      output.push({ type: "text", text: value });
      continue;
    }
    if (source.type === "data-tool-progress" && source.data && typeof source.data === "object") {
      const data = source.data as Row;
      if (typeof data.label === "string" && data.label.trim()) output.push({ type: "data-tool-progress", data: { toolName: String(data.toolName ?? ""), label: data.label.slice(0, 80) } });
      continue;
    }
    if (source.type === "data-write-result" && source.data && typeof source.data === "object") {
      const data = source.data as Row;
      if (typeof data.toolName === "string" && typeof data.title === "string" && typeof data.ok === "boolean") {
        output.push({ type: "data-write-result", data: {
          id: typeof data.id === "string" ? data.id : crypto.randomUUID(),
          toolName: data.toolName,
          ok: data.ok,
          title: data.title.slice(0, 80),
          ...(typeof data.detail === "string" ? { detail: data.detail.slice(0, 240) } : {}),
          ...(typeof data.attemptId === "string" ? { attemptId: data.attemptId } : {}),
          ...(data.card && typeof data.card === "object" ? { card: data.card as AssistantCardRef } : {})
        } });
      }
      continue;
    }
    if (source.type === "data-follow-ups" && source.data && typeof source.data === "object") {
      const data = source.data as Row;
      const items = Array.isArray(data.items) ? normalizeFollowUps(data.items) : [];
      if (items.length) output.push({ type: "data-follow-ups", data: { items } });
      continue;
    }
    if (isFailurePart(part)) {
      output.push({ type: "data-failed", data: { reason: String(part.data.reason ?? "failed").slice(0, 40) } });
      continue;
    }
    const progress = progressPart(source);
    if (progress) { output.push(progress); continue; }
    const followUps = followUpPart(source);
    if (followUps) { output.push(followUps); continue; }
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
        const value = stripCardHistoryMarkers(String(source.text ?? "")).trim();
        if (!value) continue;
        parts.push({ type: "text", text: row.role === "assistant" ? visibleAssistantContent({ role: "assistant", content: value, invalid_reason: row.invalid_reason }) : value });
        continue;
      }
      if (source.type === "data-tool-progress" && source.data && typeof source.data === "object") {
        const data = source.data as Row;
        if (typeof data.label === "string" && data.label.trim()) parts.push({ type: "data-tool-progress", data: { toolName: String(data.toolName ?? ""), label: data.label.slice(0, 80) } });
        continue;
      }
      if (source.type === "data-write-result" && source.data && typeof source.data === "object") {
        const data = source.data as Row;
        if (typeof data.toolName === "string" && typeof data.title === "string" && typeof data.ok === "boolean") {
          parts.push({ type: "data-write-result", data: {
            id: typeof data.id === "string" ? data.id : crypto.randomUUID(),
            toolName: data.toolName,
            ok: data.ok,
            title: data.title.slice(0, 80),
            ...(typeof data.detail === "string" ? { detail: data.detail.slice(0, 240) } : {}),
            ...(typeof data.attemptId === "string" ? { attemptId: data.attemptId } : {}),
            ...(data.card && typeof data.card === "object" ? { card: data.card as AssistantCardRef } : {})
          } });
        }
        continue;
      }
      if (source.type === "data-follow-ups" && source.data && typeof source.data === "object") {
        const data = source.data as Row;
        const items = Array.isArray(data.items) ? normalizeFollowUps(data.items) : [];
        if (items.length) parts.push({ type: "data-follow-ups", data: { items } });
        continue;
      }
      if (source.type === "data-attachment" && source.data && typeof source.data === "object") {
        const data = source.data as Row;
        if (typeof data.id === "string" && typeof data.title === "string") parts.push({ type: "data-attachment", data: { id: data.id, title: data.title.slice(0, 240) } });
        continue;
      }
      if (isFailurePart(part)) {
        parts.push({ type: "data-failed", data: { reason: String((source.data as Row).reason ?? "failed").slice(0, 40) } });
        continue;
      }
      const progress = progressPart(source);
      if (progress) { parts.push(progress); continue; }
      const followUps = followUpPart(source);
      if (followUps) { parts.push(followUps); continue; }
      if (isCardPart(part)) {
        const card = (source.output as Row).card;
        parts.push({ type: "tool-displayCard", toolCallId: String(source.toolCallId ?? ""), state: "output-available", input: card as AssistantCardRef, output: { card: card as AssistantCardRef } });
      }
    }
    if (parts.length) return parts;
  }
  return [{ type: "text", text: visibleAssistantContent(row as unknown as AssistantHistoryRow) }];
}

function historyToolCallId(row: Row, index: number): string {
  const identity = String(row.id ?? "row").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || `row${index}`;
  return `card_${identity}_${index}`.slice(0, 64);
}

/**
 * Standard AI SDK model history for one persisted row. Cards are replayed as
 * tool-call/tool-result content; the result contains only a compact label, so
 * no learner-facing marker text is available for the next model turn to copy.
 */
export function modelHistoryMessages(row: Row): ModelMessage[] {
  const role = String(row.role);
  const content = stripCardHistoryMarkers(String(row.content ?? "")).trim();
  const parts = Array.isArray(row.parts) ? row.parts : [];
  const cards = parts.filter(isCardPart).map((part) => part.output.card);
  const writes = parts.flatMap((part) => {
    if (!part || typeof part !== "object" || (part as Row).type !== "data-write-result" || !(part as Row).data || typeof (part as Row).data !== "object") return [];
    const data = (part as Row).data as Row;
    if (typeof data.toolName !== "string" || typeof data.ok !== "boolean" || typeof data.title !== "string") return [];
    return [data];
  });
  if (role === "user") return [{ role: "user", content }];
  if (!content.trim() && !cards.length && !writes.length) return [];
  if (!cards.length && !writes.length) return [{ role: "assistant", content }];
  const calls: ToolCallPart[] = [
    ...cards.map((card, index) => ({
      type: "tool-call" as const,
      toolCallId: historyToolCallId(row, index),
      toolName: "displayCard",
      input: { cardType: card.cardType, label: cardHistoryLabel(card) }
    })),
    ...writes.map((write, index) => ({
      type: "tool-call" as const,
      toolCallId: `write_${historyToolCallId(row, index)}`.slice(0, 64),
      toolName: String(write.toolName),
      input: {
        ...(write.card && typeof write.card === "object" ? { courseId: String((write.card as Row).courseId ?? ""), assignmentId: String((write.card as Row).assignmentId ?? "") } : {}),
        ...(typeof write.attemptId === "string" ? { attemptId: write.attemptId } : {})
      }
    }))
  ];
  const results: ToolResultPart[] = [
    ...cards.map((card, index) => ({
      type: "tool-result" as const,
      toolCallId: historyToolCallId(row, index),
      toolName: "displayCard",
      output: { type: "json" as const, value: { shown: true, cardType: card.cardType, label: cardHistoryLabel(card) } }
    })),
    ...writes.map((write, index) => ({
      type: "tool-result" as const,
      toolCallId: `write_${historyToolCallId(row, index)}`.slice(0, 64),
      toolName: String(write.toolName),
      output: { type: "json" as const, value: { ok: Boolean(write.ok), title: String(write.title), ...(typeof write.detail === "string" ? { detail: write.detail } : {}) } }
    }))
  ];
  return [
    { role: "assistant", content: [...(content.trim() ? [{ type: "text" as const, text: content }] : []), ...calls] },
    { role: "tool", content: results }
  ];
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
    if (found) {
      // A retry of a failed turn reuses the same dedupe key. Replace the failed
      // row in place so a refresh never shows both the failure and the retry.
      if (hasFailureMarker(found.parts)) {
        const update = await client.from("assistant_messages")
          .update({
            content: String(row.content ?? ""),
            parts: row.parts,
            structured_content: row.structured_content ?? null,
            context_snapshot: row.context_snapshot
          })
          .eq("id", found.id)
          .select("*")
          .single();
        return dataOrThrow(update.data as Row | null, update.error, "Assistant failed timeline replacement");
      }
      return found;
    }
  }
  const write = await client.from("assistant_messages").insert(row).select("*").single();
  if (write.error?.code === "23505" && key) {
    const existing = await client.from("assistant_messages").select("*").eq("dedupe_key", key).maybeSingle();
    return dataOrThrow(existing.data as Row | null, existing.error, "Assistant timeline dedupe retry");
  }
  return dataOrThrow(write.data as Row | null, write.error, "Assistant timeline write");
}

/**
 * Operation audit rows (`message_kind = 'action'`) are no longer shown, except
 * for structured Course Search and Course Creation Brief results, which carry
 * their own `structured_content` and remain readable.
 */
export function isVisibleTimelineRow(row: Row): boolean {
  return row.message_kind !== "action" || row.structured_content != null;
}
