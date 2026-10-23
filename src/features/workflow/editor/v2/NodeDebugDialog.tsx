import { useMemo, useState, type ReactNode } from "react";
import type { Binding, JsonSchema, JsonValue, WorkflowDefinitionV2, WorkflowEnvironment, WorkflowNodeV2, WorkflowRunV2 } from "../../domain/v2/types";
import { defaultParamName, stateFieldProducers } from "../../domain/v2/dataFlow";
import { nodeRunData, readOutputPointer, type RunStepInput } from "../../domain/v2/runData";
import { NodeParamsTable, DROP_BINDING_TYPE } from "./NodeParamsTable";
import { useRunSteps } from "./NodeRunDataTab";
import { VariablePicker } from "./VariablePicker";
import { ReadableRunOutput } from "./RunOutput";
import { nodeLabelIndex } from "./StateFields";

export type NodeDebugDialogProps = {
  open: boolean;
  definition: WorkflowDefinitionV2;
  node: WorkflowNodeV2;
  graphPath: string[];
  environment?: WorkflowEnvironment;
  environmentSchema: JsonSchema;
  producers: Map<string, string[]>;
  consumers: Map<string, string[]>;
  inputs: Record<string, Binding>;
  onChangeInputs: (inputs: Record<string, Binding>) => void;
  processingContent: ReactNode;
  runId?: string | null;
  runStatus?: string;
  runCreatedAt?: string;
  steps?: readonly RunStepInput[];
  runInput?: JsonValue;
  history: WorkflowRunV2[];
  onSelectRun?: (run: WorkflowRunV2) => void;
  onViewHistory?: () => void;
  onClose: () => void;
};

type DataItem = { key: string; label: string; value?: JsonValue; binding: Binding };

/**
 * L3 debug overlay (M9): available data on the left, the same configuration table in the
 * middle and the selected step's output/writes on the right. Dragging a data field onto a
 * parameter row rebinds it; dropping onto the "新增参数" zone creates a parameter.
 */
