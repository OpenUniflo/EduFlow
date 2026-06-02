import { useEffect, useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge as ReactFlowEdge,
  type EdgeChange,
  type Node as ReactFlowNode,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Bot,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Code2,
  Folder,
  FolderOpen,
  GitBranch,
  Grid2X2,
  Hammer,
  Layers3,
  List,
  ListChecks,
  Loader2,
  MousePointer2,
  Network,
  Play,
  Plus,
  RefreshCcw,
  Route,
  Save,
  Search,
  Settings2,
  Sparkles,
  Square,
  StepForward,
  TerminalSquare,
  Trash2,
  Wand2,
  X
} from "lucide-react";

type NodeKind = "system" | "function" | "transform" | "llm" | "agent" | "tool" | "http" | "database" | "file" | "router" | "loop" | "output";
type EdgeKind = "normal";
type Selection =
  | { type: "state" }
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "workflow" };
type ConfigTarget = { type: "node"; id: string } | { type: "edge"; id: string };

type Field = {
  name: string;
  type: string;
  defaultValue: string;
  note: string;
};

type FlowNode = {
  id: string;
  label: string;
  subtitle: string;
  kind: NodeKind;
  x: number;
  y: number;
  reads: string[];
  writes: string[];
  logic: string;
  control?: {
    branches: string[];
  };
  status?: "idle" | "running" | "success";
};

type FlowEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: EdgeKind;
  sourceHandle?: string;
  targetHandle?: string;
};

type EdgeSide = "top" | "right" | "bottom" | "left";
const edgeSides: EdgeSide[] = ["top", "right", "bottom", "left"];

type Template = {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  runOrder: string[];
  result: string;
  code: string;
};

type WorkflowNodeData = {
  node: FlowNode;
  active: boolean;
  onQuickAdd: (sourceId: string, side: EdgeSide, payload: Pick<CreateNodePayload, "label" | "kind">) => void;
};
type PopoverPosition = { x: number; y: number };
type DragState = PopoverPosition;
type NodeTestStatus = "idle" | "running" | "success" | "error";
type AppView = "home" | "canvas";
type WorkflowViewMode = "gallery" | "list";
type CreateNodePayload = {
  label: string;
  kind: NodeKind;
  position?: { x: number; y: number };
};
type CodeFile = {
  path: string;
  title: string;
  code: string;
};
type RenameNodeResult = {
  ok: boolean;
  message?: string;
  name?: string;
};
type WorkflowStatusKind = "ready" | "warning" | "blocked";
type WorkflowHealthItem = {
  ok: boolean;
  label: string;
};
type WorkflowHealthSummary = {
  status: WorkflowStatusKind;
  summary: string;
  guidance: string;
  canRun: boolean;
  checks: WorkflowHealthItem[];
};

