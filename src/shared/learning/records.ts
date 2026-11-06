/**
 * Learning records projection.
 *
 * The API reads the signed-in user's own rows only (RLS + explicit user_id),
 * then this module turns those facts into the four learner-facing record
 * event types. Everything here is pure: date buckets, streaks, filtering,
 * cursor pagination and row-to-event mapping can all be tested without a
 * database or a browser.
 *
 * Time zone choice: every persisted timestamp is UTC, but "a learning day" is
 * a local calendar day. The page sends the browser's IANA time zone; the
 * server validates it and only uses it for day boundaries. When it is absent
 * the product default is Asia/Shanghai because EduFlow's current audience and
 * local acceptance accounts are in China. The effective zone is returned in
 * `summary.timeZone` so the UI and a reviewer always know which calendar was
 * used. A browser-supplied time zone is presentation input, never identity.
 */

import {
  formatRecordScore,
  hasCjk,
  normalizeRecordScore,
  recordFeedbackComment,
  recordFeedbackItemLabel,
  recordFeedbackItemText,
  recordFeedbackSummary
} from "./recordsFeedback.js";

export const DEFAULT_RECORD_TIME_ZONE = "Asia/Shanghai";

export const RECORD_EVENT_TYPES = ["micro", "practice", "evaluation", "route"] as const;
export type RecordEventType = (typeof RECORD_EVENT_TYPES)[number];

export const RECORD_RANGES = ["today", "week", "last30", "all"] as const;
export type RecordRange = (typeof RECORD_RANGES)[number];

export type RecordStatus = "learned" | "pending" | "needs_revision" | "passed" | "version";

export type RecordLinkKind = "practice" | "course" | "knowledge" | "micro" | "workflow" | "conversation";

export type RecordLink = {
  kind: RecordLinkKind;
  label: string;
  to: string;
};

export type RecordFeedbackItem = {
  label: string;
  value: string;
};

export type RecordFeedback = {
  /** Chinese result/reason explanation mapped from a backend code. */
  summary?: string;
  /** Teacher-authored comment, kept verbatim because it is user content. */
  comment?: string;
  items: RecordFeedbackItem[];
};

export type RecordEventMeta = {
  chapterNumber?: number;
  attemptNumber?: number;
  /** Displayable score; absent when the maximum is unknown. */
  score?: number;
  scoreMax?: number;
  scoreConverted?: boolean;
  addedSteps?: number;
  removedSteps?: number;
  source?: "initial" | "adjustment" | "restore";
  estimatedMinutes?: number;
  basisCount?: number;
};

export type RecordEvent = {
  id: string;
  type: RecordEventType;
  occurredAt: string;
  title: string;
  courseId?: string;
  courseTitle?: string;
  status: RecordStatus;
  versionNumber?: number;
  meta: RecordEventMeta;
  feedback?: RecordFeedback;
  links: RecordLink[];
};

export type RecordDay = {
  date: string;
  count: number;
};

export type RecordSummary = {
  timeZone: string;
  startDate: string;
  endDate: string;
  weeks: number;
  days: RecordDay[];
  /** Activities inside the 53-week heatmap window. */
  windowActivities: number;
  /** All activities ever, independent of the current filters. */
  totalActivities: number;
  /** Distinct calendar days with at least one activity, all time. */
  learningDays: number;
  /** Consecutive active days ending today (or yesterday while today is still open). */
  currentStreak: number;
  monthActivities: number;
  last7Days: number;
};

export type RecordCounts = {
  total: number;
  byType: Record<RecordEventType, number>;
};

export type RecordCourseOption = {
  id: string;
  title: string;
  count: number;
};

export type RecordFilters = {
  types: RecordEventType[];
  courseId: string | null;
  range: RecordRange;
};

export type RecordsResponse = {
  summary: RecordSummary;
  counts: RecordCounts;
  courses: RecordCourseOption[];
  events: RecordEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Number of events matching the type + course + range filters. */
  resultTotal: number;
  /** Oldest and newest matching event dates in the effective time zone. */
  scope: { from: string | null; to: string | null };
  filters: {
    types: RecordEventType[];
    courseId: string | null;
    range: RecordRange;
    timeZone: string;
  };
};

export type RecordCursor = {
  occurredAt: string;
  id: string;
};

export type RecordEventDayGroup = {
  date: string;
  count: number;
  events: RecordEvent[];
};

export type RawRecordRow = Readonly<Record<string, unknown>>;

const DAY_MS = 86_400_000;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    formatterCache.set(timeZone, value);
  }
  return value;
}

export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 80) return false;
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}

/** UTC instant -> YYYY-MM-DD in the requested IANA time zone. */
export function dateKeyInTimeZone(value: string | Date, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || !isValidTimeZone(timeZone)) return "";
  const parts = formatter(timeZone).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

/** Calendar label (<-> UTC day number); no time zone involved after bucketing. */
export function dayNumber(dateKey: string): number | null {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return Math.trunc(utc / DAY_MS);
}

