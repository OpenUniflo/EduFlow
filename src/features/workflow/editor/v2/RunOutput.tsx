import type { JsonValue, WorkflowEventV2, WorkflowRunV2, WorkflowStepV2 } from "../../domain/v2/types";
import { summaryFields } from "./executionPresentation";
import { externalEffectNotice, toolActivities } from "./toolActivity";

function record(value: JsonValue | undefined) { return value && typeof value === "object" && !Array.isArray(value) ? value : undefined; }

/** Tool data remains text/data; HTML and scripts are never interpreted as markup. */
export function StructuredValue({ value, depth = 0 }: { value: JsonValue; depth?: number }) {
  if (value === null) return <span>空值</span>;
  if (typeof value !== "object") return <span className="wf-data-text">{typeof value === "boolean" ? value ? "是" : "否" : String(value)}</span>;
  if (depth >= 4) return <details><summary>展开详细数据</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
  if (Array.isArray(value)) return value.length ? <ol className="wf-data-list">{value.map((item, index) => <li key={index}><StructuredValue value={item} depth={depth + 1}/></li>)}</ol> : <span>空列表（[]）</span>;
  return Object.keys(value).length ? <dl className="wf-data-fields">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key}</dt><dd><StructuredValue value={item} depth={depth + 1}/></dd></div>)}</dl> : <span>无字段</span>;
}

export function readableAnswer(value: JsonValue | undefined, depth=0): string | undefined {
  if(depth>5)return undefined;
  const item=record(value);
  if(item?.role==="assistant"&&Array.isArray(item.content))return item.content.map(block=>typeof block==="string"?block:String(record(block)?.text??"")).join("\n")||undefined;
  if(Array.isArray(value)){for(const entry of [...value].reverse()){const answer=readableAnswer(entry,depth+1);if(answer)return answer;}return undefined;}
  if(!item)return undefined;
  for(const key of ["final_answer","answer","messages","result","response"]){const child=item[key];if(typeof child==="string"&&["final_answer","answer"].includes(key))return child;const answer=readableAnswer(child,depth+1);if(answer)return answer;}
  return undefined;
}
export function ReadableRunOutput({ value, text }: { value: JsonValue | undefined; text: string }) {
  const answer=readableAnswer(value);
  if(value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length)return <p>本次图输出未返回字段。节点仍可能更新了 State，可在执行详情中查看；需要返回数据时，请在图设置中配置图输出映射。</p>;
  return answer!==undefined?<div className="wf-answer-text">{answer}</div>:value!==null&&typeof value==="object"?<StructuredValue value={value}/>:<>{text}</>;
}

export function ToolStepOutput({ step }: { step: WorkflowStepV2 }) {
  const messages = record(step.output)?.toolMessages;
  const calls = record(step.input)?.toolCalls;
  if (!Array.isArray(messages)) return step.output === undefined ? null : <section aria-label="步骤输出"><h4>步骤输出 · 第 {step.invocation} 次调用</h4><ReadableRunOutput value={step.output} text={typeof step.output==="string"?step.output:""}/></section>;
  return <section aria-label="实际工具返回">{messages.map((message, index) => {
    const item = record(message); const call = Array.isArray(calls) ? calls.map(record).find(candidate => candidate?.id === item?.toolCallId) : undefined;
    const blocks = Array.isArray(item?.content) ? item.content : [];
    return <article key={typeof item?.id === "string" ? item.id : index}><h4>{typeof call?.name === "string" ? call.name : "工具"} · 第 {step.invocation} 次调用 · 实际返回</h4>{step.input !== undefined ? <small className="wf-record-summary">输入摘要：{summaryFields(step.input)}</small> : null}{blocks.map((block, blockIndex) => {
      const text = record(block)?.text;
      if (typeof text !== "string") return <p key={blockIndex}>此返回不是文本，请查看步骤技术详情。</p>;
      let value: JsonValue = text; try { value = JSON.parse(text); } catch { /* Ordinary tool text is readable as supplied. */ }
      return <StructuredValue key={blockIndex} value={value}/>;
    })}</article>;
  })}</section>;
}

type RunActivityProps = { run: WorkflowRunV2; events: WorkflowEventV2[]; complete: boolean };
export function RunEffectNotice({ run, events, complete }: RunActivityProps) {
  const terminal = ["success", "failed", "cancelled", "continued"].includes(run.status);
  const notice = terminal ? externalEffectNotice(run, events, complete) : "";
  return notice ? <p role={run.status === "success" ? "status" : "alert"} className="wf-v2-notice warning">{notice}</p> : null;
}

export function RunToolActivity({ run, events, complete, revealResults = false }: RunActivityProps & { revealResults?: boolean }) {
  const calls = toolActivities(run.runId, events);
  if (!calls.length && complete) return null;
  const terminal = ["success", "failed", "cancelled", "continued"].includes(run.status);
  const statuses = { running: "执行中，结果待确认", success: "已执行成功", failed: "执行失败", skipped: "未开始（前项失败后跳过）" };
  return <section aria-label="工具执行记录"><h3>实际工具执行</h3>
    {!calls.length ? <p>正在读取工具执行记录…</p> : <ol>{calls.map((call, index) => <li key={call.key}><strong>{call.toolRef ?? `工具调用 ${index + 1}`} · {terminal && call.status === "running" ? "调用已开始，结果未确认" : statuses[call.status]}</strong>{call.effect === "confirmed" ? <p>外部写入已成功，流程失败或取消不会自动撤回。</p> : call.effect === "unknown" ? <p>外部操作是否已发生需要核对。</p> : null}{call.result !== undefined ? <details open={revealResults || undefined}><summary>查看实际返回</summary><StructuredValue value={call.result}/></details> : null}<details><summary>工具调用身份</summary><small>Step {call.stepId} · {call.toolCallId}</small></details></li>)}</ol>}
  </section>;
}
