import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserAssignmentState, UserAssignmentStatus, UserCourseState } from "@/features/course/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import { buildMyCourses, buildMyTaskRows, isMyCourseInProgress } from "./myPanelProjection";

type AssignmentFixture = { id: string; title: string; order: number };

function runtime(courseId: string, title: string, nodeIds: string[], assignments: AssignmentFixture[] = []): CourseRuntimeData {
  return {
    course: { id: courseId, title, description: "", lifecycle: "published" },
    curriculum: { id: `${courseId}-curriculum`, courseId, generationMode: "manual" },
    chapters: [{ id: `${courseId}-chapter`, courseId, title: "Chapter", description: "", order: 0, color: "#6078db", outcome: "" }],
    lessons: [{ id: `${courseId}-lesson`, courseId, chapterId: `${courseId}-chapter`, title: "Lesson", order: 0 }],
    curriculumCoverages: nodeIds.map((nodeId, order) => ({ id: `${courseId}-coverage-${order}`, courseId, lessonId: `${courseId}-lesson`, nodeId, role: "introduce" as const, order })),
    curriculumSequences: [],
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      courseId,
      order: assignment.order,
      title: assignment.title,
      description: "",
      requirements: [],
      expectedOutput: "",
      acceptanceCriteria: [],
      mode: "instruction"
    })),
    assignmentCoverages: assignments.map((assignment, order) => ({ id: `${courseId}-assignment-coverage-${order}`, assignmentId: assignment.id, nodeId: nodeIds[0]!, role: "practice" as const })),
    assignmentDependencies: [],
    chapterOutcomes: [],
    assignmentOutcomeCompositions: [],
    finalProjects: [],
    finalProjectOutcomeCompositions: [],
    materials: [],
    materialKnowledgeCoverages: [],
    revision: "v1"
  };
}

function assignmentState(assignmentId: string, status: UserAssignmentStatus, updatedAt?: string): UserAssignmentState {
  return { assignmentId, status, ...(updatedAt ? { updatedAt } : {}) };
}

function state(courseId: string, assignmentStates: UserAssignmentState[], updatedAt: string, isActive = true): UserCourseState {
  return {
    userId: "learner",
    courseId,
    isActive,
    assignmentStates: Object.fromEntries(assignmentStates.map((entry) => [entry.assignmentId, entry])),
    materialStates: {},
    updatedAt
  };
}

const learned = (nodeId: string, updatedAt = "2026-01-01T00:00:00Z"): UserKnowledgeRecord => ({ nodeId, status: "learned", updatedAt });

describe("My current Courses", () => {
  it("lists every active unfinished Course, newest activity first, and excludes a completed Course", () => {
    const older = runtime("older", "Older Course", ["older-node-1", "older-node-2"]);
    const newer = runtime("newer", "Newer Course", ["newer-node"]);
    const finished = runtime("finished", "Finished Course", ["finished-node"]);
    const records = [learned("older-node-1"), learned("finished-node")];
    const nextStepByCourse = new Map([
      ["older", { kind: "micro" as const, title: "下一步小练习" }],
      ["newer", { kind: "assignment" as const, title: "下一个任务" }]
    ]);
    const courses = buildMyCourses({
      courses: [
        { runtime: older, state: state("older", [], "2026-01-01T00:00:00Z") },
        { runtime: newer, state: state("newer", [], "2026-01-03T00:00:00Z") },
        { runtime: finished, state: state("finished", [], "2026-01-04T00:00:00Z") }
      ],
      records,
      nextStepByCourse
    });
    expect(courses.map((course) => course.id)).toEqual(["newer", "older"]);
    expect(courses.find((course) => course.id === "older")).toMatchObject({ learned: 1, total: 2, nextStep: { kind: "micro", title: "下一步小练习" } });
    expect(courses.find((course) => course.id === "newer")?.nextStep).toEqual({ kind: "assignment", title: "下一个任务" });
  });

  it("keeps a Course current while an Assignment is unfinished even when all Knowledge is learned", () => {
    const course = runtime("course", "Course", ["node"], [{ id: "task", title: "Task", order: 0 }]);
    expect(isMyCourseInProgress(course, state("course", [assignmentState("task", "submitted")], "2026-01-01"), [learned("node")])).toBe(true);
    expect(isMyCourseInProgress(course, state("course", [assignmentState("task", "accepted")], "2026-01-01"), [learned("node")])).toBe(false);
    expect(isMyCourseInProgress(course, state("course", [assignmentState("task", "accepted")], "2026-01-01", false), [learned("node")])).toBe(false);
  });
});

