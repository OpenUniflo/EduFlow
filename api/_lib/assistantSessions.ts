import type { PostgrestError } from "@supabase/supabase-js";
import { ApiError } from "./http.js";

export const ASSISTANT_SESSION_PAGE_SIZE = 25;
export const ASSISTANT_SESSION_TITLE_MAX = 80;

export type AssistantSessionCursor = { updatedAt: string; id: string };

/**
 * Escape a user-typed fragment before it becomes a SQL LIKE pattern. Both
 * wildcards and the escape character itself must survive literal search, so
 * `%` and `_` are matched literally instead of matching everything.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Title search is a single opaque cursor: updated_at desc, id desc as tie-break. */
export function encodeSessionCursor(cursor: AssistantSessionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSessionCursor(value: unknown): AssistantSessionCursor | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value.trim(), "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.updatedAt !== "string" || Number.isNaN(Date.parse(parsed.updatedAt))) return null;
    if (typeof parsed.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.id)) return null;
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    return null;
  }
}

export function normalizeSessionId(value: unknown): string {
  const sessionId = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    throw new ApiError(400, "invalid_assistant_session", "A valid conversation is required");
  }
  return sessionId;
}

export function normalizeSessionTitle(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "invalid_session_title", "A conversation title is required");
  const title = value.trim().replace(/\s+/g, " ");
  if (!title) throw new ApiError(400, "invalid_session_title", "A conversation title is required");
  if (title.length > ASSISTANT_SESSION_TITLE_MAX) throw new ApiError(400, "invalid_session_title", `Conversation titles are limited to ${ASSISTANT_SESSION_TITLE_MAX} characters`);
  return title;
}

/** The only reference that can stop deletion is courses.creation_brief_message_id. */
export function isCourseReferenceConflict(error: PostgrestError | null): boolean {
  return error?.code === "23503";
}

export function sessionListLimit(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) return ASSISTANT_SESSION_PAGE_SIZE;
  return Math.min(50, Math.max(1, Math.trunc(parsed)));
}
