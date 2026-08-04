import type {
  KnowledgeCluster,
  KnowledgeDomain,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeRelation
} from "./types";

const sourceMetadata = { source: "Python Engineering · Python 工程能力岛.md" } as const;

export const knowledgeDomains: KnowledgeDomain[] = [
  { id: "agentic-ai", title: "Agentic AI", description: "规划、工具、记忆、运行时、评测与治理组成的智能体系统知识。", color: "#78a7ee" },
  { id: "python-engineering", title: "Python Engineering", description: "从 Python 运行模型到异步、后端架构与生产部署的工程能力。", color: "#70c4a5" },
  { id: "machine-learning", title: "机器学习", description: "从统计学习到深度学习的数据驱动建模方法。", color: "#9a8ee6" },
  { id: "education-ai", title: "教育 AI", description: "知识图谱、生成式 AI、学习分析与教学设计的交叉领域。", color: "#77b7c8" },
  { id: "language-learning", title: "语言学习", description: "语法、表达、阅读、写作与跨文化交流。", color: "#ec92aa" },
  { id: "business-analysis", title: "商业分析", description: "连接数据、商业问题与决策的分析能力。", color: "#eca86c" },
  { id: "life-sciences", title: "生命科学", description: "生命结构、遗传、进化、生态与复杂生物系统。", color: "#82bfa5" }
];

export const knowledgeClusters: KnowledgeCluster[] = [
  { id: "agentic-foundations", domainId: "agentic-ai", title: "概念与问题建模" },
  { id: "agentic-paradigms", domainId: "agentic-ai", title: "架构与推理范式" },
  { id: "agentic-system", domainId: "agentic-ai", title: "Agent 系统构成" },
  { id: "agentic-capabilities", domainId: "agentic-ai", title: "工具、知识与记忆" },
  { id: "agentic-runtime", domainId: "agentic-ai", title: "Runtime 与工作流" },
  { id: "agentic-production", domainId: "agentic-ai", title: "评测、安全与生产化" },
  { id: "python-runtime", domainId: "python-engineering", title: "Python Runtime & Basics" },
  { id: "python-data", domainId: "python-engineering", title: "Data & Collections" },
  { id: "python-engineering-foundation", domainId: "python-engineering", title: "Engineering Foundation" },
  { id: "python-http-api", domainId: "python-engineering", title: "HTTP / API" },
  { id: "python-async", domainId: "python-engineering", title: "Async & Concurrency" },
  { id: "python-persistence", domainId: "python-engineering", title: "Persistence" },
  { id: "python-architecture", domainId: "python-engineering", title: "Application Architecture" },
  { id: "python-observability", domainId: "python-engineering", title: "Testing & Observability" },
  { id: "python-deployment", domainId: "python-engineering", title: "Production & Deployment" }
];

const agentic = (id: string, title: string, clusterId: string, description: string, tags?: string[]): KnowledgeNode => ({
  id,
  title,
  domainId: "agentic-ai",
  clusterId,
  description,
  tags
});

const python = (id: string, title: string, clusterId: string, description: string): KnowledgeNode => ({
  id,
  title,
  domainId: "python-engineering",
  clusterId,
  description,
  metadata: sourceMetadata
});

