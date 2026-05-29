import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Edge as ReactFlowEdge,
  type Node as ReactFlowNode,
  type NodeChange,
  type NodeProps
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Activity,
  ArrowRight,
  Bot,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Code2,
  GitBranch,
  Hammer,
  Layers3,
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
  Wand2
} from "lucide-react";

type NodeKind = "system" | "basic" | "control" | "agent" | "tool" | "output";
type EdgeKind = "normal" | "condition" | "loop";
type Selection =
  | { type: "state" }
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "workflow" };

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
  status?: "idle" | "running" | "success";
};

type FlowEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: EdgeKind;
  condition?: string;
};

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
};

const schemaFields: Field[] = [
  { name: "user_input", type: "string", defaultValue: "\"总结这份文件\"", note: "用户输入" },
  { name: "messages", type: "list", defaultValue: "[]", note: "对话 / 推理消息" },
  { name: "route_decision", type: "string", defaultValue: "\"\"", note: "分支结果" },
  { name: "tool_call", type: "object", defaultValue: "null", note: "工具调用请求" },
  { name: "tool_result", type: "string", defaultValue: "\"\"", note: "工具返回结果" },
  { name: "final_answer", type: "string", defaultValue: "\"\"", note: "最终输出" },
  { name: "loop_status", type: "enum", defaultValue: "\"need_tool\"", note: "Agent 循环状态" }
];

