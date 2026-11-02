import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows, dataOrThrow } from "./query.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const number = (row: Row, key: string) => Number(row[key]);

/** The learner-facing labels follow the persisted Assignment state, not a new status model. */
export type PracticeSubmissionStatus = "draft" | "submitted" | "needs_revision" | "accepted";

/** Only fields that actually exist on the saved Attempt payload reach the Works card. */
export type PracticeSubmissionContent = {
  kind: string;
  fileName?: string;
  linkDomain?: string;
  attachmentCount: number;
  text?: string;
};

export type PracticeSubmissionItem = {
  courseId: string;
  assignmentId: string;
  courseTitle: string;
  assignmentTitle: string;
  status: PracticeSubmissionStatus;
  attemptNumber: number | null;
  updatedAt: string;
  submittedAt?: string;
  acceptedAt?: string;
  /** 1-based chapter order derived from the Assignment's primary covered Knowledge, when known. */
  chapterNumber?: number;
  /** Latest persisted PerformanceResult score, only when it is a real number. */
  score?: number;
  content?: PracticeSubmissionContent;
};

export function practiceSubmissionStatus(status: string): PracticeSubmissionStatus | null {
  if (status === "started") return "draft";
  if (status === "submitted") return "submitted";
  if (status === "needs_revision") return "needs_revision";
  if (status === "accepted") return "accepted";
  return null;
}

export function latestAttemptNumbers(attempts: readonly Row[]): Map<string, number> {
  const latest = new Map<string, number>();
  for (const attempt of attempts) {
    const key = `${text(attempt, "course_id")}:${text(attempt, "assignment_id")}`;
    const number = Number(attempt.attempt_number);
    if (!Number.isInteger(number) || number < 1) continue;
    if (number > (latest.get(key) ?? 0)) latest.set(key, number);
  }
  return latest;
}

function attemptKey(row: Row) {
  return `${text(row, "course_id")}:${text(row, "assignment_id")}`;
}

function latestAttempts(attempts: readonly Row[]): Map<string, Row> {
  const latest = new Map<string, Row>();
  for (const attempt of attempts) {
    const number = Number(attempt.attempt_number);
    if (!Number.isInteger(number) || number < 1) continue;
    const key = attemptKey(attempt);
    if (number > Number(latest.get(key)?.attempt_number ?? 0)) latest.set(key, attempt);
  }
  return latest;
}

function firstLineSummary(value: string): string | undefined {
  return value.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.slice(0, 80);
}

const SUMMARY_FIELDS = ["title", "summary", "task", "answer", "text", "content"] as const;

/**
 * A submission's answer may itself be serialized JSON. When the whole text is a JSON object or
 * array, its first meaningful top-level string field is a better summary than the raw payload.
 */
function jsonSummary(value: string): { isJson: true; text?: string } | { isJson: false } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { isJson: false };
  }
  if (!parsed || typeof parsed !== "object") return { isJson: false };
  if (Array.isArray(parsed)) return { isJson: true };
  const record = parsed as Row;
  for (const key of SUMMARY_FIELDS) {
    const field = record[key];
    if (typeof field !== "string") continue;
    const summary = firstLineSummary(field);
    if (summary) return { isJson: true, text: summary };
  }
  return { isJson: true };
}

