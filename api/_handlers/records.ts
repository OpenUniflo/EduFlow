import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { allRows } from "../_lib/query.js";
import {
  RECORD_EVENT_TYPES,
  RECORD_RANGES,
  DEFAULT_RECORD_TIME_ZONE,
  decodeRecordCursor,
  filterRecordEvents,
  countEventsByType,
  isValidTimeZone,
  mapRecordEvents,
  paginateRecordEvents,
  summarizeEvents,
  uniqueCourseIdsFromEvents,
  dateKeyInTimeZone,
  type RecordCourseOption,
  type RecordEventType,
  type RecordRange,
  type RecordsResponse
} from "../../src/shared/learning/records.js";

type Row = Record<string, unknown>;

export type RecordsQuery = {
  types: RecordEventType[];
  courseId: string | null;
  range: RecordRange;
  limit: number;
  cursor: string | null;
  timeZone: string;
  /** Test-only clock; never read from the request. */
  now?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (row: Row, key: string) => {
  const value = row[key];
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
};

function queryList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => typeof item === "string" ? item.split(",") : []);
  if (typeof value === "string") return value.split(",");
  return [];
}

export function parseRecordsQuery(query: Record<string, unknown>): RecordsQuery {
  const requestedTypes = [...new Set(queryList(query.types).map((value) => value.trim()).filter(Boolean))];
  const unknownType = requestedTypes.find((value) => !(RECORD_EVENT_TYPES as readonly string[]).includes(value));
  if (unknownType) throw new ApiError(400, "invalid_records_type", `Unknown record type: ${unknownType}`);
  const types = RECORD_EVENT_TYPES.filter((type) => requestedTypes.includes(type));

  const rawRange = typeof query.range === "string" ? query.range : "all";
  if (!(RECORD_RANGES as readonly string[]).includes(rawRange)) throw new ApiError(400, "invalid_records_range", "Unknown record time range");

  const courseId = typeof query.courseId === "string" ? query.courseId.trim() : "";
  if (courseId.length > 200) throw new ApiError(400, "invalid_records_course", "Course id is too long");

  const rawLimit = typeof query.limit === "string" ? Number(query.limit) : typeof query.limit === "number" ? query.limit : 20;
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) throw new ApiError(400, "invalid_records_limit", "Limit must be between 1 and 50");

  const rawTimeZone = typeof query.tz === "string" && query.tz.trim() ? query.tz.trim() : DEFAULT_RECORD_TIME_ZONE;
  if (!isValidTimeZone(rawTimeZone)) throw new ApiError(400, "invalid_records_timezone", "Unknown IANA time zone");

  const rawCursor = typeof query.cursor === "string" && query.cursor ? query.cursor : null;
  const cursor = rawCursor ? decodeRecordCursor(rawCursor) : null;
  if (rawCursor && !cursor) throw new ApiError(400, "invalid_records_cursor", "Cursor is invalid");

  return {
    types,
    courseId: courseId || null,
    range: rawRange as RecordRange,
    limit: rawLimit,
    cursor: rawCursor,
    timeZone: rawTimeZone
  };
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function rowsIn(
  client: SupabaseClient,
  table: string,
  select: string,
  column: string,
  ids: readonly string[],
  operation: string
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const part of chunk(ids, 100)) {
    if (!part.length) continue;
    rows.push(...await allRows(client.from(table).select(select).in(column, part), operation) as Row[]);
  }
  return rows;
}

/** Service-role lookups still pin the token owner, never a browser-supplied id. */
async function rowsInOwned(
  client: SupabaseClient,
  table: string,
  select: string,
  column: string,
  ids: readonly string[],
  ownerColumn: string,
  ownerId: string,
  operation: string
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const part of chunk(ids, 100)) {
    if (!part.length) continue;
    rows.push(...await allRows(client.from(table).select(select).eq(ownerColumn, ownerId).in(column, part), operation) as Row[]);
  }
  return rows;
}

function contextCourseId(row: Row): string {
  const context = row.context && typeof row.context === "object" && !Array.isArray(row.context) ? row.context as Row : null;
  return context ? text(context, "courseId") : "";
}

