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
import * as Model from "@/features/workflow/model";
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
} from "@/features/workflow/model";
import { useNavigation } from "@/app/providers/NavigationContext";

export function HomeSidebar({
  collapsed,
  activeSection,
  onCollapsed
}: {
  collapsed: boolean;
  activeSection: HomeNavSection;
  onCollapsed: (value: boolean) => void;
}) {
  const { onGoCourses, onGoTasks, onGoWorkflows, onGoProfile, onGoSettings, onGoNotifications, onGoMessages, onLogout } = useNavigation();
  const navItems: Array<{ id: HomeNavSection; label: string; icon: LucideIcon; onClick?: () => void }> = [
    { id: "courses", label: "课程", icon: BookOpen, onClick: onGoCourses },
    { id: "workflows", label: "工作流", icon: Layers3, onClick: onGoWorkflows },
    { id: "tasks", label: "任务", icon: ClipboardList, onClick: onGoTasks },
    { id: "profile", label: "个人", icon: User, onClick: onGoProfile },
    { id: "notifications", label: "通知", icon: Bell, onClick: onGoNotifications },
    { id: "messages", label: "消息", icon: MessageSquare, onClick: onGoMessages },
    { id: "settings", label: "设置", icon: Settings2, onClick: onGoSettings }
  ];

  return (
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
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              className={`home-nav-item ${active ? "active" : ""} ${item.onClick ? "" : "disabled"}`}
              aria-current={active ? "page" : undefined}
              onClick={item.onClick}
              disabled={!item.onClick}
            >
              <Icon size={18} />
              {!collapsed ? <span>{item.label}</span> : null}
            </button>
          );
        })}
      </nav>
      <button className="home-nav-item home-logout" onClick={onLogout}>
        <LogOut size={18} />
        {!collapsed ? <span>退出</span> : null}
      </button>
    </aside>
  );
}

export function CourseShell({
  collapsed,
  activeSection,
  onCollapsed,
  children
}: {
  collapsed: boolean;
  activeSection: HomeNavSection;
  onCollapsed: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className={`home-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <HomeSidebar
        collapsed={collapsed}
        activeSection={activeSection}
        onCollapsed={onCollapsed}
      />
      <section className="home-main course-main">{children}</section>
    </div>
  );
}
