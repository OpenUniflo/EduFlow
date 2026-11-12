import { describe, expect, it } from "vitest";
import type { AssistantMessage, CourseCreationBrief, CourseSearchTimelineContent } from "@/features/assistant/assistantContract";
import type { GoalPlan } from "@/features/course/goal/goalPlanning";
import type { ArchiveModel } from "./atlasModel";
import { deriveAssistantPresentation, draftDepthByTarget } from "./assistantPresentation";

const model = {
  nodes: [], edges: [
    { id: "p1", source: "P1", target: "T1", relation: "prerequisite", strength: "hard" },
    { id: "p2", source: "P2", target: "P1", relation: "prerequisite", strength: "hard" },
    { id: "x", source: "T1", target: "T2", relation: "related", strength: 1 }
  ],
  nodeById: new Map(), mineNodeIds: new Set(["T1"]), courses: [], stats: { totalNodes: 0, totalEdges: 3, mine: 1, learned: 0, learning: 1, practicing: 0, mastered: 0, weekDays: 0 }, hasLearningHistory: true
} as unknown as ArchiveModel;

const plan: GoalPlan = {
  resolution: { status: "ready", goalText: "做一个能查资料的 Agent", targetKnowledge: [{ id: "T1", title: "RAG", description: "" }, { id: "T2", title: "工具调用", description: "" }], candidates: [] },
  prerequisiteKnowledge: [{ id: "P1", title: "检索", description: "" }, { id: "P2", title: "嵌入", description: "" }],
  prerequisiteCycleDetected: false,
  matches: [{ courseId: "c1", courseTitle: "RAG 实战", courseType: "standard", targetCoverage: 0.6, requiredCoverage: 0.4, scopePrecision: 0.8, missingTargetKnowledgeIds: [], missingPrerequisiteKnowledgeIds: [], extraKnowledgeIds: [], level: "high", recommendation: "customize" }]
};

const searchContent: CourseSearchTimelineContent = { type: "course_search", schemaVersion: 1, planningId: "plan", goalText: "做一个能查资料的 Agent", intentSummary: "检索与工具调用", plan };
const briefContent: CourseCreationBrief = { type: "course_creation_brief", schemaVersion: 1, briefId: "brief", planningId: "plan", planningMessageId: "m1", goal: "做一个能查资料的 Agent", targetKnowledge: [{ id: "T1", title: "RAG", description: "" }, { id: "T2", title: "工具调用", description: "" }], referenceMaterialIntent: "none" };
const context = { workspace: "explore" as const, experienceMode: "learn" as const };
const message = (id: string, role: "user" | "assistant", structuredContent?: AssistantMessage["structuredContent"]): AssistantMessage => ({ id, sessionId: "s", role, content: "", context, createdAt: "now", structuredContent });
const messages = [message("m1", "assistant", searchContent), message("m2", "user"), message("m3", "assistant", briefContent)];

describe("Archive assistant presentation", () => {
  it("shows searching state with confirmed candidates only while the request is in flight", () => {
    const presentation = deriveAssistantPresentation({ messages: [message("m1", "assistant", searchContent)], model, sending: true });
    expect(presentation.state).toBe("searching");
    expect(presentation.candidateIds).toEqual(["T1", "T2", "P1", "P2"]);
    expect(presentation.targetIds).toEqual(["T1", "T2"]);
    expect(presentation.matchCount).toBe(1);
  });

  it("locks into a brief only after a newer structured brief message", () => {
    const presentation = deriveAssistantPresentation({ messages, model, sending: false });
    expect(presentation.state).toBe("brief");
    expect(presentation.briefMessageId).toBe("m3");
    expect(presentation.draftIds).toEqual(["T1", "T2"]);
    expect(presentation.draftDepth.get("T1")).toBe(0);
    expect(presentation.draftDepth.get("P1")).toBe(1);
    expect(presentation.draftDepth.get("P2")).toBe(2);
    expect(presentation.goalText).toBe("做一个能查资料的 Agent");
  });

  it("does not treat an older brief as the active result after a new search", () => {
    const presentation = deriveAssistantPresentation({ messages: [message("m3", "assistant", briefContent), message("m4", "assistant", searchContent)], model, sending: false });
    expect(presentation.state).toBe("results");
    expect(presentation.draftIds).toEqual([]);
  });

  it("keeps a result bound to the request message even when another result is newer", () => {
    const otherSearch: CourseSearchTimelineContent = { ...searchContent, goalText: "另一个目标", intentSummary: "另一个请求", plan };
    const presentation = deriveAssistantPresentation({
      messages: [message("m1", "assistant", searchContent), message("m3", "assistant", briefContent), message("m4", "assistant", otherSearch)],
      model,
      sending: false,
      planningMessageId: "m1"
    });
    expect(presentation.state).toBe("brief");
    expect(presentation.searchMessageId).toBe("m1");
    expect(presentation.briefMessageId).toBe("m3");
    expect(presentation.goalText).toBe("做一个能查资料的 Agent");
  });

  it("shows nothing while a new request has no bound result yet", () => {
    const presentation = deriveAssistantPresentation({ messages, model, sending: true, planningMessageId: null });
    expect(presentation.state).toBe("idle");
    expect(presentation.candidateIds).toEqual([]);
    expect(presentation.goalText).toBeUndefined();
  });

  it("computes prerequisite depth with factual edges only, cycle safely", () => {
    expect(draftDepthByTarget(["T1"], [...model.edges, { source: "T1", target: "P2", relation: "prerequisite" }]).get("T1")).toBe(0);
    expect(draftDepthByTarget([], model.edges).size).toBe(0);
  });
});
