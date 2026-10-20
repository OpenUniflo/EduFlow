import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { JsonValue, WorkflowEventV2, WorkflowRunV2 } from "../../domain/v2/types";
import { toolActivities, externalEffectNotice } from "./toolActivity";
import { RunEffectNotice, RunToolActivity } from "./RunOutput";

const event = (seq: number, type: string, payload: JsonValue, stepId = "batch-1", runId = "run"): WorkflowEventV2 => ({ protocolVersion: "1", eventId: `${runId}-${seq}`, runId, seq, type, occurredAt: "2026-10-15T00:00:00Z", stepId, nodeId: "tools", payload });
const run = { runId: "run", status: "failed", error: { code: "HTTP_TOOL_FAILED", message: "read failed", effect: "none" } } as WorkflowRunV2;

it("retains a confirmed write when a later read fails and no batch State or Step output commits", () => {
  const events = [
    event(6, "tool.started", { callId: "write", toolCallId: "first", toolRef: "counter_write" }),
    event(7, "tool.completed", { callId: "write", toolCallId: "first", effect: "confirmed", result: { count: 1 } }),
    event(8, "tool.started", { callId: "read", toolCallId: "second", toolRef: "fault_500" }),
    event(9, "tool.failed", { callId: "read", toolCallId: "second", error: { effect: "none" } }),
    event(10, "tool.skipped", { toolCallId: "third", reason: "previous_tool_failed" }),
  ];
  expect(toolActivities("run", events).map(call => call.status)).toEqual(["success", "failed", "skipped"]);
  expect(externalEffectNotice(run, events, true)).toContain("已有 1 项外部写入成功");
  const html = renderToStaticMarkup(<><RunEffectNotice run={run} events={events} complete/><RunToolActivity run={run} events={events} complete/></>);
  expect(html).toContain("流程失败或取消不会撤回"); expect(html).toContain("已执行成功");
  expect(html).toContain("执行失败"); expect(html).toContain("未开始"); expect(html).toContain("count");
});

it("isolates a selected Run and separates repeated tool-call identities in loop invocations", () => {
  const events = [event(3, "tool.completed", { toolCallId: "same", effect: "confirmed", result: 1 }, "invocation-1"), event(9, "tool.completed", { toolCallId: "same", effect: "confirmed", result: 2 }, "invocation-2"), event(11, "tool.completed", { toolCallId: "same", effect: "confirmed", result: 3 }, "invocation-3", "other-run")];
  expect(toolActivities("run", events).map(call => call.result)).toEqual([1, 2]);
  expect(externalEffectNotice(run, events, true)).toContain("已有 2 项");
});

it("never treats unloaded or unfinished tool records as proof of no external effect", () => {
  expect(externalEffectNotice(run, [], false)).toContain("执行记录尚未加载完整");
  expect(externalEffectNotice(run, [event(2, "tool.started", { toolCallId: "first", toolRef: "counter_write" })], true)).toContain("结果尚不确定");
  expect(externalEffectNotice({ ...run, error: { ...run.error!, effect: "unknown" } }, [], true)).toContain("结果尚不确定");
  expect(externalEffectNotice({ ...run, error: { ...run.error!, effect: "confirmed" } }, [], true)).toContain("外部写入成功");
  expect(externalEffectNotice(run, [], true)).toBe("");
});

it("renders tool results as safe data without interpreting returned HTML", () => {
  const html = renderToStaticMarkup(<RunToolActivity run={run} events={[event(1, "tool.completed", { toolCallId: "echo", effect: "none", result: "<script>window.injected=true</script>" })]} complete/>);
  expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
});

it('does not turn a human-wait expiry into an unknown write, while retaining actual tool evidence',()=>{
  const expired={...run,error:{code:'WAIT_EXPIRED',message:'WAIT_EXPIRED',effect:'unknown' as const}};
  expect(externalEffectNotice(expired,[],true)).toBe('');
  expect(externalEffectNotice(expired,[],false)).toContain('尚未加载完整');
  expect(externalEffectNotice(expired,[event(1,'tool.completed',{toolCallId:'write',effect:'confirmed'})],true)).toContain('外部写入成功');
  expect(externalEffectNotice(expired,[event(1,'tool.started',{toolCallId:'write'})],true)).toContain('结果尚不确定');
});
