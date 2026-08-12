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
import type { FlowNode, Template } from "../domain/types";
import { getControlBranches, node } from "../domain/graphOperations";
import type { EnvironmentConfig, WorkflowRunRecord } from "../runtime/types";
import { schemaFields } from "./editorConfig";
import { stateTabs, type StateTab, type WorkflowHealthItem, type WorkflowHealthSummary, type WorkflowStatusKind } from "./types";
import { formatFormValue, formatJson, getStateCode, parseFormValue, summarizeStateValue } from "./editorUtilities";
import { InspectorCode } from "./InspectorCode";
export function Inspector({
  collapsed,
  onCollapsed,
  activeTab,
  onTab,
  schemaSaved,
  template,
  runIndex,
  activeRunItem,
  stateValues,
  updatedStateFields,
  runHistory,
  selectedRunHistoryId,
  onOpenRunHistory,
  onStateFieldChange,
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
  stateValues: Record<string, unknown>;
  updatedStateFields: string[];
  runHistory: WorkflowRunRecord[];
  selectedRunHistoryId: string | null;
  onOpenRunHistory: (run: WorkflowRunRecord) => void;
  onStateFieldChange: (fieldName: string, value: unknown) => void;
  onSaveSchema: () => void;
}) {
  if (collapsed) {
    return (
      <button className="floating-collapser left state-collapser glass" onClick={() => onCollapsed(false)} aria-label="展开 State 面板">
        <ChevronRight size={18} />
        <span>State</span>
      </button>
    );
  }

  return (
    <aside className="inspector floating-panel glass">
      <button className="inspector-collapse icon-button" onClick={() => onCollapsed(true)} aria-label="折叠 State 面板">
        <ChevronLeft size={16} />
      </button>
      <div className="inspector-scroll">
        <StateInspector
          activeTab={activeTab}
          template={template}
          runIndex={runIndex}
          activeRunItem={activeRunItem}
          stateValues={stateValues}
          updatedStateFields={updatedStateFields}
          runHistory={runHistory}
          selectedRunHistoryId={selectedRunHistoryId}
          onOpenRunHistory={onOpenRunHistory}
          onStateFieldChange={onStateFieldChange}
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
  stateValues,
  updatedStateFields,
  runHistory,
  selectedRunHistoryId,
  onOpenRunHistory,
  schemaSaved,
  onStateFieldChange,
  onSaveSchema,
  onTab
}: {
  activeTab: StateTab;
  template: Template;
  runIndex: number;
  activeRunItem: string;
  stateValues: Record<string, unknown>;
  updatedStateFields: string[];
  runHistory: WorkflowRunRecord[];
  selectedRunHistoryId: string | null;
  onOpenRunHistory: (run: WorkflowRunRecord) => void;
  schemaSaved: boolean;
  onStateFieldChange: (fieldName: string, value: unknown) => void;
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

          <StateSchemaFields stateValues={stateValues} autoOpenFields={updatedStateFields} highlightedFields={updatedStateFields} onStateFieldChange={onStateFieldChange} />

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
      {activeTab === "历史记录" && <StateHistory runIndex={runIndex} activeRunItem={activeRunItem} runHistory={runHistory} selectedRunHistoryId={selectedRunHistoryId} onOpenRunHistory={onOpenRunHistory} />}
    </div>
  );
}

type EnvironmentVariableRequirement = {
  key: keyof EnvironmentConfig;
  label: string;
};

type EnvironmentVariableIssue = {
  node: FlowNode;
  missing: EnvironmentVariableRequirement[];
};

export function getNodeEnvironmentRequirements(node: FlowNode): EnvironmentVariableRequirement[] {
  if (node.kind === "llm" || node.kind === "agent") {
    return [
      { key: "baseUrl", label: "Base URL" },
      { key: "apiKey", label: "API Key" },
      { key: "model", label: "默认模型" }
    ];
  }

  if (node.kind === "http" || node.kind === "tool") {
    return [
      { key: "searchApiUrl", label: "搜索 API URL" },
      { key: "searchApiKey", label: "搜索 API Key" }
    ];
  }

  if (node.kind === "database") {
    return [{ key: "databaseUrl", label: "数据库 URL" }];
  }

  if (node.kind === "file") {
    return [{ key: "fileStoragePath", label: "文件存储路径" }];
  }

  return [];
}

