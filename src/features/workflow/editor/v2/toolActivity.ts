import type { JsonValue, WorkflowDefinitionV2, WorkflowEventV2, WorkflowRunV2, WorkflowTool } from "../../domain/v2/types";

export type ToolActivity = { key: string; stepId?: string; nodeId?: string; toolCallId: string; toolRef?: string; status: "running" | "success" | "failed" | "skipped"; effect?: "none" | "confirmed" | "unknown"; result?: JsonValue };
const object = (value: JsonValue | undefined) => value && typeof value === "object" && !Array.isArray(value) ? value : undefined;

/** Execution events remain authoritative even when a failed batch commits no Step output or State. */
export function toolActivities(runId: string, events: WorkflowEventV2[]): ToolActivity[] {
  const calls = new Map<string, ToolActivity>();
  for (const event of events.filter(event => event.runId === runId && event.type.startsWith("tool.")).sort((a, b) => a.seq - b.seq)) {
    const payload = object(event.payload);
    if (typeof payload?.toolCallId !== "string") continue;
    const key = JSON.stringify([event.stepId ?? event.nodeId, payload.toolCallId]);
    const previous = calls.get(key);
    const call: ToolActivity = previous ?? { key, stepId: event.stepId, nodeId: event.nodeId, toolCallId: payload.toolCallId, status: "running" };
    if (event.type === "tool.started") { call.status = "running"; if (typeof payload.toolRef === "string") call.toolRef = payload.toolRef; }
    else if (event.type === "tool.completed") { call.status = "success"; call.result = payload.result; call.effect = payload.effect === "confirmed" ? "confirmed" : payload.effect === "none" ? "none" : "unknown"; }
    else if (event.type === "tool.failed") { call.status = "failed"; const effect = object(payload.error)?.effect; call.effect = effect === "none" ? "none" : "unknown"; }
    else if (event.type === "tool.skipped") call.status = "skipped";
    else continue;
    calls.set(key, call);
  }
  return [...calls.values()];
}

export function externalEffectNotice(run: Pick<WorkflowRunV2, "runId" | "status" | "error">, events: WorkflowEventV2[], complete: boolean): string {
  const calls = toolActivities(run.runId, events);
  // Expiring an idle human wait adds no external effect. Actual tool events still apply.
  const runEffect=run.error?.code==='WAIT_EXPIRED'?undefined:run.error?.effect;
  const confirmed = Math.max(calls.filter(call => call.effect === "confirmed").length, runEffect === "confirmed" ? 1 : 0);
  const uncertain = calls.some(call => call.effect === "unknown" || call.status === "running") || runEffect === "unknown";
  return [confirmed ? `已有 ${confirmed} 项外部写入成功；流程失败或取消不会撤回这些写入。` : "",
    uncertain ? "部分外部操作的结果尚不确定，请先核对。" : "",
    !complete ? "执行记录尚未加载完整，不能据此认定没有外部操作。" : "",
    confirmed || uncertain || !complete ? "再次运行会重新执行，可能造成重复写入。" : ""].filter(Boolean).join(" ");
}

/** True when the flow can call a tool that is declared to write an external system. */
export function definitionHasExternalWriteTools(definition: WorkflowDefinitionV2, tools: readonly WorkflowTool[]): boolean {
  const writes = new Set(tools.filter(tool => tool.sideEffect === "write").map(tool => tool.ref));
  const walk = (scope: WorkflowDefinitionV2): boolean => scope.nodes.some(node => {
    const config = node.config;
    const refs = [...(typeof config.toolRef === "string" && config.toolRef ? [config.toolRef] : []), ...(Array.isArray(config.allowedToolRefs) ? config.allowedToolRefs.filter((ref): ref is string => typeof ref === "string") : [])];
    if (refs.some(ref => writes.has(ref))) return true;
    const graph = config.graph;
    return Boolean(graph && typeof graph === "object" && Array.isArray((graph as unknown as WorkflowDefinitionV2).nodes) && walk(graph as unknown as WorkflowDefinitionV2));
  });
  return walk(definition);
}
