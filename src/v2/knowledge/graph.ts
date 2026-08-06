import type {
  KnowledgeDomain,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeNodeRevision,
  KnowledgeNodeType
} from "./types";

const DEMO_TIME = "2026-08-01T00:00:00.000Z";

export const knowledgeDomains: KnowledgeDomain[] = [
  { id: "agentic-ai", title: "Agentic AI", description: "规划、工具、记忆、运行时、评测与治理组成的智能体系统知识。", color: "#78a7ee" },
  { id: "python-engineering", title: "Python Engineering", description: "从 Python 运行模型到异步、后端架构与生产部署的工程能力。", color: "#70c4a5" },
  { id: "machine-learning", title: "机器学习", description: "从统计学习到深度学习的数据驱动建模方法。", color: "#9a8ee6" },
  { id: "education-ai", title: "教育 AI", description: "知识图谱、生成式 AI、学习分析与教学设计的交叉领域。", color: "#77b7c8" },
  { id: "language-learning", title: "语言学习", description: "语法、表达、阅读、写作与跨文化交流。", color: "#ec92aa" },
  { id: "business-analysis", title: "商业分析", description: "连接数据、商业问题与决策的分析能力。", color: "#eca86c" },
  { id: "life-sciences", title: "生命科学", description: "生命结构、遗传、进化、生态与复杂生物系统。", color: "#82bfa5" }
];

function criteria(title: string, type: KnowledgeNodeType) {
  const action = type === "procedural" ? "独立完成" : type === "representational" ? "正确解释并使用" : type === "meta" ? "判断适用条件并运用" : "清楚解释";
  return [
    `能${action}${title}的核心目标与边界`,
    `能在具体场景中识别${title}的正确用法与常见误用`,
    `能用可检查的示例证明对${title}的掌握`
  ];
}

function globalNode(
  id: string,
  title: string,
  domainId: "agentic-ai" | "python-engineering",
  description: string,
  type: KnowledgeNodeType,
  masteryCriteria = criteria(title, type),
  tags?: string[]
): KnowledgeNode {
  return {
    id,
    title,
    description,
    type,
    masteryCriteria,
    scope: "global",
    domainId,
    provenance: [{ sourceType: "global-catalog", sourceId: `${domainId}-v1`, discoveredAt: DEMO_TIME }],
    currentRevisionId: `${id}-r1`,
    status: "active",
    createdAt: DEMO_TIME,
    updatedAt: DEMO_TIME,
    tags
  };
}

const a = (id: string, title: string, description: string, type: KnowledgeNodeType, mastery?: string[], tags?: string[]) =>
  globalNode(id, title, "agentic-ai", description, type, mastery, tags);
const p = (id: string, title: string, description: string, type: KnowledgeNodeType = "conceptual") =>
  globalNode(id, title, "python-engineering", description, type);
const splitPython = (id: string, title: string, description: string, splitFrom: string, type: KnowledgeNodeType = "conceptual") => ({
  ...p(id, title, description, type),
  splitFrom
});
const legacy = (id: string, title: string, supersededBy: string[]) => ({
  ...a(id, title, "Knowledge Architecture v1 前的复合节点，仅为历史 identity 与 lineage 保留。", "meta", ["历史节点不再直接评测；应使用其原子 successor 的 mastery criteria。"]),
  status: "superseded" as const,
  supersededBy
});
const legacyPython = (id: string, title: string, supersededBy: string[]) => ({
  ...p(id, title, "Knowledge Architecture v1 前的 Python 复合节点，仅为稳定 identity 与 lineage 保留。", "meta"),
  status: "superseded" as const,
  supersededBy
});

