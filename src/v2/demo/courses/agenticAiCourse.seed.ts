import { globalKnowledgeGraph } from "../../knowledge/graph";
import { assertDirectedAcyclic, transitiveReduction } from "../../knowledge/graphAlgorithms";
import type {
  CourseChapterEdge,
  CourseChapterProjection,
  CourseCurriculum,
  CourseSkillTreeEdge,
  CourseSkillTreeNode,
  CurriculumChapter,
  CurriculumCoverage,
  CurriculumLesson,
  CurriculumSequence,
  AssignmentCoverage,
  AssignmentCoverageRole,
  CourseAssignment,
  CourseAssignmentSummary,
  UserAssignmentState
} from "../../types";
import { compareCourseCurriculumContexts, compareCourseKnowledgeOrder, selectPrimaryCurriculumCoverage } from "../../course/curriculum/curriculumOrdering";

export const COURSE_ID = "agentic-ai";
export const MATERIAL_ID = "lesson-04";

export const agenticCurriculum: CourseCurriculum = {
  id: "curriculum-agentic-ai-v1",
  courseId: COURSE_ID,
  generationMode: "auto-fixed-count",
  requestedChapterCount: 7
};

export const curriculumChapters: CurriculumChapter[] = [
  { id: "foundations", courseId: COURSE_ID, title: "概念与问题建模", description: "建立智能体概念、任务环境和问题形式化基础。", order: 1, color: "#78a7ee", outcome: "任务环境说明书" },
  { id: "paradigms", courseId: COURSE_ID, title: "架构与推理范式", description: "比较经典架构、ReAct、Planning、Replanning 与反思范式。", order: 2, color: "#9a8ee6", outcome: "范式选择报告" },
  { id: "system", courseId: COURSE_ID, title: "Agent 系统构成", description: "理解输入、模型、上下文、状态与结构化输出。", order: 3, color: "#eca86c", outcome: "最小 Agent MVP" },
  { id: "capabilities", courseId: COURSE_ID, title: "工具、知识与记忆", description: "让 Agent 使用工具、检索知识并维护工作状态与记忆。", order: 4, color: "#70c4a5", outcome: "受控单 Agent" },
  { id: "workflows", courseId: COURSE_ID, title: "工作流与多智能体", description: "构造路由、评估、人工协作与多智能体工作流。", order: 5, color: "#77b7c8", outcome: "完整 Agentic Workflow" },
  { id: "production", courseId: COURSE_ID, title: "评测、安全与生产化", description: "建立评测、可观测性、Guardrail、权限与部署能力。", order: 6, color: "#ec92aa", outcome: "可信生产系统" },
  { id: "frontier", courseId: COURSE_ID, title: "综合项目", description: "综合运用课程覆盖的原子能力完成系统项目。", order: 7, color: "#697ee6", outcome: "Agentic AI 综合项目" }
];

const lessonSeed: Array<[chapterId: string, title: string]> = [
  ["foundations", "Agent、Workflow 与自动化"], ["foundations", "任务环境与完成条件"],
  ["paradigms", "Agent 架构演进"], ["paradigms", "推理、规划与反思"], ["paradigms", "Human-in-the-loop"],
  ["system", "最小 Agent 构成"], ["system", "结构化输出与上下文"],
  ["capabilities", "工具使用"], ["capabilities", "知识与记忆"], ["capabilities", "Agent Runtime"],
  ["workflows", "Agentic Workflow"], ["workflows", "多智能体与能力协议"],
  ["production", "评测与可观测性"], ["production", "安全与生产服务"],
  ["frontier", "综合系统项目"]
];

export const curriculumLessons: CurriculumLesson[] = lessonSeed.map(([chapterId, title], index) => {
  const id = `L${String(index + 1).padStart(2, "0")}`;
  return { id, courseId: COURSE_ID, chapterId, title, order: index + 1 };
});

const coverageSeed: Array<[lessonId: string, role: CurriculumCoverage["role"], nodeIds: string[]]> = [
  ["L01", "introduce", ["AG01", "H02", "H03"]],
  ["L02", "introduce", ["P01", "P02", "P03", "P05"]],
  ["L03", "introduce", ["A01", "A02", "R01"]],
  ["L04", "introduce", ["R10", "R03", "R04", "R11", "R06", "R07", "R08", "R09"]],
  ["L05", "introduce", ["W01", "W02"]],
  ["L06", "introduce", ["C01", "C02", "C03", "C04"]],
  ["L07", "introduce", ["I01", "I02", "I05", "I04"]],
  ["L08", "introduce", ["T11", "T12", "T03", "T14", "T15", "T06", "T07", "T08", "T09", "T10"]],
  ["L09", "introduce", ["K01", "K12", "K13", "K14", "K15", "K16", "K04", "K05"]],
  ["L10", "introduce", ["RT01", "RT02", "RT03", "RT14", "RT15", "RT06", "BR01"]],
  ["L11", "introduce", ["W13", "W04", "WF03", "WF05"]],
  ["L11", "apply", ["R06", "R09", "W02"]],
  ["L12", "introduce", ["MA02", "MA12", "MA03", "MA04", "MA15", "MA06", "MA07"]],
  ["L13", "introduce", ["E12", "E13", "E14", "E05", "E06", "E07"]],
  ["L14", "introduce", ["S01", "S02", "S03", "S14", "S15", "S06", "S07", "S08"]],
  ["L15", "assess", ["P05", "R06", "I05", "T15", "K14", "RT15", "WF05", "MA12", "E13", "S01", "S08"]]
];

