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
import { useAuth } from "../../../contexts/AuthContext";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const { completeAuth } = useAuth();
  const [name, setName] = useState("林同学");
  const [email, setEmail] = useState("student@eduflow.local");
  const isRegister = mode === "register";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    completeAuth({
      name: isRegister ? name.trim() || "新同学" : name.trim() || "林同学",
      email: email.trim() || "student@eduflow.local",
      role: "student",
      createdAt: new Date().toISOString()
    });
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel glass">
        <div className="brand-mark">
          <Network size={22} />
        </div>
        <div>
          <div className="eyebrow">EDUFLOW</div>
          <h1>{isRegister ? "创建学习账号" : "欢迎回来"}</h1>
          <p>{isRegister ? "注册会创建一个本地 mock 会话，用于体验完整前端路由。" : "使用本地 mock 身份进入学习工作台。"}</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>姓名</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>邮箱</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button className="tool-button primary" type="submit">
            <User size={16} />
            {isRegister ? "注册并进入" : "登录"}
          </button>
        </form>
        <button className="auth-switch" onClick={() => navigate(isRegister ? "/login" : "/register")}>
          {isRegister ? "已有账号，去登录" : "没有账号，创建一个"}
        </button>
      </section>
    </main>
  );
}
