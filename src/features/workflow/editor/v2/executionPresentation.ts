import { nodeAuthoring } from "../../domain/v2/authoring";
import type { JsonValue, WorkflowDefinitionV2, WorkflowEventV2, WorkflowNodeV2, WorkflowStepV2 } from "../../domain/v2/types";
export const executionStatus: Record<string, string> = { queued: "排队中", running: "执行中", waiting: "等待填写", success: "成功", completed: "已完成", failed: "失败", cancelled: "已取消", interrupted:"执行中断", prepared:"结果已暂存", continued:"已继续" };
const MAX_SUMMARY = 140;
const objectValue = (value: JsonValue | undefined): Record<string, JsonValue> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
function compact(value: string, max = MAX_SUMMARY): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
function roleLabel(role: string): string {
  return ({ user: "用户", assistant: "助手", system: "系统", tool: "工具" })[role] ?? role;
}
function contentText(value: JsonValue | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value.map(item => contentText(item)).filter((item): item is string => Boolean(item));
    return parts.length ? parts.join(" ") : undefined;
  }
  const object = objectValue(value);
  if (!object) return undefined;
  if (typeof object.text === "string") return object.text;
  if (typeof object.content === "string") return object.content;
  if (object.content !== undefined) return contentText(object.content);
  return undefined;
}
function messageText(value: JsonValue | undefined): string | undefined {
  const object = objectValue(value);
  if (!object) return undefined;
  const text = contentText(object.content) ?? (typeof object.text === "string" ? object.text : undefined) ?? (typeof object.message === "string" ? object.message : undefined);
  if (text === undefined) return undefined;
  return typeof object.role === "string" ? `${roleLabel(object.role)}：${text}` : text;
}
function briefPrimitive(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return compact(value, 60);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return compact(value.slice(0, 3).map(item => briefPrimitive(item)).join("、"), 80);
  const object = objectValue(value);
  if (!object) return "";
  return compact(Object.entries(object).slice(0, 3).map(([key, item]) => `${key}：${briefPrimitive(item)}`).join("；"), 100);
}
function toolText(value: JsonValue): string | undefined {
  const object = objectValue(value);
  if (!object) return undefined;
  const toolShape = object.tool !== undefined || object.toolName !== undefined || object.arguments !== undefined || object.args !== undefined || object.result !== undefined || object.output !== undefined;
  if (!toolShape) return undefined;
  const name = typeof object.name === "string" ? object.name : typeof object.tool === "string" ? object.tool : typeof object.toolName === "string" ? object.toolName : "工具";
  const args = object.arguments ?? object.args ?? object.input;
  const result = object.result ?? object.output ?? object.response;
  const parts = [name];
  if (args !== undefined) parts.push(`参数 ${briefPrimitive(args)}`);
  if (result !== undefined) parts.push(`结果 ${briefPrimitive(result)}`);
  return parts.join(" · ");
}
function reviewText(value: JsonValue[]): string | undefined {
  const parts = value.slice(0, 3).map(item => {
    const object = objectValue(item);
    if (!object) return undefined;
    const dimension = typeof object.dimension === "string" ? object.dimension : typeof object.name === "string" ? object.name : typeof object.title === "string" ? object.title : undefined;
    const conclusion = object.conclusion ?? object.result ?? object.verdict ?? object.score ?? object.value;
    if (!dimension && conclusion === undefined) return undefined;
    return [dimension, conclusion !== undefined ? briefPrimitive(conclusion) : undefined].filter(Boolean).join("：");
  }).filter((item): item is string => Boolean(item));
  return parts.length ? parts.join("；") : undefined;
}
export function processingDescription(node: WorkflowNodeV2): string {
  const type = node.type;
  if (type === "core.start") return "接收输入并初始化 State";
  if (type === "core.end") return "汇总流程输出";
  if (type === "core.llm") return `调用 ${String(node.config.modelRef || "模型")} 生成回复`;
  if (type === "core.tool") return `调用工具 ${String(node.config.toolRef || "待配置")}`;
  if (type === "core.tool_dispatch") return "执行模型请求的工具并收集结果";
  if (type === "core.router") return "检查条件，选择后续分支";
  if (type === "core.function") return `执行函数 ${String(node.config.functionRef || "用户代码")}`;
  if (type === "core.subgraph") { const graph = objectValue(node.config.graph); return `调用子图 ${typeof graph?.name === "string" ? graph.name : "内嵌子图"}`; }
  if (type === "core.memory") return "读取共享记忆";
  if (type === "control.parallel") return "并行分发任务";
  if (type === "control.join") return "汇合并行结果";
  if (type === "control.send") return "动态派发 Send";
  const operation = String(node.config.operationRef);
  return ({ "core.identity": "原样传递读取值", "core.add": "将两个数字相加", "core.concat": "按分隔符连接文本", "core.message": "构建对话消息" })[operation] ?? "执行节点处理";
}
export function briefValue(value: JsonValue | undefined): string {
  if (value === undefined) return "尚无记录";
  if (value === null) return "null";
  if (typeof value === "string") return compact(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const messages = value.filter(item => messageText(item) !== undefined);
    if (messages.length && messages.length === value.length) return compact(`${messages.length} 条消息；最后：${messageText(messages[messages.length - 1])}`);
    const tools = value.map(item => toolText(item)).filter((item): item is string => Boolean(item));
    if (tools.length && tools.length === value.length) return compact(tools.join("；"));
    const reviews = reviewText(value);
    if (reviews) return compact(reviews);
    return compact(value.slice(0, 3).map(item => briefValue(item)).join("；"));
  }
  const object = objectValue(value);
  if (!object) return "";
  const message = messageText(object);
  if (message !== undefined) return compact(message);
  if (Array.isArray(object.messages)) return compact(`消息：${briefValue(object.messages)}`);
  const toolCalls = object.toolCalls ?? object.tool_calls;
  if (Array.isArray(toolCalls)) return compact(`工具：${briefValue(toolCalls)}`);
  const reviews = object.reviews ?? object.dimensions ?? object.scores;
  if (Array.isArray(reviews)) return compact(`评审：${briefValue(reviews)}`);
  const tool = toolText(object);
  if (tool) return compact(tool);
  const preferred = ["text", "content", "message", "answer", "conclusion", "summary", "title", "value", "result", "status"];
  for (const key of preferred) if (object[key] !== undefined) return compact(`${key}：${briefPrimitive(object[key])}`);
  return compact(Object.entries(object).slice(0, 3).map(([key, item]) => `${key}：${briefPrimitive(item)}`).join("；")) || "无字段";
}
export function summaryFields(value: JsonValue | undefined): string {
  if (value === undefined) return "尚无记录";
  if (value === null) return "null";
  if (typeof value !== "object" || Array.isArray(value)) return briefValue(value);
  const object = objectValue(value)!;
  const message = messageText(object);
  if (message !== undefined) return compact(message);
  if (Array.isArray(object.messages)) return `messages · ${briefValue(object.messages)}`;
  const toolCalls = object.toolCalls ?? object.tool_calls;
  if (Array.isArray(toolCalls)) return `工具 · ${briefValue(toolCalls)}`;
  const reviews = object.reviews ?? object.dimensions ?? object.scores;
  if (Array.isArray(reviews)) return `评审 · ${briefValue(reviews)}`;
  const tool = toolText(object);
  if (tool) return compact(tool);
  const preferred = ["text", "content", "message", "answer", "conclusion", "summary", "title", "value", "result", "status"];
  const keys = [...new Set([...preferred.filter(key => object[key] !== undefined), ...Object.keys(object).filter(key => !preferred.includes(key))])].slice(0, 2);
  return keys.map(key => `${key} · ${briefPrimitive(object[key])}`).join("；") || "无字段";
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
