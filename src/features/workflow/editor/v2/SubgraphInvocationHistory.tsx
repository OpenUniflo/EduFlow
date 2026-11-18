import { useState } from "react";
import { graphInNode, nodeAtGraphPath } from "../../domain/v2/authoring";
import type { WorkflowDefinitionV2, WorkflowStepV2 } from "../../domain/v2/types";
import { readOutputPointer } from "../../domain/v2/runData";
import { formatRunDuration, runStepDuration } from "../../domain/v2/runSummary";
import type { RunReferenceSnapshot } from "../../domain/v2/runReferences";
import { executionStatus } from "./executionPresentation";
import { StructuredValue } from "./RunOutput";
import { subgraphInvocationDetails, type SubgraphInvocationDetail } from "./subgraphInvocations";

function short(value: string | undefined): string {
  return value ? value.slice(0, 8) : "未记录";
}

function when(value: string | undefined): string {
  if (!value) return "时间未记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function graphPathLabel(definition: WorkflowDefinitionV2, path: readonly string[]): string {
  const labels: string[] = [];
  for (let index = 0; index < path.length; index++) {
    const node = nodeAtGraphPath(definition, path.slice(0, index), path[index]);
    labels.push(node?.label ?? path[index]);
  }
  return labels.join(" / ");
}

function targetName(snapshot: RunReferenceSnapshot | null | undefined, workflowId: string | undefined, revision: number | undefined, environmentRef?: string): string | undefined {
  if (!workflowId || !revision) return undefined;
  return snapshot?.targets.find(target => target.workflowId === workflowId && target.revision === revision && (!environmentRef || target.environmentRef === environmentRef))?.name;
}

/**
 * One readable line for the actual call chain. Names come only from the root
 * definition and the Run's frozen targets; a missing name falls back to the
 * stored Workflow id, never to a current target lookup.
 */
function workflowPathLabel(definition: WorkflowDefinitionV2, detail: SubgraphInvocationDetail, snapshot?: RunReferenceSnapshot | null): string {
  const parts = [definition.name || "父流程"];
  const records = detail.workflowPath ?? [];
  if (!records.length) {
    const caller = graphPathLabel(definition, detail.callerGraphPath);
    parts.push(`调用节点 ${detail.callerNodeLabel ?? detail.callerNodeId}${caller ? `（${caller}）` : ""}`);
    return parts.join(" → ");
  }
  for (let index = 0; index < records.length; index++) {
    const entry = records[index];
    const node = nodeAtGraphPath(definition, detail.graphPath.slice(0, index), entry.nodeId);
    const embeddedName = node && node.type === "core.subgraph" ? graphInNode(node)?.name : undefined;
    const name = targetName(snapshot, entry.workflowId, entry.revision, entry.environmentRef) ?? embeddedName;
    parts.push(`调用节点 ${node?.label ?? entry.nodeId}`);
    parts.push(`${name ?? entry.workflowId ?? "未知目标"}（版本 ${entry.revision ?? "未记录"}${entry.environmentRef ? ` · 环境 ${entry.environmentRef}` : " · 内嵌子图"}）`);
  }
  return parts.join(" → ");
}

function stepLabel(definition: WorkflowDefinitionV2, detail: SubgraphInvocationDetail, step: WorkflowStepV2): string {
  const graph = detail.target?.definition ?? definition;
  // A frozen target definition starts at the call site, so strip the caller
  // prefix before resolving its internal Step label.
  const relative = detail.target ? (step.graphPath ?? detail.graphPath).slice(detail.graphPath.length) : (step.graphPath ?? detail.graphPath);
  return nodeAtGraphPath(graph, relative, step.nodeId)?.label ?? step.nodeId;
}

function writeRows(definition: WorkflowDefinitionV2, detail: SubgraphInvocationDetail): { field: string; value: string }[] {
  const node = nodeAtGraphPath(definition, detail.callerGraphPath, detail.callerNodeId);
  if (!node) return [];
  return Object.entries(node.writes ?? {}).map(([field, pointer]) => {
    const value = readOutputPointer(detail.output, pointer);
    return { field, value: value === undefined ? "无返回字段" : typeof value === "string" ? value : JSON.stringify(value) };
  });
}

function runningState(detail: SubgraphInvocationDetail): string {
  if (detail.error) return `失败 · ${detail.error.code}`;
  return executionStatus[detail.status] ?? detail.status;
}

