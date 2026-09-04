import type { KnowledgeGraph } from "@/features/knowledge/types";
import type { CourseRuntimeData } from "./courseRuntime";

export const routeOnlyKnowledgeGraph: KnowledgeGraph = {
  nodes: [{
    id: "route-knowledge",
    title: "Route Knowledge",
    description: "The minimum teachable route node",
    type: "conceptual",
    masteryCriteria: ["Explain the route"],
    scope: "global",
    provenance: [{ sourceType: "import", sourceId: "course-import-contract" }],
    currentRevisionId: "route-knowledge-r1",
    status: "active"
  }],
  revisions: [{
    id: "route-knowledge-r1",
    nodeId: "route-knowledge",
    version: 1,
    title: "Route Knowledge",
    description: "The minimum teachable route node",
    type: "conceptual",
    masteryCriteria: ["Explain the route"],
    createdAt: "2026-08-25T00:00:00.000Z"
  }],
  edges: []
};

export const routeOnlyRuntime: CourseRuntimeData = {
  course: { id: "route-only-course", title: "Route-only Course", description: "A valid Course without optional assets", generationStatus: "ready", lifecycle: "published" },
  curriculum: { id: "route-only-curriculum", courseId: "route-only-course", generationMode: "manual" },
  chapters: [{ id: "route-only-chapter", courseId: "route-only-course", title: "Route", description: "Route chapter", order: 0, color: "#6078db", outcome: "Understand the route" }],
  lessons: [{ id: "route-only-lesson", courseId: "route-only-course", chapterId: "route-only-chapter", title: "Route lesson", order: 0 }],
  curriculumCoverages: [{ id: "route-only-coverage", courseId: "route-only-course", lessonId: "route-only-lesson", nodeId: "route-knowledge", role: "introduce", order: 0 }],
  curriculumSequences: [],
  assignments: [],
  assignmentCoverages: [],
  assignmentDependencies: [],
  chapterOutcomes: [],
  assignmentOutcomeCompositions: [],
  finalProjects: [],
  finalProjectOutcomeCompositions: [],
  materials: [],
  materialKnowledgeCoverages: [],
  revision: "route-only-v1"
};
