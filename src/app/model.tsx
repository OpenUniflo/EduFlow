import { type NodeProps } from "@xyflow/react";
import { Bot, CircleDot, GitBranch, Hammer } from "lucide-react";

export type NodeKind = "system" | "function" | "transform" | "llm" | "agent" | "tool" | "http" | "database" | "file" | "router" | "loop" | "output";
export type EdgeKind = "normal";
export type Selection =
  | { type: "state" }
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "workflow" };
export type ConfigTarget = { type: "node"; id: string } | { type: "edge"; id: string };

export type Field = {
  name: string;
  type: string;
  defaultValue: string;
  note: string;
};

export type FlowNode = {
  id: string;
  label: string;
  subtitle: string;
  kind: NodeKind;
  x: number;
  y: number;
  reads: string[];
  writes: string[];
  logic: string;
  code?: string;
  codeReview?: {
    before: string;
    after: string;
    summary: string;
  };
  codeSnapshots?: string[];
  control?: {
    branches: string[];
  };
  status?: "idle" | "running" | "success";
};

export type FlowEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: EdgeKind;
  sourceHandle?: string;
  targetHandle?: string;
};

export type EdgeSide = "top" | "right" | "bottom" | "left";
export const edgeSides: EdgeSide[] = ["top", "right", "bottom", "left"];

export type Template = {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  runOrder: string[];
  result: string;
  code: string;
};

export type PersistedStateValues = Record<string, Record<string, unknown>>;

export type WorkflowRunNodeRecord = {
  id: string;
  label: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
};

export type WorkflowRunRecord = {
  id: string;
  workflowId: string;
  workflowTemplateId: string;
  courseId?: string;
  assignmentId?: string;
  workflowName: string;
  createdAt: string;
  status: "success";
  nodeCount: number;
  outputSummary: string;
  finalState: Record<string, unknown>;
  nodes: WorkflowRunNodeRecord[];
};

export type PersistedRunHistory = Record<string, WorkflowRunRecord[]>;

export type CourseSection = {
  id: string;
  title: string;
  type: SectionType;
  content: string;
};

export type CourseChapter = {
  id: string;
  order: number;
  title: string;
  summary: string;
  status: ChapterStatus;
  duration: string;
  abilityTags: string[];
  workflowTemplateId: string;
  taskId: string;
  sections: CourseSection[];
};

export type CourseTask = {
  id: string;
  title: string;
  chapterId: string;
  status: ChapterStatus;
  score: number;
  deadline: string;
};

export type Course = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  difficulty: CourseDifficulty;
  status: CourseStatus;
  progress: number;
  chapterCount: number;
  taskCount: number;
  completedChapters: number;
  completedTasks: number;
  estimatedHours: number;
  tags: string[];
  abilities: string[];
  recommended?: boolean;
  chapters: CourseChapter[];
  tasks: CourseTask[];
};

export type WorkflowNodeData = {
  node: FlowNode;
  active: boolean;
  portDirections: Partial<Record<EdgeSide, PortDirection>>;
  onQuickAdd: (sourceId: string, side: EdgeSide, payload: Pick<CreateNodePayload, "label" | "kind">) => void;
};
export type PortDirection = "in" | "out" | "both";
export type PopoverPosition = { x: number; y: number };
export type DragState = PopoverPosition;
export type NodeTestStatus = "idle" | "running" | "success" | "error";
export type HomeNavSection = "courses" | "workflows" | "tasks" | "profile" | "settings" | "notifications" | "messages";
export type WorkflowViewMode = "gallery" | "list";
export type CourseDifficulty = "beginner" | "intermediate" | "advanced";
export type CourseStatus = "learning" | "not_started" | "completed";
export type ChapterStatus = "completed" | "learning" | "not_started" | "locked";
export type SectionType = "concept" | "diagram" | "config" | "practice";
export type TaskStatus = "not_started" | "in_progress" | "ready_to_submit" | "submitted" | "graded" | "overdue";
export type TaskDifficulty = "beginner" | "intermediate" | "advanced";
export type TaskTestStatus = "passed" | "failed" | "not_run";
export type TaskTestCase = {
  id: string;
  name: string;
  input: string;
  expectedBehavior: string;
  status: TaskTestStatus;
};
export type TaskChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
};
export type TaskRubricItem = {
  dimension: string;
  score: number;
  maxScore: number;
  comment: string;
};
export type AbilityReward = {
  ability: string;
  points: number;
};
export type MockTask = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  courseId: string;
  courseTitle: string;
  chapterId: string;
  chapterTitle: string;
  difficulty: TaskDifficulty;
  status: TaskStatus;
  score: number | null;
  maxScore: number;
  deadline: string;
  estimatedMinutes: number;
  requiredAbilities: string[];
  requiredNodes: string[];
  workflowTemplateId: string;
  submittedWorkflowId: string | null;
  testCases: TaskTestCase[];
  requirements: string[];
  checklist: TaskChecklistItem[];
  gradingRubric: TaskRubricItem[];
  feedback: string;
  abilityRewards: AbilityReward[];
  createdAt: string;
  submittedAt: string | null;
};
export type TaskStatKey = "todo" | "inProgress" | "submitted" | "graded";
export type CreateNodePayload = {
  label: string;
  kind: NodeKind;
  position?: { x: number; y: number };
};
export type CodeFile = {
  path: string;
  title: string;
  code: string;
};
export type RenameNodeResult = {
  ok: boolean;
  message?: string;
  name?: string;
};
export type UserCapability = "global-domain-admin";
export type MockSession = {
  name: string;
  email: string;
  role: "student";
  capabilities: UserCapability[];
  createdAt: string;
};
export type WorkflowStatusKind = "ready" | "warning" | "blocked";
export type WorkflowHealthItem = {
  ok: boolean;
  label: string;
};
export type WorkflowHealthSummary = {
  status: WorkflowStatusKind;
  summary: string;
  guidance: string;
  canRun: boolean;
  checks: WorkflowHealthItem[];
};

export const schemaFields: Field[] = [
  { name: "user_input", type: "string", defaultValue: "\"\"", note: "用户原始输入" },
  { name: "query", type: "string", defaultValue: "\"\"", note: "规范化查询" },
  { name: "task_type", type: "enum", defaultValue: "\"end\"", note: "Router 分支字段" },
  { name: "api_result", type: "object", defaultValue: "{}", note: "HTTP API 返回" },
  { name: "draft_answer", type: "string", defaultValue: "\"\"", note: "草稿回答" },
  { name: "final_answer", type: "string", defaultValue: "\"\"", note: "最终输出" },
  { name: "messages", type: "list", defaultValue: "[]", note: "Agent 消息历史" },
  { name: "should_continue", type: "boolean", defaultValue: "false", note: "Loop 判断字段" },
  { name: "tool_name", type: "string", defaultValue: "null", note: "待调用工具名" },
  { name: "tool_args", type: "object", defaultValue: "null", note: "工具参数" },
  { name: "tool_result", type: "string", defaultValue: "null", note: "工具返回结果" },
  { name: "iteration", type: "number", defaultValue: "0", note: "Agent 循环次数" }
];

