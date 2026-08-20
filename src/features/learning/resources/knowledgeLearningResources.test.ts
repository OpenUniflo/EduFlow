import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { MicroLearningPath, MicroLearningRepository } from "@/features/learning/micro/microLearning";
import { projectKnowledgeLearningResources } from "./knowledgeLearningResources";

const path = (scope: "course" | "global", courseId?: string): MicroLearningPath => ({
  id: `${scope}-path`, knowledgeId: "knowledge", courseId, scope, title: `${scope} Micro`,
  estimatedMinutes: 8, mode: "learn", required: true, status: "published", units: []
});

const runtime = (courseId: string): CourseRuntimeData => ({
  course: { id: courseId, title: `Course ${courseId}`, description: "" },
  curriculum: { id: `curriculum-${courseId}`, courseId, generationMode: "manual" },
  chapters: [{ id: "chapter", courseId, title: "Chapter", description: "", order: 1, color: "#fff", outcome: "" }],
  lessons: [{ id: "lesson", courseId, chapterId: "chapter", title: "Lesson", order: 1 }],
  curriculumCoverages: [{ id: "coverage", courseId, lessonId: "lesson", nodeId: "knowledge", role: "introduce", order: 1 }],
  curriculumSequences: [],
  assignments: [{ id: "assignment", courseId, title: "Assignment", description: "", requirements: [], expectedOutput: "", acceptanceCriteria: [], order: 1, mode: "workflow", workflowTemplateId: "workflow" }],
  assignmentCoverages: [{ id: "assignment-coverage", assignmentId: "assignment", nodeId: "knowledge", role: "practice" }],
  assignmentDependencies: [], chapterOutcomes: [], assignmentOutcomeCompositions: [], finalProjects: [], finalProjectOutcomeCompositions: [],
  materials: [{ id: "material", courseId, lessonId: "lesson", order: 1, title: "Material", type: "article", segments: [{ id: "segment", order: 1, title: "Segment" }] }],
  materialKnowledgeCoverages: [{ id: "material-coverage", materialId: "material", segmentId: "segment", nodeId: "knowledge", role: "introduce" }],
  revision: "1"
});

const state = (courseId: string) => ({ userId: "user", courseId, assignmentStates: { assignment: { assignmentId: "assignment", status: "in-progress" as const } }, materialStates: {}, updatedAt: "2026-08-20" });
const repository = (resolver: (courseId?: string) => MicroLearningPath | null) => ({ getPath: (_knowledgeId: string, context?: { courseId?: string }) => resolver(context?.courseId) }) as MicroLearningRepository;

describe("Knowledge learning resources", () => {
  it("uses a Course Micro ahead of Global fallback", () => {
    const result = projectKnowledgeLearningResources({ knowledgeId: "knowledge", runtimes: [runtime("course")], courseStates: [state("course")], microRepository: repository((courseId) => courseId ? path("course", courseId) : path("global")) });
    expect(result.micro).toMatchObject({ available: true, source: "course", path: { id: "course-path" } });
  });

  it("uses a Global Micro when the relevant Course has no specific path", () => {
    const result = projectKnowledgeLearningResources({ knowledgeId: "knowledge", runtimes: [runtime("course")], courseStates: [state("course")], microRepository: repository(() => path("global")) });
    expect(result.micro).toMatchObject({ available: true, source: "global", path: { id: "global-path" } });
  });

  it("projects Course-only Material and Assignment contexts with learner status", () => {
    const result = projectKnowledgeLearningResources({ knowledgeId: "knowledge", runtimes: [runtime("course")], courseStates: [state("course")], microRepository: repository(() => null) });
    expect(result.materials).toMatchObject([{ courseId: "course", materialId: "material", segmentId: "segment" }]);
    expect(result.assignments).toMatchObject([{ courseId: "course", assignmentId: "assignment", status: "in-progress" }]);
  });

  it("keeps standalone Knowledge honest when no Global resources exist", () => {
    const result = projectKnowledgeLearningResources({ knowledgeId: "standalone", runtimes: [runtime("course")], courseStates: [state("course")], microRepository: repository(() => null) });
    expect(result).toMatchObject({ courses: [], micro: { available: false, source: "none" }, materials: [], assignments: [] });
  });
});
