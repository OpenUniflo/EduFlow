import type { CourseCreationScenario, CourseCreationScenarioResolver } from "@/features/course/creation/demoScenario";
import { GOLDEN_COURSE_ID } from "./goldenCourse.seed";

const normalizedGoldenNames = new Set(["ai-agents-in-depth-zh-cn.pdf", "ai-agents-in-depth-zh-cn(2).pdf", "ai agents in depth zh cn.pdf"]);
const goldenSha256 = "0b47ef3f02396b694bea58be02706ce60ff1e7e3dae293475abe111d69cb2f3b";
const normalize = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[_–—]+/g, "-").replace(/\s+/g, " ").trim();

export const agenticAiBookScenario: CourseCreationScenario = {
  id: "agentic-ai-book-golden",
  courseId: GOLDEN_COURSE_ID,
  title: "Agentic AI 工程实践：从单 Agent 到多智能体研究系统",
  prototypeLabel: "Prototype · AI 生成过程为演示模拟",
  sourceLabel: "AI Agents in Depth · 本地教材",
  stages: [
    ["parse", "解析教材", "识别章节、图表与技术主题"], ["extract", "提取知识概念", "形成可教学、可评测的原子能力"],
    ["relations", "分析知识依赖", "重建跨模块的真实前置关系"], ["path", "重构教学路径", "组织为 6 个递进工程篇章"],
    ["practice", "设计实训", "为每个 Knowledge 配置可验收 Assignment"], ["lesson", "生成互动课件", "生成两节重点 AI Native Lesson"]
  ].map(([id, label, detail]) => ({ id, label, detail })),
  insights: ["原教材以技术主题组织，部分章节相对独立。", "为了让学生逐步构建同一个 Agent 系统，课程被重构为 6 个递进篇章。", "原始 PDF 保留为权威来源，互动课件承载教学再设计。"],
  reconstruction: [
    { source: "Agent 基础主题", target: "任务建模与最小 Agent" }, { source: "Context / Tools / Memory", target: "可复用的知识工具 Agent" },
    { source: "Runtime / Evaluation", target: "可恢复、可信执行" }, { source: "Multi-Agent", target: "研究系统与 Final Project" }
  ],
  summary: [{ value: 6, label: "篇章" }, { value: 31, label: "Knowledge" }, { value: 31, label: "知识点实训" }, { value: 6, label: "篇章实训" }, { value: 1, label: "Final Project" }]
};

export const demoCourseCreationScenarioResolver: CourseCreationScenarioResolver = {
  async resolve(files) {
    const file = files[0];
    if (!file || file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return null;
    // SHA-256 is computed locally so a hash can become the primary matcher once the approved digest is recorded.
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (hex === goldenSha256) return agenticAiBookScenario;
    }
    return normalizedGoldenNames.has(normalize(file.name)) ? agenticAiBookScenario : null;
  }
};