export const templates: Template[] = [
  {
    id: "support-ticket-showcase",
    name: "客服工单处理闭环",
    description: "模拟售后客服工单：清洗输入、读取附件、查询客户资料、按问题类型分流，并通过 Agent + Tool 循环生成可归档回复。",
    nodes: [
      systemNode("start", "START", 20, 300),
      {
        ...node("clean_ticket", "清洗工单", "Function Node", "function", 170, 300, ["user_input"], ["query", "messages", "iteration"], "提取用户诉求、订单线索和联系方式，初始化消息历史与循环次数。"),
        code: `def clean_ticket(state: State):
    text = state["user_input"].strip()
    return {
        "query": text,
        "messages": [{"role": "user", "content": text}],
        "iteration": 0
    }`
      },
      {
        ...node("read_attachment", "读取附件", "File / Cloud Drive Node", "file", 350, 170, ["query"], ["draft_answer"], "读取用户上传的截图、发票或日志摘要，作为后续判断的上下文。"),
        code: `def read_attachment(state: State):
    return {
        "draft_answer": "附件摘要：包含订单号、付款截图和用户描述的问题现象。"
    }`
      },
      {
        ...node("query_customer", "查询客户资料", "Database Node", "database", 350, 430, ["query"], ["api_result"], "根据工单线索查询客户等级、订单状态、历史售后记录。"),
        code: `def query_customer(state: State):
    return {
        "api_result": {
            "customer_tier": "gold",
            "order_status": "paid",
            "last_ticket": "none"
        }
    }`
      },
      {
        ...node("classify_ticket", "分类工单", "Function Node", "function", 540, 300, ["query", "draft_answer", "api_result"], ["task_type"], "根据用户诉求与客户资料判断 refund / technical / account / human_review。"),
        code: `def classify_ticket(state: State):
    text = state["query"]
    if "退款" in text or "退货" in text:
        task_type = "refund"
    elif "登录" in text or "账号" in text:
        task_type = "account"
    elif "报错" in text or "无法使用" in text:
        task_type = "technical"
    else:
        task_type = "human_review"
    return {"task_type": task_type}`
      },
      node("ticket_router", "工单路由", "Router Node", "router", 735, 300, ["task_type"], [], "读取 task_type，将工单分发到退款、技术、账号或人工复核路径。", { branches: ["refund", "technical", "account", "human_review"] }),
      {
        ...node("search_policy", "检索知识库", "HTTP API Node", "http", 960, 135, ["query", "task_type"], ["api_result", "draft_answer"], "调用知识库检索售后政策、处理话术和故障排查步骤。"),
        code: `def search_policy(state: State):
    return {
        "api_result": {"policy": "符合条件可优先补偿或退款"},
        "draft_answer": "知识库建议：先核验订单，再给出可执行处理方案。"
    }`
      },
      {
        ...node("draft_reply", "生成回复草稿", "LLM Node", "llm", 960, 300, ["query", "api_result", "draft_answer"], ["draft_answer"], "结合客户资料、附件摘要和知识库结果生成客服回复草稿。"),
        code: `def draft_reply(state: State):
    return {
        "draft_answer": "您好，我们已核验订单和问题描述，将按售后政策为您处理。"
    }`
      },
      {
        ...node("support_agent", "客服 Agent", "Agent Node", "agent", 1170, 300, ["messages", "query", "draft_answer", "tool_result", "iteration"], ["messages", "should_continue", "tool_name", "tool_args", "iteration", "draft_answer"], "判断是否还需要查询订单、物流或优惠券状态；拿到工具结果后决定是否结束。"),
        code: `def support_agent(state: State):
    iteration = state.get("iteration", 0)
    should_continue = iteration < 1
    return {
        "messages": state["messages"] + [{"role": "assistant", "content": "需要补充订单状态。" if should_continue else "信息已完整，可以回复。"}],
        "should_continue": should_continue,
        "tool_name": "order_status" if should_continue else None,
        "tool_args": {"query": state["query"]} if should_continue else None,
        "iteration": iteration + 1,
        "draft_answer": state.get("draft_answer", "")
    }`
      },
      node("agent_loop", "复核循环", "Loop Node", "loop", 1390, 300, ["should_continue"], [], "根据 should_continue 控制 Agent 是否继续调用工具。", { branches: ["continue", "end"] }),
      {
        ...node("order_tool", "订单工具", "Tool Node", "tool", 1390, 515, ["tool_name", "tool_args", "messages"], ["tool_result", "messages"], "调用内部订单、物流或优惠券工具，并把结果写回消息历史。"),
        code: `def order_tool(state: State):
    result = "订单状态：已付款，物流未发出，可走优先退款。"
    return {
        "tool_result": result,
        "messages": state["messages"] + [{"role": "tool", "content": result}]
    }`
      },
      {
        ...node("format_reply", "格式化回复", "State Transform Node", "transform", 1610, 300, ["draft_answer", "tool_result", "task_type"], ["final_answer"], "将草稿、工具结果和工单分类整理成可发送的标准客服回复。"),
        code: `def format_reply(state: State):
    return {
        "final_answer": f"处理类型：{state['task_type']}。回复：{state['draft_answer']} {state.get('tool_result') or ''}"
    }`
      },
      {
        ...node("archive_ticket", "归档工单", "Output Node", "output", 1810, 300, ["final_answer"], ["messages"], "记录最终回复、处理类型和客服操作结果，完成工单闭环。"),
        code: `def archive_ticket(state: State):
    return {
        "messages": state["messages"] + [{"role": "system", "content": state["final_answer"]}]
    }`
      },
      systemNode("end", "END", 2000, 300)
    ],
    edges: [
      edge("e-support-start-clean", "start", "clean_ticket", "next"),
      edge("e-support-clean-file", "clean_ticket", "read_attachment", "next"),
      edge("e-support-file-db", "read_attachment", "query_customer", "next"),
      edge("e-support-db-classify", "query_customer", "classify_ticket", "next"),
      edge("e-support-classify-router", "classify_ticket", "ticket_router", "next"),
      edge("e-support-router-refund", "ticket_router", "search_policy", "refund"),
      edge("e-support-router-technical", "ticket_router", "search_policy", "technical"),
      edge("e-support-router-account", "ticket_router", "support_agent", "account"),
      edge("e-support-router-human", "ticket_router", "format_reply", "human_review"),
      edge("e-support-policy-draft", "search_policy", "draft_reply", "next"),
      edge("e-support-draft-agent", "draft_reply", "support_agent", "next"),
      edge("e-support-agent-loop", "support_agent", "agent_loop", "next"),
      edge("e-support-loop-tool", "agent_loop", "order_tool", "continue"),
      edge("e-support-tool-agent", "order_tool", "support_agent", "next"),
      edge("e-support-loop-format", "agent_loop", "format_reply", "end"),
      edge("e-support-format-output", "format_reply", "archive_ticket", "next"),
      edge("e-support-output-end", "archive_ticket", "end", "next")
    ],
    runOrder: [
      "start",
      "e-support-start-clean",
      "clean_ticket",
      "e-support-clean-file",
      "read_attachment",
      "e-support-file-db",
      "query_customer",
      "e-support-db-classify",
      "classify_ticket",
      "e-support-classify-router",
      "ticket_router",
      "e-support-router-refund",
      "search_policy",
      "e-support-policy-draft",
      "draft_reply",
      "e-support-draft-agent",
      "support_agent",
      "e-support-agent-loop",
      "agent_loop",
      "e-support-loop-tool",
      "order_tool",
      "e-support-tool-agent",
      "support_agent",
      "e-support-agent-loop",
      "agent_loop",
      "e-support-loop-format",
      "format_reply",
      "e-support-format-output",
      "archive_ticket",
      "e-support-output-end",
      "end"
    ],
    result: "final_answer: 处理类型：refund。您好，我们已核验订单和售后政策，可为该订单优先发起退款，并已记录工单处理结果。",
    code: "查看全部代码会展示客服工单处理的分文件 LangGraph 原型代码。"
  },
  {
    id: "showcase",
    name: "知序 LangGraph 示例",
    description: "节点承载逻辑，边只做连接；Router 和 Loop 节点汇总条件编译逻辑。",
    nodes: [
      systemNode("start", "START", 20, 250),
      node("normalize_input", "Normalize Input", "Function Node", "function", 160, 250, ["user_input"], ["query", "messages", "iteration"], "清理 user_input，初始化 messages 和 iteration。"),
      node("classify_task", "Classify Task", "Function Node", "function", 355, 250, ["user_input"], ["task_type"], "根据用户输入判断 search / writing / agent / end。"),
      node("task_router", "Task Router", "Router Node", "router", 560, 250, ["task_type"], [], "读取 task_type，将分支映射到后续节点。", { branches: ["search", "writing", "agent", "end"] }),
      node("call_search_api", "HTTP API Node", "HTTP API Node", "http", 790, 60, ["query"], ["api_result", "draft_answer"], "通过环境变量配置第三方搜索 API。"),
      node("write_answer", "LLM Node", "LLM Node", "llm", 790, 200, ["query"], ["draft_answer"], "调用大模型生成教学回答草稿。"),
      node("agent", "Agent Node", "Agent Node", "agent", 790, 360, ["messages", "query", "tool_result", "iteration"], ["messages", "should_continue", "tool_name", "tool_args", "iteration", "draft_answer"], "判断是否继续调用工具。"),
      node("agent_loop", "Agent Loop", "Loop Node", "loop", 1010, 360, ["should_continue"], [], "读取 should_continue，决定继续调用工具或退出。", { branches: ["continue", "end"] }),
      node("tool", "Tool Node", "Tool Node", "tool", 1010, 520, ["tool_name", "tool_args", "messages"], ["tool_result", "messages"], "根据 tool_name 调用内部工具。"),
      node("format_answer", "Format Answer", "State Transform Node", "transform", 1190, 200, ["draft_answer"], ["final_answer"], "将 draft_answer 格式化为 final_answer。"),
      systemNode("end", "END", 1400, 250)
    ],
    edges: [
      edge("e-start-normalize", "start", "normalize_input", "next"),
      edge("e-normalize-classify", "normalize_input", "classify_task", "next"),
      edge("e-classify-router", "classify_task", "task_router", "next"),
      edge("e-router-search", "task_router", "call_search_api", "search"),
      edge("e-router-writing", "task_router", "write_answer", "writing"),
      edge("e-router-agent", "task_router", "agent", "agent"),
      edge("e-router-end", "task_router", "end", "end"),
      edge("e-api-format", "call_search_api", "format_answer", "next"),
      edge("e-llm-format", "write_answer", "format_answer", "next"),
      edge("e-agent-loop", "agent", "agent_loop", "next"),
      edge("e-loop-continue", "agent_loop", "tool", "continue"),
      edge("e-tool-agent", "tool", "agent", "next"),
      edge("e-loop-end", "agent_loop", "format_answer", "end"),
      edge("e-format-end", "format_answer", "end", "next")
    ],
    runOrder: [
      "start",
      "e-start-normalize",
      "normalize_input",
      "e-normalize-classify",
      "classify_task",
      "e-classify-router",
      "task_router",
      "e-router-agent",
      "agent",
      "e-agent-loop",
      "agent_loop",
      "e-loop-continue",
      "tool",
      "e-tool-agent",
      "agent",
      "e-agent-loop",
      "agent_loop",
      "e-loop-end",
      "format_answer",
      "e-format-end",
      "end"
    ],
    result: "final_answer: 最终回答：Agent 已调用工具并完成回答。",
    code: "查看全部代码会展示分文件 LangGraph 原型代码。"
  },
  {
    id: "minimal",
    name: "最小工作流",
    description: "START 进入一个处理节点，写入 final_answer 后到 END。",
    nodes: [
      systemNode("start", "START", 50, 210),
      node("process", "Function Node", "Function Node", "function", 250, 180, ["user_input"], ["final_answer"], "读取 user_input，生成教学演示结果。"),
      systemNode("end", "END", 500, 210)
    ],
    edges: [
      edge("e1", "start", "process", "next"),
      edge("e2", "process", "end", "next")
    ],
    runOrder: ["start", "e1", "process", "e2", "end"],
    result: "final_answer: 已根据 user_input 生成一个可解释的处理结果。",
    code: `class State(TypedDict):
    user_input: str
    final_answer: str

def process_node(state: State):
    return {"final_answer": "处理完成"}

graph = StateGraph(State)
graph.add_node("process_node", process_node)
graph.add_edge(START, "process_node")
graph.add_edge("process_node", END)`
  },
  {
    id: "sequence",
    name: "顺序工作流",
    description: "多个节点依次读取并更新共享 State。",
    nodes: [
      systemNode("start", "START", 40, 210),
      node("input", "Normalize Input", "Function Node", "function", 160, 95, ["user_input"], ["messages"], "接收测试输入并写入消息历史。"),
      node("read", "File Node", "File / Cloud Drive Node", "file", 345, 95, ["user_input"], ["tool_result"], "模拟读取文件内容。"),
      node("summary", "Summary Node", "LLM Node", "llm", 345, 305, ["tool_result"], ["final_answer"], "读取文件内容并生成摘要。"),
      node("output", "Output Node", "基础节点 / 输出", "output", 510, 210, ["final_answer"], ["messages"], "整理最终输出并追加消息。"),
      systemNode("end", "END", 720, 210)
    ],
    edges: [
      edge("e1", "start", "input", "next"),
      edge("e2", "input", "read", "next"),
      edge("e3", "read", "summary", "next"),
      edge("e4", "summary", "output", "next"),
      edge("e5", "output", "end", "next")
    ],
    runOrder: ["start", "e1", "input", "e2", "read", "e3", "summary", "e4", "output", "e5", "end"],
    result: "final_answer: 这份文件已经被读取、摘要并整理为教学输出。",
    code: `graph.add_node("input_node", input_node)
graph.add_node("read_file_node", read_file_node)
graph.add_node("summary_node", summary_node)
graph.add_node("output_node", output_node)

graph.add_edge(START, "input_node")
graph.add_edge("input_node", "read_file_node")
graph.add_edge("read_file_node", "summary_node")
graph.add_edge("summary_node", "output_node")
graph.add_edge("output_node", END)`
  },
  {
    id: "branch",
    name: "条件分支",
    description: "Function 写入 task_type，Router 节点决定后续路径。",
    nodes: [
      systemNode("start", "START", 40, 220),
      node("classify_task", "Classify Task", "Function Node", "function", 170, 190, ["user_input"], ["task_type"], "判断用户意图并写入 task_type。"),
      node("router", "Task Router", "Router Node", "router", 360, 190, ["task_type"], [], "读取 task_type 并映射分支。", { branches: ["writing", "search"] }),
      node("summary", "Summary Node", "LLM Node", "llm", 560, 90, ["user_input", "task_type"], ["draft_answer"], "当 task_type 为 writing 时执行。"),
      node("search", "HTTP API Node", "HTTP API Node", "http", 560, 305, ["query", "task_type"], ["draft_answer"], "当 task_type 为 search 时执行。"),
      node("merge", "Format Answer", "State Transform Node", "transform", 760, 190, ["draft_answer"], ["final_answer"], "合并分支输出。"),
      systemNode("end", "END", 720, 220)
    ],
    edges: [
      edge("e1", "start", "classify_task", "next"),
      edge("e2", "classify_task", "router", "next"),
      edge("e3", "router", "summary", "writing"),
      edge("e4", "router", "search", "search"),
      edge("e5", "summary", "merge", "next"),
      edge("e6", "search", "merge", "next"),
      edge("e7", "merge", "end", "next")
    ],
    runOrder: ["start", "e1", "router", "e2", "summary", "e4", "merge", "e6", "end"],
    result: "final_answer: Router 判定为 summary，流程进入 Summary Node 并完成输出。",
    code: `def router(state: State):
    if "总结" in state["user_input"]:
        return "summary"
    if "改写" in state["user_input"]:
        return "rewrite"
    return "fallback"

graph.add_conditional_edges(
    "router_node",
    router,
    {"summary": "summary_node", "rewrite": "rewrite_node"}
)`
  },
  {
    id: "agent",
    name: "Agent 工具调用",
    description: "Agent 根据 should_continue 决定调用 Tool 或结束。",
    nodes: [
      systemNode("start", "START", 40, 220),
      node("agent", "Agent Node", "Agent 节点 / Agent", "agent", 190, 185, ["user_input", "messages", "tool_result"], ["messages", "should_continue", "tool_name", "tool_args", "final_answer"], "判断是否需要工具，最多循环 5 次。"),
      node("tool", "Search Tool", "Agent 节点 / Tool", "tool", 405, 310, ["tool_call"], ["tool_result", "messages"], "根据 tool_call.query 模拟搜索并写回 tool_result。"),
      node("observe", "Agent Loop", "Loop Node", "loop", 405, 95, ["should_continue"], [], "根据 should_continue 控制循环。", { branches: ["continue", "end"] }),
      systemNode("end", "END", 700, 220)
    ],
    edges: [
      edge("e1", "start", "agent", "next"),
      edge("e2", "agent", "observe", "next"),
      edge("e3", "observe", "tool", "continue"),
      edge("e4", "tool", "agent", "next"),
      edge("e5", "observe", "end", "end")
    ],
    runOrder: ["start", "e1", "agent", "e2", "tool", "e3", "observe", "e4", "agent", "e5", "end"],
    result: "final_answer: Agent 已调用 Search Tool，吸收 Observation 后满足停止条件并结束。",
    code: `graph.add_node("agent", agent_node)
graph.add_node("search_tool", search_tool)
graph.add_node("observation", observation_node)

graph.add_conditional_edges(
    "agent",
    route_agent,
    {"need_tool": "search_tool", "done": END}
)
graph.add_edge("search_tool", "observation")
graph.add_edge("observation", "agent")`
  },
  {
    id: "lesson-04-direct",
    name: "Direct · 政策简报基线",
    description: "一次生成三所高校的生成式 AI 政策比较简报，用作速度、成本、覆盖度和引用可靠性的基线。",
    nodes: [
      systemNode("start", "START", 60, 240),
      node("brief_input", "研究任务", "Input Node", "function", 220, 205, ["user_input"], ["query"], "接收政策比较任务和 800-1200 字输出约束。"),
      node("direct_writer", "Direct Writer", "LLM Node", "llm", 470, 205, ["query"], ["final_answer"], "不调用外部工具，直接使用模型已有知识生成简报。"),
      node("constraint_check", "约束检查", "Function Node", "function", 720, 205, ["final_answer"], ["draft_answer"], "检查三所高校、风险和三条建议是否出现。"),
      systemNode("end", "END", 960, 240)
    ],
    edges: [
      edge("e-direct-1", "start", "brief_input"),
      edge("e-direct-2", "brief_input", "direct_writer"),
      edge("e-direct-3", "direct_writer", "constraint_check"),
      edge("e-direct-4", "constraint_check", "end")
    ],
    runOrder: ["start", "e-direct-1", "brief_input", "e-direct-2", "direct_writer", "e-direct-3", "constraint_check", "e-direct-4", "end"],
    result: "final_answer: 已生成政策简报基线；覆盖三所高校与三条建议，但没有主动检索，引用可靠性需要人工核验。",
    code: `graph.add_node("direct_writer", direct_writer)
graph.add_node("constraint_check", constraint_check)
graph.add_edge(START, "direct_writer")
graph.add_edge("direct_writer", "constraint_check")
graph.add_edge("constraint_check", END)`
  },
  {
    id: "lesson-04-react",
    name: "ReAct · 搜索与观察循环",
    description: "边判断信息缺口、边调用官方来源搜索工具，并依据观察结果决定继续检索或结束。",
    nodes: [
      systemNode("start", "START", 40, 260),
      node("react_agent", "ReAct Agent", "Agent Node", "agent", 210, 220, ["user_input", "messages", "tool_result", "iteration"], ["messages", "tool_name", "tool_args", "should_continue", "iteration", "draft_answer"], "维护当前子目标，选择高校官方政策搜索或结束。"),
      node("react_route", "继续检索？", "Loop Node", "loop", 470, 220, ["should_continue"], [], "根据覆盖度、来源可信度和最大步数决定继续或结束。", { branches: ["continue", "end"] }),
      node("official_search", "官方来源搜索", "Tool Node", "tool", 500, 430, ["tool_name", "tool_args"], ["tool_result", "messages"], "限定高校官方域名搜索政策页面和教务处 PDF。"),
      node("source_validator", "来源验证", "Function Node", "function", 760, 430, ["tool_result"], ["api_result"], "检查来源域名、发布日期和政策主体。"),
      node("brief_formatter", "政策简报", "LLM Node", "llm", 760, 160, ["messages", "draft_answer", "api_result"], ["final_answer"], "在满足覆盖和引用条件后生成结构化简报。"),
      systemNode("end", "END", 1010, 220)
    ],
    edges: [
      edge("e-react-1", "start", "react_agent"),
      edge("e-react-2", "react_agent", "react_route"),
      edge("e-react-3", "react_route", "official_search", "continue"),
      edge("e-react-4", "official_search", "source_validator"),
      edge("e-react-5", "source_validator", "react_agent"),
      edge("e-react-6", "react_route", "brief_formatter", "end"),
      edge("e-react-7", "brief_formatter", "end")
    ],
    runOrder: ["start", "e-react-1", "react_agent", "e-react-2", "react_route", "e-react-3", "official_search", "e-react-4", "source_validator", "e-react-5", "react_agent", "e-react-2", "react_route", "e-react-6", "brief_formatter", "e-react-7", "end"],
    result: "final_answer: 已完成三所高校政策比较，保留四条官方来源，并记录一次低可信来源被拒绝的观察轨迹。",
    code: `graph.add_conditional_edges(
    "react_agent",
    route_action,
    {"search": "official_search", "done": "brief_formatter"}
)
graph.add_edge("official_search", "source_validator")
graph.add_edge("source_validator", "react_agent")`
  },
  {
    id: "lesson-04-plan",
    name: "Plan-and-Execute · 结构化研究计划",
    description: "先生成包含输入、输出和完成条件的计划，再逐项收集资料、抽取政策、比较差异并验证引用。",
    nodes: [
      systemNode("start", "START", 40, 250),
      node("planner", "Planner", "LLM Node", "llm", 200, 215, ["user_input"], ["messages", "draft_answer"], "把任务拆分为约束识别、资料收集、可信度验证、条款抽取、比较、写作和验收。"),
      node("plan_review", "计划检查", "Function Node", "function", 440, 215, ["draft_answer"], ["api_result"], "检查每一步是否具有输入、输出和完成条件。"),
      node("executor", "Executor", "Agent Node", "agent", 680, 215, ["messages", "api_result"], ["tool_name", "tool_args", "tool_result", "draft_answer"], "按计划逐项执行搜索、抽取和比较任务。"),
      node("completion_check", "Completion Check", "Function Node", "function", 920, 215, ["draft_answer", "tool_result"], ["final_answer"], "验证三校覆盖、四条引用、风险和三条建议。"),
      systemNode("end", "END", 1160, 250)
    ],
    edges: [
      edge("e-plan-1", "start", "planner"),
      edge("e-plan-2", "planner", "plan_review"),
      edge("e-plan-3", "plan_review", "executor"),
      edge("e-plan-4", "executor", "completion_check"),
      edge("e-plan-5", "completion_check", "end")
    ],
    runOrder: ["start", "e-plan-1", "planner", "e-plan-2", "plan_review", "e-plan-3", "executor", "e-plan-4", "completion_check", "e-plan-5", "end"],
    result: "final_answer: 结构化计划的六个步骤已逐项完成，三所高校、四条引用、风险和三条建议均通过检查。",
    code: `graph.add_edge(START, "planner")
graph.add_edge("planner", "plan_review")
graph.add_edge("plan_review", "executor")
graph.add_edge("executor", "completion_check")
graph.add_edge("completion_check", END)`
  },
  {
    id: "lesson-04-replan",
    name: "Replanning · 失败与目标变化",
    description: "当搜索超时、来源缺失或用户追加隐私要求时，保留已完成结果并只修改剩余计划。",
    nodes: [
      systemNode("start", "START", 40, 260),
      node("planner", "Planner", "LLM Node", "llm", 190, 220, ["user_input"], ["messages", "draft_answer"], "生成初始研究计划和验收标准。"),
      node("executor", "Executor", "Agent Node", "agent", 420, 220, ["messages", "draft_answer"], ["tool_result", "api_result", "should_continue"], "执行当前步骤并记录已完成产物。"),
      node("success_check", "步骤成功？", "Router Node", "router", 660, 220, ["tool_result", "should_continue"], [], "区分成功、失败和整体完成。", { branches: ["continue", "replan", "done"] }),
      node("replanner", "Replanner", "LLM Node", "llm", 660, 450, ["messages", "tool_result", "api_result"], ["draft_answer", "messages"], "保留有效结果，为超时、来源缺失或新增隐私要求修改剩余步骤。"),
      node("final_report", "最终简报", "Output Node", "output", 910, 160, ["draft_answer", "api_result"], ["final_answer"], "输出更新后的政策比较和建议。"),
      systemNode("end", "END", 1140, 220)
    ],
    edges: [
      edge("e-replan-1", "start", "planner"),
      edge("e-replan-2", "planner", "executor"),
      edge("e-replan-3", "executor", "success_check"),
      edge("e-replan-4", "success_check", "executor", "continue"),
      edge("e-replan-5", "success_check", "replanner", "replan"),
      edge("e-replan-6", "replanner", "executor"),
      edge("e-replan-7", "success_check", "final_report", "done"),
      edge("e-replan-8", "final_report", "end")
    ],
    runOrder: ["start", "e-replan-1", "planner", "e-replan-2", "executor", "e-replan-3", "success_check", "e-replan-5", "replanner", "e-replan-6", "executor", "e-replan-3", "success_check", "e-replan-7", "final_report", "e-replan-8", "end"],
    result: "final_answer: 已保留高校 A/B 的结果，为高校 C 使用替代来源，并把新增隐私要求写入剩余计划和最终验收。",
    code: `graph.add_conditional_edges(
    "success_check",
    route_result,
    {"continue": "executor", "replan": "replanner", "done": "final_report"}
)
graph.add_edge("replanner", "executor")`
  },
  {
    id: "lesson-04-evaluator",
    name: "Evaluator-Optimizer · 结构化质量控制",
    description: "用覆盖、引用、准确性、风险、字数和建议等结构化 Rubric 控制生成与返工。",
    nodes: [
      systemNode("start", "START", 40, 260),
      node("generator", "Generator", "LLM Node", "llm", 200, 220, ["user_input"], ["draft_answer"], "生成包含比较、风险和建议的政策简报初稿。"),
      node("evaluator", "Evaluator", "LLM Node", "llm", 440, 220, ["draft_answer"], ["api_result", "should_continue"], "使用结构化 Rubric 输出通过项、失败项和可执行修订建议。"),
      node("quality_route", "通过？", "Router Node", "router", 680, 220, ["api_result", "should_continue"], [], "通过则输出，否则进入优化器。", { branches: ["pass", "revise"] }),
      node("optimizer", "Optimizer", "LLM Node", "llm", 690, 430, ["draft_answer", "api_result"], ["draft_answer"], "根据失败项补齐高校覆盖、引用、隐私风险和可执行建议。"),
      node("final_output", "验收结果", "Output Node", "output", 920, 160, ["draft_answer", "api_result"], ["final_answer"], "输出最终简报和验收得分。"),
      systemNode("end", "END", 1160, 220)
    ],
    edges: [
      edge("e-eval-1", "start", "generator"),
      edge("e-eval-2", "generator", "evaluator"),
      edge("e-eval-3", "evaluator", "quality_route"),
      edge("e-eval-4", "quality_route", "optimizer", "revise"),
      edge("e-eval-5", "optimizer", "evaluator"),
      edge("e-eval-6", "quality_route", "final_output", "pass"),
      edge("e-eval-7", "final_output", "end")
    ],
    runOrder: ["start", "e-eval-1", "generator", "e-eval-2", "evaluator", "e-eval-3", "quality_route", "e-eval-4", "optimizer", "e-eval-5", "evaluator", "e-eval-3", "quality_route", "e-eval-6", "final_output", "e-eval-7", "end"],
    result: "final_answer: 第二轮已满足三校覆盖、四条引用、隐私与公平风险、三条建议和 800-1200 字约束。",
    code: `graph.add_conditional_edges(
    "quality_route",
    route_quality,
    {"pass": "final_output", "revise": "optimizer"}
)
graph.add_edge("optimizer", "evaluator")`
  }
];