const nextCoverageOrderByLesson = new Map<string, number>();
export const curriculumCoverages: CurriculumCoverage[] = coverageSeed.flatMap(([lessonId, role, nodeIds]) => nodeIds.map((nodeId, index) => {
  const order = nextCoverageOrderByLesson.get(lessonId) ?? 0;
  nextCoverageOrderByLesson.set(lessonId, order + 1);
  return { id: `coverage-${lessonId}-${role}-${String(index + 1).padStart(2, "0")}`, courseId: COURSE_ID, lessonId, nodeId, role, order };
}));

export const curriculumSequences: CurriculumSequence[] = curriculumLessons.slice(1).map((lesson, index) => ({
  id: `sequence-${String(index + 1).padStart(2, "0")}`,
  courseId: COURSE_ID,
  sourceLessonId: curriculumLessons[index].id,
  targetLessonId: lesson.id
}));

type AssignmentSeed = Omit<CourseAssignment, "order"> & { coverage: Array<{ nodeId: string; role: AssignmentCoverageRole }> };

const assignmentSeed = (
  assignment: Omit<CourseAssignment, "courseId" | "order">,
  nodeIds: string[],
  role: AssignmentCoverageRole = "apply",
  extraCoverage: Array<{ nodeId: string; role: AssignmentCoverageRole }> = []
): AssignmentSeed => ({ ...assignment, courseId: COURSE_ID, coverage: [...nodeIds.map((nodeId) => ({ nodeId, role })), ...extraCoverage] });

const sharedCriteria = ["交付物结构完整且可复核", "关键设计决定与课程概念一致", "能识别至少一个失败模式并给出处理方式"];

