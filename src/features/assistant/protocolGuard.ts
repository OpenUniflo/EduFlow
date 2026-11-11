/**
 * Server-side guard for serialized tool-call protocol text.
 *
 * The model sometimes writes its internal tool-call protocol into ordinary
 * content instead of emitting structured tool calls. Detection deliberately
 * matches protocol *structure* only: the DSML tag with full-width or half-width
 * pipes anywhere, or a bare `invoke` / `parameter` protocol block that is the
 * whole reply. A normal discussion of DSML, a sentence mentioning
 * `invoke name=`, or a Markdown code example is not a match.
 */
const PIPE = "[|｜]";
const DSML_TAG = new RegExp(`<\\s*/?\\s*${PIPE}{1,2}\\s*DSML\\s*${PIPE}{1,2}`, "i");
const BARE_TOOL_START = /^<(invoke|parameter)\s+name\s*=/i;
const STRUCTURED_TOOL_TAG = /<\s*\/?\s*(tool_use|tool_call|function_call|tool_result|function_result|ds_safety)\b/i;
const TOOL_TAG = /^<\s*(\/?)\s*(invoke|parameter)\b([^>]*)>$/i;
const TOOL_NAME_ATTRIBUTE = /^\s+name\s*=/i;

export const PROTOCOL_LEAK_REASON = "protocol_leak";
export const PROTOCOL_HIDDEN_MESSAGE = "这条回复格式异常，已隐藏";
/** Legacy model-history marker that must never reach a learner or a prompt. */
export const CARD_HISTORY_MARKER_PREFIX = "[此回复展示的卡片：";
const CARD_HISTORY_MARKER = /\[此回复展示的卡片：[^\]]*\]/g;

export function stripCardHistoryMarkers(text: string): string {
  return text.replace(CARD_HISTORY_MARKER, "");
}

/** Length of a trailing prefix that may still become a card-history marker. */
export function heldCardHistorySuffixLength(text: string): number {
  const tail = text.slice(-64);
  for (let index = 0; index < tail.length; index += 1) {
    if (tail[index] !== "[") continue;
    const suffix = tail.slice(index);
    if (CARD_HISTORY_MARKER_PREFIX.startsWith(suffix)) return suffix.length;
    if (suffix.startsWith(CARD_HISTORY_MARKER_PREFIX) && !suffix.includes("]")) return suffix.length;
  }
  return 0;
}

/**
 * A bare invoke/parameter call block only: the trimmed reply starts with a
 * tool tag, contains only invoke/parameter tags, and has no prose outside a
 * parameter value. Markdown fences and normal text therefore never match.
 */
function bareToolProtocolKind(text: string): "invoke" | "parameter" | null {
  const trimmed = text.trim();
  const start = BARE_TOOL_START.exec(trimmed);
  if (!start) return null;
  if (trimmed.includes("```") || trimmed.includes("~~~")) return null;
  const stack: string[] = [];
  let sawTag = false;
  let index = 0;
  while (index < trimmed.length) {
    const next = trimmed.indexOf("<", index);
    const chunk = next === -1 ? trimmed.slice(index) : trimmed.slice(index, next);
    if (chunk.trim() && stack[stack.length - 1] !== "parameter") return null;
    if (next === -1) break;
    const close = trimmed.indexOf(">", next + 1);
    if (close === -1) return null;
    const match = TOOL_TAG.exec(trimmed.slice(next, close + 1));
    if (!match) return null;
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    if (closing) {
      if (stack.pop() !== name) return null;
    } else {
      if (!TOOL_NAME_ATTRIBUTE.test(match[3] ?? "")) return null;
      stack.push(name);
    }
    sawTag = true;
    index = close + 1;
  }
  if (!sawTag || stack.length) return null;
  return start[1].toLowerCase() as "invoke" | "parameter";
}

export function hasAssistantProtocolLeak(text: string): boolean {
  return assistantProtocolLeakRule(text) !== null;
}

/** Returns the first rule that matched, for bounded logs; never returns content. */
export function assistantProtocolLeakRule(text: string): "dsml_tag" | "tool_tag" | "invoke_structure" | "parameter_structure" | null {
  const lower = text.toLocaleLowerCase();
  const dsml = DSML_TAG.exec(text);
  if (dsml && !insideFence(lower, dsml.index)) return "dsml_tag";
  const structured = STRUCTURED_TOOL_TAG.exec(text);
  if (structured && !insideFence(lower, structured.index)) return "tool_tag";
  const bare = bareToolProtocolKind(text);
  if (bare === "invoke") return "invoke_structure";
  if (bare === "parameter") return "parameter_structure";
  return null;
}

/**
 * Streaming guard primitives.
 *
 * The model stream arrives in small deltas, so a protocol marker can be split
 * across several chunks. We hold back a short suffix that could still become
 * the beginning of a marker, release everything before it, and only treat a
 * complete opener as a leak.
 */
const STREAM_MARKER_OPENERS = [
  "<|dsml|",
  "<||dsml||",
  "</|dsml|",
  "</||dsml||",
  "<invoke name=",
  "<parameter name=",
  "<tool_use",
  "<tool_call",
  "<function_call",
  "<tool_result",
  "<function_result",
  "<ds_safety"
];
const STREAM_HOLD_MAX = 24;

