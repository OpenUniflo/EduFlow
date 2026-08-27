import { describe, expect, it } from "vitest";
import type { CourseKnowledgeLearningContext } from "@/features/learning/resources/knowledgeLearningResources";
import { knowledgeContextLabel } from "./KnowledgeContextSelector";

const context = (courseType: "standard" | "personal", updatedAt?: string): CourseKnowledgeLearningContext => ({
  kind: "course", id: `${courseType}-course`, courseId: `${courseType}-course`, courseTitle: "Python 实战", courseType, updatedAt,
  isActive: false, micro: { available: false, path: null, source: "none", progressStatus: "not_started" }, materials: [], assignments: []
});

describe("Knowledge context labels", () => {
  it("uses the readable title when it is unique", () => {
    expect(knowledgeContextLabel(context("standard"), false)).toBe("Python 实战");
  });

  it("disambiguates duplicate standard and personal Courses without exposing IDs", () => {
    expect(knowledgeContextLabel(context("standard", "2026-08-27T00:00:00Z"), true)).toContain("标准课程");
    const personal = knowledgeContextLabel(context("personal", "2026-08-28T00:00:00Z"), true);
    expect(personal).toContain("个人课程");
    expect(personal).not.toContain("personal-course");
  });
});
