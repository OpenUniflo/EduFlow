/**
 * A learner-stopped reply is persisted with the text and completed cards that
 * already existed. The stop marker lives in the existing `parts` JSON column,
 * so no schema migration is needed. A reply whose model produced nothing keeps
 * the user turn and puts the same marker on it instead of creating an empty
 * assistant row.
 */
export const STOPPED_PART_TYPE = "data-stopped";

export type StoppedMarkerPart = {
  type: typeof STOPPED_PART_TYPE;
  data: { reason: "learner" };
};

export function stoppedMarkerPart(): StoppedMarkerPart {
  return { type: STOPPED_PART_TYPE, data: { reason: "learner" } };
}

export function hasStoppedMarker(parts: unknown): boolean {
  return Array.isArray(parts) && parts.some((part) => Boolean(part) && typeof part === "object" && (part as { type?: unknown }).type === STOPPED_PART_TYPE);
}

export function appendStoppedMarker<T>(parts: readonly T[]): Array<T | StoppedMarkerPart> {
  return hasStoppedMarker(parts) ? [...parts] : [...parts, stoppedMarkerPart()];
}

type ReplyPart = { type?: unknown; output?: unknown };

/** A completed display card is the only tool part that may be persisted. */
export function completedCardCount(parts: readonly unknown[]): number {
  return parts.filter((part): part is ReplyPart => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return false;
    const source = part as ReplyPart;
    return source.type === "tool-displayCard" && Boolean(source.output) && typeof source.output === "object";
  }).length;
}

/**
 * Content for a persisted stopped row. `assistant_messages.content` is a
 * non-empty legacy/model-history projection; parts remain the UI authority.
 */
export function stoppedReplyContent(text: string, persistedParts: readonly unknown[]): string {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  return completedCardCount(persistedParts) > 0 ? "已停止回复" : "";
}

/** A stopped generation may persist partial text or a completed card only. */
export function canPersistStoppedReply(text: string, persistedParts: readonly unknown[]): boolean {
  return Boolean(text.trim()) || completedCardCount(persistedParts) > 0;
}
