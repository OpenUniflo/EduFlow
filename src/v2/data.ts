import type { AcceptanceSpec, CourseStage, KnowledgeNode, Practice } from "./types";

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

type GraphNodeSeed = Omit<KnowledgeNode, "color">;
const graphNode = (seed: GraphNodeSeed): KnowledgeNode => ({
  ...seed,
  color: courseStages.find((stage) => stage.id === seed.stageId)?.color ?? "#697ee6"
});

export const knowledgeNodes: KnowledgeNode[] = [
  graphNode({ id: "H01", title: "Agentic AI 全景", practiceTitle: "能力边界标注", lesson: 1, stageId: "foundations", description: "理解 Agent、Workflow 与自动化系统的边界。", prerequisites: [], materialIds: [], status: "completed", x: 40, y: 245 }),
  graphNode({ id: "P01", title: "任务环境建模", practiceTitle: "任务环境说明书", lesson: 2, stageId: "foundations", description: "识别目标、环境、约束、动作和完成条件。", prerequisites: ["H01"], materialIds: [], status: "completed", x: 310, y: 120 }),
  graphNode({ id: "P05", title: "完成条件与约束", practiceTitle: "验收条件设计", lesson: 2, stageId: "foundations", description: "把自然语言要求转化为可检查的完成条件。", prerequisites: ["H01"], materialIds: [], status: "completed", x: 310, y: 380 }),
  graphNode({ id: "A05", title: "经典与现代 Agent", practiceTitle: "架构演进比较", lesson: 3, stageId: "paradigms", description: "从经典智能体架构理解现代 LLM Agent 的演进。", prerequisites: ["P01", "P05"], materialIds: [], status: "completed", x: 580, y: 245 }),
  graphNode({ id: "R02", title: "ReAct 与推理循环", practiceTitle: "ReAct 工具循环", lesson: 4, stageId: "paradigms", description: "让推理、行动与观察组成可审计闭环。", prerequisites: ["A05"], materialIds: [MATERIAL_ID], practiceId: "lesson-04-react", status: "learning", x: 850, y: 120 }),
  graphNode({ id: "R05", title: "规划、重规划与反思", practiceTitle: "五种范式比较", lesson: 4, stageId: "paradigms", description: "比较 Direct、Plan-and-Execute、Replanning 与 Evaluator–Optimizer。", prerequisites: ["A05"], materialIds: [MATERIAL_ID], practiceId: "lesson-04-plan", status: "learning", x: 850, y: 380 }),
  graphNode({ id: "W05", title: "混合架构与 HITL", practiceTitle: "HITL 模板比较", lesson: 5, stageId: "paradigms", description: "组合固定流程、Agent 决策、Evaluator 与人工审批。", prerequisites: ["R02", "R05"], materialIds: [], status: "available", x: 1120, y: 245 }),
  graphNode({ id: "C05", title: "最小 Agent", practiceTitle: "最小 Agent 搭建", lesson: 6, stageId: "system", description: "搭建输入、模型、状态与输出组成的最小 Agent。", prerequisites: ["W05"], materialIds: [], status: "available", x: 1390, y: 95 }),
  graphNode({ id: "I03", title: "结构化输出", practiceTitle: "Schema 配置实训", lesson: 7, stageId: "system", description: "使用 JSON Schema 保证节点间可靠传递数据。", prerequisites: ["C05"], materialIds: [], status: "available", x: 1390, y: 265 }),
  graphNode({ id: "I04", title: "Context Engineering", practiceTitle: "上下文构建实训", lesson: 7, stageId: "system", description: "组织指令、历史、知识、记忆与工具结果。", prerequisites: ["C05"], materialIds: [], status: "available", x: 1390, y: 435 }),
  graphNode({ id: "T01", title: "Tool Use", practiceTitle: "计算工具接入", lesson: 8, stageId: "capabilities", description: "让 Agent 根据任务决定何时调用外部工具。", prerequisites: ["I03"], materialIds: [], status: "available", x: 1660, y: 70 }),
  graphNode({ id: "T04", title: "错误与重试", practiceTitle: "失败恢复实训", lesson: 8, stageId: "capabilities", description: "处理参数校验、超时、失败、重试与回退。", prerequisites: ["T01"], materialIds: [], status: "available", x: 1660, y: 215 }),
  graphNode({ id: "K03", title: "RAG 与引用", practiceTitle: "知识问答流程", lesson: 9, stageId: "capabilities", description: "构建检索、重排序、注入与来源追踪链路。", prerequisites: ["I03", "I04"], materialIds: [], status: "locked", x: 1660, y: 370 }),
  graphNode({ id: "K05", title: "长期记忆", practiceTitle: "偏好记忆实训", lesson: 9, stageId: "capabilities", description: "理解记忆读取、条件写入、冲突更新与遗忘。", prerequisites: ["K03"], materialIds: [], status: "locked", x: 1660, y: 520 }),
  graphNode({ id: "RT01", title: "Agent Loop", practiceTitle: "循环 Agent 搭建", lesson: 10, stageId: "capabilities", description: "构造 Observe–Think–Act 的自主执行循环。", prerequisites: ["T04", "K03", "K05"], materialIds: [], status: "locked", x: 1930, y: 160 }),
  graphNode({ id: "RT05", title: "Checkpoint 与审计", practiceTitle: "暂停恢复实训", lesson: 10, stageId: "capabilities", description: "保存中间状态、恢复执行并记录完整轨迹。", prerequisites: ["RT01"], materialIds: [], status: "locked", x: 1930, y: 350 }),
  graphNode({ id: "WF05", title: "Agentic Workflow", practiceTitle: "课程主工作流", lesson: 11, stageId: "workflows", description: "组合确定性链路、Agent Island、Evaluator 与审批。", prerequisites: ["RT01", "RT05"], materialIds: [], status: "locked", x: 2200, y: 255 }),
  graphNode({ id: "MA02", title: "Supervisor", practiceTitle: "多 Agent 调度", lesson: 12, stageId: "workflows", description: "由中央 Agent 分配任务并整合专业 Agent 结果。", prerequisites: ["WF05"], materialIds: [], status: "locked", x: 2470, y: 120 }),
  graphNode({ id: "MA05", title: "Skill / MCP / A2A", practiceTitle: "能力封装实训", lesson: 12, stageId: "workflows", description: "理解能力封装、工具协议与 Agent 远程协作。", prerequisites: ["WF05"], materialIds: [], status: "locked", x: 2470, y: 390 }),
  graphNode({ id: "E03", title: "结果与轨迹评测", practiceTitle: "评测规则配置", lesson: 13, stageId: "production", description: "分别评测最终结果、计划、工具调用与中间步骤。", prerequisites: ["MA02"], materialIds: [], status: "locked", x: 2740, y: 70 }),
  graphNode({ id: "S04", title: "Guardrail 与权限", practiceTitle: "综合安全链", lesson: 14, stageId: "production", description: "使用 Guardrail、Sandbox 与最小权限控制风险。", prerequisites: ["MA05", "E03"], materialIds: [], status: "locked", x: 2740, y: 285 }),
  graphNode({ id: "F06", title: "综合系统与答辩", practiceTitle: "Agentic AI 综合项目", lesson: 15, stageId: "frontier", description: "完成系统实现、架构决策、评测、安全报告与答辩。", prerequisites: ["S04"], materialIds: [], status: "locked", x: 3010, y: 285 })
];

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