export const abilityDimensions = ["工作流结构力", "State 设计力", "节点建模力", "路由分支力", "Agent 编排力", "调试分析力"];

export function courseSections(topic: string, workflowHint: string): CourseSection[] {
  return [
    {
      id: "concept",
      title: `${topic}核心概念`,
      type: "concept",
      content: `理解 ${topic} 在 Agent 工作流中的职责边界，明确输入、输出和状态变化。`
    },
    {
      id: "diagram",
      title: "结构示意",
      type: "diagram",
      content: `观察 ${workflowHint} 的节点连接方式，区分顺序边、条件边和循环控制。`
    },
    {
      id: "practice",
      title: "实训任务",
      type: "practice",
      content: `基于示例工作流完成一次小改造，并说明每个节点读写了哪些 State 字段。`
    }
  ];
}

export const mockCourses: Course[] = [
  {
    id: "langgraph-basics",
    title: "LangGraph 工作流基础",
    subtitle: "从 State、节点和边开始建立工作流结构感。",
    description: "学习 LangGraph 工作流的最小构成，理解节点如何读写共享 State，并把顺序流程表达成可运行图。",
    difficulty: "beginner",
    status: "learning",
    progress: 68,
    chapterCount: 3,
    taskCount: 3,
    completedChapters: 2,
    completedTasks: 2,
    estimatedHours: 6,
    tags: ["LangGraph", "State", "基础图"],
    abilities: ["工作流结构力", "State 设计力", "节点建模力"],
    recommended: true,
    chapters: [
      {
        id: "state-and-node",
        order: 1,
        title: "State 与节点建模",
        summary: "把输入、过程变量和最终输出整理成清晰的 State Schema。",
        status: "completed",
        duration: "45 分钟",
        abilityTags: ["State 设计力", "节点建模力"],
        workflowTemplateId: "minimal",
        taskId: "task-state-schema",
        sections: courseSections("State 与节点", "最小工作流")
      },
      {
        id: "edges-and-runtime",
        order: 2,
        title: "边与执行顺序",
        summary: "理解 START、普通节点和 END 的执行顺序，以及边只表达连接关系。",
        status: "learning",
        duration: "50 分钟",
        abilityTags: ["工作流结构力", "调试分析力"],
        workflowTemplateId: "sequence",
        taskId: "task-sequence-runtime",
        sections: courseSections("边与执行顺序", "顺序工作流")
      },
      {
        id: "first-workflow",
        order: 3,
        title: "构建第一个教学工作流",
        summary: "把 State、节点和边组合成一个可解释的教学演示流程。",
        status: "not_started",
        duration: "60 分钟",
        abilityTags: ["工作流结构力", "节点建模力"],
        workflowTemplateId: "showcase",
        taskId: "task-first-workflow",
        sections: courseSections("教学工作流", "EduFlow LangGraph 示例")
      }
    ],
    tasks: [
      { id: "task-state-schema", title: "设计问答 State Schema", chapterId: "state-and-node", status: "completed", score: 92, deadline: "2026-06-05" },
      { id: "task-sequence-runtime", title: "标注顺序流程执行轨迹", chapterId: "edges-and-runtime", status: "learning", score: 76, deadline: "2026-06-08" },
      { id: "task-first-workflow", title: "提交第一个工作流说明", chapterId: "first-workflow", status: "not_started", score: 0, deadline: "2026-06-12" }
    ]
  },
  {
    id: "router-practice",
    title: "条件分支与 Router 实训",
    subtitle: "用 Router 把不同学习意图分发到合适路径。",
    description: "围绕条件分支、路由函数和分支命名完成实训，掌握分支可解释性和路径调试。",
    difficulty: "intermediate",
    status: "learning",
    progress: 42,
    chapterCount: 2,
    taskCount: 2,
    completedChapters: 1,
    completedTasks: 1,
    estimatedHours: 5,
    tags: ["Router", "条件边", "分支"],
    abilities: ["路由分支力", "调试分析力", "State 设计力"],
    recommended: true,
    chapters: [
      {
        id: "router-rule",
        order: 1,
        title: "Router 判定规则",
        summary: "根据 State 字段设计稳定的分支判定规则。",
        status: "completed",
        duration: "55 分钟",
        abilityTags: ["路由分支力", "State 设计力"],
        workflowTemplateId: "branch",
        taskId: "task-router-rule",
        sections: courseSections("Router 判定", "条件分支")
      },
      {
        id: "branch-debug",
        order: 2,
        title: "分支路径调试",
        summary: "通过执行轨迹定位分支误判，并调整条件字段。",
        status: "learning",
        duration: "70 分钟",
        abilityTags: ["路由分支力", "调试分析力"],
        workflowTemplateId: "branch",
        taskId: "task-branch-debug",
        sections: courseSections("分支调试", "条件分支")
      }
    ],
    tasks: [
      { id: "task-router-rule", title: "补全 task_type 路由规则", chapterId: "router-rule", status: "completed", score: 88, deadline: "2026-06-09" },
      { id: "task-branch-debug", title: "修复一次分支误判", chapterId: "branch-debug", status: "learning", score: 61, deadline: "2026-06-14" }
    ]
  },
  {
    id: "agent-tool-calls",
    title: "Agent 与 Tool 调用",
    subtitle: "让 Agent 能够判断何时调用工具并吸收结果。",
    description: "学习 Agent 节点、Tool 节点和消息 State 的基本协作方式。",
    difficulty: "intermediate",
    status: "not_started",
    progress: 0,
    chapterCount: 2,
    taskCount: 2,
    completedChapters: 0,
    completedTasks: 0,
    estimatedHours: 6,
    tags: ["Agent", "Tool", "Messages"],
    abilities: ["Agent 编排力", "State 设计力", "节点建模力"],
    chapters: [
      {
        id: "agent-decision",
        order: 1,
        title: "Agent 决策节点",
        summary: "设计 Agent 的输入消息、工具意图和停止条件。",
        status: "not_started",
        duration: "60 分钟",
        abilityTags: ["Agent 编排力", "State 设计力"],
        workflowTemplateId: "agent",
        taskId: "task-agent-decision",
        sections: courseSections("Agent 决策", "Agent 工具调用")
      },
      {
        id: "tool-result",
        order: 2,
        title: "Tool 结果回写",
        summary: "把工具返回写回 State，并让 Agent 基于 Observation 继续推理。",
        status: "locked",
        duration: "65 分钟",
        abilityTags: ["Agent 编排力", "调试分析力"],
        workflowTemplateId: "agent",
        taskId: "task-tool-result",
        sections: courseSections("Tool 回写", "Agent 工具调用")
      }
    ],
    tasks: [
      { id: "task-agent-decision", title: "配置 Agent 工具意图", chapterId: "agent-decision", status: "not_started", score: 0, deadline: "2026-06-16" },
      { id: "task-tool-result", title: "追踪 Tool Observation", chapterId: "tool-result", status: "locked", score: 0, deadline: "2026-06-20" }
    ]
  },
  {
    id: "agent-loop-trace",
    title: "Agent Loop 与运行轨迹",
    subtitle: "分析 Agent 多轮循环中的状态变化。",
    description: "聚焦 Loop 节点、迭代上限和运行轨迹，训练定位循环退出条件的能力。",
    difficulty: "advanced",
    status: "not_started",
    progress: 0,
    chapterCount: 2,
    taskCount: 2,
    completedChapters: 0,
    completedTasks: 0,
    estimatedHours: 7,
    tags: ["Loop", "Trace", "调试"],
    abilities: ["Agent 编排力", "调试分析力", "路由分支力"],
    chapters: [
      {
        id: "loop-condition",
        order: 1,
        title: "循环条件设计",
        summary: "用 should_continue 和 iteration 控制 Agent 是否继续调用工具。",
        status: "not_started",
        duration: "70 分钟",
        abilityTags: ["Agent 编排力", "路由分支力"],
        workflowTemplateId: "agent",
        taskId: "task-loop-condition",
        sections: courseSections("循环条件", "Agent 工具调用")
      },
      {
        id: "trace-analysis",
        order: 2,
        title: "运行轨迹分析",
        summary: "从执行轨迹中还原每轮 State 变化并定位异常。",
        status: "locked",
        duration: "75 分钟",
        abilityTags: ["调试分析力", "Agent 编排力"],
        workflowTemplateId: "showcase",
        taskId: "task-trace-analysis",
        sections: courseSections("运行轨迹", "EduFlow LangGraph 示例")
      }
    ],
    tasks: [
      { id: "task-loop-condition", title: "设计 Agent Loop 退出条件", chapterId: "loop-condition", status: "not_started", score: 0, deadline: "2026-06-22" },
      { id: "task-trace-analysis", title: "提交运行轨迹分析报告", chapterId: "trace-analysis", status: "locked", score: 0, deadline: "2026-06-26" }
    ]
  },
  {
    id: "eduflow-capstone",
    title: "EduFlow 综合项目实战",
    subtitle: "把课程中的能力组合成一个完整教学 Agent。",
    description: "以综合项目方式串联 State、Router、Agent、Tool 和运行调试，完成一个可演示的 EduFlow 项目。",
    difficulty: "advanced",
    status: "completed",
    progress: 100,
    chapterCount: 3,
    taskCount: 3,
    completedChapters: 3,
    completedTasks: 3,
    estimatedHours: 10,
    tags: ["项目实战", "综合能力", "演示"],
    abilities: abilityDimensions,
    chapters: [
      {
        id: "project-design",
        order: 1,
        title: "项目结构设计",
        summary: "定义项目目标、State Schema 和核心节点。",
        status: "completed",
        duration: "90 分钟",
        abilityTags: ["工作流结构力", "State 设计力"],
        workflowTemplateId: "showcase",
        taskId: "task-project-design",
        sections: courseSections("项目结构", "EduFlow LangGraph 示例")
      },
      {
        id: "project-routing",
        order: 2,
        title: "分支与工具接入",
        summary: "加入 Router 和 Tool，支持不同学习意图。",
        status: "completed",
        duration: "95 分钟",
        abilityTags: ["路由分支力", "Agent 编排力"],
        workflowTemplateId: "branch",
        taskId: "task-project-routing",
        sections: courseSections("分支与工具", "条件分支")
      },
      {
        id: "project-demo",
        order: 3,
        title: "运行调试与演示",
        summary: "完成演示路径，说明关键 State 变化和能力目标。",
        status: "completed",
        duration: "110 分钟",
        abilityTags: ["调试分析力", "节点建模力"],
        workflowTemplateId: "showcase",
        taskId: "task-project-demo",
        sections: courseSections("项目演示", "EduFlow LangGraph 示例")
      }
    ],
    tasks: [
      { id: "task-project-design", title: "提交项目结构图", chapterId: "project-design", status: "completed", score: 95, deadline: "2026-05-18" },
      { id: "task-project-routing", title: "实现项目分支流程", chapterId: "project-routing", status: "completed", score: 91, deadline: "2026-05-25" },
      { id: "task-project-demo", title: "录制项目演示说明", chapterId: "project-demo", status: "completed", score: 96, deadline: "2026-05-30" }
    ]
  }
];

