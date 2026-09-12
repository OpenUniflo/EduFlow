import { assignmentEligibility } from '@/shared/learning/assignmentEligibility';
import type { CourseRuntimeData } from './runtime/courseRuntime';
import type { UserKnowledgeRecord } from '@/features/profile/types';
import type { UserCourseState } from './types';
import type { AssignmentExperience } from "@/features/course/types";

export function evaluateTraceSelection(experience: AssignmentExperience, selectedStepId: string) {
  return Boolean(experience.faultyStepId && selectedStepId === experience.faultyStepId);
}


/** Adapt persisted course definitions and learner state to the shared eligibility rule. */
export function courseAssignmentEligibility(runtime: CourseRuntimeData, assignmentId: string, knowledge: UserKnowledgeRecord[], courseState?: UserCourseState) {
  const coverage = runtime.assignmentCoverages.filter(item => item.assignmentId === assignmentId);
  const nodes = new Set(runtime.curriculumCoverages.map(item => item.nodeId));
  const statuses = new Map(knowledge.map(item => [item.nodeId, item.status]));
  return assignmentEligibility({
    published: runtime.course.lifecycle === 'published',
    coverageValid: runtime.assignments.some(item => item.id === assignmentId && item.courseId === runtime.course.id) && coverage.every(item => nodes.has(item.nodeId)),
    knowledgeStatuses: coverage.map(item => statuses.get(item.nodeId)),
    hardDependencyStatuses: runtime.assignmentDependencies.filter(item => item.targetAssignmentId === assignmentId && item.strength === 'hard').map(item => courseState?.assignmentStates[item.sourceAssignmentId]?.status),
    status: courseState?.assignmentStates[assignmentId]?.status,
  });
}
