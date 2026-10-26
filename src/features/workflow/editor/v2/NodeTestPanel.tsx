import { useState } from "react";
import { workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { ApiRequestError } from "@/shared/api/apiClient";
import { presentRequestFailure } from "./errorPresentation";
import type { JsonValue, WorkflowDefinitionV2, WorkflowNodeV2 } from "../../domain/v2/types";
import { SchemaForm } from "./SchemaForm";
import { validateSchemaValue } from "../../domain/v2/validation";
import { formatRunDuration } from "../../domain/v2/runSummary";
import { ReadableRunOutput, StructuredValue } from "./RunOutput";
import { RunValueList } from "./RunValueList";

export type TestResult = Awaited<ReturnType<typeof workflowApiV2.testNode>>;

function rawOutputText(value: JsonValue): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2) ?? ""; } catch { return String(value); }
}

/**
 * Result of one real node test. Writes use the same compact summary rows as
 * “运行数据”; the untouched node return stays available in a collapsed
 * “完整返回” section so nested tool payloads never dominate the workbench.
 */
export function NodeTestResult({ node, result, elapsed }: { node: WorkflowNodeV2; result: TestResult; elapsed: number | null }) {
  const writes = result.writes && typeof result.writes === "object" && !Array.isArray(result.writes) ? result.writes : undefined;
  const writeCount = writes ? Object.keys(writes).length : 0;
  return <section className="wf-test-result" aria-label="节点测试结果">
    <header><strong>测试结果</strong><span>{elapsed === null ? "" : `耗时 ${formatRunDuration(elapsed)}`}</span></header>
    {node.type === "core.llm" ? <ReadableRunOutput value={result.output} text={typeof result.output === "string" ? result.output : JSON.stringify(result.output, null, 2)} /> : null}
    <section className="wf-run-data-block wf-test-writes">
      <header className="wf-run-data-block-head"><span aria-hidden="true" className="wf-run-data-accent" /><div><h3>写入的数据</h3><p>{writeCount ? `这条测试写入流程数据的字段 · ${writeCount} 项` : "这条测试没有写入流程数据"}</p></div></header>
      {writeCount && writes ? <RunValueList value={writes} layout="stacked" emptyText="没有写入。"/> : <p className="wf-test-write-empty">没有写入。</p>}
    </section>
    <details className="wf-test-raw"><summary>完整返回</summary>{result.output === undefined ? <p>没有返回内容。</p> : <pre>{rawOutputText(result.output)}</pre>}</details>
    <details><summary>测试前后流程数据</summary><h4>测试前</h4><StructuredValue value={result.stateBefore} /><h4>测试后</h4><StructuredValue value={result.stateAfter} /></details>
  </section>;
}

/**
 * Real node test. The parent supplies the latest run input/state as starting values; the user can
 * edit them, and the request always goes through the existing server node-test boundary.
 */
export function NodeTestRunner({ definition, node, environmentRef, input, initialState, blocked = false, blockedReason }: { definition: WorkflowDefinitionV2; node: WorkflowNodeV2; environmentRef: string; input: JsonValue; initialState?: JsonValue; blocked?: boolean; blockedReason?: string }) {
  const [state, setState] = useState<JsonValue>(() => initialState ?? definition.state.initial);
  const [testInput, setTestInput] = useState(input);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [invalidInput, setInvalidInput] = useState("");
  const [invalidState, setInvalidState] = useState("");
  const inputValid = validateSchemaValue(definition.inputSchema, testInput).valid;
  const stateValid = validateSchemaValue(definition.state.schema, state).valid;

  if (["core.start", "core.end"].includes(node.type)) return null;
  if (node.type.startsWith("control.") || node.type === "core.subgraph") return <p className="wf-test-note">控制流和子图请运行整个工作流验证。</p>;

  async function test() {
    setBusy(true); setError(""); setResult(null); setElapsed(null);
    const started = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      setResult(await workflowApiV2.testNode({ workflowId: definition.workflowId, baseRevision: definition.revision, definition, nodeId: node.id, input: testInput, state, environmentRef, confirmExternalEffect: confirmed }));
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? presentRequestFailure(reason.code, reason.status) : reason instanceof Error ? reason.message : "测试没有完成。请检查配置与网络后重试。");
    } finally {
      const finished = typeof performance !== "undefined" ? performance.now() : Date.now();
      setElapsed(Math.max(0, finished - started));
      setBusy(false);
    }
  }

  return <div className="wf-test-runner">
    <div className="wf-test-field"><div className="wf-test-label">测试输入 <small>已带入最近一次的值，可修改</small></div>
      <SchemaForm label="测试输入" draftKind="run-input" prefix={`test-input-${node.id}`} schema={definition.inputSchema} value={testInput} onChange={setTestInput} onInvalid={setInvalidInput} />
    </div>
    <details className="wf-test-state"><summary>流程数据测试值</summary><SchemaForm label="流程数据测试值" draftKind="run-input" prefix={`test-state-${node.id}`} schema={definition.state.schema} value={state} onChange={setState} onInvalid={setInvalidState} /></details>
    {["core.tool", "core.tool_dispatch"].includes(node.type) ? <label className="wf-v2-checkbox wf-test-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>允许本次测试调用工具，可能修改外部数据。</span></label> : null}
    <button type="button" className="primary wf-test-run" disabled={busy || blocked || Boolean(blockedReason) || !environmentRef || !inputValid || !stateValid || Boolean(invalidInput || invalidState)} onClick={() => void test()}>{busy ? "正在测试…" : "测试这个节点"}</button>
    <small className="wf-test-note">会真实调用模型或工具，并消耗一次调用。</small>
    {blockedReason ? <p role="status" className="wf-test-block-reason">先修复本节点：{blockedReason}</p> : blocked ? <p role="status">请先完成未应用的配置编辑。</p> : null}
    {error ? <p role="alert" className="wf-test-error">{error}</p> : null}
    {result ? <NodeTestResult node={node} result={result} elapsed={elapsed}/> : null}
  </div>;
}
