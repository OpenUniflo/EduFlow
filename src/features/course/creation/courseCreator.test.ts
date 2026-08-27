import { describe, expect, it } from "vitest";
import type { CourseCreationBrief } from "@/features/assistant/assistantContract";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import { applyCourseCreatorProposal, createCoursePreviewRuntime, createInitialCourseDesign, invalidateConfirmedThrough, restoreCourseCreatorDesign, validateCourseCreatorDesign } from "./courseCreator";

const graph: KnowledgeGraph = {
  revisions: [],
  nodes: [
    { id: "foundation", title: "Foundation", description: "Required foundation", type: "conceptual", masteryCriteria: [], scope: "global", provenance: [], currentRevisionId: "foundation:r1", status: "active" },
    { id: "target", title: "First Model", description: "Train the first model", type: "procedural", masteryCriteria: [], scope: "global", provenance: [], currentRevisionId: "target:r1", status: "active" },
    { id: "extra", title: "Advanced Theory", description: "Optional advanced theory", type: "conceptual", masteryCriteria: [], scope: "global", provenance: [], currentRevisionId: "extra:r1", status: "active" }
  ],
  edges: [{ id: "foundation-target", source: "foundation", target: "target", relation: "prerequisite", strength: "hard", reason: "Foundation is factual prerequisite" }]
};
const brief: CourseCreationBrief = { type: "course_creation_brief", schemaVersion: 1, briefId: "brief", planningId: "plan", planningMessageId: "message", goal: "Train my first model", targetKnowledge: [{ id: "target", title: "First Model", description: "Train it" }], referenceMaterialIntent: "none" };