const assignmentSeeds: AssignmentSeed[] = [
  assignmentSeed({ id: "agent-workflow-automation-comparison", title: "比较 Agent、Workflow 与 Automation", description: "分析三个自动化场景，判断其属于 Agent、Workflow 还是普通 Automation，并解释决策主体与反馈机制。", requirements: ["为每个场景判断系统类型", "指出决策主体和自主行动边界", "说明环境反馈是否改变后续行为", "给出不能使用另一类型的理由"], expectedOutput: "agent-workflow-automation-comparison.md 对比表", acceptanceCriteria: ["三个场景分类正确", "理由明确且引用自主决策特征", "能区分显式流程与环境驱动决策"], mode: "instruction", estimatedMinutes: 25, projectContribution: "为综合项目确定自动化边界与 Agent 适用范围。" }, ["AG01", "H02", "H03"], "assess"),
  assignmentSeed({ id: "task-environment-contract", title: "编写 Agent 任务环境契约", description: "把一个含糊的研究请求转化为可执行、可验证的任务环境说明。", requirements: ["列出可观察状态与允许动作", "将用户意图改写为目标", "声明资源、时间和安全约束", "定义可机器检查的完成条件"], expectedOutput: "task-environment.yaml", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 30, projectContribution: "作为最终 Agent Core 的任务输入契约。" }, ["P01", "P02", "P03", "P05"], "assess"),
  assignmentSeed({ id: "agent-architecture-review", title: "评审经典与 LLM Agent 架构", description: "针对客服升级场景绘制两种架构并比较其感知、决策、行动与反馈循环。", requirements: ["标注经典 Agent 构件", "标注模型、上下文、工具、状态和运行时", "描述一次完整 Reasoning Loop", "给出架构选型结论"], expectedOutput: "architecture-review.pdf", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 35, projectContribution: "形成综合项目的 Agent Core 架构决策记录。" }, ["A01", "A02", "R01"], "assess"),
  assignmentSeed({ id: "lesson-04-direct", title: "Direct 基线实验", description: "一次生成政策简报，记录速度、成本与信息缺口，作为其他推理范式的对照基线。", requirements: ["使用给定输入一次生成", "记录模型调用与耗时", "标注未验证事实和信息缺口"], expectedOutput: "direct-baseline.md", acceptanceCriteria: ["没有隐藏的外部行动", "基线指标完整", "明确说明 Direct 的适用边界"], mode: "instruction", estimatedMinutes: 15 }, ["R01"], "practice"),
  assignmentSeed({ id: "lesson-04-react", title: "ReAct 工具循环", description: "通过 Reason、Act、Observation 循环完成开放式资料任务，并用停止条件约束执行。", requirements: ["每轮说明当前信息缺口", "选择并调用适当工具", "用 Observation 更新下一步", "满足停止条件后结束"], expectedOutput: "react-trace.json", acceptanceCriteria: ["循环结构符合 ReAct", "工具结果真实改变后续行动", "停止条件可检查"], mode: "workflow", workflowTemplateId: "lesson-04-react", estimatedMinutes: 25, projectContribution: "提供最终 Agent 的交互式推理循环。" }, ["R10"], "assess"),
  assignmentSeed({ id: "lesson-04-plan", title: "制定并执行可检查计划", description: "先生成具有依赖、产物和完成条件的计划，再按顺序执行并记录结果。", requirements: ["拆分具有明确产物的步骤", "标注步骤依赖", "逐步执行并保存结果", "核对计划完成状态"], expectedOutput: "plan-and-execute.json", acceptanceCriteria: ["计划覆盖完整目标", "依赖顺序有效", "每一步结果可核对"], mode: "workflow", workflowTemplateId: "lesson-04-plan", estimatedMinutes: 30, projectContribution: "形成综合项目的 Planning Module 初版。" }, ["R03", "R04"], "assess"),
  assignmentSeed({ id: "lesson-04-replan", title: "根据新 Observation 修改计划", description: "在搜索超时或新增隐私要求后，保留已完成步骤并只修改受影响的剩余计划。", requirements: ["保留已完成步骤及产物", "删除或替换失效步骤", "添加新的必要步骤", "逐项说明修改理由"], expectedOutput: "revised-plan.json", acceptanceCriteria: ["没有重做有效工作", "新计划满足新增约束", "每个变更可追溯到 Observation"], mode: "workflow", workflowTemplateId: "lesson-04-replan", estimatedMinutes: 20, projectContribution: "为 Planning Module 增加运行时恢复能力。" }, ["R11", "R06"], "assess"),
  assignmentSeed({ id: "lesson-04-evaluator", title: "构建输出评估与反思流程", description: "使用结构化 Rubric 评价输出和执行轨迹，再驱动一次有边界的优化。", requirements: ["定义结果与轨迹评价维度", "输出逐项 Evaluator 反馈", "将反馈转成具体 Reflection", "只执行一次有证据的优化"], expectedOutput: "evaluation-and-revision.json", acceptanceCriteria: ["Rubric 可操作", "反馈对应真实缺陷", "优化结果能说明改进来源"], mode: "workflow", workflowTemplateId: "lesson-04-evaluator", estimatedMinutes: 30, projectContribution: "形成最终系统的 Evaluation Layer。" }, ["R07", "R08", "R09"], "assess"),
  assignmentSeed({ id: "human-approval-policy", title: "设计 Human-in-the-loop 审批策略", description: "为支付、外发邮件和数据删除三类动作划定人工介入与审批边界。", requirements: ["识别风险动作", "定义审批触发条件", "设计批准、拒绝与超时路径", "说明审批上下文"], expectedOutput: "approval-policy.yaml", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 25, projectContribution: "作为最终 Agent 的高风险动作控制策略。" }, ["W01", "W02"], "assess"),
  assignmentSeed({ id: "minimal-agent-core", title: "组装最小 Agent Core", description: "建立具有输入、受控模型调用、运行状态和输出契约的最小可运行 Agent。", requirements: ["定义输入边界", "配置并调用模型", "维护一次运行状态", "返回符合契约的输出"], expectedOutput: "agent-core/", acceptanceCriteria: sharedCriteria, mode: "workflow", workflowTemplateId: "agent-core", estimatedMinutes: 45, projectContribution: "构成综合项目的 Agent Core。" }, ["C01", "C02", "C03", "C04"], "assess"),
  assignmentSeed({ id: "structured-output-contract", title: "实现结构化输出契约", description: "为风险分析结果设计 Schema，并验证正确、缺字段和类型错误三组输出。", requirements: ["定义字段、类型与嵌套约束", "让模型按结构输出", "实现 Schema Validation", "返回可定位的错误"], expectedOutput: "risk-report.schema.json + validation-report.md", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 35, projectContribution: "作为最终 Agent 的稳定输出接口。" }, ["I01", "I02", "I05"], "assess"),
  assignmentSeed({ id: "context-budget-design", title: "设计 Context Budget", description: "在固定上下文预算内选择指令、历史、检索知识、记忆和工具结果。", requirements: ["列出候选上下文来源", "定义保留和裁剪优先级", "处理冲突与过期信息", "解释 token 预算分配"], expectedOutput: "context-budget.md", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 25, projectContribution: "形成 Agent Core 的上下文装配策略。" }, ["I04"], "apply"),
  assignmentSeed({ id: "tool-calling-layer", title: "构造 Tool Calling Layer", description: "从工具定义、选择、参数构造到执行和结果注入，完成一条可审计的工具调用链。", requirements: ["定义工具接口与描述", "让模型表达 Function Calling 请求", "选择工具并校验参数", "执行工具并归一化结果", "将结果安全注入后续上下文"], expectedOutput: "tool-layer/", acceptanceCriteria: ["接口和参数符合 Schema", "选择理由与任务匹配", "执行结果可追溯且可被模型消费"], mode: "workflow", workflowTemplateId: "tool-calling-layer", estimatedMinutes: 55, projectContribution: "构成综合项目的 Tool Layer 输入接口与执行主链。" }, ["T11", "T12", "T03", "T14", "T15", "T06"], "assess"),
  assignmentSeed({ id: "tool-failure-recovery", title: "实现工具失败与有界重试", description: "注入参数错误、超时和临时服务失败，建立分类与有界恢复策略。", requirements: ["区分不可重试与可重试失败", "设置次数、退避和超时", "保留每次失败原因", "耗尽预算后安全降级"], expectedOutput: "tool-retry-policy.ts", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 35, projectContribution: "增强 Tool Layer 的故障恢复能力。" }, ["T07", "T08"], "assess", [{ nodeId: "T15", role: "practice" }]),
  assignmentSeed({ id: "tool-permission-review", title: "建立工具权限与审批矩阵", description: "为读取、写入、外发和删除工具定义最小权限与人工批准规则。", requirements: ["列出资源与动作", "按风险划分权限", "标注必须审批的调用", "说明拒绝后的安全行为"], expectedOutput: "tool-permission-matrix.csv", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 25, projectContribution: "补全 Tool Layer 的权限边界。" }, ["T09", "T10"], "assess"),
  assignmentSeed({ id: "document-ingestion-pipeline", title: "构建文档摄取管线", description: "把一份混合格式文档解析、切块并编码为可检索单元。", requirements: ["保留标题和来源元数据", "制定语义切块策略", "生成可比较的 Embedding", "抽查边界处信息完整性"], expectedOutput: "ingestion-manifest.jsonl", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 45, projectContribution: "为最终 Knowledge Layer 准备索引数据。" }, ["K01", "K12", "K13"], "assess"),
  assignmentSeed({ id: "cited-rag-pipeline", title: "实现带引用的检索回答", description: "完成 Retrieval、Reranking 与 Citation，使回答中的关键结论可追溯。", requirements: ["召回候选内容", "按任务相关性重排", "只用保留候选生成答案", "为关键结论附来源引用"], expectedOutput: "cited-answer.json", acceptanceCriteria: sharedCriteria, mode: "workflow", workflowTemplateId: "cited-rag", estimatedMinutes: 50, projectContribution: "构成综合项目的 Knowledge Layer。" }, ["K14", "K15", "K16"], "assess"),
  assignmentSeed({ id: "memory-lifecycle-policy", title: "设计工作状态与长期记忆策略", description: "区分一次运行的工作状态与跨会话记忆，并制定读取、写入、更新和遗忘规则。", requirements: ["划分临时与长期信息", "定义记忆写入条件", "处理冲突、过期与删除", "避免把完整轨迹无选择写入记忆"], expectedOutput: "memory-policy.md", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 30, projectContribution: "构成综合项目的 Memory Layer。" }, ["K04", "K05"], "assess"),
  assignmentSeed({ id: "bounded-agent-loop", title: "实现有界 Agent Loop", description: "将任务生命周期建模为状态机，并为自主循环设置步骤、时间和资源上限。", requirements: ["定义 Observe–Think–Act 循环", "列出状态和合法转换", "设置停止与资源限制", "验证超限路径"], expectedOutput: "agent-runtime.json", acceptanceCriteria: sharedCriteria, mode: "workflow", workflowTemplateId: "agent-loop", estimatedMinutes: 45, projectContribution: "形成综合项目的 Runtime 主循环。" }, ["RT01", "RT02", "RT03"], "assess"),
  assignmentSeed({ id: "runtime-recovery-audit", title: "实现 Checkpoint 恢复与审计", description: "在运行中保存可恢复状态，注入故障后继续执行，并输出完整审计轨迹。", requirements: ["保存恢复所需中间状态", "从故障点安全继续或降级", "记录输入、决策、动作和结果", "验证恢复前后结果一致性"], expectedOutput: "checkpoint + audit-trail.jsonl", acceptanceCriteria: sharedCriteria, mode: "workflow", workflowTemplateId: "runtime-recovery", estimatedMinutes: 50, projectContribution: "为 Runtime 增加可靠恢复和审计能力。" }, ["RT14", "RT15", "RT06"], "assess"),
  assignmentSeed({ id: "async-tool-execution", title: "实现异步工具执行", description: "并发执行两个独立外部工具，同时正确处理超时、取消和结果归并。", requirements: ["并发启动独立调用", "为调用设置超时", "取消后完成资源清理", "按输入顺序归一化结果"], expectedOutput: "async-tool-runner.ts", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 35, projectContribution: "降低 Tool Layer 的端到端等待时间。" }, ["BR01"], "assess"),
  assignmentSeed({ id: "orchestrator-worker-workflow", title: "构建 Orchestrator–Worker 工作流", description: "由 Orchestrator 拆分研究任务，多个 Worker 独立执行并返回受约束结果。", requirements: ["定义拆分策略", "为 Worker 提供最小上下文", "约束 Worker 输出", "汇总并处理失败子任务"], expectedOutput: "orchestrator-worker-workflow.json", acceptanceCriteria: sharedCriteria, mode: "workflow", workflowTemplateId: "orchestrator-worker", estimatedMinutes: 55, projectContribution: "构成综合项目的并行执行工作流。" }, ["W13", "W04", "WF03"], "assess"),
  assignmentSeed({ id: "governed-agentic-workflow", title: "组装受治理 Agentic Workflow", description: "组合确定性步骤、Agent 决策、评估、重规划和人工审批，完成端到端任务。", requirements: ["区分确定性与 Agent 步骤", "加入评价和重规划路径", "在高风险动作前加入审批", "证明每条路径可终止"], expectedOutput: "governed-workflow.json", acceptanceCriteria: sharedCriteria, mode: "workflow", workflowTemplateId: "agentic-workflow", estimatedMinutes: 60, projectContribution: "形成综合项目的主业务编排。" }, ["WF05"], "assess", [{ nodeId: "R06", role: "apply" }, { nodeId: "R09", role: "apply" }, { nodeId: "W02", role: "apply" }]),
  assignmentSeed({ id: "multi-agent-delegation", title: "设计 Supervisor 多智能体协作", description: "让 Supervisor 根据能力边界向专业 Agent 分派任务，并合并带来源的结果。", requirements: ["定义各 Agent 职责", "选择委派目标", "限制传递上下文", "处理冲突与失败返回"], expectedOutput: "delegation-trace.json", acceptanceCriteria: sharedCriteria, mode: "workflow", workflowTemplateId: "multi-agent-workflow", estimatedMinutes: 50, projectContribution: "形成综合项目的 Multi-Agent 协作模块。" }, ["MA02", "MA12"], "assess"),
  assignmentSeed({ id: "capability-protocol-map", title: "绘制 Agent 能力与协议边界图", description: "比较 Tool、Skill、Plugin、MCP 与 A2A 在能力封装、发现和远程协作中的职责。", requirements: ["为五类能力给出接口边界", "标注本地与远程调用", "区分能力发现与任务委派", "为一个场景选择组合方案"], expectedOutput: "capability-protocol-map.md", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 30, projectContribution: "记录综合项目的扩展接口选择。" }, ["MA03", "MA04", "MA15", "MA06", "MA07"], "assess"),
  assignmentSeed({ id: "agent-evaluation-suite", title: "建立结果与轨迹评测集", description: "设计可重复基准任务，同时评价最终结果和中间计划、工具调用轨迹。", requirements: ["定义代表性 Benchmark Task", "制定结果验收标准", "制定轨迹质量标准", "输出可比较评分"], expectedOutput: "evaluation-suite/", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 45, projectContribution: "构成综合项目的 Evaluation Layer 基准集。" }, ["E12", "E13", "E14"], "assess"),
  assignmentSeed({ id: "agent-regression-debugging", title: "定位一次 Agent 行为回归", description: "利用日志、指标和 Trace 对比两个版本，定位失败步骤并固化回归测试。", requirements: ["选择稳定复现用例", "采集日志、指标和 Trace", "定位首次行为偏差", "新增能捕获该问题的 Regression Test"], expectedOutput: "regression-report.md + test case", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 45, projectContribution: "为综合项目建立可观测性与回归保障。" }, ["E05", "E06", "E07"], "assess"),
  assignmentSeed({ id: "agent-security-boundaries", title: "验证 Agent 安全边界", description: "用提示注入、越权读取和危险代码三个测试验证 Guardrail、Sandbox 与最小权限。", requirements: ["定义输入和动作 Guardrail", "在 Sandbox 中运行不可信操作", "配置最小权限", "记录阻断与降级结果"], expectedOutput: "security-validation.md", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 40, projectContribution: "构成综合项目的 Safety Layer。" }, ["S01", "S02", "S03"], "assess"),
  assignmentSeed({ id: "production-agent-service", title: "部署异步 Agent 服务", description: "用 API、数据库、任务队列和 Worker 组成可持久化、可扩缩的 Agent 服务并完成部署检查。", requirements: ["提供稳定 API", "持久化任务与运行状态", "用队列分发异步任务", "由 Worker 可靠消费", "完成部署与健康检查"], expectedOutput: "deployable-agent-service/", acceptanceCriteria: sharedCriteria, mode: "instruction", estimatedMinutes: 70, projectContribution: "形成综合项目的生产服务外壳。" }, ["S14", "S15", "S06", "S07", "S08"], "assess"),
  assignmentSeed({ id: "agentic-ai-capstone", title: "交付 Agentic AI 综合系统", description: "组合课程各阶段产物，交付一个具备规划、工具、知识、记忆、评测与安全边界的可运行系统。", requirements: ["集成 Agent Core 与 Planning Module", "接入 Tool、Knowledge 与 Memory Layer", "运行基准评测并提交报告", "演示审批、安全与恢复路径"], expectedOutput: "agentic-ai-capstone/ + architecture-decision-record.md", acceptanceCriteria: ["端到端主路径可运行", "关键输出满足验收标准", "失败、安全和审计路径可演示", "架构决定与课程能力对应"], mode: "workflow", workflowTemplateId: "agentic-ai-capstone", estimatedMinutes: 180, projectContribution: "课程综合项目最终交付。" }, ["P05", "R06", "I05", "T15", "K14", "RT15", "WF05", "MA12", "E13", "S01", "S08"], "assess")
];

