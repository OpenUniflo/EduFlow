import type { SupabaseClient } from "@supabase/supabase-js";
import { dataOrThrow } from "./query.js";
import { buildFirstSegment, type AssignmentProgressStatus, type FirstSegment, type LearnerEvidenceStatus } from "../../src/shared/learning/firstSegment.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
type Query = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

async function allRows(query: Query, label: string): Promise<Row[]> {
  const result = await query;
  return dataOrThrow(result.data as Row[] | null, result.error as never, label);
}

export type CourseSegmentRead = { segment: FirstSegment; orderedNodeIds: string[]; chapterOneNodeIds: string[]; knowledgeStatusByNode: ReadonlyMap<string, LearnerEvidenceStatus> };

/**
 * Server-side read of the same data-driven first segment the UI renders. Only
 * curriculum order, real Micro/Assignment assets and the learner's own state
 * participate; no Course identity is hard-coded.
 */
export async function readCourseSegment(client: SupabaseClient, userId: string, courseId: string): Promise<CourseSegmentRead> {
  const [lessons, coverages, micros, assignments, assignmentCoverages, knowledge, assignmentStates, chapters] = await Promise.all([
    allRows(client.from("curriculum_lessons").select("id,display_order,chapter_id").eq("course_id", courseId).order("display_order"), "Segment Lesson order"),
    allRows(client.from("curriculum_coverages").select("node_id,lesson_id,display_order").eq("course_id", courseId).order("display_order"), "Segment coverage order"),
    allRows(client.from("micro_learning_paths").select("id,knowledge_id,title,estimated_minutes").eq("course_id", courseId).eq("status", "published").eq("mode", "learn").order("id"), "Segment Micro paths"),
    allRows(client.from("course_assignments").select("id,title,estimated_minutes,display_order").eq("course_id", courseId).order("display_order"), "Segment Assignments"),
    allRows(client.from("assignment_coverages").select("assignment_id,node_id").eq("course_id", courseId).order("assignment_id"), "Segment Assignment coverages"),
    allRows(client.from("user_knowledge_states").select("node_id,status").eq("user_id", userId), "Segment learner Knowledge"),
    allRows(client.from("user_assignment_states").select("assignment_id,status").eq("user_id", userId).eq("course_id", courseId), "Segment learner Assignments"),
    allRows(client.from("curriculum_chapters").select("id,display_order").eq("course_id", courseId).order("display_order"), "Segment chapters")
  ]);
  const lessonOrder = new Map(lessons.map((lesson) => [text(lesson, "id"), Number(lesson.display_order)]));
  const orderedNodeIds = [...coverages]
    .sort((left, right) => (lessonOrder.get(text(left, "lesson_id")) ?? Number.MAX_SAFE_INTEGER) - (lessonOrder.get(text(right, "lesson_id")) ?? Number.MAX_SAFE_INTEGER)
      || Number(left.display_order) - Number(right.display_order)
      || text(left, "node_id").localeCompare(text(right, "node_id")))
    .map((row) => text(row, "node_id"))
    .filter((nodeId, index, values) => values.indexOf(nodeId) === index);
  const microByNode = new Map(micros.map((row) => [text(row, "knowledge_id"), {
    pathId: text(row, "id"),
    title: text(row, "title"),
    ...(Number(row.estimated_minutes) > 0 ? { estimatedMinutes: Number(row.estimated_minutes) } : {})
  }]));
  const assignmentById = new Map(assignments.map((row) => [text(row, "id"), row]));
  const practiceByNode = new Map<string, { assignmentId: string; title: string; estimatedMinutes?: number }>();
  for (const coverage of assignmentCoverages) {
    const nodeId = text(coverage, "node_id");
    if (practiceByNode.has(nodeId)) continue;
    const assignment = assignmentById.get(text(coverage, "assignment_id"));
    if (!assignment) continue;
    practiceByNode.set(nodeId, {
      assignmentId: text(assignment, "id"),
      title: text(assignment, "title"),
      ...(Number(assignment.estimated_minutes) > 0 ? { estimatedMinutes: Number(assignment.estimated_minutes) } : {})
    });
  }
  const statusByNode = new Map(knowledge.map((row) => [text(row, "node_id"), text(row, "status") as LearnerEvidenceStatus]));
  const assignmentStatus = new Map(assignmentStates.map((row) => [text(row, "assignment_id"), text(row, "status") as AssignmentProgressStatus]));
  const segment = buildFirstSegment({ orderedNodeIds, microByNode, practiceByNode, knowledgeStatusByNode: statusByNode, assignmentStatusByAssignment: assignmentStatus });
  const firstChapter = chapters[0];
  const chapterLessonIds = new Set(lessons.filter((lesson) => text(lesson, "chapter_id") === (firstChapter ? text(firstChapter, "id") : "")).map((lesson) => text(lesson, "id")));
  const chapterOneNodeIds = orderedNodeIds.filter((nodeId) => coverages.some((coverage) => text(coverage, "node_id") === nodeId && chapterLessonIds.has(text(coverage, "lesson_id"))));
  return { segment, orderedNodeIds, chapterOneNodeIds, knowledgeStatusByNode: statusByNode };
}

export function firstChapterFinished(read: CourseSegmentRead) {
  const learned = new Set(["learned", "practicing", "mastered"]);
  return read.chapterOneNodeIds.length > 0 && read.chapterOneNodeIds.every((nodeId) => learned.has(read.knowledgeStatusByNode.get(nodeId) ?? ""));
}
