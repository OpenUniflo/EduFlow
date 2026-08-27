import { describe, expect, it } from "vitest";
import type { CourseCreationBrief } from "@/features/assistant/assistantContract";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import { applyCourseCreatorProposal, createCoursePreviewRuntime, createInitialCourseDesign, invalidateConfirmedThrough, validateCourseCreatorDesign } from "./courseCreator";

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

  it("does not mutate before Proposal Apply and invalidates downstream confirmations after Apply", () => {
    const design = createInitialCourseDesign(brief, graph, null);
    const proposal = { id: "proposal", stage: "requirements" as const, title: "Practice first", summary: "Preview only", operations: [{ type: "setPreferences" as const, values: ["实践优先"] }] };
    expect(design.requirements.preferences).toEqual([]);
    const next = applyCourseCreatorProposal(design, proposal);
    expect(design.requirements.preferences).toEqual([]);
    expect(next.requirements.preferences).toEqual(["实践优先"]);
    expect(invalidateConfirmedThrough(4, 1)).toBe(0);
  });

  it("rejects removal of factual prerequisite closure and never changes KnowledgeEdge facts", () => {
    const design = createInitialCourseDesign(brief, graph, null);
    const next = applyCourseCreatorProposal(design, { id: "proposal", stage: "scope", title: "Too short", summary: "Remove foundation", operations: [{ type: "excludeKnowledge", nodeId: "foundation" }] });
    expect(validateCourseCreatorDesign(next, graph).fatal).toContain("缺少事实前置 Knowledge：foundation");
    expect(graph.edges).toEqual([{ id: "foundation-target", source: "foundation", target: "target", relation: "prerequisite", strength: "hard", reason: "Foundation is factual prerequisite" }]);
  });

  it("creates a Personal draft preview with explicit target Knowledge and no fabricated assets", () => {
    const runtime = createCoursePreviewRuntime(createInitialCourseDesign(brief, graph, null));
    expect(runtime.course).toMatchObject({ lifecycle: "draft", courseType: "personal" });
    expect(runtime.targetKnowledge).toEqual([{ courseId: "creator-preview", nodeId: "target", required: true }]);
    expect(runtime.materials).toEqual([]);
    expect(runtime.assignments).toEqual([]);
  });
});