export function NodeDebugDialog({ open, definition, node, graphPath, environment, environmentSchema, producers, inputs, onChangeInputs, processingContent, runId, runCreatedAt, runStatus, steps, runInput, history, onSelectRun, onViewHistory, onClose }: NodeDebugDialogProps) {
  const [selectedItem, setSelectedItem] = useState<string>("");
  const [target, setTarget] = useState<string>("");
  const [status, setStatus] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const labels = useMemo(() => nodeLabelIndex(definition), [definition]);
  const resolvedRun = useRunSteps({ runId, steps });
  const runSteps = resolvedRun.steps;
  const data = useMemo(() => runSteps ? nodeRunData(definition, runSteps, node.id, graphPath) : null, [definition, runSteps, node.id, graphPath]);
  const inputProperties = (definition.inputSchema.properties ?? {}) as Record<string, JsonSchema>;
  const groups: { title: string; items: DataItem[] }[] = [];
  const startItems: DataItem[] = Object.entries(inputProperties).slice(0, 40).map(([name, schema]) => ({ key: `input:/${name}`, label: `${name} · ${String(schema.title ?? "启动输入")}`, value: runInput && typeof runInput === "object" && !Array.isArray(runInput) ? (runInput as Record<string, JsonValue>)[name] : undefined, binding: { source: "input", pointer: `/${name}`, onMissing: { mode: "error" } } }));
  groups.push({ title: "启动输入", items: startItems });
  const stateItems: DataItem[] = [];
  for (const field of Object.keys((definition.state.schema.properties ?? {}) as Record<string, JsonSchema>)) {
    const writer = producers.get(field)?.find(id => labels.has(id));
    const write = writer ? [...(runSteps ?? [])].reverse().find(step => step.nodeId === writer) : undefined;
    const nodeWrites = write ? definition.nodes.find(candidate => candidate.id === writer)?.writes?.[field] : undefined;
    stateItems.push({ key: `state:/${field}`, label: `${field} · State${writer ? ` · 来自 ${labels.get(writer)}` : " · 共享"}`, value: write ? readOutputPointer(write.output, typeof nodeWrites === "string" ? nodeWrites : "") : undefined, binding: { source: "state", pointer: `/${field}`, onMissing: { mode: "error" } } });
  }
  groups.push({ title: "State 与上游输出", items: stateItems });
  const environmentItems: DataItem[] = Object.entries(environment?.variables ?? {}).map(([key, value]) => ({ key: `environment:/${key}`, label: `${key} · 环境变量`, value: typeof value === "boolean" ? value : String(value), binding: { source: "environment", pointer: `/${key}`, onMissing: { mode: "error" } } }));
  groups.push({ title: "环境变量", items: environmentItems });

  if (!open) return null;
  const allItems = groups.flatMap(group => group.items);
  const selected = allItems.find(item => item.key === selectedItem);
  const targetOptions = Object.keys(inputs);

  function dropBinding(targetName: string | null, binding: Binding) {
    if (targetName) { onChangeInputs({ ...inputs, [targetName]: binding }); setStatus(`已把参数 ${targetName} 重新绑定到 ${binding.source === "literal" ? "固定值" : binding.pointer}。`); return; }
    const name = defaultParamName(binding, new Set(Object.keys(inputs)));
    onChangeInputs({ ...inputs, [name]: binding });
    setStatus(`已新增参数 ${name}，绑定到 ${binding.source === "literal" ? "固定值" : binding.pointer}。关闭悬窗后可在侧面板继续编辑，且可撤销。`);
  }
  function keyboardBind() {
    if (!selected) { setStatus("先在左栏选择一个字段。"); return; }
    dropBinding(target || null, selected.binding);
  }

  return <div className="wf-debug-backdrop" role="presentation">
    <section className="wf-debug-dialog" role="dialog" aria-modal="true" aria-label={`展开调试 · ${node.label}`}>
      <header className="wf-debug-head"><div><strong>展开调试 · {node.label}</strong><small>{runId ? `来源运行 ${runId.slice(0, 8)}${runCreatedAt ? ` · ${new Date(runCreatedAt).toLocaleString()}` : ""}${runStatus ? ` · ${runStatus}` : ""}` : "还没有选择运行；左栏只显示定义中的字段。"}</small></div>
        <div className="wf-debug-head-actions">{history.length ? <label>运行<select aria-label="调试运行" value={runId ?? ""} onChange={event => { const run = history.find(item => item.runId === event.target.value); if (run) onSelectRun?.(run); }}><option value="">选择运行</option>{history.map(run => <option key={run.runId} value={run.runId}>修订 {run.revision} · {new Date(run.createdAt).toLocaleString()} · {run.status}</option>)}</select></label> : null}{onViewHistory ? <button type="button" onClick={onViewHistory}>在历史中查看</button> : null}<button type="button" onClick={onClose}>收回侧面板</button><button type="button" aria-label="关闭调试" onClick={onClose}>关闭</button></div>
      </header>
      <div className="wf-debug-columns">
        <section className="wf-debug-column" aria-label="可用数据"><h3>可用数据</h3><p className="wf-field-note">来自所选运行的实际值；拖到中栏参数行可重新绑定，拖到「新增参数」可创建参数。</p>{groups.map(group => <div key={group.title} className="wf-debug-group"><h4>{group.title} · {group.items.length}</h4>{group.items.length ? group.items.map(item => <button type="button" key={item.key} className={`wf-debug-item${selectedItem === item.key ? " selected" : ""}`} draggable onDragStart={event => { event.dataTransfer.setData(DROP_BINDING_TYPE, JSON.stringify(item.binding)); event.dataTransfer.effectAllowed = "copy"; setSelectedItem(item.key); }} onClick={() => setSelectedItem(item.key)}><strong>{item.label}</strong><small>{item.value === undefined ? "运行中没有值" : JSON.stringify(item.value).slice(0, 120)}</small></button>) : <p className="wf-field-note">没有可用字段。</p>}</div>)}<div className="wf-debug-bind"><label>键盘绑定<select aria-label="调试绑定目标" value={target} onChange={event => setTarget(event.target.value)}><option value="">新建参数</option>{targetOptions.map(name => <option key={name} value={name}>{name}</option>)}</select></label><button type="button" disabled={!selected} onClick={keyboardBind}>绑定到{target ? ` ${target}` : "新参数"}</button></div></section>
        <section className="wf-debug-column wf-debug-config" aria-label="节点配置"><h3>配置</h3>{processingContent}<h3>输入参数</h3><NodeParamsTable mode="declared" inputs={inputs} onChangeInputs={onChangeInputs} inputSchema={definition.inputSchema} stateSchema={definition.state.schema} environmentSchema={environmentSchema} environmentVariables={environment?.variables} producers={producers} nodeLabels={Object.fromEntries(labels)} onDropBinding={dropBinding}/><div className="wf-debug-inline"><button type="button" onClick={() => setPickerOpen(true)}>用变量选择器新增参数</button>{pickerOpen ? <VariablePicker inputSchema={definition.inputSchema} stateSchema={definition.state.schema} environmentSchema={environmentSchema} environmentVariables={environment?.variables} producers={producers} nodeLabels={Object.fromEntries(labels)} onPick={binding => { setPickerOpen(false); dropBinding(null, binding); }} onPickLiteral={() => { setPickerOpen(false); dropBinding(null, { source: "literal", value: "" }); }} onClose={() => setPickerOpen(false)}/> : null}</div>{status ? <p role="status" className="wf-run-data-note">{status}</p> : null}</section>
        <section className="wf-debug-column" aria-label="输出与写入"><h3>输出与写入 State</h3>{data ? <><h4>{data.status} · 第 {data.stepIndex + 1} 步{data.elapsedMs === undefined ? "" : ` · ${data.elapsedMs}ms`}</h4><ReadableRunOutput value={data.output} text={data.output === undefined ? "此步骤没有输出记录" : ""}/><h4>写入 State</h4>{data.writes.length ? <table className="wf-flow-variable-table"><tbody>{data.writes.map(write => <tr key={write.field}><td><code>{write.field}</code></td><td>{write.value === undefined ? "未产生值" : JSON.stringify(write.value).slice(0, 160)}</td><td>{write.reducer}</td></tr>)}</tbody></table> : <p className="wf-field-note">此节点没有写入映射。</p>}</> : <p className="wf-field-note">本次运行未经过此节点，或还没有选择运行。</p>}</section>
      </div>
    </section>
  </div>;
}