export const courseAssignments: CourseAssignment[] = assignmentSeeds.map(({ coverage: _coverage, ...assignment }, order) => ({ ...assignment, order }));

export const assignmentCoverages: AssignmentCoverage[] = assignmentSeeds.flatMap((seed) => seed.coverage.map((coverage, index) => ({
  id: `assignment-coverage-${seed.id}-${String(index + 1).padStart(2, "0")}`,
  assignmentId: seed.id,
  nodeId: coverage.nodeId,
  role: coverage.role
})));

export const userAssignmentStates: UserAssignmentState[] = courseAssignments.map((assignment, index) => ({
  assignmentId: assignment.id,
  status: index < 5 ? "completed" : index < 9 ? "in-progress" : "not-started",
  progress: index < 5 ? 100 : index < 9 ? [70, 45, 30, 20][index - 5] : 0
}));

const nodeById = new Map(globalKnowledgeGraph.nodes.map((node) => [node.id, node]));
const lessonById = new Map(curriculumLessons.map((lesson) => [lesson.id, lesson]));
const chapterById = new Map(curriculumChapters.map((chapter) => [chapter.id, chapter]));
const courseNodeIds = new Set(curriculumCoverages.map((coverage) => coverage.nodeId).filter((id) => nodeById.get(id)?.status === "active"));
export const courseSkillTreeEdges: CourseSkillTreeEdge[] = globalKnowledgeGraph.edges
  .filter((edge) => courseNodeIds.has(edge.source) && courseNodeIds.has(edge.target))
  .map((edge) => ({ ...edge }));

