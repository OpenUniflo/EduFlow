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
import type { FlowEdge, FlowNode, RenameNodeResult, Template } from "../domain/types";
import { edge, getControlBranches, isControlOutletEdge, node } from "../domain/graphOperations";
import { getNodeKindLabel } from "../domain/workflowFactory";
import type { EnvironmentConfig } from "../runtime/types";
import { schemaFields } from "./editorConfig";
import { nodeWorkbenchTabs, type ConfigTarget, type DragState, type NodeTestStatus, type NodeWorkbenchTab, type PopoverPosition } from "./types";
import { clampPopoverPosition, createNodeTestInput, createNodeTestOutput, formatFormValue, formatJson, getDefaultPopoverPosition, getEdgeCode, getGeneratedNodeCode, getNodeCode, parseFormValue, parseJsonObject } from "./editorUtilities";
import { getNodeEnvironmentRequirements } from "./Inspector";
import { InspectorCode, StatusLine } from "./InspectorCode";
export { InspectorCode, StatusLine } from "./InspectorCode";
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
  onUpdateNode,
  onAddControlBranch,
  onUpdateControlBranch,
  onDeleteControlBranch,
  activeEnvironment,
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
  onUpdateNode: (nodeId: string, updates: Partial<Pick<FlowNode, "subtitle" | "logic" | "reads" | "writes" | "code" | "codeReview" | "codeSnapshots" | "control">>) => void;
  onAddControlBranch: (nodeId: string) => void;
  onUpdateControlBranch: (nodeId: string, branch: string, updates: { label?: string; target?: string }) => void;
  onDeleteControlBranch: (nodeId: string, branch: string) => void;
  activeEnvironment?: EnvironmentConfig;
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
      if (node) onUpdateNode(node.id, { reads: next });
      return next;
    });
  }

  function updateConfiguredWrite(index: number, field: string) {
    setConfiguredWrites((items) => {
      const next = items.map((item, itemIndex) => (itemIndex === index ? field : item));
      resetNodeTestForFields(configuredReads, next);
      if (node) onUpdateNode(node.id, { writes: next });
      return next;
    });
  }

  function addConfiguredRead() {
    setConfiguredReads((items) => {
      const next = [...items, schemaFields.find((field) => !items.includes(field.name))?.name ?? schemaFields[0].name];
      resetNodeTestForFields(next, configuredWrites);
      if (node) onUpdateNode(node.id, { reads: next });
      return next;
    });
  }

  function addConfiguredWrite() {
    setConfiguredWrites((items) => {
      const next = [...items, schemaFields.find((field) => !items.includes(field.name))?.name ?? schemaFields[0].name];
      resetNodeTestForFields(configuredReads, next);
      if (node) onUpdateNode(node.id, { writes: next });
      return next;
    });
  }

  function removeConfiguredRead(index: number) {
    setConfiguredReads((items) => {
      const next = items.filter((_, itemIndex) => itemIndex !== index);
      resetNodeTestForFields(next, configuredWrites);
      if (node) onUpdateNode(node.id, { reads: next });
      return next;
    });
  }

  function removeConfiguredWrite(index: number) {
    setConfiguredWrites((items) => {
      const next = items.filter((_, itemIndex) => itemIndex !== index);
      resetNodeTestForFields(configuredReads, next);
      if (node) onUpdateNode(node.id, { writes: next });
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
            activeEnvironment={activeEnvironment}
            onRenameNode={onRenameNode}
            onUpdateNode={onUpdateNode}
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

type CodeDiffLine = {
  lineNumber: number;
  before: string;
  after: string;
  status: "same" | "changed" | "added" | "removed";
};

function createCodeDiffLines(beforeCode: string, afterCode: string): CodeDiffLine[] {
  const beforeLines = beforeCode.split("\n");
  const afterLines = afterCode.split("\n");
  const lineCount = Math.max(beforeLines.length, afterLines.length);

  return Array.from({ length: lineCount }, (_, index) => {
    const before = beforeLines[index] ?? "";
    const after = afterLines[index] ?? "";
    const beforeExists = index < beforeLines.length;
    const afterExists = index < afterLines.length;
    const status = before === after ? "same" : beforeExists && afterExists ? "changed" : beforeExists ? "removed" : "added";

    return {
      lineNumber: index + 1,
      before,
      after,
      status
    };
  });
}

function pushCodeSnapshot(snapshots: string[] | undefined, code: string) {
  const trimmedCode = code.trim();
  if (!trimmedCode) return snapshots ?? [];
  const current = snapshots ?? [];
  if (current[current.length - 1] === code) return current;
  return [...current, code].slice(-10);
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
  activeEnvironment,
  onRenameNode,
  onUpdateNode,
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
  activeEnvironment?: EnvironmentConfig;
  onRenameNode: (nodeId: string, nextName: string) => RenameNodeResult;
  onUpdateNode: (nodeId: string, updates: Partial<Pick<FlowNode, "subtitle" | "logic" | "reads" | "writes" | "code" | "codeReview" | "codeSnapshots" | "control">>) => void;
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
  const codeReview = node.codeReview;
  const codeSnapshots = node.codeSnapshots ?? [];
  const currentCode = getNodeCode(node, template);
  const diffLines = codeReview ? createCodeDiffLines(codeReview.before, codeReview.after) : [];

  useEffect(() => {
    setNameDraft(node.label);
    setNameError("");
    setPurposeDraft(node.subtitle);
    setLogicDraft(node.logic);
    setCodeDraft(getNodeCode(node, template));
    setCodeCollapsed(false);
  }, [node.id, node.subtitle, node.logic, node.code, node.codeReview, node.control, node.reads, node.writes, template]);

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
    const nextCode = getGeneratedNodeCode(node, purposeDraft, logicDraft);
    setCodeDraft(nextCode);
    setCodeCollapsed(false);
    onUpdateNode(node.id, {
      subtitle: purposeDraft,
      logic: logicDraft,
      code: nextCode,
      codeReview: undefined,
      codeSnapshots: pushCodeSnapshot(node.codeSnapshots, currentCode)
    });
  }

  function persistNodeConfig(updates: Partial<Pick<FlowNode, "subtitle" | "logic" | "code">>) {
    if (node.kind === "system") return;
    if (updates.code !== undefined && updates.code !== currentCode) {
      onUpdateNode(node.id, { ...updates, codeReview: undefined, codeSnapshots: pushCodeSnapshot(node.codeSnapshots, currentCode) });
      return;
    }
    onUpdateNode(node.id, updates);
  }

  function acceptCodeReview() {
    if (!codeReview) return;
    onUpdateNode(node.id, {
      code: codeReview.after,
      codeReview: undefined,
      codeSnapshots: pushCodeSnapshot(node.codeSnapshots, codeReview.before)
    });
    setCodeDraft(codeReview.after);
  }

  function rejectCodeReview() {
    if (!codeReview) return;
    onUpdateNode(node.id, {
      codeReview: undefined
    });
    setCodeDraft(codeReview.before);
  }

  function rollbackCodeSnapshot() {
    const previousCode = codeSnapshots[codeSnapshots.length - 1];
    if (!previousCode) return;
    onUpdateNode(node.id, {
      code: previousCode,
      codeReview: undefined,
      codeSnapshots: codeSnapshots.slice(0, -1)
    });
    setCodeDraft(previousCode);
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
            activeEnvironment={activeEnvironment}
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
              onBlur={() => persistNodeConfig({ subtitle: purposeDraft })}
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
              onBlur={() => persistNodeConfig({ logic: logicDraft })}
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
              <div className="code-review-shell">
                <div className="code-review-actions">
                  {codeReview ? (
                    <span className="code-review-status">AI 修改待确认</span>
                  ) : (
                    <span className="code-review-status neutral">当前版本</span>
                  )}
                  <div>
                    <button className="icon-button" onClick={rollbackCodeSnapshot} disabled={!codeSnapshots.length} aria-label="回退到上一个代码快照">
                      <RefreshCcw size={15} />
                    </button>
                    {codeReview ? (
                      <>
                        <button className="icon-button success" onClick={acceptCodeReview} aria-label="接受 AI 代码修改">
                          <Check size={15} />
                        </button>
                        <button className="icon-button danger" onClick={rejectCodeReview} aria-label="拒绝 AI 代码修改">
                          <X size={15} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {codeReview ? (
                  <div className="code-diff-grid" aria-label="代码修改对比">
                    <div className="code-diff-pane">
                      <div className="code-diff-title">修改前</div>
                      <pre className="code-diff-view">
                        {diffLines.map((line) => (
                          <span className={`code-diff-line ${line.status === "added" ? "same" : line.status}`} key={`before-${line.lineNumber}`}>
                            <em>{line.lineNumber}</em>
                            <code>{line.before || " "}</code>
                          </span>
                        ))}
                      </pre>
                    </div>
                    <div className="code-diff-pane">
                      <div className="code-diff-title">修改后</div>
                      <pre className="code-diff-view">
                        {diffLines.map((line) => (
                          <span className={`code-diff-line ${line.status === "removed" ? "same" : line.status}`} key={`after-${line.lineNumber}`}>
                            <em>{line.lineNumber}</em>
                            <code>{line.after || " "}</code>
                          </span>
                        ))}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <textarea
                    className="code-editor"
                    value={codeDraft}
                    onChange={(event) => setCodeDraft(event.target.value)}
                    onBlur={() => persistNodeConfig({ code: codeDraft })}
                    spellCheck={false}
                  />
                )}
              </div>
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
  activeEnvironment,
  onAddControlBranch,
  onUpdateControlBranch,
  onDeleteControlBranch
}: {
  node: FlowNode;
  template: Template;
  activeEnvironment?: EnvironmentConfig;
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
      <EnvironmentParameterForm node={node} activeEnvironment={activeEnvironment} />
    );
  }

  if (node.kind === "database" || node.kind === "file") {
    return (
      <EnvironmentParameterForm node={node} activeEnvironment={activeEnvironment} />
    );
  }

  if (node.kind === "llm") {
    return (
      <EnvironmentParameterForm node={node} activeEnvironment={activeEnvironment} />
    );
  }

  if (node.kind === "agent" || node.kind === "tool") {
    return <EnvironmentParameterForm node={node} activeEnvironment={activeEnvironment} />;
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

type NodeParameterSource = "environment" | "custom";

type NodeParameterDefinition = {
  name: string;
  label: string;
  envKey?: keyof EnvironmentConfig;
  defaultValue?: string;
  secret?: boolean;
};

export function getNodeParameterDefinitions(node: FlowNode): { title: string; note: string; parameters: NodeParameterDefinition[] } | null {
  if (node.kind === "llm" || node.kind === "agent") {
    return {
      title: node.kind === "agent" ? "Agent 模型与工具意图配置" : "LLM 配置",
      note: "模型连接参数建议来自当前全局环境，也可以在节点内自定义覆盖。",
      parameters: [
        { name: "model", label: "model", envKey: "model", defaultValue: "gpt-4.1-mini" },
        { name: "baseUrl", label: "base url", envKey: "baseUrl" },
        { name: "apiKey", label: "api key", envKey: "apiKey", secret: true },
        { name: "systemPrompt", label: "system prompt", defaultValue: node.kind === "agent" ? "你是一个可调用工具的教学 Agent" : "你是一个教学助手" },
        { name: "temperature", label: "temperature", defaultValue: "0.7" }
      ]
    };
  }

  if (node.kind === "http" || node.kind === "tool") {
    return {
      title: node.kind === "tool" ? "工具 / 第三方系统接入" : "第三方系统接入",
      note: "URL 和密钥需要在当前环境中配置，或在节点内自定义覆盖。",
      parameters: [
        { name: "method", label: "method", defaultValue: "POST" },
        { name: "url", label: "url", envKey: "searchApiUrl" },
        { name: "secret", label: "secret", envKey: "searchApiKey", secret: true },
        { name: "timeout", label: "timeout", defaultValue: "30s" },
        { name: "retry", label: "retry", defaultValue: "2" },
        { name: "errorStrategy", label: "error strategy", defaultValue: "raise" }
      ]
    };
  }

  if (node.kind === "database") {
    return {
      title: "数据库参数配置",
      note: "数据库 URL 需要在当前环境中配置，或在节点内自定义覆盖。",
      parameters: [
        { name: "databaseType", label: "database type", defaultValue: "PostgreSQL" },
        { name: "databaseUrl", label: "database url", envKey: "databaseUrl" },
        { name: "inputMapping", label: "input mapping", defaultValue: "State 字段映射到查询参数" },
        { name: "outputMapping", label: "output mapping", defaultValue: "结果写回 State" },
        { name: "errorStrategy", label: "error strategy", defaultValue: "raise" }
      ]
    };
  }

  if (node.kind === "file") {
    return {
      title: "文件 / 云盘参数配置",
      note: "文件存储路径需要在当前环境中配置，或在节点内自定义覆盖。",
      parameters: [
        { name: "sourceType", label: "source type", defaultValue: "local / cloud / s3 / drive" },
        { name: "fileStoragePath", label: "file storage path", envKey: "fileStoragePath" },
        { name: "inputMapping", label: "input mapping", defaultValue: "State 字段映射到文件请求" },
        { name: "outputMapping", label: "output mapping", defaultValue: "读取结果写回 State" },
        { name: "errorStrategy", label: "error strategy", defaultValue: "raise" }
      ]
    };
  }

  return null;
}

export function EnvironmentParameterForm({ node, activeEnvironment }: { node: FlowNode; activeEnvironment?: EnvironmentConfig }) {
  const definition = getNodeParameterDefinitions(node);
  const [sources, setSources] = useState<Record<string, NodeParameterSource>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const missingRequired = getNodeEnvironmentRequirements(node).filter((item) => !String(activeEnvironment?.[item.key] ?? "").trim());

  useEffect(() => {
    if (!definition) return;
    setSources(Object.fromEntries(definition.parameters.map((item) => [item.name, item.envKey ? "environment" : "custom"])));
    setCustomValues(Object.fromEntries(definition.parameters.map((item) => [item.name, item.defaultValue ?? ""])));
  }, [activeEnvironment?.id, definition?.title, node.id]);

  if (!definition) return null;

  function getEnvironmentLabel(parameter: NodeParameterDefinition) {
    if (!parameter.envKey) return "";
    return activeEnvironment?.name ? `当前环境：${activeEnvironment.name}` : "当前环境";
  }

  function getEnvironmentValue(parameter: NodeParameterDefinition) {
    return String(parameter.envKey ? activeEnvironment?.[parameter.envKey] ?? "" : "");
  }

  return (
    <div className="config-card parameter-card">
      <div className="card-title-row">
        <h3>{definition.title}</h3>
        <span className={`parameter-status ${missingRequired.length ? "warning" : "ok"}`}>
          {missingRequired.length ? `${missingRequired.length} 项待配置` : "环境变量已配置"}
        </span>
      </div>
      <p className="parameter-note">{definition.note}</p>
      {missingRequired.length ? (
        <div className="hint-box warning parameter-warning">
          <AlertTriangle size={16} />
          <span>当前环境缺少 {missingRequired.map((item) => item.label).join("、")}，该节点运行检查不会通过。</span>
        </div>
      ) : null}

      <div className="parameter-form">
        {definition.parameters.map((parameter) => {
          const source = sources[parameter.name] ?? (parameter.envKey ? "environment" : "custom");
          const environmentValue = getEnvironmentValue(parameter);
          const customValue = customValues[parameter.name] ?? parameter.defaultValue ?? "";
          const effectiveValue = source === "environment" ? environmentValue : customValue;
          const missing = !String(effectiveValue).trim();

          return (
            <label className={`parameter-row ${missing ? "missing" : ""}`} key={parameter.name}>
              <span>{parameter.label}</span>
              <select
                value={source}
                disabled={!parameter.envKey}
                onChange={(event) => setSources((items) => ({ ...items, [parameter.name]: event.target.value as NodeParameterSource }))}
              >
                {parameter.envKey ? <option value="environment">{getEnvironmentLabel(parameter)}</option> : null}
                <option value="custom">自定义</option>
              </select>
              <input
                type={parameter.secret ? "password" : "text"}
                value={effectiveValue}
                readOnly={source === "environment"}
                placeholder={source === "environment" ? "当前环境未配置" : "输入自定义参数"}
                onChange={(event) => setCustomValues((items) => ({ ...items, [parameter.name]: event.target.value }))}
              />
              <small>{missing ? "未配置" : source === "environment" ? "来自环境配置" : "节点自定义"}</small>
            </label>
          );
        })}
      </div>
    </div>
  );
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
        <StatusLine ok label="循环存在停止条件" />
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