export function dateKeyFromDayNumber(value: number): string {
  const date = new Date(value * DAY_MS);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateKey: string, amount: number): string {
  const number = dayNumber(dateKey);
  if (number === null) return "";
  return dateKeyFromDayNumber(number + amount);
}

/** Monday-based week start, matching the N14 heatmap labels (一 / 三 / 五). */
export function startOfWeekMonday(dateKey: string): string {
  const number = dayNumber(dateKey);
  if (number === null) return "";
  const weekday = new Date(number * DAY_MS).getUTCDay(); // 0 Sunday … 6 Saturday
  return dateKeyFromDayNumber(number - ((weekday + 6) % 7));
}

export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function formatDayLabel(dateKey: string): string {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) return dateKey;
  return `${Number(match[1])} 年 ${Number(match[2])} 月 ${Number(match[3])} 日`;
}

export function formatShortDayLabel(dateKey: string): string {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) return dateKey;
  return `${Number(match[2])} 月 ${Number(match[3])} 日`;
}

export function formatWeekday(dateKey: string): string {
  const number = dayNumber(dateKey);
  if (number === null) return "";
  return ["日", "一", "二", "三", "四", "五", "六"][new Date(number * DAY_MS).getUTCDay()];
}

export function formatMonth(dateKey: string): string {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) return dateKey;
  return `${Number(match[1])} 年 ${Number(match[2])} 月`;
}

export function formatYearMonth(dateKey: string): string {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) return dateKey;
  return `${match[1]}-${match[2]}`;
}

export function formatTimeInTimeZone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || !isValidTimeZone(timeZone)) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  return hour && minute ? `${hour}:${minute}` : "";
}

