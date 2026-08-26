import { describe, expect, it } from "vitest";
import { parseAssistantContext } from "./assistantContract";
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
