import { useState } from "react";
import { graphAtPath } from "../../domain/v2/authoring";
import type { WorkflowDefinitionV2, WorkflowStepV2 } from "../../domain/v2/types";
import { executionStatus } from "./executionPresentation";
import { StructuredValue } from "./RunOutput";
import { subgraphInvocations, type SubgraphInvocation } from "./subgraphInvocations";

function childDefinition(definition: WorkflowDefinitionV2, path: string[]): WorkflowDefinitionV2 {
  try { return graphAtPath(definition, path); } catch { return definition; }
}

function pathLabel(definition: WorkflowDefinitionV2, path: string[]): string {
  let graph = definition;
  const labels: string[] = [];
  for (const id of path) {
    const node = graph.nodes.find(item => item.id === id);
    labels.push(node?.label ?? id);
    if (!node || node.type !== "core.subgraph") break;
    graph = childDefinition(graph, [id]);
  }
  return labels.join(" / ");
}

function stepLabel(definition: WorkflowDefinitionV2, step: WorkflowStepV2): string {
  const graph = childDefinition(definition, step.graphPath ?? []);
  return graph.nodes.find(node => node.id === step.nodeId)?.label ?? step.nodeId;
}

function short(value: string | undefined): string {
  return value ? value.slice(0, 8) : "未记录";
}

function when(value: string | undefined): string {
  if (!value) return "时间未记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function SubgraphInvocationHistory({ definition, steps, onSelect }: { definition: WorkflowDefinitionV2; steps: WorkflowStepV2[]; onSelect?: (group: SubgraphInvocation) => void }) {
  const groups = subgraphInvocations(steps);
  const [selectedKey, setSelectedKey] = useState("");
  if (!groups.length) return null;
  const selected = groups.find(group => group.key === selectedKey) ?? groups[0];
  const index = groups.indexOf(selected);
  const letter = String.fromCharCode(65 + index);
  const ordered = [...selected.steps].sort((left, right) => (left.startedAt ?? "").localeCompare(right.startedAt ?? "") || left.invocation - right.invocation || left.attempt - right.attempt);
  return <details className="wf-subgraph-invocations">
    <summary>子图调用实例（{groups.length}）</summary>
    <p className="wf-field-note">按执行记录中的子图路径与 checkpoint namespace 分组；同一路径的并发调用会分别列出。时间只用于识别，不代表调度顺序。{onSelect ? "选择实例会切换到对应子图并过滤画布步骤。" : ""}</p>
    <label>选择调用实例<select aria-label="选择子图调用实例" value={selected.key} onChange={event => { setSelectedKey(event.target.value); const group = groups.find(item => item.key === event.target.value); if (group) onSelect?.(group); }}>{groups.map((group, groupIndex) => <option key={group.key} value={group.key}>实例 {String.fromCharCode(65 + groupIndex)} · {pathLabel(definition, group.graphPath)} · {group.steps.length} 步 · {when(group.startedAt)}</option>)}</select></label>
    <section aria-label={`子图调用实例 ${letter}`}>
      <p><strong>实例 {letter}</strong> · 路径 {pathLabel(definition, selected.graphPath)} · 任务 {short(selected.taskId)} · namespace {short(selected.namespace)}</p>
      <p className="wf-field-note">时间：{when(selected.startedAt)} → {when(selected.finishedAt)}</p>
      <ol className="wf-subgraph-step-list">{ordered.map(step => <li key={`${step.stepId}-${step.attempt}`}><details><summary>{stepLabel(definition, step)} · 序号 {step.invocation} · {executionStatus[step.status] ?? step.status}</summary><h5>输入</h5><StructuredValue value={step.input ?? null}/><h5>返回</h5><StructuredValue value={step.output ?? null}/><details><summary>步骤技术详情</summary><pre>{JSON.stringify(step, null, 2)}</pre></details></details></li>)}</ol>
    </section>
  </details>;
}