export const knowledgeNodes: KnowledgeNode[] = [
  agentic("H01", "Agentic AI 全景", "agentic-foundations", "理解 Agent、Workflow 与自动化系统的边界。"),
  agentic("P01", "任务环境建模", "agentic-foundations", "识别目标、环境、约束、动作和完成条件。"),
  agentic("P05", "完成条件与约束", "agentic-foundations", "把自然语言要求转化为可检查的完成条件。"),
  agentic("A05", "经典与现代 Agent", "agentic-paradigms", "从经典智能体架构理解现代 LLM Agent 的演进。"),
  agentic("R02", "ReAct 与推理循环", "agentic-paradigms", "让推理、行动与观察组成可审计闭环。"),
  agentic("R05", "规划、重规划与反思", "agentic-paradigms", "比较 Direct、Plan-and-Execute、Replanning 与 Evaluator–Optimizer。"),
  agentic("W05", "混合架构与 HITL", "agentic-paradigms", "组合固定流程、Agent 决策、Evaluator 与人工审批。"),
  agentic("C05", "最小 Agent", "agentic-system", "搭建输入、模型、状态与输出组成的最小 Agent。"),
  agentic("I03", "结构化输出与 Schema", "agentic-system", "使用结构化 Schema 保证节点间可靠传递数据。"),
  agentic("I04", "Context Engineering", "agentic-system", "组织指令、历史、知识、记忆与工具结果。"),
  agentic("T01", "Tool Use / Function Calling", "agentic-capabilities", "让 Agent 根据任务决定何时调用外部工具。"),
  agentic("T02", "Tool Schema", "agentic-capabilities", "使用稳定的名称、参数类型与返回结构定义工具接口。"),
  agentic("T04", "Tool Failure / Retry", "agentic-capabilities", "处理参数校验、超时、失败、重试与回退。"),
  agentic("T05", "副作用、权限与人工审批", "agentic-capabilities", "控制工具副作用、权限边界与高风险人工确认。"),
  agentic("K02", "文档解析、Chunk 与 Embedding", "agentic-capabilities", "把文档解析为可检索、可引用的知识单元。"),
  agentic("K03", "RAG 与引用", "agentic-capabilities", "构建检索、重排序、注入与来源追踪链路。"),
  agentic("K04", "Session / Working State", "agentic-capabilities", "维护一次任务或会话中的工作状态。"),
  agentic("K05", "长期记忆", "agentic-capabilities", "理解记忆读取、条件写入、冲突更新与遗忘。"),
  agentic("RT01", "Agent Loop", "agentic-runtime", "构造 Observe–Think–Act 的自主执行循环。"),
  agentic("RT02", "状态机与任务生命周期", "agentic-runtime", "使用状态机表达 Agent 任务的创建、运行、等待、失败与完成。"),
  agentic("RT04", "Runtime Limit / Recovery", "agentic-runtime", "管理运行时限制、失败恢复与安全终止。"),
  agentic("RT05", "Checkpoint 与审计", "agentic-runtime", "保存中间状态、恢复执行并记录完整轨迹。"),
  agentic("W03", "Orchestrator–Worker", "agentic-runtime", "由协调者拆分任务并调度 Worker 完成子任务。"),
  agentic("WF03", "Orchestrator–Worker 构造", "agentic-runtime", "把 Orchestrator–Worker 范式实现为可执行工作流。"),
  agentic("WF05", "Agentic Workflow", "agentic-runtime", "组合确定性链路、Agent、Evaluator 与审批。"),
  agentic("MA02", "Supervisor", "agentic-runtime", "由中央 Agent 分配任务并整合专业 Agent 结果。"),
  agentic("MA05", "Tool / Skill / Plugin / MCP / A2A", "agentic-runtime", "理解能力封装、工具协议与 Agent 远程协作。"),
  agentic("E02", "测试集与基准任务", "agentic-production", "使用稳定测试集和基准任务评估 Agent。"),
  agentic("E03", "结果与轨迹评测", "agentic-production", "分别评测最终结果、计划、工具调用与中间步骤。"),
  agentic("E04", "可观测性与运行调试", "agentic-production", "使用日志、指标和 Trace 调试 Agent 运行。"),
  agentic("E05", "Regression Test", "agentic-production", "用回归测试防止 Agent 能力和行为意外退化。"),
  agentic("S04", "Guardrail 与权限", "agentic-production", "使用 Guardrail、Sandbox 与最小权限控制风险。"),
  agentic("S05", "API、数据库、队列与部署", "agentic-production", "将 Agent 作为包含 API、异步任务、状态和部署的生产服务。"),
  agentic("F06", "综合系统与答辩", "agentic-production", "完成系统实现、架构决策、评测、安全报告与答辩。"),
  agentic("BR01", "Async Tool Execution", "agentic-runtime", "在异步 Runtime 中可靠执行外部工具并处理结果、超时与任务生命周期。", ["async", "tool", "runtime"]),

  python("PY01", "Python Runtime", "python-runtime", "理解 Python 程序的运行环境与执行模型。"),
  python("PY02", "Object / Reference", "python-runtime", "理解对象、引用及变量绑定。"),
  python("PY03", "Built-in Types", "python-runtime", "掌握 Python 内置类型及其基本行为。"),
  python("PY04", "Expressions", "python-runtime", "使用表达式组合值、运算和调用。"),
  python("PY05", "Control Flow", "python-runtime", "使用条件与循环控制程序执行。"),
  python("PY06", "Function", "python-runtime", "定义参数、返回值与可复用的函数行为。"),
  python("PY07", "Scope", "python-runtime", "理解局部、闭包与模块作用域。"),
  python("PY08", "Module", "python-engineering-foundation", "用模块组织和复用 Python 代码。"),
  python("PY09", "Exception", "python-engineering-foundation", "使用异常表达和处理失败。"),
  python("PY18", "JSON", "python-data", "在 Python 与外部系统之间交换结构化 JSON 数据。"),
  python("PY19", "File / Path", "python-data", "可靠读写文件并操作路径。"),
  python("PY27", "Type Hint", "python-engineering-foundation", "用类型标注描述函数和数据结构的接口。"),
  python("PY34", "Project Structure", "python-engineering-foundation", "组织可维护的包、模块、配置与测试目录。"),
  python("PY37", "pytest", "python-observability", "使用 pytest 编写和运行自动化测试。"),
  python("PY45", "HTTP", "python-http-api", "理解 HTTP 请求、响应与接口交互。"),
  python("PY46", "HTTP Client", "python-http-api", "使用 Python HTTP Client 调用外部 API。"),
  python("PY49", "Pydantic", "python-http-api", "用类型驱动的数据模型完成解析与校验。"),
  python("PY50", "FastAPI", "python-http-api", "基于类型和 ASGI 构建 Python API 服务。"),
  python("PY51", "Authentication", "python-http-api", "处理服务和外部 API 的身份认证。"),
  python("PY53", "Thread / Process / GIL", "python-async", "理解线程、进程与 GIL 对并发执行的影响。"),
  python("PY56", "Event Loop", "python-async", "理解事件循环如何调度非阻塞工作。"),
  python("PY57", "async / await", "python-async", "使用 async / await 表达异步控制流。"),
  python("PY58", "Task", "python-async", "创建、调度和等待异步任务。"),
  python("PY61", "Timeout / Cancellation", "python-async", "为异步任务设置超时并安全取消。"),
  python("PY62", "Retry / Backoff", "python-async", "使用重试与退避恢复暂时性失败。"),
  python("PY64", "SQL", "python-persistence", "使用 SQL 查询和修改关系数据。"),
  python("PY67", "SQLAlchemy", "python-persistence", "使用 SQLAlchemy 组织数据库访问与事务。"),
  python("PY71", "Redis", "python-persistence", "使用 Redis 保存缓存、队列和短期状态。"),
  python("PY72", "Persistence", "python-persistence", "为应用状态设计可靠持久化。"),
  python("PY76", "State Machine", "python-architecture", "使用状态与转换表达应用生命周期。"),
  python("PY78", "Background Task", "python-architecture", "将非即时工作交给后台任务执行。"),
  python("PY79", "Task Queue / Worker", "python-architecture", "使用任务队列与 Worker 调度后台工作。"),
  python("PY81", "Plugin / Registry", "python-architecture", "通过注册表发现和管理可插拔能力。"),
  python("PY82", "Dynamic Import", "python-architecture", "在运行时动态加载 Python 模块与能力。"),
  python("PY85", "Unit Test", "python-observability", "隔离验证函数和模块的局部行为。"),
  python("PY86", "Integration Test", "python-observability", "验证多个组件与外部依赖的协同行为。"),
  python("PY89", "Structured Logging", "python-observability", "输出可查询、可关联的结构化日志。"),
  python("PY90", "Metrics", "python-observability", "用指标观测服务健康与性能。"),
  python("PY91", "Trace / Span", "python-observability", "用 Trace 与 Span 追踪跨组件执行路径。"),
  python("PY94", "ASGI", "python-deployment", "理解 Python 异步 Web 服务接口。"),
  python("PY95", "Docker", "python-deployment", "使用容器打包一致的运行环境。"),
  python("PY97", "Secrets", "python-deployment", "安全管理认证令牌和运行时秘密。"),
  python("PY98", "Deployment", "python-deployment", "将 Python 服务部署到可运行环境。")
];