function primaryCoverageFor(nodeId: string) {
  return selectPrimaryCurriculumCoverage(curriculumCoverages.filter((coverage) => coverage.nodeId === nodeId), curriculumLessons);
}

const primaryCoverageByNode = new Map(Array.from(courseNodeIds, (nodeId) => [nodeId, primaryCoverageFor(nodeId)]));
const primaryChapterByNode = new Map(Array.from(primaryCoverageByNode, ([nodeId, coverage]) => [nodeId, lessonById.get(coverage.lessonId)?.chapterId]));
const mainCourseEdges = courseSkillTreeEdges.filter((edge) => edge.relation !== "related");
const assignmentById = new Map(courseAssignments.map((assignment) => [assignment.id, assignment]));
const assignmentStateById = new Map(userAssignmentStates.map((state) => [state.assignmentId, state]));

export function validateCourseAssignmentCoverage(courseKnowledgeNodeIds: string[], coverages: AssignmentCoverage[]) {
  const covered = new Set(coverages.map((item) => item.nodeId));
  return courseKnowledgeNodeIds.filter((nodeId) => !covered.has(nodeId));
}

function summarizeAssignmentIds(assignmentIds: string[]) {
  const uniqueIds = Array.from(new Set(assignmentIds)).sort((left, right) => (assignmentById.get(left)?.order ?? Number.MAX_SAFE_INTEGER) - (assignmentById.get(right)?.order ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right));
  const states = uniqueIds.map((id) => assignmentStateById.get(id));
  const completedCount = states.filter((state) => state?.status === "completed").length;
  const inProgressCount = states.filter((state) => state?.status === "in-progress").length;
  const progress = uniqueIds.length ? Math.round(states.reduce((sum, state) => sum + (state?.progress ?? (state?.status === "completed" ? 100 : 0)), 0) / uniqueIds.length) : 0;
  return { assignmentIds: uniqueIds, assignmentCount: uniqueIds.length, completedCount, inProgressCount, notStartedCount: uniqueIds.length - completedCount - inProgressCount, progress };
}

