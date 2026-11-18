import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { JsonValue, WorkflowEventV2, WorkflowRunV2, WorkflowStepV2 } from "../../domain/v2/types";
import { toolActivities, externalEffectNotice, definitionHasExternalWriteTools } from "./toolActivity";
import { createNodeV2 } from "../../domain/v2/factory";
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
  const step = { stepId: "batch-1", runId: "run", nodeId: "tools", invocation: 2, attempt: 1, status: "failed", input: { toolCalls: [{ id: "first", name: "counter_write" }] } } as WorkflowStepV2;
  const html = renderToStaticMarkup(<><RunEffectNotice run={run} events={events} complete/><RunToolActivity run={run} events={events} complete steps={[step]}/></>);
  expect(html).toContain("流程失败或取消不会撤回"); expect(html).toContain("已执行成功");
  expect(html).toContain("执行失败"); expect(html).toContain("未开始"); expect(html).toContain("count");
  expect(html).toContain("第 2 次调用"); expect(html).toContain("输入摘要");
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

it("does not rewrite historical MCP writes from today's mutable tool metadata", () => {
  const events = [
    event(1, "tool.started", { toolCallId: "read", toolRef: "p4:owner:docs:1:read_wiki_structure" }),
    event(2, "tool.completed", { toolCallId: "read", effect: "confirmed", result: { outline: [] } }),
    event(3, "tool.started", { toolCallId: "malicious", toolRef: "p4:owner:docs:1:read_page" }),
    event(4, "tool.completed", { toolCallId: "malicious", effect: "confirmed", result: { ok: true } }),
    event(5, "tool.started", { toolCallId: "write", toolRef: "p4:owner:docs:1:update_page" }),
    event(6, "tool.completed", { toolCallId: "write", effect: "confirmed", result: { ok: true } }),
    event(7, "tool.started", { toolCallId: "non-mcp", toolRef: "counter_write" }),
    event(8, "tool.completed", { toolCallId: "non-mcp", effect: "confirmed", result: { count: 1 } }),
  ];
  const calls = toolActivities("run", events);
  expect(calls.map(call => [call.toolCallId, call.effect, call.legacyUnverified])).toEqual([
    ["read", "unknown", true],
    ["malicious", "unknown", true],
    ["write", "unknown", true],
    ["non-mcp", "confirmed", undefined],
  ]);
  const notice = externalEffectNotice(run, events, true);
  expect(notice).toContain("已有 1 项外部写入成功");
  expect(notice).toContain("结果尚不确定");
  const html = renderToStaticMarkup(<RunToolActivity run={run} events={events} complete/>);
  expect(html).toContain("旧记录仅确认调用完成，未记录可验证的外部写入事实");
  expect(html).toContain("外部写入已成功");
  expect(html).not.toContain("只读工具（服务声明），未记录外部写入");
});

it("keeps new MCP success unconfirmed and keeps non-MCP write confirmation", () => {
  const events = [
    event(1, "tool.started", { toolCallId: "mcp", toolRef: "p4:owner:docs:1:read_wiki_structure" }),
    event(2, "tool.completed", { toolCallId: "mcp", effect: "unknown", effectSource: "adapter", declaredReadOnly: true, result: { ok: true } }),
    event(3, "tool.started", { toolCallId: "http", toolRef: "p4:owner:price:1" }),
    event(4, "tool.completed", { toolCallId: "http", effect: "confirmed", effectSource: "declared", result: { ok: true } }),
  ];
  const calls = toolActivities("run", events);
  expect(calls.map(call => [call.toolCallId, call.effect, call.legacyUnverified])).toEqual([
    ["mcp", "unknown", undefined],
    ["http", "confirmed", undefined],
  ]);
  const html = renderToStaticMarkup(<RunToolActivity run={run} events={events} complete/>);
  expect(html).toContain("调用成功；未确认外部写入，可能有外部变更，请核对");
  expect(html).toContain("外部写入已成功");
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

it("warns about external writes only when the flow can call a write tool", () => {
  const start = createNodeV2("core.start", "start");
  const read = createNodeV2("core.tool", "read"); read.config = { toolRef: "hn_search", contractDigest: "d" };
  const write = createNodeV2("core.tool", "write"); write.config = { toolRef: "deploy_tool", contractDigest: "d" };
  const definition = { nodes: [start, read], transitions: [] } as unknown as import("../../domain/v2/types").WorkflowDefinitionV2;
  const tools = [
    { ref: "hn_search", name: "HN", contractDigest: "d", inputSchema: {}, sideEffect: "read" },
    { ref: "deploy_tool", name: "Deploy", contractDigest: "d", inputSchema: {}, sideEffect: "write" },
  ];
  expect(definitionHasExternalWriteTools(definition, tools)).toBe(false);
  expect(definitionHasExternalWriteTools({ ...definition, nodes: [start, read, write] }, tools)).toBe(true);
  const unknown = createNodeV2("core.tool", "unknown"); unknown.config = { toolRef: "p4:owner:docs:1:unannotated", contractDigest: "d" };
  expect(definitionHasExternalWriteTools({ ...definition, nodes: [start, unknown] }, [
    { ref: "p4:owner:docs:1:unannotated", name: "unannotated", contractDigest: "d", inputSchema: {}, sideEffect: "unknown" },
  ])).toBe(true);
});
