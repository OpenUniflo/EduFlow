import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSISTANT_MAX_CARDS, cardLimitReached, parseAssistantCardRef } from "./assistantCards";

describe("assistant card references", () => {
  it("accepts stable object references for every card family", () => {
    expect(parseAssistantCardRef({ cardType: "route", courseId: "course-1" })).toEqual({ cardType: "route", courseId: "course-1" });
    expect(parseAssistantCardRef({ cardType: "micro", pathId: "path-1", knowledgeId: "node-1", courseId: "course-1" })).toEqual({ cardType: "micro", pathId: "path-1", knowledgeId: "node-1", courseId: "course-1" });
    expect(parseAssistantCardRef({ cardType: "practice", courseId: "course-1", assignmentId: "assignment-1" })).toEqual({ cardType: "practice", courseId: "course-1", assignmentId: "assignment-1" });
    expect(parseAssistantCardRef({ cardType: "evaluation", courseId: "course-1", assignmentId: "assignment-1", attemptId: "attempt-1" })).toEqual({ cardType: "evaluation", courseId: "course-1", assignmentId: "assignment-1", attemptId: "attempt-1" });
    // Historical evaluation cards predate Attempt identities; keep them
    // readable and let hydration fall back to the latest Attempt.
    expect(parseAssistantCardRef({ cardType: "evaluation", courseId: "course-1", assignmentId: "assignment-1" })).toEqual({ cardType: "evaluation", courseId: "course-1", assignmentId: "assignment-1" });
    expect(parseAssistantCardRef({ cardType: "course_chapter", courseId: "course-1", chapterId: "chapter-1" })).toEqual({ cardType: "course_chapter", courseId: "course-1", chapterId: "chapter-1" });
    expect(parseAssistantCardRef({ cardType: "knowledge", nodeId: "node-1" })).toEqual({ cardType: "knowledge", nodeId: "node-1" });
    expect(parseAssistantCardRef({ cardType: "progress", courseIds: ["course-1", "course-1", "course-2"] })).toEqual({ cardType: "progress", courseIds: ["course-1", "course-2"] });
    expect(parseAssistantCardRef({ cardType: "material", courseId: "course-1", materialId: "material-1", segmentId: "segment-1" })).toEqual({ cardType: "material", courseId: "course-1", materialId: "material-1", segmentId: "segment-1" });
    expect(parseAssistantCardRef({ cardType: "course_match", courseIds: ["course-1"], targetKnowledgeIds: ["node-1"], goalText: "搞懂 Agent" })).toEqual({ cardType: "course_match", courseIds: ["course-1"], targetKnowledgeIds: ["node-1"], goalText: "搞懂 Agent" });
    expect(parseAssistantCardRef({ cardType: "brief", messageId: "message-1" })).toEqual({ cardType: "brief", messageId: "message-1" });
  });

  it("rejects invalid nominations so the answer continues without a card", () => {
    expect(parseAssistantCardRef(null)).toBeNull();
    expect(parseAssistantCardRef({ cardType: "unknown", nodeId: "node-1" })).toBeNull();
    expect(parseAssistantCardRef({ cardType: "knowledge" })).toBeNull();
    expect(parseAssistantCardRef({ cardType: "knowledge", nodeId: "../secret" })).toBeNull();
    expect(parseAssistantCardRef({ cardType: "knowledge", nodeId: "" })).toBeNull();
    expect(parseAssistantCardRef({ cardType: "course_match", courseIds: [], targetKnowledgeIds: ["node-1"], goalText: "goal" })).toBeNull();
    expect(parseAssistantCardRef({ cardType: "micro", pathId: "path-1" })).toBeNull();
  });

  it("parses a card reference once per output, not on every render", () => {
    // A fresh parsed object on every render made useHydratedCard re-run its
    // async hydration, set state, render, and hydrate again (real-mouse click
    // froze the tab). Keep the parse memoized by the stable source reference.
    const source = readFileSync("src/features/assistant/cards/AssistantCardView.tsx", "utf8");
    expect(source).toContain("const card = useMemo(() => parseAssistantCardRef(source.card), [cardKey]);");
  });

  it("enforces at most three cards per answer", () => {
    expect(ASSISTANT_MAX_CARDS).toBe(3);
    expect([0, 1, 2].every((count) => !cardLimitReached(count))).toBe(true);
    expect(cardLimitReached(3)).toBe(true);
    expect(cardLimitReached(4)).toBe(true);
  });
});
