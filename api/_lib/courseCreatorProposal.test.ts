import { describe, expect, it } from "vitest";
import { generateCourseCreatorProposal, isCourseCreatorProviderUnavailable, parseGeneratedCourseCreatorProposal } from "./courseCreatorProposal";

describe("Course Creator structured proposal validation", () => {
  it("accepts only product-visible Knowledge and current Chapters", () => {
    expect(parseGeneratedCourseCreatorProposal({ intent: "edit", title: "Practice earlier", summary: "Move the target", moves: [{ nodeId: "target", chapterId: "practice" }] }, new Set(["target"]), new Set(["practice"]))).toMatchObject({ title: "Practice earlier" });
    expect(() => parseGeneratedCourseCreatorProposal({ intent: "edit", title: "Invent", summary: "Bad", knowledgeChanges: [{ nodeId: "invented", action: "include", role: "target" }] }, new Set(["target"]), new Set())).toThrow(/unavailable Knowledge/);
    expect(() => parseGeneratedCourseCreatorProposal({ intent: "edit", title: "Move", summary: "Bad", moves: [{ nodeId: "target", chapterId: "invented" }] }, new Set(["target"]), new Set(["practice"]))).toThrow(/unavailable Chapters/);
  });

  it("preserves the structured target/optional role without keyword rewriting", async () => {
    const result = await generateCourseCreatorProposal({
      stage: "scope", instruction: "太多了，精简，但把部署保留为核心目标。", brief: {},
      current: { scope: { targetKnowledgeIds: ["target"], prerequisiteKnowledgeIds: [], optionalKnowledgeIds: [] }, curriculum: { chapters: [{ id: "chapter" }] } },
      visibleKnowledge: [{ id: "target", title: "Target", description: "Target" }, { id: "extra", title: "Extra", description: "Extra" }], chapterIds: ["chapter"]
    }, { generateJson: async () => ({ value: { intent: "edit", title: "Narrow", summary: "Keep deployment as a target", knowledgeChanges: [{ nodeId: "extra", action: "include", role: "target" }], orderedKnowledgeIds: ["target"] }, metadata: {} as never }) });
    expect(result.knowledgeChanges).toEqual([{ nodeId: "extra", action: "include", role: "target" }]);
    expect(result.orderedKnowledgeIds).toEqual(["target"]);
  });

  it("defaults ambiguous model output to no mutation by rejecting a missing intent", () => {
    expect(() => parseGeneratedCourseCreatorProposal({ title: "Maybe", summary: "Unclear", knowledgeChanges: [{ nodeId: "target", action: "include", role: "target" }] }, new Set(["target"]), new Set())).toThrow();
  });

  it("separates provider failures from invalid proposal output", () => {
    expect(isCourseCreatorProviderUnavailable(new TypeError("fetch failed"))).toBe(true);
    expect(isCourseCreatorProviderUnavailable(new Error("upstream timeout"))).toBe(true);
    expect(isCourseCreatorProviderUnavailable(new Error("Course Creator proposal references unavailable Knowledge"))).toBe(false);
  });
});
