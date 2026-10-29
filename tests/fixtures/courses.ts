import type { CourseRepository } from "@/features/course/repository/CourseRepository";
import { validateCourseRuntime, type CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { CourseAssignment, UserCourseState } from "@/features/course/types";
import type { KnowledgeAccessContext, KnowledgeRepository } from "@/features/knowledge/repository/KnowledgeRepository";
import type { UserKnowledgeRecord } from "@/features/profile/types";

const TIME = "2026-01-01T00:00:00.000Z";
const ALPHA = "fixture-course-alpha";
const BETA = "fixture-course-beta";

function assignment(courseId: string, id: string, order: number, title: string, nodes: Array<[string, "practice" | "apply" | "assess"]>, extra: Partial<CourseAssignment> = {}) {
  return {
    assignment: {
      id,
      courseId,
      order,
      title,
      description: `Synthetic assignment ${title}.`,
      requirements: ["Complete the synthetic task"],
      expectedOutput: `${id}-output`,
      acceptanceCriteria: ["Output is reviewable"],
      mode: "instruction" as const,
      estimatedMinutes: 15,
      ...extra
    },
    coverages: nodes.map(([nodeId, role], index) => ({ id: `${id}-coverage-${index}`, assignmentId: id, nodeId, role }))
  };
}

const alphaAssignments = [
  assignment(ALPHA, "alpha-practice-ab", 0, "Practice Alpha and Beta", [["syn-a", "practice"], ["syn-b", "apply"]]),
  assignment(ALPHA, "alpha-practice-cd", 1, "Practice Gamma and Delta", [["syn-c", "practice"], ["syn-d", "apply"]]),
  assignment(ALPHA, "alpha-chapter-1", 2, "Chapter One Review", [["syn-a", "assess"]], { mode: "workflow", workflowTemplateId: "fixture-workflow-alpha", experience: { type: "workflow" } }),
  assignment(ALPHA, "alpha-chapter-2", 3, "Chapter Two Review", [["syn-c", "assess"]])
];

const betaAssignments = [
  assignment(BETA, "beta-practice-ef", 0, "Practice Epsilon and Zeta", [["syn-e", "practice"], ["syn-f", "apply"]]),
  assignment(BETA, "beta-practice-gc", 1, "Practice Eta and Gamma", [["syn-g", "practice"], ["syn-c", "apply"]])
];

const alphaCoverages = [
  { id: "alpha-curriculum-1", courseId: ALPHA, lessonId: "alpha-lesson-1", nodeId: "syn-a", role: "introduce" as const, order: 0 },
  { id: "alpha-curriculum-2", courseId: ALPHA, lessonId: "alpha-lesson-1", nodeId: "syn-b", role: "introduce" as const, order: 1 },
  { id: "alpha-curriculum-3", courseId: ALPHA, lessonId: "alpha-lesson-2", nodeId: "syn-b", role: "reinforce" as const, order: 0 },
  { id: "alpha-curriculum-4", courseId: ALPHA, lessonId: "alpha-lesson-3", nodeId: "syn-c", role: "introduce" as const, order: 0 },
  { id: "alpha-curriculum-5", courseId: ALPHA, lessonId: "alpha-lesson-4", nodeId: "syn-d", role: "introduce" as const, order: 0 }
];

const betaCoverages = [
  { id: "beta-curriculum-1", courseId: BETA, lessonId: "beta-lesson-1", nodeId: "syn-e", role: "introduce" as const, order: 0 },
  { id: "beta-curriculum-2", courseId: BETA, lessonId: "beta-lesson-1", nodeId: "syn-f", role: "introduce" as const, order: 1 },
  { id: "beta-curriculum-3", courseId: BETA, lessonId: "beta-lesson-2", nodeId: "syn-g", role: "introduce" as const, order: 0 },
  { id: "beta-curriculum-4", courseId: BETA, lessonId: "beta-lesson-2", nodeId: "syn-c", role: "reinforce" as const, order: 1 }
];

const alphaMaterialCoverages = [
  { id: "alpha-material-coverage-1", materialId: "alpha-article", segmentId: "alpha-seg-1", nodeId: "syn-a", role: "introduce" as const },
  { id: "alpha-material-coverage-2", materialId: "alpha-article", segmentId: "alpha-seg-1", nodeId: "syn-b", role: "explain" as const },
  { id: "alpha-material-coverage-3", materialId: "alpha-article", segmentId: "alpha-seg-2", nodeId: "syn-b", role: "example" as const },
  { id: "alpha-material-coverage-4", materialId: "alpha-article", segmentId: "alpha-seg-2", nodeId: "syn-c", role: "introduce" as const },
  { id: "alpha-material-coverage-5", materialId: "alpha-article", segmentId: "alpha-seg-3", nodeId: "syn-d", role: "practice-reference" as const },
  { id: "alpha-material-coverage-6", materialId: "alpha-notes", segmentId: "alpha-notes-1", nodeId: "syn-b", role: "explain" as const }
];

const betaMaterialCoverages = [
  { id: "beta-material-coverage-1", materialId: "beta-article", segmentId: "beta-seg-1", nodeId: "syn-e", role: "introduce" as const },
  { id: "beta-material-coverage-2", materialId: "beta-article", segmentId: "beta-seg-1", nodeId: "syn-f", role: "explain" as const },
  { id: "beta-material-coverage-3", materialId: "beta-article", segmentId: "beta-seg-2", nodeId: "syn-g", role: "introduce" as const },
  { id: "beta-material-coverage-4", materialId: "beta-article", segmentId: "beta-seg-2", nodeId: "syn-c", role: "explain" as const },
  { id: "beta-material-coverage-5", materialId: "beta-notes-one", segmentId: "beta-notes-one-1", nodeId: "syn-c", role: "example" as const },
  { id: "beta-material-coverage-6", materialId: "beta-notes-two", segmentId: "beta-notes-two-1", nodeId: "syn-c", role: "practice-reference" as const }
];

export const syntheticAlphaRuntime: CourseRuntimeData = {
  course: { id: ALPHA, title: "Fixture Course Alpha", subtitle: "Synthetic course", description: "A synthetic course used by rule tests.", targetOutcome: "Synthetic Alpha outcome", accentColor: "#697ee6", generationStatus: "ready" },
  curriculum: { id: "alpha-curriculum", courseId: ALPHA, generationMode: "auto-fixed-count", requestedChapterCount: 2 },
  chapters: [
    { id: "alpha-chapter-1", courseId: ALPHA, title: "Alpha Chapter One", description: "Synthetic chapter one.", order: 0, color: "#78a7ee", outcome: "Alpha one outcome" },
    { id: "alpha-chapter-2", courseId: ALPHA, title: "Alpha Chapter Two", description: "Synthetic chapter two.", order: 1, color: "#9a8ee6", outcome: "Alpha two outcome" }
  ],
  lessons: [
    { id: "alpha-lesson-1", courseId: ALPHA, chapterId: "alpha-chapter-1", title: "Alpha Lesson One", order: 0 },
    { id: "alpha-lesson-2", courseId: ALPHA, chapterId: "alpha-chapter-1", title: "Alpha Lesson Two", order: 1 },
    { id: "alpha-lesson-3", courseId: ALPHA, chapterId: "alpha-chapter-2", title: "Alpha Lesson Three", order: 2 },
    { id: "alpha-lesson-4", courseId: ALPHA, chapterId: "alpha-chapter-2", title: "Alpha Lesson Four", order: 3 }
  ],
  curriculumCoverages: alphaCoverages,
  curriculumSequences: [
    { id: "alpha-sequence-1", courseId: ALPHA, sourceLessonId: "alpha-lesson-1", targetLessonId: "alpha-lesson-2" },
    { id: "alpha-sequence-2", courseId: ALPHA, sourceLessonId: "alpha-lesson-2", targetLessonId: "alpha-lesson-3" },
    { id: "alpha-sequence-3", courseId: ALPHA, sourceLessonId: "alpha-lesson-3", targetLessonId: "alpha-lesson-4" }
  ],
  assignments: alphaAssignments.map((item) => item.assignment),
  assignmentCoverages: alphaAssignments.flatMap((item) => item.coverages),
  assignmentDependencies: [
    { id: "alpha-dependency-1", courseId: ALPHA, sourceAssignmentId: "alpha-practice-ab", targetAssignmentId: "alpha-practice-cd", strength: "hard" },
    { id: "alpha-dependency-2", courseId: ALPHA, sourceAssignmentId: "alpha-practice-cd", targetAssignmentId: "alpha-chapter-1", strength: "soft" }
  ],
  chapterOutcomes: [
    { id: "alpha-outcome-1", courseId: ALPHA, chapterId: "alpha-chapter-1", title: "Alpha one outcome" },
    { id: "alpha-outcome-2", courseId: ALPHA, chapterId: "alpha-chapter-2", title: "Alpha two outcome" }
  ],
  assignmentOutcomeCompositions: [
    { id: "alpha-composition-1", assignmentId: "alpha-practice-ab", outcomeId: "alpha-outcome-1" },
    { id: "alpha-composition-2", assignmentId: "alpha-practice-cd", outcomeId: "alpha-outcome-2" }
  ],
  finalProjects: [{ id: "alpha-final", courseId: ALPHA, title: "Alpha Final", description: "Synthetic final project." }],
  finalProjectOutcomeCompositions: [
    { id: "alpha-final-composition-1", finalProjectId: "alpha-final", outcomeId: "alpha-outcome-1" },
    { id: "alpha-final-composition-2", finalProjectId: "alpha-final", outcomeId: "alpha-outcome-2" }
  ],
  materials: [
    {
      id: "alpha-article",
      courseId: ALPHA,
      order: 0,
      title: "Alpha Article",
      description: "Synthetic article material.",
      type: "article",
      segments: [
        { id: "alpha-seg-1", order: 0, title: "Alpha One", section: "Synthetic", content: { lead: "Synthetic lead one." } },
        { id: "alpha-seg-2", order: 1, title: "Alpha Two", section: "Synthetic", content: { lead: "Synthetic lead two." } },
        { id: "alpha-seg-3", order: 2, title: "Alpha Three", section: "Synthetic", content: { lead: "Synthetic lead three." } }
      ]
    },
    {
      id: "alpha-notes",
      courseId: ALPHA,
      order: 1,
      title: "Alpha Notes",
      description: "Synthetic notes material.",
      type: "article",
      segments: [{ id: "alpha-notes-1", order: 0, title: "Alpha Notes One", section: "Synthetic", content: { lead: "Synthetic notes." } }]
    }
  ],
  materialKnowledgeCoverages: alphaMaterialCoverages,
  revision: "alpha-v1"
};

export const syntheticBetaRuntime: CourseRuntimeData = {
  course: { id: BETA, title: "Fixture Course Beta", subtitle: "Synthetic course", description: "A second synthetic course used by rule tests.", targetOutcome: "Synthetic Beta outcome", accentColor: "#53b89a", generationStatus: "ready" },
  curriculum: { id: "beta-curriculum", courseId: BETA, generationMode: "manual" },
  chapters: [
    { id: "beta-chapter-1", courseId: BETA, title: "Beta Chapter One", description: "Synthetic chapter one.", order: 0, color: "#78a7ee", outcome: "Beta one outcome" },
    { id: "beta-chapter-2", courseId: BETA, title: "Beta Chapter Two", description: "Synthetic chapter two.", order: 1, color: "#9a8ee6", outcome: "Beta two outcome" }
  ],
  lessons: [
    { id: "beta-lesson-1", courseId: BETA, chapterId: "beta-chapter-1", title: "Beta Lesson One", order: 0 },
    { id: "beta-lesson-2", courseId: BETA, chapterId: "beta-chapter-2", title: "Beta Lesson Two", order: 1 }
  ],
  curriculumCoverages: betaCoverages,
  curriculumSequences: [{ id: "beta-sequence-1", courseId: BETA, sourceLessonId: "beta-lesson-1", targetLessonId: "beta-lesson-2" }],
  assignments: betaAssignments.map((item) => item.assignment),
  assignmentCoverages: betaAssignments.flatMap((item) => item.coverages),
  assignmentDependencies: [],
  chapterOutcomes: [
    { id: "beta-outcome-1", courseId: BETA, chapterId: "beta-chapter-1", title: "Beta one outcome" },
    { id: "beta-outcome-2", courseId: BETA, chapterId: "beta-chapter-2", title: "Beta two outcome" }
  ],
  assignmentOutcomeCompositions: [
    { id: "beta-composition-1", assignmentId: "beta-practice-ef", outcomeId: "beta-outcome-1" },
    { id: "beta-composition-2", assignmentId: "beta-practice-gc", outcomeId: "beta-outcome-2" }
  ],
  finalProjects: [{ id: "beta-final", courseId: BETA, title: "Beta Final", description: "Synthetic final project." }],
  finalProjectOutcomeCompositions: [
    { id: "beta-final-composition-1", finalProjectId: "beta-final", outcomeId: "beta-outcome-1" },
    { id: "beta-final-composition-2", finalProjectId: "beta-final", outcomeId: "beta-outcome-2" }
  ],
  materials: [
    {
      id: "beta-article",
      courseId: BETA,
      order: 0,
      title: "Beta Article",
      description: "Synthetic article material.",
      type: "article",
      segments: [
        { id: "beta-seg-1", order: 0, title: "Beta One", section: "Synthetic", content: { lead: "Synthetic lead one." } },
        { id: "beta-seg-2", order: 1, title: "Beta Two", section: "Synthetic", content: { lead: "Synthetic lead two." } }
      ]
    },
    { id: "beta-notes-one", courseId: BETA, order: 1, title: "Beta Notes One", type: "article", segments: [{ id: "beta-notes-one-1", order: 0, title: "Beta Notes One", content: { lead: "Synthetic notes." } }] },
    { id: "beta-notes-two", courseId: BETA, order: 2, title: "Beta Notes Two", type: "article", segments: [{ id: "beta-notes-two-1", order: 0, title: "Beta Notes Two", content: { lead: "Synthetic notes." } }] }
  ],
  materialKnowledgeCoverages: betaMaterialCoverages,
  revision: "beta-v1"
};

export const syntheticCourseRuntimes: CourseRuntimeData[] = [syntheticAlphaRuntime, syntheticBetaRuntime];

export class SyntheticCourseRepository implements CourseRepository {
  private readonly runtimeById: Map<string, CourseRuntimeData>;

  constructor(knowledgeRepository: KnowledgeRepository, runtimes: CourseRuntimeData[] = syntheticCourseRuntimes, access: KnowledgeAccessContext = { visibleScopes: ["global"] }) {
    runtimes.forEach((runtime) => validateCourseRuntime(runtime, knowledgeRepository, access));
    this.runtimeById = new Map(runtimes.map((runtime) => [runtime.course.id, runtime]));
  }

  listCourseRuntimes() { return [...this.runtimeById.values()]; }
  getCourse(courseId: string) { return this.runtimeById.get(courseId) ?? null; }
}

export function syntheticUserCourseState(userId: string, courseId: string): UserCourseState {
  const runtime = syntheticCourseRuntimes.find((item) => item.course.id === courseId);
  const completed = userId === "fixture-user-a" ? 1 : 0;
  return {
    userId,
    courseId,
    isActive: true,
    assignmentStates: Object.fromEntries((runtime?.assignments ?? []).map((item, index) => [item.id, {
      assignmentId: item.id,
      status: index < completed ? "completed" as const : "not-started" as const,
      progress: index < completed ? 100 : 0
    }])),
    materialStates: {},
    updatedAt: TIME
  };
}

export function syntheticUserKnowledge(userId: string): UserKnowledgeRecord[] {
  if (userId !== "fixture-user-a") return [];
  return [
    { nodeId: "syn-a", status: "mastered", mastery: 70, masteryOrigin: "direct", updatedAt: TIME },
    { nodeId: "syn-b", status: "learning", mastery: 50, masteryOrigin: "direct", updatedAt: TIME }
  ];
}

