import { describe, expect, it } from "vitest";
import { resolveHomeBoundary } from "./homeBoundary";

const base = { loading: false, activeKnowledgeCount: 0, activeCourseCount: 0, hasAnyLearningRecord: false };

describe("home boundary", () => {
  it("shows a page-level error only when there is nothing usable on the page", () => {
    expect(resolveHomeBoundary({ ...base, error: "network" })).toBe("error");
  });

  it("keeps existing conversation content usable when a background refresh fails", () => {
    expect(resolveHomeBoundary({ ...base, error: "network", hasConversation: true })).toBe("ready");
    expect(resolveHomeBoundary({ ...base, error: "network", activeCourseCount: 1 })).toBe("ready");
    expect(resolveHomeBoundary({ ...base, error: "network", hasAnyLearningRecord: true })).toBe("ready");
  });

  it("does not invent an error for a new empty account", () => {
    expect(resolveHomeBoundary(base)).toBe("new-user");
  });
});
