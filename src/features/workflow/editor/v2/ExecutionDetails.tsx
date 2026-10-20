import { streamTextForStep } from "./streamingPresentation";
import type { WorkflowEventV2, WorkflowNodeV2, WorkflowStepV2 } from "../../domain/v2/types";
import { StructuredValue } from "./RunOutput";
import { executionStatus, processingDescription, stepWrites, stepStatePayload } from "./executionPresentation";
export function ExecutionDetails({ node, steps, events, stepId, onSelect }: { node: WorkflowNodeV2; steps: WorkflowStepV2[]; events: WorkflowEventV2[]; stepId?: string | null; onSelect: (id: string) => void }) {
  const invocations = steps.filter(step => step.nodeId === node.id);
  const step = invocations.find(step => step.stepId === stepId) ?? invocations[invocations.length-1];
  if (!step) return <p className="wf-empty-note">此节点尚无执行记录。运行后可查看实际读取、处理与写入。</p>;
  const streamed = streamTextForStep(events, step.stepId);
  const writes = stepWrites(step,events,node);
  const payload = stepStatePayload(step,events,node);
  const changes = payload && typeof payload === "object" && !Array.isArray(payload) && Array.isArray(payload.changes) ? payload.changes : [];
  return <section aria-label="节点执行详情"><label>本节点执行记录<select aria-label="执行次数" value={step.stepId} onChange={e => onSelect(e.target.value)}>{invocations.map(item => <option key={item.stepId} value={item.stepId}>第 {item.invocation} 步 · 尝试 {item.attempt} · {executionStatus[item.status] ?? item.status}</option>)}</select></label><div className="wf-execution-meta"><strong>{executionStatus[step.status] ?? step.status}</strong><span>{step.finishedAt && step.startedAt ? `${Math.max(0,new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime())} ms` : "执行尚未结束"}</span></div>
    {events.some(event=>event.stepId===step.stepId&&event.type.startsWith("node."))?<section className="wf-config-section"><h3>执行策略记录</h3><ol>{events.filter(event=>event.stepId===step.stepId&&event.type.startsWith("node.")).map(event=>{const p=event.payload as Record<string,import("../../domain/v2/types").JsonValue>;const labels:Record<string,string>={"node.attempt.started":"开始尝试","node.attempt.completed":"尝试完成","node.attempt.failed":"尝试失败","node.handler.started":"开始错误处理","node.handler.completed":"错误处理完成","node.cache":p.hit?"命中缓存，复用计算结果":"未命中缓存，已实际计算"};return <li key={event.eventId}>{labels[event.type]??event.type}{p.attempt?` · 第${p.attempt}次`:""}{p.error?` · ${String((p.error as Record<string,import("../../domain/v2/types").JsonValue>).code)}`:""}</li>;})}</ol></section>:null}
    <section className="wf-config-section"><h3>读取</h3>{step.input !== undefined ? <StructuredValue value={step.input}/> : <p>记录中没有读取值。</p>}</section>
    <section className="wf-config-section"><h3>处理</h3><p>{processingDescription(node)}</p>{step.error ? <p role={step.status==='cancelled'?'status':'alert'}>{step.status==='cancelled'?'运行已取消，此步骤没有正常完成。':`${step.error.code} · ${step.error.message}`}</p> : null}{streamed?<section aria-label="流式输出"><h4>流式输出{step.status==="running"?" · 接收中":""}</h4><div className="wf-readable-output" aria-live="polite">{streamed}</div></section>:null}<h4>节点返回</h4>{step.output !== undefined ? <StructuredValue value={step.output}/> : <p>尚未返回结果。</p>}</section>
    <section className="wf-config-section"><h3>写入</h3>{changes.length ? changes.map((value,index) => { const change = value as Record<string,import("../../domain/v2/types").JsonValue>; return <div key={index} className="wf-state-change"><strong>{String(change.field)}</strong><label>写入前<StructuredValue value={change.before ?? null}/></label><label>写入后<StructuredValue value={change.after ?? null}/></label></div>; }) : writes ? <><StructuredValue value={writes}/><small>此记录仅保存了写入补丁，缺少写入前后的完整值。</small></> : <p>{step.status === "completed" ? "没有写入 State。" : "尚未写入 State。"}</p>}</section>
    <details><summary>原始执行记录</summary><pre>{JSON.stringify(step,null,2)}</pre></details>
  </section>;
}