export function SubgraphInvocationHistory({ definition, steps, referenceSnapshot, referenceLoading = false, onSelect, onOpenPath, onOpenWorkflow }: {
  definition: WorkflowDefinitionV2;
  steps: WorkflowStepV2[];
  referenceSnapshot?: RunReferenceSnapshot | null;
  referenceLoading?: boolean;
  onSelect?: (group: SubgraphInvocationDetail) => void;
  onOpenPath?: (path: string[], nodeId?: string) => void;
  onOpenWorkflow?: (workflowId: string) => void;
}) {
  const groups = subgraphInvocationDetails(steps, definition, referenceSnapshot);
  const [selectedKey, setSelectedKey] = useState("");
  if (!groups.length) return null;
  const selected = groups.find(group => group.key === selectedKey) ?? groups[0];
  const index = groups.indexOf(selected);
  const letter = String.fromCharCode(65 + index);
  const ordered = [...selected.steps].sort((left, right) => (left.startedAt ?? "").localeCompare(right.startedAt ?? "") || left.invocation - right.invocation || left.attempt - right.attempt);
  const declared = selected.declaredTarget;
  const target = selected.target;
  const writes = writeRows(definition, selected);
  const missingSnapshot = selected.fixed && !target && !referenceLoading;
  return <details className="wf-subgraph-invocations">
    <summary>子流程调用（{groups.length}）</summary>
    <p className="wf-field-note">按实际调用路径、检查点命名空间和调用任务分组；同一目标的重复调用、不同层级的同名节点与重试尝试分别列出。固定引用显示本 Run 冻结的版本，不是目标当前最新版本。</p>
    {referenceLoading ? <p className="wf-field-note" role="status">正在读取此 Run 的冻结引用快照…</p> : null}
    <label>选择调用实例<select aria-label="选择子图调用实例" value={selected.key} onChange={event => { setSelectedKey(event.target.value); const group = groups.find(item => item.key === event.target.value); if (group) onSelect?.(group); }}>{groups.map((group, groupIndex) => <option key={group.key} value={group.key}>实例 {String.fromCharCode(65 + groupIndex)} · {workflowPathLabel(definition, group, referenceSnapshot)} · {group.steps.length} 步 · {when(group.startedAt)}</option>)}</select></label>
    <section aria-label={`子图调用实例 ${letter}`}>
      <p><strong>实例 {letter}</strong> · {selected.fixed ? "固定引用" : "内嵌子图"} · {runningState(selected)}</p>
      <dl className="wf-data-fields">
        <div><dt>调用路径</dt><dd>{workflowPathLabel(definition, selected, referenceSnapshot)}</dd></div>
        <div><dt>调用节点</dt><dd>{selected.callerNodeLabel ?? selected.callerNodeId}{selected.callerGraphPath.length ? ` · ${graphPathLabel(definition, selected.callerGraphPath)}` : ""}</dd></div>
        {declared ? <div><dt>固定目标</dt><dd>{target?.name ?? "未命名目标"} · 版本 {declared.revision} · 环境 {declared.environmentRef}{target ? "（本 Run 冻结定义）" : "（冻结定义缺失）"}<small className="wf-subgraph-target-id">{declared.workflowId}</small></dd></div> : null}
        <div><dt>时间</dt><dd>{when(selected.startedAt)} → {when(selected.finishedAt)}</dd></div>
        <div><dt>调用耗时</dt><dd>{formatRunDuration(selected.callStep ? runStepDuration(selected.callStep) : undefined) || "未记录"}</dd></div>
        <div><dt>内部步骤</dt><dd>{selected.steps.length} 步{selected.attemptCount > 1 ? ` · 最多 ${selected.attemptCount} 次尝试` : ""} · 任务 {short(selected.taskId)}</dd></div>
      </dl>
      {selected.error ? <p className="wf-subgraph-error" role="alert">调用失败：{selected.error.code} · {selected.error.message}</p> : null}
      {!selected.callStep ? <p className="wf-field-note" role="note">未找到父调用步骤；状态按内部步骤的最新一次尝试推断，更早的失败尝试只保留在步骤明细中。</p> : null}
      <div className="wf-subgraph-actions">
        {!selected.fixed ? <button type="button" onClick={() => onOpenPath?.(selected.graphPath)}>打开只读子图</button> : null}
        {selected.fixed && target ? <button type="button" onClick={() => onOpenPath?.(selected.graphPath)}>打开当时只读画布</button> : null}
        {selected.fixed && !target && !referenceLoading ? <span className="wf-field-note" role="note">此 Run 的冻结引用快照缺失，无法打开当时的只读画布；不会回退到目标当前最新版本。</span> : null}
        {target && onOpenWorkflow ? <button type="button" className="wf-subgraph-current" title="在独立页面打开目标当前作品；不会改变此历史视图" onClick={() => onOpenWorkflow(target.workflowId)}>另开当前作品（目标当前版本，不改变历史）</button> : null}
      </div>
      <h5>调用输入</h5>
      <StructuredValue value={selected.input ?? null}/>
      <details><summary>调用输入技术详情</summary><pre>{JSON.stringify(selected.input ?? null, null, 2)}</pre></details>
      <h5>内部步骤</h5>
      <ol className="wf-subgraph-step-list">{ordered.map(step => <li key={`${step.stepId}-${step.attempt}`}><details>
        <summary>{stepLabel(definition, selected, step)} · 序号 {step.invocation} · 第 {step.attempt} 次尝试 · {executionStatus[step.status] ?? step.status}</summary>
        {onOpenPath && (!selected.fixed || Boolean(target)) ? <button type="button" onClick={() => onOpenPath(selected.graphPath, step.nodeId)}>在历史画布中定位</button> : null}
        <h6>步骤输入</h6><StructuredValue value={step.input ?? null}/>
        <h6>步骤返回</h6><StructuredValue value={step.output ?? null}/>
        {step.error ? <p className="wf-subgraph-error" role="alert">{step.error.code} · {step.error.message}</p> : null}
        <details><summary>步骤技术详情</summary><pre>{JSON.stringify(step, null, 2)}</pre></details>
      </details></li>)}</ol>
      <h5>返回值</h5>
      <StructuredValue value={selected.output ?? null}/>
      <details><summary>返回值技术详情</summary><pre>{JSON.stringify(selected.output ?? null, null, 2)}</pre></details>
      <h5>下游父流程数据</h5>
      {writes.length ? <dl className="wf-data-fields">{writes.map(row => <div key={row.field}><dt>{row.field}</dt><dd className="wf-data-text">{row.value}</dd></div>)}</dl> : <p className="wf-field-note">此调用没有声明写入父流程字段；父流程最终输出仍以本次 Run 的输出为准。</p>}
    </section>
  </details>;
}