type EdgeSeed = [source: string, target: string, relation: KnowledgeRelation, strength?: number, description?: string];
const edgeSeeds: EdgeSeed[] = [
  ["H01", "P01", "prerequisite"], ["H01", "P05", "prerequisite"], ["P01", "A05", "prerequisite"], ["P05", "A05", "prerequisite"],
  ["A05", "R02", "prerequisite"], ["A05", "R05", "prerequisite"], ["R02", "W05", "prerequisite"], ["R05", "W05", "prerequisite"],
  ["W05", "C05", "prerequisite"], ["C05", "I03", "prerequisite"], ["C05", "I04", "prerequisite"], ["I03", "T01", "prerequisite"],
  ["T01", "T04", "prerequisite"], ["I03", "K03", "prerequisite"], ["I04", "K03", "prerequisite"], ["K03", "K05", "prerequisite"],
  ["T04", "RT01", "prerequisite"], ["K03", "RT01", "prerequisite"], ["K05", "RT01", "prerequisite"], ["RT01", "RT05", "prerequisite"],
  ["RT01", "WF05", "prerequisite"], ["RT05", "WF05", "prerequisite"], ["WF05", "MA02", "prerequisite"], ["WF05", "MA05", "prerequisite"],
  ["MA02", "E03", "prerequisite"], ["MA05", "S04", "prerequisite"], ["E03", "S04", "prerequisite"], ["S04", "F06", "prerequisite"],
  ["T01", "T02", "conceptual"], ["K04", "K05", "conceptual"], ["RT02", "RT04", "conceptual"], ["RT04", "RT05", "prerequisite"],
  ["W03", "WF03", "implementation-support"], ["E02", "E03", "prerequisite"], ["E03", "E05", "practice-support"], ["E04", "S05", "implementation-support"],

  ["PY01", "PY02", "prerequisite"], ["PY02", "PY03", "prerequisite"], ["PY03", "PY04", "prerequisite"], ["PY04", "PY05", "prerequisite"], ["PY05", "PY06", "prerequisite"],
  ["PY06", "PY07", "prerequisite"], ["PY06", "PY08", "prerequisite"], ["PY06", "PY09", "prerequisite"], ["PY08", "PY34", "prerequisite"],
  ["PY01", "PY06", "conceptual", 0.7, "文档中的个人星图简化主干。"], ["PY06", "PY18", "conceptual", 0.65, "文档 Demo 中 Function 到 JSON 的简化结构。"],
  ["PY08", "PY45", "conceptual", 0.7, "文档 Demo 中 Module 到 HTTP 的简化结构。"], ["PY45", "PY46", "prerequisite"],
  ["PY46", "PY56", "conceptual", 0.65, "文档 Demo 中 HTTP Client 到异步执行区域的简化结构。"], ["PY53", "PY56", "prerequisite"],
  ["PY56", "PY57", "prerequisite"], ["PY57", "PY58", "prerequisite"], ["PY58", "PY61", "conceptual", 0.75], ["PY61", "PY62", "prerequisite"],
  ["PY18", "PY45", "prerequisite"], ["PY49", "PY50", "prerequisite"], ["PY64", "PY67", "conceptual"], ["PY71", "PY72", "conceptual"],
  ["PY76", "PY78", "prerequisite"], ["PY78", "PY79", "prerequisite"], ["PY81", "PY82", "conceptual"],
  ["PY37", "PY85", "conceptual"], ["PY85", "PY86", "prerequisite"], ["PY89", "PY90", "conceptual"], ["PY90", "PY91", "conceptual"],
  ["PY50", "PY94", "implementation-support"], ["PY94", "PY95", "conceptual"], ["PY95", "PY98", "implementation-support"], ["PY51", "PY97", "conceptual"],

  ["PY18", "I03", "implementation-support"], ["PY27", "I03", "implementation-support"], ["PY49", "I03", "implementation-support"],
  ["PY06", "T01", "implementation-support"], ["PY27", "T01", "implementation-support"], ["PY49", "T01", "implementation-support"],
  ["PY18", "T02", "implementation-support"], ["PY27", "T02", "implementation-support"], ["PY49", "T02", "implementation-support"],
  ["PY46", "T01", "implementation-support"], ["PY09", "T04", "implementation-support"], ["PY61", "T04", "implementation-support"], ["PY62", "T04", "implementation-support"],
  ["PY51", "T05", "implementation-support"], ["PY97", "T05", "implementation-support"], ["PY18", "K02", "implementation-support"], ["PY19", "K02", "implementation-support"],
  ["PY64", "K04", "implementation-support"], ["PY67", "K04", "implementation-support"], ["PY71", "K04", "implementation-support"], ["PY72", "K04", "implementation-support"],
  ["PY64", "K05", "implementation-support"], ["PY67", "K05", "implementation-support"], ["PY71", "K05", "implementation-support"], ["PY72", "K05", "implementation-support"],
  ["PY76", "RT02", "prerequisite"], ["PY56", "RT01", "implementation-support"], ["PY57", "RT01", "implementation-support"], ["PY58", "RT01", "implementation-support"],
  ["PY78", "W03", "implementation-support"], ["PY79", "W03", "implementation-support"], ["PY78", "WF03", "implementation-support"], ["PY79", "WF03", "implementation-support"],
  ["PY81", "MA05", "implementation-support"], ["PY82", "MA05", "implementation-support"],
  ["PY37", "E02", "practice-support"], ["PY85", "E02", "practice-support"], ["PY86", "E02", "practice-support"],
  ["PY89", "E04", "implementation-support"], ["PY90", "E04", "implementation-support"], ["PY91", "E04", "implementation-support"],
  ["PY50", "S05", "implementation-support"], ["PY94", "S05", "implementation-support"], ["PY95", "S05", "implementation-support"], ["PY98", "S05", "implementation-support"],

  ["PY46", "BR01", "prerequisite"], ["PY57", "BR01", "prerequisite"], ["PY58", "BR01", "prerequisite"],
  ["T01", "BR01", "prerequisite"], ["T02", "BR01", "prerequisite"], ["BR01", "RT01", "implementation-support"]
];

