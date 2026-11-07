import { describe, expect, it } from "vitest";
import { collectSkippedCompletedCards, completedCardIdentity, type CardCompletionLookup } from "./cardDedupe";
import type { AssistantCardRef } from "./assistantCards";

const micro = (pathId: string): AssistantCardRef => ({ cardType: "micro", pathId, knowledgeId: "K1", courseId: "course" });
const knowledge = (nodeId: string, pathId?: string): AssistantCardRef => ({ cardType: "knowledge", nodeId, ...(pathId ? { pathId } : {}), courseId: "course" });
const practice = (assignmentId: string): AssistantCardRef => ({ cardType: "practice", courseId: "course", assignmentId });
const evaluation = (attemptId?: string): AssistantCardRef => ({ cardType: "evaluation", courseId: "course", assignmentId: "T1", ...(attemptId ? { attemptId } : {}) });
const message = (id: string, ...cards: AssistantCardRef[]) => ({ id, parts: cards.map((card) => ({ type: "tool-displayCard", output: { card } })) });

function lookup(overrides: Partial<CardCompletionLookup> = {}): CardCompletionLookup {
  return {
    isMicroCompleted: () => true,
    knowledgePathId: (card) => card.pathId ?? null,
    isKnowledgeLearned: () => false,
    isPracticeCompleted: () => true,
    ...overrides
  };
}

describe("completed card dedupe", () => {
  it("keeps the earliest completed Micro and skips every later copy", () => {
    const skipped = collectSkippedCompletedCards([message("old", micro("A02")), message("new", micro("A02"))], lookup());
    expect([...skipped]).toEqual(["new:0"]);
  });

  it("treats a completed Knowledge card and its Micro path as one object", () => {
    const skipped = collectSkippedCompletedCards([message("old", knowledge("K1", "A02")), message("new", micro("A02"))], lookup());
    expect([...skipped]).toEqual(["new:0"]);
    const reverse = collectSkippedCompletedCards([message("old", micro("A02")), message("new", knowledge("K1", "A02"))], lookup());
    expect([...reverse]).toEqual(["new:0"]);
  });

  it("dedupes a completed practice object without touching other assignments", () => {
    const skipped = collectSkippedCompletedCards([message("old", practice("T1")), message("new", practice("T1"), practice("T2"))], lookup({ isPracticeCompleted: (card) => card.assignmentId === "T1" }));
    expect([...skipped]).toEqual(["new:0"]);
  });

  it("keeps unfinished and unrelated cards", () => {
    const skipped = collectSkippedCompletedCards([message("old", micro("A02"), micro("A03")), message("new", micro("A02"), micro("A04"))], lookup({ isMicroCompleted: (pathId) => pathId === "A02" }));
    expect([...skipped]).toEqual(["new:0"]);
  });

  it("dedupes the same evaluation Attempt but never different Attempts", () => {
    const same = collectSkippedCompletedCards([message("old", evaluation("A1")), message("new", evaluation("A1"))], lookup());
    expect([...same]).toEqual(["new:0"]);
    const different = collectSkippedCompletedCards([message("old", evaluation("A1")), message("new", evaluation("A2"))], lookup());
    expect([...different]).toEqual([]);
    const legacy = collectSkippedCompletedCards([message("old", evaluation()), message("new", evaluation())], lookup());
    expect([...legacy]).toEqual([]);
  });

  it("does not invent an identity for a card without a completed object", () => {
    expect(completedCardIdentity(micro("A02"), lookup({ isMicroCompleted: () => false }))).toBeNull();
    expect(completedCardIdentity(knowledge("K1"), lookup({ isKnowledgeLearned: () => false, knowledgePathId: () => null }))).toBeNull();
    expect(completedCardIdentity(practice("T1"), lookup({ isPracticeCompleted: () => false }))).toBeNull();
  });
});
