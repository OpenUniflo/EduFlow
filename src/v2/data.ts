import { getKnowledgeNode } from "./knowledge/selectors";
import type { AcceptanceSpec, CourseKnowledgeReference, CourseStage, KnowledgeNode, Practice } from "./types";

export const COURSE_ID = "agentic-ai";
export const MATERIAL_ID = "lesson-04";

export const courseStages: CourseStage[] = [
  {
    id: "foundations",
    title: "概念与问题建模",
    description: "建立智能体概念、任务环境和问题形式化基础。",
    lessonIds: ["L01", "L02"],
    color: "#78a7ee",
    x: 80,
    y: 310,
    progress: 100,
    outcome: "任务环境说明书"
  },
  {
    id: "paradigms",
    title: "架构与推理范式",
    description: "比较经典架构、ReAct、Plan-and-Execute 与反思范式。",
    lessonIds: ["L03", "L04", "L05"],
    color: "#9a8ee6",
    x: 340,
    y: 150,
    progress: 72,
    outcome: "范式选择报告"
  },
  {
    id: "system",
    title: "Agent 系统构成",
    description: "理解模型、指令、上下文、Runtime 与安全控制点。",
    lessonIds: ["L06", "L07"],
    color: "#eca86c",
    x: 340,
    y: 450,
    progress: 46,
    outcome: "最小 Agent MVP"
  },
  {
    id: "capabilities",
    title: "工具、知识与记忆",
    description: "让 Agent 使用工具、检索知识并维护状态与长期记忆。",
    lessonIds: ["L08", "L09", "L10"],
    color: "#70c4a5",
    x: 640,
    y: 300,
    progress: 28,
    outcome: "受控单 Agent"
  },
  {
    id: "workflows",
    title: "工作流与多智能体",
    description: "构造路由、并行、Evaluator、Human 与多智能体协作。",
    lessonIds: ["L11", "L12"],
    color: "#77b7c8",
    x: 950,
    y: 150,
    progress: 8,
    outcome: "完整 Agentic Workflow"
  },
  {
    id: "production",
    title: "评测、安全与生产化",
    description: "建立评测、可观测性、Guardrail、权限与部署能力。",
    lessonIds: ["L13", "L14"],
    color: "#ec92aa",
    x: 950,
    y: 450,
    progress: 0,
    outcome: "可信生产系统"
  },
  {
    id: "frontier",
    title: "前沿与综合项目",
    description: "汇总课程成果，完成系统实现、答辩、评测与安全报告。",
    lessonIds: ["L15"],
    color: "#697ee6",
    x: 1240,
    y: 300,
    progress: 0,
    outcome: "Agentic AI 综合项目"
  }
];

export const courseKnowledgeReferences: CourseKnowledgeReference[] = [
  { nodeId: "H01", practiceTitle: "能力边界标注", lesson: 1, stageId: "foundations", prerequisiteNodeIds: [], materialIds: [], status: "completed", x: 40, y: 245 },
  { nodeId: "P01", practiceTitle: "任务环境说明书", lesson: 2, stageId: "foundations", prerequisiteNodeIds: ["H01"], materialIds: [], status: "completed", x: 310, y: 120 },
  { nodeId: "P05", practiceTitle: "验收条件设计", lesson: 2, stageId: "foundations", prerequisiteNodeIds: ["H01"], materialIds: [], status: "completed", x: 310, y: 380 },
  { nodeId: "A05", practiceTitle: "架构演进比较", lesson: 3, stageId: "paradigms", prerequisiteNodeIds: ["P01", "P05"], materialIds: [], status: "completed", x: 580, y: 245 },
  { nodeId: "R02", practiceTitle: "ReAct 工具循环", lesson: 4, stageId: "paradigms", prerequisiteNodeIds: ["A05"], materialIds: [MATERIAL_ID], practiceId: "lesson-04-react", status: "learning", x: 850, y: 120 },
  { nodeId: "R05", practiceTitle: "五种范式比较", lesson: 4, stageId: "paradigms", prerequisiteNodeIds: ["A05"], materialIds: [MATERIAL_ID], practiceId: "lesson-04-plan", status: "learning", x: 850, y: 380 },
  { nodeId: "W05", practiceTitle: "HITL 模板比较", lesson: 5, stageId: "paradigms", prerequisiteNodeIds: ["R02", "R05"], materialIds: [], status: "available", x: 1120, y: 245 },
  { nodeId: "C05", practiceTitle: "最小 Agent 搭建", lesson: 6, stageId: "system", prerequisiteNodeIds: ["W05"], materialIds: [], status: "available", x: 1390, y: 95 },
  { nodeId: "I03", practiceTitle: "Schema 配置实训", lesson: 7, stageId: "system", prerequisiteNodeIds: ["C05"], materialIds: [], status: "available", x: 1390, y: 265 },
  { nodeId: "I04", practiceTitle: "上下文构建实训", lesson: 7, stageId: "system", prerequisiteNodeIds: ["C05"], materialIds: [], status: "available", x: 1390, y: 435 },
  { nodeId: "T01", practiceTitle: "计算工具接入", lesson: 8, stageId: "capabilities", prerequisiteNodeIds: ["I03"], materialIds: [], status: "available", x: 1660, y: 70 },
  { nodeId: "T04", practiceTitle: "失败恢复实训", lesson: 8, stageId: "capabilities", prerequisiteNodeIds: ["T01"], materialIds: [], status: "available", x: 1660, y: 215 },
  { nodeId: "K03", practiceTitle: "知识问答流程", lesson: 9, stageId: "capabilities", prerequisiteNodeIds: ["I03", "I04"], materialIds: [], status: "locked", x: 1660, y: 370 },
  { nodeId: "K05", practiceTitle: "偏好记忆实训", lesson: 9, stageId: "capabilities", prerequisiteNodeIds: ["K03"], materialIds: [], status: "locked", x: 1660, y: 520 },
  { nodeId: "RT01", practiceTitle: "循环 Agent 搭建", lesson: 10, stageId: "capabilities", prerequisiteNodeIds: ["T04", "K03", "K05"], materialIds: [], status: "locked", x: 1930, y: 160 },
  { nodeId: "RT05", practiceTitle: "暂停恢复实训", lesson: 10, stageId: "capabilities", prerequisiteNodeIds: ["RT01"], materialIds: [], status: "locked", x: 1930, y: 350 },
  { nodeId: "WF05", practiceTitle: "课程主工作流", lesson: 11, stageId: "workflows", prerequisiteNodeIds: ["RT01", "RT05"], materialIds: [], status: "locked", x: 2200, y: 255 },
  { nodeId: "MA02", practiceTitle: "多 Agent 调度", lesson: 12, stageId: "workflows", prerequisiteNodeIds: ["WF05"], materialIds: [], status: "locked", x: 2470, y: 120 },
  { nodeId: "MA05", practiceTitle: "能力封装实训", lesson: 12, stageId: "workflows", prerequisiteNodeIds: ["WF05"], materialIds: [], status: "locked", x: 2470, y: 390 },
  { nodeId: "E03", practiceTitle: "评测规则配置", lesson: 13, stageId: "production", prerequisiteNodeIds: ["MA02"], materialIds: [], status: "locked", x: 2740, y: 70 },
  { nodeId: "S04", practiceTitle: "综合安全链", lesson: 14, stageId: "production", prerequisiteNodeIds: ["MA05", "E03"], materialIds: [], status: "locked", x: 2740, y: 285 },
  { nodeId: "F06", practiceTitle: "Agentic AI 综合项目", lesson: 15, stageId: "frontier", prerequisiteNodeIds: ["S04"], materialIds: [], status: "locked", x: 3010, y: 285 }
];

