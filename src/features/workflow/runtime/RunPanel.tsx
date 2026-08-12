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
import type { Template } from "../domain/types";
import { node } from "../domain/graphOperations";
import { bottomTabs, type BottomTab } from "../editor/types";
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
