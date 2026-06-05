import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
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
  Wand2,
  X,
  type LucideIcon
} from "lucide-react";
import * as Model from "../../../app/model";
import {
  NodeKind,
  EdgeKind,
  Selection,
  ConfigTarget,
  Field,
  FlowNode,
  FlowEdge,
  EdgeSide,
  edgeSides,
  Template,
  CourseSection,
  CourseChapter,
  CourseTask,
  Course,
  WorkflowNodeData,
  PortDirection,
  PopoverPosition,
  DragState,
  NodeTestStatus,
  HomeNavSection,
  WorkflowViewMode,
  CourseDifficulty,
  CourseStatus,
  ChapterStatus,
  SectionType,
  TaskStatus,
  TaskDifficulty,
  TaskTestStatus,
  TaskTestCase,
  TaskChecklistItem,
  TaskRubricItem,
  AbilityReward,
  MockTask,
  TaskStatKey,
  CreateNodePayload,
  CodeFile,
  RenameNodeResult,
  MockSession,
  WorkflowStatusKind,
  WorkflowHealthItem,
  WorkflowHealthSummary,
  schemaFields,
  templates,
  abilityDimensions,
  courseSections,
  mockCourses,
  createTask,
  mockTasks,
  nodePalette,
  bottomTabs,
  BottomTab,
  stateTabs,
  StateTab,
  nodeWorkbenchTabs,
  NodeWorkbenchTab,
  storageKey,
  sessionStorageKey,
  settingsStorageKey,
  PersistedAppState,
  node,
  systemNode,
  edge,
  isEdgeSideHandle,
  isControlNode,
  addBranch,
  getOppositeSide,
  getUniqueNodeName,
  getStateCode,
  getNodeFnName,
  getNodeCode,
  getControlNodeCode,
  getGeneratedNodeCode,
  getNodeExampleCode,
  getExportedNodeCode,
  formatGraphNodeRef,
  isControlOutletEdge,
  getControlBranches,
  getNodeCanvasPosition,
  getNodeCanvasSize,
  getAutoEdgeHandles,
  getStoredOrInitialEdgeHandles,
  mergePortDirection,
  getNodePortDirections,
  getEdgeCode,
  showcaseGraphCode,
  showcaseCodeFiles,
  getGraphCode,
  getRunCode,
  getWorkflowExportFiles,
  getCanvasExportTemplate,
  slugifyFileName,
  downloadJson,
  inferTemplateIdFromDescription,
  getNodeKindLabel,
  getMockFieldValue,
  createNodeTestInput,
  createNodeTestOutput,
  formatJson,
  parseJsonObject,
  formatFormValue,
  parseFormValue,
  createStateSnapshotForStep,
  getDefaultPopoverPosition,
  clampPopoverPosition,
  getUniqueWorkflowName,
  createBlankWorkflow,
  getPaletteNodeKind,
  getDefaultNodeIO,
  createPaletteNode,
  getEdgeDefaults,
  readStoredAppState,
  mergeStoredTasks,
  readMockSession
} from "../../../app/model";
import { HomeSidebar } from "../layout/Layout";
export function HomePage({
  collapsed,
  activeSection,
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
  activeSection: HomeNavSection;
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
      <HomeSidebar
        collapsed={collapsed}
        activeSection={activeSection}
        onCollapsed={onCollapsed}
      />

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

export function WorkflowPreview({ template }: { template: Template }) {
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

export function Topbar({
  template,
  workflowName,
  schemaSaved,
  isRunning,
  nodePositions,
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
  nodePositions: Record<string, { x: number; y: number }>;
  onBack: () => void;
  onRenameWorkflow: (value: string) => void;
  onRun: () => void;
  onStep: () => void;
  onShowCode: () => void;
  onAutoLayout: () => void;
}) {
  const [draftName, setDraftName] = useState(workflowName);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    setDraftName(workflowName);
  }, [workflowName]);

  function commitName() {
    const nextName = draftName.trim() || "新建工作流";
    onRenameWorkflow(nextName);
  }

  function closeExportMenu() {
    window.setTimeout(() => setExportOpen(false), 0);
  }

  function handleExportCode() {
    downloadJson(`${slugifyFileName(template.name)}-code.json`, {
      type: "eduflow-code-export",
      exportedAt: new Date().toISOString(),
      workflowId: template.id,
      workflowName: template.name,
      files: getWorkflowExportFiles(template)
    });
    closeExportMenu();
  }

  function handleExportCanvas() {
    downloadJson(`${slugifyFileName(template.name)}-canvas.json`, {
      type: "eduflow-canvas-export",
      exportedAt: new Date().toISOString(),
      workflow: getCanvasExportTemplate(template, nodePositions)
    });
    closeExportMenu();
  }

  function handleExportAll() {
    downloadJson(`${slugifyFileName(template.name)}-export.json`, {
      type: "eduflow-full-export",
      exportedAt: new Date().toISOString(),
      workflow: getCanvasExportTemplate(template, nodePositions),
      files: getWorkflowExportFiles(template)
    });
    closeExportMenu();
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
        <div className={`export-menu ${exportOpen ? "open" : ""}`} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setExportOpen(false);
          }
        }}>
          <button className="tool-button" onClick={() => setExportOpen((value) => !value)} aria-expanded={exportOpen} aria-haspopup="menu">
            <Download size={16} />
            导出
            <ChevronDown size={14} />
          </button>
          {exportOpen && (
            <div className="export-menu-popover glass" role="menu">
              <button role="menuitem" onClick={handleExportCode}>
                <Code2 size={15} />
                导出代码
              </button>
              <button role="menuitem" onClick={handleExportCanvas}>
                <Grid2X2 size={15} />
                导出画布
              </button>
              <button role="menuitem" onClick={handleExportAll}>
                <Layers3 size={15} />
                一起导出
              </button>
            </div>
          )}
        </div>
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

export function WorkflowStatusPrompt({ template, schemaSaved }: { template: Template; schemaSaved: boolean }) {
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

export function CodeModal({ open, template, onClose }: { open: boolean; template: Template; onClose: () => void }) {
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

export function Sidebar({
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

export function Canvas({
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

export function Inspector({
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

export function StateInspector({
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

export function getWorkflowHealth(template: Template, schemaSaved: boolean): WorkflowHealthSummary {
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

export function StateHistory({ template, runIndex, activeRunItem }: { template: Template; runIndex: number; activeRunItem: string }) {
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

export function ConfigPopover({
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

export function NodeInspector({
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

export function NodeTypeDetails({
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

export function ControlBranchEditor({
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

export function StateFieldSelector({
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

export function NodeTestView({
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

export function NodeTestLogs({ logs, status }: { logs: string[]; status: NodeTestStatus }) {
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

export function EdgeInspector({
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

export function WorkflowInspector({ template, schemaSaved }: { template: Template; schemaSaved: boolean }) {
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

export function InspectorCode({ title, code, action }: { title: string; code: string; action?: ReactNode }) {
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

export function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`status-line ${ok ? "ok" : "error"}`}>
      {ok ? <Check size={15} /> : <Square size={15} />}
      <span>{label}</span>
    </div>
  );
}

export function RunPanel({
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

export function ResultView({ template, runIndex }: { template: Template; runIndex: number }) {
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

export function StateSnapshot({ activeRunItem }: { activeRunItem: string }) {
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

export function StateDiff({ activeRunItem }: { activeRunItem: string }) {
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

export function TraceView({ template, runIndex }: { template: Template; runIndex: number }) {
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

export function LogView({ template, runIndex }: { template: Template; runIndex: number }) {
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

