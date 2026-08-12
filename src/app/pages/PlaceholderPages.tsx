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
import type { HomeNavSection } from "@/app/navigationTypes";
import type { MockSession } from "@/features/auth/types";
import { readLegacySettings, writeLegacySettings } from "@/app/legacy/legacySettings";
import { CourseShell } from "@/app/components/legacy/Layout";
export function PlaceholderShell({
  collapsed,
  activeSection,
  onCollapsed,
  page,
  session
}: {
  collapsed: boolean;
  activeSection: HomeNavSection;
  onCollapsed: (value: boolean) => void;
  page: "settings" | "notifications" | "messages";
  session: MockSession | null;
}) {
  return (
    <main className="app-shell">
      <div className="workspace-glow" aria-hidden="true" />
      <CourseShell
        collapsed={collapsed}
        activeSection={activeSection}
        onCollapsed={onCollapsed}
      >
        {page === "settings" ? <SettingsPage session={session} /> : page === "notifications" ? <NotificationsPage /> : <MessagesPage />}
      </CourseShell>
    </main>
  );
}

export function SettingsPage({ session }: { session: MockSession | null }) {
  const [settings, setSettings] = useState(() => readLegacySettings());
  const preferenceItems = [
    ["dailyReminder", "每日学习提醒", "在工作台显示今日学习提示"],
    ["compactMode", "紧凑模式", "课程与任务列表使用更紧凑的间距"],
    ["emailDigest", "邮件摘要", "模拟接收每周学习摘要"]
  ] as const;

  function updateSetting(key: (typeof preferenceItems)[number][0]) {
    setSettings((value) => {
      const next = { ...value, [key]: !value[key] };
      writeLegacySettings(next);
      return next;
    });
  }

  return (
    <section className="placeholder-page">
      <header className="course-hero glass">
        <div>
          <div className="eyebrow">SETTINGS</div>
          <h2>学习设置</h2>
          <p>{session?.name ?? "学生"} 的本地偏好配置，仅保存在当前浏览器。</p>
        </div>
      </header>
      <div className="placeholder-grid">
        {preferenceItems.map(([key, title, note]) => (
          <article key={key} className="placeholder-card glass">
            <div>
              <h3>{title}</h3>
              <p>{note}</p>
            </div>
            <button className={`toggle-button ${settings[key] ? "active" : ""}`} onClick={() => updateSetting(key)} aria-pressed={settings[key]}>
              <span />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function NotificationsPage() {
  const notifications = [
    { title: "任务检查已通过", note: "实训任务「Router 节点分流实训」已可提交。", time: "10:20" },
    { title: "课程进度更新", note: "Agent 循环编排课程完成度提升至 67%。", time: "昨天" },
    { title: "能力成长记录", note: "调试分析力获得 18 点成长值。", time: "周一" }
  ];

  return (
    <section className="placeholder-page">
      <header className="course-hero glass">
        <div>
          <div className="eyebrow">NOTIFICATIONS</div>
          <h2>通知中心</h2>
          <p>本地 mock 通知，用于补齐前端路由和导航体验。</p>
        </div>
      </header>
      <div className="placeholder-grid">
        {notifications.map((item) => (
          <article key={item.title} className="placeholder-card glass">
            <Bell size={18} />
            <div>
              <h3>{item.title}</h3>
              <p>{item.note}</p>
              <small>{item.time}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function MessagesPage() {
  const messages = [
    { from: "课程助教", note: "你可以继续完善工作流的错误处理分支。", time: "09:45" },
    { from: "系统评分", note: "上一次提交已进入模拟评分队列。", time: "昨天" },
    { from: "学习伙伴", note: "共享了一个 HTTP API 节点配置示例。", time: "周二" }
  ];

  return (
    <section className="placeholder-page">
      <header className="course-hero glass">
        <div>
          <div className="eyebrow">MESSAGES</div>
          <h2>消息</h2>
          <p>用于前端演示的本地消息列表。</p>
        </div>
      </header>
      <div className="placeholder-grid">
        {messages.map((item) => (
          <article key={item.from + item.time} className="placeholder-card glass">
            <MessageSquare size={18} />
            <div>
              <h3>{item.from}</h3>
              <p>{item.note}</p>
              <small>{item.time}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function NotFoundPage({ onHome }: { onHome: () => void }) {
  return (
    <main className="app-shell">
      <div className="workspace-glow" aria-hidden="true" />
      <section className="not-found glass">
        <div className="brand-mark">
          <Route size={22} />
        </div>
        <div>
          <div className="eyebrow">404</div>
          <h1>页面不存在</h1>
          <p>当前地址没有匹配的 EduFlow 前端路由。</p>
        </div>
        <button className="tool-button primary" onClick={onHome}>
          <ArrowLeft size={16} />
          返回工作流
        </button>
      </section>
    </main>
  );
}