export function createTask(input: {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  courseId: string;
  chapterId: string;
  difficulty: TaskDifficulty;
  status: TaskStatus;
  score: number | null;
  deadline: string;
  estimatedMinutes: number;
  requiredAbilities: string[];
  requiredNodes: string[];
  workflowTemplateId: string;
  submittedWorkflowId?: string | null;
  createdAt: string;
  submittedAt?: string | null;
}): MockTask {
  const course = mockCourses.find((item) => item.id === input.courseId) ?? mockCourses[0];
  const chapter = course.chapters.find((item) => item.id === input.chapterId) ?? course.chapters[0];
  const checkedCount = input.status === "not_started" ? 0 : input.status === "in_progress" ? 1 : input.status === "overdue" ? 1 : 3;
  const testStatus: TaskTestStatus = input.status === "graded" || input.status === "submitted" || input.status === "ready_to_submit" ? "passed" : "not_run";
  const rubricScore = input.score ? Math.round(input.score / 6) : 0;

  return {
    id: input.id,
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    courseId: input.courseId,
    courseTitle: course.title,
    chapterId: input.chapterId,
    chapterTitle: chapter.title,
    difficulty: input.difficulty,
    status: input.status,
    score: input.score,
    maxScore: 100,
    deadline: input.deadline,
    estimatedMinutes: input.estimatedMinutes,
    requiredAbilities: input.requiredAbilities,
    requiredNodes: input.requiredNodes,
    workflowTemplateId: input.workflowTemplateId,
    submittedWorkflowId: input.submittedWorkflowId ?? null,
    testCases: [
      {
        id: `${input.id}-case-1`,
        name: "基础路径可运行",
        input: "用户请求：解释本章核心概念并给出示例。",
        expectedBehavior: "工作流能从 START 到 END 完成一次完整执行，并产出 final_answer。",
        status: testStatus
      },
      {
        id: `${input.id}-case-2`,
        name: "State 字段完整",
        input: "检查节点读写字段和默认值。",
        expectedBehavior: "关键 State 字段被正确读取、写入，没有孤立或未声明字段。",
        status: input.status === "graded" ? "passed" : testStatus
      },
      {
        id: `${input.id}-case-3`,
        name: "异常输入可解释",
        input: "用户请求：输入为空或意图不明确。",
        expectedBehavior: "流程能进入可解释的兜底路径，并保留调试说明。",
        status: input.status === "graded" ? "passed" : testStatus
      }
    ],
    requirements: [
      "工作流必须包含 START、核心处理节点和 END，并保持连接清晰。",
      "每个业务节点必须说明读取和写入的 State 字段。",
      "提交前至少运行一次检查，并根据结果修正节点或路由配置。"
    ],
    checklist: [
      { id: `${input.id}-check-1`, label: "已补全任务要求中的核心节点", checked: checkedCount >= 1 },
      { id: `${input.id}-check-2`, label: "已说明关键 State 字段的读写关系", checked: checkedCount >= 2 },
      { id: `${input.id}-check-3`, label: "已运行测试用例并记录调试结论", checked: checkedCount >= 3 }
    ],
    gradingRubric: ["结构正确性", "State 设计合理性", "节点配置完整性", "路由 / Agent 逻辑", "可运行性", "调试与解释能力"].map((dimension) => ({
      dimension,
      score: input.status === "graded" ? Math.min(17, Math.max(12, rubricScore)) : 0,
      maxScore: 17,
      comment: input.status === "graded" ? `${dimension}达到本任务要求，可继续提升边界案例说明。` : "提交并评分后显示该维度反馈。"
    })),
    feedback:
      input.status === "graded"
        ? "整体结构清晰，核心节点和 State 字段匹配良好。下一步建议补充失败路径的解释和运行轨迹截图。"
        : "提交后将展示教师评分反馈、维度得分和能力成长建议。",
    abilityRewards: abilityDimensions.map((ability) => ({
      ability,
      points: input.requiredAbilities.includes(ability) ? 12 : 4
    })),
    createdAt: input.createdAt,
    submittedAt: input.submittedAt ?? null
  };
}

