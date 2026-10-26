import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Boxes, Braces, Check, Code2, Combine, GitBranch, GitFork, Hammer, Play, Route, Send, X } from "lucide-react";
import type { Binding, JsonSchema, JsonValue, WorkflowDefinitionV2, WorkflowNodeV2, WorkflowRunV2 } from "../../domain/v2/types";
import { nodeRunData, type RunStepInput } from "../../domain/v2/runData";
import { NodePanelSections, nodePanelTypeLabel, type NodePanelSection } from "./NodePanel";
import { nodeLabelIndex } from "./StateFields";
import { DROP_BINDING_TYPE } from "./NodeParamsTable";
import { NodeTestRunner } from "./NodeTestPanel";
import { useRunSteps } from "./NodeRunDataTab";
import { ReadableRunOutput } from "./RunOutput";
import { stateTypeLabel } from "../../domain/v2/stateAuthoring";

const typeIcons = {
  "core.start": Play, "core.end": Check, "core.llm": Bot, "core.tool": Hammer, "core.tool_dispatch": Route,
  "core.transform": Braces, "core.router": GitBranch, "core.function": Code2, "core.subgraph": Boxes,
  "core.memory": Boxes, "core.progress": Route, "control.fork": GitFork, "control.join": Combine, "control.send": Send,
};

export type NodeDebugDialogProps = {
  open: boolean;
  definition: WorkflowDefinitionV2;
  node: WorkflowNodeV2;
  graphPath: string[];
  environmentRef: string;
  environmentSchema: JsonSchema;
  producers: Map<string, string[]>;
  sections: NodePanelSection[];
  readOnly: boolean;
  initialFocus?: "config" | "test";
  runId?: string | null;
  runStatus?: string;
  runCreatedAt?: string;
  steps?: readonly RunStepInput[];
  runInput?: JsonValue;
  runState?: JsonValue;
  history: WorkflowRunV2[];
  onSelectRun?: (run: WorkflowRunV2) => void;
  onUseBinding: (binding: Binding) => string | undefined;
  /** Tool nodes with no single empty parameter cannot accept "使用"; show this instead. */
  useBindingHint?: string;
  /** This node's own preflight problem; other nodes' conflicts never disable the test. */
  testBlockReason?: string;
  onClose: () => void;
};

type DataItem = { key: string; label: string; title?: string; type: string; value?: JsonValue; writer?: string; binding: Binding };

/** Summarize a sample value; raw JSON never becomes the visible label. */
export function workbenchSampleSummary(value: JsonValue | undefined): string {
  if (value === undefined) return "最近一次运行没有值";
  if (value === null) return "空值";
  if (Array.isArray(value)) {
    if (!value.length) return "0 项";
    const conversations = value.every(item => item && typeof item === "object" && !Array.isArray(item) && ("role" in item || "content" in item));
    return conversations ? `${value.length} 条对话` : `${value.length} 项`;
  }
  if (typeof value === "object") {
    const fields = Object.keys(value);
    if (!fields.length) return "空对象";
    if (("role" in value) || (("content" in value) && ("type" in value))) return "1 条对话";
    return `对象 · ${fields.length} 个字段`;
  }
  const text = String(value);
  if (text.length > 90) return `${text.slice(0, 90)}…`;
  return text;
}

function sampleText(value: JsonValue | undefined): string {
  return workbenchSampleSummary(value);
}

function asSchema(value: JsonValue | undefined): JsonSchema {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function properties(schema: JsonSchema): [string, JsonSchema][] {
  const value = schema.properties;
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).map(([name, child]) => [name, asSchema(child)]);
}

function typeLabel(schema: JsonSchema): string {
  return stateTypeLabel(typeof schema.type === "string" ? schema.type : "string");
}