export const courseSkillTreeNodes: CourseSkillTreeNode[] = Array.from(courseNodeIds).map<CourseSkillTreeNode>((nodeId) => {
  const knowledge = nodeById.get(nodeId);
  const primaryCoverage = primaryCoverageByNode.get(nodeId);
  const lesson = primaryCoverage ? lessonById.get(primaryCoverage.lessonId) : undefined;
  const chapter = lesson ? chapterById.get(lesson.chapterId) : undefined;
  if (!knowledge || !primaryCoverage || !lesson || !chapter) throw new Error(`Cannot project curriculum node: ${nodeId}`);
  const curriculumContexts = curriculumCoverages.filter((coverage) => coverage.nodeId === nodeId).map((coverage) => {
    const contextLesson = lessonById.get(coverage.lessonId);
    if (!contextLesson) throw new Error(`Unknown lesson for coverage: ${coverage.id}`);
    return { ...coverage, lessonOrder: contextLesson.order, chapterId: contextLesson.chapterId };
  }).sort(compareCourseCurriculumContexts);
  const assignmentContexts = assignmentCoverages.filter((coverage) => coverage.nodeId === nodeId).map((coverage) => {
    const assignment = assignmentById.get(coverage.assignmentId);
    if (!assignment) throw new Error(`Unknown assignment for coverage: ${coverage.id}`);
    return { ...coverage, assignment, state: assignmentStateById.get(assignment.id) };
  }).sort((left, right) => left.assignment.order - right.assignment.order || left.assignment.id.localeCompare(right.assignment.id));
  if (!assignmentContexts.length) throw new Error(`Course Assignment invariant failed for KnowledgeNode ${nodeId}`);
  const assignmentStateSummary = summarizeAssignmentIds(assignmentContexts.map((context) => context.assignmentId));
  const status = lesson.order <= 3 ? "completed" : lesson.order === 4 ? "learning" : lesson.order <= 7 ? "available" : "locked";
  return {
    id: knowledge.id,
    knowledge,
    title: knowledge.title,
    description: knowledge.description,
    scope: knowledge.scope,
    primaryCoverage: { ...primaryCoverage, lessonOrder: lesson.order, chapterId: chapter.id },
    curriculumContexts,
    assignmentContexts,
    assignmentCount: assignmentStateSummary.assignmentCount,
    assignmentStateSummary,
    lessonId: lesson.id,
    lesson: lesson.order,
    chapterId: chapter.id,
    coverageRoles: Array.from(new Set(curriculumContexts.map((coverage) => coverage.role))),
    materialIds: curriculumContexts.flatMap((coverage) => coverage.lessonId === "L04" ? [MATERIAL_ID] : []),
    materialContexts: [],
    assignmentIds: assignmentStateSummary.assignmentIds,
    status,
    knowledgeProgress: status === "completed" ? 100 : status === "learning" ? 55 : 0,
    hasKnowledgeEvidence: status === "completed" || status === "learning",
    color: chapter.color
  };
}).sort(compareCourseKnowledgeOrder);