describe("My required task rows", () => {
  const first = runtime("course-a", "Course A", ["a-node"], [
    { id: "a-next", title: "A next", order: 0 },
    { id: "a-fix", title: "A fix", order: 1 }
  ]);
  const second = runtime("course-b", "Course B", ["b-node"], [
    { id: "b-next", title: "B next", order: 0 },
    { id: "b-wait", title: "B wait", order: 1 }
  ]);

  it("lists only each Course's next Assignment when every real task is untouched", () => {
    const rows = buildMyTaskRows({
      courses: [
        { runtime: first, state: state("course-a", [], "2026-01-01"), nextAssignmentId: "a-next" },
        { runtime: second, state: state("course-b", [], "2026-01-02"), nextAssignmentId: "b-next" }
      ]
    });
    expect(rows.map((row) => row.id)).toEqual(["course-b:b-next", "course-a:a-next"]);
    expect(rows.every((row) => row.kind === "next")).toBe(true);
  });

  it("orders needs_revision > in_progress > next > pending and keeps Courses on the row", () => {
    const rows = buildMyTaskRows({
      courses: [
        { runtime: first, state: state("course-a", [
          assignmentState("a-fix", "needs_revision", "2026-01-01T00:00:00Z"),
          assignmentState("a-next", "not_started")
        ], "2026-01-01"), nextAssignmentId: "a-next" },
        { runtime: second, state: state("course-b", [
          assignmentState("b-next", "started", "2026-01-05T00:00:00Z"),
          assignmentState("b-wait", "submitted", "2026-01-06T00:00:00Z")
        ], "2026-01-06") }
      ]
    });
    expect(rows.map((row) => `${row.kind}:${row.id}`)).toEqual([
      "needs_revision:course-a:a-fix",
      "in_progress:course-b:b-next",
      "next:course-a:a-next",
      "pending:course-b:b-wait"
    ]);
    expect(rows.find((row) => row.assignmentId === "a-fix")?.courseTitle).toBe("Course A");
  });

  it("sorts the same urgency by the latest task update, then deterministically", () => {
    const rows = buildMyTaskRows({
      courses: [
        { runtime: first, state: state("course-a", [
          assignmentState("a-fix", "started", "2026-01-02T00:00:00Z"),
          assignmentState("a-next", "started", "2026-01-04T00:00:00Z")
        ], "2026-01-04") },
        { runtime: second, state: state("course-b", [
          assignmentState("b-next", "started", "2026-01-03T00:00:00Z")
        ], "2026-01-03") }
      ]
    });
    expect(rows.map((row) => row.assignmentId)).toEqual(["a-next", "b-next", "a-fix"]);
  });

  it("treats an unsubmitted draft as in progress and never duplicates the route's next task", () => {
    const rows = buildMyTaskRows({
      courses: [{ runtime: first, state: state("course-a", [assignmentState("a-next", "not_started")], "2026-01-01"), nextAssignmentId: "a-next" }],
      draftAssignmentKeys: new Set(["course-a:a-next"])
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "course-a:a-next", kind: "in_progress", status: "not_started" });
  });

  it("returns no rows when nothing needs action, including an already accepted next Assignment", () => {
    const rows = buildMyTaskRows({
      courses: [{ runtime: second, state: state("course-b", [assignmentState("b-next", "accepted")], "2026-01-01"), nextAssignmentId: "b-next" }]
    });
    expect(rows).toEqual([]);
  });
});