/** Length of the trailing text that could still grow into a protocol opener. */
export function heldProtocolSuffixLength(text: string): number {
  const tail = text.slice(-STREAM_HOLD_MAX);
  const lower = tail.toLocaleLowerCase();
  for (let index = 0; index < lower.length; index += 1) {
    if (lower[index] !== "<") continue;
    const suffix = lower.slice(index);
    if (STREAM_MARKER_OPENERS.some((opener) => opener.startsWith(suffix))) return suffix.length;
  }
  return 0;
}

/**
 * True when the text already contains a protocol marker. A marker inside a
 * fenced code block is a legitimate explanation, not a leak.
 */
export function protocolLeakInProgress(text: string): boolean {
  const lower = text.toLocaleLowerCase();
  const dsml = /<\s*\/?\s*[|｜]{1,2}\s*dsml\s*[|｜]{1,2}/i.exec(text);
  if (dsml && !insideFence(lower, dsml.index)) return true;
  const tool = /(^|\n)[ \t]*<(invoke|parameter)\s+name\s*=/i.exec(text);
  if (tool && !insideFence(lower, tool.index)) return true;
  const structured = STRUCTURED_TOOL_TAG.exec(text);
  if (structured && !insideFence(lower, structured.index)) return true;
  if (lower.includes("<ds_safety")) return true;
  return false;
}

function insideFence(text: string, index: number): boolean {
  let fences = 0;
  let cursor = 0;
  while (true) {
    const next = text.indexOf("```", cursor);
    if (next === -1 || next >= index) break;
    fences += 1;
    cursor = next + 3;
  }
  return fences % 2 === 1;
}

export type LoopAnswer = {
  text: string;
  finishReason: string;
};

/**
 * The tool loop may supply the final answer only when it ended naturally and
 * its last text is non-empty and clean. A capped tool loop or a protocol leak
 * requires the independent no-tools final call.
 */
export function selectLoopFinalText(answer: LoopAnswer): string | null {
  const text = answer.text.trim();
  if (!text) return null;
  if (answer.finishReason !== "stop") return null;
  if (hasAssistantProtocolLeak(text)) return null;
  return text;
}

/** Returns a clean final answer, or null when the model text is empty/invalid. */
export function cleanFinalAnswer(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (hasAssistantProtocolLeak(trimmed)) return null;
  return trimmed;
}

export type AssistantHistoryRow = {
  role: string;
  content: unknown;
  parts?: unknown;
  message_kind?: unknown;
  invalid_reason?: unknown;
};

/** A failed generation is visible in the timeline but never replayed to the model. */
export function rowHasFailureMarker(parts: unknown): boolean {
  return Array.isArray(parts) && parts.some((part) => Boolean(part) && typeof part === "object" && (part as { type?: unknown }).type === "data-failed");
}

/**
 * One filter for every assistant message that can reach a model request.
 * Action audit prose is excluded, invalid rows are excluded, a failed turn is
 * excluded so its question stays unanswered, and an assistant row that still
 * contains protocol structure is excluded even when an older database row has
 * not been marked yet.
 */
export function isModelHistoryRow(row: AssistantHistoryRow): boolean {
  if (row.message_kind === "action") return false;
  if (row.invalid_reason != null && String(row.invalid_reason).trim()) return false;
  if (row.role === "assistant" && rowHasFailureMarker(row.parts)) return false;
  if (row.role === "assistant" && hasAssistantProtocolLeak(String(row.content))) return false;
  return true;
}

export function filterModelHistoryRows<T extends Record<string, unknown>>(rows: readonly T[]): T[] {
  return rows.filter((row) => isModelHistoryRow(row as unknown as AssistantHistoryRow));
}

/**
 * A persisted user turn with no assistant reply is a failed or stopped turn.
 * It must stay visible in the timeline but must never be answered again as
 * part of the next request. The current turn is appended after this history.
 */
export function historyWithoutUnansweredTail<T extends { role?: unknown }>(rows: readonly T[]): T[] {
  // Remove every user turn that has no assistant row before the next user turn,
  // not only a trailing run. A failed question stays visible in the timeline
  // but must never be silently answered again after a later question.
  return rows.filter((row, index) => {
    if (String(row.role) !== "user") return true;
    const next = rows[index + 1];
    return Boolean(next) && String(next.role) !== "user";
  });
}

/** List/detail responses must never return leaked protocol text to a browser. */
export function visibleAssistantContent(row: AssistantHistoryRow): string {
  const content = stripCardHistoryMarkers(String(row.content)).trim();
  if (row.role === "assistant" && (Boolean(row.invalid_reason) || hasAssistantProtocolLeak(content))) return PROTOCOL_HIDDEN_MESSAGE;
  return content;
}

export function invalidReasonForRow(row: AssistantHistoryRow): string | undefined {
  if (row.role !== "assistant") return undefined;
  if (row.invalid_reason != null && String(row.invalid_reason).trim()) return String(row.invalid_reason);
  if (hasAssistantProtocolLeak(String(row.content))) return PROTOCOL_LEAK_REASON;
  return undefined;
}