if (courseSkillTreeNodes.reduce((sum, node) => sum + node.curriculumContexts.length, 0) !== curriculumCoverages.filter((coverage) => courseNodeIds.has(coverage.nodeId)).length) {
  throw new Error("Course curriculum N:M projection lost coverage records");
}
if (courseSkillTreeNodes.reduce((sum, node) => sum + node.assignmentContexts.length, 0) !== assignmentCoverages.filter((coverage) => courseNodeIds.has(coverage.nodeId)).length) {
  throw new Error("Course Assignment N:M projection lost coverage records");
}

const uncoveredNodeIds = validateCourseAssignmentCoverage(Array.from(courseNodeIds), assignmentCoverages);
if (uncoveredNodeIds.length) throw new Error(`Course Assignment coverage invariant failed: ${uncoveredNodeIds.join(", ")}`);
assignmentCoverages.forEach((coverage) => {
  if (!assignmentById.has(coverage.assignmentId)) throw new Error(`AssignmentCoverage references unknown assignment: ${coverage.id}`);
  if (!courseNodeIds.has(coverage.nodeId)) throw new Error(`AssignmentCoverage references non-course KnowledgeNode: ${coverage.id}`);
});
courseAssignments.forEach((assignment) => {
  if (assignment.mode === "workflow" && !assignment.workflowTemplateId) throw new Error(`Workflow Assignment requires workflowTemplateId: ${assignment.id}`);
});
if (!courseAssignments.some((assignment) => assignmentCoverages.filter((coverage) => coverage.assignmentId === assignment.id).length > 1)) throw new Error("Assignment N:M invariant requires one Assignment covering multiple KnowledgeNodes");
if (!courseSkillTreeNodes.some((node) => node.assignmentCount > 1)) throw new Error("Assignment N:M invariant requires one KnowledgeNode covered by multiple Assignments");

