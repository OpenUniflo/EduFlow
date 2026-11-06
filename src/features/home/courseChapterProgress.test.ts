import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { CourseAssignment, CurriculumChapter, CurriculumCoverage, CurriculumLesson } from "@/features/course/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import { buildCoursePreview } from "./CoursePreviewCard";
import { buildChapterProgress } from "./courseChapterProgress";

function chapter(id: string, order: number): CurriculumChapter {
  return { id, courseId: "course", title: `章节 ${order + 1}`, description: "", order, color: "", outcome: "" };
}

function lesson(id: string, chapterId: string, order: number): CurriculumLesson {
  return { id, courseId: "course", chapterId, title: `课时 ${id}`, order };
}

function coverage(id: string, lessonId: string, nodeId: string, order: number): CurriculumCoverage {
  return { id, courseId: "course", lessonId, nodeId, role: "introduce", order };
}

function runtime(chapters: CurriculumChapter[], lessons: CurriculumLesson[], coverages: CurriculumCoverage[], assignments: CourseAssignment[] = []): CourseRuntimeData {
  return {
    course: { id: "course", title: "课程", description: "" },
    curriculum: { id: "curriculum", courseId: "course", generationMode: "manual" },
    chapters,
    lessons,
    curriculumCoverages: coverages,
    curriculumSequences: [],
    assignments,
    assignmentCoverages: [],
    assignmentDependencies: [],
    chapterOutcomes: [],
    assignmentOutcomeCompositions: [],
    finalProjects: [],
    finalProjectOutcomeCompositions: [],
    materials: [],
    materialKnowledgeCoverages: [],
    revision: "r1"
  };
}

function record(nodeId: string, status: UserKnowledgeRecord["status"]): UserKnowledgeRecord {
  return { nodeId, status };
}

describe("buildCoursePreview", () => {
  it("reports the real chapter and node totals even when the preview is truncated", () => {
    const chapters = Array.from({ length: 6 }, (_, index) => chapter(`chapter-${index + 1}`, index));
    const lessons = chapters.map((item, index) => lesson(`lesson-${index + 1}`, item.id, index));
    const firstChapterNodes = Array.from({ length: 5 }, (_, index) => `node-1-${index + 1}`);
    const coverages = firstChapterNodes.map((nodeId, index) => coverage(`coverage-1-${index + 1}`, lessons[0].id, nodeId, index));
    coverages.push(coverage("coverage-2-1", lessons[1].id, "node-2-1", 10));
    const preview = buildCoursePreview({
      course: runtime(chapters, lessons, coverages),
      records: [record("node-1-1", "learned"), record("node-1-2", "learned"), record("node-2-1", "learning")],
      currentKnowledgeId: "node-2-1"
    });

    expect(preview.totalChapters).toBe(6);
    expect(preview.chapters).toHaveLength(3);
    expect(preview.hiddenChapterCount).toBe(3);
    expect(preview.chapters[0]).toMatchObject({ doneCount: 2, totalCount: 5, hiddenNodeCount: 1 });
    expect(preview.chapters[0].nodes).toHaveLength(4);
    expect(preview.chapters[1]).toMatchObject({ doneCount: 0, totalCount: 1, hiddenNodeCount: 0 });
    expect(preview.totals).toEqual({ done: 2, learning: 1, quiet: 3 });
    expect(preview.nodeCount).toBe(6);
  });
});

describe("buildChapterProgress", () => {
  const chapters = [chapter("chapter-1", 0), chapter("chapter-2", 1)];
  const lessons = [lesson("lesson-1", "chapter-1", 0), lesson("lesson-2", "chapter-2", 1)];
  const course = runtime(chapters, lessons, [
    coverage("c1", "lesson-1", "node-1", 0),
    coverage("c2", "lesson-1", "node-2", 1),
    coverage("c3", "lesson-2", "node-3", 2)
  ]);

  it("marks a chapter done only when every node is learned and another chapter current when learning", () => {
    const progress = buildChapterProgress({
      course,
      statusByNode: new Map([["node-1", "learned"], ["node-2", "mastered"], ["node-3", "learning"]]),
      currentKnowledgeId: "node-3"
    });
    expect(progress.map((item) => item.state)).toEqual(["done", "current"]);
    expect(progress.map((item) => item.doneCount)).toEqual([2, 0]);
  });

  it("uses the real recent lesson as the current chapter when no knowledge is active", () => {
    const progress = buildChapterProgress({ course, statusByNode: new Map(), recentLessonId: "lesson-2" });
    expect(progress.map((item) => item.state)).toEqual(["quiet", "current"]);
  });
});