export const knowledgeNodes: KnowledgeNode[] = [
  legacy("H01", "Agentic AI 全景", ["AG01", "H02", "H03"]),
  legacy("A05", "经典与现代 Agent", ["A01", "A02"]),
  legacy("R02", "ReAct 与推理循环", ["R01", "R10"]),
  legacy("R05", "规划、重规划与反思", ["R03", "R04", "R11", "R06", "R07", "R08", "R09"]),
  legacy("W05", "混合架构与 HITL", ["W01", "W02", "WF05"]),
  legacy("C05", "最小 Agent", ["C01", "C02", "C03", "C04"]),
  legacy("I03", "结构化输出与 Schema", ["I01", "I02", "I05"]),
  legacy("T01", "Tool Use / Function Calling", ["T11", "T12", "T03", "T14", "T15", "T06"]),
  legacy("T02", "Tool Schema", ["T11", "I02"]),
  legacy("T04", "Tool Failure / Retry", ["T07", "T08"]),
  legacy("T05", "副作用、权限与人工审批", ["T09", "T10", "W02"]),
  legacy("K02", "文档解析、Chunk 与 Embedding", ["K01", "K12", "K13"]),
  legacy("K03", "RAG 与引用", ["K14", "K15", "K16"]),
  legacy("RT04", "Runtime Limit / Recovery", ["RT03", "RT14"]),
  legacy("RT05", "Checkpoint 与审计", ["RT15", "RT06"]),
  legacy("W03", "Orchestrator–Worker", ["W13", "W04", "WF03"]),
  legacy("MA05", "Tool / Skill / Plugin / MCP / A2A", ["MA03", "MA04", "MA15", "MA06", "MA07"]),
  legacy("E02", "测试集与基准任务", ["E12"]),
  legacy("E03", "结果与轨迹评测", ["E13", "E14"]),
  legacy("E04", "可观测性与运行调试", ["E06", "E07"]),
  legacy("S04", "Guardrail 与权限", ["S01", "S02", "S03"]),
  legacy("S05", "API、数据库、队列与部署", ["S14", "S15", "S06", "S07", "S08"]),
  a("AG01", "Agent", "理解能感知状态、选择动作并朝目标推进的智能体。", "conceptual"),
  a("H02", "Workflow", "理解由显式步骤和控制关系组成的工作流。", "conceptual"),
  a("H03", "Automation System", "理解确定性自动化系统的能力边界。", "conceptual"),
  a("P01", "Task Environment", "描述 Agent 可观察、可行动的任务环境。", "representational"),
  a("P02", "Goal", "把用户意图表述为可推进的目标。", "representational"),
  a("P03", "Constraint", "表达任务执行过程中不得违反的限制。", "representational"),
  a("P05", "Completion Condition", "把自然语言要求转化为可检查的完成条件。", "procedural"),
  a("A01", "Classical Agent Architecture", "解释感知、决策、行动等经典智能体构件。", "conceptual"),
  a("A02", "LLM Agent Architecture", "解释模型、上下文、工具、状态与运行时的协作。", "conceptual"),
  a("R01", "Reasoning Loop", "组织可观察的推理、行动与反馈循环。", "meta"),
  a("R10", "ReAct", "交替执行 Reason、Act 与 Observation。", "procedural"),
  a("R03", "Planning", "在执行前形成有目标、有依赖的行动计划。", "meta"),
  a("R04", "Plan-and-Execute", "先生成可检查计划，再按步骤执行并收集结果。", "procedural"),
  a("R11", "Plan Monitoring", "比较计划预期与实际观察并识别偏差。", "meta"),
  a("R06", "Replanning", "根据新观察保留已完成步骤并调整剩余计划。", "procedural", [
    "能说明什么时候需要触发 Replanning",
    "能保留已完成步骤并修改剩余计划",
    "能根据新的 Observation 调整后续计划",
    "能区分 Replanning 与完整重新规划"
  ]),
  a("R07", "Reflection", "回顾执行轨迹并提炼可用于后续行动的改进。", "meta"),
  a("R08", "Evaluator", "使用明确标准判断输出或轨迹质量。", "meta"),
  a("R09", "Evaluator-Optimizer", "让 Evaluator 反馈驱动 Optimizer 迭代输出。", "procedural"),
  a("W01", "Human-in-the-loop", "在关键决策点引入人的判断和反馈。", "procedural"),
  a("W02", "Approval Gate", "在高风险动作前建立显式审批边界。", "procedural"),
  a("C01", "Agent Input", "定义 Agent 接收的任务输入和上下文入口。", "representational"),
  a("C02", "Model Invocation", "以受控参数调用模型并处理响应。", "procedural"),
  a("C03", "Agent State", "表示 Agent 一次运行中的持久和临时状态。", "representational"),
  a("C04", "Agent Output", "定义 Agent 对调用者交付的结果契约。", "representational"),
  a("I01", "Structured Output", "让模型输出满足机器可处理的明确结构。", "representational"),
  a("I02", "Schema", "定义字段、类型、约束和嵌套关系。", "representational"),
  a("I05", "Schema Validation", "验证结构化输出并报告可定位的错误。", "procedural"),
  a("I04", "Context Engineering", "选择并组织指令、历史、知识、记忆与工具结果。", "procedural"),
  a("T11", "Tool Interface", "定义 Agent 可发现和调用的工具契约。", "representational"),
  a("T12", "Function Calling", "使用模型的函数调用协议表达工具请求。", "procedural"),
  a("T03", "Tool Selection", "根据任务和工具描述选择合适工具。", "meta"),
  a("T14", "Tool Arguments", "生成并校验符合接口的工具参数。", "representational"),
  a("T15", "Tool Execution", "调用外部能力并管理一次执行。", "procedural"),
  a("T06", "Tool Result", "解析、归一化并注入工具执行结果。", "representational"),
  a("T07", "Tool Failure", "识别参数、权限、超时和执行失败。", "conceptual"),
  a("T08", "Tool Retry", "对可恢复工具失败实施有界重试。", "procedural"),
  a("T09", "Tool Permission", "限制工具可访问的资源和动作。", "procedural"),
  a("T10", "Tool Approval", "对高风险工具动作请求人工确认。", "procedural"),
  a("K01", "Document Parsing", "从文档载体提取结构化内容。", "procedural"),
  a("K12", "Chunking", "把内容切分为语义完整、可检索单元。", "procedural"),
  a("K13", "Embedding", "将内容编码为可比较的向量表示。", "representational"),
  a("K14", "Retrieval", "从知识源召回与查询相关的候选内容。", "procedural"),
  a("K15", "Reranking", "对召回候选按任务相关性重新排序。", "procedural"),
  a("K16", "Citation", "把生成结论追溯到明确来源。", "procedural"),
  a("K04", "Working State", "维护一次任务或会话中的工作状态。", "representational"),
  a("K05", "Long-term Memory", "跨会话读取、写入、更新和遗忘记忆。", "procedural"),
  a("RT01", "Agent Loop", "构造 Observe–Think–Act 的自主执行循环。", "procedural"),
  a("RT02", "Task State Machine", "用状态和转换表达 Agent 任务生命周期。", "representational"),
  a("RT03", "Runtime Limit", "为步骤、次数、时间和资源设置运行边界。", "procedural"),
  a("RT14", "Failure Recovery", "从可恢复运行失败中安全继续或降级。", "procedural"),
  a("RT15", "Checkpoint", "保存可用于恢复执行的完整中间状态。", "procedural"),
  a("RT06", "Audit Trail", "记录可追溯的输入、决策、动作与结果。", "representational"),
  a("W13", "Orchestrator", "拆分任务并协调多个执行单元。", "procedural"),
  a("W04", "Worker", "接收明确子任务并返回受约束结果。", "procedural"),
  a("WF03", "Orchestrator-Worker Workflow", "把协调者与 Worker 组织成可执行工作流。", "procedural"),
  a("WF05", "Agentic Workflow", "组合确定性步骤、Agent 决策、评估与审批。", "procedural"),
  a("MA02", "Supervisor", "由中央 Agent 分配任务并整合专业 Agent 结果。", "procedural"),
  a("MA12", "Multi-agent Delegation", "在多个 Agent 之间分配职责和上下文。", "procedural"),
  a("MA03", "Tool", "理解可调用、具有输入输出契约的原子外部能力。", "conceptual"),
  a("MA04", "Skill", "理解封装知识、指令和工作流的可复用能力。", "conceptual"),
  a("MA15", "Plugin", "理解打包技能、工具与集成的扩展单元。", "conceptual"),
  a("MA06", "Model Context Protocol", "理解 MCP 的客户端、服务端与能力发现边界。", "conceptual"),
  a("MA07", "Agent-to-Agent Protocol", "理解远程 Agent 之间的能力发现与任务协作。", "conceptual"),
  a("E12", "Benchmark Task", "设计可重复执行、结果可比较的基准任务。", "procedural"),
  a("E13", "Outcome Evaluation", "依据验收标准评测最终结果。", "procedural"),
  a("E14", "Trajectory Evaluation", "评测计划、工具调用和中间步骤。", "procedural"),
  a("E05", "Regression Test", "用固定用例识别 Agent 能力与行为退化。", "procedural"),
  a("E06", "Observability", "用日志、指标和 Trace 观察 Agent 系统。", "conceptual"),
  a("E07", "Runtime Debugging", "依据运行信号定位 Agent 执行故障。", "procedural"),
  a("S01", "Guardrail", "在输入、输出和动作边界实施安全规则。", "procedural"),
  a("S02", "Sandbox", "在隔离环境限制代码与工具副作用。", "procedural"),
  a("S03", "Least Privilege", "仅授予完成任务所需的最小权限。", "conceptual"),
  a("S14", "API Service", "通过稳定接口提供 Agent 服务。", "procedural"),
  a("S15", "Database Persistence", "将 Agent 状态与业务数据可靠持久化。", "procedural"),
  a("S06", "Task Queue", "用队列缓冲、排序和分发异步任务。", "procedural"),
  a("S07", "Worker", "从任务队列消费并执行 Agent 工作。", "procedural"),
  a("S08", "Deployment", "把 Agent 服务发布到可运行环境。", "procedural"),
  a("BR01", "Async Tool Execution", "在异步 Runtime 中可靠执行外部工具并处理结果、超时与生命周期。", "procedural", undefined, ["async", "tool", "runtime"]),

  p("PY01", "Python Runtime", "理解 Python 程序的运行环境与执行模型。"),
  p("PY02", "Object / Reference", "理解对象、引用及变量绑定。"),
  p("PY03", "Built-in Types", "掌握 Python 内置类型及其基本行为。"),
  p("PY04", "Expressions", "使用表达式组合值、运算和调用。", "language"),
  p("PY05", "Control Flow", "使用条件与循环控制程序执行。", "language"),
  p("PY06", "Function", "定义参数、返回值与可复用函数行为。", "language"),
  p("PY07", "Scope", "理解局部、闭包与模块作用域。"),
  p("PY08", "Module", "用模块组织和复用 Python 代码。", "procedural"),
  p("PY09", "Exception", "使用异常表达和处理失败。", "procedural"),
  p("PY18", "JSON", "在 Python 与外部系统之间交换结构化 JSON 数据。", "representational"),
  p("PY19", "File / Path", "可靠读写文件并操作路径。", "procedural"),
  p("PY27", "Type Hint", "用类型标注描述函数和数据结构接口。", "language"),
  p("PY34", "Project Structure", "组织可维护的包、模块、配置与测试目录。", "procedural"),
  p("PY37", "pytest", "使用 pytest 编写和运行自动化测试。", "procedural"),
  p("PY45", "HTTP", "理解 HTTP 请求、响应与接口交互。"),
  p("PY46", "HTTP Client", "使用 Python HTTP Client 调用外部 API。", "procedural"),
  p("PY49", "Pydantic", "用类型驱动的数据模型完成解析与校验。", "procedural"),
  p("PY50", "FastAPI", "基于类型和 ASGI 构建 Python API 服务。", "procedural"),
  p("PY51", "Authentication", "处理服务和外部 API 的身份认证。", "procedural"),
  legacyPython("PY53", "Thread / Process / GIL", ["PY99", "PY54", "PY55"]),
  splitPython("PY99", "Thread", "使用线程并理解共享内存并发。", "PY53"),
  splitPython("PY54", "Process", "使用进程获得隔离与 CPU 并行。", "PY53"),
  splitPython("PY55", "Global Interpreter Lock", "解释 GIL 对 Python 线程执行的影响。", "PY53"),
  p("PY56", "Event Loop", "理解事件循环如何调度非阻塞工作。"),
  p("PY57", "async / await", "使用 async / await 表达异步控制流。", "language"),
  p("PY58", "Async Task", "创建、调度和等待异步任务。", "procedural"),
  legacyPython("PY61", "Timeout / Cancellation", ["PY100", "PY63"]),
  splitPython("PY100", "Timeout", "为异步操作设置有界执行时间。", "PY61", "procedural"),
  splitPython("PY63", "Cancellation", "请求取消并安全清理异步任务。", "PY61", "procedural"),
  p("PY62", "Retry / Backoff", "使用重试与退避恢复暂时性失败。", "procedural"),
  p("PY64", "SQL", "使用 SQL 查询和修改关系数据。", "language"),
  p("PY67", "SQLAlchemy", "使用 SQLAlchemy 组织数据库访问与事务。", "procedural"),
  p("PY71", "Redis", "使用 Redis 保存缓存与短期状态。", "procedural"),
  p("PY72", "Persistence", "为应用状态设计可靠持久化。", "procedural"),
  p("PY76", "State Machine", "使用状态与转换表达应用生命周期。", "representational"),
  p("PY78", "Background Task", "将非即时工作交给后台执行。", "procedural"),
  legacyPython("PY79", "Task Queue / Worker", ["PY101", "PY80"]),
  splitPython("PY101", "Task Queue", "使用队列缓冲并分发后台任务。", "PY79", "procedural"),
  splitPython("PY80", "Queue Worker", "消费队列消息并可靠执行后台工作。", "PY79", "procedural"),
  legacyPython("PY81", "Plugin / Registry", ["PY102", "PY83"]),
  splitPython("PY102", "Python Plugin", "定义并加载可插拔 Python 能力。", "PY81", "procedural"),
  splitPython("PY83", "Plugin Registry", "注册、发现和选择可插拔能力。", "PY81", "procedural"),
  p("PY82", "Dynamic Import", "在运行时动态加载 Python 模块。", "procedural"),
  p("PY85", "Unit Test", "隔离验证函数和模块的局部行为。", "procedural"),
  p("PY86", "Integration Test", "验证多个组件与外部依赖的协同行为。", "procedural"),
  p("PY89", "Structured Logging", "输出可查询、可关联的结构化日志。", "procedural"),
  p("PY90", "Metrics", "用指标观测服务健康与性能。", "procedural"),
  p("PY91", "Trace / Span", "追踪跨组件执行路径。", "procedural"),
  p("PY94", "ASGI", "理解 Python 异步 Web 服务接口。"),
  p("PY95", "Docker", "使用容器打包一致运行环境。", "procedural"),
  p("PY97", "Secrets", "安全管理认证令牌和运行时秘密。", "procedural"),
  p("PY98", "Deployment", "将 Python 服务部署到可运行环境。", "procedural")
];

