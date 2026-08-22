import { describe, expect, it } from "vitest";
import { advanceKnowledgeState, hasSatisfiedMasteryPolicy, stateForLearningEvent } from "./learningState";

describe("durable Knowledge-state policy", () => {
  it("never downgrades a stronger learner state", () => {
    expect(advanceKnowledgeState("mastered", "learning")).toBe("mastered");
    expect(advanceKnowledgeState("practicing", "learned")).toBe("practicing");
    expect(advanceKnowledgeState("learning", "practicing")).toBe("practicing");
  });

  it("centralizes state intent for each product action", () => {
    expect(stateForLearningEvent("start_knowledge")).toBe("learning");
    expect(stateForLearningEvent("learn_path_completed")).toBe("learned");
    expect(stateForLearningEvent("assignment_started")).toBe("practicing");
    expect(stateForLearningEvent("mastery_satisfied")).toBe("mastered");
  });

  it("requires both a Learn path and every explicitly required Assignment for mastery", () => {
    expect(hasSatisfiedMasteryPolicy({ requiredLearnPathCompleted: true, requiredAssignmentIds: ["a"], acceptedAssignmentIds: [] })).toBe(false);
    expect(hasSatisfiedMasteryPolicy({ requiredLearnPathCompleted: true, requiredAssignmentIds: ["a", "b"], acceptedAssignmentIds: ["a"] })).toBe(false);
    expect(hasSatisfiedMasteryPolicy({ requiredLearnPathCompleted: true, requiredAssignmentIds: ["a", "b"], acceptedAssignmentIds: ["a", "b"] })).toBe(true);
    expect(hasSatisfiedMasteryPolicy({ requiredLearnPathCompleted: true, requiredAssignmentIds: [], acceptedAssignmentIds: [] })).toBe(false);
  });
});
