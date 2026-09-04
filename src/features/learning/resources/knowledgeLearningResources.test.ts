import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { CourseLifecycle } from "@/features/course/types";
import type { MicroLearningPath, MicroLearningRepository } from "@/features/learning/micro/microLearning";
import { defaultKnowledgeContextId, projectKnowledgeLearningResources, resolveKnowledgeLearningContext } from "./knowledgeLearningResources";

const path = (scope: "course" | "global", courseId?: string): MicroLearningPath => ({ id: `${scope}-${courseId ?? "path"}`, knowledgeId: "knowledge", courseId, scope, title: `${scope} Micro`, estimatedMinutes: 8, mode: "learn", required: true, status: "published", units: [] });
const runtime = (courseId: string, lifecycle: CourseLifecycle = "published", assignmentCount = 1): CourseRuntimeData => ({
  course: { id: courseId, title: `Course ${courseId}`, description: "", lifecycle }, curriculum: { id: `curriculum-${courseId}`, courseId, generationMode: "manual" },
  chapters: [{ id: `chapter-${courseId}`, courseId, title: "Chapter", description: "", order: 1, color: "#fff", outcome: "" }], lessons: [{ id: `lesson-${courseId}`, courseId, chapterId: `chapter-${courseId}`, title: "Lesson", order: 1 }], curriculumCoverages: [{ id: `coverage-${courseId}`, courseId, lessonId: `lesson-${courseId}`, nodeId: "knowledge", role: "introduce", order: 1 }], curriculumSequences: [],
  assignments: Array.from({ length: assignmentCount }, (_, index) => ({ id: `assignment-${courseId}-${index}`, courseId, title: `Assignment ${index}`, description: "", requirements: [], expectedOutput: "", acceptanceCriteria: [], order: index + 1, mode: "workflow" as const })),
  assignmentCoverages: Array.from({ length: assignmentCount }, (_, index) => ({ id: `assignment-coverage-${courseId}-${index}`, assignmentId: `assignment-${courseId}-${index}`, nodeId: "knowledge", role: "practice" as const })), assignmentDependencies: [], chapterOutcomes: [], assignmentOutcomeCompositions: [], finalProjects: [], finalProjectOutcomeCompositions: [],
  materials: [{ id: `material-${courseId}`, courseId, lessonId: `lesson-${courseId}`, order: 1, title: "Material", type: "article", segments: [{ id: "segment", order: 1, title: "Segment" }] }], materialKnowledgeCoverages: [{ id: `material-coverage-${courseId}`, materialId: `material-${courseId}`, segmentId: "segment", nodeId: "knowledge", role: "introduce" }], revision: "1"
});
const state = (courseId: string, isActive = false) => ({ userId: "user", courseId, isActive, assignmentStates: {}, materialStates: {}, updatedAt: "2026-08-20" });
const repository = (resolver: (courseId?: string) => MicroLearningPath | null, completedId?: string) => ({ getPath: (_knowledgeId: string, context?: { courseId?: string }) => resolver(context?.courseId), getPathProgress: (id: string) => id === completedId ? { pathId: id, status: "completed", updatedAt: "2026" } : undefined }) as MicroLearningRepository;

describe("Knowledge learning resources", () => {
  it("keeps Standalone global-only and prioritizes Course-specific Micro", () => {
    const result = projectKnowledgeLearningResources({ knowledgeId: "knowledge", runtimes: [runtime("course")], courseStates: [state("course")], microRepository: repository((courseId) => courseId ? path("course", courseId) : path("global")) });
    expect(result.standalone).toMatchObject({ micro: { source: "global" }, materials: [], assignments: [] });
    expect(result.courseContexts[0].micro).toMatchObject({ source: "course" });
  });
  it("uses Global fallback in Course while preserving Course-scoped resources and Micro progress", () => {
    const global = path("global");
    const result = projectKnowledgeLearningResources({ knowledgeId: "knowledge", runtimes: [runtime("course")], courseStates: [state("course", true)], microRepository: repository(() => global, global.id) });
    expect(result.courseContexts[0]).toMatchObject({ isActive: true, micro: { source: "global", progressStatus: "completed" }, materials: [{ courseId: "course" }], assignments: [{ courseId: "course" }] });
    expect(defaultKnowledgeContextId(result)).toBe("course");
  });
  it("never aggregates Assignments across Course contexts", () => {
    const result = projectKnowledgeLearningResources({ knowledgeId: "knowledge", runtimes: [runtime("a", "published", 1), runtime("b", "published", 2), runtime("c", "published", 1)], courseStates: [state("a"), state("b"), state("c")], microRepository: repository(() => null) });
    expect(resolveKnowledgeLearningContext(result, "b").assignments).toHaveLength(2);
  });
  it("excludes draft and archived Courses from learner contexts", () => {
    const result = projectKnowledgeLearningResources({ knowledgeId: "knowledge", runtimes: [runtime("published"), runtime("draft", "draft"), runtime("archived", "archived")], courseStates: [state("published"), state("draft"), state("archived")], microRepository: repository(() => null) });
    expect(result.courseContexts.map((context) => context.courseId)).toEqual(["published"]);
  });
  it("defaults to Standalone when active Course context is ambiguous", () => {
    const result = projectKnowledgeLearningResources({ knowledgeId: "knowledge", runtimes: [runtime("a"), runtime("b")], courseStates: [state("a", true), state("b", true)], microRepository: repository(() => null) });
    expect(defaultKnowledgeContextId(result)).toBe("standalone");
  });
  it("preserves Personal Course lifecycle metadata for readable duplicate identification", () => {
    const personal = runtime("personal");
    personal.course = { ...personal.course, courseType: "personal", updatedAt: "2026-08-28T09:30:00Z", targetOutcome: "交付一个可运行的图像分类器" };
    const result = projectKnowledgeLearningResources({ knowledgeId: "knowledge", runtimes: [personal], courseStates: [state("personal")], microRepository: repository(() => null) });
    expect(result.courseContexts[0]).toMatchObject({ courseType: "personal", updatedAt: "2026-08-28T09:30:00Z", sourceGoal: "交付一个可运行的图像分类器" });
  });
});
