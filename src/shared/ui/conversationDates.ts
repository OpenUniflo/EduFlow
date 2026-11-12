/** Local calendar day key used to group conversation messages. */
export function conversationDayKey(value: string | Date | undefined, now: Date = new Date()): string {
  const date = value instanceof Date ? value : value ? new Date(value) : now;
  const safe = Number.isNaN(date.getTime()) ? now : date;
  return `${safe.getFullYear()}-${safe.getMonth() + 1}-${safe.getDate()}`;
}

function sameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

/**
 * Relative label for a message day: 今天 / 昨天 / a concrete local date.
 * Concrete dates use Intl.DateTimeFormat and include the year only when it
 * differs from the reference year.
 */
export function formatConversationDay(value: string | Date | undefined, now: Date = new Date(), locale = "zh-CN"): string {
  const date = value instanceof Date ? value : value ? new Date(value) : now;
  if (Number.isNaN(date.getTime())) return "今天";
  if (sameLocalDay(date, now)) return "今天";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameLocalDay(date, yesterday)) return "昨天";
  return new Intl.DateTimeFormat(locale, {
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const }),
    month: "long",
    day: "numeric"
  }).format(date);
}

/**
 * Secondary line for a conversation row. Two conversations may share a title,
 * so the list uses their real last-update instant to keep them distinguishable
 * without rewriting the learner's title.
 */
export function formatConversationUpdatedAt(value: string | Date | undefined, locale = "zh-CN"): string {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}