export const mockTasks: MockTask[] = [
  createTask({
    id: "task-state-schema",
    title: "设计问答 State Schema",
    subtitle: "为最小问答工作流定义输入、过程变量和输出字段。",
    description: "围绕 State 与节点建模章节，设计一个能支撑教学问答的 State Schema，并说明每个字段由哪个节点读写。",
    courseId: "langgraph-basics",
    chapterId: "state-and-node",
    difficulty: "beginner",
    status: "graded",
    score: 92,
    deadline: "2026-06-05",
    estimatedMinutes: 45,
    requiredAbilities: ["State 设计力", "节点建模力"],
    requiredNodes: ["Function Node", "Output Node"],
    workflowTemplateId: "minimal",
    submittedWorkflowId: "minimal",
    createdAt: "2026-05-28",
    submittedAt: "2026-06-01"
  }),
  createTask({
    id: "task-sequence-runtime",
    title: "标注顺序流程执行轨迹",
    subtitle: "根据顺序工作流说明每一步的 State 变化。",
    description: "打开顺序工作流模板，运行检查并标注节点执行顺序、边连接和最终输出字段。",
    courseId: "langgraph-basics",
    chapterId: "edges-and-runtime",
    difficulty: "beginner",
    status: "in_progress",
    score: null,
    deadline: "2026-06-08",
    estimatedMinutes: 50,
    requiredAbilities: ["工作流结构力", "调试分析力"],
    requiredNodes: ["Function Node", "File / Cloud Drive Node", "LLM Node", "Output Node"],
    workflowTemplateId: "sequence",
    createdAt: "2026-05-30"
  }),
  createTask({
    id: "task-first-workflow",
    title: "提交第一个工作流说明",
    subtitle: "把节点、边和 State 串成一次完整教学演示。",
    description: "基于 EduFlow LangGraph 示例提交你的第一个教学工作流说明，重点解释流程结构与运行结果。",
    courseId: "langgraph-basics",
    chapterId: "first-workflow",
    difficulty: "beginner",
    status: "not_started",
    score: null,
    deadline: "2026-06-12",
    estimatedMinutes: 60,
    requiredAbilities: ["工作流结构力", "节点建模力"],
    requiredNodes: ["Function Node", "Router Node", "Output Node"],
    workflowTemplateId: "showcase",
    createdAt: "2026-06-01"
  }),
  createTask({
    id: "task-router-rule",
    title: "补全 task_type 路由规则",
    subtitle: "让 Router 根据 State 字段稳定分发路径。",
    description: "为 task_type 设计清晰分支，并说明 search、writing 和 fallback 的命中条件。",
    courseId: "router-practice",
    chapterId: "router-rule",
    difficulty: "intermediate",
    status: "graded",
    score: 88,
    deadline: "2026-06-09",
    estimatedMinutes: 55,
    requiredAbilities: ["路由分支力", "State 设计力"],
    requiredNodes: ["Function Node", "Router Node", "LLM Node", "HTTP API Node"],
    workflowTemplateId: "branch",
    submittedWorkflowId: "branch",
    createdAt: "2026-05-29",
    submittedAt: "2026-06-02"
  }),
  createTask({
    id: "task-branch-debug",
    title: "修复一次分支误判",
    subtitle: "通过运行轨迹定位 Router 条件问题。",
    description: "运行分支工作流，找到一次误判路径，修正判断字段并记录调试过程。",
    courseId: "router-practice",
    chapterId: "branch-debug",
    difficulty: "intermediate",
    status: "ready_to_submit",
    score: null,
    deadline: "2026-06-14",
    estimatedMinutes: 70,
    requiredAbilities: ["路由分支力", "调试分析力"],
    requiredNodes: ["Router Node", "State Transform Node", "Output Node"],
    workflowTemplateId: "branch",
    createdAt: "2026-06-01"
  }),
  createTask({
    id: "task-agent-decision",
    title: "配置 Agent 工具意图",
    subtitle: "让 Agent 判断何时需要 Tool。",
    description: "配置 Agent 节点的消息输入、工具选择字段和停止条件，确保工具意图可解释。",
    courseId: "agent-tool-calls",
    chapterId: "agent-decision",
    difficulty: "intermediate",
    status: "not_started",
    score: null,
    deadline: "2026-06-16",
    estimatedMinutes: 60,
    requiredAbilities: ["Agent 编排力", "State 设计力"],
    requiredNodes: ["Agent Node", "Tool Node", "Loop Node"],
    workflowTemplateId: "agent",
    createdAt: "2026-06-02"
  }),
  createTask({
    id: "task-tool-result",
    title: "追踪 Tool Observation",
    subtitle: "把工具返回写回 State 并驱动下一轮推理。",
    description: "观察 Tool 节点返回后 messages、tool_result 和 final_answer 的变化，并补全说明。",
    courseId: "agent-tool-calls",
    chapterId: "tool-result",
    difficulty: "intermediate",
    status: "submitted",
    score: null,
    deadline: "2026-06-20",
    estimatedMinutes: 65,
    requiredAbilities: ["Agent 编排力", "调试分析力"],
    requiredNodes: ["Tool Node", "Agent Node", "Output Node"],
    workflowTemplateId: "agent",
    submittedWorkflowId: "agent",
    createdAt: "2026-06-03",
    submittedAt: "2026-06-03"
  }),
  createTask({
    id: "task-loop-condition",
    title: "设计 Agent Loop 退出条件",
    subtitle: "用 should_continue 和 iteration 控制循环。",
    description: "为 Agent Loop 补全继续和退出条件，避免无限循环并保留调试解释。",
    courseId: "agent-loop-trace",
    chapterId: "loop-condition",
    difficulty: "advanced",
    status: "not_started",
    score: null,
    deadline: "2026-06-22",
    estimatedMinutes: 70,
    requiredAbilities: ["Agent 编排力", "路由分支力"],
    requiredNodes: ["Agent Node", "Loop Node", "Tool Node"],
    workflowTemplateId: "agent",
    createdAt: "2026-06-03"
  }),
  createTask({
    id: "task-trace-analysis",
    title: "提交运行轨迹分析报告",
    subtitle: "从多轮执行中还原 State 变化。",
    description: "阅读 Agent 运行轨迹，说明每轮 tool_result、messages 和 should_continue 的变化。",
    courseId: "agent-loop-trace",
    chapterId: "trace-analysis",
    difficulty: "advanced",
    status: "overdue",
    score: null,
    deadline: "2026-05-31",
    estimatedMinutes: 75,
    requiredAbilities: ["调试分析力", "Agent 编排力"],
    requiredNodes: ["Agent Node", "Loop Node", "Tool Node", "Output Node"],
    workflowTemplateId: "showcase",
    createdAt: "2026-05-22"
  }),
  createTask({
    id: "task-project-design",
    title: "提交项目结构图",
    subtitle: "定义综合项目的 State、节点和核心路径。",
    description: "为 EduFlow 综合项目画出结构图，说明每个模块如何服务教学闭环。",
    courseId: "eduflow-capstone",
    chapterId: "project-design",
    difficulty: "advanced",
    status: "graded",
    score: 95,
    deadline: "2026-05-18",
    estimatedMinutes: 90,
    requiredAbilities: ["工作流结构力", "State 设计力"],
    requiredNodes: ["Function Node", "Router Node", "Agent Node"],
    workflowTemplateId: "showcase",
    submittedWorkflowId: "showcase",
    createdAt: "2026-05-08",
    submittedAt: "2026-05-17"
  }),
  createTask({
    id: "task-project-routing",
    title: "实现项目分支流程",
    subtitle: "接入 Router 与 Tool 支撑不同学习意图。",
    description: "为综合项目加入分支流程和工具调用，确保不同学习意图进入合适路径。",
    courseId: "eduflow-capstone",
    chapterId: "project-routing",
    difficulty: "advanced",
    status: "graded",
    score: 91,
    deadline: "2026-05-25",
    estimatedMinutes: 95,
    requiredAbilities: ["路由分支力", "Agent 编排力"],
    requiredNodes: ["Router Node", "Tool Node", "Agent Node", "HTTP API Node"],
    workflowTemplateId: "branch",
    submittedWorkflowId: "branch",
    createdAt: "2026-05-14",
    submittedAt: "2026-05-24"
  }),
  createTask({
    id: "task-project-demo",
    title: "录制项目演示说明",
    subtitle: "展示可运行路径、评分依据和能力成长。",
    description: "完成综合项目演示路径，说明关键 State 变化、运行检查结果和调试结论。",
    courseId: "eduflow-capstone",
    chapterId: "project-demo",
    difficulty: "advanced",
    status: "graded",
    score: 96,
    deadline: "2026-05-30",
    estimatedMinutes: 110,
    requiredAbilities: ["调试分析力", "节点建模力"],
    requiredNodes: ["Agent Node", "Loop Node", "Output Node"],
    workflowTemplateId: "showcase",
    submittedWorkflowId: "showcase",
    createdAt: "2026-05-20",
    submittedAt: "2026-05-29"
  })
];

