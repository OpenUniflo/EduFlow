/** The only durable learner-facing Knowledge-state progression. */
export type UserKnowledgeStatus = "explore" | "learning" | "learned" | "practicing" | "mastered";

const rank: Record<UserKnowledgeStatus, number> = {
  explore: 0,
  learning: 1,
  learned: 2,
  practicing: 3,
  mastered: 4
};

export function advanceKnowledgeState(current: UserKnowledgeStatus | undefined, requested: UserKnowledgeStatus) {
  return !current || rank[requested] > rank[current] ? requested : current;
}

export function stateForLearningEvent(event: "start_knowledge" | "learn_path_completed" | "assignment_started" | "mastery_satisfied") {
  return ({ start_knowledge: "learning", learn_path_completed: "learned", assignment_started: "practicing", mastery_satisfied: "mastered" } as const)[event];
}

export function hasSatisfiedMasteryPolicy(input: { requiredLearnPathCompleted: boolean; requiredAssignmentIds: readonly string[]; acceptedAssignmentIds: readonly string[] }) {
  if (!input.requiredLearnPathCompleted) return false;
  if (!input.requiredAssignmentIds.length) return false;
  const accepted = new Set(input.acceptedAssignmentIds);
  return input.requiredAssignmentIds.every((id) => accepted.has(id));
}