function responseRunId(row: Row): string {
  const response = row.response && typeof row.response === "object" && !Array.isArray(row.response) ? row.response as Row : null;
  return response && text(response, "kind") === "workflow" ? text(response, "runId") : "";
}

/**
 * Read-only, token-scoped records projection.
 *
 * Every learner-owned query filters on the authenticated `userId` in addition
 * to RLS. Immutable Attempt/Result rows are the source for practice submission
 * and evaluation events; `learning_events` mirrors those transitions and does
 * not add learner-facing content beyond them. `workflowClient` may be the
 * server client because V2 run metadata is not exposed through the authenticated
 * Data API; that lookup is still scoped to the token-derived owner id.
 */
export async function readRecords(
  client: SupabaseClient,
  userId: string,
  options: RecordsQuery,
  workflowClient: SupabaseClient = client
): Promise<RecordsResponse> {
  const now = options.now ?? new Date().toISOString();
  const [microEvidence, attempts, results, routeVersions] = await Promise.all([
    allRows(client.from("knowledge_evidence")
      .select("id,node_id,event_type,source_entity_id,context,occurred_at")
      .eq("user_id", userId)
      .eq("event_type", "micro_path_completed")
      .order("occurred_at", { ascending: false }), "Learning records micro evidence"),
    allRows(client.from("learning_attempts")
      .select("id,course_id,assignment_id,attempt_number,response,submitted_at,action_run_id")
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false }), "Learning records practice attempts"),
    allRows(client.from("performance_results")
      .select("id,attempt_id,course_id,assignment_id,version,outcome,score,feedback,evaluator_kind,evaluated_at")
      .eq("user_id", userId)
      .order("evaluated_at", { ascending: false }), "Learning records performance results"),
    allRows(client.from("personal_course_route_versions")
      .select("id,course_id,version_number,source,include_node_ids,exclude_node_ids,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }), "Learning records route versions")
  ]) as Row[][];

  const courseIds = [...new Set([
    ...attempts.map((row) => text(row, "course_id")),
    ...results.map((row) => text(row, "course_id")),
    ...routeVersions.map((row) => text(row, "course_id")),
    ...microEvidence.map(contextCourseId)
  ].filter(Boolean))];
  const nodeIds = [...new Set(microEvidence.map((row) => text(row, "node_id")).filter(Boolean))];
  const assignmentIds = new Set([...attempts, ...results].map((row) => text(row, "assignment_id")).filter(Boolean));

  const [courses, knowledge, assignments, curriculumCoverages, lessons, chapters, assignmentCoverages, microPaths] = await Promise.all([
    rowsIn(client, "courses", "id,title", "id", courseIds, "Learning records courses"),
    rowsIn(client, "knowledge_nodes", "id,title", "id", nodeIds, "Learning records knowledge"),
    rowsIn(client, "course_assignments", "course_id,id,title", "course_id", courseIds, "Learning records assignments"),
    rowsIn(client, "curriculum_coverages", "id,course_id,node_id,lesson_id,role,display_order", "course_id", courseIds, "Learning records curriculum coverage"),
    rowsIn(client, "curriculum_lessons", "course_id,id,chapter_id,display_order", "course_id", courseIds, "Learning records lessons"),
    rowsIn(client, "curriculum_chapters", "course_id,id,display_order", "course_id", courseIds, "Learning records chapters"),
    rowsIn(client, "assignment_coverages", "course_id,assignment_id,node_id", "course_id", courseIds, "Learning records assignment coverage"),
    rowsIn(client, "micro_learning_paths", "id,knowledge_id,course_id,scope,title,estimated_minutes,status,mode", "knowledge_id", nodeIds, "Learning records micro paths")
  ]);

  // Assignment coverage can reference Knowledge that has no Micro evidence yet;
  // fetch those titles too so a practice/evaluation can link to its real Knowledge.
  const knownNodeIds = new Set(knowledge.map((row) => text(row, "id")));
  const missingCoverageNodeIds = [...new Set(assignmentCoverages.map((row) => text(row, "node_id")).filter(Boolean))]
    .filter((id) => !knownNodeIds.has(id));
  if (missingCoverageNodeIds.length) {
    knowledge.push(...await rowsIn(client, "knowledge_nodes", "id,title", "id", missingCoverageNodeIds, "Learning records covered knowledge"));
  }

  const runIds = [...new Set(attempts.map(responseRunId).filter((id) => UUID.test(id)))];
  let liveWorkflows: Array<{ runId: string; workflowId: string }> = [];
  if (runIds.length) {
    try {
      const liveRuns = await rowsInOwned(workflowClient, "workflow_live_runs", "run_id,workflow_id", "run_id", runIds, "owner_user_id", userId, "Learning records workflow runs");
      const workflowIds = [...new Set(liveRuns.map((row) => text(row, "workflow_id")).filter(Boolean))];
      if (workflowIds.length) {
        const definitions = await rowsInOwned(workflowClient, "workflow_v2_definitions", "workflow_id", "workflow_id", workflowIds, "owner_user_id", userId, "Learning records workflow definitions");
        const available = new Set(definitions.map((row) => text(row, "workflow_id")));
        liveWorkflows = liveRuns.flatMap((row) => {
          const runId = text(row, "run_id");
          const workflowId = text(row, "workflow_id");
          return runId && workflowId && available.has(workflowId) ? [{ runId, workflowId }] : [];
        });
      }
    } catch {
      // Workflow metadata is an optional link target. A missing/denied lookup
      // must not hide the learner's timeline.
      liveWorkflows = [];
    }
  }

  const events = mapRecordEvents({
    microEvidence,
    attempts,
    results,
    routeVersions,
    courses,
    knowledge,
    assignments,
    microPaths,
    curriculumCoverages,
    assignmentCoverages: assignmentCoverages.filter((row) => assignmentIds.has(text(row, "assignment_id"))),
    lessons,
    chapters,
    liveWorkflows
  });

  const scoped = filterRecordEvents(events, { types: [], courseId: options.courseId, range: options.range }, now, options.timeZone);
  const counts = countEventsByType(scoped);
  const filtered = filterRecordEvents(events, { types: options.types, courseId: options.courseId, range: options.range }, now, options.timeZone);
  const page = paginateRecordEvents(filtered, options.cursor ? decodeRecordCursor(options.cursor) : null, options.limit);
  const summary = summarizeEvents(events, now, options.timeZone);

  const courseScoped = filterRecordEvents(events, { types: options.types, courseId: null, range: options.range }, now, options.timeZone);
  const countByCourse = new Map<string, number>();
  for (const event of courseScoped) if (event.courseId) countByCourse.set(event.courseId, (countByCourse.get(event.courseId) ?? 0) + 1);
  const courseTitle = new Map<string, string>();
  for (const course of courses) courseTitle.set(text(course, "id"), text(course, "title"));
  for (const event of events) if (event.courseId && event.courseTitle && !courseTitle.has(event.courseId)) courseTitle.set(event.courseId, event.courseTitle);
  const courseOptions: RecordCourseOption[] = uniqueCourseIdsFromEvents(events).map((id) => ({
    id,
    title: courseTitle.get(id) || "未命名课程",
    count: countByCourse.get(id) ?? 0
  })).sort((left, right) => left.title.localeCompare(right.title, "zh-CN") || left.id.localeCompare(right.id));

  const newest = filtered[0];
  const oldest = filtered[filtered.length - 1];

  return {
    summary,
    counts,
    courses: courseOptions,
    events: page.events,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    resultTotal: filtered.length,
    scope: {
      from: oldest ? dateKeyInTimeZone(oldest.occurredAt, options.timeZone) || null : null,
      to: newest ? dateKeyInTimeZone(newest.occurredAt, options.timeZone) || null : null
    },
    filters: {
      types: options.types,
      courseId: options.courseId,
      range: options.range,
      timeZone: options.timeZone
    }
  };
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const { client, user } = await createUserSupabase(request);
  const options = parseRecordsQuery(request.query as Record<string, unknown>);
  const workflowClient = createServerSupabase();
  const result = await readRecords(client, user.id, options, workflowClient);
  response.setHeader("Cache-Control", "private, no-store");
  json(response, 200, result);
});