const templates: Template[] = [
  {
    id: "minimal",
    name: "最小工作流",
    description: "START 进入一个处理节点，写入 final_answer 后到 END。",
    nodes: [
      systemNode("start", "START", 50, 210),
      node("process", "Process Node", "基础节点 / 处理节点", "basic", 250, 180, ["user_input"], ["final_answer"], "读取 user_input，生成教学演示结果。"),
      systemNode("end", "END", 500, 210)
    ],
    edges: [
      edge("e1", "start", "process", "next", "normal"),
      edge("e2", "process", "end", "next", "normal")
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
      node("input", "Input Node", "基础节点 / 输入", "basic", 160, 95, ["user_input"], ["messages"], "接收测试输入并写入消息历史。"),
      node("read", "Read File Node", "基础节点 / 处理", "basic", 345, 95, ["user_input"], ["tool_result"], "模拟读取文件内容。"),
      node("summary", "Summary Node", "基础节点 / 处理", "basic", 345, 305, ["tool_result"], ["final_answer"], "读取文件内容并生成摘要。"),
      node("output", "Output Node", "基础节点 / 输出", "output", 510, 210, ["final_answer"], ["messages"], "整理最终输出并追加消息。"),
      systemNode("end", "END", 720, 210)
    ],
    edges: [
      edge("e1", "start", "input", "next", "normal"),
      edge("e2", "input", "read", "next", "normal"),
      edge("e3", "read", "summary", "next", "normal"),
      edge("e4", "summary", "output", "next", "normal"),
      edge("e5", "output", "end", "next", "normal")
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
    description: "Router 写入 route_decision，条件边决定后续路径。",
    nodes: [
      systemNode("start", "START", 40, 220),
      node("router", "Router Node", "控制节点 / Router", "control", 160, 190, ["user_input"], ["route_decision"], "判断用户意图并写入 route_decision。"),
      node("summary", "Summary Node", "基础节点 / 处理", "basic", 330, 90, ["user_input", "route_decision"], ["final_answer"], "当 route_decision 为 summary 时执行。"),
      node("rewrite", "Rewrite Node", "基础节点 / 处理", "basic", 330, 305, ["user_input", "route_decision"], ["final_answer"], "当 route_decision 为 rewrite 时执行。"),
      node("merge", "Merge Node", "控制节点 / 合并", "control", 505, 190, ["final_answer"], ["messages"], "合并分支输出。"),
      systemNode("end", "END", 720, 220)
    ],
    edges: [
      edge("e1", "start", "router", "next", "normal"),
      edge("e2", "router", "summary", "summary", "condition", "route_decision == \"summary\""),
      edge("e3", "router", "rewrite", "rewrite", "condition", "route_decision == \"rewrite\""),
      edge("e4", "summary", "merge", "next", "normal"),
      edge("e5", "rewrite", "merge", "next", "normal"),
      edge("e6", "merge", "end", "next", "normal")
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
    description: "Agent 根据 loop_status 决定调用 Tool 或结束。",
    nodes: [
      systemNode("start", "START", 40, 220),
      node("agent", "Agent Node", "Agent 节点 / Agent", "agent", 190, 185, ["user_input", "messages", "tool_result"], ["messages", "tool_call", "final_answer", "loop_status"], "判断是否需要工具，最多循环 5 次。"),
      node("tool", "Search Tool", "Agent 节点 / Tool", "tool", 405, 310, ["tool_call"], ["tool_result", "messages"], "根据 tool_call.query 模拟搜索并写回 tool_result。"),
      node("observe", "Observation Node", "Agent 节点 / Observation", "tool", 405, 95, ["tool_result"], ["messages", "loop_status"], "整理工具结果供 Agent 再次决策。"),
      systemNode("end", "END", 700, 220)
    ],
    edges: [
      edge("e1", "start", "agent", "next", "normal"),
      edge("e2", "agent", "tool", "need_tool", "condition", "loop_status == \"need_tool\""),
      edge("e3", "tool", "observe", "next", "normal"),
      edge("e4", "observe", "agent", "continue", "loop", "loop_status == \"continue\""),
      edge("e5", "agent", "end", "done", "condition", "loop_status == \"done\"")
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
  { title: "基础节点", items: ["普通节点", "输入节点", "输出节点", "处理节点"], icon: CircleDot },
  { title: "控制节点", items: ["Router 节点", "判断节点", "合并节点"], icon: GitBranch },
  { title: "Agent 节点", items: ["Agent 节点", "Tool 节点", "Observation 节点", "停止条件节点"], icon: Bot }
];

const edgePalette = [
  { label: "普通边", icon: ArrowRight },
  { label: "条件边", icon: Route },
  { label: "循环边", icon: RefreshCcw }
];

const bottomTabs = ["运行结果", "State 快照", "执行轨迹", "节点日志"] as const;
type BottomTab = (typeof bottomTabs)[number];

function node(id: string, label: string, subtitle: string, kind: NodeKind, x: number, y: number, reads: string[], writes: string[], logic: string): FlowNode {
  return { id, label, subtitle, kind, x, y, reads, writes, logic };
}

function systemNode(id: string, label: string, x: number, y: number): FlowNode {
  return { id, label, subtitle: "System", kind: "system", x, y, reads: [], writes: [], logic: "工作流系统节点。" };
}

function edge(id: string, from: string, to: string, label: string, kind: EdgeKind, condition?: string): FlowEdge {
  return { id, from, to, label, kind, condition };
}

function getStateCode() {
  return `class State(TypedDict):
${schemaFields
  .map((field) => {
    const typeMap: Record<string, string> = {
      string: "str",
      number: "float",
      boolean: "bool",
      list: "list",
      object: "dict",
      enum: "str"
    };
    return `    ${field.name}: ${typeMap[field.type] ?? "Any"}  # ${field.note}`;
  })
  .join("\n")}`;
}

function getNodeCode(node: FlowNode) {
  if (node.kind === "system") {
    return node.id === "start" ? "graph.set_entry_point(START)" : "graph.add_edge(previous_node, END)";
  }

  const fnName = node.label.toLowerCase().replace(/\s+/g, "_");
  return `def ${fnName}(state: State):
    # 读取: ${node.reads.join(", ") || "-"}
    # ${node.logic}
    return {
${node.writes.map((field) => `        "${field}": updated_${field}`).join(",\n")}
    }

graph.add_node("${fnName}", ${fnName})`;
}

function getEdgeCode(edge: FlowEdge) {
  if (edge.kind === "normal") {
    return `graph.add_edge("${edge.from}", "${edge.to}")`;
  }

  if (edge.kind === "condition") {
    return `graph.add_conditional_edges(
    "${edge.from}",
    route_by_state,
    {"${edge.label}": "${edge.to}"}
)
# 条件: ${edge.condition}`;
  }

  return `graph.add_edge("${edge.from}", "${edge.to}")
# 循环条件: ${edge.condition}
# 需要配合最大循环次数和停止条件`;
}

