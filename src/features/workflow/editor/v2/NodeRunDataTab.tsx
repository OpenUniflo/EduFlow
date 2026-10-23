import { useEffect, useMemo, useState } from "react";
import { workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../../repository/v2/WorkflowApiV2";
import { nodeRunData, type RunStepInput } from "../../domain/v2/runData";
import type { JsonValue, WorkflowDefinitionV2, WorkflowStepV2 } from "../../domain/v2/types";
import { ReadableRunOutput } from "./RunOutput";

export type PreviewRunStep = { stepId?: string; nodeId: string; status: string; input?: JsonValue; output?: JsonValue; path?: string[]; pathKey?: string };

export type NodeRunDataTabProps = {
  definition: WorkflowDefinitionV2;
  nodeId: string;
  graphPath: string[];
  /** Selected run from history observation; when absent the tab resolves the latest run itself. */
  runId?: string | null;
  runStatus?: string;
  runCreatedAt?: string;
  /** Steps supplied by the controller (observed run) or frontend preview; omit to fetch by runId. */
  steps?: readonly RunStepInput[];
  previewSteps?: readonly PreviewRunStep[];
  onViewHistory?: () => void;
  onUseInput?: (input: JsonValue) => void;
};

function toRunStep(step: WorkflowStepV2): RunStepInput {
  return { stepId: step.stepId, runId: step.runId, nodeId: step.nodeId, status: step.status, ...(step.input === undefined ? {} : { input: step.input }), ...(step.output === undefined ? {} : { output: step.output }), ...(step.startedAt ? { startedAt: step.startedAt } : {}), ...(step.finishedAt ? { finishedAt: step.finishedAt } : {}), ...(step.graphPath ? { graphPath: step.graphPath } : {}) };
}

function previewToRunStep(step: PreviewRunStep, index: number): RunStepInput {
  return { stepId: step.stepId ?? `preview-${index}`, runId: "preview", nodeId: step.nodeId, status: step.status, ...(step.input === undefined ? {} : { input: step.input }), ...(step.output === undefined ? {} : { output: step.output }), graphPath: step.path ?? [] };
}

const statusNames: Record<string, string> = { completed: "完成", failed: "失败", running: "运行中", waiting: "等待回应", cancelled: "已停止", success: "完成" };

/**
 * “运行数据” tab (M9): the node's step in the run selected in the history drawer,
 * defaulting to the latest run. Reads only; State writes show the written value
 * (a full before/after comparison needs checkpoints and stays P1).
 */
export function useRunSteps({ runId, steps, previewSteps }: { runId?: string | null; steps?: readonly RunStepInput[]; previewSteps?: readonly PreviewRunStep[] }): { steps?: readonly RunStepInput[]; loading: boolean; error: string } {
  const [fetched, setFetched] = useState<RunStepInput[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const supplied = previewSteps ? previewSteps.map(previewToRunStep) : steps;
  const effectiveRunId = supplied !== undefined ? null : runId;
  useEffect(() => {
    let active = true;
    if (previewSteps || steps !== undefined || !runId) { setFetched(null); setLoading(false); setError(""); return () => { active = false; }; }
    setLoading(true);
    void workflowApiV2.steps(runId).then(result => { if (active) { setFetched(result.items.map(toRunStep)); setError(""); } }).catch(reason => { if (active) setError(workflowErrorMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [runId, steps === undefined, previewSteps === undefined]);
  if (previewSteps) return { steps: supplied, loading: false, error: "" };
  if (steps !== undefined) return { steps, loading: false, error: "" };
  return { steps: fetched ?? undefined, loading, error };
}

export function NodeRunDataTab({ definition, nodeId, graphPath, runId, runStatus, runCreatedAt, steps, previewSteps, onViewHistory, onUseInput }: NodeRunDataTabProps) {
  const [copied, setCopied] = useState("");
  const resolved = useRunSteps({ runId, steps, previewSteps });
  const supplied = resolved.steps;
  const loading = resolved.loading;
  const error = resolved.error;
  const data = useMemo(() => supplied ? nodeRunData(definition, supplied, nodeId, graphPath) : null, [definition, nodeId, graphPath, supplied]);
  const effectiveRunId = runId ?? null;

  function copyJson() {
    if (!data) return;
    const text = JSON.stringify({ input: data.input, output: data.output, writes: data.writes, elapsedMs: data.elapsedMs, stepIndex: data.stepIndex, invocationCount: data.invocationCount }, null, 2);
    void navigator.clipboard?.writeText(text).then(() => setCopied("已复制这组运行数据")).catch(() => setCopied("复制失败，请手动选择"));
    setCopied("已复制这组运行数据");
  }

  if (error) return <p role="alert" className="wf-run-data-note">{error}</p>;
  if (loading) return <p className="wf-run-data-note">正在读取所选运行的数据…</p>;
  if (!data) return <p className="wf-run-data-note">本次运行未经过此节点{effectiveRunId ? "" : "；工作流还没有可用的运行记录"}。</p>;

  const time = runCreatedAt ?? null;
  return <section className="wf-run-data" aria-label="节点运行数据">
    <header className="wf-run-data-source"><div><strong>{statusNames[data.status] ?? data.status}</strong><small>{time ? `来自运行 ${new Date(time).toLocaleString()} · ` : "来自运行 · "}第 {data.stepIndex + 1} 步{data.invocationCount > 1 ? ` · 共执行 ${data.invocationCount} 次（显示最后一次）` : ""}{data.elapsedMs === undefined ? "" : ` · ${data.elapsedMs}ms`}</small></div>{onViewHistory ? <button type="button" className="wf-text-button" onClick={onViewHistory}>在历史中查看</button> : null}</header>
    <section className="wf-run-data-block"><h4>输入</h4><ReadableRunOutput value={data.input} text={data.input === undefined ? "此步骤没有输入记录" : ""}/></section>
    <section className="wf-run-data-block"><h4>输出</h4><ReadableRunOutput value={data.output} text={data.output === undefined ? "此步骤没有输出记录" : ""}/></section>
    <section className="wf-run-data-block"><h4>写入 State</h4>{data.writes.length ? <table className="wf-flow-variable-table"><thead><tr><th>字段</th><th>写入值</th><th>更新方式</th></tr></thead><tbody>{data.writes.map(write => <tr key={write.field}><td><code>{write.field}</code></td><td>{write.value === undefined ? <span className="wf-state-muted">未产生值</span> : <code>{JSON.stringify(write.value).slice(0, 240)}</code>}</td><td>{write.reducer}</td></tr>)}</tbody></table> : <p className="wf-field-note">此节点没有写入 State 的映射。</p>}<small className="wf-run-data-note">只显示写入值；运行步骤不携带 State 快照，因此不显示写入前的值。</small></section>
    <footer className="wf-run-data-actions">{onUseInput && data.input !== undefined ? <button type="button" className="wf-text-button" onClick={() => onUseInput(data.input as JsonValue)}>用这组输入单步测试</button> : null}<button type="button" className="wf-text-button" onClick={copyJson}>复制 JSON</button>{copied ? <small role="status">{copied}</small> : null}</footer>
  </section>;
}
