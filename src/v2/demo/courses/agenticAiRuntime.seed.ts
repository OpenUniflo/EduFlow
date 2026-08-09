import type { Course, Material, MaterialKnowledgeCoverage } from "../../types";
import type { CourseRuntimeData } from "../../course/runtime/courseRuntime";
import { lessonFourMaterial } from "../materials/agenticAiMaterials.seed";
import {
  COURSE_ID,
  agenticCurriculum,
  assignmentCoverages,
  courseAssignments,
  curriculumChapters,
  curriculumCoverages,
  curriculumLessons,
  curriculumSequences
} from "./agenticAiCourse.seed";

export const agenticAiCourse: Course = {
  id: COURSE_ID,
  title: "智能体系统设计与实践",
  subtitle: "Agentic AI：从问题建模到受治理智能体",
  description: "从概念、问题建模和推理范式出发，逐步构建可运行、可评测、可治理的 Agent 系统。",
  accentColor: "#697ee6"
};

export const agenticAiMaterial: Material = {
  id: lessonFourMaterial.id,
  courseId: lessonFourMaterial.courseId,
  lessonId: "L04",
  title: lessonFourMaterial.title,
  description: lessonFourMaterial.subtitle,
  type: "pdf",
  source: { kind: "pdf", url: "/materials/agentic-ai/lesson-04.pdf", pageCount: lessonFourMaterial.pageCount },
  duration: lessonFourMaterial.duration,
  segments: lessonFourMaterial.pages.map((page) => ({
    id: `page-${page.number}`,
    order: page.number,
    page: page.number,
    title: page.title,
    section: page.section
  }))
};

const materialGroups: Array<{ segmentIds: string[]; nodeIds: string[]; role: MaterialKnowledgeCoverage["role"] }> = [
  { segmentIds: "page-1 page-2 page-3 page-4 page-5".split(" "), nodeIds: ["P05"], role: "introduce" },
  { segmentIds: "page-6 page-7 page-8".split(" "), nodeIds: ["R01", "R10"], role: "example" },
  { segmentIds: "page-9 page-10 page-11 page-12 page-13 page-14".split(" "), nodeIds: ["R10", "R11"], role: "explain" },
  { segmentIds: "page-15 page-16 page-17 page-18".split(" "), nodeIds: ["R03", "R04", "R11"], role: "explain" },
  { segmentIds: "page-19 page-20 page-21".split(" "), nodeIds: ["R11", "R06", "R03"], role: "practice-reference" },
  { segmentIds: "page-22 page-23 page-24 page-25 page-26".split(" "), nodeIds: ["R07", "R08", "R09", "R11"], role: "explain" },
  { segmentIds: "page-27 page-28 page-29".split(" "), nodeIds: ["R03", "R07", "R09"], role: "example" },
  { segmentIds: "page-30 page-31 page-32".split(" "), nodeIds: ["R01", "R10", "R03", "R11", "R07"], role: "practice-reference" },
  { segmentIds: ["page-12"], nodeIds: ["R01"], role: "introduce" }
];

export const agenticAiMaterialKnowledgeCoverages: MaterialKnowledgeCoverage[] = materialGroups.flatMap((group, groupIndex) =>
  group.segmentIds.flatMap((segmentId) => group.nodeIds.map((nodeId) => ({
    id: `material-coverage-agentic-${String(groupIndex + 1).padStart(2, "0")}-${segmentId}-${nodeId}`,
    materialId: agenticAiMaterial.id,
    segmentId,
    nodeId,
    role: group.role
  })))
);

export const agenticAiRuntime: CourseRuntimeData = {
  course: agenticAiCourse,
  curriculum: agenticCurriculum,
  chapters: curriculumChapters,
  lessons: curriculumLessons,
  curriculumCoverages,
  curriculumSequences,
  assignments: courseAssignments,
  assignmentCoverages,
  materials: [agenticAiMaterial],
  materialKnowledgeCoverages: agenticAiMaterialKnowledgeCoverages,
  revision: "agentic-ai-v2"
};
