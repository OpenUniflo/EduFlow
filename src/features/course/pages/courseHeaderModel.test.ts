import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "../runtime/courseRuntime";
import type { CurriculumChapter, CurriculumCoverage, CurriculumLesson } from "../types";
import { buildCourseHeaderModel } from "./courseHeaderModel";

const chapters: CurriculumChapter[] = [
  { id: "chapter-2", courseId: "course", title: "运行循环", description: "", order: 2, color: "", outcome: "" },
  { id: "chapter-1", courseId: "course", title: "基础", description: "", order: 1, color: "", outcome: "" }
];
const lessons: CurriculumLesson[] = [
  { id: "lesson-2", courseId: "course", chapterId: "chapter-2", title: "循环", order: 2 },
  { id: "lesson-1", courseId: "course", chapterId: "chapter-1", title: "入门", order: 1 }
];
const coverages: CurriculumCoverage[] = [
  { id: "coverage-3", courseId: "course", lessonId: "lesson-2", nodeId: "k3", role: "introduce", order: 1 },
  { id: "coverage-2", courseId: "course", lessonId: "lesson-1", nodeId: "k2", role: "reinforce", order: 2 },
  { id: "coverage-1", courseId: "course", lessonId: "lesson-1", nodeId: "k1", role: "introduce", order: 1 }
];
const runtime = { chapters, lessons, curriculumCoverages: coverages } as Pick<CourseRuntimeData, "chapters" | "lessons" | "curriculumCoverages">;

describe("shared Course header model", () => {
  it("counts learned Course Knowledge and names the current chapter in curriculum order", () => {
    const model = buildCourseHeaderModel(runtime, [
      { nodeId: "k1", status: "learned" },
      { nodeId: "k3", status: "learning" }
    ]);
    expect(model).toEqual({
      total: 3,
      learned: 1,
      chapterCount: 2,
      progress: 33,
      currentChapter: "第 2 章 · 运行循环"
    });
  });

  it("uses the earliest in-progress Knowledge before a learned fallback", () => {
    const model = buildCourseHeaderModel(runtime, [
      { nodeId: "k1", status: "learned" },
      { nodeId: "k2", status: "learning" },
      { nodeId: "k3", status: "learning" }
    ]);
    expect(model.currentChapter).toBe("第 1 章 · 基础");
  });

  it("renders zero progress for a Course with no records", () => {
    expect(buildCourseHeaderModel(runtime, [])).toMatchObject({ total: 3, learned: 0, progress: 0, currentChapter: null });
  });
});