const schemaFields: Field[] = [
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

const templates: Template[] = [
  {
    id: "showcase",
    name: "EduFlow LangGraph 示例",
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
  }
];

const nodePalette = [
  { title: "基础节点", items: ["Function Node", "State Transform Node", "Output Node"], icon: CircleDot },
  { title: "智能节点", items: ["LLM Node", "Agent Node"], icon: Bot },
  { title: "工具 / 第三方系统", items: ["Tool Node", "HTTP API Node", "Database Node", "File / Cloud Drive Node"], icon: Hammer },
  { title: "控制节点", items: ["Router Node", "Loop Node"], icon: GitBranch }
];

const bottomTabs = ["运行结果", "执行轨迹", "节点日志"] as const;
type BottomTab = (typeof bottomTabs)[number];
const stateTabs = ["Schema", "代码", "历史记录"] as const;
type StateTab = (typeof stateTabs)[number];
const nodeWorkbenchTabs = ["配置", "测试运行", "日志"] as const;
type NodeWorkbenchTab = (typeof nodeWorkbenchTabs)[number];
const storageKey = "eduflow.prototype.state.v1";

type PersistedAppState = {
  workflows?: Template[];
  activeTemplateId?: string;
  appView?: AppView;
  workflowDescription?: string;
  schemaSaved?: boolean;
  nodePositions?: Record<string, { x: number; y: number }>;
};

function node(
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

function systemNode(id: string, label: string, x: number, y: number): FlowNode {
  return { id, label, subtitle: "System", kind: "system", x, y, reads: [], writes: [], logic: "工作流系统节点。" };
}

function edge(id: string, from: string, to: string, label = "next", sourceHandle?: string, targetHandle?: string): FlowEdge {
  return { id, from, to, label, kind: "normal", sourceHandle, targetHandle };
}

function isEdgeSideHandle(value?: string | null): value is EdgeSide {
  return edgeSides.includes(value as EdgeSide);
}

function isControlNode(node?: FlowNode) {
  return node?.kind === "router" || node?.kind === "loop";
}

function addBranch(branches: string[], label: string) {
  return branches.includes(label) ? branches : [...branches, label];
}

function getOppositeSide(side: EdgeSide): EdgeSide {
  if (side === "top") return "bottom";
  if (side === "bottom") return "top";
  if (side === "left") return "right";
  return "left";
}

function getUniqueNodeName(baseName: string, nodes: FlowNode[]) {
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

function getStateCode() {
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

function getNodeFnName(node: FlowNode) {
  return node.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || node.id;
}

function getNodeCode(node: FlowNode, template?: Template) {
  if ((node.kind === "router" || node.kind === "loop") && template) {
    return getControlNodeCode(node, template);
  }
  return getGeneratedNodeCode(node, node.subtitle, node.logic);
}

function getControlNodeCode(node: FlowNode, template: Template) {
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

function getGeneratedNodeCode(node: FlowNode, purpose: string, logic: string) {
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

function getNodeExampleCode(node: FlowNode) {
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

function getExportedNodeCode(node: FlowNode) {
  return `from state import State


${getNodeCode(node)}`;
}

function formatGraphNodeRef(nodeId: string) {
  if (nodeId === "start") return "START";
  if (nodeId === "end") return "END";
  return `"${nodeId}"`;
}

function isControlOutletEdge(edge: FlowEdge, template?: Template) {
  const source = template?.nodes.find((item) => item.id === edge.from);
  if (source?.kind !== "router" && source?.kind !== "loop") return false;
  const branches = getControlBranches(source, template);
  return branches.includes(edge.label) || branches.includes(edge.sourceHandle ?? "");
}

function getControlBranches(node: FlowNode, template?: Template) {
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

function getNodeCanvasPosition(node: FlowNode, nodePositions: Record<string, { x: number; y: number }>) {
  return nodePositions[node.id] ?? { x: node.x, y: node.y };
}

function estimateNodeTextLines(text: string, charsPerLine: number) {
  const normalized = text.trim();
  if (!normalized) return 1;
  return Math.max(1, Math.ceil(normalized.length / charsPerLine));
}

function getNodeCanvasSize(node: FlowNode) {
  if (node.kind === "system") {
    return { width: 84, height: 60 };
  }

  const ioLines =
    estimateNodeTextLines(`读取：${node.reads.join(", ") || "-"}`, 22) +
    estimateNodeTextLines(`写入：${node.writes.join(", ") || "-"}`, 22);
  const titleLines = estimateNodeTextLines(node.label, 15);
  const subtitleLines = estimateNodeTextLines(node.subtitle, 25);
  const height = Math.min(240, Math.max(128, 50 + titleLines * 24 + subtitleLines * 18 + ioLines * 18));

  return {
    width: 188,
    height
  };
}

function getAutoEdgeHandles(edge: FlowEdge, template: Template, nodePositions: Record<string, { x: number; y: number }>) {
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

function getStoredOrInitialEdgeHandles(edge: FlowEdge, template: Template) {
  if (isEdgeSideHandle(edge.sourceHandle) && isEdgeSideHandle(edge.targetHandle)) {
    return {
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle
    };
  }

  return getAutoEdgeHandles(edge, template, {});
}

function getEdgeCode(edge: FlowEdge, template?: Template) {
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

const showcaseGraphCode = `from langgraph.graph import StateGraph, START, END

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

const showcaseCodeFiles: CodeFile[] = [
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

function getGraphCode(template: Template) {
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

function getRunCode(template: Template) {
  return `from graph import graph

result = graph.invoke({
    "user_input": "请用 agent 和工具帮我查找资料并生成回答"
})

print("${template.name}")
print(result["final_answer"])`;
}

function getWorkflowExportFiles(template: Template): CodeFile[] {
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

function inferTemplateIdFromDescription(description: string) {
  const text = description.toLowerCase();
  if (/langgraph|stategraph|完整|router.*loop|loop.*router|第三方/.test(text)) return "showcase";
  if (/agent|工具|tool|循环|搜索|调用/.test(text)) return "showcase";
  if (/条件|分支|router|路由|判断|选择/.test(text)) return "branch";
  if (/顺序|依次|多节点|串行|读取.*摘要|处理.*输出/.test(text)) return "sequence";
  return "minimal";
}

function getNodeKindLabel(kind: NodeKind) {
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

function getMockFieldValue(field: string, node: FlowNode): unknown {
  const values: Record<string, unknown> = {
    user_input: "总结这份文件",
    query: "EduFlow workflow",
    messages: ["用户请求", `${node.label} 准备执行`],
    task_type: "agent",
    api_result: { items: 3 },
    draft_answer: `${node.label} 的草稿输出`,
    should_continue: node.kind === "agent" ? false : true,
    tool_name: "search_api",
    tool_args: { query: "EduFlow workflow" },
    tool_result: "检索到 3 条相关资料",
    final_answer: `${node.label} 的测试输出`,
    iteration: 1
  };

  return values[field] ?? `mock_${field}`;
}

function createNodeTestInput(node: FlowNode) {
  if (node.kind === "system") return {};
  return Object.fromEntries(node.reads.map((field) => [field, getMockFieldValue(field, node)]));
}

function createNodeTestOutput(node: FlowNode, input: Record<string, unknown>) {
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

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formatFormValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

function parseFormValue(value: string) {
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

function createStateSnapshotForStep(template: Template, itemId: string, index: number) {
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

function getDefaultPopoverPosition(expanded = false): PopoverPosition {
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

function clampPopoverPosition(next: PopoverPosition, expanded = false): PopoverPosition {
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

function getUniqueWorkflowName(baseName: string, workflows: Template[], excludeId?: string) {
  const normalized = baseName.trim() || "新建工作流";
  const usedNames = new Set(workflows.filter((item) => item.id !== excludeId).map((item) => item.name));
  if (!usedNames.has(normalized)) return normalized;

  let index = 2;
  while (usedNames.has(`${normalized} ${index}`)) {
    index += 1;
  }

  return `${normalized} ${index}`;
}

function createBlankWorkflow(name: string): Template {
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

function getPaletteNodeKind(label: string): NodeKind {
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

function getDefaultNodeIO(kind: NodeKind, label: string) {
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

function createPaletteNode(payload: CreateNodePayload, index: number, existingNodes: FlowNode[] = []): FlowNode {
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

function getEdgeDefaults() {
  return { label: "next" };
}

function readStoredAppState(): PersistedAppState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedAppState;
    return Array.isArray(parsed.workflows) ? parsed : {};
  } catch {
    return {};
  }
}

function getUrlState() {
  const params = new URLSearchParams(window.location.search);
  const view: AppView | undefined = params.get("view") === "canvas" ? "canvas" : params.get("view") === "home" ? "home" : undefined;
  const workflow = params.get("workflow") ?? undefined;
  return { view, workflow };
}

function writeUrlState(appView: AppView, activeTemplateId: string) {
  const url = new URL(window.location.href);
  if (appView === "canvas") {
    url.searchParams.set("view", "canvas");
    url.searchParams.set("workflow", activeTemplateId);
  } else {
    url.searchParams.delete("view");
    url.searchParams.delete("workflow");
  }
  window.history.replaceState(null, "", url);
}

export default function App() {
  const [initialState] = useState(() => {
    const stored = readStoredAppState();
    const urlState = getUrlState();
    const workflows = stored.workflows?.length ? stored.workflows : templates;
    const activeTemplateId = urlState.workflow ?? stored.activeTemplateId ?? "showcase";
    const activeTemplate = workflows.find((item) => item.id === activeTemplateId) ?? workflows[0] ?? templates[0];
    const workflowDescription =
      urlState.workflow && urlState.workflow !== stored.activeTemplateId
        ? activeTemplate.description
        : stored.workflowDescription ?? activeTemplate.description;

    return {
      appView: urlState.view ?? stored.appView ?? "home",
      workflows,
      activeTemplateId: activeTemplate.id,
      workflowDescription,
      schemaSaved: stored.schemaSaved ?? false,
      nodePositions: stored.nodePositions ?? {}
    };
  });
  const [appView, setAppView] = useState<AppView>(initialState.appView);
  const [workflows, setWorkflows] = useState<Template[]>(initialState.workflows);
  const [activeTemplateId, setActiveTemplateId] = useState(initialState.activeTemplateId);
  const [workflowDescription, setWorkflowDescription] = useState(initialState.workflowDescription);
  const [selection, setSelection] = useState<Selection>({ type: "state" });
  const [configTarget, setConfigTarget] = useState<ConfigTarget | null>(null);
  const [schemaSaved, setSchemaSaved] = useState(initialState.schemaSaved);
  const [stateTab, setStateTab] = useState<StateTab>("Schema");
  const [searchTerm, setSearchTerm] = useState("");
  const [bottomOpen, setBottomOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomTab>("运行结果");
  const [runIndex, setRunIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [layoutPulse, setLayoutPulse] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [homeSidebarCollapsed, setHomeSidebarCollapsed] = useState(false);
  const [workflowViewMode, setWorkflowViewMode] = useState<WorkflowViewMode>("gallery");
  const [draggingPaletteNode, setDraggingPaletteNode] = useState<CreateNodePayload | null>(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>(initialState.nodePositions);

  const activeTemplate = useMemo(
    () => workflows.find((item) => item.id === activeTemplateId) ?? workflows[0] ?? templates[0],
    [activeTemplateId, workflows]
  );

  const activeRunItem = runIndex >= 0 ? activeTemplate.runOrder[runIndex] ?? "" : "";
  const configNode = configTarget?.type === "node" ? activeTemplate.nodes.find((item) => item.id === configTarget.id) : undefined;
  const configEdge = configTarget?.type === "edge" ? activeTemplate.edges.find((item) => item.id === configTarget.id) : undefined;

  useEffect(() => {
    writeUrlState(appView, activeTemplate.id);
  }, [activeTemplate.id, appView]);

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        workflows,
        activeTemplateId: activeTemplate.id,
        appView,
        workflowDescription,
        schemaSaved,
        nodePositions
      } satisfies PersistedAppState)
    );
  }, [activeTemplate.id, appView, nodePositions, schemaSaved, workflowDescription, workflows]);

  useEffect(() => {
    if (!isRunning) return;

    if (runIndex >= activeTemplate.runOrder.length - 1) {
      setIsRunning(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setRunIndex((value) => value + 1);
    }, 760);

    return () => window.clearTimeout(timer);
  }, [isRunning, runIndex, activeTemplate.runOrder.length]);

  useEffect(() => {
    if (!draggingPaletteNode) return;

    function clearDraggingNode() {
      window.setTimeout(() => setDraggingPaletteNode(null), 0);
    }

    window.addEventListener("mouseup", clearDraggingNode);
    return () => window.removeEventListener("mouseup", clearDraggingNode);
  }, [draggingPaletteNode]);

  function switchTemplate(templateId: string) {
    const nextTemplate = workflows.find((item) => item.id === templateId) ?? templates.find((item) => item.id === templateId) ?? templates[0];
    setActiveTemplateId(templateId);
    setWorkflowDescription(nextTemplate.description);
    setSelection({ type: "workflow" });
    setConfigTarget(null);
    setRunIndex(-1);
    setIsRunning(false);
    setBottomOpen(false);
    setNodePositions({});
  }

  function openWorkflow(templateId: string) {
    switchTemplate(templateId);
    setAppView("canvas");
  }

  function createWorkflow() {
    const nextWorkflow = createBlankWorkflow(getUniqueWorkflowName("新建工作流", workflows));
    setWorkflows((items) => [nextWorkflow, ...items]);
    setActiveTemplateId(nextWorkflow.id);
    setWorkflowDescription(nextWorkflow.description);
    setSchemaSaved(false);
    setStateTab("Schema");
    setSelection({ type: "workflow" });
    setConfigTarget(null);
    setRunIndex(-1);
    setIsRunning(false);
    setBottomOpen(false);
    setNodePositions({});
    setAppView("canvas");
  }

  function renameActiveWorkflow(nextName: string) {
    const uniqueName = getUniqueWorkflowName(nextName, workflows, activeTemplate.id);
    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              name: uniqueName
            }
          : item
      )
    );
  }

  function createCanvasNode(payload: CreateNodePayload) {
    const currentNodeCount = activeTemplate.nodes.length;
    const nextNode = createPaletteNode(payload, currentNodeCount, activeTemplate.nodes);
    setDraggingPaletteNode(null);
    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: [...item.nodes, nextNode]
            }
          : item
      )
    );
    setNodePositions((items) => ({ ...items, [nextNode.id]: { x: nextNode.x, y: nextNode.y } }));
    setSelection({ type: "node", id: nextNode.id });
    setConfigTarget(null);
  }

  function quickAddCanvasNode(sourceId: string, side: EdgeSide, payload: Pick<CreateNodePayload, "label" | "kind">) {
    const sourceNode = activeTemplate.nodes.find((item) => item.id === sourceId);
    if (!sourceNode) return;

    const draftNode = createPaletteNode(payload, activeTemplate.nodes.length, activeTemplate.nodes);
    const sourcePosition = getNodeCanvasPosition(sourceNode, nodePositions);
    const sourceSize = getNodeCanvasSize(sourceNode);
    const targetSize = getNodeCanvasSize(draftNode);
    const gap = 92;
    const centerX = sourcePosition.x + sourceSize.width / 2;
    const centerY = sourcePosition.y + sourceSize.height / 2;
    const nextPosition =
      side === "right"
        ? { x: sourcePosition.x + sourceSize.width + gap, y: centerY - targetSize.height / 2 }
        : side === "left"
          ? { x: sourcePosition.x - targetSize.width - gap, y: centerY - targetSize.height / 2 }
          : side === "bottom"
            ? { x: centerX - targetSize.width / 2, y: sourcePosition.y + sourceSize.height + gap }
            : { x: centerX - targetSize.width / 2, y: sourcePosition.y - targetSize.height - gap };
    const nextNode = {
      ...draftNode,
      x: nextPosition.x,
      y: nextPosition.y
    };
    const edgeLabel = sourceNode.kind === "router" || sourceNode.kind === "loop" ? `branch-${Date.now().toString().slice(-4)}` : getEdgeDefaults().label;
    const nextEdge = edge(
      `edge-${sourceId}-${nextNode.id}-${Date.now()}`,
      sourceId,
      nextNode.id,
      edgeLabel,
      side,
      getOppositeSide(side)
    );

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: [
                ...item.nodes.map((nodeItem) =>
                  nodeItem.id === sourceId && isControlNode(nodeItem)
                    ? {
                        ...nodeItem,
                        control: {
                          branches: addBranch(getControlBranches(nodeItem, item), edgeLabel)
                        }
                      }
                    : nodeItem
                ),
                nextNode
              ],
              edges: [...item.edges, nextEdge]
            }
          : item
      )
    );
    setNodePositions((items) => ({ ...items, [nextNode.id]: nextPosition }));
    setSelection({ type: "node", id: nextNode.id });
    setConfigTarget(null);
  }

  function renameCanvasNode(nodeId: string, nextName: string): RenameNodeResult {
    const normalizedName = nextName.trim();
    if (!normalizedName) {
      return { ok: false, message: "名字不能为空。" };
    }

    const targetNode = activeTemplate.nodes.find((item) => item.id === nodeId);
    if (!targetNode) {
      return { ok: false, message: "节点不存在。" };
    }
    if (targetNode.kind === "system") {
      return { ok: false, message: "Start / End 节点名字固定。" };
    }
    if (targetNode.label === normalizedName && targetNode.id === normalizedName) {
      return { ok: true, name: normalizedName };
    }

    const duplicated = activeTemplate.nodes.some((item) => item.id !== nodeId && item.label === normalizedName);
    if (duplicated) {
      return { ok: false, message: "同一个画布中不能有两个同名节点。" };
    }

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: item.nodes.map((nodeItem) =>
                nodeItem.id === nodeId
                  ? {
                      ...nodeItem,
                      id: normalizedName,
                      label: normalizedName,
                      subtitle: `${getNodeKindLabel(nodeItem.kind)} / ${normalizedName}`
                    }
                  : nodeItem
              ),
              edges: item.edges.map((edgeItem) => ({
                ...edgeItem,
                from: edgeItem.from === nodeId ? normalizedName : edgeItem.from,
                to: edgeItem.to === nodeId ? normalizedName : edgeItem.to
              })),
              runOrder: item.runOrder.map((runItem) => (runItem === nodeId ? normalizedName : runItem))
            }
          : item
      )
    );
    setNodePositions((items) => {
      const next = { ...items };
      if (next[nodeId]) {
        next[normalizedName] = next[nodeId];
        delete next[nodeId];
      }
      return next;
    });
    setSelection((current) => (current.type === "node" && current.id === nodeId ? { type: "node", id: normalizedName } : current));
    setConfigTarget((current) => (current?.type === "node" && current.id === nodeId ? { type: "node", id: normalizedName } : current));

    return { ok: true, name: normalizedName };
  }

  function createCanvasEdge(connection: Connection) {
    if (!connection.source || !connection.target) return;

    const sourceNode = activeTemplate.nodes.find((item) => item.id === connection.source);
    const label = sourceNode && (sourceNode.kind === "router" || sourceNode.kind === "loop") ? `branch-${Date.now().toString().slice(-4)}` : getEdgeDefaults().label;
    const draftEdge = edge(
      `edge-${connection.source}-${connection.target}-${Date.now()}`,
      connection.source,
      connection.target,
      label,
      isEdgeSideHandle(connection.sourceHandle) ? connection.sourceHandle : undefined,
      isEdgeSideHandle(connection.targetHandle) ? connection.targetHandle : undefined
    );
    const handles =
      draftEdge.sourceHandle && draftEdge.targetHandle
        ? { sourceHandle: draftEdge.sourceHandle, targetHandle: draftEdge.targetHandle }
        : getAutoEdgeHandles(draftEdge, activeTemplate, nodePositions);
    const nextEdge = {
      ...draftEdge,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle
    };

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: isControlNode(item.nodes.find((nodeItem) => nodeItem.id === nextEdge.from))
                ? item.nodes.map((nodeItem) =>
                    nodeItem.id === nextEdge.from
                      ? {
                          ...nodeItem,
                          control: {
                            branches: addBranch(getControlBranches(nodeItem, item), nextEdge.label)
                          }
                        }
                      : nodeItem
                  )
                : item.nodes,
              edges: [...item.edges, nextEdge]
            }
          : item
      )
    );
    setSelection({ type: "edge", id: nextEdge.id });
    setConfigTarget(null);
  }

  function reconnectCanvasEdge(edgeId: string, connection: Connection) {
    if (!connection.source || !connection.target) return;

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? (() => {
              const previousEdge = item.edges.find((edgeItem) => edgeItem.id === edgeId);
              const nextSource = connection.source!;
              const nextEdges = item.edges.map((edgeItem) =>
                edgeItem.id === edgeId
                  ? {
                      ...edgeItem,
                      from: nextSource,
                      to: connection.target!,
                      sourceHandle: isEdgeSideHandle(connection.sourceHandle) ? connection.sourceHandle : edgeItem.sourceHandle,
                      targetHandle: isEdgeSideHandle(connection.targetHandle) ? connection.targetHandle : edgeItem.targetHandle
                    }
                  : edgeItem
              );

              return {
                ...item,
                nodes: previousEdge
                  ? item.nodes.map((nodeItem) => {
                      if (!isControlNode(nodeItem)) return nodeItem;

                      const branches = getControlBranches(nodeItem, item);
                      if (nodeItem.id === previousEdge.from && nodeItem.id !== nextSource) {
                        return {
                          ...nodeItem,
                          control: {
                            branches: branches.filter((branch) => branch !== previousEdge.label)
                          }
                        };
                      }
                      if (nodeItem.id === nextSource) {
                        return {
                          ...nodeItem,
                          control: {
                            branches: addBranch(branches, previousEdge.label)
                          }
                        };
                      }
                      return nodeItem;
                    })
                  : item.nodes,
                edges: nextEdges
              };
            })()
          : item
      )
    );
    setSelection({ type: "edge", id: edgeId });
  }

  function deleteCanvasEdge(edgeId: string) {
    const edgeToDelete = activeTemplate.edges.find((item) => item.id === edgeId);
    if (!edgeToDelete) return;

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: isControlNode(item.nodes.find((nodeItem) => nodeItem.id === edgeToDelete.from))
                ? item.nodes.map((nodeItem) =>
                    nodeItem.id === edgeToDelete.from
                      ? {
                          ...nodeItem,
                          control: {
                            branches: getControlBranches(nodeItem, item).filter((branch) => branch !== edgeToDelete.label)
                          }
                        }
                      : nodeItem
                  )
                : item.nodes,
              edges: item.edges.filter((edgeItem) => edgeItem.id !== edgeId),
              runOrder: item.runOrder.filter((runItem) => runItem !== edgeId)
            }
          : item
      )
    );
    setSelection({ type: "workflow" });
    setConfigTarget(null);
  }

  function updateCanvasEdge(edgeId: string, updates: Partial<Pick<FlowEdge, "label" | "sourceHandle" | "targetHandle">>) {
    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? (() => {
              const previousEdge = item.edges.find((edgeItem) => edgeItem.id === edgeId);
              const nextLabel = updates.label?.trim();
              return {
                ...item,
                nodes:
                  previousEdge && nextLabel && isControlNode(item.nodes.find((nodeItem) => nodeItem.id === previousEdge.from))
                    ? item.nodes.map((nodeItem) =>
                        nodeItem.id === previousEdge.from
                          ? {
                              ...nodeItem,
                              control: {
                                branches: getControlBranches(nodeItem, item).map((branch) => (branch === previousEdge.label ? nextLabel : branch))
                              }
                            }
                          : nodeItem
                      )
                    : item.nodes,
                edges: item.edges.map((edgeItem) =>
                  edgeItem.id === edgeId
                    ? {
                        ...edgeItem,
                        ...updates,
                        label: nextLabel ?? edgeItem.label
                      }
                    : edgeItem
                )
              };
            })()
          : item
      )
    );
  }

  function updateControlBranch(nodeId: string, branch: string, updates: { label?: string; target?: string }) {
    const nextLabel = updates.label?.trim() || branch;
    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: item.nodes.map((nodeItem) =>
                nodeItem.id === nodeId
                  ? {
                      ...nodeItem,
                      control: {
                        branches: getControlBranches(nodeItem, item).map((candidate) => (candidate === branch ? nextLabel : candidate))
                      }
                    }
                  : nodeItem
              ),
              edges: item.edges.map((edgeItem) =>
                edgeItem.from === nodeId && (edgeItem.label === branch || edgeItem.sourceHandle === branch)
                  ? (() => {
                      const nextEdge = {
                        ...edgeItem,
                        label: nextLabel,
                        to: updates.target ?? edgeItem.to
                      };
                      if (!updates.target) return nextEdge;

                      const handles = getAutoEdgeHandles(nextEdge, item, nodePositions);
                      return {
                        ...nextEdge,
                        sourceHandle: handles.sourceHandle,
                        targetHandle: handles.targetHandle
                      };
                    })()
                  : edgeItem
              )
            }
          : item
      )
    );
  }

  function addControlBranch(nodeId: string) {
    const sourceNode = activeTemplate.nodes.find((item) => item.id === nodeId);
    if (!sourceNode) return;

    const branches = getControlBranches(sourceNode, activeTemplate);
    const base = sourceNode.kind === "loop" ? (branches.includes("continue") ? "end" : "continue") : "branch";
    let index = 1;
    let label = base;
    while (branches.includes(label)) {
      index += 1;
      label = `${base}_${index}`;
    }
    const target = activeTemplate.nodes.find((item) => item.id === "end" && item.id !== nodeId) ?? activeTemplate.nodes.find((item) => item.id !== nodeId);
    if (!target) return;

    const draftEdge = edge(`edge-${nodeId}-${target.id}-${Date.now()}`, nodeId, target.id, label);
    const nextEdge = {
      ...draftEdge,
      ...getAutoEdgeHandles(draftEdge, activeTemplate, nodePositions)
    };
    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: item.nodes.map((nodeItem) =>
                nodeItem.id === nodeId
                  ? {
                      ...nodeItem,
                      control: {
                        branches: [...getControlBranches(nodeItem, item), label]
                      }
                    }
                  : nodeItem
              ),
              edges: [...item.edges, nextEdge]
            }
          : item
      )
    );
    setSelection({ type: "edge", id: nextEdge.id });
  }

  function deleteControlBranch(nodeId: string, branch: string) {
    const removedEdgeIds = activeTemplate.edges
      .filter((edgeItem) => edgeItem.from === nodeId && (edgeItem.label === branch || edgeItem.sourceHandle === branch))
      .map((edgeItem) => edgeItem.id);

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: item.nodes.map((nodeItem) =>
                nodeItem.id === nodeId
                  ? {
                      ...nodeItem,
                      control: {
                        branches: getControlBranches(nodeItem, item).filter((candidate) => candidate !== branch)
                      }
                    }
                  : nodeItem
              ),
              edges: item.edges.filter((edgeItem) => !(edgeItem.from === nodeId && (edgeItem.label === branch || edgeItem.sourceHandle === branch))),
              runOrder: item.runOrder.filter((runItem) => !removedEdgeIds.includes(runItem))
            }
          : item
      )
    );
  }

  function deleteCanvasNode(nodeId: string) {
    const nodeToDelete = activeTemplate.nodes.find((item) => item.id === nodeId);
    if (!nodeToDelete || nodeToDelete.kind === "system") return;
    const removedEdgeIds = activeTemplate.edges
      .filter((edgeItem) => edgeItem.from === nodeId || edgeItem.to === nodeId)
      .map((edgeItem) => edgeItem.id);

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: item.nodes.filter((nodeItem) => nodeItem.id !== nodeId),
              edges: item.edges.filter((edgeItem) => edgeItem.from !== nodeId && edgeItem.to !== nodeId),
              runOrder: item.runOrder.filter((runItem) => runItem !== nodeId && !removedEdgeIds.includes(runItem))
            }
          : item
      )
    );
    setNodePositions((items) => {
      const next = { ...items };
      delete next[nodeId];
      return next;
    });
    setSelection({ type: "workflow" });
    setConfigTarget(null);
  }

  function deleteWorkflow(workflowId: string) {
    const target = workflows.find((item) => item.id === workflowId);
    if (!target || !target.id.startsWith("blank-")) return;

    const remaining = workflows.filter((item) => item.id !== workflowId);
    const fallback = remaining[0] ?? templates[0];
    setWorkflows(remaining.length ? remaining : [fallback]);

    if (activeTemplateId === workflowId) {
      setActiveTemplateId(fallback.id);
      setWorkflowDescription(fallback.description);
      setSelection({ type: "workflow" });
      setConfigTarget(null);
      setRunIndex(-1);
      setIsRunning(false);
      setBottomOpen(false);
      setNodePositions({});
    }
  }

  function returnHome() {
    setAppView("home");
    setIsRunning(false);
    setBottomOpen(false);
    setConfigTarget(null);
    setCodeModalOpen(false);
  }

  function generateWorkflowFromDescription() {
    const nextTemplateId = inferTemplateIdFromDescription(workflowDescription);
    setActiveTemplateId(nextTemplateId);
    setSchemaSaved(true);
    setStateTab("Schema");
    setSelection({ type: "workflow" });
    setConfigTarget(null);
    setRunIndex(-1);
    setIsRunning(false);
    setBottomOpen(false);
    setNodePositions({});
    setLayoutPulse(true);
    window.setTimeout(() => setLayoutPulse(false), 720);
  }

  function runFlow() {
    if (!schemaSaved) {
      setSelection({ type: "state" });
      setStateTab("Schema");
      setRightCollapsed(false);
      return;
    }
    setBottomOpen(true);
    setActiveTab("执行轨迹");
    setStateTab("历史记录");
    setRightCollapsed(false);
    setRunIndex(0);
    setIsRunning(true);
  }

  function stepFlow() {
    if (!schemaSaved) {
      setSelection({ type: "state" });
      setStateTab("Schema");
      setRightCollapsed(false);
      return;
    }
    setBottomOpen(true);
    setActiveTab("执行轨迹");
    setStateTab("历史记录");
    setRightCollapsed(false);
    setIsRunning(false);
    setRunIndex((value) => (value + 1 >= activeTemplate.runOrder.length ? 0 : value + 1));
  }

  function showCode() {
    setCodeModalOpen(true);
  }

  function autoLayout() {
    setLayoutPulse(true);
    window.setTimeout(() => setLayoutPulse(false), 720);
  }

  const filteredPalette = nodePalette.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.includes(searchTerm.trim()))
  }));

  if (appView === "home") {
    return (
      <main className="app-shell">
        <div className="workspace-glow" aria-hidden="true" />
        <HomePage
          collapsed={homeSidebarCollapsed}
          viewMode={workflowViewMode}
          workflows={workflows}
          activeTemplateId={activeTemplateId}
          onCollapsed={setHomeSidebarCollapsed}
          onViewMode={setWorkflowViewMode}
          onOpenWorkflow={openWorkflow}
          onCreateWorkflow={createWorkflow}
          onDeleteWorkflow={deleteWorkflow}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="workspace-glow" aria-hidden="true" />
      <Canvas
        template={activeTemplate}
        workflowDescription={workflowDescription}
        activeRunItem={activeRunItem}
        selection={selection}
        schemaSaved={schemaSaved}
        layoutPulse={layoutPulse}
        nodePositions={nodePositions}
        onNodePositions={setNodePositions}
        onSelect={setSelection}
        onOpenConfig={setConfigTarget}
        onCloseConfig={() => setConfigTarget(null)}
        onWorkflowDescription={setWorkflowDescription}
        onGenerateWorkflow={generateWorkflowFromDescription}
        onCreateNode={createCanvasNode}
        onCreateEdge={createCanvasEdge}
        onReconnectEdge={reconnectCanvasEdge}
        onQuickAddNode={quickAddCanvasNode}
        draggingPaletteNode={draggingPaletteNode}
        onFinishNodeDrag={() => setDraggingPaletteNode(null)}
        onDeleteNode={deleteCanvasNode}
        onDeleteEdge={deleteCanvasEdge}
      />
      <Topbar
        template={activeTemplate}
        workflowName={activeTemplate.name}
        schemaSaved={schemaSaved}
        isRunning={isRunning}
        onBack={returnHome}
        onRenameWorkflow={renameActiveWorkflow}
        onRun={runFlow}
        onStep={stepFlow}
        onShowCode={showCode}
        onAutoLayout={autoLayout}
      />

      <Sidebar
        collapsed={leftCollapsed}
        onCollapsed={setLeftCollapsed}
        searchTerm={searchTerm}
        onSearch={setSearchTerm}
        filteredPalette={filteredPalette}
        activeTemplateId={activeTemplateId}
        onTemplate={switchTemplate}
        onCreateNode={createCanvasNode}
        onStartNodeDrag={setDraggingPaletteNode}
      />

      <Inspector
        collapsed={rightCollapsed}
        onCollapsed={setRightCollapsed}
        activeTab={stateTab}
        onTab={setStateTab}
        schemaSaved={schemaSaved}
        template={activeTemplate}
        runIndex={runIndex}
        activeRunItem={activeRunItem}
        onSaveSchema={() => setSchemaSaved(true)}
      />

      <ConfigPopover
        target={configTarget}
        node={configNode}
        edge={configEdge}
        activeRunItem={activeRunItem}
        onDeleteNode={deleteCanvasNode}
        onDeleteEdge={deleteCanvasEdge}
        onRenameNode={renameCanvasNode}
        onUpdateEdge={updateCanvasEdge}
        onAddControlBranch={addControlBranch}
        onUpdateControlBranch={updateControlBranch}
        onDeleteControlBranch={deleteControlBranch}
        template={activeTemplate}
        onClose={() => setConfigTarget(null)}
      />

      <CodeModal open={codeModalOpen} template={activeTemplate} onClose={() => setCodeModalOpen(false)} />

      <RunPanel
        open={bottomOpen}
        activeTab={activeTab}
        template={activeTemplate}
        runIndex={runIndex}
        onToggle={() => setBottomOpen((value) => !value)}
        onTab={setActiveTab}
      />
    </main>
  );
}

function HomePage({
  collapsed,
  viewMode,
  workflows,
  activeTemplateId,
  onCollapsed,
  onViewMode,
  onOpenWorkflow,
  onCreateWorkflow,
  onDeleteWorkflow
}: {
  collapsed: boolean;
  viewMode: WorkflowViewMode;
  workflows: Template[];
  activeTemplateId: string;
  onCollapsed: (value: boolean) => void;
  onViewMode: (value: WorkflowViewMode) => void;
  onOpenWorkflow: (templateId: string) => void;
  onCreateWorkflow: () => void;
  onDeleteWorkflow: (templateId: string) => void;
}) {
  return (
    <div className={`home-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="home-sidebar glass">
        <div className="home-brand">
          <button className="brand-mark home-collapse" onClick={() => onCollapsed(!collapsed)} aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}>
            <Network className="collapse-logo" size={20} />
            <ChevronRight className="collapse-expand" size={18} />
            <ChevronLeft className="collapse-fold" size={18} />
          </button>
          {!collapsed ? (
            <div>
              <div className="eyebrow">EduFlow</div>
              <h1>工作台</h1>
            </div>
          ) : null}
        </div>

        <nav className="home-nav" aria-label="主页导航">
          <button className="home-nav-item active" aria-current="page">
            <Layers3 size={18} />
            {!collapsed ? <span>工作流</span> : null}
          </button>
        </nav>
      </aside>

      <section className="home-main">
        <header className="home-header glass">
          <div>
            <div className="eyebrow">WORKFLOWS</div>
            <h2>工作流画布</h2>
            <p>查看已经创建的教学工作流原型，选择一个画布继续编辑和演示。</p>
          </div>
          <div className="home-header-actions">
            <button className="create-workflow-button" onClick={onCreateWorkflow} aria-label="创建空白画布">
              <Plus size={18} />
            </button>
            <div className="view-switch" aria-label="工作流展示方式">
              <button className={viewMode === "gallery" ? "active" : ""} onClick={() => onViewMode("gallery")}>
                <Grid2X2 size={16} />
                画廊
              </button>
              <button className={viewMode === "list" ? "active" : ""} onClick={() => onViewMode("list")}>
                <List size={16} />
                列表
              </button>
            </div>
          </div>
        </header>

        <div className={`workflow-library ${viewMode}`}>
          {workflows.map((template) => (
            <article
              key={template.id}
              className={`workflow-entry glass ${activeTemplateId === template.id ? "active" : ""}`}
            >
              <button className="workflow-open-button" onClick={() => onOpenWorkflow(template.id)}>
                <WorkflowPreview template={template} />
                <div className="workflow-entry-copy">
                  <div>
                    <span>{template.name}</span>
                    <p>{template.description}</p>
                  </div>
                  <small>
                    {template.nodes.filter((item) => item.kind !== "system").length} 节点 · {template.edges.length} 边
                  </small>
                </div>
                <ArrowRight size={18} />
              </button>
              {template.id.startsWith("blank-") ? (
                <button className="workflow-delete-button" onClick={() => onDeleteWorkflow(template.id)} aria-label={`删除${template.name}`}>
                  <Trash2 size={16} />
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function WorkflowPreview({ template }: { template: Template }) {
  const visibleNodes = template.nodes.slice(0, 5);
  const left = Math.min(...visibleNodes.map((item) => item.x));
  const top = Math.min(...visibleNodes.map((item) => item.y));
  const width = Math.max(1, Math.max(...visibleNodes.map((item) => item.x)) - left);
  const height = Math.max(1, Math.max(...visibleNodes.map((item) => item.y)) - top);

  return (
    <div className="workflow-preview" aria-hidden="true">
      <div className="preview-grid" />
      {template.edges.slice(0, 5).map((item) => {
        const from = visibleNodes.find((nodeItem) => nodeItem.id === item.from);
        const to = visibleNodes.find((nodeItem) => nodeItem.id === item.to);
        if (!from || !to) return null;

        const x1 = 18 + ((from.x - left) / width) * 144;
        const y1 = 20 + ((from.y - top) / height) * 74;
        const x2 = 18 + ((to.x - left) / width) * 144;
        const y2 = 20 + ((to.y - top) / height) * 74;
        return (
          <span
            key={item.id}
            className={`preview-edge ${item.kind}`}
            style={{
              left: `${Math.min(x1, x2)}px`,
              top: `${Math.min(y1, y2)}px`,
              width: `${Math.max(24, Math.abs(x2 - x1))}px`
            }}
          />
        );
      })}
      {visibleNodes.map((item) => (
        <span
          key={item.id}
          className={`preview-node ${item.kind}`}
          style={{
            left: `${18 + ((item.x - left) / width) * 144}px`,
            top: `${20 + ((item.y - top) / height) * 74}px`
          }}
        />
      ))}
    </div>
  );
}

function Topbar({
  template,
  workflowName,
  schemaSaved,
  isRunning,
  onBack,
  onRenameWorkflow,
  onRun,
  onStep,
  onShowCode,
  onAutoLayout
}: {
  template: Template;
  workflowName: string;
  schemaSaved: boolean;
  isRunning: boolean;
  onBack: () => void;
  onRenameWorkflow: (value: string) => void;
  onRun: () => void;
  onStep: () => void;
  onShowCode: () => void;
  onAutoLayout: () => void;
}) {
  const [draftName, setDraftName] = useState(workflowName);

  useEffect(() => {
    setDraftName(workflowName);
  }, [workflowName]);

  function commitName() {
    const nextName = draftName.trim() || "新建工作流";
    onRenameWorkflow(nextName);
  }

  return (
    <header className="topbar glass">
      <div className="brand-block">
        <button className="back-button" onClick={onBack} aria-label="返回主页">
          <ArrowLeft size={18} />
        </button>
        <div className="brand-mark">
          <Network size={20} />
        </div>
        <div>
          <div className="eyebrow">EduFlow</div>
          <input
            className="workflow-name-input"
            value={draftName}
            onBlur={commitName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                setDraftName(workflowName);
                event.currentTarget.blur();
              }
            }}
            aria-label="编辑工作流名称"
          />
        </div>
      </div>

      <WorkflowStatusPrompt template={template} schemaSaved={schemaSaved} />

      <nav className="toolbar-actions" aria-label="工作流操作">
        <button className="tool-button">
          <Settings2 size={16} />
          测试输入
        </button>
        <button className="tool-button primary" onClick={onRun}>
          {isRunning ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
          运行
        </button>
        <button className="tool-button" onClick={onStep}>
          <StepForward size={16} />
          单步运行
        </button>
        <button className="tool-button" onClick={onShowCode}>
          <Code2 size={16} />
          查看代码
        </button>
        <button className="tool-button" onClick={onAutoLayout}>
          <Wand2 size={16} />
          自动布局
        </button>
        <button className={`tool-button ${schemaSaved ? "saved" : ""}`}>
          {schemaSaved ? <Check size={16} /> : <Save size={16} />}
          保存
        </button>
      </nav>
    </header>
  );
}

function WorkflowStatusPrompt({ template, schemaSaved }: { template: Template; schemaSaved: boolean }) {
  const health = useMemo(() => getWorkflowHealth(template, schemaSaved), [template, schemaSaved]);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const open = pinnedOpen || hoverOpen;
  const Icon = health.status === "ready" ? Check : health.status === "warning" ? AlertTriangle : Square;

  return (
    <div
      className={`workflow-status ${health.status} ${open ? "open" : ""}`}
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
    >
      <button
        className="workflow-status-trigger"
        onClick={() => setPinnedOpen((value) => !value)}
        aria-expanded={open}
        aria-label="查看工作流状态提示"
      >
        <Icon size={16} />
        <span>{health.summary}</span>
      </button>

      {open && (
        <div className="workflow-status-popover glass">
          <div className={`workflow-status-guidance ${health.status}`}>
            <Sparkles size={16} />
            <span>{health.guidance}</span>
          </div>
          <div className="workflow-status-checks">
            {health.checks.map((item) => (
              <StatusLine key={item.label} ok={item.ok} label={item.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CodeModal({ open, template, onClose }: { open: boolean; template: Template; onClose: () => void }) {
  const files = useMemo(() => getWorkflowExportFiles(template), [template]);
  const [activePath, setActivePath] = useState(files[0]?.path ?? "");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const activeFile = files.find((file) => file.path === activePath) ?? files[0];
  const fileTree = useMemo(() => {
    const items: Array<{ type: "file"; file: CodeFile } | { type: "folder"; name: string; files: CodeFile[] }> = [];
    const folderIndex = new Map<string, number>();

    files.forEach((file) => {
      const [folderName, ...restPath] = file.path.split("/");
      if (!restPath.length) {
        items.push({ type: "file", file });
        return;
      }

      if (!folderIndex.has(folderName)) {
        folderIndex.set(folderName, items.length);
        items.push({ type: "folder", name: folderName, files: [] });
      }

      const item = items[folderIndex.get(folderName) ?? -1];
      if (item?.type === "folder") {
        item.files.push(file);
      }
    });

    return items;
  }, [files]);

  useEffect(() => {
    if (open) {
      setActivePath(files[0]?.path ?? "");
      setOpenFolders(
        Object.fromEntries(
          fileTree.filter((item) => item.type === "folder").map((item) => [item.name, true])
        )
      );
    }
  }, [fileTree, files, open]);

  if (!open) return null;

  function closeFromBackdrop(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="code-modal-backdrop" onMouseDown={closeFromBackdrop}>
      <section className="code-modal glass" role="dialog" aria-modal="true" aria-label="当前工作流代码">
        <header className="code-modal-titlebar">
          <div className="code-modal-heading">
            <Code2 size={20} />
            <div>
              <h2>工作流代码</h2>
              <p>{template.name} · 只读 · 与导出代码一致</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭代码弹窗">
            <X size={20} />
          </button>
        </header>

        <div className="code-modal-body">
          <aside className="code-file-tree" aria-label="代码文件">
            <div className="file-tree-title">EXPLORER</div>
            {fileTree.map((item) => {
              if (item.type === "file") {
                return (
                  <button
                    key={item.file.path}
                    className={`code-tree-item file ${activeFile?.path === item.file.path ? "active" : ""}`}
                    onClick={() => setActivePath(item.file.path)}
                  >
                    <Code2 size={14} />
                    <span>{item.file.path}</span>
                  </button>
                );
              }

              const expanded = openFolders[item.name] ?? true;
              return (
                <div className="code-tree-folder" key={item.name}>
                  <button
                    className="code-tree-item folder"
                    onClick={() => setOpenFolders((value) => ({ ...value, [item.name]: !expanded }))}
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
                    <span>{item.name}</span>
                  </button>
                  {expanded ? (
                    <div className="code-tree-children">
                      {item.files.map((file) => (
                        <button
                          key={file.path}
                          className={`code-tree-item file child ${activeFile?.path === file.path ? "active" : ""}`}
                          onClick={() => setActivePath(file.path)}
                        >
                          <Code2 size={14} />
                          <span>{file.path.split("/").slice(1).join("/")}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </aside>

          <main className="code-editor-pane">
            <div className="code-tabbar">
              <span>{activeFile?.path}</span>
              <small>{activeFile?.title}</small>
            </div>
            <pre className="code-modal-code">{activeFile?.code}</pre>
          </main>
        </div>
      </section>
    </div>
  );
}

function Sidebar({
  collapsed,
  onCollapsed,
  searchTerm,
  onSearch,
  filteredPalette,
  activeTemplateId,
  onTemplate,
  onCreateNode,
  onStartNodeDrag
}: {
  collapsed: boolean;
  onCollapsed: (value: boolean) => void;
  searchTerm: string;
  onSearch: (value: string) => void;
  filteredPalette: typeof nodePalette;
  activeTemplateId: string;
  onTemplate: (templateId: string) => void;
  onCreateNode: (payload: CreateNodePayload) => void;
  onStartNodeDrag: (payload: CreateNodePayload) => void;
}) {
  if (collapsed) {
    return (
      <button className="floating-collapser left glass" onClick={() => onCollapsed(false)} aria-label="展开组件面板">
        <ChevronRight size={18} />
        <span>组件</span>
      </button>
    );
  }

  return (
    <aside className="sidebar floating-panel glass">
      <div className="panel-fixed-head">
        <div className="panel-heading">
          <span>组件</span>
          <button className="icon-button" onClick={() => onCollapsed(true)} aria-label="折叠组件面板">
            <ChevronLeft size={16} />
          </button>
        </div>

        <label className="search-box">
          <Search size={15} />
          <input value={searchTerm} onChange={(event) => onSearch(event.target.value)} placeholder="搜索节点..." />
        </label>
      </div>

      <div className="palette-scroll">
        {filteredPalette.map((group) => (
          <section className="palette-group" key={group.title}>
            <div className="group-title">
              <ChevronDown size={14} />
              <span>{group.title}</span>
            </div>
            <div className="palette-list">
              {group.items.map((item) => {
                const Icon = group.icon;
                const kind = getPaletteNodeKind(item);
                return (
                  <button
                    className="palette-item"
                    key={item}
                    draggable
                    onMouseDown={() => onStartNodeDrag({ label: item, kind })}
                    onClick={() => onCreateNode({ label: item, kind })}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/eduflow-node", JSON.stringify({ label: item, kind }));
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <Icon size={15} />
                    <span>{item}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <section className="palette-group">
          <div className="group-title">
            <ArrowRight size={14} />
            <span>连接边</span>
          </div>
          <div className="hint-box">
            <ArrowRight size={16} />
            <span>画布只保留一种 Edge。条件分支和循环请使用 Router Node / Loop Node 表达。</span>
          </div>
        </section>

        <section className="palette-group">
          <div className="group-title">
            <ChevronDown size={14} />
            <span>模板</span>
          </div>
          <div className="template-list">
            {templates.map((template) => (
              <button
                key={template.id}
                className={`template-card ${activeTemplateId === template.id ? "active" : ""}`}
                onClick={() => onTemplate(template.id)}
              >
                <span>{template.name}</span>
                <small>{template.description}</small>
              </button>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function Canvas({
  template,
  workflowDescription,
  activeRunItem,
  selection,
  schemaSaved,
  layoutPulse,
  nodePositions,
  onNodePositions,
  onSelect,
  onOpenConfig,
  onCloseConfig,
  onWorkflowDescription,
  onGenerateWorkflow,
  onCreateNode,
  onCreateEdge,
  onReconnectEdge,
  onQuickAddNode,
  draggingPaletteNode,
  onFinishNodeDrag,
  onDeleteNode,
  onDeleteEdge
}: {
  template: Template;
  workflowDescription: string;
  activeRunItem: string;
  selection: Selection;
  schemaSaved: boolean;
  layoutPulse: boolean;
  nodePositions: Record<string, { x: number; y: number }>;
  onNodePositions: (value: Record<string, { x: number; y: number }>) => void;
  onSelect: (selection: Selection) => void;
  onOpenConfig: (target: ConfigTarget) => void;
  onCloseConfig: () => void;
  onWorkflowDescription: (value: string) => void;
  onGenerateWorkflow: () => void;
  onCreateNode: (payload: CreateNodePayload) => void;
  onCreateEdge: (connection: Connection) => void;
  onReconnectEdge: (edgeId: string, connection: Connection) => void;
  onQuickAddNode: (sourceId: string, side: EdgeSide, payload: Pick<CreateNodePayload, "label" | "kind">) => void;
  draggingPaletteNode: CreateNodePayload | null;
  onFinishNodeDrag: () => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}) {
  const [descriptionCollapsed, setDescriptionCollapsed] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<ReactFlowNode<WorkflowNodeData>, ReactFlowEdge> | null>(null);
  const reactFlowNodes = useMemo<ReactFlowNode<WorkflowNodeData>[]>(
    () =>
      template.nodes.map((item) => {
        const { width, height } = getNodeCanvasSize(item);

        return {
          id: item.id,
          type: "workflow",
          position: nodePositions[item.id] ?? { x: item.x, y: item.y },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          width,
          height,
          measured: { width, height },
          style: { width, height },
          data: {
            node: item,
            active: activeRunItem === item.id,
            onQuickAdd: onQuickAddNode
          },
          selected: selection.type === "node" && selection.id === item.id
        };
      }),
    [activeRunItem, nodePositions, onQuickAddNode, selection, template.nodes]
  );

  const reactFlowEdges = useMemo<ReactFlowEdge[]>(
    () =>
      template.edges.map((item) => {
        const handles = getStoredOrInitialEdgeHandles(item, template);
        return {
          id: item.id,
          source: item.from,
          target: item.to,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          label: item.label,
          type: "default",
          animated: activeRunItem === item.id,
          selected: selection.type === "edge" && selection.id === item.id,
          className: `workflow-edge ${isControlOutletEdge(item, template) ? "control-outlet" : ""} ${activeRunItem === item.id ? "active" : ""}`,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18
          },
          style: {
            strokeWidth: activeRunItem === item.id ? 3 : 2
          }
        };
      }),
    [activeRunItem, selection, template]
  );

  function handleNodesChange(changes: NodeChange[]) {
    const removedIds = changes.filter((change) => change.type === "remove").map((change) => change.id);
    if (removedIds.length) {
      removedIds.forEach(onDeleteNode);
      return;
    }

    const nextNodes = applyNodeChanges(changes, reactFlowNodes);
    onNodePositions(Object.fromEntries(nextNodes.map((item) => [item.id, item.position])));
  }

  function handleEdgesChange(changes: EdgeChange[]) {
    const removedIds = changes.filter((change) => change.type === "remove").map((change) => change.id);
    if (removedIds.length) {
      removedIds.forEach(onDeleteEdge);
      return;
    }

    applyEdgeChanges(changes, reactFlowEdges);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (selection.type === "node") {
        onDeleteNode(selection.id);
        event.preventDefault();
        return;
      }
      if (selection.type === "edge") {
        onDeleteEdge(selection.id);
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDeleteEdge, onDeleteNode, selection]);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes("application/eduflow-node")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const rawNode = event.dataTransfer.getData("application/eduflow-node");
    if (!rawNode || !reactFlowInstance) return;

    event.preventDefault();
    const payload = JSON.parse(rawNode) as Pick<CreateNodePayload, "label" | "kind">;
    const dropPosition = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    });

    onCreateNode({
      ...payload,
      position: {
        x: dropPosition.x - 94,
        y: dropPosition.y - 64
      }
    });
    onFinishNodeDrag();
  }

  function handleCanvasMouseUp(event: ReactMouseEvent<HTMLDivElement>) {
    if (!draggingPaletteNode || !reactFlowInstance) return;

    const dropPosition = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    });

    onCreateNode({
      ...draggingPaletteNode,
      position: {
        x: dropPosition.x - 94,
        y: dropPosition.y - 64
      }
    });
    onFinishNodeDrag();
  }

  return (
    <section className={`canvas-shell ${layoutPulse ? "layout-pulse" : ""}`} onMouseUpCapture={handleCanvasMouseUp}>
      <ReactFlow
        key={template.id}
        nodes={reactFlowNodes}
        edges={reactFlowEdges}
        nodeTypes={nodeTypes}
        onInit={(instance) => setReactFlowInstance(instance as ReactFlowInstance<ReactFlowNode<WorkflowNodeData>, ReactFlowEdge>)}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onCreateEdge}
        onReconnect={(oldEdge, connection) => onReconnectEdge(oldEdge.id, connection)}
        connectionMode={ConnectionMode.Loose}
        edgesReconnectable
        onNodeClick={(_, nodeItem) => onSelect({ type: "node", id: nodeItem.id })}
        onNodeDoubleClick={(_, nodeItem) => onOpenConfig({ type: "node", id: nodeItem.id })}
        onEdgeClick={(_, edgeItem) => onSelect({ type: "edge", id: edgeItem.id })}
        onEdgeDoubleClick={(_, edgeItem) => onOpenConfig({ type: "edge", id: edgeItem.id })}
        onPaneClick={() => {
          onSelect({ type: "workflow" });
          onCloseConfig();
        }}
        fitView
        fitViewOptions={{ padding: 0.34, maxZoom: 1.2 }}
        minZoom={0.35}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="rgba(182, 193, 214, 0.48)" />
        <Controls position="bottom-right" />
        <MiniMap position="bottom-right" pannable zoomable />
      </ReactFlow>

      <div className={`canvas-toolbar glass ${descriptionCollapsed ? "collapsed" : ""}`}>
        <div className="description-head">
          <button className="description-toggle" onClick={() => setDescriptionCollapsed((value) => !value)} aria-expanded={!descriptionCollapsed}>
            <span className="canvas-title">工作流描述</span>
            {descriptionCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          {!descriptionCollapsed && (
            <button className="tool-button primary compact" onClick={onGenerateWorkflow}>
              <Wand2 size={15} />
              生成工作流和 Schema
            </button>
          )}
        </div>

        {!descriptionCollapsed && (
          <div className="workflow-description-editor">
            <textarea
              value={workflowDescription}
              onChange={(event) => onWorkflowDescription(event.target.value)}
              placeholder="描述你想生成的工作流，例如：根据用户输入做条件分支，summary 走摘要节点，rewrite 走改写节点。"
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function FlowNodeCard({
  data,
  selected
}: NodeProps<ReactFlowNode<WorkflowNodeData>>) {
  const { node, active, onQuickAdd } = data;
  const icon = node.kind === "router" || node.kind === "loop" ? <GitBranch size={17} /> : node.kind === "agent" || node.kind === "llm" ? <Bot size={17} /> : node.kind === "tool" || node.kind === "http" || node.kind === "database" || node.kind === "file" ? <Hammer size={17} /> : node.kind === "output" ? <TerminalSquare size={17} /> : <CircleDot size={17} />;

  if (node.kind === "system") {
    return (
      <div
        className={`system-node ${selected ? "selected" : ""} ${active ? "active" : ""}`}
      >
        <PerimeterHandles nodeId={node.id} onQuickAdd={onQuickAdd} />
        {node.label}
      </div>
    );
  }

  return (
    <div
      className={`flow-node node-${node.kind} ${selected ? "selected" : ""} ${active ? "active" : ""}`}
    >
      <PerimeterHandles nodeId={node.id} onQuickAdd={onQuickAdd} />
      <div className="node-head">
        <span className="node-icon">{icon}</span>
        <span className="node-title">{node.label}</span>
        <span className="node-status">{active ? "运行中" : "就绪"}</span>
      </div>
      <div className="node-subtitle">{node.subtitle}</div>
      <div className="node-io">
        <span>读取：{node.reads.join(", ") || "-"}</span>
        <span>写入：{node.writes.join(", ") || "-"}</span>
      </div>
    </div>
  );
}

const quickAddOptions: Array<Pick<CreateNodePayload, "label" | "kind">> = [
  { label: "LLM Node", kind: "llm" },
  { label: "Tool Node", kind: "tool" },
  { label: "Router Node", kind: "router" }
];

function getQuickAddPreview(option: Pick<CreateNodePayload, "label" | "kind">) {
  const io = getDefaultNodeIO(option.kind, option.label);
  return {
    subtitle: getNodeKindLabel(option.kind),
    reads: io.reads.join(", ") || "-",
    writes: io.writes.join(", ") || "-"
  };
}

function PerimeterHandles({
  nodeId,
  onQuickAdd
}: {
  nodeId: string;
  onQuickAdd: (sourceId: string, side: EdgeSide, payload: Pick<CreateNodePayload, "label" | "kind">) => void;
}) {
  const [expandedSide, setExpandedSide] = useState<EdgeSide | null>(null);

  function handleQuickAdd(side: EdgeSide, payload: Pick<CreateNodePayload, "label" | "kind">) {
    onQuickAdd(nodeId, side, payload);
    setExpandedSide(null);
  }

  return (
    <>
      {edgeSides.map((side) => (
        <Handle key={side} id={side} type="source" position={sideToPosition(side)} className={`node-handle perimeter-handle handle-${side}`} />
      ))}
      {edgeSides.map((side) => (
        <div
          className={`quick-add-zone quick-add-${side} ${expandedSide === side ? "expanded" : ""}`}
          key={`quick-${side}`}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseLeave={() => setExpandedSide((value) => (value === side ? null : value))}
        >
          <button
            className="quick-add-plus"
            onClick={(event) => {
              event.stopPropagation();
              setExpandedSide((value) => (value === side ? null : side));
            }}
            aria-label="显示推荐路线"
          >
            <Plus size={13} />
          </button>
          {expandedSide === side && (
            <div className="route-options">
              <svg className="route-fan vertical-fan" viewBox="0 0 96 468" aria-hidden="true">
                <path d="M2 234 C 34 234 38 42 88 42" />
                <path d="M2 234 C 36 234 42 154 88 154" />
                <path d="M2 234 C 36 234 42 266 88 266" />
                <path d="M2 234 C 34 234 38 378 88 378" />
                <path className="route-fan-arrow" d="M88 42 L79 35 L79 49 Z" />
                <path className="route-fan-arrow" d="M88 154 L79 147 L79 161 Z" />
                <path className="route-fan-arrow" d="M88 266 L79 259 L79 273 Z" />
                <path className="route-fan-arrow" d="M88 378 L79 371 L79 385 Z" />
              </svg>
              <svg className="route-fan horizontal-fan" viewBox="0 0 806 96" aria-hidden="true">
                <path d="M403 2 C 403 34 94 38 94 88" />
                <path d="M403 2 C 403 36 300 42 300 88" />
                <path d="M403 2 C 403 36 506 42 506 88" />
                <path d="M403 2 C 403 34 712 38 712 88" />
                <path className="route-fan-arrow" d="M94 88 L87 79 L101 79 Z" />
                <path className="route-fan-arrow" d="M300 88 L293 79 L307 79 Z" />
                <path className="route-fan-arrow" d="M506 88 L499 79 L513 79 Z" />
                <path className="route-fan-arrow" d="M712 88 L705 79 L719 79 Z" />
              </svg>
              {[{ label: "Function Node", kind: "function" } as const, ...quickAddOptions].map((option) => (
                <button className="route-option" key={option.label} onClick={() => handleQuickAdd(side, option)}>
                  <span className={`route-node-card route-node-${option.kind}`}>
                    <span className="route-card-head">
                      <span className="route-card-icon">{option.kind === "router" ? <GitBranch size={15} /> : option.kind === "llm" ? <Bot size={15} /> : option.kind === "tool" ? <Hammer size={15} /> : <CircleDot size={15} />}</span>
                      <strong>{option.label}</strong>
                    </span>
                    <span className="route-card-subtitle">{getQuickAddPreview(option).subtitle}</span>
                    <span>读取：{getQuickAddPreview(option).reads}</span>
                    <span>写入：{getQuickAddPreview(option).writes}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function sideToPosition(side: EdgeSide) {
  if (side === "top") return Position.Top;
  if (side === "right") return Position.Right;
  if (side === "bottom") return Position.Bottom;
  return Position.Left;
}

const nodeTypes = {
  workflow: FlowNodeCard
};

function Inspector({
  collapsed,
  onCollapsed,
  activeTab,
  onTab,
  schemaSaved,
  template,
  runIndex,
  activeRunItem,
  onSaveSchema
}: {
  collapsed: boolean;
  onCollapsed: (value: boolean) => void;
  activeTab: StateTab;
  onTab: (tab: StateTab) => void;
  schemaSaved: boolean;
  template: Template;
  runIndex: number;
  activeRunItem: string;
  onSaveSchema: () => void;
}) {
  if (collapsed) {
    return (
      <button className="floating-collapser right glass" onClick={() => onCollapsed(false)} aria-label="展开配置面板">
        <ChevronLeft size={18} />
        <span>配置</span>
      </button>
    );
  }

  return (
    <aside className="inspector floating-panel glass">
      <button className="inspector-collapse icon-button" onClick={() => onCollapsed(true)} aria-label="折叠配置面板">
        <ChevronRight size={16} />
      </button>
      <div className="inspector-scroll">
        <StateInspector
          activeTab={activeTab}
          template={template}
          runIndex={runIndex}
          activeRunItem={activeRunItem}
          schemaSaved={schemaSaved}
          onSaveSchema={onSaveSchema}
          onTab={onTab}
        />
      </div>
    </aside>
  );
}

function StateInspector({
  activeTab,
  template,
  runIndex,
  activeRunItem,
  schemaSaved,
  onSaveSchema,
  onTab
}: {
  activeTab: StateTab;
  template: Template;
  runIndex: number;
  activeRunItem: string;
  schemaSaved: boolean;
  onSaveSchema: () => void;
  onTab: (tab: StateTab) => void;
}) {
  return (
    <div className="inspector-content">
      <div className="inspector-title">
        <Braces size={18} />
        <div>
          <h2>State 信息中心</h2>
          <p>State Schema、代码与每一步历史状态</p>
        </div>
      </div>

      <div className="state-tabs">
        {stateTabs.map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => onTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Schema" && (
        <>
          <div className="hint-box">
            <Sparkles size={16} />
            <span>顶部状态提示会显示当前下一步、完整性和可运行状态。这里保留 State Schema 配置入口。</span>
          </div>

          <div className="field-list">
            {schemaFields.map((field) => (
              <div className="field-row" key={field.name}>
                <div>
                  <strong>{field.name}</strong>
                  <span>{field.note}</span>
                </div>
                <em>{field.type}</em>
              </div>
            ))}
          </div>

          <button className="add-field">
            <Plus size={16} />
            添加字段
          </button>

          <button className={`save-schema ${schemaSaved ? "saved" : ""}`} onClick={onSaveSchema}>
            {schemaSaved ? <Check size={17} /> : <Save size={17} />}
            {schemaSaved ? "State Schema 已保存" : "保存 State Schema"}
          </button>
        </>
      )}

      {activeTab === "代码" && <InspectorCode title="State 代码" code={getStateCode()} />}
      {activeTab === "历史记录" && <StateHistory template={template} runIndex={runIndex} activeRunItem={activeRunItem} />}
    </div>
  );
}

function getWorkflowHealth(template: Template, schemaSaved: boolean): WorkflowHealthSummary {
  const startCount = template.nodes.filter((item) => item.id === "start").length;
  const endCount = template.nodes.filter((item) => item.id === "end").length;
  const ids = template.nodes.map((item) => item.id);
  const names = template.nodes.map((item) => item.label);
  const uniqueIds = new Set(ids).size === ids.length;
  const uniqueNames = new Set(names).size === names.length;
  const missingIn = template.nodes.filter((nodeItem) => nodeItem.id !== "start" && !template.edges.some((edgeItem) => edgeItem.to === nodeItem.id));
  const missingOut = template.nodes.filter((nodeItem) => nodeItem.id !== "end" && !template.edges.some((edgeItem) => edgeItem.from === nodeItem.id));
  const multiOut = template.nodes.filter((nodeItem) => !["router", "loop", "system"].includes(nodeItem.kind) && template.edges.filter((edgeItem) => edgeItem.from === nodeItem.id).length > 1);
  const routersOk = template.nodes.filter((item) => item.kind === "router").every((item) => {
    const branches = getControlBranches(item, template);
    const connected = new Set(template.edges.filter((edgeItem) => edgeItem.from === item.id).map((edgeItem) => edgeItem.label));
    return branches.length >= 2 && branches.every((branch) => connected.has(branch));
  });
  const loopsOk = template.nodes.filter((item) => item.kind === "loop").every((item) => {
    const branches = getControlBranches(item, template);
    const connected = new Set(template.edges.filter((edgeItem) => edgeItem.from === item.id).map((edgeItem) => edgeItem.label));
    return branches.includes("continue") && (branches.includes("end") || branches.includes("exit")) && branches.every((branch) => connected.has(branch));
  });
  const checks: WorkflowHealthItem[] = [
    { ok: schemaSaved, label: schemaSaved ? "State Schema 已保存" : "缺少 State Schema" },
    { ok: startCount === 1, label: startCount === 1 ? "有且只有一个 Start 节点" : "需要有且只有一个 Start 节点" },
    { ok: endCount >= 1, label: endCount >= 1 ? "至少一个 End 节点" : "至少需要一个 End 节点" },
    { ok: uniqueIds && uniqueNames, label: uniqueIds && uniqueNames ? "节点名字和 ID 均唯一" : "节点名字或 ID 存在重复" },
    { ok: !missingIn.length, label: missingIn.length ? `${missingIn.length} 个非 Start 节点缺少入边` : "非 Start 节点均有入边" },
    { ok: !missingOut.length, label: missingOut.length ? `${missingOut.length} 个非 End 节点缺少出边` : "非 End 节点均有出边" },
    { ok: !multiOut.length, label: multiOut.length ? "普通执行节点存在多出口，建议改用 Router" : "普通执行节点出口清晰" },
    { ok: routersOk, label: "Router 出口与分支配置一致" },
    { ok: loopsOk, label: "Loop 出口与 continue/end 配置一致" }
  ];
  const failed = checks.filter((item) => !item.ok);
  const canRun = schemaSaved && failed.length === 0;
  const status: WorkflowStatusKind = canRun ? "ready" : schemaSaved ? "warning" : "blocked";
  const firstIssue = failed[0]?.label;
  const summary = canRun ? "工作流完整，可运行" : firstIssue ?? "工作流需要检查";
  const guidance = canRun
    ? "当前工作流结构完整，State Schema 已保存，可以运行或单步运行。"
    : "第一步：保存 State Schema。边只连接节点，条件分支和循环由 Router / Loop 节点表达。";

  return { status, summary, guidance, canRun, checks };
}

function StateHistory({ template, runIndex, activeRunItem }: { template: Template; runIndex: number; activeRunItem: string }) {
  const visibleSteps = runIndex < 0 ? [] : template.runOrder.slice(0, runIndex + 1);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenItems({});
  }, [template.id]);

  if (!visibleSteps.length) {
    return (
      <div className="hint-box">
        <Sparkles size={16} />
        <span>运行或单步运行后，这里会保存每一次 State 变化后的状态。</span>
      </div>
    );
  }

  return (
    <div className="state-history">
      {visibleSteps.map((itemId, index) => {
        const nodeItem = template.nodes.find((item) => item.id === itemId);
        const edgeItem = template.edges.find((item) => item.id === itemId);
        const key = `${itemId}-${index}`;
        const open = openItems[key] ?? index === visibleSteps.length - 1;
        const snapshot = createStateSnapshotForStep(template, itemId, index);

        return (
          <section className="history-item" key={key}>
            <button className="history-toggle" onClick={() => setOpenItems((items) => ({ ...items, [key]: !open }))} aria-expanded={open}>
              <div>
                <strong>{index + 1}. {nodeItem?.label ?? edgeItem?.label ?? itemId}</strong>
                <span>{itemId === activeRunItem ? "当前步骤" : nodeItem ? "节点执行后" : "边通过后"}</span>
              </div>
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {open && <pre className="code-view">{formatJson(snapshot)}</pre>}
          </section>
        );
      })}
    </div>
  );
}

function ConfigPopover({
  target,
  template,
  node,
  edge,
  activeRunItem,
  onDeleteNode,
  onDeleteEdge,
  onRenameNode,
  onUpdateEdge,
  onAddControlBranch,
  onUpdateControlBranch,
  onDeleteControlBranch,
  onClose
}: {
  target: ConfigTarget | null;
  template: Template;
  node?: FlowNode;
  edge?: FlowEdge;
  activeRunItem: string;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onRenameNode: (nodeId: string, nextName: string) => RenameNodeResult;
  onUpdateEdge: (edgeId: string, updates: Partial<Pick<FlowEdge, "label" | "sourceHandle" | "targetHandle">>) => void;
  onAddControlBranch: (nodeId: string) => void;
  onUpdateControlBranch: (nodeId: string, branch: string, updates: { label?: string; target?: string }) => void;
  onDeleteControlBranch: (nodeId: string, branch: string) => void;
  onClose: () => void;
}) {
  const expanded = target?.type === "node";
  const [position, setPosition] = useState<PopoverPosition>(() => getDefaultPopoverPosition(expanded));
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [nodeTab, setNodeTab] = useState<NodeWorkbenchTab>("配置");
  const [testInput, setTestInput] = useState("{}");
  const [testOutput, setTestOutput] = useState("");
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [testStatus, setTestStatus] = useState<NodeTestStatus>("idle");
  const [testError, setTestError] = useState("");
  const [testDuration, setTestDuration] = useState<number | null>(null);
  const [configuredReads, setConfiguredReads] = useState<string[]>([]);
  const [configuredWrites, setConfiguredWrites] = useState<string[]>([]);
  const [edgeLabelDraft, setEdgeLabelDraft] = useState("next");
  const [edgeCodeDraft, setEdgeCodeDraft] = useState("");
  const effectiveNode = node ? { ...node, reads: configuredReads, writes: configuredWrites } : undefined;

  useEffect(() => {
    if (target) {
      setPosition(clampPopoverPosition(getDefaultPopoverPosition(expanded), expanded));
      setDragState(null);
    }
  }, [expanded, target?.id, target]);

  useEffect(() => {
    if (!node) return;

    setConfiguredReads(node.reads);
    setConfiguredWrites(node.writes);
    setNodeTab("配置");
    setTestInput(formatJson(createNodeTestInput(node)));
    setTestOutput("");
    setTestLogs([]);
    setTestStatus("idle");
    setTestError("");
    setTestDuration(null);
  }, [node]);

  useEffect(() => {
    if (!edge) return;

    setEdgeLabelDraft(edge.label ?? "next");
    setEdgeCodeDraft(getEdgeCode(edge, template));
  }, [edge, template]);

  useEffect(() => {
    if (!dragState) return;
    const activeDrag = dragState;

    function handleMouseMove(event: MouseEvent) {
      setPosition(
        clampPopoverPosition(
          {
            x: event.clientX - activeDrag.x,
            y: event.clientY - activeDrag.y
          },
          expanded
        )
      );
    }

    function handleMouseUp() {
      setDragState(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, expanded]);

  if (!target || (!node && !edge)) return null;

  function resetNodeTestForFields(reads: string[], writes: string[]) {
    if (!node) return;

    setTestInput(formatJson(createNodeTestInput({ ...node, reads, writes })));
    setTestOutput("");
    setTestLogs([]);
    setTestStatus("idle");
    setTestError("");
    setTestDuration(null);
  }

  function updateConfiguredRead(index: number, field: string) {
    setConfiguredReads((items) => {
      const next = items.map((item, itemIndex) => (itemIndex === index ? field : item));
      resetNodeTestForFields(next, configuredWrites);
      return next;
    });
  }

  function updateConfiguredWrite(index: number, field: string) {
    setConfiguredWrites((items) => {
      const next = items.map((item, itemIndex) => (itemIndex === index ? field : item));
      resetNodeTestForFields(configuredReads, next);
      return next;
    });
  }

  function addConfiguredRead() {
    setConfiguredReads((items) => {
      const next = [...items, schemaFields.find((field) => !items.includes(field.name))?.name ?? schemaFields[0].name];
      resetNodeTestForFields(next, configuredWrites);
      return next;
    });
  }

  function addConfiguredWrite() {
    setConfiguredWrites((items) => {
      const next = [...items, schemaFields.find((field) => !items.includes(field.name))?.name ?? schemaFields[0].name];
      resetNodeTestForFields(configuredReads, next);
      return next;
    });
  }

  function removeConfiguredRead(index: number) {
    setConfiguredReads((items) => {
      const next = items.filter((_, itemIndex) => itemIndex !== index);
      resetNodeTestForFields(next, configuredWrites);
      return next;
    });
  }

  function removeConfiguredWrite(index: number) {
    setConfiguredWrites((items) => {
      const next = items.filter((_, itemIndex) => itemIndex !== index);
      resetNodeTestForFields(configuredReads, next);
      return next;
    });
  }

  function handleMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    const shell = event.currentTarget.parentElement;
    if (!shell || (event.target as HTMLElement).closest("button")) return;

    const rect = shell.getBoundingClientRect();
    setDragState({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });
    event.preventDefault();
  }

  function runNodeTest() {
    if (!effectiveNode || testStatus === "running") return;

    let parsedInput: Record<string, unknown>;
    try {
      const value = JSON.parse(testInput || "{}");
      parsedInput = value && typeof value === "object" && !Array.isArray(value) ? value : { value };
    } catch {
      setNodeTab("测试运行");
      setTestStatus("error");
      setTestError("输入 JSON 格式无效，请修正后重新运行。");
      setTestOutput("");
      setTestLogs(["解析输入失败，未执行节点逻辑。"]);
      setTestDuration(null);
      return;
    }

    setNodeTab("测试运行");
    setTestStatus("running");
    setTestError("");
    setTestOutput("");
    setTestLogs([`准备隔离运行 ${effectiveNode.label}`, "读取测试输入，不写入全局 State。"]);

    const startedAt = performance.now();
    window.setTimeout(() => {
      const output = createNodeTestOutput(effectiveNode, parsedInput);
      const duration = Math.max(18, Math.round(performance.now() - startedAt));
      setTestOutput(formatJson(output));
      setTestDuration(duration);
      setTestStatus("success");
      setTestLogs([
        `准备隔离运行 ${effectiveNode.label}`,
        `读取字段：${effectiveNode.reads.join(", ") || "-"}`,
        `写入字段：${effectiveNode.writes.length ? effectiveNode.writes.join(", ") : effectiveNode.kind === "system" ? "控制事件" : "-"}`,
        `完成测试运行，用时 ${duration}ms。`,
        "结果仅保存在当前浮窗，不会写入全局 State。"
      ]);
    }, 520);
  }

  function fillNodeTestFromCurrentState() {
    if (!effectiveNode) return;

    setTestInput(formatJson(createNodeTestInput(effectiveNode)));
    setTestOutput("");
    setTestLogs(["已用当前 State 值填充测试输入。"]);
    setTestStatus("idle");
    setTestError("");
    setTestDuration(null);
    setNodeTab("测试运行");
  }

  function refreshEdgeCode() {
    if (!edge) return;

    const label = edgeLabelDraft.trim() || "next";
    const nextEdge = {
      ...edge,
      label
    };

    onUpdateEdge(edge.id, {
      label: nextEdge.label
    });
    setEdgeCodeDraft(getEdgeCode(nextEdge, template));
  }

  return (
    <section className={`config-popover glass ${expanded ? "expanded" : ""}`} style={{ left: position.x, top: position.y }} aria-label="画布组件配置浮窗">
      <div
        className={`popover-head ${dragState ? "dragging" : ""}`}
        onMouseDown={handleMouseDown}
      >
        {effectiveNode ? (
          <>
            <div className="popover-title-block">
              <span>{effectiveNode.label}</span>
              <small>{getNodeKindLabel(effectiveNode.kind)} · {effectiveNode.subtitle}</small>
            </div>
            <div className="popover-actions">
              <span className={`workbench-status ${testStatus}`}>{testStatus === "running" ? "测试中" : testStatus === "success" ? "测试通过" : testStatus === "error" ? "测试失败" : activeRunItem === effectiveNode.id ? "整图运行中" : "就绪"}</span>
              {effectiveNode.kind !== "system" ? (
                <button className="icon-button danger" onClick={() => onDeleteNode(effectiveNode.id)} aria-label="删除节点">
                  <Trash2 size={15} />
                </button>
              ) : null}
              <button className="tool-button primary compact" onClick={runNodeTest}>
                {testStatus === "running" ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
                测试运行
              </button>
              <button className="icon-button" onClick={onClose} aria-label="关闭配置浮窗">
                <X size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <span>边配置</span>
            <div className="popover-actions">
              {edge ? (
                <button className="icon-button danger" onClick={() => onDeleteEdge(edge.id)} aria-label="删除边">
                  <Trash2 size={15} />
                </button>
              ) : null}
              <button className="icon-button" onClick={onClose} aria-label="关闭配置浮窗">
                <X size={16} />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="popover-scroll">
        {effectiveNode ? (
          <NodeInspector
            node={effectiveNode}
            activeRunItem={activeRunItem}
            activeTab={nodeTab}
            onTab={setNodeTab}
            onReadChange={updateConfiguredRead}
            onWriteChange={updateConfiguredWrite}
            onAddRead={addConfiguredRead}
            onAddWrite={addConfiguredWrite}
            onRemoveRead={removeConfiguredRead}
            onRemoveWrite={removeConfiguredWrite}
            testInput={testInput}
            onTestInput={setTestInput}
            testOutput={testOutput}
            testLogs={testLogs}
            testStatus={testStatus}
            testError={testError}
            testDuration={testDuration}
            onRunTest={runNodeTest}
            onFillCurrentState={fillNodeTestFromCurrentState}
            template={template}
            onRenameNode={onRenameNode}
            onAddControlBranch={onAddControlBranch}
            onUpdateControlBranch={onUpdateControlBranch}
            onDeleteControlBranch={onDeleteControlBranch}
          />
        ) : edge ? (
          <EdgeInspector
            edge={edge}
            template={template}
            labelDraft={edgeLabelDraft}
            codeDraft={edgeCodeDraft}
            onLabelDraft={setEdgeLabelDraft}
            onRefreshCode={refreshEdgeCode}
          />
        ) : null}
      </div>
    </section>
  );
}

function NodeInspector({
  node,
  activeRunItem,
  activeTab,
  onTab,
  onReadChange,
  onWriteChange,
  onAddRead,
  onAddWrite,
  onRemoveRead,
  onRemoveWrite,
  testInput,
  onTestInput,
  testOutput,
  testLogs,
  testStatus,
  testError,
  testDuration,
  onRunTest,
  onFillCurrentState,
  template,
  onRenameNode,
  onAddControlBranch,
  onUpdateControlBranch,
  onDeleteControlBranch
}: {
  node: FlowNode;
  activeRunItem: string;
  activeTab: NodeWorkbenchTab;
  onTab: (tab: NodeWorkbenchTab) => void;
  onReadChange: (index: number, field: string) => void;
  onWriteChange: (index: number, field: string) => void;
  onAddRead: () => void;
  onAddWrite: () => void;
  onRemoveRead: (index: number) => void;
  onRemoveWrite: (index: number) => void;
  testInput: string;
  onTestInput: (value: string) => void;
  testOutput: string;
  testLogs: string[];
  testStatus: NodeTestStatus;
  testError: string;
  testDuration: number | null;
  onRunTest: () => void;
  onFillCurrentState: () => void;
  template: Template;
  onRenameNode: (nodeId: string, nextName: string) => RenameNodeResult;
  onAddControlBranch: (nodeId: string) => void;
  onUpdateControlBranch: (nodeId: string, branch: string, updates: { label?: string; target?: string }) => void;
  onDeleteControlBranch: (nodeId: string, branch: string) => void;
}) {
  const [codeDraft, setCodeDraft] = useState(() => getNodeCode(node, template));
  const [codeCollapsed, setCodeCollapsed] = useState(false);
  const [nameDraft, setNameDraft] = useState(node.label);
  const [nameError, setNameError] = useState("");
  const [purposeDraft, setPurposeDraft] = useState(node.subtitle);
  const [logicDraft, setLogicDraft] = useState(node.logic);

  useEffect(() => {
    setNameDraft(node.label);
    setNameError("");
    setPurposeDraft(node.subtitle);
    setLogicDraft(node.logic);
    setCodeDraft(getNodeCode(node, template));
    setCodeCollapsed(false);
  }, [node.id, node.control, template]);

  function commitNodeName() {
    if (node.kind === "system") return;

    const result = onRenameNode(node.id, nameDraft);
    if (!result.ok) {
      setNameError(result.message ?? "名字不可用。");
      return;
    }
    setNameDraft(result.name ?? nameDraft.trim());
    setNameError("");
  }

  function generateCodeFromConfig() {
    setCodeDraft(getGeneratedNodeCode(node, purposeDraft, logicDraft));
    setCodeCollapsed(false);
  }

  return (
    <div className="node-workbench">
      <div className="workbench-tabs">
        {nodeWorkbenchTabs.map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => onTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "配置" && (
        <div className="config-stack">
          <label className="config-field">
            <span>名字</span>
            <input
              value={nameDraft}
              readOnly={node.kind === "system"}
              onChange={(event) => {
                setNameDraft(event.target.value);
                setNameError("");
              }}
              onBlur={commitNodeName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
            {nameError ? <small className="field-error">{nameError}</small> : <small>ID：{node.id}</small>}
          </label>

          <NodeTypeDetails
            node={node}
            template={template}
            onAddControlBranch={onAddControlBranch}
            onUpdateControlBranch={onUpdateControlBranch}
            onDeleteControlBranch={onDeleteControlBranch}
          />

          <div className="config-card purpose-card">
            <h3>目的</h3>
            <textarea
              className="config-textarea compact"
              value={purposeDraft}
              onChange={(event) => setPurposeDraft(event.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="config-card logic-card">
            <div className="card-title-row">
              <h3>逻辑</h3>
              <button className="tool-button compact" onClick={generateCodeFromConfig}>
                <Code2 size={14} />
                生成代码
              </button>
            </div>
            <textarea
              className="config-textarea"
              value={logicDraft}
              onChange={(event) => setLogicDraft(event.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="state-column-grid">
            <div className="config-card state-field-card">
              <h3>读取 State 字段</h3>
              <StateFieldSelector
                fields={node.reads}
                emptyLabel="暂不读取 State"
                onChange={onReadChange}
                onAdd={onAddRead}
                onRemove={onRemoveRead}
              />
            </div>
            <div className="config-card state-field-card">
              <h3>写入 State 字段</h3>
              <StateFieldSelector
                fields={node.writes}
                emptyLabel="暂不写入 State"
                onChange={onWriteChange}
                onAdd={onAddWrite}
                onRemove={onRemoveWrite}
              />
            </div>
          </div>

          <div className="code-editor-card">
            <button className="code-editor-toggle" onClick={() => setCodeCollapsed((value) => !value)} aria-expanded={!codeCollapsed}>
              <span className="code-heading">
                <Code2 size={15} />
                <span>代码查看和编辑</span>
              </span>
              {codeCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
            {!codeCollapsed && (
              <textarea className="code-editor" value={codeDraft} onChange={(event) => setCodeDraft(event.target.value)} spellCheck={false} />
            )}
          </div>
        </div>
      )}

      {activeTab === "测试运行" && (
        <NodeTestView
          node={node}
          input={testInput}
          output={testOutput}
          status={testStatus}
          error={testError}
          duration={testDuration}
          onInput={onTestInput}
          onRun={onRunTest}
          onFillCurrentState={onFillCurrentState}
        />
      )}
      {activeTab === "日志" && <NodeTestLogs logs={testLogs} status={testStatus} />}
    </div>
  );
}

function NodeTypeDetails({
  node,
  template,
  onAddControlBranch,
  onUpdateControlBranch,
  onDeleteControlBranch
}: {
  node: FlowNode;
  template: Template;
  onAddControlBranch: (nodeId: string) => void;
  onUpdateControlBranch: (nodeId: string, branch: string, updates: { label?: string; target?: string }) => void;
  onDeleteControlBranch: (nodeId: string, branch: string) => void;
}) {
  if (node.kind === "router") {
    const branches = getControlBranches(node);
    return (
      <div className="config-card">
        <h3>Router 配置</h3>
        <p>source node：classify_task</p>
        <p>route field：task_type</p>
        <ControlBranchEditor
          node={node}
          template={template}
          branches={branches}
          onAdd={onAddControlBranch}
          onUpdate={onUpdateControlBranch}
          onDelete={onDeleteControlBranch}
        />
        <p>default branch：{branches.includes("end") ? "end" : branches[branches.length - 1] ?? "-"}</p>
      </div>
    );
  }

  if (node.kind === "loop") {
    const branches = getControlBranches(node);
    return (
      <div className="config-card">
        <h3>Loop 配置</h3>
        <p>source node：agent</p>
        <p>condition field：should_continue</p>
        <ControlBranchEditor
          node={node}
          template={template}
          branches={branches}
          onAdd={onAddControlBranch}
          onUpdate={onUpdateControlBranch}
          onDelete={onDeleteControlBranch}
        />
        <p>continue branch：{branches.includes("continue") ? "continue" : "-"}</p>
        <p>exit branch：{branches.find((item) => item === "end" || item === "exit") ?? "-"}</p>
        <p>max iterations：5</p>
      </div>
    );
  }

  if (node.kind === "http") {
    return (
      <div className="config-card">
        <h3>第三方系统接入</h3>
        <p>method：POST</p>
        <p>url：SEARCH_API_URL</p>
        <p>secret：SEARCH_API_KEY</p>
        <p>timeout：30s · retry：2 · error strategy：raise</p>
      </div>
    );
  }

  if (node.kind === "database" || node.kind === "file") {
    return (
      <div className="config-card">
        <h3>外部数据源</h3>
        <p>{node.kind === "database" ? "database type：PostgreSQL" : "source type：local / cloud / s3 / drive"}</p>
        <p>input mapping：State 字段映射到请求参数</p>
        <p>output mapping：结果写回 State</p>
        <p>error strategy：raise / retry / fallback</p>
      </div>
    );
  }

  if (node.kind === "llm") {
    return (
      <div className="config-card">
        <h3>LLM 配置</h3>
        <p>model：gpt-4.1-mini</p>
        <p>system prompt：你是一个教学助手</p>
        <p>temperature：0.7</p>
      </div>
    );
  }

  if (node.kind === "system") {
    return (
      <div className="hint-box">
        <Sparkles size={16} />
        <span>{node.id === "start" ? "Start 只作为 START 入口存在，不生成函数代码。" : "End 只作为 END 结束标记存在，不生成函数代码。"}</span>
      </div>
    );
  }

  return null;
}

function ControlBranchEditor({
  node,
  template,
  branches,
  onAdd,
  onUpdate,
  onDelete
}: {
  node: FlowNode;
  template: Template;
  branches: string[];
  onAdd: (nodeId: string) => void;
  onUpdate: (nodeId: string, branch: string, updates: { label?: string; target?: string }) => void;
  onDelete: (nodeId: string, branch: string) => void;
}) {
  const nodeOptions = template.nodes.filter((item) => item.id !== node.id);

  return (
    <div className="control-branch-editor">
      <div className="control-branch-head">
        <span>配置边</span>
        <button className="tool-button compact" onClick={() => onAdd(node.id)}>
          <Plus size={14} />
          新增
        </button>
      </div>
      <div className="control-branch-list">
        {branches.length ? (
          branches.map((branch) => {
            const targetEdge = template.edges.find((edgeItem) => edgeItem.from === node.id && (edgeItem.label === branch || edgeItem.sourceHandle === branch));
            return (
              <div className="control-branch-row" key={branch}>
                <input value={branch} onChange={(event) => onUpdate(node.id, branch, { label: event.target.value })} aria-label="分支 label" />
                <select value={targetEdge?.to ?? ""} onChange={(event) => onUpdate(node.id, branch, { target: event.target.value })} aria-label="分支目标节点">
                  <option value="" disabled>
                    选择目标节点
                  </option>
                  {nodeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button className="icon-button danger" onClick={() => onDelete(node.id, branch)} aria-label="删除配置边">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        ) : (
          <div className="empty-field">暂无配置边。</div>
        )}
      </div>
    </div>
  );
}

function StateFieldSelector({
  fields,
  emptyLabel,
  onChange,
  onAdd,
  onRemove
}: {
  fields: string[];
  emptyLabel: string;
  onChange: (index: number, field: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="field-selector">
      <div className="field-selector-list">
        {fields.length ? (
          fields.map((field, index) => (
            <div className="field-select-row" key={`${field}-${index}`}>
              <select value={field} onChange={(event) => onChange(index, event.target.value)}>
                {schemaFields.map((schemaField) => (
                  <option key={schemaField.name} value={schemaField.name}>
                    {schemaField.name} · {schemaField.type}
                  </option>
                ))}
              </select>
              <button className="icon-button" onClick={() => onRemove(index)} aria-label="移除 State 字段">
                <X size={14} />
              </button>
            </div>
          ))
        ) : (
          <div className="empty-field">{emptyLabel}</div>
        )}
      </div>

      <button className="add-state-field" onClick={onAdd}>
        <Plus size={14} />
        添加字段
      </button>
    </div>
  );
}

function NodeTestView({
  node,
  input,
  output,
  status,
  error,
  duration,
  onInput,
  onRun,
  onFillCurrentState
}: {
  node: FlowNode;
  input: string;
  output: string;
  status: NodeTestStatus;
  error: string;
  duration: number | null;
  onInput: (value: string) => void;
  onRun: () => void;
  onFillCurrentState: () => void;
}) {
  const [inputOpen, setInputOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(true);
  const inputValues = parseJsonObject(input);
  const outputValues = output ? parseJsonObject(output) : { status: "waiting" };

  function updateInputField(field: string, value: string) {
    onInput(
      formatJson({
        ...inputValues,
        [field]: parseFormValue(value)
      })
    );
  }

  return (
    <div className="test-form-stack">
      <section className="test-form-panel">
        <button className="test-form-toggle" onClick={() => setInputOpen((value) => !value)} aria-expanded={inputOpen}>
          <div>
            <h3>测试输入</h3>
            <p>按读取 State 字段编辑临时输入。</p>
          </div>
          {inputOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {inputOpen && (
          <div className="test-form-body">
            <div className="test-actions">
              <button className="tool-button compact" onClick={onFillCurrentState}>填充当前 State</button>
              <button className="tool-button primary compact" onClick={onRun}>
                {status === "running" ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
                运行
              </button>
            </div>
            {node.reads.length ? (
              <div className="test-field-list">
                {node.reads.map((field) => (
                  <label className="test-form-field" key={field}>
                    <span>{field}</span>
                    <textarea
                      value={formatFormValue(inputValues[field])}
                      onChange={(event) => updateInputField(field, event.target.value)}
                      spellCheck={false}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <div className="empty-field">该节点不读取 State，测试输入为空。</div>
            )}
            {error && <div className="test-error">{error}</div>}
          </div>
        )}
      </section>

      <section className="test-form-panel">
        <button className="test-form-toggle" onClick={() => setOutputOpen((value) => !value)} aria-expanded={outputOpen}>
          <div>
            <h3>测试输出</h3>
            <p>{duration ? `执行耗时 ${duration}ms` : "运行后展示隔离输出。"}</p>
          </div>
          <span className={`workbench-status ${status}`}>{status === "running" ? "运行中" : status === "success" ? "成功" : status === "error" ? "失败" : "待运行"}</span>
          {outputOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {outputOpen && (
          <div className="test-form-body">
            <div className="test-field-list">
              {Object.entries(outputValues).map(([field, value]) => (
                <label className="test-form-field readonly" key={field}>
                  <span>{field}</span>
                  <textarea value={formatFormValue(value)} readOnly spellCheck={false} />
                </label>
              ))}
            </div>
            <div className="hint-box">
              <Sparkles size={16} />
              <span>单节点测试不会写入全局 State，也不会推进整图执行轨迹。</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function NodeTestLogs({ logs, status }: { logs: string[]; status: NodeTestStatus }) {
  const visibleLogs = logs.length ? logs : ["等待单节点测试运行。"];

  return (
    <div className="node-test-logs">
      {visibleLogs.map((log, index) => (
        <p key={`${log}-${index}`}>
          <span>[node-test:{String(index + 1).padStart(2, "0")}]</span>
          {log}
        </p>
      ))}
      {status === "running" && (
        <p>
          <span>[node-test:..]</span>
          节点隔离执行中...
        </p>
      )}
    </div>
  );
}

function EdgeInspector({
  edge,
  template,
  labelDraft,
  codeDraft,
  onLabelDraft,
  onRefreshCode
}: {
  edge: FlowEdge;
  template: Template;
  labelDraft: string;
  codeDraft: string;
  onLabelDraft: (value: string) => void;
  onRefreshCode: () => void;
}) {
  const source = template.nodes.find((item) => item.id === edge.from);
  const controlOutlet = isControlOutletEdge(edge, template);
  const compileOwner = source?.kind === "loop" ? "Loop Node" : "Router Node";

  return (
    <div className="inspector-content">
      <div className="inspector-title">
        <Route size={18} />
        <div>
          <h2>Edge 配置</h2>
          <p>唯一边类型：连接两个节点，不承载判断逻辑</p>
        </div>
      </div>

      <div className="config-card two-column">
        <div>
          <h3>来源节点</h3>
          <p>{edge.from}</p>
        </div>
        <div>
          <h3>目标节点</h3>
          <p>{edge.to}</p>
        </div>
      </div>
      <div className="config-card">
        <label className="edge-form-field">
          <span>label</span>
          <input value={labelDraft} onChange={(event) => onLabelDraft(event.target.value)} placeholder="next" />
        </label>
      </div>
      <div className="config-card two-column">
        <div>
          <h3>sourceHandle</h3>
          <p>{edge.sourceHandle ?? "-"}</p>
        </div>
        <div>
          <h3>targetHandle</h3>
          <p>{edge.targetHandle ?? "-"}</p>
        </div>
      </div>
      {controlOutlet && (
        <div className="hint-box warning">
          <Route size={16} />
          <span>该出口边被汇总进 {compileOwner} 的 add_conditional_edges()，不单独生成 add_edge()。</span>
        </div>
      )}

      <InspectorCode
        title={controlOutlet ? "Edge 配置 / 编译提示" : "Edge 代码"}
        code={codeDraft || getEdgeCode(edge, template)}
        action={
          <button className="icon-button" onClick={onRefreshCode} aria-label="根据边配置生成代码">
            <RefreshCcw size={15} />
          </button>
        }
      />
    </div>
  );
}

function WorkflowInspector({ template, schemaSaved }: { template: Template; schemaSaved: boolean }) {
  return (
    <div className="inspector-content">
      <div className="inspector-title">
        <Settings2 size={18} />
        <div>
          <h2>工作流配置</h2>
          <p>{template.name}</p>
        </div>
      </div>
      <div className="health-list">
        <StatusLine ok={schemaSaved} label="State Schema 已保存" />
        <StatusLine ok label="START 已连接" />
        <StatusLine ok label="END 可达" />
        <StatusLine ok={template.id !== "agent" || true} label="循环存在停止条件" />
      </div>
      <div className="config-card">
        <h3>全局运行设置</h3>
        <p>最大步数：20</p>
        <p>最大循环次数：5</p>
      </div>

      <InspectorCode title="Workflow 代码" code={template.code} />
    </div>
  );
}

function InspectorCode({ title, code, action }: { title: string; code: string; action?: ReactNode }) {
  return (
    <div className="inspector-code">
      <div className="code-heading">
        <div>
          <Code2 size={15} />
          <span>{title}</span>
        </div>
        {action}
      </div>
      <pre className="code-view">{code}</pre>
    </div>
  );
}

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`status-line ${ok ? "ok" : "error"}`}>
      {ok ? <Check size={15} /> : <Square size={15} />}
      <span>{label}</span>
    </div>
  );
}

function RunPanel({
  open,
  activeTab,
  template,
  runIndex,
  onToggle,
  onTab
}: {
  open: boolean;
  activeTab: BottomTab;
  template: Template;
  runIndex: number;
  onToggle: () => void;
  onTab: (tab: BottomTab) => void;
}) {
  return (
    <section className={`run-panel glass ${open ? "open" : ""}`}>
      <button className="run-panel-handle" onClick={onToggle}>
        <ListChecks size={16} />
        <span>运行面板</span>
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
      {open && (
        <>
          <div className="run-tabs">
            {bottomTabs.map((tab) => (
              <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => onTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          <div className="run-content">
            {activeTab === "运行结果" && <ResultView template={template} runIndex={runIndex} />}
            {activeTab === "执行轨迹" && <TraceView template={template} runIndex={runIndex} />}
            {activeTab === "节点日志" && <LogView template={template} runIndex={runIndex} />}
          </div>
        </>
      )}
    </section>
  );
}

function ResultView({ template, runIndex }: { template: Template; runIndex: number }) {
  return (
    <div className="result-card">
      <div className="result-icon">
        <Check size={22} />
      </div>
      <div>
        <h3>{runIndex >= template.runOrder.length - 1 ? "运行完成" : "等待运行完成"}</h3>
        <p>{template.result}</p>
      </div>
    </div>
  );
}

function StateSnapshot({ activeRunItem }: { activeRunItem: string }) {
  return (
    <div className="snapshot-grid">
      <pre>{`执行前 State:
{
  "user_input": "总结这份文件",
  "messages": [],
  "route_decision": "",
  "tool_result": ""
}`}</pre>
      <pre>{`执行后 State:
{
  "user_input": "总结这份文件",
  "messages": ["${activeRunItem || "ready"}"],
  "route_decision": "summary",
  "tool_result": "检索到 3 条相关资料",
  "final_answer": "已生成最终答案"
}`}</pre>
    </div>
  );
}

function StateDiff({ activeRunItem }: { activeRunItem: string }) {
  const rows = [
    { field: "messages", before: "[]", after: `["${activeRunItem || "ready"}"]`, status: "changed" },
    { field: "route_decision", before: "\"\"", after: "\"summary\"", status: "changed" },
    { field: "tool_result", before: "\"\"", after: "\"检索到 3 条相关资料\"", status: "changed" },
    { field: "final_answer", before: "undefined", after: "\"已生成最终答案\"", status: "added" }
  ];

  return (
    <div className="state-diff">
      {rows.map((row) => (
        <div className={`diff-row ${row.status}`} key={row.field}>
          <div>
            <strong>{row.field}</strong>
            <span>{row.status === "added" ? "新增字段" : "字段变化"}</span>
          </div>
          <code>{row.before}</code>
          <ArrowRight size={14} />
          <code>{row.after}</code>
        </div>
      ))}
    </div>
  );
}

function TraceView({ template, runIndex }: { template: Template; runIndex: number }) {
  const visible = runIndex < 0 ? [] : template.runOrder.slice(0, runIndex + 1);
  return (
    <div className="trace-view">
      {template.runOrder.map((item, index) => {
        const node = template.nodes.find((candidate) => candidate.id === item);
        const edgeItem = template.edges.find((candidate) => candidate.id === item);
        const active = index === runIndex;
        const done = visible.includes(item);
        return (
          <div key={`${item}-${index}`} className={`trace-row ${active ? "active" : ""} ${done ? "done" : ""}`}>
            <span>{index + 1}</span>
            <strong>{node?.label ?? edgeItem?.label ?? item}</strong>
            <em>{node ? `读取 ${node.reads.join(", ") || "-"}` : edgeItem?.label ?? "next"}</em>
            <small>{done ? (active ? "运行中" : "成功") : "等待"}</small>
          </div>
        );
      })}
    </div>
  );
}

function LogView({ template, runIndex }: { template: Template; runIndex: number }) {
  const visible = runIndex < 0 ? [] : template.runOrder.slice(0, runIndex + 1);
  return (
    <div className="log-view">
      {(visible.length ? visible : ["ready"]).map((item, index) => {
        const node = template.nodes.find((candidate) => candidate.id === item);
        const edgeItem = template.edges.find((candidate) => candidate.id === item);
        return (
          <p key={`${item}-${index}`}>
            <span>[10:21:{String(index + 5).padStart(2, "0")}]</span>
            {node ? `${node.label} 执行成功` : edgeItem ? `Edge ${edgeItem.label} 通过` : "等待运行"}
          </p>
        );
      })}
    </div>
  );
}
