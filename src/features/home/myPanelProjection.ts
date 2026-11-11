import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserAssignmentStatus, UserCourseState } from "@/features/course/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";

export type MyCourseNextStep = {
  kind: "micro" | "material" | "assignment";
  title: string;
};

export type MyCourseOverview = {
  id: string;
  title: string;
  learned: number;
  total: number;
  updatedAt: string;
  nextStep?: MyCourseNextStep;
};

export type MyTaskKind = "needs_revision" | "in_progress" | "next" | "pending";

export type MyTaskOverview = {
  id: string;
  courseId: string;
  courseTitle: string;
  assignmentId: string;
  title: string;
  kind: MyTaskKind;
  status: UserAssignmentStatus;
  updatedAt?: string;
};

export type MyCourseTaskInput = {
  runtime: CourseRuntimeData;
  state: UserCourseState;
  /** The route's next Assignment, supplied by the existing navigation projection. */
  nextAssignmentId?: string | null;
};

const TASK_URGENCY: Record<MyTaskKind, number> = {
  needs_revision: 0,
  in_progress: 1,
  next: 2,
  pending: 3
};

function courseNodeIds(runtime: CourseRuntimeData) {
  return [...new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId))];
}

function isFinishedAssignment(status: UserAssignmentStatus | undefined) {
  return status === "accepted" || status === "completed";
}

function taskKindForStatus(status: UserAssignmentStatus | undefined): MyTaskKind | null {
  if (status === "needs_revision") return "needs_revision";
  if (status === "started" || status === "in-progress") return "in_progress";
  if (status === "submitted") return "pending";
  return null;
}

/**
 * A Course is still current while it has unfinished route Knowledge or any
 * unfinished Assignment. Reading membership (`isActive`) remains the durable
 * My-Courses signal; this only hides genuinely finished Courses.
 */
export function isMyCourseInProgress(runtime: CourseRuntimeData, state: UserCourseState, records: readonly UserKnowledgeRecord[]) {
  if (!state.isActive) return false;
  const statusByNode = new Map(records.map((record) => [record.nodeId, record.status]));
  const nodeIds = courseNodeIds(runtime);
  const learned = nodeIds.filter((nodeId) => satisfiesTeachingPrerequisite(statusByNode.get(nodeId))).length;
  const assignmentsDone = runtime.assignments.every((assignment) => isFinishedAssignment(state.assignmentStates[assignment.id]?.status));
  return learned < nodeIds.length || !assignmentsDone;
}

/**
 * Current Courses in recent-activity order. The row's next step is already
 * resolved from the server Navigation decision by the caller; nothing here
 * derives a second teaching order.
 */
export function buildMyCourses(input: {
  courses: ReadonlyArray<{ runtime: CourseRuntimeData; state: UserCourseState }>;
  records: readonly UserKnowledgeRecord[];
  nextStepByCourse?: ReadonlyMap<string, MyCourseNextStep>;
}): MyCourseOverview[] {
  const statusByNode = new Map(input.records.map((record) => [record.nodeId, record.status]));
  return input.courses
    .flatMap(({ runtime, state }) => {
      if (!isMyCourseInProgress(runtime, state, input.records)) return [];
      const nodeIds = courseNodeIds(runtime);
      const learned = nodeIds.filter((nodeId) => satisfiesTeachingPrerequisite(statusByNode.get(nodeId))).length;
      const nextStep = input.nextStepByCourse?.get(runtime.course.id);
      return [{
        id: runtime.course.id,
        title: runtime.course.title,
        learned,
        total: nodeIds.length,
        updatedAt: state.updatedAt,
        ...(nextStep ? { nextStep } : {})
      }];
    })
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.id.localeCompare(right.id));
}

/**
 * Every Assignment the learner must act on, across the given Courses:
 * needs_revision, started/drafted, the route's next Assignment, and submitted
 * (waiting read-only). Urgency beats recency; only equal urgency sorts by
 * latest update. Accepted work and untouched non-frontier work never appear.
 */
export function buildMyTaskRows(input: {
  courses: ReadonlyArray<MyCourseTaskInput>;
  /** `courseId:assignmentId` values with an unsubmitted local draft. */
  draftAssignmentKeys?: ReadonlySet<string>;
}): MyTaskOverview[] {
  const rows: Array<MyTaskOverview & { order: number }> = [];
  for (const course of input.courses) {
    const courseId = course.runtime.course.id;
    for (const assignment of course.runtime.assignments) {
      const assignmentState = course.state.assignmentStates[assignment.id];
      const status = assignmentState?.status ?? "not_started";
      const key = `${courseId}:${assignment.id}`;
      let kind = taskKindForStatus(status);
      if (!kind && !isFinishedAssignment(status) && input.draftAssignmentKeys?.has(key)) kind = "in_progress";
      if (!kind && assignment.id === course.nextAssignmentId && !isFinishedAssignment(status)) kind = "next";
      if (!kind) continue;
      rows.push({
        id: key,
        courseId,
        courseTitle: course.runtime.course.title,
        assignmentId: assignment.id,
        title: assignment.title,
        kind,
        status,
        updatedAt: assignmentState?.updatedAt ?? course.state.updatedAt,
        order: assignment.order
      });
    }
  }
  return rows
    .sort((left, right) => TASK_URGENCY[left.kind] - TASK_URGENCY[right.kind]
      || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
      || left.courseId.localeCompare(right.courseId)
      || left.order - right.order
      || left.assignmentId.localeCompare(right.assignmentId))
    .map(({ order: _order, ...row }) => row);
}