export const knowledgeNodes: KnowledgeNode[] = courseKnowledgeReferences.map((reference) => {
  const node = getKnowledgeNode(reference.nodeId);
  if (!node) throw new Error(`Unknown curriculum knowledge node: ${reference.nodeId}`);
  return {
    ...reference,
    id: node.id,
    title: node.title,
    description: node.description,
    prerequisites: reference.prerequisiteNodeIds,
    color: courseStages.find((stage) => stage.id === reference.stageId)?.color ?? "#697ee6"
  };
});

export const practices: Practice[] = [
  {
    id: "lesson-04-direct",
    title: "Direct 基线实验",
    paradigm: "Direct",
    description: "一次生成政策简报，观察速度、成本与信息缺口。",
    templateId: "lesson-04-direct",
    acceptanceSpecId: "lesson-04-comparison",
    estimatedMinutes: 5
  },
  {
    id: "lesson-04-react",
    title: "ReAct 工具循环",
    paradigm: "ReAct",
    description: "通过搜索、观察和停止条件完成开放式资料任务。",
    templateId: "lesson-04-react",
    acceptanceSpecId: "lesson-04-comparison",
    estimatedMinutes: 7
  },
  {
    id: "lesson-04-plan",
    title: "Plan-and-Execute",
    paradigm: "Plan-and-Execute",
    description: "先生成可检查计划，再逐项收集、比较和验证。",
    templateId: "lesson-04-plan",
    acceptanceSpecId: "lesson-04-comparison",
    estimatedMinutes: 7
  },
  {
    id: "lesson-04-replan",
    title: "Replanning",
    paradigm: "Replanning",
    description: "遇到搜索超时或新增隐私要求时，仅修改剩余计划。",
    templateId: "lesson-04-replan",
    acceptanceSpecId: "lesson-04-comparison",
    estimatedMinutes: 6
  },
  {
    id: "lesson-04-evaluator",
    title: "Evaluator-Optimizer",
    paradigm: "Evaluator-Optimizer",
    description: "使用结构化 Rubric 检查覆盖、引用、风险和建议。",
    templateId: "lesson-04-evaluator",
    acceptanceSpecId: "lesson-04-comparison",
    estimatedMinutes: 5
  }
];

export const acceptanceSpec: AcceptanceSpec = {
  id: "lesson-04-comparison",
  title: "同一任务下的推理范式比较",
  checks: [
    { id: "structure", label: "结构完整", weight: 25 },
    { id: "behavior", label: "行为符合范式", weight: 25 },
    { id: "result", label: "结果满足约束", weight: 30 },
    { id: "trace", label: "轨迹可审计", weight: 20 }
  ]
};

export const courseEdges = knowledgeNodes.flatMap((node) =>
  node.prerequisites.map((source) => ({ source, target: node.id }))
);

export const stageEdges = [
  ["foundations", "paradigms"],
  ["foundations", "system"],
  ["paradigms", "capabilities"],
  ["system", "capabilities"],
  ["capabilities", "workflows"],
  ["capabilities", "production"],
  ["workflows", "frontier"],
  ["production", "frontier"]
] as const;
