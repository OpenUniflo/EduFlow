import { latestContentSnapshot, readContentSnapshot } from "./content-import";

export type SnapshotValue = string | number | boolean | null;
export type SnapshotRow = Record<string, SnapshotValue>;

export type SnapshotAssignment = {
  courseId: string;
  id: string;
  displayOrder: number;
  mode: string;
  expectedOutput: string;
  experienceType?: string;
  faultyStepId?: string;
};

export type ContentExpectations = {
  snapshotPath: string;
  courseIds: string[];
  goldenCourseId: string;
  goldenChapterCount: number;
  goldenAssignments: SnapshotAssignment[];
  goldenAssignmentIds: string[];
  goldenAssignmentTypes: string[];
  traceAssignment: { id: string; faultyStepId: string };
  manualAssignmentId: string;
  otherCourseId: string;
  progressCourseId: string;
  progressLessonId: string;
  progressAssignmentId: string;
};

export const GOLDEN_COURSE_ID = "agentic-ai-golden";

const SNAPSHOT_TABLES = new Set([
  "courses",
  "course_assignments",
  "curriculum_chapters",
  "curriculum_lessons"
]);

const INSERT_HEADER = /^insert into public\.([a-z_]+) \(([^)]+)\) values \(/;
const CONFLICT_SUFFIX = ") on conflict ";

/**
 * Parses the INSERT statements emitted into a content snapshot. The parser only
 * understands the literal forms used by content export (single-quoted strings,
 * NULL, booleans and numbers) and ignores unrelated SQL.
 */
export function parseContentSnapshotSql(sql: string, tables: ReadonlySet<string> = SNAPSHOT_TABLES): Map<string, SnapshotRow[]> {
  const rowsByTable = new Map<string, SnapshotRow[]>();
  for (const rawLine of sql.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const header = INSERT_HEADER.exec(line);
    if (!header) continue;
    const table = header[1];
    if (!tables.has(table)) continue;
    const valuesStart = header[0].length;
    const conflictStart = line.lastIndexOf(CONFLICT_SUFFIX);
    const valuesEnd = conflictStart >= 0 ? conflictStart : line.endsWith(");") ? line.length - 2 : -1;
    if (valuesEnd < valuesStart) throw new Error(`Malformed content snapshot INSERT for public.${table}`);
    const columns = header[2].split(",").map((column) => column.trim());
    const values = parseSnapshotValues(line.slice(valuesStart, valuesEnd));
    if (columns.length !== values.length) {
      throw new Error(`Content snapshot INSERT for public.${table} has ${columns.length} columns but ${values.length} values`);
    }
    const rows = rowsByTable.get(table) ?? [];
    rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
    rowsByTable.set(table, rows);
  }
  return rowsByTable;
}

export function parseSnapshotValues(input: string): SnapshotValue[] {
  const values: SnapshotValue[] = [];
  let index = 0;
  const skipWhitespace = () => {
    while (index < input.length && /\s/.test(input[index])) index += 1;
  };
  skipWhitespace();
  while (index < input.length) {
    if (input[index] === "'") {
      index += 1;
      let value = "";
      while (index < input.length) {
        if (input[index] !== "'") {
          value += input[index];
          index += 1;
        } else if (input[index + 1] === "'") {
          value += "'";
          index += 2;
        } else {
          index += 1;
          break;
        }
      }
      values.push(value);
    } else {
      const start = index;
      while (index < input.length && input[index] !== ",") index += 1;
      const token = input.slice(start, index).trim();
      if (token.toUpperCase() === "NULL") values.push(null);
      else if (token === "true") values.push(true);
      else if (token === "false") values.push(false);
      else if (/^-?\d+(?:\.\d+)?$/.test(token)) values.push(Number(token));
      else throw new Error(`Unsupported content snapshot value: ${token.slice(0, 80)}`);
    }
    skipWhitespace();
    if (index >= input.length) break;
    if (input[index] !== ",") throw new Error(`Malformed content snapshot value list near: ${input.slice(index, index + 40)}`);
    index += 1;
    skipWhitespace();
  }
  return values;
}

function text(value: SnapshotValue | undefined, table: string, column: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Content snapshot public.${table}.${column} must be a non-empty string`);
  return value;
}

function jsonObject(value: SnapshotValue | undefined) {
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function numberValue(value: SnapshotValue | undefined) {
  return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER;
}

function toAssignment(row: SnapshotRow): SnapshotAssignment {
  const experience = jsonObject(row.experience);
  return {
    courseId: text(row.course_id, "course_assignments", "course_id"),
    id: text(row.id, "course_assignments", "id"),
    displayOrder: numberValue(row.display_order),
    mode: typeof row.mode === "string" ? row.mode : "",
    expectedOutput: typeof row.expected_output === "string" ? row.expected_output : "",
    experienceType: typeof experience?.type === "string" ? experience.type : undefined,
    faultyStepId: typeof experience?.faultyStepId === "string" ? experience.faultyStepId : undefined
  };
}

export function deriveContentExpectations(snapshotPath: string): ContentExpectations {
  const snapshot = readContentSnapshot(snapshotPath);
  const rows = parseContentSnapshotSql(snapshot.sql);
  const courses = rows.get("courses") ?? [];
  const courseIds = [...new Set(courses.map((row) => text(row.id, "courses", "id")))].sort();
  if (courseIds.length === 0) throw new Error("Content snapshot contains no public.courses rows");
  if (!courseIds.includes(GOLDEN_COURSE_ID)) throw new Error(`Content snapshot is missing the Golden Course ${GOLDEN_COURSE_ID}`);

  const assignments = (rows.get("course_assignments") ?? []).map(toAssignment);
  const answerAssignmentIds = assignments.filter((assignment) => assignment.experienceType === "answer").map((assignment) => assignment.id);
  if (answerAssignmentIds.length > 0) {
    throw new Error(`Content snapshot still contains answer Practices: ${answerAssignmentIds.join(", ")}`);
  }
  const assignmentsWithoutSubmissionContract = assignments.filter((assignment) => !assignment.mode || !assignment.expectedOutput);
  if (assignmentsWithoutSubmissionContract.length > 0) {
    throw new Error(`Content snapshot Practices without a submission contract: ${assignmentsWithoutSubmissionContract.map((assignment) => assignment.id).join(", ")}`);
  }

  const goldenAssignments = assignments.filter((assignment) => assignment.courseId === GOLDEN_COURSE_ID);
  if (goldenAssignments.length === 0) throw new Error(`Content snapshot Golden Course ${GOLDEN_COURSE_ID} has no Practices`);
  const goldenChapterCount = (rows.get("curriculum_chapters") ?? []).filter((row) => row.course_id === GOLDEN_COURSE_ID).length;
  if (goldenChapterCount === 0) throw new Error(`Content snapshot Golden Course ${GOLDEN_COURSE_ID} has no chapters`);
  const goldenAssignmentTypes = [...new Set(goldenAssignments.map((assignment) => assignment.experienceType ?? "artifact"))].sort();

  const traceAssignment = goldenAssignments.find((assignment) => assignment.experienceType === "trace" && assignment.faultyStepId);
  if (!traceAssignment?.faultyStepId) throw new Error("Content snapshot Golden Course needs a trace Practice with faultyStepId");
  const manualAssignment = goldenAssignments.find((assignment) => assignment.experienceType === "code");
  if (!manualAssignment) throw new Error("Content snapshot Golden Course needs a code Practice for manual review");

  const otherCourseId = courseIds.find((courseId) => courseId !== GOLDEN_COURSE_ID);
  if (!otherCourseId) throw new Error("Content snapshot needs a second Course for cross-Course checks");
  const lessons = rows.get("curriculum_lessons") ?? [];
  const progressCourseId = courseIds.find((courseId) => courseId !== GOLDEN_COURSE_ID
    && lessons.some((row) => row.course_id === courseId)
    && assignments.some((assignment) => assignment.courseId === courseId));
  if (!progressCourseId) throw new Error("Content snapshot needs a Course with Lessons and Practices for progress checks");
  const progressLesson = lessons
    .filter((row) => row.course_id === progressCourseId)
    .sort((left, right) => numberValue(left.display_order) - numberValue(right.display_order))[0];
  if (!progressLesson) throw new Error(`Content snapshot Course ${progressCourseId} has no Lessons`);
  const progressAssignment = assignments
    .filter((assignment) => assignment.courseId === progressCourseId)
    .sort((left, right) => left.displayOrder - right.displayOrder)[0];
  if (!progressAssignment) throw new Error(`Content snapshot Course ${progressCourseId} has no Practices`);

  return {
    snapshotPath,
    courseIds,
    goldenCourseId: GOLDEN_COURSE_ID,
    goldenChapterCount,
    goldenAssignments,
    goldenAssignmentIds: goldenAssignments.map((assignment) => assignment.id).sort(),
    goldenAssignmentTypes,
    traceAssignment: { id: traceAssignment.id, faultyStepId: traceAssignment.faultyStepId },
    manualAssignmentId: manualAssignment.id,
    otherCourseId,
    progressCourseId,
    progressLessonId: text(progressLesson.id, "curriculum_lessons", "id"),
    progressAssignmentId: progressAssignment.id
  };
}

export function loadContentExpectations(directory?: string): ContentExpectations {
  return deriveContentExpectations(latestContentSnapshot(directory));
}
