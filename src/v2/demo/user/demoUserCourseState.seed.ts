import { userAssignmentStates as agenticAssignmentStates } from "../courses/agenticAiCourse.seed";
import { pythonEngineeringAssignments } from "../courses/pythonEngineeringCourse.seed";
import type { UserAssignmentState, UserCourseState } from "../../types";

const DEMO_TIME = "2026-08-09T08:00:00.000Z";

function record(states: UserAssignmentState[]) {
  return Object.fromEntries(states.map((state) => [state.assignmentId, state]));
}

export function demoUserCourseStateSeed(userId: string, courseId: string): UserCourseState {
  if (courseId === "agentic-ai") {
    return {
      userId,
      courseId,
      assignmentStates: record(agenticAssignmentStates),
      materialStates: {
        "lesson-04": { materialId: "lesson-04", recentSegmentId: "page-12", progress: 34, viewedSegmentIds: Array.from({ length: 11 }, (_, index) => `page-${String(index + 1).padStart(2, "0")}`), updatedAt: DEMO_TIME }
      },
      recentLessonId: "L04",
      updatedAt: DEMO_TIME
    };
  }
  if (courseId === "python-engineering") {
    const states = pythonEngineeringAssignments.map<UserAssignmentState>((assignment, index) => ({
      assignmentId: assignment.id,
      status: index < 2 ? "completed" : index < 4 ? "in-progress" : "not-started",
      progress: index < 2 ? 100 : index === 2 ? 65 : index === 3 ? 30 : 0
    }));
    return {
      userId,
      courseId,
      assignmentStates: record(states),
      materialStates: {
        "python-core-handbook": { materialId: "python-core-handbook", recentSegmentId: "core-module", progress: 50, viewedSegmentIds: ["core-control", "core-scope"], updatedAt: "2026-08-08T08:00:00.000Z" },
        "python-async-service-guide": { materialId: "python-async-service-guide", recentSegmentId: "async-event-loop", progress: 25, viewedSegmentIds: ["async-event-loop"], updatedAt: "2026-08-07T08:00:00.000Z" }
      },
      recentLessonId: "PY-L03",
      updatedAt: "2026-08-08T08:00:00.000Z"
    };
  }
  return { userId, courseId, assignmentStates: {}, materialStates: {}, updatedAt: DEMO_TIME };
}
