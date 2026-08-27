import { describe, expect, it } from "vitest";
import { parseAssistantContext, parseAssistantStructuredContent } from "./assistantContract";
import { snapshotAssistantContext } from "./assistantContext";

describe("Assistant request contract", () => {
  it("keeps only explicit product identities and never sends role authority", () => {
    expect(snapshotAssistantContext({ workspace: "material", experienceMode: "learn", userRole: "student", capabilities: [], courseId: "course-1", materialId: "material-1", segmentId: "page-2" })).toEqual({ workspace: "material", experienceMode: "learn", courseId: "course-1", materialId: "material-1", segmentId: "page-2" });
  });

  it("supports every accepted contextual identity without entity payloads", () => {
    expect(parseAssistantContext({ workspace: "learning", experienceMode: "learn", courseId: "course-1", knowledgeId: "K01", microPathId: "path:1", microUnitId: "unit:1", microStepId: "step:1" })).toMatchObject({ courseId: "course-1", knowledgeId: "K01", microStepId: "step:1" });
  });

  it("rejects invalid or filter-injecting identities", () => {
    expect(() => parseAssistantContext({ workspace: "unknown", experienceMode: "learn" })).toThrow(/workspace/);
    expect(() => parseAssistantContext({ workspace: "explore", experienceMode: "learn", knowledgeId: "K01,target.eq.any" })).toThrow(/knowledgeId/);
  });

  it("ignores browser-supplied user authority fields", () => {
    expect(parseAssistantContext({ workspace: "messages", experienceMode: "learn", userId: "someone-else", capabilities: ["global-domain-admin"] })).toEqual({ workspace: "messages", experienceMode: "learn" });
  });
});

describe("Assistant structured timeline contract", () => {
  it("parses recoverable Course Search and Brief cards", () => {
    const search = parseAssistantStructuredContent({ type: "course_search", schemaVersion: 1, planningId: "planning-1", goalText: "Build an AI", intentSummary: "Build an AI", plan: { resolution: { status: "ready", goalText: "Build an AI", targetKnowledge: [], candidates: [] }, prerequisiteKnowledge: [], prerequisiteCycleDetected: false, matches: [] } });
    expect(search?.type).toBe("course_search");
    const brief = parseAssistantStructuredContent({ type: "course_creation_brief", schemaVersion: 1, briefId: "brief-1", planningId: "planning-1", planningMessageId: "message-1", goal: "Build an AI", targetKnowledge: [], referenceMaterialIntent: "none" });
    expect(brief).toMatchObject({ type: "course_creation_brief", planningMessageId: "message-1", referenceMaterialIntent: "none" });
  });

  it("rejects malformed and future structured content", () => {
    expect(() => parseAssistantStructuredContent({ type: "course_search", schemaVersion: 2 })).toThrow();
    expect(() => parseAssistantStructuredContent({ type: "course_creation_brief", schemaVersion: 1, briefId: "brief" })).toThrow();
  });
});