export const knowledgeNodeRevisions: KnowledgeNodeRevision[] = knowledgeNodes.map((node) => ({
  id: node.currentRevisionId,
  nodeId: node.id,
  version: 1,
  title: node.title,
  description: node.description,
  type: node.type,
  masteryCriteria: node.masteryCriteria,
  createdBy: "global-admin-demo",
  createdAt: node.createdAt ?? DEMO_TIME,
  changeReason: "Knowledge Architecture v1 atomic ontology"
}));

type EdgeSeed =
  | [string, string, "prerequisite", "hard" | "soft", string?]
  | [string, string, "enables" | "related", number, string?];

const edgeSeeds: EdgeSeed[] = [
  ["H03", "H02", "related", 0.55], ["H02", "AG01", "related", 0.62], ["P02", "P01", "prerequisite", "soft"], ["P03", "P01", "prerequisite", "soft"], ["P01", "P05", "enables", 0.8],
  ["AG01", "A01", "prerequisite", "soft"], ["A01", "A02", "prerequisite", "soft"], ["A02", "R01", "prerequisite", "soft"], ["R01", "R10", "enables", 0.9],
  ["R03", "R04", "prerequisite", "hard"], ["R04", "R11", "prerequisite", "hard"], ["R11", "R06", "prerequisite", "hard"], ["R11", "R07", "enables", 0.78], ["R08", "R09", "prerequisite", "hard"], ["R07", "R09", "enables", 0.76],
  ["W01", "W02", "enables", 0.8], ["P03", "W02", "enables", 0.65], ["C01", "C02", "prerequisite", "soft"], ["C02", "C04", "enables", 0.7], ["C03", "RT01", "enables", 0.88],
  ["I02", "I01", "enables", 0.9], ["I02", "I05", "prerequisite", "hard"], ["I05", "I01", "enables", 0.9], ["I04", "C02", "enables", 0.8],
  ["T11", "T12", "enables", 0.9], ["T11", "T03", "prerequisite", "soft"], ["T03", "T14", "enables", 0.8], ["T14", "T15", "prerequisite", "hard"], ["T15", "T06", "prerequisite", "hard"],
  ["T07", "T08", "prerequisite", "hard"], ["T09", "T10", "enables", 0.75], ["W02", "T10", "enables", 0.85], ["T06", "RT01", "enables", 0.7],
  ["K01", "K12", "prerequisite", "hard"], ["K12", "K13", "enables", 0.82], ["K13", "K14", "enables", 0.9], ["K14", "K15", "prerequisite", "soft"], ["K15", "K16", "enables", 0.8], ["K04", "K05", "related", 0.68],
  ["RT01", "RT02", "related", 0.72], ["RT02", "RT03", "enables", 0.62], ["RT03", "RT14", "enables", 0.78], ["RT02", "RT15", "enables", 0.85], ["RT15", "RT06", "enables", 0.88],
  ["W13", "W04", "enables", 0.9], ["W13", "WF03", "enables", 0.9], ["W04", "WF03", "enables", 0.9], ["WF03", "WF05", "related", 0.7], ["MA02", "MA12", "enables", 0.84],
  ["MA03", "MA04", "related", 0.64], ["MA04", "MA15", "related", 0.7], ["MA03", "MA06", "related", 0.74], ["MA07", "MA12", "enables", 0.7],
  ["E12", "E13", "enables", 0.88], ["E12", "E14", "enables", 0.82], ["E13", "E05", "enables", 0.86], ["E14", "E05", "enables", 0.74], ["E06", "E07", "enables", 0.9],
  ["S01", "S02", "related", 0.62], ["S01", "S03", "related", 0.72], ["S14", "S15", "related", 0.66], ["S06", "S07", "prerequisite", "hard"], ["S14", "S08", "enables", 0.72], ["S15", "S08", "enables", 0.7], ["S07", "S08", "enables", 0.76],
  ["PY01", "PY02", "prerequisite", "hard"], ["PY02", "PY03", "prerequisite", "soft"], ["PY03", "PY04", "prerequisite", "hard"], ["PY04", "PY05", "prerequisite", "hard"], ["PY05", "PY06", "prerequisite", "hard"],
  ["PY06", "PY07", "prerequisite", "hard"], ["PY06", "PY08", "enables", 0.8], ["PY09", "PY46", "enables", 0.55], ["PY08", "PY34", "enables", 0.82], ["PY18", "PY45", "enables", 0.62], ["PY45", "PY46", "prerequisite", "hard"],
  ["PY99", "PY55", "related", 0.8], ["PY54", "PY55", "related", 0.68], ["PY56", "PY57", "prerequisite", "hard"], ["PY57", "PY58", "prerequisite", "hard"], ["PY58", "PY100", "enables", 0.84], ["PY58", "PY63", "enables", 0.8], ["PY100", "PY62", "enables", 0.64],
  ["PY64", "PY67", "enables", 0.85], ["PY71", "PY72", "enables", 0.72], ["PY76", "PY78", "enables", 0.68], ["PY78", "PY101", "enables", 0.8], ["PY101", "PY80", "prerequisite", "hard"],
  ["PY102", "PY83", "enables", 0.86], ["PY82", "PY102", "enables", 0.8], ["PY37", "PY85", "enables", 0.8], ["PY85", "PY86", "prerequisite", "soft"], ["PY89", "PY90", "related", 0.66], ["PY90", "PY91", "related", 0.72],
  ["PY49", "PY50", "enables", 0.9], ["PY94", "PY50", "enables", 0.88], ["PY50", "PY98", "enables", 0.72], ["PY95", "PY98", "enables", 0.8], ["PY51", "PY97", "related", 0.62],
  ["PY18", "I01", "enables", 0.66, "JSON provides a concrete representation for structured model output."], ["PY27", "I02", "enables", 0.7], ["PY49", "I05", "enables", 0.88],
  ["PY06", "T11", "enables", 0.7], ["PY27", "T11", "enables", 0.72], ["PY49", "T14", "enables", 0.82], ["PY46", "T15", "enables", 0.8], ["PY09", "T07", "enables", 0.76], ["PY62", "T08", "enables", 0.84],
  ["PY19", "K01", "enables", 0.78], ["PY64", "K04", "enables", 0.62], ["PY67", "K05", "enables", 0.7], ["PY71", "K04", "enables", 0.75], ["PY72", "K05", "enables", 0.72],
  ["PY76", "RT02", "enables", 0.9], ["PY78", "W04", "enables", 0.65], ["PY80", "W04", "enables", 0.82], ["PY102", "MA15", "enables", 0.68], ["PY83", "MA15", "enables", 0.7],
  ["PY85", "E12", "enables", 0.78], ["PY86", "E05", "enables", 0.78], ["PY89", "E06", "enables", 0.86], ["PY90", "E06", "enables", 0.86], ["PY91", "E07", "enables", 0.82],
  ["PY50", "S14", "enables", 0.9], ["PY67", "S15", "enables", 0.85], ["PY101", "S06", "enables", 0.88], ["PY80", "S07", "enables", 0.88], ["PY95", "S08", "enables", 0.9],
  ["PY46", "BR01", "enables", 0.76], ["PY57", "BR01", "enables", 0.95, "async/await enables non-blocking tool execution."], ["PY58", "BR01", "enables", 0.9], ["PY100", "BR01", "enables", 0.8], ["PY63", "BR01", "enables", 0.8],
  ["T11", "BR01", "prerequisite", "hard"], ["T15", "BR01", "prerequisite", "hard"], ["BR01", "RT01", "enables", 0.9, "Async tool execution enables a responsive agent runtime."]
];