export default function App() {
  const [activeTemplateId, setActiveTemplateId] = useState("branch");
  const [selection, setSelection] = useState<Selection>({ type: "state" });
  const [schemaSaved, setSchemaSaved] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [bottomOpen, setBottomOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomTab>("运行结果");
  const [runIndex, setRunIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [layoutPulse, setLayoutPulse] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  const activeTemplate = useMemo(
    () => templates.find((item) => item.id === activeTemplateId) ?? templates[0],
    [activeTemplateId]
  );

  const activeRunItem = runIndex >= 0 ? activeTemplate.runOrder[runIndex] : "";
  const selectedNode = selection.type === "node" ? activeTemplate.nodes.find((item) => item.id === selection.id) : undefined;
  const selectedEdge = selection.type === "edge" ? activeTemplate.edges.find((item) => item.id === selection.id) : undefined;

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

  function switchTemplate(templateId: string) {
    setActiveTemplateId(templateId);
    setSelection({ type: "workflow" });
    setRunIndex(-1);
    setIsRunning(false);
    setBottomOpen(false);
    setNodePositions({});
  }

  function runFlow() {
    if (!schemaSaved) {
      setSelection({ type: "state" });
      return;
    }
    setBottomOpen(true);
    setActiveTab("执行轨迹");
    setRunIndex(0);
    setIsRunning(true);
  }

  function stepFlow() {
    if (!schemaSaved) {
      setSelection({ type: "state" });
      return;
    }
    setBottomOpen(true);
    setActiveTab("执行轨迹");
    setIsRunning(false);
    setRunIndex((value) => (value + 1 >= activeTemplate.runOrder.length ? 0 : value + 1));
  }

  function showCode() {
    setSelection({ type: "workflow" });
    setRightCollapsed(false);
  }

  function autoLayout() {
    setLayoutPulse(true);
    window.setTimeout(() => setLayoutPulse(false), 720);
  }

  const filteredPalette = nodePalette.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.includes(searchTerm.trim()))
  }));

  return (
    <main className="app-shell">
      <div className="workspace-glow" aria-hidden="true" />
      <Canvas
        template={activeTemplate}
        activeRunItem={activeRunItem}
        selection={selection}
        schemaSaved={schemaSaved}
        layoutPulse={layoutPulse}
        nodePositions={nodePositions}
        onNodePositions={setNodePositions}
        onSelect={setSelection}
      />
      <Topbar
        schemaSaved={schemaSaved}
        isRunning={isRunning}
        onShowSchema={() => setSelection({ type: "state" })}
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
      />

      <Inspector
        collapsed={rightCollapsed}
        onCollapsed={setRightCollapsed}
        selection={selection}
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        schemaSaved={schemaSaved}
        activeTemplate={activeTemplate}
        activeRunItem={activeRunItem}
        onSaveSchema={() => setSchemaSaved(true)}
      />

      <RunPanel
        open={bottomOpen}
        activeTab={activeTab}
        template={activeTemplate}
        runIndex={runIndex}
        activeRunItem={activeRunItem}
        onToggle={() => setBottomOpen((value) => !value)}
        onTab={setActiveTab}
      />
    </main>
  );
}