/** Five-step legend used by N14: 0, 1, 2, 3–4, 5+. */
export function activityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export function countActivitiesByDay(events: readonly Pick<RecordEvent, "occurredAt">[], timeZone: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = dateKeyInTimeZone(event.occurredAt, timeZone);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function buildHeatmapWindow(today: string): RecordDay[] {
  const monday = startOfWeekMonday(today);
  const start = addDays(monday, -52 * 7);
  if (!start) return [];
  return Array.from({ length: 53 * 7 }, (_, index) => ({ date: addDays(start, index), count: 0 }));
}

export function summarizeEvents(events: readonly Pick<RecordEvent, "occurredAt">[], nowIso: string, timeZone: string): RecordSummary {
  const today = dateKeyInTimeZone(nowIso, timeZone) || dateKeyInTimeZone(new Date().toISOString(), timeZone);
  const days = buildHeatmapWindow(today);
  const counts = countActivitiesByDay(events, timeZone);
  for (const day of days) day.count = counts.get(day.date) ?? 0;

  const windowStart = days[0]?.date ?? today;
  const windowEnd = days[days.length - 1]?.date ?? today;
  let windowActivities = 0;
  for (const day of days) windowActivities += day.count;

  const yesterday = addDays(today, -1);
  const streakStart = counts.has(today) ? today : counts.has(yesterday) ? yesterday : "";
  let currentStreak = 0;
  for (let cursor = streakStart; cursor && counts.has(cursor); cursor = addDays(cursor, -1)) currentStreak += 1;

  const monthPrefix = today.slice(0, 7);
  let monthActivities = 0;
  for (const [date, count] of counts) if (date.startsWith(monthPrefix)) monthActivities += count;

  let last7Days = 0;
  for (let offset = 0; offset < 7; offset += 1) if (counts.has(addDays(today, -offset))) last7Days += 1;

  return {
    timeZone,
    startDate: windowStart,
    endDate: windowEnd,
    weeks: 53,
    days,
    windowActivities,
    totalActivities: events.length,
    learningDays: counts.size,
    currentStreak,
    monthActivities,
    last7Days
  };
}

/** Month labels for the 53 heatmap columns (labels are placed on week columns). */
export function monthLabelsForDays(days: readonly RecordDay[]): Array<{ label: string; column: number }> {
  const labels: Array<{ label: string; column: number }> = [];
  let previous = "";
  let lastColumn = -99;
  for (let column = 0; column < Math.min(53, Math.floor(days.length / 7)); column += 1) {
    const date = days[column * 7]?.date;
    if (!date) continue;
    const key = monthKey(date);
    if (key === previous) continue;
    previous = key;
    // N14 labels alternate months so the multi-column labels never crowd.
    if (column > 50 || (labels.length && column + 1 - lastColumn < 8)) continue;
    labels.push({ label: `${Number(key.slice(5))} 月`, column: column + 1 });
    lastColumn = column + 1;
  }
  return labels;
}

function rangeStart(range: RecordRange, today: string): string | null {
  if (range === "today") return today;
  if (range === "week") return startOfWeekMonday(today);
  if (range === "last30") return addDays(today, -29);
  return null;
}

export function filterRecordEvents(
  events: readonly RecordEvent[],
  filters: RecordFilters,
  nowIso: string,
  timeZone: string
): RecordEvent[] {
  const today = dateKeyInTimeZone(nowIso, timeZone);
  const start = today ? rangeStart(filters.range, today) : null;
  const types = new Set(filters.types);
  return events.filter((event) => {
    if (types.size && !types.has(event.type)) return false;
    if (filters.courseId && event.courseId !== filters.courseId) return false;
    if (filters.range !== "all") {
      if (!today || !start) return false;
      const key = dateKeyInTimeZone(event.occurredAt, timeZone);
      if (!key || key < start || key > today) return false;
    }
    return true;
  });
}

export function countEventsByType(events: readonly RecordEvent[]): RecordCounts {
  const byType: Record<RecordEventType, number> = { micro: 0, practice: 0, evaluation: 0, route: 0 };
  for (const event of events) byType[event.type] += 1;
  return { total: events.length, byType };
}

export function compareRecordEventsDesc(left: Pick<RecordEvent, "occurredAt" | "id">, right: Pick<RecordEvent, "occurredAt" | "id">): number {
  const byTime = right.occurredAt.localeCompare(left.occurredAt);
  return byTime || right.id.localeCompare(left.id);
}

export function encodeRecordCursor(event: Pick<RecordEvent, "occurredAt" | "id">): string {
  return `${encodeURIComponent(event.occurredAt)}|${encodeURIComponent(event.id)}`;
}

export function decodeRecordCursor(value: string | null | undefined): RecordCursor | null {
  if (!value || value.length > 500) return null;
  const parts = value.split("|");
  if (parts.length !== 2) return null;
  try {
    const occurredAt = decodeURIComponent(parts[0]);
    const id = decodeURIComponent(parts[1]);
    if (!occurredAt || !id || Number.isNaN(new Date(occurredAt).getTime())) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

function isAfterCursor(event: Pick<RecordEvent, "occurredAt" | "id">, cursor: RecordCursor): boolean {
  return event.occurredAt < cursor.occurredAt || (event.occurredAt === cursor.occurredAt && event.id < cursor.id);
}

export function paginateRecordEvents(
  events: readonly RecordEvent[],
  cursor: RecordCursor | null,
  limit: number
): { events: RecordEvent[]; nextCursor: string | null; hasMore: boolean } {
  const remaining = cursor ? events.filter((event) => isAfterCursor(event, cursor)) : [...events];
  const page = remaining.slice(0, limit);
  const hasMore = remaining.length > limit;
  return {
    events: page,
    hasMore,
    nextCursor: hasMore && page.length ? encodeRecordCursor(page[page.length - 1]) : null
  };
}

export function groupRecordEventsByDay(
  events: readonly RecordEvent[],
  timeZone: string
): RecordEventDayGroup[] {
  const groups: RecordEventDayGroup[] = [];
  const byDate = new Map<string, RecordEventDayGroup>();
  for (const event of events) {
    const date = dateKeyInTimeZone(event.occurredAt, timeZone);
    if (!date) continue;
    let group = byDate.get(date);
    if (!group) {
      group = { date, count: 0, events: [] };
      byDate.set(date, group);
      groups.push(group);
    }
    group.events.push(event);
    group.count += 1;
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/* Row -> event mapping                                                */
/* ------------------------------------------------------------------ */

const ROLE_ORDER: Record<string, number> = { introduce: 0, reinforce: 1, apply: 2, assess: 3 };
const ROUTE_SOURCE_LABELS: Record<string, string> = { initial: "初始路线", adjustment: "调整路线", restore: "恢复路线" };
const FEEDBACK_ARRAY_KEYS = ["items", "criteria", "sections", "scores", "rubric", "breakdown"] as const;
const FEEDBACK_OBJECT_KEYS = ["criteria", "sections", "scores", "breakdown"] as const;

function text(row: RawRecordRow | null | undefined, key: string): string {
  if (!row) return "";
  const value = row[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function numberValue(row: RawRecordRow | null | undefined, key: string): number | undefined {
  if (!row) return undefined;
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function objectValue(value: unknown): RawRecordRow | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecordRow) : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function key(courseId: string, id: string): string {
  return `${courseId}:${id}`;
}

function coursePath(courseId: string): string {
  return `/courses/${encodeURIComponent(courseId)}`;
}

function practicePath(courseId: string, assignmentId: string): string {
  return `${coursePath(courseId)}/assignments/${encodeURIComponent(assignmentId)}`;
}

function knowledgePath(courseId: string | undefined, nodeId: string): string {
  return courseId
    ? `${coursePath(courseId)}?focus=knowledge:${encodeURIComponent(nodeId)}`
    : `/archive?focus=knowledge:${encodeURIComponent(nodeId)}`;
}

function microPath(knowledgeId: string, courseId: string | undefined, pathId: string): string {
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (pathId) params.set("pathId", pathId);
  return `/learn/micro/${encodeURIComponent(knowledgeId)}${params.size ? `?${params.toString()}` : ""}`;
}

function conversationPath(courseId: string, assignmentId: string): string {
  return `/?practice=${encodeURIComponent(`${courseId}:${assignmentId}`)}`;
}

function addLink(links: RecordLink[], seen: Set<string>, link: RecordLink): void {
  const identity = `${link.kind}:${link.to}`;
  if (seen.has(identity)) return;
  seen.add(identity);
  links.push(link);
}

function outcomeStatus(outcome: string): RecordStatus {
  if (outcome === "passed") return "passed";
  if (outcome === "failed") return "needs_revision";
  return "pending";
}

function itemScoreMaximum(item: RawRecordRow): number | undefined {
  return numberValue(item, "max")
    ?? numberValue(item, "maximum")
    ?? numberValue(item, "outOf")
    ?? numberValue(item, "max_score")
    ?? numberValue(item, "score_max")
    ?? numberValue(item, "maxScore")
    ?? numberValue(item, "scoreMax")
    ?? numberValue(item, "pointsPossible")
    ?? numberValue(item, "points_possible");
}

function feedbackItemValue(item: RawRecordRow): string {
  const score = normalizeRecordScore(
    numberValue(item, "score") ?? numberValue(item, "earned") ?? numberValue(item, "points") ?? numberValue(item, "value"),
    itemScoreMaximum(item)
  );
  if (score) return formatRecordScore(score);
  const direct = text(item, "result") || text(item, "detail") || text(item, "comment") || text(item, "message") || text(item, "status") || text(item, "value");
  return recordFeedbackItemText(direct) ?? "";
}

/** Reads only real feedback fields; never invents rubric items. */
export function parseRecordFeedback(value: unknown, outcome?: string, evaluatorKind?: string): RecordFeedback | undefined {
  const feedback = objectValue(value);
  const code = text(feedback, "code");
  const message = text(feedback, "message") || text(feedback, "summary") || text(feedback, "comment");
  const summary = recordFeedbackSummary(code || undefined, outcome);
  const rawComment = recordFeedbackComment(message || undefined, code || undefined, evaluatorKind?.trim().toLowerCase() === "manual");
  const comment = rawComment && rawComment !== summary ? rawComment : undefined;
  const items: RecordFeedbackItem[] = [];
  const seen = new Set<string>();

  function push(rawLabel: string, rawValue: string, allowLabelOnly = false) {
    const label = recordFeedbackItemLabel(rawLabel);
    const itemValue = rawValue.trim();
    if (!itemValue && !allowLabelOnly) return;
    if (!itemValue && !hasCjk(label)) return;
    const identity = `${label}\u0000${itemValue}`;
    if (seen.has(identity) || items.length >= 20) return;
    seen.add(identity);
    items.push({ label, value: itemValue });
  }

  if (feedback) {
    for (const keyName of FEEDBACK_ARRAY_KEYS) {
      const array = feedback[keyName];
      if (!Array.isArray(array)) continue;
      for (const entry of array.slice(0, 20)) {
        if (typeof entry === "string") {
          push(entry, "", true);
          continue;
        }
        const item = objectValue(entry);
        if (!item) continue;
        const label = text(item, "label") || text(item, "title") || text(item, "name") || text(item, "criterion") || text(item, "key");
        push(label, feedbackItemValue(item));
      }
    }
    for (const keyName of FEEDBACK_OBJECT_KEYS) {
      const valueAtKey = feedback[keyName];
      if (!valueAtKey || typeof valueAtKey !== "object" || Array.isArray(valueAtKey)) continue;
      for (const [label, raw] of Object.entries(valueAtKey as Record<string, unknown>)) {
        if (typeof raw !== "string" && typeof raw !== "number") continue;
        push(label, recordFeedbackItemText(String(raw)) ?? "");
      }
    }
  }

  if (!summary && !comment && !items.length) return undefined;
  return {
    ...(summary ? { summary } : {}),
    ...(comment ? { comment } : {}),
    items
  };
}

function chapterOrderMaps(
  lessons: readonly RawRecordRow[],
  chapters: readonly RawRecordRow[]
): { lessonOrder: Map<string, number>; lessonChapter: Map<string, string>; chapterOrder: Map<string, number> } {
  const lessonOrder = new Map<string, number>();
  const lessonChapter = new Map<string, string>();
  for (const lesson of lessons) {
    const courseId = text(lesson, "course_id");
    const lessonId = text(lesson, "id");
    if (!courseId || !lessonId) continue;
    lessonOrder.set(key(courseId, lessonId), numberValue(lesson, "display_order") ?? Number.MAX_SAFE_INTEGER);
    lessonChapter.set(key(courseId, lessonId), text(lesson, "chapter_id"));
  }
  const chapterOrder = new Map<string, number>();
  for (const chapter of chapters) {
    const courseId = text(chapter, "course_id");
    const chapterId = text(chapter, "id");
    if (!courseId || !chapterId) continue;
    chapterOrder.set(key(courseId, chapterId), numberValue(chapter, "display_order") ?? Number.MAX_SAFE_INTEGER);
  }
  return { lessonOrder, lessonChapter, chapterOrder };
}

function coverageSort(left: RawRecordRow, right: RawRecordRow, courseId: string, maps: ReturnType<typeof chapterOrderMaps>): number {
  const role = (ROLE_ORDER[text(left, "role")] ?? 9) - (ROLE_ORDER[text(right, "role")] ?? 9);
  if (role !== 0) return role;
  const leftLesson = maps.lessonOrder.get(key(courseId, text(left, "lesson_id"))) ?? Number.MAX_SAFE_INTEGER;
  const rightLesson = maps.lessonOrder.get(key(courseId, text(right, "lesson_id"))) ?? Number.MAX_SAFE_INTEGER;
  if (leftLesson !== rightLesson) return leftLesson - rightLesson;
  const order = (numberValue(left, "display_order") ?? 0) - (numberValue(right, "display_order") ?? 0);
  if (order !== 0) return order;
  return text(left, "id").localeCompare(text(right, "id"));
}

/** course:node -> 1-based chapter number, using the primary curriculum coverage. */
export function chapterNumbersByKnowledge(
  curriculumCoverages: readonly RawRecordRow[],
  lessons: readonly RawRecordRow[],
  chapters: readonly RawRecordRow[]
): Map<string, number> {
  const maps = chapterOrderMaps(lessons, chapters);
  const grouped = new Map<string, RawRecordRow[]>();
  for (const coverage of curriculumCoverages) {
    const courseId = text(coverage, "course_id");
    const nodeId = text(coverage, "node_id");
    if (!courseId || !nodeId) continue;
    const identity = key(courseId, nodeId);
    const rows = grouped.get(identity) ?? [];
    rows.push(coverage);
    grouped.set(identity, rows);
  }
  const result = new Map<string, number>();
  for (const [identity, rows] of grouped) {
    const courseId = identity.slice(0, identity.indexOf(":"));
    rows.sort((left, right) => coverageSort(left, right, courseId, maps));
    const first = rows[0];
    const lessonId = text(first, "lesson_id");
    const chapterId = maps.lessonChapter.get(key(courseId, lessonId));
    const order = chapterId ? maps.chapterOrder.get(key(courseId, chapterId)) : undefined;
    if (order !== undefined && Number.isInteger(order)) result.set(identity, order + 1);
  }
  return result;
}

/** course:assignment -> 1-based chapter number, derived from covered Knowledge. */
export function chapterNumbersByAssignment(
  assignmentCoverages: readonly RawRecordRow[],
  curriculumCoverages: readonly RawRecordRow[],
  lessons: readonly RawRecordRow[],
  chapters: readonly RawRecordRow[]
): Map<string, number> {
  const maps = chapterOrderMaps(lessons, chapters);
  const coverageByNode = new Map<string, RawRecordRow[]>();
  for (const coverage of curriculumCoverages) {
    const courseId = text(coverage, "course_id");
    const nodeId = text(coverage, "node_id");
    if (!courseId || !nodeId) continue;
    const identity = key(courseId, nodeId);
    const rows = coverageByNode.get(identity) ?? [];
    rows.push(coverage);
    coverageByNode.set(identity, rows);
  }
  const result = new Map<string, number>();
  const grouped = new Map<string, Set<string>>();
  for (const coverage of assignmentCoverages) {
    const courseId = text(coverage, "course_id");
    const assignmentId = text(coverage, "assignment_id");
    const nodeId = text(coverage, "node_id");
    if (!courseId || !assignmentId || !nodeId) continue;
    const identity = key(courseId, assignmentId);
    const nodes = grouped.get(identity) ?? new Set<string>();
    nodes.add(nodeId);
    grouped.set(identity, nodes);
  }
  for (const [identity, nodes] of grouped) {
    const courseId = identity.slice(0, identity.indexOf(":"));
    const candidates = [...nodes].flatMap((nodeId) => coverageByNode.get(key(courseId, nodeId)) ?? []);
    candidates.sort((left, right) => coverageSort(left, right, courseId, maps));
    const first = candidates[0];
    if (!first) continue;
    const chapterId = maps.lessonChapter.get(key(courseId, text(first, "lesson_id")));
    const order = chapterId ? maps.chapterOrder.get(key(courseId, chapterId)) : undefined;
    if (order !== undefined && Number.isInteger(order)) result.set(identity, order + 1);
  }
  return result;
}

/** course:assignment -> the primary covered Knowledge, used for knowledge links. */
export function primaryKnowledgeByAssignment(
  assignmentCoverages: readonly RawRecordRow[],
  curriculumCoverages: readonly RawRecordRow[],
  lessons: readonly RawRecordRow[],
  chapters: readonly RawRecordRow[]
): Map<string, string> {
  const maps = chapterOrderMaps(lessons, chapters);
  const coverageByNode = new Map<string, RawRecordRow[]>();
  for (const coverage of curriculumCoverages) {
    const courseId = text(coverage, "course_id");
    const nodeId = text(coverage, "node_id");
    if (!courseId || !nodeId) continue;
    coverageByNode.set(key(courseId, nodeId), [...(coverageByNode.get(key(courseId, nodeId)) ?? []), coverage]);
  }
  const grouped = new Map<string, Set<string>>();
  for (const coverage of assignmentCoverages) {
    const courseId = text(coverage, "course_id");
    const assignmentId = text(coverage, "assignment_id");
    const nodeId = text(coverage, "node_id");
    if (!courseId || !assignmentId || !nodeId) continue;
    const identity = key(courseId, assignmentId);
    grouped.set(identity, (grouped.get(identity) ?? new Set<string>()).add(nodeId));
  }
  const result = new Map<string, string>();
  for (const [identity, nodes] of grouped) {
    const courseId = identity.slice(0, identity.indexOf(":"));
    const ranked = [...nodes].map((nodeId) => {
      const coverages = coverageByNode.get(key(courseId, nodeId)) ?? [];
      const best = [...coverages].sort((left, right) => coverageSort(left, right, courseId, maps))[0];
      return { nodeId, best: best ?? null };
    }).filter((entry) => entry.best);
    ranked.sort((left, right) => coverageSort(left.best!, right.best!, courseId, maps) || left.nodeId.localeCompare(right.nodeId));
    if (ranked[0]) result.set(identity, ranked[0].nodeId);
  }
  return result;
}

export type RecordMappingInput = {
  microEvidence: readonly RawRecordRow[];
  attempts: readonly RawRecordRow[];
  results: readonly RawRecordRow[];
  routeVersions: readonly RawRecordRow[];
  courses: readonly RawRecordRow[];
  knowledge: readonly RawRecordRow[];
  assignments: readonly RawRecordRow[];
  microPaths: readonly RawRecordRow[];
  curriculumCoverages: readonly RawRecordRow[];
  assignmentCoverages: readonly RawRecordRow[];
  lessons: readonly RawRecordRow[];
  chapters: readonly RawRecordRow[];
  liveWorkflows?: ReadonlyArray<{ runId: string; workflowId: string }>;
};

/** Maps only persisted facts to timeline events. Missing joins are omitted, not invented. */
export function mapRecordEvents(input: RecordMappingInput): RecordEvent[] {
  const courseTitle = new Map<string, string>(input.courses.map((course) => [text(course, "id"), text(course, "title")] as const).filter(([id]) => Boolean(id)));
  const knowledgeTitle = new Map<string, string>(input.knowledge.map((node) => [text(node, "id"), text(node, "title")] as const).filter(([id]) => Boolean(id)));
  const assignmentTitle = new Map<string, string>(input.assignments.map((assignment) => [key(text(assignment, "course_id"), text(assignment, "id")), text(assignment, "title")] as const).filter(([identity]) => !identity.startsWith(":")));
  const chapterByNode = chapterNumbersByKnowledge(input.curriculumCoverages, input.lessons, input.chapters);
  const chapterByAssignment = chapterNumbersByAssignment(input.assignmentCoverages, input.curriculumCoverages, input.lessons, input.chapters);
  const primaryKnowledge = primaryKnowledgeByAssignment(input.assignmentCoverages, input.curriculumCoverages, input.lessons, input.chapters);
  const microPaths = new Map<string, RawRecordRow>(input.microPaths.map((path) => [text(path, "id"), path] as const).filter(([id]) => Boolean(id)));
  const microPathByKnowledge = new Map<string, RawRecordRow>();
  for (const path of input.microPaths) {
    const nodeId = text(path, "knowledge_id");
    if (!nodeId) continue;
    if (text(path, "status") !== "published" || text(path, "mode") !== "learn") continue;
    const existing = microPathByKnowledge.get(nodeId);
    const courseId = text(path, "course_id");
    if (!existing || (courseId && !text(existing, "course_id"))) microPathByKnowledge.set(nodeId, path);
  }
  const liveWorkflow = new Map<string, string>((input.liveWorkflows ?? []).map((entry) => [entry.runId, entry.workflowId] as const));
  const attemptById = new Map<string, RawRecordRow>(input.attempts.map((attempt) => [text(attempt, "id"), attempt] as const).filter(([id]) => Boolean(id)));
  const latestResult = new Map<string, RawRecordRow>();
  for (const result of input.results) {
    const attemptId = text(result, "attempt_id");
    if (!attemptId) continue;
    const current = latestResult.get(attemptId);
    if (!current || (numberValue(result, "version") ?? 0) > (numberValue(current, "version") ?? 0)) latestResult.set(attemptId, result);
  }

  const events: RecordEvent[] = [];

  for (const evidence of input.microEvidence) {
    if (text(evidence, "event_type") !== "micro_path_completed") continue;
    const occurredAt = text(evidence, "occurred_at");
    if (!occurredAt) continue;
    const context = objectValue(evidence.context);
    const pathId = text(context, "pathId") || text(evidence, "source_entity_id");
    const nodeId = text(evidence, "node_id");
    const courseFromEvidence = text(context, "courseId");
    const fallbackPath = microPathByKnowledge.get(nodeId);
    const path = microPaths.get(pathId)
      ?? input.microPaths.find((candidate) => text(candidate, "knowledge_id") === nodeId
        && text(candidate, "status") === "published" && text(candidate, "mode") === "learn"
        && (!courseFromEvidence || text(candidate, "course_id") === courseFromEvidence))
      ?? (fallbackPath && (!courseFromEvidence || !text(fallbackPath, "course_id")) ? fallbackPath : undefined);
    const courseId = text(context, "courseId") || text(path, "course_id") || undefined;
    const course = courseId ? courseTitle.get(courseId) : undefined;
    const chapterNumber = courseId ? chapterByNode.get(key(courseId, nodeId)) : undefined;
    const links: RecordLink[] = [];
    const seen = new Set<string>();
    if (path && text(path, "status") === "published") addLink(links, seen, { kind: "micro", label: "打开小练习", to: microPath(nodeId, courseId, text(path, "id")) });
    if (courseId && courseTitle.has(courseId)) addLink(links, seen, { kind: "course", label: "打开课程", to: coursePath(courseId) });
    if (nodeId && knowledgeTitle.has(nodeId)) addLink(links, seen, { kind: "knowledge", label: "查看知识", to: knowledgePath(courseId, nodeId) });
    const estimatedMinutes = numberValue(path, "estimated_minutes");
    events.push({
      id: `micro:${text(evidence, "id")}`,
      type: "micro",
      occurredAt,
      title: knowledgeTitle.get(nodeId) || text(path, "title") || "小练习",
      ...(courseId ? { courseId } : {}),
      ...(course ? { courseTitle: course } : {}),
      status: "learned",
      meta: {
        ...(chapterNumber === undefined ? {} : { chapterNumber }),
        ...(estimatedMinutes === undefined ? {} : { estimatedMinutes })
      },
      links
    });
  }

  for (const attempt of input.attempts) {
    const occurredAt = text(attempt, "submitted_at");
    if (!occurredAt) continue;
    const attemptId = text(attempt, "id");
    const courseId = text(attempt, "course_id");
    const assignmentId = text(attempt, "assignment_id");
    const assignmentKey = key(courseId, assignmentId);
    const assignmentExists = assignmentTitle.has(assignmentKey);
    const latest = latestResult.get(attemptId);
    const status = outcomeStatus(latest ? text(latest, "outcome") : "pending");
    const response = objectValue(attempt.response);
    const attemptNumber = numberValue(attempt, "attempt_number");
    const chapterNumber = chapterByAssignment.get(assignmentKey);
    const firstKnowledge = primaryKnowledge.get(assignmentKey);
    const links: RecordLink[] = [];
    const seen = new Set<string>();
    if (assignmentExists) addLink(links, seen, { kind: "practice", label: "打开实践", to: practicePath(courseId, assignmentId) });
    if (courseTitle.has(courseId)) addLink(links, seen, { kind: "course", label: "打开课程", to: coursePath(courseId) });
    if (firstKnowledge && knowledgeTitle.has(firstKnowledge)) addLink(links, seen, { kind: "knowledge", label: "查看知识", to: knowledgePath(courseId, firstKnowledge) });
    if (response && text(response, "kind") === "workflow") {
      const runId = text(response, "runId");
      const workflowId = runId ? liveWorkflow.get(runId) : undefined;
      if (workflowId) addLink(links, seen, { kind: "workflow", label: "打开工作流", to: `/works/${encodeURIComponent(workflowId)}` });
    }
    if (response && text(response, "submissionMode") === "conversation" && assignmentExists) {
      addLink(links, seen, { kind: "conversation", label: "回到对话", to: conversationPath(courseId, assignmentId) });
    }
    events.push({
      id: `practice:${attemptId}`,
      type: "practice",
      occurredAt,
      title: assignmentTitle.get(assignmentKey) || "实践提交",
      ...(courseId ? { courseId } : {}),
      ...(courseTitle.has(courseId) ? { courseTitle: courseTitle.get(courseId) } : {}),
      status,
      meta: {
        ...(chapterNumber === undefined ? {} : { chapterNumber }),
        ...(attemptNumber === undefined ? {} : { attemptNumber })
      },
      links
    });
  }

  for (const result of input.results) {
    const outcome = text(result, "outcome");
    if (outcome === "pending" || !outcome) continue;
    const occurredAt = text(result, "evaluated_at");
    if (!occurredAt) continue;
    const attemptId = text(result, "attempt_id");
    const attempt = attemptById.get(attemptId);
    if (!attempt) continue;
    const courseId = text(result, "course_id") || text(attempt, "course_id");
    const assignmentId = text(result, "assignment_id") || text(attempt, "assignment_id");
    const assignmentKey = key(courseId, assignmentId);
    const assignmentExists = assignmentTitle.has(assignmentKey);
    const response = objectValue(attempt.response);
    const chapterNumber = chapterByAssignment.get(assignmentKey);
    const firstKnowledge = primaryKnowledge.get(assignmentKey);
    const attemptNumber = numberValue(attempt, "attempt_number");
    const feedbackObject = objectValue(result.feedback);
    const score = normalizeRecordScore(
      numberValue(result, "score"),
      numberValue(result, "max_score")
        ?? numberValue(result, "score_max")
        ?? numberValue(result, "max")
        ?? numberValue(result, "maxScore")
        ?? numberValue(result, "total_score")
        ?? numberValue(result, "pointsPossible")
        ?? numberValue(result, "points_possible")
        ?? numberValue(feedbackObject, "max_score")
        ?? numberValue(feedbackObject, "score_max")
        ?? numberValue(feedbackObject, "maxScore")
        ?? numberValue(feedbackObject, "scoreMax")
    );
    const feedback = parseRecordFeedback(result.feedback, outcome, text(result, "evaluator_kind"));
    const basisCount = (feedback?.comment ? 1 : 0) + (feedback?.items.length ?? 0);
    const links: RecordLink[] = [];
    const seen = new Set<string>();
    if (assignmentExists) addLink(links, seen, { kind: "practice", label: "打开实践", to: practicePath(courseId, assignmentId) });
    if (courseTitle.has(courseId)) addLink(links, seen, { kind: "course", label: "打开课程", to: coursePath(courseId) });
    if (firstKnowledge && knowledgeTitle.has(firstKnowledge)) addLink(links, seen, { kind: "knowledge", label: "查看知识", to: knowledgePath(courseId, firstKnowledge) });
    if (response && text(response, "kind") === "workflow") {
      const runId = text(response, "runId");
      const workflowId = runId ? liveWorkflow.get(runId) : undefined;
      if (workflowId) addLink(links, seen, { kind: "workflow", label: "打开工作流", to: `/works/${encodeURIComponent(workflowId)}` });
    }
    if (response && text(response, "submissionMode") === "conversation" && assignmentExists) {
      addLink(links, seen, { kind: "conversation", label: "回到对话", to: conversationPath(courseId, assignmentId) });
    }
    events.push({
      id: `evaluation:${text(result, "id")}`,
      type: "evaluation",
      occurredAt,
      title: assignmentTitle.get(assignmentKey) || "评价返回",
      ...(courseId ? { courseId } : {}),
      ...(courseTitle.has(courseId) ? { courseTitle: courseTitle.get(courseId) } : {}),
      status: outcomeStatus(outcome),
      meta: {
        ...(chapterNumber === undefined ? {} : { chapterNumber }),
        ...(attemptNumber === undefined ? {} : { attemptNumber }),
        ...(score ? { score: score.earned, scoreMax: score.max, scoreConverted: score.convertedFromRatio } : {}),
        ...(basisCount ? { basisCount } : {})
      },
      ...(feedback ? { feedback } : {}),
      links
    });
  }

  for (const version of input.routeVersions) {
    const occurredAt = text(version, "created_at");
    if (!occurredAt) continue;
    const courseId = text(version, "course_id");
    const course = courseTitle.get(courseId);
    const versionNumber = numberValue(version, "version_number");
    const source = text(version, "source");
    const addedSteps = stringArray(version.include_node_ids).length;
    const removedSteps = stringArray(version.exclude_node_ids).length;
    const links: RecordLink[] = [];
    const seen = new Set<string>();
    if (courseTitle.has(courseId)) addLink(links, seen, { kind: "course", label: "打开课程", to: coursePath(courseId) });
    events.push({
      id: `route:${text(version, "id")}`,
      type: "route",
      occurredAt,
      title: course ? `我的 ${course} 路线` : "我的个人路线",
      ...(courseId ? { courseId } : {}),
      ...(course ? { courseTitle: course } : {}),
      status: "version",
      ...(versionNumber === undefined ? {} : { versionNumber }),
      meta: {
        addedSteps,
        removedSteps,
        ...(source === "initial" || source === "adjustment" || source === "restore" ? { source } : {})
      },
      links
    });
  }

  return events.sort(compareRecordEventsDesc);
}

export function routeSourceLabel(source: RecordEventMeta["source"]): string {
  return source ? ROUTE_SOURCE_LABELS[source] ?? "" : "";
}

export function uniqueCourseIdsFromEvents(events: readonly RecordEvent[]): string[] {
  return uniqueStrings(events.map((event) => event.courseId ?? ""));
}