export const nodePalette = [
  { title: "基础节点", items: ["Function Node", "State Transform Node", "Output Node"], icon: CircleDot },
  { title: "智能节点", items: ["LLM Node", "Agent Node"], icon: Bot },
  { title: "工具 / 第三方系统", items: ["Tool Node", "HTTP API Node", "Database Node", "File / Cloud Drive Node"], icon: Hammer },
  { title: "控制节点", items: ["Router Node", "Loop Node"], icon: GitBranch }
];

export const bottomTabs = ["运行结果", "执行轨迹", "节点日志"] as const;
export type BottomTab = (typeof bottomTabs)[number];
export const stateTabs = ["Schema", "代码", "历史记录"] as const;
export type StateTab = (typeof stateTabs)[number];
export const nodeWorkbenchTabs = ["配置", "测试运行", "日志"] as const;
export type NodeWorkbenchTab = (typeof nodeWorkbenchTabs)[number];
export const storageKey = "knowledge-atlas.workflow-state.v2";
export const sessionStorageKey = "knowledge-atlas.mock-session.v2";
export const settingsStorageKey = "knowledge-atlas.workflow-settings.v2";

export type EnvironmentConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  searchApiUrl: string;
  searchApiKey: string;
  databaseUrl: string;
  fileStoragePath: string;
  note: string;
};

export type MockSettings = {
  dailyReminder: boolean;
  compactMode: boolean;
  emailDigest: boolean;
  environments: EnvironmentConfig[];
  activeEnvironmentId: string;
};

export const defaultEnvironments: EnvironmentConfig[] = [
  {
    id: "development",
    name: "Development",
    baseUrl: "https://api.dev.eduflow.local/v1",
    apiKey: "dev_mock_key",
    model: "gpt-4.1-mini",
    searchApiUrl: "https://search.dev.eduflow.local/query",
    searchApiKey: "dev_search_key",
    databaseUrl: "postgres://localhost:5432/eduflow_dev",
    fileStoragePath: "/tmp/eduflow/dev",
    note: "本地开发和课堂演示使用。"
  },
  {
    id: "staging",
    name: "Staging",
    baseUrl: "https://api.staging.eduflow.local/v1",
    apiKey: "staging_mock_key",
    model: "gpt-4.1",
    searchApiUrl: "https://search.staging.eduflow.local/query",
    searchApiKey: "staging_search_key",
    databaseUrl: "postgres://staging.internal:5432/eduflow",
    fileStoragePath: "s3://eduflow-staging/files",
    note: "接近线上配置的集成测试环境。"
  },
  {
    id: "production",
    name: "Production",
    baseUrl: "https://api.eduflow.local/v1",
    apiKey: "",
    model: "gpt-4.1",
    searchApiUrl: "https://search.eduflow.local/query",
    searchApiKey: "",
    databaseUrl: "postgres://prod.internal:5432/eduflow",
    fileStoragePath: "s3://eduflow-prod/files",
    note: "生产环境示例，密钥留空。"
  }
];

export const defaultMockSettings: MockSettings = {
  dailyReminder: true,
  compactMode: false,
  emailDigest: true,
  environments: defaultEnvironments,
  activeEnvironmentId: defaultEnvironments[0].id
};

export type PersistedAppState = {
  workflows?: Template[];
  tasks?: MockTask[];
  activeTemplateId?: string;
  workflowDescription?: string;
  schemaSaved?: boolean;
  nodePositions?: Record<string, { x: number; y: number }>;
  stateValues?: PersistedStateValues;
  runHistory?: PersistedRunHistory;
};

export function node(
  id: string,
  label: string,
  subtitle: string,
  kind: NodeKind,
  x: number,
  y: number,
  reads: string[],
  writes: string[],
  logic: string,
  control?: FlowNode["control"]
): FlowNode {
  return { id, label, subtitle, kind, x, y, reads, writes, logic, control };
}

export function systemNode(id: string, label: string, x: number, y: number): FlowNode {
  return { id, label, subtitle: "System", kind: "system", x, y, reads: [], writes: [], logic: "工作流系统节点。" };
}

export function edge(id: string, from: string, to: string, label = "next", sourceHandle?: string, targetHandle?: string): FlowEdge {
  return { id, from, to, label, kind: "normal", sourceHandle, targetHandle };
}

export function isEdgeSideHandle(value?: string | null): value is EdgeSide {
  return edgeSides.includes(value as EdgeSide);
}

export function isControlNode(node?: FlowNode) {
  return node?.kind === "router" || node?.kind === "loop";
}

export function addBranch(branches: string[], label: string) {
  return branches.includes(label) ? branches : [...branches, label];
}

export function getOppositeSide(side: EdgeSide): EdgeSide {
  if (side === "top") return "bottom";
  if (side === "bottom") return "top";
  if (side === "left") return "right";
  return "left";
}

export function getUniqueNodeName(baseName: string, nodes: FlowNode[]) {
  const base = baseName.trim() || "Node";
  const used = new Set(nodes.map((item) => item.label));
  if (!used.has(base)) return base;

  let index = 2;
  let candidate = `${base} ${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${base} ${index}`;
  }
  return candidate;
}

export function getStateCode() {
  return `from typing import TypedDict, Optional, List, Dict, Any, Literal


class State(TypedDict, total=False):
    user_input: str
    query: str
    task_type: Literal["search", "writing", "agent", "end"]
    api_result: Dict[str, Any]
    draft_answer: str
    final_answer: str

    messages: List[Dict[str, Any]]
    should_continue: bool
    tool_name: Optional[str]
    tool_args: Optional[Dict[str, Any]]
    tool_result: Optional[str]
    iteration: int`;
}

export function getNodeFnName(node: FlowNode) {
  return node.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || node.id;
}

export function getNodeCode(node: FlowNode, template?: Template) {
  if ((node.kind === "router" || node.kind === "loop") && template) {
    return getControlNodeCode(node, template);
  }
  if (node.code?.trim()) {
    return node.code;
  }
  return getGeneratedNodeCode(node, node.subtitle, node.logic);
}

export function getControlNodeCode(node: FlowNode, template: Template) {
  const branches = getControlBranches(node, template);
  const branchLines = branches
    .map((branch) => {
      const target = template.edges.find((edgeItem) => edgeItem.from === node.id && (edgeItem.label === branch || edgeItem.sourceHandle === branch))?.to ?? "end";
      const targetRef = target === "end" ? "END" : `"${target}"`;
      return `        "${branch}": ${targetRef}`;
    })
    .join(",\n");

  if (node.kind === "loop") {
    return `def route_${getNodeFnName(node)}(state: State):
    if state["should_continue"]:
        return "continue"
    return "end"


graph_builder.add_conditional_edges(
    "agent",
    route_${getNodeFnName(node)},
    {
${branchLines}
    }
)`;
  }

  return `def route_${getNodeFnName(node)}(state: State):
    return state["task_type"]


graph_builder.add_conditional_edges(
    "classify_task",
    route_${getNodeFnName(node)},
    {
${branchLines}
    }
)`;
}

export function getGeneratedNodeCode(node: FlowNode, purpose: string, logic: string) {
  if (node.kind === "system") {
    return node.id === "start"
      ? "# Start 节点不生成函数代码\n# 它只作为 LangGraph START 入口存在"
      : "# End 节点不生成函数代码\n# 它只作为 LangGraph END 结束标记存在";
  }

  const example = getNodeExampleCode(node);
  if (example) return example;

  const fnName = getNodeFnName(node);
  return `def ${fnName}(state: State):
    # 读取: ${node.reads.join(", ") || "-"}
    # 目的: ${purpose || "-"}
    # 逻辑: ${logic || "-"}
    return {
${node.writes.map((field) => `        "${field}": updated_${field}`).join(",\n")}
    }

graph.add_node("${fnName}", ${fnName})`;
}

export function getNodeExampleCode(node: FlowNode) {
  const examples: Record<string, string> = {
    normalize_input: `def normalize_input(state: State):
    return {
        "query": state["user_input"].strip(),
        "messages": [
            {
                "role": "user",
                "content": state["user_input"]
            }
        ],
        "iteration": 0
    }`,
    classify_task: `def classify_task(state: State):
    user_input = state["user_input"]

    if "搜索" in user_input or "查找" in user_input:
        task_type = "search"
    elif "写" in user_input or "生成" in user_input:
        task_type = "writing"
    elif "agent" in user_input.lower() or "工具" in user_input:
        task_type = "agent"
    else:
        task_type = "end"

    return {
        "task_type": task_type
    }`,
    write_answer: `def write_answer(state: State):
    response = llm.invoke([
        {
            "role": "system",
            "content": "你是一个教学助手"
        },
        {
            "role": "user",
            "content": state["query"]
        }
    ])

    return {
        "draft_answer": response.content
    }`,
    call_search_api: `import os
import requests


def call_search_api(state: State):
    response = requests.post(
        os.environ["SEARCH_API_URL"],
        headers={
            "Authorization": f"Bearer {os.environ['SEARCH_API_KEY']}",
            "Content-Type": "application/json"
        },
        json={
            "query": state["query"]
        },
        timeout=30
    )

    response.raise_for_status()

    return {
        "api_result": response.json(),
        "draft_answer": str(response.json())
    }`,
    agent: `def agent_node(state: State):
    messages = state["messages"]
    iteration = state.get("iteration", 0)

    if iteration < 2:
        should_continue = True
        tool_name = "search_api"
        tool_args = {
            "query": state["query"]
        }
        content = "我需要调用搜索工具继续处理。"
    else:
        should_continue = False
        tool_name = None
        tool_args = None
        content = "任务已经完成。"

    return {
        "messages": messages + [
            {
                "role": "assistant",
                "content": content
            }
        ],
        "should_continue": should_continue,
        "tool_name": tool_name,
        "tool_args": tool_args,
        "iteration": iteration + 1,
        "draft_answer": content
    }`,
    tool: `def tool_node(state: State):
    tool_name = state["tool_name"]
    tool_args = state["tool_args"]

    if tool_name == "search_api":
        result = f"搜索工具结果：{tool_args['query']}"
    else:
        result = "未知工具"

    return {
        "tool_result": result,
        "messages": state["messages"] + [
            {
                "role": "tool",
                "content": result
            }
        ]
    }`,
    format_answer: `def format_answer(state: State):
    return {
        "final_answer": f"最终回答：{state['draft_answer']}"
    }`,
    task_router: `def route_task(state: State):
    return state["task_type"]


graph_builder.add_conditional_edges(
    "classify_task",
    route_task,
    {
        "search": "call_search_api",
        "writing": "write_answer",
        "agent": "agent",
        "end": END,
    }
)`,
    agent_loop: `def route_agent_loop(state: State):
    if state["should_continue"]:
        return "continue"
    return "end"


graph_builder.add_conditional_edges(
    "agent",
    route_agent_loop,
    {
        "continue": "tool",
        "end": "format_answer",
    }
)`,
    search: `def call_search_api(state: State):
    # 第三方 API 通过环境变量配置，secret 不写入代码
    return {
        "draft_answer": "API result placeholder"
    }`,
    read: `def read_course_file(state: State):
    file_path = state["file_path"]
    content = file_loader.read(file_path)
    return {
        "file_content": content
    }`
  };

  if (node.kind === "database") {
    return `def query_student_db(state: State):
    rows = db.query(
        "SELECT * FROM students WHERE name = :name",
        {
            "name": state["student_name"]
        }
    )

    return {
        "db_result": rows
    }`;
  }

  if (node.kind === "file") {
    return `def read_course_file(state: State):
    file_path = state["file_path"]
    content = file_loader.read(file_path)
    return {
        "file_content": content
    }`;
  }

  return examples[node.id] ?? examples[getNodeFnName(node)];
}

export function getExportedNodeCode(node: FlowNode) {
  return `from state import State


${getNodeCode(node)}`;
}

export function formatGraphNodeRef(nodeId: string) {
  if (nodeId === "start") return "START";
  if (nodeId === "end") return "END";
  return `"${nodeId}"`;
}