function linkDomainIn(value: string): string | undefined {
  const match = value.match(/https?:\/\/[^\s<>"'）)]+/i);
  if (!match) return undefined;
  try {
    return new URL(match[0]).hostname.replace(/^www\./i, "") || undefined;
  } catch {
    return undefined;
  }
}

/** Real Attempt payload -> a compact summary; never invents content for an empty submission. */
export function practiceSubmissionContent(value: unknown): PracticeSubmissionContent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const response = value as Row;
  const kind = typeof response.kind === "string" && response.kind.trim() ? response.kind.trim() : "unknown";
  const attachmentCount = Array.isArray(response.attachmentSourceIds)
    ? response.attachmentSourceIds.filter(id => typeof id === "string").length
    : 0;
  const fileName = typeof response.fileName === "string" && response.fileName.trim()
    ? response.fileName.trim().slice(0, 120)
    : undefined;
  const rawText = typeof response.text === "string" ? response.text.trim() : "";
  const extracted = rawText ? jsonSummary(rawText) : undefined;
  const firstLine = extracted?.isJson ? extracted.text : firstLineSummary(rawText);
  const linkDomain = linkDomainIn(rawText);
  const content: PracticeSubmissionContent = { kind, attachmentCount };
  if (fileName) content.fileName = fileName;
  if (linkDomain) content.linkDomain = linkDomain;
  if (firstLine) content.text = firstLine;
  return content;
}

const ROLE_ORDER: Record<string, number> = { introduce: 0, reinforce: 1, apply: 2, assess: 3 };

/**
 * Chapter order comes from the Assignment's primary covered Knowledge:
 * introduce first, then lesson order, coverage order and stable id.
 */
export function chapterNumbersByAssignment(
  assignmentCoverages: readonly Row[],
  curriculumCoverages: readonly Row[],
  lessons: readonly Row[],
  chapters: readonly Row[]
): Map<string, number> {
  const nodesByAssignment = new Map<string, Set<string>>();
  for (const coverage of assignmentCoverages) {
    const key = attemptKey(coverage);
    const nodes = nodesByAssignment.get(key) ?? new Set<string>();
    nodes.add(text(coverage, "node_id"));
    nodesByAssignment.set(key, nodes);
  }
  const coverageByCourse = new Map<string, Row[]>();
  for (const coverage of curriculumCoverages) {
    const courseId = text(coverage, "course_id");
    coverageByCourse.set(courseId, [...(coverageByCourse.get(courseId) ?? []), coverage]);
  }
  const lessonByKey = new Map(lessons.map(lesson => [`${text(lesson, "course_id")}:${text(lesson, "id")}`, lesson]));
  const lessonOrder = new Map(lessons.map(lesson => [`${text(lesson, "course_id")}:${text(lesson, "id")}`, number(lesson, "display_order")]));
  const chapterOrder = new Map(chapters.map(chapter => [`${text(chapter, "course_id")}:${text(chapter, "id")}`, number(chapter, "display_order")]));
  const result = new Map<string, number>();
  for (const [key, nodes] of nodesByAssignment) {
    const courseId = key.slice(0, key.indexOf(":"));
    const candidates = (coverageByCourse.get(courseId) ?? []).filter(coverage => nodes.has(text(coverage, "node_id")));
    candidates.sort((left, right) =>
      (ROLE_ORDER[text(left, "role")] ?? 9) - (ROLE_ORDER[text(right, "role")] ?? 9)
      || (lessonOrder.get(`${courseId}:${text(left, "lesson_id")}`) ?? Number.MAX_SAFE_INTEGER) - (lessonOrder.get(`${courseId}:${text(right, "lesson_id")}`) ?? Number.MAX_SAFE_INTEGER)
      || number(left, "display_order") - number(right, "display_order")
      || text(left, "id").localeCompare(text(right, "id")));
    const coverage = candidates[0];
    if (!coverage) continue;
    const lesson = lessonByKey.get(`${courseId}:${text(coverage, "lesson_id")}`);
    if (!lesson) continue;
    const order = chapterOrder.get(`${courseId}:${text(lesson, "chapter_id")}`);
    if (order === undefined || !Number.isInteger(order)) continue;
    result.set(key, order + 1);
  }
  return result;
}

/**
 * Read-only, RLS-scoped list of the signed-in learner's practice submissions.
 * Only the caller's Assignment states are read; Course and Assignment titles are
 * joined through the same user client so private Courses stay private.
 */
export async function readMyPracticeSubmissions(client: SupabaseClient, userId: string): Promise<{ items: PracticeSubmissionItem[] }> {
  const states = await allRows(client
    .from("user_assignment_states")
    .select("course_id,assignment_id,status,submitted_at,accepted_at,updated_at")
    .eq("user_id", userId)
    .in("status", ["started", "submitted", "needs_revision", "accepted"])
    .order("updated_at", { ascending: false }), "Practice submission states") as Row[];
  if (!states.length) return { items: [] };

  const courseIds = [...new Set(states.map(state => text(state, "course_id")))];
  const assignmentIds = [...new Set(states.map(state => text(state, "assignment_id")))];
  const [attempts, coverages, coursesResult, assignmentsResult] = await Promise.all([
    allRows(client.from("learning_attempts").select("id,course_id,assignment_id,attempt_number,response,submitted_at").eq("user_id", userId).in("course_id", courseIds).in("assignment_id", assignmentIds).order("attempt_number", { ascending: false }), "Practice submission attempts"),
    client.from("assignment_coverages").select("course_id,assignment_id,node_id").in("course_id", courseIds).in("assignment_id", assignmentIds),
    client.from("courses").select("id,title").in("id", courseIds),
    client.from("course_assignments").select("course_id,id,title").in("course_id", courseIds).in("id", assignmentIds),
  ]);
  const latestAttempt = latestAttempts(attempts);
  const latestAttemptIds = [...latestAttempt.values()].map(attempt => text(attempt, "id"));
  const scores = new Map<string, number>();
  if (latestAttemptIds.length) {
    const results = await allRows(client.from("performance_results").select("attempt_id,score,version").in("attempt_id", latestAttemptIds).order("version", { ascending: false }), "Practice submission scores");
    const seen = new Set<string>();
    for (const result of results) {
      const attemptId = text(result, "attempt_id");
      if (seen.has(attemptId)) continue;
      seen.add(attemptId);
      if (result.score == null) continue;
      const score = Number(result.score);
      if (Number.isFinite(score)) scores.set(attemptId, score);
    }
  }
  const assignmentCoverages = dataOrThrow(coverages.data as Row[] | null, coverages.error, "Practice submission coverage");
  let chapterNumbers = new Map<string, number>();
  if (assignmentCoverages.length) {
    const nodeIds = [...new Set(assignmentCoverages.map(coverage => text(coverage, "node_id")))];
    const [curriculumCoverages, lessons, chapters] = await Promise.all([
      allRows(client.from("curriculum_coverages").select("id,course_id,node_id,lesson_id,role,display_order").in("course_id", courseIds).in("node_id", nodeIds), "Practice submission curriculum coverage"),
      allRows(client.from("curriculum_lessons").select("course_id,id,chapter_id,display_order").in("course_id", courseIds), "Practice submission lessons"),
      allRows(client.from("curriculum_chapters").select("course_id,id,display_order").in("course_id", courseIds), "Practice submission chapters"),
    ]);
    chapterNumbers = chapterNumbersByAssignment(assignmentCoverages, curriculumCoverages, lessons, chapters);
  }
  const courses = dataOrThrow(coursesResult.data as Row[] | null, coursesResult.error, "Practice submission courses");
  const assignments = dataOrThrow(assignmentsResult.data as Row[] | null, assignmentsResult.error, "Practice submission assignments");
  const courseTitle = new Map(courses.map(course => [text(course, "id"), text(course, "title")]));
  const assignmentTitle = new Map(assignments.map(assignment => [`${text(assignment, "course_id")}:${text(assignment, "id")}`, text(assignment, "title")]));

  return {
    items: states.flatMap(state => {
      const courseId = text(state, "course_id");
      const assignmentId = text(state, "assignment_id");
      const status = practiceSubmissionStatus(text(state, "status"));
      if (!status) return [];
      const key = `${courseId}:${assignmentId}`;
      const attempt = latestAttempt.get(key);
      const attemptId = attempt ? text(attempt, "id") : undefined;
      const content = attempt ? practiceSubmissionContent(attempt.response) : undefined;
      const score = attemptId ? scores.get(attemptId) : undefined;
      const chapterNumber = chapterNumbers.get(key);
      const submittedAt = attempt?.submitted_at == null ? state.submitted_at : attempt.submitted_at;
      return [{
        courseId,
        assignmentId,
        courseTitle: courseTitle.get(courseId) ?? courseId,
        assignmentTitle: assignmentTitle.get(key) ?? assignmentId,
        status,
        // A submitted/needs-revision/accepted state proves at least one submission even when legacy
        // rows predate learning_attempts; drafts keep null so no attempt is invented.
        attemptNumber: attempt ? Number(attempt.attempt_number) : status === "draft" ? null : 1,
        updatedAt: text(state, "updated_at"),
        ...(submittedAt == null ? {} : { submittedAt: String(submittedAt) }),
        ...(state.accepted_at == null ? {} : { acceptedAt: text(state, "accepted_at") }),
        ...(chapterNumber === undefined ? {} : { chapterNumber }),
        ...(score === undefined ? {} : { score }),
        ...(content === undefined ? {} : { content }),
      }];
    }),
  };
}