describe("fixed Course Creator pipeline contracts", () => {
  it("builds a valid no-Material design and treats every asset gap as warning", () => {
    const design = createInitialCourseDesign(brief, graph, null);
    const result = validateCourseCreatorDesign(design, graph);
    expect(design.scope).toMatchObject({ targetKnowledgeIds: ["target"], prerequisiteKnowledgeIds: ["foundation"] });
    expect(design.assets).toMatchObject({ materialKnowledgeIds: [], microKnowledgeIds: [], assignmentKnowledgeIds: [] });
    expect(result).toMatchObject({ valid: true, fatal: [] });
    expect(result.warnings).toHaveLength(3);
  });

  it("keeps Reference Material optional and in the same design contract", () => {
    const design = createInitialCourseDesign({ ...brief, referenceMaterialIntent: "upload_in_creator" }, graph, null, ["reference.pdf"]);
    expect(design.requirements.referenceMaterialNames).toEqual(["reference.pdf"]);
    expect(validateCourseCreatorDesign(design, graph).valid).toBe(true);
  });

  it("keeps mixed requested adjustments as raw requirements instead of punctuation-derived preferences", () => {
    const design = createInitialCourseDesign({ ...brief, requestedAdjustments: "我只有两周；去掉数学；加入部署；多做实践" }, graph, null);
    expect(design.requirements.requestedAdjustments).toBe("我只有两周；去掉数学；加入部署；多做实践");
    expect(design.requirements.preferences).toEqual([]);
  });

  it("does not mutate before Proposal Apply and invalidates downstream confirmations after Apply", () => {
    const design = createInitialCourseDesign(brief, graph, null);
    const proposal = { id: "proposal", stage: "requirements" as const, title: "Practice first", summary: "Preview only", operations: [{ type: "setPreferences" as const, values: ["实践优先"] }] };
    expect(design.requirements.preferences).toEqual([]);
    const next = applyCourseCreatorProposal(design, proposal, graph);
    expect(design.requirements.preferences).toEqual([]);
    expect(next.requirements.preferences).toEqual(["实践优先"]);
    expect(invalidateConfirmedThrough(4, 1)).toBe(0);
  });

  it("automatically restores factual prerequisite closure and never changes KnowledgeEdge facts", () => {
    const design = createInitialCourseDesign(brief, graph, null);
    const next = applyCourseCreatorProposal(design, { id: "proposal", stage: "scope", title: "Too short", summary: "Remove foundation", operations: [{ type: "excludeKnowledge", nodeId: "foundation" }] }, graph);
    expect(next.scope.prerequisiteKnowledgeIds).toEqual(["foundation"]);
    expect(validateCourseCreatorDesign(next, graph).valid).toBe(true);
    expect(graph.edges).toEqual([{ id: "foundation-target", source: "foundation", target: "target", relation: "prerequisite", strength: "hard", reason: "Foundation is factual prerequisite" }]);
  });

  it("creates a Personal draft preview with explicit target Knowledge and no fabricated assets", () => {
    const runtime = createCoursePreviewRuntime(createInitialCourseDesign(brief, graph, null));
    expect(runtime.course).toMatchObject({ lifecycle: "draft", courseType: "personal" });
    expect(runtime.targetKnowledge).toEqual([{ courseId: "creator-preview", nodeId: "target", required: true }]);
    expect(runtime.materials).toEqual([]);
    expect(runtime.assignments).toEqual([]);
  });

  it("restores the editable scope and structure from the persisted Draft after refresh", () => {
    const base = createInitialCourseDesign(brief, graph, null);
    const edited = applyCourseCreatorProposal(base, { id: "scope", stage: "scope", title: "Keep one option", summary: "Persisted edit", operations: [{ type: "includeKnowledge", nodeId: "extra", role: "optional" }] }, graph);
    const runtime = createCoursePreviewRuntime({ ...edited, requirements: { ...edited.requirements, goal: "Persisted first model course" } }, "persisted-draft");
    const restored = restoreCourseCreatorDesign(base, runtime, graph);
    expect(restored.requirements.goal).toBe("Persisted first model course");
    expect(restored.scope).toMatchObject({ targetKnowledgeIds: ["target"], prerequisiteKnowledgeIds: ["foundation"], optionalKnowledgeIds: ["extra"] });
    expect(restored.curriculum.chapters.flatMap((chapter) => chapter.knowledgeIds)).toEqual(edited.curriculum.chapters.flatMap((chapter) => chapter.knowledgeIds));
  });

  it("restores confirmed requirements and desired Asset Plan from creator metadata", () => {
    const base = createInitialCourseDesign({ ...brief, requestedAdjustments: "原始补充要求" }, graph, null);
    const edited = applyCourseCreatorProposal(
      applyCourseCreatorProposal(base, { id: "requirements", stage: "requirements", title: "Requirements", summary: "Persist", operations: [
        { type: "setRequirement", field: "learnerFoundation", value: "会一点 Python" },
        { type: "setRequirement", field: "timeConstraint", value: "两周" },
        { type: "setPreferences", values: ["实践优先"] }
      ] }, graph),
      { id: "assets", stage: "assets", title: "Assets", summary: "Persist", operations: [{ type: "setDesiredAsset", nodeId: "target", assetType: "assignment", desired: true }] }, graph
    );
    const restored = restoreCourseCreatorDesign(base, createCoursePreviewRuntime(edited, "persisted"), graph);
    expect(restored.requirements).toMatchObject({ learnerFoundation: "会一点 Python", timeConstraint: "两周", preferences: ["实践优先"], requestedAdjustments: "原始补充要求" });
    expect(restored.assets.desiredAssignmentKnowledgeIds).toEqual(["target"]);
  });

  it("separates real reusable coverage from the desired Asset Plan", () => {
    const source = createCoursePreviewRuntime(createInitialCourseDesign(brief, graph, null), "source");
    source.materialKnowledgeCoverages = [{ id: "material-map", materialId: "material", segmentId: "segment", nodeId: "target", role: "explain" }];
    source.assignmentCoverages = [{ id: "assignment-map", assignmentId: "assignment", nodeId: "foundation", role: "practice", required: true }];
    const design = createInitialCourseDesign(brief, graph, source);
    expect(design.assets).toMatchObject({ availableMaterialKnowledgeIds: ["target"], availableAssignmentKnowledgeIds: ["foundation"], materialKnowledgeIds: [], assignmentKnowledgeIds: [] });
    const next = applyCourseCreatorProposal(design, { id: "assets", stage: "assets", title: "Practice", summary: "Plan only", operations: [{ type: "setDesiredAsset", nodeId: "target", assetType: "assignment", desired: true }] }, graph);
    expect(next.assets.desiredAssignmentKnowledgeIds).toEqual(["target"]);
    expect(next.assets.assignmentKnowledgeIds).toEqual([]);
  });
});