function Topbar({
  schemaSaved,
  isRunning,
  onShowSchema,
  onRun,
  onStep,
  onShowCode,
  onAutoLayout
}: {
  schemaSaved: boolean;
  isRunning: boolean;
  onShowSchema: () => void;
  onRun: () => void;
  onStep: () => void;
  onShowCode: () => void;
  onAutoLayout: () => void;
}) {
  return (
    <header className="topbar glass">
      <div className="brand-block">
        <div className="brand-mark">
          <Network size={20} />
        </div>
        <div>
          <div className="eyebrow">EduFlow</div>
          <h1>文件处理 Agent</h1>
        </div>
      </div>

      <nav className="toolbar-actions" aria-label="工作流操作">
        <button className="tool-button" onClick={onShowSchema}>
          <Braces size={16} />
          State Schema
        </button>
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

function Sidebar({
  collapsed,
  onCollapsed,
  searchTerm,
  onSearch,
  filteredPalette,
  activeTemplateId,
  onTemplate
}: {
  collapsed: boolean;
  onCollapsed: (value: boolean) => void;
  searchTerm: string;
  onSearch: (value: string) => void;
  filteredPalette: typeof nodePalette;
  activeTemplateId: string;
  onTemplate: (templateId: string) => void;
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
                return (
                  <button className="palette-item" key={item}>
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
            <ChevronDown size={14} />
            <span>边类型</span>
          </div>
          <div className="palette-list">
            {edgePalette.map((item) => {
              const Icon = item.icon;
              return (
                <button className="palette-item" key={item.label}>
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
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
  activeRunItem,
  selection,
  schemaSaved,
  layoutPulse,
  nodePositions,
  onNodePositions,
  onSelect
}: {
  template: Template;
  activeRunItem: string;
  selection: Selection;
  schemaSaved: boolean;
  layoutPulse: boolean;
  nodePositions: Record<string, { x: number; y: number }>;
  onNodePositions: (value: Record<string, { x: number; y: number }>) => void;
  onSelect: (selection: Selection) => void;
}) {
  const reactFlowNodes = useMemo<ReactFlowNode<WorkflowNodeData>[]>(
    () =>
      template.nodes.map((item) => {
        const width = item.kind === "system" ? 84 : 188;
        const height = item.kind === "system" ? 60 : 128;

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
            active: activeRunItem === item.id
          },
          selected: selection.type === "node" && selection.id === item.id
        };
      }),
    [activeRunItem, nodePositions, selection, template.nodes]
  );

  const reactFlowEdges = useMemo<ReactFlowEdge[]>(
    () =>
      template.edges.map((item) => ({
        id: item.id,
        source: item.from,
        target: item.to,
        label: item.label,
        type: item.kind === "loop" ? "smoothstep" : "default",
        animated: activeRunItem === item.id,
        selected: selection.type === "edge" && selection.id === item.id,
        className: `workflow-edge edge-${item.kind} ${activeRunItem === item.id ? "active" : ""}`,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 18,
          height: 18
        },
        style: {
          strokeWidth: activeRunItem === item.id ? 3 : 2
        }
      })),
    [activeRunItem, selection, template.edges]
  );

  function handleNodesChange(changes: NodeChange[]) {
    const nextNodes = applyNodeChanges(changes, reactFlowNodes);
    onNodePositions(Object.fromEntries(nextNodes.map((item) => [item.id, item.position])));
  }

  return (
    <section className={`canvas-shell ${layoutPulse ? "layout-pulse" : ""}`}>
      <ReactFlow
        key={template.id}
        nodes={reactFlowNodes}
        edges={reactFlowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onNodeClick={(_, nodeItem) => onSelect({ type: "node", id: nodeItem.id })}
        onEdgeClick={(_, edgeItem) => onSelect({ type: "edge", id: edgeItem.id })}
        onPaneClick={() => onSelect({ type: "workflow" })}
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

      <div className="canvas-toolbar glass">
        <div>
          <span className="canvas-title">{template.name}</span>
          <p>{template.description}</p>
        </div>
        <div className={`schema-pill ${schemaSaved ? "ready" : "locked"}`}>
          {schemaSaved ? <Check size={14} /> : <Braces size={14} />}
          {schemaSaved ? "State 已保存" : "请先保存 State Schema"}
        </div>
      </div>
    </section>
  );
}

function FlowNodeCard({
  data,
  selected
}: NodeProps<ReactFlowNode<WorkflowNodeData>>) {
  const { node, active } = data;
  const icon = node.kind === "control" ? <GitBranch size={17} /> : node.kind === "agent" ? <Bot size={17} /> : node.kind === "tool" ? <Hammer size={17} /> : node.kind === "output" ? <TerminalSquare size={17} /> : <CircleDot size={17} />;

  if (node.kind === "system") {
    return (
      <div
        className={`system-node ${selected ? "selected" : ""} ${active ? "active" : ""}`}
      >
        <Handle type="target" position={Position.Left} className="node-handle" />
        {node.label}
        <Handle type="source" position={Position.Right} className="node-handle" />
      </div>
    );
  }

  return (
    <div
      className={`flow-node node-${node.kind} ${selected ? "selected" : ""} ${active ? "active" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="node-handle" />
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
      <Handle type="source" position={Position.Right} className="node-handle" />
    </div>
  );
}

const nodeTypes = {
  workflow: FlowNodeCard
};

function Inspector({
  collapsed,
  onCollapsed,
  selection,
  selectedNode,
  selectedEdge,
  schemaSaved,
  activeTemplate,
  activeRunItem,
  onSaveSchema
}: {
  collapsed: boolean;
  onCollapsed: (value: boolean) => void;
  selection: Selection;
  selectedNode?: FlowNode;
  selectedEdge?: FlowEdge;
  schemaSaved: boolean;
  activeTemplate: Template;
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
        {selection.type === "node" && selectedNode ? (
          <NodeInspector node={selectedNode} activeRunItem={activeRunItem} />
        ) : selection.type === "edge" && selectedEdge ? (
          <EdgeInspector edge={selectedEdge} />
        ) : selection.type === "workflow" ? (
          <WorkflowInspector template={activeTemplate} schemaSaved={schemaSaved} />
        ) : (
          <StateInspector schemaSaved={schemaSaved} onSaveSchema={onSaveSchema} />
        )}
      </div>
    </aside>
  );
}

function StateInspector({ schemaSaved, onSaveSchema }: { schemaSaved: boolean; onSaveSchema: () => void }) {
  return (
    <div className="inspector-content">
      <div className="inspector-title">
        <Braces size={18} />
        <div>
          <h2>State Schema</h2>
          <p>节点读取和写入的全局共享结构</p>
        </div>
      </div>

      <div className="hint-box">
        <Sparkles size={16} />
        <span>第一步：保存 State Schema。边只决定路径，数据通过 State 共享。</span>
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

      <InspectorCode title="State 代码" code={getStateCode()} />
    </div>
  );
}

function NodeInspector({ node, activeRunItem }: { node: FlowNode; activeRunItem: string }) {
  return (
    <div className="inspector-content">
      <div className="inspector-title">
        <Layers3 size={18} />
        <div>
          <h2>Node 配置</h2>
          <p>{node.subtitle}</p>
        </div>
      </div>

      <label className="config-field">
        <span>节点名称</span>
        <input value={node.label} readOnly />
      </label>

      <div className="config-card">
        <h3>读取 State 字段</h3>
        <div className="chips">{node.reads.map((item) => <span key={item}>{item}</span>)}</div>
      </div>

      <div className="config-card">
        <h3>写入 State 字段</h3>
        <div className="chips write">{node.writes.map((item) => <span key={item}>{item}</span>)}</div>
      </div>

      <div className="config-card">
        <h3>节点逻辑</h3>
        <p>{node.logic}</p>
      </div>

      <div className="runtime-card">
        <Activity size={17} />
        <span>{activeRunItem === node.id ? "当前节点正在执行，State 将在本步更新。" : "运行设置：超时 30s，失败策略为停止运行。"}</span>
      </div>

      <InspectorCode title="Node 代码" code={getNodeCode(node)} />
    </div>
  );
}

function EdgeInspector({ edge }: { edge: FlowEdge }) {
  return (
    <div className="inspector-content">
      <div className="inspector-title">
        <Route size={18} />
        <div>
          <h2>Edge 配置</h2>
          <p>边表示控制流，不传递数据</p>
        </div>
      </div>

      <div className="config-card">
        <h3>边类型</h3>
        <p>{edge.kind === "normal" ? "普通边" : edge.kind === "condition" ? "条件边" : "循环边"}</p>
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
        <h3>触发条件</h3>
        <code>{edge.condition ?? "next"}</code>
      </div>
      {edge.kind === "loop" && (
        <div className="hint-box warning">
          <RefreshCcw size={16} />
          <span>循环边必须配合停止条件和最大循环次数。</span>
        </div>
      )}

      <InspectorCode title="Edge 代码" code={getEdgeCode(edge)} />
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

function InspectorCode({ title, code }: { title: string; code: string }) {
  return (
    <div className="inspector-code">
      <div className="code-heading">
        <Code2 size={15} />
        <span>{title}</span>
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
  activeRunItem,
  onToggle,
  onTab
}: {
  open: boolean;
  activeTab: BottomTab;
  template: Template;
  runIndex: number;
  activeRunItem: string;
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
            {activeTab === "State 快照" && <StateSnapshot activeRunItem={activeRunItem} />}
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
            <em>{node ? `读取 ${node.reads.join(", ") || "-"}` : edgeItem?.condition ?? "next"}</em>
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