export const knowledgeEdges: KnowledgeEdge[] = edgeSeeds.map(([source, target, relation, strength, description], index) => ({
  id: `knowledge-edge-${String(index + 1).padStart(3, "0")}`,
  source,
  target,
  relation,
  directed: relation !== "conceptual" && relation !== "related",
  strength: strength ?? (relation === "prerequisite" ? 1 : 0.82),
  description
}));

function assertUnique(label: string, ids: string[]) {
  const seen = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) throw new Error(`Duplicate ${label} id: ${id}`);
    seen.add(id);
  });
}

function validateGraph(graph: KnowledgeGraph) {
  assertUnique("domain", graph.domains.map((item) => item.id));
  assertUnique("cluster", graph.clusters.map((item) => item.id));
  assertUnique("node", graph.nodes.map((item) => item.id));
  assertUnique("edge", graph.edges.map((item) => item.id));
  const domainIds = new Set(graph.domains.map((item) => item.id));
  const clusterById = new Map(graph.clusters.map((item) => [item.id, item]));
  const nodeIds = new Set(graph.nodes.map((item) => item.id));
  graph.clusters.forEach((cluster) => {
    if (!domainIds.has(cluster.domainId)) throw new Error(`Unknown domain for cluster ${cluster.id}: ${cluster.domainId}`);
  });
  graph.nodes.forEach((node) => {
    if (!domainIds.has(node.domainId)) throw new Error(`Unknown domain for node ${node.id}: ${node.domainId}`);
    if (node.clusterId) {
      const cluster = clusterById.get(node.clusterId);
      if (!cluster || cluster.domainId !== node.domainId) throw new Error(`Invalid cluster for node ${node.id}: ${node.clusterId}`);
    }
  });
  graph.edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error(`Invalid edge endpoints: ${edge.source} -> ${edge.target}`);
  });
}

export const globalKnowledgeGraph: KnowledgeGraph = {
  domains: knowledgeDomains,
  clusters: knowledgeClusters,
  nodes: knowledgeNodes,
  edges: knowledgeEdges
};

validateGraph(globalKnowledgeGraph);
