import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { Material } from "@/features/course/types";
import { addGeneratedMaterial, addMaterialLink, applyCourseAuthoringDraft, createGeneratedArticleDraft, emptyCourseAuthoringDraft, removeMaterialLink } from "./courseAuthoringDraft";

const baseMaterial: Material = { id: "base", courseId: "course", lessonId: "lesson", order: 0, title: "Base", type: "article", segments: [{ id: "base-segment", order: 0 }] };
const runtime = { course: { id: "course" }, curriculumCoverages: [{ id: "coverage", courseId: "course", lessonId: "lesson", nodeId: "node", order: 0, role: "introduce" }], materials: [baseMaterial], materialKnowledgeCoverages: [{ id: "base-link", materialId: "base", segmentId: "base-segment", nodeId: "node", role: "explain" }] } as CourseRuntimeData;

describe("Course authoring draft overlay", () => {
  it("adds, removes, and re-adds a Material link without duplicates", () => {
    const link = { nodeId: "node", materialId: "base" };
    const removed = removeMaterialLink(emptyCourseAuthoringDraft("course"), link);
    expect(applyCourseAuthoringDraft(runtime, removed).materialKnowledgeCoverages).toHaveLength(0);
    const readded = addMaterialLink(removed, link);
    expect(applyCourseAuthoringDraft(runtime, readded).materialKnowledgeCoverages).toHaveLength(1);
    expect(addMaterialLink(readded, link)).toBe(readded);
  });
  it("creates a stable Article draft and automatically links it", () => {
    const generated = createGeneratedArticleDraft({ runtime, nodeId: "node", nodeTitle: "并行汇合", createId: () => "fixed" });
    expect(generated.id).toBe("draft-material-fixed");
    expect(generated.segments).toHaveLength(3);
    const overlay = applyCourseAuthoringDraft(runtime, addGeneratedMaterial(emptyCourseAuthoringDraft("course"), generated, "node"));
    expect(overlay.materials.map((item) => item.id)).toContain(generated.id);
    expect(overlay.materialKnowledgeCoverages.some((coverage) => coverage.materialId === generated.id && coverage.nodeId === "node")).toBe(true);
  });
});
