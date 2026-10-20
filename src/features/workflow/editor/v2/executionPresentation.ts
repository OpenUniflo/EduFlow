import { nodeAuthoring } from "../../domain/v2/authoring";
import type { JsonValue, WorkflowDefinitionV2, WorkflowEventV2, WorkflowNodeV2, WorkflowStepV2 } from "../../domain/v2/types";
export const executionStatus: Record<string, string> = { queued: "排队中", running: "执行中", waiting: "等待填写", success: "成功", completed: "已完成", failed: "失败", cancelled: "已取消", interrupted:"执行中断", prepared:"结果已暂存", continued:"已继续" };
export function processingDescription(node: WorkflowNodeV2): string {
  const type = node.type;
  if (type === "core.start") return "接收输入并初始化 State";
  if (type === "core.end") return "汇总流程输出";
  if (type === "core.llm") return `调用 ${String(node.config.modelRef || "模型")} 生成回复`;
  if (type === "core.tool") return `调用工具 ${String(node.config.toolRef || "待配置")}`;
  if (type === "core.tool_dispatch") return "执行模型请求的工具并收集结果";
  if (type === "core.router") return "检查条件，选择后续分支";
  const operation = String(node.config.operationRef);
  return ({ "core.identity": "原样传递读取值", "core.add": "将两个数字相加", "core.concat": "按分隔符连接文本", "core.message": "构建对话消息" })[operation] ?? "执行节点处理";
}
export function briefValue(value: JsonValue | undefined): string {
  if(value === undefined) return "尚无记录";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 110 ? text.slice(0,107) + "…" : text;
}
export function summaryFields(value: JsonValue | undefined): string {
  if(value && typeof value === "object" && !Array.isArray(value)) return Object.entries(value).slice(0,2).map(([name,content]) => `${name} · ${briefValue(content)}`).join("；") || "无字段";
  return briefValue(value);
}
const eventObject=(value:JsonValue|undefined)=>value&&typeof value==='object'&&!Array.isArray(value)?value:undefined;
export function stepStatePayload(step:WorkflowStepV2,events:WorkflowEventV2[],node?:WorkflowNodeV2):Record<string,JsonValue>|undefined{
  const direct=events.find(event=>event.runId===step.runId&&event.stepId===step.stepId&&event.type==='state.updated');
  if(direct)return eventObject(direct.payload);
  if(!node)return undefined;
  const completed=events.find(event=>event.runId===step.runId&&event.stepId===step.stepId&&event.type==='step.completed');
  const checkpoint=eventObject(completed?.payload)?.checkpointId;
  if(typeof checkpoint!=='string')return undefined;
  const merged=eventObject(events.find(event=>event.runId===step.runId&&event.type==='state.updated'&&eventObject(event.payload)?.checkpointId===checkpoint)?.payload);
  if(!merged)return undefined;
  const fields=new Set([...Object.keys(node.writes),...Object.values(nodeAuthoring(node).interrupt?.resumeWrites??{})]);
  const changes=Array.isArray(merged.changes)?merged.changes.filter(change=>{const field=eventObject(change)?.field;return typeof field==='string'&&fields.has(field);}):[];
  const patch=eventObject(merged.patch);
  return {changes,patch:Object.fromEntries(Object.entries(patch??{}).filter(([field])=>fields.has(field)))};
}
export function stepWrites(step: WorkflowStepV2, events: WorkflowEventV2[],node?:WorkflowNodeV2): Record<string, JsonValue> | undefined {
  const payload=stepStatePayload(step,events,node);
  if(!payload)return undefined;
  if(Array.isArray(payload.changes))return Object.fromEntries(payload.changes.map(item=>{const change=item as Record<string,JsonValue>;return [String(change.field),change.after];}));
  return eventObject(payload.patch);
}
export function latestNodeSteps(steps: WorkflowStepV2[]): Map<string, WorkflowStepV2> {
  const result = new Map<string, WorkflowStepV2>();
  for(const step of steps) { const previous = result.get(step.nodeId); if(!previous || step.invocation > previous.invocation || step.invocation === previous.invocation && step.attempt > previous.attempt) result.set(step.nodeId,step); }
  return result;
}
export function definitionForRun(definition: WorkflowDefinitionV2, snapshot?: WorkflowDefinitionV2): WorkflowDefinitionV2 { return snapshot ?? definition; }

export function presentRunSteps<T extends WorkflowStepV2>(run: {status:string;finishedAt?:string} | null, steps: T[]): T[] {
  if(!run||!["cancelled","failed"].includes(run.status))return steps;
  return steps.map(step=>["running","waiting","queued"].includes(step.status)||run.status==='cancelled'&&step.status==='failed'&&step.error?.code==='RUN_CANCELLED'?{...step,status:run.status==="cancelled"?"cancelled":"interrupted",finishedAt:step.finishedAt??run.finishedAt,error:step.error??{code:run.status==="cancelled"?"RUN_CANCELLED":"RUN_INTERRUPTED",message:run.status==="cancelled"?"运行已由用户取消，此步骤没有正常完成。":"运行已停止，此步骤结果需要核对。"}}:step);
}

/** A readable policy result for the current task, independent of graph layout. */
export function executionPolicySummary(events: import("../../domain/v2/types").WorkflowEventV2[], stepId?:string) {
  const own=events.filter(event=>event.stepId===stepId);
  const cached=own.filter(event=>event.type==="node.cache");
  const cache=cached[cached.length-1];
  const attempts=own.filter(event=>event.type==="node.attempt.started").length;
  const handled=own.some(event=>event.type==="node.handler.completed");
  return [cache?(cache.payload as Record<string,import("../../domain/v2/types").JsonValue>).hit?"缓存命中，已复用计算结果":"未命中缓存，已实际计算":"",attempts>1?`共尝试 ${attempts} 次（重试 ${attempts-1} 次）`:"",handled?"已执行错误处理，原始失败保留":""].filter(Boolean).join("；");
}