export function isControlOutletEdge(edge: FlowEdge, template?: Template) {
  const source = template?.nodes.find((item) => item.id === edge.from);
  if (source?.kind !== "router" && source?.kind !== "loop") return false;
  const branches = getControlBranches(source, template);
  return branches.includes(edge.label) || branches.includes(edge.sourceHandle ?? "");
}

export function getControlBranches(node: FlowNode, template?: Template) {
  const configured = node.control?.branches.filter(Boolean);
  if (configured?.length) return configured;

  if (template && (node.kind === "router" || node.kind === "loop")) {
    const outgoingLabels = template.edges
      .filter((edgeItem) => edgeItem.from === node.id)
      .map((edgeItem) => edgeItem.label)
      .filter((label) => label && label !== "next");
    return Array.from(new Set(outgoingLabels));
  }

  if (node.kind === "router") return ["search", "writing", "agent", "end"];
  if (node.kind === "loop") return ["continue", "end"];
  return [];
}

export function getNodeCanvasPosition(node: FlowNode, nodePositions: Record<string, { x: number; y: number }>) {
  return nodePositions[node.id] ?? { x: node.x, y: node.y };
}

export function getNodeCanvasSize(node: FlowNode) {
  if (node.kind === "system") {
    return { width: 132, height: 132 };
  }

  return {
    width: 132,
    height: 132
  };
}