const chapterEdgeByPair = new Map<string, CourseChapterEdge>();
mainCourseEdges.forEach((edge) => {
  const source = primaryChapterByNode.get(edge.source);
  const target = primaryChapterByNode.get(edge.target);
  if (!source || !target || source === target) return;
  const key = `${source}:${target}`;
  const current = chapterEdgeByPair.get(key) ?? {
    id: `chapter-projection-${source}-${target}`,
    source,
    target,
    primaryRelation: edge.relation === "prerequisite" ? "prerequisite" as const : "enables" as const,
    sourceKind: "knowledge" as const,
    prerequisiteCount: 0,
    enablesCount: 0,
    supportCount: 0
  };
  if (edge.relation === "prerequisite") current.prerequisiteCount += 1;
  else current.enablesCount += 1;
  current.supportCount += 1;
  current.primaryRelation = current.prerequisiteCount > 0 ? "prerequisite" : "enables";
  chapterEdgeByPair.set(key, current);
});

const incidentChapterIds = new Set(Array.from(chapterEdgeByPair.values()).flatMap((edge) => [edge.source, edge.target]));
curriculumChapters.filter((chapter) => chapter.order > 1 && !incidentChapterIds.has(chapter.id)).forEach((chapter) => {
  const sequence = [...curriculumSequences].reverse().find((item) => lessonById.get(item.targetLessonId)?.chapterId === chapter.id && lessonById.get(item.sourceLessonId)?.chapterId !== chapter.id);
  const source = sequence ? lessonById.get(sequence.sourceLessonId)?.chapterId : undefined;
  if (!source) return;
  chapterEdgeByPair.set(`${source}:${chapter.id}`, {
    id: `chapter-sequence-${source}-${chapter.id}`,
    source,
    target: chapter.id,
    primaryRelation: "sequence",
    sourceKind: "curriculum-sequence",
    prerequisiteCount: 0,
    enablesCount: 0,
    supportCount: 0
  });
});

const aggregatedChapterEdges = Array.from(chapterEdgeByPair.values()).sort((left, right) => left.source.localeCompare(right.source) || left.target.localeCompare(right.target));
assertDirectedAcyclic(curriculumChapters.map((chapter) => chapter.id), aggregatedChapterEdges);
export const courseChapterEdges: CourseChapterEdge[] = transitiveReduction(curriculumChapters.map((chapter) => chapter.id), aggregatedChapterEdges);
export const courseChapters: CourseChapterProjection[] = curriculumChapters.map((chapter) => {
  const chapterLessonIds = new Set(curriculumLessons.filter((lesson) => lesson.chapterId === chapter.id).map((lesson) => lesson.id));
  const chapterNodeIds = new Set(curriculumCoverages.filter((coverage) => chapterLessonIds.has(coverage.lessonId)).map((coverage) => coverage.nodeId));
  const summary = summarizeAssignmentIds(assignmentCoverages.filter((coverage) => chapterNodeIds.has(coverage.nodeId)).map((coverage) => coverage.assignmentId));
  const chapterNodes = courseSkillTreeNodes.filter((node) => node.chapterId === chapter.id);
  const knowledgeProgress = chapterNodes.length ? Math.round(chapterNodes.reduce((sum, node) => sum + node.knowledgeProgress, 0) / chapterNodes.length) : 0;
  return { ...chapter, lessonCount: chapterLessonIds.size, knowledgeProgress, knowledgeEvidenceCount: chapterNodes.filter((node) => node.hasKnowledgeEvidence).length, assignmentSummary: { chapterId: chapter.id, ...summary, outcome: chapter.outcome } };
});

const courseAssignmentAggregate = summarizeAssignmentIds(courseAssignments.map((assignment) => assignment.id));
export const courseAssignmentSummary: CourseAssignmentSummary = {
  courseId: COURSE_ID,
  assignmentIds: courseAssignmentAggregate.assignmentIds,
  assignmentCount: courseAssignmentAggregate.assignmentCount,
  completedCount: courseAssignmentAggregate.completedCount,
  inProgressCount: courseAssignmentAggregate.inProgressCount,
  progress: courseAssignmentAggregate.progress
};

/** Deleting a course removes only curriculum associations; knowledge is intentionally not accepted as input. */
export function deleteCourseCurriculum(courseId: string) {
  return {
    curricula: agenticCurriculum.courseId === courseId ? [] : [agenticCurriculum],
    chapters: curriculumChapters.filter((chapter) => chapter.courseId !== courseId),
    lessons: curriculumLessons.filter((lesson) => lesson.courseId !== courseId),
    curriculumCoverages: curriculumCoverages.filter((coverage) => coverage.courseId !== courseId),
    curriculumSequences: curriculumSequences.filter((sequence) => sequence.courseId !== courseId),
    assignments: courseAssignments.filter((assignment) => assignment.courseId !== courseId),
    assignmentCoverages: courseId === COURSE_ID ? [] : assignmentCoverages,
    userAssignmentStates: courseId === COURSE_ID ? [] : userAssignmentStates
  };
}