export const knowledgeEdges: KnowledgeEdge[] = edgeSeeds.map(([source, target, relation, strength, reason], index) => relation === "prerequisite"
  ? { id: `knowledge-edge-${String(index + 1).padStart(3, "0")}`, source, target, relation, strength: strength as "hard" | "soft", reason }
  : { id: `knowledge-edge-${String(index + 1).padStart(3, "0")}`, source, target, relation, strength: strength as number, reason });

function assertUnique(label: string, ids: string[]) {
  const seen = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) throw new Error(`Duplicate ${label} id: ${id}`);
    seen.add(id);
  });
}

function validateGraph(graph: KnowledgeGraph) {
  assertUnique("domain", graph.domains.map((item) => item.id));
  assertUnique("node", graph.nodes.map((item) => item.id));
  assertUnique("revision", graph.revisions.map((item) => item.id));
  assertUnique("edge", graph.edges.map((item) => item.id));
  const domainIds = new Set(graph.domains.map((item) => item.id));
  const nodeIds = new Set(graph.nodes.map((item) => item.id));
  const nodeById = new Map(graph.nodes.map((item) => [item.id, item]));
  const revisionById = new Map(graph.revisions.map((item) => [item.id, item]));
  graph.nodes.forEach((node) => {
    if (node.scope !== "global") throw new Error(`Global graph contains non-global node: ${node.id}`);
    if (!node.masteryCriteria.length) throw new Error(`Knowledge node has no mastery criteria: ${node.id}`);
    if (node.domainId && !domainIds.has(node.domainId)) throw new Error(`Unknown domain for node ${node.id}: ${node.domainId}`);
    if (revisionById.get(node.currentRevisionId)?.nodeId !== node.id) throw new Error(`Invalid current revision for node ${node.id}`);
  });
  graph.edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error(`Invalid edge endpoints: ${edge.source} -> ${edge.target}`);
    if (nodeById.get(edge.source)?.status !== "active" || nodeById.get(edge.target)?.status !== "active") throw new Error(`KnowledgeEdge references inactive node: ${edge.source} -> ${edge.target}`);
    if (edge.relation !== "prerequisite" && edge.strength !== undefined && (edge.strength < 0 || edge.strength > 1)) throw new Error(`Invalid relation strength: ${edge.id}`);
  });
}

export const globalKnowledgeGraph: KnowledgeGraph = {
  domains: knowledgeDomains,
  nodes: knowledgeNodes,
  revisions: knowledgeNodeRevisions,
  edges: knowledgeEdges
};

validateGraph(globalKnowledgeGraph);
