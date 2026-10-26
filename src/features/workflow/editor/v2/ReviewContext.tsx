import { nodeAuthoring } from "../../domain/v2/authoring";
import type { JsonValue, WorkflowDefinitionV2, WorkflowStepV2, WorkflowThreadV2 } from "../../domain/v2/types";
import { StructuredValue } from "./RunOutput";

type Interrupt = WorkflowThreadV2["interrupts"][number];

function stateObject(value: JsonValue): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : {};
}

function pointerName(pointer: string): string {
  return pointer.replace(/^\//, "").replace(/~1/g, "/").replace(/~0/g, "~");
}

export function reviewContextFacts(definition: WorkflowDefinitionV2, thread: WorkflowThreadV2, interrupt: Interrupt, steps: WorkflowStepV2[]) {
  const node = definition.nodes.find(item => item.id === interrupt.nodeId);
  const authoring = node ? nodeAuthoring(node) : {};
  const mapping = authoring.interrupt?.resumeWrites ?? {};
  const state = stateObject(thread.state);
  const fields = [...new Set([
    ...Object.values(mapping),
    ...Object.entries(node?.inputs ?? {}).flatMap(([, binding]) => binding.source === "state" ? [pointerName(binding.pointer)] : []),
    ...Object.keys(node?.writes ?? {}),
  ])];
  const related = [...steps].filter(step => step.nodeId === interrupt.nodeId && step.output !== undefined).sort((left, right) => right.invocation - left.invocation || right.attempt - left.attempt)[0];
  const available = fields.filter(field => state[field] !== undefined);
  return {
    node,
    mapping,
    state,
    fields,
    related,
    available,
    missing: fields.length > 0 && !related && !available.length,
    task: interrupt.taskId ? interrupt.taskId.slice(0, 8) : "未提供",
    path: interrupt.graphPath?.length ? interrupt.graphPath.join(" / ") : "主图",
  };
}

export function ReviewContext({ definition, thread, interrupt, steps }: { definition: WorkflowDefinitionV2; thread: WorkflowThreadV2; interrupt: Interrupt; steps: WorkflowStepV2[] }) {
  const facts = reviewContextFacts(definition, thread, interrupt, steps);
  return <details className="wf-review-context">
    <summary>审核依据 · {interrupt.title} · {facts.node?.label ?? interrupt.nodeId}{facts.missing ? " · 缺少依据" : ""}</summary>
    <p className="wf-field-note">以下来自本次冻结修订与当前执行记录，不是其他任务或最新草稿。</p>
    <dl className="wf-data-fields">
      <div><dt>待审对象</dt><dd>{interrupt.title}{facts.node ? ` · ${facts.node.label}` : ""}</dd></div>
      <div><dt>执行身份</dt><dd>保存版本 {definition.revision} · 任务 {facts.task} · {facts.path}</dd></div>
      <div><dt>相关共享状态</dt><dd>{facts.fields.length ? <ul className="wf-review-values">{facts.fields.slice(0, 4).map(field => <li key={field}><strong>{field}</strong><StructuredValue value={facts.state[field] ?? null}/></li>)}</ul> : "此回应没有关联的流程数据读取或写入字段。"}</dd></div>
      <div><dt>关联输出</dt><dd>{facts.related ? <StructuredValue value={facts.related.output ?? null}/> : "暂无已完成步骤输出；请先核对执行记录，再决定是否批准。"}</dd></div>
      <div><dt>提交后写入</dt><dd>{Object.entries(facts.mapping).length ? Object.entries(facts.mapping).map(([source, target]) => `${source} → 流程数据.${target}`).join("；") : "此回应只继续流程，不写入流程数据。"}</dd></div>
    </dl>
    {facts.missing ? <p role="alert">当前没有可用的审核依据。请先核对运行状态或保存进度，不要仅凭空表单批准。</p> : null}
    <details><summary>技术标识</summary><small>运行 {thread.currentRunId}<br/>进度 {thread.checkpointId}</small></details>
    {facts.fields.length > 4 ? <details><summary>其余 {facts.fields.length - 4} 个相关状态字段</summary><ul>{facts.fields.slice(4).map(field => <li key={field}><strong>{field}</strong><StructuredValue value={facts.state[field] ?? null}/></li>)}</ul></details> : null}
  </details>;
}