export function getEnvironmentVariableIssues(template: Template, activeEnvironment?: EnvironmentConfig): EnvironmentVariableIssue[] {
  return template.nodes
    .map((nodeItem) => {
      const required = getNodeEnvironmentRequirements(nodeItem);
      const missing = required.filter((item) => !String(activeEnvironment?.[item.key] ?? "").trim());
      return { node: nodeItem, missing };
    })
    .filter((item) => item.missing.length);
}

export function getWorkflowHealth(template: Template, schemaSaved: boolean, activeEnvironment?: EnvironmentConfig): WorkflowHealthSummary {
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
  const environmentIssues = getEnvironmentVariableIssues(template, activeEnvironment);
  const environmentOk = environmentIssues.length === 0;
  const checks: WorkflowHealthItem[] = [
    { ok: schemaSaved, label: schemaSaved ? "State Schema 已保存" : "缺少 State Schema" },
    { ok: environmentOk, label: environmentOk ? "环境变量配置完整" : `${environmentIssues.length} 个节点缺少环境变量配置` },
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
    ? "当前工作流结构完整，State Schema 和环境变量均已配置，可以运行或单步运行。"
    : environmentOk
      ? "第一步：保存 State Schema。边只连接节点，条件分支和循环由 Router / Loop 节点表达。"
      : "请先补齐当前环境中的节点变量参数，再运行或单步运行。";

  return { status, summary, guidance, canRun, checks };
}

export function StateSchemaFields({
  stateValues,
  autoOpenFields,
  highlightedFields,
  onStateFieldChange
}: {
  stateValues: Record<string, unknown>;
  autoOpenFields: string[];
  highlightedFields: string[];
  onStateFieldChange: (fieldName: string, value: unknown) => void;
}) {
  const [openFields, setOpenFields] = useState<Record<string, boolean>>({});
  const highlightedFieldSet = useMemo(() => new Set(highlightedFields), [highlightedFields]);

  useEffect(() => {
    if (!autoOpenFields.length) return;
    setOpenFields((items) => ({
      ...items,
      ...Object.fromEntries(autoOpenFields.map((field) => [field, true]))
    }));
  }, [autoOpenFields]);

  return (
    <div className="field-list schema-field-list">
      {schemaFields.map((field) => {
        const open = openFields[field.name] ?? false;
        const highlighted = highlightedFieldSet.has(field.name);
        const value = stateValues[field.name] ?? parseFormValue(field.defaultValue);
        const defaultValue = parseFormValue(field.defaultValue);

        return (
          <section className={`field-row schema-field ${open ? "open" : ""} ${highlighted ? "updated" : ""}`} key={field.name}>
            <button className="schema-field-toggle" onClick={() => setOpenFields((items) => ({ ...items, [field.name]: !open }))} aria-expanded={open}>
              <div>
                <strong>{field.name}</strong>
                <span>{field.note}</span>
              </div>
              <div className="schema-field-meta">
                {highlighted && <span className="schema-field-update-badge">运行更新</span>}
                <em>{field.type}</em>
                {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </div>
            </button>

            {open && (
              <div className="schema-field-editor">
                <div className="schema-field-facts">
                  <span>默认值 <code>{summarizeStateValue(defaultValue)}</code></span>
                  <span>当前值 <code>{summarizeStateValue(value)}</code></span>
                </div>
                <label>
                  字段值
                  <textarea
                    value={formatFormValue(value)}
                    onChange={(event) => onStateFieldChange(field.name, parseFormValue(event.currentTarget.value))}
                    rows={field.type === "object" || field.type === "list" ? 5 : 3}
                  />
                </label>
                <button className="tool-button compact" onClick={() => onStateFieldChange(field.name, defaultValue)}>
                  <RefreshCcw size={14} />
                  重置为默认值
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function StateHistory({
  runIndex,
  activeRunItem,
  runHistory,
  selectedRunHistoryId,
  onOpenRunHistory
}: {
  runIndex: number;
  activeRunItem: string;
  runHistory: WorkflowRunRecord[];
  selectedRunHistoryId: string | null;
  onOpenRunHistory: (run: WorkflowRunRecord) => void;
}) {
  if (!runHistory.length) {
    return (
      <div className="hint-box">
        <Sparkles size={16} />
        <span>完整运行一次工作流后，这里会保存一条历史记录。单步运行只推进执行轨迹，不会创建历史记录。</span>
      </div>
    );
  }

  return (
    <>
      {runIndex >= 0 && (
        <div className="hint-box">
          <Sparkles size={16} />
          <span>当前执行位置：{activeRunItem || "ready"}。历史记录只在整轮运行完成后新增。</span>
        </div>
      )}
      <div className="state-history">
        {runHistory.map((run, index) => (
          <section className={`history-item ${selectedRunHistoryId === run.id ? "active" : ""}`} key={run.id}>
            <button className="history-toggle" onClick={() => onOpenRunHistory(run)} aria-label={`查看第 ${runHistory.length - index} 次运行详情`}>
              <div>
                <strong>{runHistory.length - index}. {run.workflowName}</strong>
                <span>{formatRunTime(run.createdAt)} · {run.nodeCount} 个节点 · {run.status === "success" ? "运行成功" : run.status}{run.assignmentId ? ` · ${run.courseId}/${run.assignmentId}` : " · 独立运行"}</span>
              </div>
              <ChevronRight size={15} />
            </button>
            <p className="history-summary">{run.outputSummary}</p>
          </section>
        ))}
      </div>
    </>
  );
}

export function RunHistoryDetail({ run, onClose }: { run: WorkflowRunRecord; onClose: () => void }) {
  const windowRef = useRef<HTMLElement | null>(null);
  const [openNodeIds, setOpenNodeIds] = useState<Record<string, boolean>>(() => {
    const firstNode = run.nodes[0];
    return firstNode ? { [`${firstNode.id}-0`]: true } : {};
  });

  useEffect(() => {
    windowRef.current?.focus();
  }, [run.id]);

  function scrollFloatingWindow(delta: number) {
    if (!windowRef.current) return;
    windowRef.current.scrollTop += delta;
  }

  return (
    <section
      ref={windowRef}
      className="history-floating-window glass"
      role="dialog"
      aria-modal="false"
      aria-label="运行历史详情"
      tabIndex={-1}
      onWheel={(event) => {
        scrollFloatingWindow(event.deltaY);
        event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.key === "PageDown") {
          scrollFloatingWindow(windowRef.current?.clientHeight ?? 420);
          event.preventDefault();
        }
        if (event.key === "PageUp") {
          scrollFloatingWindow(-(windowRef.current?.clientHeight ?? 420));
          event.preventDefault();
        }
        if (event.key === "ArrowDown") {
          scrollFloatingWindow(72);
          event.preventDefault();
        }
        if (event.key === "ArrowUp") {
          scrollFloatingWindow(-72);
          event.preventDefault();
        }
      }}
    >
      <div className="history-floating-head">
        <div>
          <h3>{run.workflowName}</h3>
          <p>{formatRunTime(run.createdAt)} · {run.nodeCount} 个节点 · 运行成功{run.assignmentId ? ` · Assignment ${run.courseId}/${run.assignmentId}` : " · 独立运行"}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="关闭历史详情">
          <X size={16} />
        </button>
      </div>

      <div className="history-node-list">
        {run.nodes.map((nodeItem, index) => {
          const stepId = `${nodeItem.id}-${index}`;
          const open = openNodeIds[stepId] ?? false;

          return (
            <section className={`history-node ${open ? "open" : ""}`} key={`${run.id}-${stepId}`}>
              <button
                className="history-step-toggle"
                onClick={() => setOpenNodeIds((items) => ({ ...items, [stepId]: !open }))}
                aria-expanded={open}
              >
                <span>{index + 1}</span>
                <strong>{nodeItem.label}</strong>
                {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {open && (
                <div className="history-step-fields">
                  <div className="history-step-field">
                    <span>输入</span>
                    <pre className="code-view">{formatJson(nodeItem.input)}</pre>
                  </div>
                  <div className="history-step-field">
                    <span>输出</span>
                    <pre className="code-view">{formatJson(nodeItem.output)}</pre>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

export function formatRunTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
