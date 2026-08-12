import { useEffect, useMemo, useRef, useState, type DragEvent, type FocusEvent as ReactFocusEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
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
  Bell,
  BookOpen,
  Bot,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  ClipboardList,
  Code2,
  Download,
  Folder,
  FolderOpen,
  GitBranch,
  Grid2X2,
  Hammer,
  Layers3,
  List,
  ListChecks,
  LogOut,
  Loader2,
  Lock,
  MessageSquare,
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
  Target,
  TerminalSquare,
  Trash2,
  User,
  X,
  type LucideIcon
} from "lucide-react";
import type { CreateNodePayload, EdgeSide, FlowNode, NodeKind, Template } from "../domain/types";
import { edgeSides, getNodeCanvasSize, isControlOutletEdge, node } from "../domain/graphOperations";
import { getNodeKindLabel, getPaletteNodeKind } from "../domain/workflowFactory";
import type { ConfigTarget, PortDirection, Selection, WorkflowNodeData } from "./types";
import { nodePalette, schemaFields } from "./editorConfig";
import { getNodeCode, getNodeFnName, getNodePortDirections, getStoredOrInitialEdgeHandles } from "./editorUtilities";
export function Sidebar({
  collapsed,
  onCollapsed,
  searchTerm,
  onSearch,
  filteredPalette,
  templates,
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
  templates: Template[];
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

export function Canvas({
  template,
  workflowDescription,
  activeRunItem,
  selection,
  configTarget,
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
  onUpdateNode,
  draggingPaletteNode,
  onFinishNodeDrag,
  onDeleteNode,
  onDeleteEdge
}: {
  template: Template;
  workflowDescription: string;
  activeRunItem: string;
  selection: Selection;
  configTarget: ConfigTarget | null;
  schemaSaved: boolean;
  layoutPulse: boolean;
  nodePositions: Record<string, { x: number; y: number }>;
  onNodePositions: (value: Record<string, { x: number; y: number }>) => void;
  onSelect: (selection: Selection) => void;
  onOpenConfig: (target: ConfigTarget) => void;
  onCloseConfig: () => void;
  onWorkflowDescription: (value: string) => void;
  onGenerateWorkflow: (description?: string) => void;
  onCreateNode: (payload: CreateNodePayload) => void;
  onCreateEdge: (connection: Connection) => void;
  onReconnectEdge: (edgeId: string, connection: Connection) => void;
  onQuickAddNode: (sourceId: string, side: EdgeSide, payload: Pick<CreateNodePayload, "label" | "kind">) => void;
  onUpdateNode: (nodeId: string, updates: Partial<Pick<FlowNode, "subtitle" | "logic" | "reads" | "writes" | "code" | "codeReview" | "codeSnapshots" | "control">>) => void;
  draggingPaletteNode: CreateNodePayload | null;
  onFinishNodeDrag: () => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}) {
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
            portDirections: getNodePortDirections(item.id, template),
            onQuickAdd: onQuickAddNode
          },
          selected: selection.type === "node" && selection.id === item.id
        };
      }),
    [activeRunItem, nodePositions, onQuickAddNode, selection, template]
  );

  const reactFlowEdges = useMemo<ReactFlowEdge[]>(
    () =>
      template.edges.map((item) => {
        const handles = getStoredOrInitialEdgeHandles(item, template);
        const sourceNode = template.nodes.find((nodeItem) => nodeItem.id === item.from);
        const targetNode = template.nodes.find((nodeItem) => nodeItem.id === item.to);
        return {
          id: item.id,
          source: item.from,
          target: item.to,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: "default",
          animated: activeRunItem === item.id,
          selected: selection.type === "edge" && selection.id === item.id,
          className: `workflow-edge source-${sourceNode?.kind ?? "unknown"} target-${targetNode?.kind ?? "unknown"} ${isControlOutletEdge(item, template) ? "control-outlet" : ""} ${activeRunItem === item.id ? "active" : ""}`,
          style: {
            strokeWidth: activeRunItem === item.id ? 6 : 5
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
        onNodeClick={(_, nodeItem) => {
          onSelect({ type: "node", id: nodeItem.id });
          onOpenConfig({ type: "node", id: nodeItem.id });
        }}
        onNodeDoubleClick={(_, nodeItem) => onOpenConfig({ type: "node", id: nodeItem.id })}
        onEdgeClick={(_, edgeItem) => {
          onSelect({ type: "edge", id: edgeItem.id });
          onOpenConfig({ type: "edge", id: edgeItem.id });
        }}
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

      <WorkflowAssistant
        workflowDescription={workflowDescription}
        template={template}
        selection={selection}
        configTarget={configTarget}
        activeRunItem={activeRunItem}
        onWorkflowDescription={onWorkflowDescription}
        onGenerateWorkflow={onGenerateWorkflow}
        onOpenConfig={onOpenConfig}
        onUpdateNode={onUpdateNode}
      />
    </section>
  );
}

type AssistantMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type NodeUpdatePatch = Partial<Pick<FlowNode, "subtitle" | "logic" | "reads" | "writes" | "code" | "codeReview" | "codeSnapshots" | "control">>;

function uniqueSchemaFields(fields: string[]) {
  const validFields = new Set(schemaFields.map((field) => field.name));
  return Array.from(new Set(fields.filter((field) => validFields.has(field))));
}

function extractMentionedSchemaFields(text: string) {
  const normalizedText = text.toLowerCase();
  return schemaFields.filter((field) => normalizedText.includes(field.name.toLowerCase())).map((field) => field.name);
}

function extractFieldsNearMarker(text: string, markers: string[], stopMarkers: string[]) {
  const lowerText = text.toLowerCase();
  const markerIndex = markers.map((marker) => lowerText.indexOf(marker.toLowerCase())).filter((index) => index >= 0).sort((a, b) => a - b)[0];
  if (markerIndex === undefined) return [];

  const stopIndex = stopMarkers
    .map((marker) => lowerText.indexOf(marker.toLowerCase(), markerIndex + 1))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const segment = text.slice(markerIndex, stopIndex ?? text.length);
  return extractMentionedSchemaFields(segment);
}

function parseAssistantConfigRequest(text: string, node: FlowNode): NodeUpdatePatch {
  const reads = extractFieldsNearMarker(text, ["读取", "读 ", "read"], ["写入", "输出", "write"]);
  const writes = extractFieldsNearMarker(text, ["写入", "输出", "write"], ["读取", "read"]);
  const mentionedFields = extractMentionedSchemaFields(text);
  const nextReads = uniqueSchemaFields(reads.length ? reads : node.reads);
  const nextWrites = uniqueSchemaFields(writes.length ? writes : node.writes);
  const purposeMatch = text.match(/(?:目的|用途|purpose)\s*(?:改成|改为|为|:|：)?\s*([^。.\n]+)/i);
  const logicMatch = text.match(/(?:逻辑|logic)\s*(?:改成|改为|为|:|：)?\s*([^。.\n]+)/i);
  const patch: NodeUpdatePatch = {};

  if (reads.length || mentionedFields.length) {
    patch.reads = nextReads;
  }
  if (writes.length || mentionedFields.length) {
    patch.writes = nextWrites;
  }
  if (purposeMatch?.[1]?.trim()) {
    patch.subtitle = purposeMatch[1].trim();
  }
  if (logicMatch?.[1]?.trim()) {
    patch.logic = logicMatch[1].trim();
  }

  if (!Object.keys(patch).length) {
    patch.logic = `${node.logic}\n根据助手请求补充配置意图：${text}`;
  }

  return patch;
}

function getAssistantTargetNode(template: Template, selection: Selection, configTarget: ConfigTarget | null, activeRunItem: string) {
  if (configTarget?.type === "node") {
    return template.nodes.find((item) => item.id === configTarget.id);
  }
  if (selection.type === "node") {
    return template.nodes.find((item) => item.id === selection.id);
  }
  if (activeRunItem) {
    return template.nodes.find((item) => item.id === activeRunItem);
  }
  return undefined;
}

function isNodeRepairRequest(text: string) {
  return /修复|bug|报错|错误|失败|异常|代码|debug|fix/i.test(text);
}

function isNodeConfigRequest(text: string) {
  return /配置|读取|写入|目的|逻辑|read|write|purpose|logic/i.test(text) || extractMentionedSchemaFields(text).length > 0;
}

function mergeFields(current: string[], additions: string[]) {
  return uniqueSchemaFields([...current, ...additions]);
}

function getAssistantRepairPatch(node: FlowNode, request: string): { patch: NodeUpdatePatch; summary: string } {
  if (node.kind === "router" || node.kind === "loop") {
    return {
      patch: {
        logic: `${node.logic}\nAI 修复建议：保持分支配置由控制边管理，并在运行前确认每个分支都有目标节点。请求：${request}`
      },
      summary: "逻辑说明"
    };
  }

  const fnName = getNodeFnName(node);
  const baseLogic = `AI 修复：为 ${node.label} 增加输入校验、异常处理和可观察的失败输出。`;
  const beforeCode = getNodeCode(node);

  if (node.kind === "http") {
    const afterCode = `import os
import requests


def ${fnName}(state: State):
    url = os.environ.get("SEARCH_API_URL")
    api_key = os.environ.get("SEARCH_API_KEY")
    query = state.get("query") or state.get("user_input") or ""

    if not url or not api_key:
        return {
            "api_error": "SEARCH_API_URL or SEARCH_API_KEY is missing",
            "draft_answer": "搜索服务暂未配置，请先检查当前环境变量。"
        }

    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={"query": query},
            timeout=30
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as error:
        return {
            "api_error": str(error),
            "draft_answer": "搜索请求失败，已保留错误信息供日志排查。"
        }
    except ValueError:
        return {
            "api_error": "Search API returned invalid JSON",
            "draft_answer": response.text[:500]
        }

    return {
        "api_result": payload,
        "draft_answer": str(payload)
    }`;

    return {
      patch: {
        reads: mergeFields(node.reads, ["query"]),
        writes: mergeFields(node.writes, ["api_result", "draft_answer"]),
        logic: `${baseLogic} 缺少 SEARCH_API_URL 或 SEARCH_API_KEY 时不直接抛出未处理异常，请求失败时返回 api_error 和 draft_answer。`,
        codeReview: { before: beforeCode, after: afterCode, summary: request }
      },
      summary: "代码、逻辑、读取字段、写入字段"
    };
  }

  if (node.kind === "llm" || node.kind === "agent") {
    const afterCode = `def ${fnName}(state: State):
    messages = state.get("messages") or []
    user_text = state.get("query") or state.get("user_input") or ""

    if not messages and user_text:
        messages = [{"role": "user", "content": user_text}]

    content = "模拟模型回复：" + (user_text or "已收到请求")
    return {
        "draft_answer": content,
        "messages": messages + [{"role": "assistant", "content": content}]
    }`;

    return {
      patch: {
        reads: mergeFields(node.reads, ["messages"]),
        writes: mergeFields(node.writes, ["draft_answer", "messages"]),
        logic: `${baseLogic} 增加 messages 默认值和模型输出兜底，避免空消息导致运行失败。`,
        codeReview: { before: beforeCode, after: afterCode, summary: request }
      },
      summary: "代码、逻辑、读取字段、写入字段"
    };
  }

  if (node.kind === "tool" || node.kind === "database" || node.kind === "file") {
    const afterCode = `def ${fnName}(state: State):
    try:
        result = {
            "node": "${node.label}",
            "status": "ok",
            "input": state
        }
    except Exception as error:
        result = {
            "node": "${node.label}",
            "status": "error",
            "message": str(error)
        }

    return {
        "tool_result": str(result)
    }`;

    return {
      patch: {
        writes: mergeFields(node.writes, node.kind === "database" ? ["tool_result"] : ["tool_result"]),
        logic: `${baseLogic} 增加参数缺失保护，返回可展示的 mock 结果而不是中断流程。`,
        codeReview: { before: beforeCode, after: afterCode, summary: request }
      },
      summary: "代码、逻辑、写入字段"
    };
  }

  const afterCode = `def ${fnName}(state: State):
    output = {}
${node.writes.length ? node.writes.map((field) => `    output["${field}"] = state.get("${field}") or "mock_${field}"`).join("\n") : `    output["draft_answer"] = state.get("draft_answer") or "节点已完成"`}
    return output`;

  return {
    patch: {
      logic: `${baseLogic} 增加 state.get 读取和默认返回，避免 KeyError 或空输出。`,
      codeReview: { before: beforeCode, after: afterCode, summary: request }
    },
    summary: "代码、逻辑"
  };
}

export function WorkflowAssistant({
  workflowDescription,
  template,
  selection,
  configTarget,
  activeRunItem,
  onWorkflowDescription,
  onGenerateWorkflow,
  onOpenConfig,
  onUpdateNode
}: {
  workflowDescription: string;
  template: Template;
  selection: Selection;
  configTarget: ConfigTarget | null;
  activeRunItem: string;
  onWorkflowDescription: (value: string) => void;
  onGenerateWorkflow: (description?: string) => void;
  onOpenConfig: (target: ConfigTarget) => void;
  onUpdateNode: (nodeId: string, updates: NodeUpdatePatch) => void;
}) {
  const targetNode = getAssistantTargetNode(template, selection, configTarget, activeRunItem);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "描述你想生成的工作流，或打开一个节点后让我修改它的配置和代码。"
    }
  ]);
  const [draft, setDraft] = useState(workflowDescription);
  const [open, setOpen] = useState(false);
  const syncedDescriptionRef = useRef(workflowDescription);

  useEffect(() => {
    if (workflowDescription === syncedDescriptionRef.current) return;
    syncedDescriptionRef.current = workflowDescription;
    setDraft(workflowDescription);
  }, [workflowDescription]);

  function createMessageId(role: AssistantMessage["role"]) {
    return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function commitDraft({ generate }: { generate: boolean }) {
    const nextDescription = draft.trim();
    if (!nextDescription) {
      if (generate) onGenerateWorkflow(workflowDescription);
      return;
    }

    if (!generate && (isNodeRepairRequest(nextDescription) || isNodeConfigRequest(nextDescription))) {
      if (!targetNode) {
        setMessages((items) => [
          ...items,
          { id: createMessageId("user"), role: "user", text: nextDescription },
          {
            id: createMessageId("assistant"),
            role: "assistant",
            text: "请先打开或选择一个节点，我才能确认要修改哪个节点。"
          }
        ]);
        setDraft("");
        return;
      }

      const result = isNodeRepairRequest(nextDescription)
        ? getAssistantRepairPatch(targetNode, nextDescription)
        : {
            patch: parseAssistantConfigRequest(nextDescription, targetNode),
            summary: "配置"
          };
      onUpdateNode(targetNode.id, result.patch);
      onOpenConfig({ type: "node", id: targetNode.id });
      setMessages((items) => [
        ...items,
        { id: createMessageId("user"), role: "user", text: nextDescription },
        {
          id: createMessageId("assistant"),
          role: "assistant",
          text: `已修改 ${targetNode.label}：${result.summary}。`
        }
      ]);
      setDraft("");
      return;
    }

    onWorkflowDescription(nextDescription);
    syncedDescriptionRef.current = nextDescription;
    setMessages((items) => [
      ...items,
      { id: createMessageId("user"), role: "user", text: nextDescription },
      {
        id: createMessageId("assistant"),
        role: "assistant",
        text: generate ? "我会根据这段描述生成工作流和 State Schema。" : "收到。你可以继续补充，或打开节点后让我修改配置和代码。"
      }
    ]);
    setDraft("");

    if (generate) {
      onGenerateWorkflow(nextDescription);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commitDraft({ generate: false });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    commitDraft({ generate: false });
  }

  function handleBlur(event: ReactFocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOpen(false);
  }

  return (
    <section
      className={`workflow-assistant ${open ? "open" : ""}`}
      aria-label="AI 助手"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={handleBlur}
    >
      <button className="assistant-trigger" aria-label="展开 AI 助手对话框">
        <Sparkles size={22} />
      </button>

      <div className="assistant-panel glass">
        <div className="assistant-head">
          <div>
            <span>AI 助手</span>
            <small>{targetNode ? "节点协作" : "工作流生成"}</small>
          </div>
          <Bot size={20} />
        </div>

        <div className="assistant-messages" aria-live="polite">
          {messages.map((message) => (
            <div className={`assistant-message ${message.role}`} key={message.id}>
              <span>{message.text}</span>
            </div>
          ))}
        </div>

        <form className="assistant-composer" onSubmit={handleSubmit}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={targetNode ? "描述要修改当前节点的配置或代码..." : "描述你想生成的工作流..."}
            spellCheck={false}
          />
          <div className="assistant-actions">
            <div className={`assistant-context ${targetNode ? "active" : ""}`}>
              {targetNode ? `当前节点：${targetNode.label} · ${targetNode.kind}` : "未选择节点"}
            </div>
            <button className="assistant-send" type="submit" aria-label="发送描述">
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export function FlowNodeCard({
  data,
  selected
}: NodeProps<ReactFlowNode<WorkflowNodeData>>) {
  const { node, active, portDirections, onQuickAdd } = data;
  const icon = getCanvasNodeIcon(node.kind);

  if (node.kind === "system") {
    return (
      <div
        className={`system-node ${selected ? "selected" : ""} ${active ? "active" : ""}`}
      >
        <PerimeterHandles nodeId={node.id} onQuickAdd={onQuickAdd} />
        <span className="node-orb system-orb">
          {node.id === "start" ? <Play size={24} /> : <Check size={24} />}
          <PortDirectionMarkers directions={portDirections} />
        </span>
        <span className="node-title">{node.label}</span>
      </div>
    );
  }

  return (
    <div
      className={`flow-node node-${node.kind} ${selected ? "selected" : ""} ${active ? "active" : ""}`}
    >
      <PerimeterHandles nodeId={node.id} onQuickAdd={onQuickAdd} />
      <span className="node-orb">
        <span className="node-icon">{icon}</span>
        <PortDirectionMarkers directions={portDirections} />
      </span>
      <span className="node-title">{node.label}</span>
    </div>
  );
}

export function PortDirectionMarkers({ directions }: { directions: Partial<Record<EdgeSide, PortDirection>> }) {
  return (
    <>
      {edgeSides.map((side) => {
        const direction = directions[side];
        if (!direction) return null;
        return (
          <span className={`node-port-marker marker-${side} marker-${direction}`} key={side} aria-hidden="true">
            {getPortDirectionIcon(side, direction)}
          </span>
        );
      })}
    </>
  );
}

export function getPortDirectionIcon(side: EdgeSide, direction: PortDirection) {
  const points = {
    top: direction === "out" ? "6 1 11 11 1 11" : "1 1 11 1 6 11",
    right: direction === "out" ? "11 6 1 1 1 11" : "1 6 11 1 11 11",
    bottom: direction === "out" ? "1 1 11 1 6 11" : "6 1 11 11 1 11",
    left: direction === "out" ? "1 6 11 1 11 11" : "11 6 1 1 1 11"
  };

  if (direction === "both") {
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <polygon points={points[side]} />
        <circle cx="6" cy="6" r="1.7" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <polygon points={points[side]} />
    </svg>
  );
}

export const quickAddOptions: Array<Pick<CreateNodePayload, "label" | "kind">> = [
  { label: "LLM Node", kind: "llm" },
  { label: "Tool Node", kind: "tool" },
  { label: "Router Node", kind: "router" }
];

export function getCanvasNodeIcon(kind: NodeKind, size = 29) {
  if (kind === "router" || kind === "loop") return <GitBranch size={size + 1} />;
  if (kind === "agent" || kind === "llm") return <Bot size={size + 2} />;
  if (kind === "tool" || kind === "http" || kind === "database" || kind === "file") return <Hammer size={size} />;
  if (kind === "output") return <TerminalSquare size={size} />;
  return <CircleDot size={size} />;
}

export function PerimeterHandles({
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
                <button
                  className="route-option"
                  key={option.label}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleQuickAdd(side, option);
                  }}
                >
                  <span className={`route-node-card route-node-${option.kind}`}>
                    <span className="route-node-orb">
                      <span className="route-card-icon">{getCanvasNodeIcon(option.kind, 28)}</span>
                    </span>
                    <strong>{option.label}</strong>
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

export function sideToPosition(side: EdgeSide) {
  if (side === "top") return Position.Top;
  if (side === "right") return Position.Right;
  if (side === "bottom") return Position.Bottom;
  return Position.Left;
}

export const nodeTypes = {
  workflow: FlowNodeCard
};