export function getAutoEdgeHandles(edge: FlowEdge, template: Template, nodePositions: Record<string, { x: number; y: number }>) {
  const source = template.nodes.find((item) => item.id === edge.from);
  const target = template.nodes.find((item) => item.id === edge.to);
  if (!source || !target) {
    return {
      sourceHandle: edge.sourceHandle ?? "right",
      targetHandle: edge.targetHandle ?? "left"
    };
  }

  const sourcePosition = getNodeCanvasPosition(source, nodePositions);
  const targetPosition = getNodeCanvasPosition(target, nodePositions);
  const sourceSize = getNodeCanvasSize(source);
  const targetSize = getNodeCanvasSize(target);
  const sourceCenter = {
    x: sourcePosition.x + sourceSize.width / 2,
    y: sourcePosition.y + sourceSize.height / 2
  };
  const targetCenter = {
    x: targetPosition.x + targetSize.width / 2,
    y: targetPosition.y + targetSize.height / 2
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  let sourceHandle: EdgeSide;
  let targetHandle: EdgeSide;

  if (Math.abs(dx) >= Math.abs(dy)) {
    sourceHandle = dx >= 0 ? "right" : "left";
    targetHandle = dx >= 0 ? "left" : "right";
  } else {
    sourceHandle = dy >= 0 ? "bottom" : "top";
    targetHandle = dy >= 0 ? "top" : "bottom";
  }

  return { sourceHandle, targetHandle };
}

export function getStoredOrInitialEdgeHandles(edge: FlowEdge, template: Template) {
  if (isEdgeSideHandle(edge.sourceHandle) && isEdgeSideHandle(edge.targetHandle)) {
    return {
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle
    };
  }

  return getAutoEdgeHandles(edge, template, {});
}

export function mergePortDirection(current: PortDirection | undefined, next: PortDirection): PortDirection {
  if (!current || current === next) return next;
  return "both";
}

export function getNodePortDirections(nodeId: string, template: Template): Partial<Record<EdgeSide, PortDirection>> {
  return template.edges.reduce<Partial<Record<EdgeSide, PortDirection>>>((directions, edgeItem) => {
    const handles = getStoredOrInitialEdgeHandles(edgeItem, template);
    if (edgeItem.from === nodeId && isEdgeSideHandle(handles.sourceHandle)) {
      directions[handles.sourceHandle] = mergePortDirection(directions[handles.sourceHandle], "out");
    }
    if (edgeItem.to === nodeId && isEdgeSideHandle(handles.targetHandle)) {
      directions[handles.targetHandle] = mergePortDirection(directions[handles.targetHandle], "in");
    }
    return directions;
  }, {});
}

export function getEdgeCode(edge: FlowEdge, template?: Template) {
  if (isControlOutletEdge(edge, template)) {
    const source = template?.nodes.find((item) => item.id === edge.from);
    const controlName = source?.kind === "loop" ? "Loop" : "Router";
    return `${formatJson({
  source: edge.from,
  branch: edge.label,
  target: edge.to,
  sourceHandle: edge.sourceHandle ?? null,
  targetHandle: edge.targetHandle ?? null,
  label: edge.label
})}

# This edge is compiled inside ${controlName} node:
# graph_builder.add_conditional_edges(...)`;
  }

  return `graph_builder.add_edge(${formatGraphNodeRef(edge.from)}, ${formatGraphNodeRef(edge.to)})`;
}

export const showcaseGraphCode = `from langgraph.graph import StateGraph, START, END

from state import State
from nodes.normalize_input import normalize_input
from nodes.classify_task import classify_task
from nodes.write_answer import write_answer
from nodes.call_search_api import call_search_api
from nodes.agent import agent_node
from nodes.tool import tool_node
from nodes.format_answer import format_answer
from routers.route_task import route_task
from routers.route_agent_loop import route_agent_loop


graph_builder = StateGraph(State)

graph_builder.add_node("normalize_input", normalize_input)
graph_builder.add_node("classify_task", classify_task)
graph_builder.add_node("write_answer", write_answer)
graph_builder.add_node("call_search_api", call_search_api)
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tool", tool_node)
graph_builder.add_node("format_answer", format_answer)

graph_builder.add_edge(START, "normalize_input")
graph_builder.add_edge("normalize_input", "classify_task")

graph_builder.add_conditional_edges(
    "classify_task",
    route_task,
    {
        "search": "call_search_api",
        "writing": "write_answer",
        "agent": "agent",
        "end": END,
    }
)

graph_builder.add_edge("call_search_api", "format_answer")
graph_builder.add_edge("write_answer", "format_answer")

graph_builder.add_conditional_edges(
    "agent",
    route_agent_loop,
    {
        "continue": "tool",
        "end": "format_answer",
    }
)

graph_builder.add_edge("tool", "agent")
graph_builder.add_edge("format_answer", END)

graph = graph_builder.compile()`;

export const showcaseCodeFiles: CodeFile[] = [
  { path: "state.py", title: "State Schema", code: getStateCode() },
  { path: "nodes/normalize_input.py", title: "Normalize Input", code: `from state import State


${getNodeExampleCode({ id: "normalize_input", label: "Normalize Input", subtitle: "", kind: "function", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/classify_task.py", title: "Classify Task", code: `from state import State


${getNodeExampleCode({ id: "classify_task", label: "Classify Task", subtitle: "", kind: "function", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/write_answer.py", title: "Write Answer", code: `from state import State


${getNodeExampleCode({ id: "write_answer", label: "Write Answer", subtitle: "", kind: "llm", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/call_search_api.py", title: "HTTP API", code: `from state import State


${getNodeExampleCode({ id: "call_search_api", label: "HTTP API", subtitle: "", kind: "http", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/agent.py", title: "Agent", code: `from state import State


${getNodeExampleCode({ id: "agent", label: "Agent", subtitle: "", kind: "agent", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/tool.py", title: "Tool", code: `from state import State


${getNodeExampleCode({ id: "tool", label: "Tool", subtitle: "", kind: "tool", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/format_answer.py", title: "Format Answer", code: `from state import State


${getNodeExampleCode({ id: "format_answer", label: "Format Answer", subtitle: "", kind: "transform", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "routers/route_task.py", title: "Task Router", code: `from typing import Literal
from state import State


def route_task(state: State) -> Literal["search", "writing", "agent", "end"]:
    return state["task_type"]` },
  { path: "routers/route_agent_loop.py", title: "Agent Loop", code: `from typing import Literal
from state import State


def route_agent_loop(state: State) -> Literal["continue", "end"]:
    if state["should_continue"]:
        return "continue"
    return "end"` },
  { path: "graph.py", title: "Workflow Graph", code: showcaseGraphCode },
  { path: "run.py", title: "Runner", code: `from graph import graph


result = graph.invoke({
    "user_input": "请用 agent 和工具帮我查找资料并生成回答"
})

print(result["final_answer"])` }
];

export function getGraphCode(template: Template) {
  if (template.id === "showcase") return showcaseGraphCode;

  const executableNodes = template.nodes.filter((item) => item.kind !== "system" && item.kind !== "router" && item.kind !== "loop");
  const nodeImports = executableNodes.map((item) => `from nodes.${getNodeFnName(item)} import ${getNodeFnName(item)}`).join("\n");
  const nodeDefinitions = executableNodes.map((item) => `graph_builder.add_node("${item.id}", ${getNodeFnName(item)})`).join("\n");
  const edgeDefinitions = template.edges.map((item) => getEdgeCode(item, template)).join("\n");

  return `from langgraph.graph import END, START, StateGraph
from state import State
${nodeImports}

graph_builder = StateGraph(State)

${nodeDefinitions}

${edgeDefinitions}

graph = graph_builder.compile()`;
}

export function getRunCode(template: Template) {
  return `from graph import graph

result = graph.invoke({
    "user_input": "请用 agent 和工具帮我查找资料并生成回答"
})

print("${template.name}")
print(result["final_answer"])`;
}

export function getWorkflowExportFiles(template: Template): CodeFile[] {
  if (template.id === "showcase") {
    return showcaseCodeFiles;
  }

  const nodeFiles = template.nodes
    .filter((item) => item.kind !== "system" && item.kind !== "router" && item.kind !== "loop")
    .map((item) => ({
      path: `nodes/${getNodeFnName(item)}.py`,
      title: item.label,
      code: getExportedNodeCode(item)
    }));

  return [
    { path: "state.py", title: "State Schema", code: getStateCode() },
    ...nodeFiles,
    { path: "graph.py", title: "Workflow Graph", code: getGraphCode(template) },
    { path: "run.py", title: "Runner", code: getRunCode(template) }
  ];
}

export function getCanvasExportTemplate(template: Template, nodePositions: Record<string, { x: number; y: number }>): Template {
  return {
    ...template,
    nodes: template.nodes.map((nodeItem) => {
      const position = nodePositions[nodeItem.id];
      return position ? { ...nodeItem, x: position.x, y: position.y } : nodeItem;
    })
  };
}

export function slugifyFileName(value: string) {
  return (value.trim() || "eduflow-workflow")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function inferTemplateIdFromDescription(description: string) {
  const text = description.toLowerCase();
  if (/客服|工单|售后|退款|退货|订单|客户|support|ticket|refund|customer/.test(text)) return "support-ticket-showcase";
  if (/langgraph|stategraph|完整|router.*loop|loop.*router|第三方/.test(text)) return "showcase";
  if (/agent|工具|tool|循环|搜索|调用/.test(text)) return "showcase";
  if (/条件|分支|router|路由|判断|选择/.test(text)) return "branch";
  if (/顺序|依次|多节点|串行|读取.*摘要|处理.*输出/.test(text)) return "sequence";
  return "minimal";
}

export function getNodeKindLabel(kind: NodeKind) {
  const labels: Record<NodeKind, string> = {
    system: "系统节点",
    function: "Function Node",
    transform: "State Transform Node",
    llm: "LLM Node",
    router: "Router Node",
    loop: "Loop Node",
    agent: "Agent 节点",
    tool: "Tool 节点",
    http: "HTTP API Node",
    database: "Database Node",
    file: "File / Cloud Drive Node",
    output: "输出节点"
  };

  return labels[kind];
}

export function getMockFieldValue(field: string, node: FlowNode): unknown {
  const values: Record<string, unknown> = {
    user_input: "总结这份文件",
    query: "Knowledge Atlas workflow",
    messages: ["用户请求", `${node.label} 准备执行`],
    task_type: "agent",
    api_result: { items: 3 },
    draft_answer: `${node.label} 的草稿输出`,
    should_continue: node.kind === "agent" ? false : true,
    tool_name: "search_api",
    tool_args: { query: "Knowledge Atlas workflow" },
    tool_result: "检索到 3 条相关资料",
    final_answer: `${node.label} 的测试输出`,
    iteration: 1
  };

  return values[field] ?? `mock_${field}`;
}

export function createNodeTestInput(node: FlowNode) {
  if (node.kind === "system") return {};
  return Object.fromEntries(node.reads.map((field) => [field, getMockFieldValue(field, node)]));
}

export function createNodeTestOutput(node: FlowNode, input: Record<string, unknown>) {
  if (node.kind === "system") {
    return node.id === "start" ? { event: "enter_workflow" } : { event: "finish_workflow" };
  }

  const base = Object.fromEntries(node.writes.map((field) => [field, getMockFieldValue(field, node)]));
  return {
    ...base,
    _debug: {
      isolated: true,
      consumed_fields: Object.keys(input)
    }
  };
}

export function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function formatFormValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

export function parseFormValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed === "true" || trimmed === "false" || trimmed === "null") {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

export function getDefaultStateValues() {
  return Object.fromEntries(schemaFields.map((field) => [field.name, parseFormValue(field.defaultValue)]));
}

export function createStateSnapshotForStep(template: Template, itemId: string, index: number) {
  const nodeItem = template.nodes.find((item) => item.id === itemId);
  const edgeItem = template.edges.find((item) => item.id === itemId);
  const base: Record<string, unknown> = {
    user_input: "总结这份文件",
    messages: template.runOrder.slice(0, index + 1).filter((item) => template.nodes.some((node) => node.id === item)),
    task_type: "",
    api_result: {},
    draft_answer: "",
    tool_call: null,
    tool_name: null,
    tool_args: null,
    tool_result: "",
    final_answer: "",
    should_continue: false,
    iteration: 0
  };

  if (nodeItem) {
    nodeItem.writes.forEach((field) => {
      base[field] = getMockFieldValue(field, nodeItem);
    });
  }

  if (edgeItem && isControlOutletEdge(edgeItem, template)) {
    base.task_type = edgeItem.label;
    base.should_continue = edgeItem.label === "continue";
  }

  if ((template.id === "agent" || template.id === "showcase") && itemId === "tool") {
    base.tool_result = "检索到 3 条相关资料";
  }

  if (itemId === "end") {
    base.final_answer = template.result;
    base.should_continue = false;
  }

  return base;
}

export function createRuntimeStateSnapshot(template: Template, stateValues: Record<string, unknown>, runIndex: number) {
  const state: Record<string, unknown> = { ...getDefaultStateValues(), ...stateValues };
  const visibleSteps = runIndex < 0 ? [] : template.runOrder.slice(0, runIndex + 1);

  visibleSteps.forEach((itemId, index) => {
    const nodeItem = template.nodes.find((item) => item.id === itemId);
    const edgeItem = template.edges.find((item) => item.id === itemId);

    state.messages = template.runOrder.slice(0, index + 1).filter((item) => template.nodes.some((nodeItem) => nodeItem.id === item));

    if (nodeItem) {
      nodeItem.writes.forEach((field) => {
        state[field] = getMockFieldValue(field, nodeItem);
      });
    }

    if (edgeItem && isControlOutletEdge(edgeItem, template)) {
      state.task_type = edgeItem.label;
      state.should_continue = edgeItem.label === "continue";
    }

    if ((template.id === "agent" || template.id === "showcase") && itemId === "tool") {
      state.tool_result = "检索到 3 条相关资料";
    }

    if (itemId === "end") {
      state.final_answer = template.result;
      state.should_continue = false;
    }
  });

  return state;
}

export function createWorkflowRunRecord(template: Template, stateValues: Record<string, unknown>, runNumber: number, assignmentContext?: { courseId: string; assignmentId: string }): WorkflowRunRecord {
  const nodeSteps = template.runOrder.reduce<WorkflowRunNodeRecord[]>((records, itemId, index) => {
    const nodeItem = template.nodes.find((item) => item.id === itemId);
    if (!nodeItem) return records;

    const snapshot = createStateSnapshotForStep(template, itemId, index);
    const input = {
      ...createNodeTestInput(nodeItem),
      ...Object.fromEntries(nodeItem.reads.map((field) => [field, stateValues[field] ?? snapshot[field] ?? getMockFieldValue(field, nodeItem)]))
    };
    const output = createNodeTestOutput(nodeItem, input);

    records.push({
      id: nodeItem.id,
      label: nodeItem.label,
      input,
      output
    });
    return records;
  }, []);

  const finalState = createRuntimeStateSnapshot(template, stateValues, template.runOrder.length - 1);

  return {
    id: `${template.id}-${Date.now()}-${runNumber}`,
    workflowId: template.id,
    workflowTemplateId: template.id,
    courseId: assignmentContext?.courseId,
    assignmentId: assignmentContext?.assignmentId,
    workflowName: template.name,
    createdAt: new Date().toISOString(),
    status: "success",
    nodeCount: nodeSteps.length,
    outputSummary: String(finalState.final_answer || template.result || "运行完成"),
    finalState,
    nodes: nodeSteps
  };
}

export function summarizeStateValue(value: unknown) {
  const formatted = typeof value === "string" ? value : formatJson(value);
  return formatted.length > 64 ? `${formatted.slice(0, 61)}...` : formatted || "空";
}

export function getDefaultPopoverPosition(expanded = false): PopoverPosition {
  const workspaceWidth = Math.max(document.body.clientWidth, window.innerWidth);
  if (expanded) {
    return {
      x: 48,
      y: 60
    };
  }

  return {
    x: Math.max(292, workspaceWidth - 730),
    y: 172
  };
}

export function clampPopoverPosition(next: PopoverPosition, expanded = false): PopoverPosition {
  const workspaceWidth = Math.max(document.body.clientWidth, window.innerWidth);
  const width = expanded ? Math.min(920, Math.max(320, window.innerWidth - 96)) : 360;
  const minOffset = expanded ? 16 : 12;
  const maxX = Math.max(minOffset, workspaceWidth - width - minOffset);
  const maxY = Math.max(minOffset, window.innerHeight - 88);

  return {
    x: Math.min(Math.max(minOffset, next.x), maxX),
    y: Math.min(Math.max(minOffset, next.y), maxY)
  };
}

export function getUniqueWorkflowName(baseName: string, workflows: Template[], excludeId?: string) {
  const normalized = baseName.trim() || "新建工作流";
  const usedNames = new Set(workflows.filter((item) => item.id !== excludeId).map((item) => item.name));
  if (!usedNames.has(normalized)) return normalized;

  let index = 2;
  while (usedNames.has(`${normalized} ${index}`)) {
    index += 1;
  }

  return `${normalized} ${index}`;
}

export function createBlankWorkflow(name: string): Template {
  const id = `blank-${Date.now()}`;
  return {
    id,
    name,
    description: "空白画布。可以先编辑工作流描述，再生成工作流和 Schema。",
    nodes: [systemNode("start", "START", 80, 220), systemNode("end", "END", 520, 220)],
    edges: [],
    runOrder: [],
    result: "尚未运行。",
    code: `graph = StateGraph(State)
graph.set_entry_point(START)
graph.add_edge(START, END)
app = graph.compile()`
  };
}

export function getPaletteNodeKind(label: string): NodeKind {
  if (label.includes("Router")) return "router";
  if (label.includes("Loop")) return "loop";
  if (label.includes("LLM")) return "llm";
  if (label.includes("Agent")) return "agent";
  if (label.includes("Tool")) return "tool";
  if (label.includes("HTTP")) return "http";
  if (label.includes("Database")) return "database";
  if (label.includes("File")) return "file";
  if (label.includes("Transform")) return "transform";
  if (label.includes("Output")) return "output";
  return "function";
}

export function getDefaultNodeIO(kind: NodeKind, label: string) {
  if (label.includes("Input")) return { reads: ["user_input"], writes: ["query", "messages"] };
  if (kind === "output") return { reads: ["final_answer"], writes: ["final_answer"] };
  if (kind === "router") return { reads: ["task_type"], writes: [] };
  if (kind === "loop") return { reads: ["should_continue"], writes: [] };
  if (kind === "llm") return { reads: ["query"], writes: ["draft_answer"] };
  if (kind === "agent") return { reads: ["messages", "query", "tool_result"], writes: ["messages", "should_continue", "tool_name", "tool_args", "iteration", "draft_answer"] };
  if (kind === "tool") return { reads: ["tool_name", "tool_args"], writes: ["tool_result", "messages"] };
  if (kind === "http") return { reads: ["query"], writes: ["api_result", "draft_answer"] };
  if (kind === "database") return { reads: ["query"], writes: ["api_result"] };
  if (kind === "file") return { reads: ["query"], writes: ["draft_answer"] };
  if (kind === "transform") return { reads: ["draft_answer"], writes: ["final_answer"] };
  return { reads: ["user_input"], writes: ["final_answer"] };
}

export function createPaletteNode(payload: CreateNodePayload, index: number, existingNodes: FlowNode[] = []): FlowNode {
  const kind = payload.kind;
  const nodeName = getUniqueNodeName(payload.label, existingNodes);
  const position = payload.position ?? {
    x: 260 + (index % 4) * 52,
    y: 180 + (index % 5) * 44
  };
  const io = getDefaultNodeIO(kind, nodeName);

  return node(
    nodeName,
    nodeName,
    `${getNodeKindLabel(kind)} / ${nodeName}`,
    kind,
    position.x,
    position.y,
    io.reads,
    io.writes,
    `执行 ${nodeName} 的节点逻辑，可双击打开配置。`
  );
}

export function getEdgeDefaults() {
  return { label: "next" };
}

export function readStoredAppState(): PersistedAppState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedAppState;
    return Array.isArray(parsed.workflows) ? parsed : {};
  } catch {
    return {};
  }
}

export function mergeBuiltinWorkflows(storedWorkflows: Template[] | undefined) {
  if (!storedWorkflows?.length) return templates;

  const normalizedStoredWorkflows = storedWorkflows.map((item) =>
    item.id === "showcase" && item.name === "EduFlow LangGraph 示例"
      ? { ...item, name: "知序 LangGraph 示例" }
      : item
  );
  const storedIds = new Set(normalizedStoredWorkflows.map((item) => item.id));
  const missingTemplates = templates.filter((item) => !storedIds.has(item.id));
  return [...missingTemplates, ...normalizedStoredWorkflows];
}

export function normalizeMockSettings(value: Partial<MockSettings> | null | undefined): MockSettings {
  const environments = Array.isArray(value?.environments) && value.environments.length ? value.environments : defaultMockSettings.environments;
  const activeEnvironmentId = environments.some((item) => item.id === value?.activeEnvironmentId)
    ? value?.activeEnvironmentId ?? environments[0].id
    : environments[0].id;

  return {
    dailyReminder: value?.dailyReminder ?? defaultMockSettings.dailyReminder,
    compactMode: value?.compactMode ?? defaultMockSettings.compactMode,
    emailDigest: value?.emailDigest ?? defaultMockSettings.emailDigest,
    environments,
    activeEnvironmentId
  };
}

export function readStoredMockSettings(): MockSettings {
  try {
    const raw = window.localStorage.getItem(settingsStorageKey);
    return normalizeMockSettings(raw ? JSON.parse(raw) as Partial<MockSettings> : null);
  } catch {
    return defaultMockSettings;
  }
}

export function writeStoredMockSettings(updates: Partial<MockSettings>) {
  const next = normalizeMockSettings({ ...readStoredMockSettings(), ...updates });
  window.localStorage.setItem(settingsStorageKey, JSON.stringify(next));
  return next;
}

export function mergeStoredTasks(storedTasks: MockTask[]) {
  return mockTasks.map((task) => storedTasks.find((item) => item.id === task.id) ?? task);
}

export function readMockSession(): MockSession | null {
  try {
    const raw = window.localStorage.getItem(sessionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockSession;
    if (!parsed?.email) return null;
    return { ...parsed, capabilities: parsed.capabilities ?? (parsed.email.endsWith("@knowledge-atlas.local") ? ["global-domain-admin"] : []) };
  } catch {
    return null;
  }
}
