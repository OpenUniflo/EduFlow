import { describe, expect, it } from "vitest";
import { assistantPlugins, assistantWriteTools, createAssistantTools } from "../api/_lib/assistantTools";
import type { AssistantContextSnapshot } from "../src/features/assistant/assistantContract";

const client = { from: () => { throw new Error("not executed"); } } as never;
const user = { id: "user-1" } as never;
const context: AssistantContextSnapshot = { workspace: "learning", experienceMode: "learn" };

describe("assistant plugin registration", () => {
  it("registers one module per feature with tools and card ownership", () => {
    expect(assistantPlugins.map((plugin) => plugin.id)).toEqual([
      "planning", "knowledge", "micro", "courses", "materials", "progress", "navigation", "assignment", "workspace"
    ]);
    expect(assistantPlugins.find((plugin) => plugin.id === "knowledge")?.cards.map((card) => card.cardType)).toEqual(["knowledge", "mini_map"]);
    expect(assistantPlugins.find((plugin) => plugin.id === "micro")?.cards.map((card) => card.cardType)).toEqual(["micro"]);
    expect(assistantPlugins.find((plugin) => plugin.id === "courses")?.cards.map((card) => card.cardType)).toContain("route");
    expect(assistantPlugins.find((plugin) => plugin.id === "materials")?.cards.map((card) => card.cardType)).toEqual(["material"]);
    expect(assistantPlugins.find((plugin) => plugin.id === "progress")?.cards.map((card) => card.cardType)).toEqual(["progress"]);
    expect(assistantPlugins.find((plugin) => plugin.id === "assignment")?.cards.map((card) => card.cardType)).toEqual(["practice", "submission", "evaluation"]);
  });

  it("registers write tools once in the same plugin registry", () => {
    expect(Object.keys(assistantWriteTools).sort()).toEqual(["submitAssignment", "withdrawAssignmentSubmission"]);
  });

  it("merges every plugin tool without duplicate names", () => {
    const tools = createAssistantTools(client, user, context);
    const names = Object.keys(tools);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining([
      "getNavigationDecision", "searchKnowledge", "getKnowledgeNeighbors", "getCourseContext",
      "getMaterialContext", "getLearnerState", "getAssignmentContext", "submitAssignment",
      "withdrawAssignmentSubmission", "openWorkspacePanel", "getCurrentContext"
    ]));
  });
});