function runTime(createdAt?: string): string {
  if (!createdAt) return "所选运行";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "所选运行";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Large node workbench. Three columns: available data, the same config sections as the side
 * panel, and a real node test (editing) or the selected run's step result (read-only history).
 */
export function NodeDebugDialog(props: NodeDebugDialogProps) {
  const { open, definition, node, graphPath, environmentRef, environmentSchema, producers, sections, readOnly, initialFocus, runId, runStatus, runCreatedAt, steps, runInput, runState, onUseBinding, useBindingHint = "", testBlockReason, onClose } = props;
  const [status, setStatus] = useState("");
  const [selectedItem, setSelectedItem] = useState("");
  const labels = useMemo(() => nodeLabelIndex(definition), [definition]);
  const resolvedRun = useRunSteps({ runId, steps });
  const runSteps = resolvedRun.steps;
  const data = useMemo(() => runSteps ? nodeRunData(definition, runSteps, node.id, graphPath) : null, [definition, runSteps, node.id, graphPath]);
  const testRef = useRef<HTMLElement>(null);
  useEffect(() => { if (open && initialFocus === "test") testRef.current?.focus(); }, [open, initialFocus, node.id]);

  if (!open) return null;
  const Icon = typeIcons[node.type as keyof typeof typeIcons] ?? Boxes;
  const inputGroups: { title: string; items: DataItem[] }[] = [];
  const startItems: DataItem[] = properties(definition.inputSchema).map(([name, schema]) => ({
    key: `input:/${name}`, label: name, title: typeof schema.title === "string" ? schema.title : undefined, type: typeLabel(schema),
    value: runInput && typeof runInput === "object" && !Array.isArray(runInput) ? (runInput as Record<string, JsonValue>)[name] : undefined,
    binding: { source: "input", pointer: `/${name}`, onMissing: { mode: "error" } },
  }));
  if (startItems.length) inputGroups.push({ title: "启动输入", items: startItems });
  const runRecord = runState && typeof runState === "object" && !Array.isArray(runState) ? runState as Record<string, JsonValue> : {};
  const stateItems: DataItem[] = properties(definition.state.schema).map(([name, schema]) => {
    const writer = producers.get(name)?.[0];
    return { key: `state:/${name}`, label: name, title: typeof schema.title === "string" ? schema.title : undefined, type: typeLabel(schema), value: runRecord[name], writer: writer ? labels.get(writer) ?? writer : undefined, binding: { source: "state", pointer: `/${name}`, onMissing: { mode: "error" } } };
  });
  if (stateItems.length) inputGroups.push({ title: "流程数据（上游节点写入）", items: stateItems });
  // Environment values are an advanced source; only show them when this flow actually reads one.
  const usesEnvironment = definition.nodes.some(candidate => Object.values(candidate.inputs).some(binding => binding.source === "environment"))
    || Object.values(definition.state.inputBindings).some(binding => binding.source === "environment")
    || Object.values(definition.outputBindings).some(binding => binding.source === "environment");
  if (usesEnvironment && environmentSchema && Object.keys(environmentSchema.properties ?? {}).length) {
    const environmentItems: DataItem[] = [];
    for (const [name, schema] of properties(environmentSchema)) environmentItems.push({ key: `env:/${name}`, label: name, title: typeof schema.title === "string" ? schema.title : undefined, type: typeLabel(schema), binding: { source: "environment", pointer: `/${name}`, onMissing: { mode: "error" } } });
    inputGroups.push({ title: "环境变量", items: environmentItems });
  }

  function useItem(item: DataItem) {
    setSelectedItem(item.key);
    const message = onUseBinding(item.binding);
    if (message) setStatus(message);
  }

  const historyLabel = readOnly ? `查看 ${runTime(runCreatedAt)} 的运行 · 只读` : "正在编辑";

  return <div className="wf-workbench-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="wf-workbench" role="dialog" aria-modal="true" aria-label={`节点工作台 · ${node.label}`} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <header className="wf-workbench-head">
        <span className="wf-workbench-icon" aria-hidden="true"><Icon size={17} /></span>
        <h2>{node.label}</h2>
        <span className="wf-nodepanel-badge" data-type={node.type}>{nodePanelTypeLabel(node.type)}</span>
        <small>{historyLabel}</small>
        <span className="wf-workbench-spacer" />
        <button type="button" className="wf-workbench-close" aria-label="关闭工作台" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="wf-workbench-columns">
        <aside className="wf-workbench-data" aria-label="可用数据">
          <div><h3>可用数据</h3><p>拖到中间的参数行即可使用</p></div>
          {inputGroups.map(group => <section key={group.title} className="wf-workbench-group">
            <h4>{group.title}</h4>
            {group.items.map(item => <div key={item.key} className={`wf-workbench-item${selectedItem === item.key ? " selected" : ""}`} draggable={!readOnly} onDragStart={readOnly ? undefined : event => { event.dataTransfer.setData(DROP_BINDING_TYPE, JSON.stringify(item.binding)); event.dataTransfer.effectAllowed = "copy"; setSelectedItem(item.key); }}>
              <span className="wf-workbench-grip" aria-hidden="true">⠿</span>
              <span className="wf-workbench-item-body">
                <span className="wf-workbench-item-main">
                  <strong title={item.label}>{item.label}</strong>
                  <small className="wf-workbench-item-type">{item.type}</small>
                  <button type="button" className="wf-workbench-use" aria-label={`使用 ${item.label}`} disabled={readOnly || Boolean(useBindingHint)} title={useBindingHint || undefined} onClick={() => useItem(item)}>使用</button>
                </span>
                <span className="wf-workbench-item-sub">
                  {item.title && item.title !== item.label ? <span className="wf-workbench-item-meta" title={item.title}>{item.title}</span> : null}
                  {item.writer ? <span className="wf-workbench-item-meta" title={`来自 ${item.writer}`}>来自 {item.writer}</span> : null}
                  {item.value !== undefined ? <span className="wf-workbench-item-value" title={sampleText(item.value)}>{sampleText(item.value)}</span> : null}
                </span>
              </span>
            </div>)}
          </section>)}
          {!inputGroups.length ? <p className="wf-field-note">这个节点还没有可用字段。</p> : null}
          <p className="wf-workbench-hint">{useBindingHint || "松开后会自动填入参数，并记录来自哪个字段。"}</p>
          {status ? <p role="status" className="wf-workbench-status">{status}</p> : null}
        </aside>
        <div className="wf-workbench-config" aria-label="节点配置">
          <NodePanelSections sections={sections} />
        </div>
        <aside className="wf-workbench-test" aria-label="测试" tabIndex={-1} ref={testRef}>
          <h3>测试</h3>
          {readOnly ? <section className="wf-workbench-history">
            <h4>{data ? `${data.status} · 第 ${data.stepIndex + 1} 步` : "运行数据"}</h4>
            {data ? <><ReadableRunOutput value={data.output} text={data.output === undefined ? "此步骤没有输出记录" : ""} /><h4>写入流程数据</h4>{data.writes.length ? <ul className="wf-workbench-writes">{data.writes.map(write => <li key={write.field}><code>{write.field}</code><span>{write.value === undefined ? "未产生值" : sampleText(write.value)}</span></li>)}</ul> : <p className="wf-field-note">此节点没有写入映射。</p>}</> : <p className="wf-field-note">本次运行未经过此节点，或还没有选择运行。</p>}
            {runId ? <small>所选运行 · {runTime(runCreatedAt)}{runStatus ? ` · ${runStatus}` : ""}</small> : null}
          </section> : <NodeTestRunner key={`${node.id}:${environmentRef}:${runId ?? "draft"}:${JSON.stringify(runInput).slice(0, 80)}`} definition={definition} node={node} environmentRef={environmentRef} input={runInput ?? {}} initialState={runState ?? definition.state.initial} blocked={false} blockedReason={testBlockReason} />}
        </aside>
      </div>
    </section>
  </div>;
}
