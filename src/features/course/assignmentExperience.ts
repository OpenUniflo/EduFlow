import type { AssignmentExperience } from "@/features/course/types";

export function evaluateTraceSelection(experience: AssignmentExperience, selectedStepId: string) {
  return Boolean(experience.faultyStepId && selectedStepId === experience.faultyStepId);
}
