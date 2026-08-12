import type { CodeFile, EdgeSide, FlowEdge, FlowNode, Template } from "../domain/types";
import { isEdgeSideHandle } from "../domain/graphOperations";
import type { PopoverPosition, PortDirection } from "./types";

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

export function getGraphCode(template: Template) {
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

export function getGenericWorkflowExportFiles(template: Template): CodeFile[] {
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
