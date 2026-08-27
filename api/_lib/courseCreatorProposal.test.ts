import { describe, expect, it } from "vitest";
import { generateCourseCreatorProposal, parseGeneratedCourseCreatorProposal } from "./courseCreatorProposal";

describe("Course Creator structured proposal validation", () => {
  it("accepts only product-visible Knowledge and current Chapters", () => {
    expect(parseGeneratedCourseCreatorProposal({ title: "Practice earlier", summary: "Move the target", moves: [{ nodeId: "target", chapterId: "practice" }] }, new Set(["target"]), new Set(["practice"]))).toMatchObject({ title: "Practice earlier" });
    expect(() => parseGeneratedCourseCreatorProposal({ title: "Invent", summary: "Bad", addKnowledgeIds: ["invented"] }, new Set(["target"]), new Set())).toThrow(/unavailable Knowledge/);
    expect(() => parseGeneratedCourseCreatorProposal({ title: "Move", summary: "Bad", moves: [{ nodeId: "target", chapterId: "invented" }] }, new Set(["target"]), new Set(["practice"]))).toThrow(/unavailable Chapters/);
  });

  it("does not turn a narrowing Scope request into bulk Knowledge additions", async () => {
    const result = await generateCourseCreatorProposal({
      stage: "scope", instruction: "内容太多，只保留必须学的", brief: {},
      current: { scope: { targetKnowledgeIds: ["target"], prerequisiteKnowledgeIds: [], optionalKnowledgeIds: [] }, curriculum: { chapters: [{ id: "chapter" }] } },
      visibleKnowledge: [{ id: "target", title: "Target", description: "Target" }, { id: "extra", title: "Extra", description: "Extra" }], chapterIds: ["chapter"]
    }, { generateJson: async () => ({ value: { title: "Narrow", summary: "Keep minimum", addKnowledgeIds: ["extra"], orderedKnowledgeIds: ["target"] }, metadata: {} as never }) });
    expect(result.addKnowledgeIds).toEqual([]);
    expect(result.orderedKnowledgeIds).toEqual(["target"]);
  });
});
