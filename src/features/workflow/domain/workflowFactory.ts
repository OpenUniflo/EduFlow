import { getUniqueNodeName, node, systemNode } from "./graphOperations";
import type { CreateNodePayload, FlowNode, NodeKind, WorkflowDefinition } from "./types";

export function getUniqueWorkflowName(baseName: string, workflows: WorkflowDefinition[], excludeId?: string) {
  const normalized = baseName.trim() || "新建工作流";
  const usedNames = new Set(workflows.filter((item) => item.id !== excludeId).map((item) => item.name));
  if (!usedNames.has(normalized)) return normalized;
  let index = 2;
  while (usedNames.has(`${normalized} ${index}`)) index += 1;
  return `${normalized} ${index}`;
}

export function createBlankWorkflow(name: string, now = Date.now()): WorkflowDefinition {
  return {
    id: `blank-${now}`,
    name,
    description: "空白画布。可以先编辑工作流描述，再生成工作流和 Schema。",
    nodes: [systemNode("start", "START", 80, 220), systemNode("end", "END", 520, 220)],
    edges: [],
    runOrder: [],
    result: "尚未运行。",
    code: `graph = StateGraph(State)\ngraph.set_entry_point(START)\ngraph.add_edge(START, END)\napp = graph.compile()`
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

export function getNodeKindLabel(kind: NodeKind) {
  const labels: Record<NodeKind, string> = {
    system: "系统节点", function: "Function Node", transform: "State Transform Node", llm: "LLM Node",
    router: "Router Node", loop: "Loop Node", agent: "Agent 节点", tool: "Tool 节点", http: "HTTP API Node",
    database: "Database Node", file: "File / Cloud Drive Node", output: "输出节点"
  };
  return labels[kind];
}

export function createPaletteNode(payload: CreateNodePayload, index: number, existingNodes: FlowNode[] = []): FlowNode {
  const nodeName = getUniqueNodeName(payload.label, existingNodes);
  const position = payload.position ?? { x: 260 + (index % 4) * 52, y: 180 + (index % 5) * 44 };
  const io = getDefaultNodeIO(payload.kind, nodeName);
  return node(nodeName, nodeName, `${getNodeKindLabel(payload.kind)} / ${nodeName}`, payload.kind, position.x, position.y, io.reads, io.writes, `执行 ${nodeName} 的节点逻辑，可双击打开配置。`);
}

export function getEdgeDefaults() { return { label: "next" }; }
