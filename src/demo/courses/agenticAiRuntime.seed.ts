import type { Course, Material, MaterialKnowledgeCoverage } from "@/features/course/types";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
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
  description: "从问题建模出发，逐步形成可设计、可运行、可治理的智能体系统能力。",
  accentColor: "#697ee6"
};

export const agenticAiMaterial: Material = {
  id: lessonFourMaterial.id,
  courseId: lessonFourMaterial.courseId,
  lessonId: "L04",
  order: 0,
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

export const agenticAiNativeMaterials: Material[] = [
  { id: "native-parallel-merge", courseId: COURSE_ID, lessonId: "L12", order: 0, title: "并行执行与结果汇合", description: "AI Native Lesson · 从串行检索重构为并行研究工作流", type: "article", duration: "35 分钟", segments: [
    { id: "parallel-problem", order: 1, title: "Research Agent 的等待瓶颈", section: "Problem / Scenario", content: { lead: "同一个研究问题需要同时查询 Web、Paper Database 与 Internal Knowledge Base。", bullets: ["已有 Research Agent", "已有 Search Tool 与 Paper Retriever", "已有 Internal RAG"], visual: "overview" } },
    { id: "parallel-comparison", order: 2, title: "串行与并行", section: "Comparison", content: { table: { headers: ["策略", "执行", "风险"], rows: [["串行", "Web → Paper → RAG → Merge", "等待时间叠加"], ["并行", "Planner → 3 Workers → Merge", "需要处理 partial failure"]] }, visual: "comparison" } },
    { id: "parallel-flow", order: 3, title: "并行汇合结构", section: "Diagram / Flow", content: { code: "          ┌→ Web ──────┐\nPlanner ──┼→ Paper ────┼→ Evidence Merge\n          └→ RAG ──────┘", visual: "flow" } },
    { id: "parallel-trace", order: 4, title: "观察一条真实执行轨迹", section: "Trace", content: { code: "Planner start\nWeb start\nPaper start\nRAG start\nRAG finish\nWeb finish\nPaper finish\nMerge received 3/3", visual: "trace" } },
    { id: "parallel-practice", order: 5, title: "进入实训", section: "Practice CTA", content: { lead: "连接、调整并扩展已加载的并行结构与 Merge。", bullets: ["检查 Worker context boundary", "定义 Merge 完成条件", "保留来源与责任边界"], visual: "practice" } }
  ] },
  { id: "native-failure-verification", courseId: COURSE_ID, lessonId: "L13", order: 0, title: "故障、验证与终止", description: "AI Native Lesson · 正确处理 Worker timeout、验证与取消", type: "article", duration: "40 分钟", segments: [
    { id: "failure-scenario", order: 1, title: "第一个 Candidate 不等于成功", section: "Warning / Failure Case", content: { lead: "某个 Worker 先返回 Candidate 时立即取消其他 Worker，会把未经验证的候选当成最终事实。", code: "错误：Candidate → Cancel Others", visual: "decision" } },
    { id: "failure-correct", order: 2, title: "可靠终止链路", section: "Explanation", content: { code: "Candidate → Verifier → Verified Success → Atomic Settle → Cancel Remaining Workers", bullets: ["timeout 进入有界 Retry", "重试耗尽后进入 Fallback", "Verifier reject 返回执行路径"], visual: "flow" } },
    { id: "failure-source", order: 3, title: "来源映射", section: "Source Reference", content: { lead: "对应原教材 Runtime、Evaluation 与 Multi-Agent 主题；仅保留来源映射，不复制原文。", visual: "overview" } },
    { id: "failure-practice", order: 4, title: "修复 Workflow", section: "Practice CTA", content: { lead: "继承 Parallel Workflow，补充 Timeout、Retry、Verifier 与 Cancel/Fallback。", visual: "practice" } }
  ] }
];

export const nativeMaterialCoverages: MaterialKnowledgeCoverage[] = [
  ["native-parallel-merge", "parallel-problem", "MA02", "introduce"], ["native-parallel-merge", "parallel-flow", "WF03", "explain"], ["native-parallel-merge", "parallel-practice", "W13", "practice-reference"],
  ["native-failure-verification", "failure-scenario", "E13", "example"], ["native-failure-verification", "failure-correct", "RT14", "explain"], ["native-failure-verification", "failure-practice", "WF03", "practice-reference"]
].map(([materialId, segmentId, nodeId, role], index) => ({ id: `native-coverage-${index + 1}`, materialId, segmentId, nodeId, role: role as MaterialKnowledgeCoverage["role"] }));

export const agenticAiRuntime: CourseRuntimeData = {
  course: agenticAiCourse,
  curriculum: agenticCurriculum,
  chapters: curriculumChapters,
  lessons: curriculumLessons,
  curriculumCoverages,
  curriculumSequences,
  assignments: courseAssignments,
  assignmentCoverages,
  assignmentDependencies: [],
  chapterOutcomes: [],
  assignmentOutcomeCompositions: [],
  finalProjects: [],
  finalProjectOutcomeCompositions: [],
  materials: [agenticAiMaterial, ...agenticAiNativeMaterials],
  materialKnowledgeCoverages: [...agenticAiMaterialKnowledgeCoverages, ...nativeMaterialCoverages],
  revision: "agentic-ai-v4-final-model-freeze"
};
