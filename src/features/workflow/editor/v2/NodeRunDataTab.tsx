import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../../repository/v2/WorkflowApiV2";
import { nodeRunData, type RunStepInput } from "../../domain/v2/runData";
import { formatRunDuration, runStatusTone } from "../../domain/v2/runSummary";
import type { JsonValue, WorkflowDefinitionV2, WorkflowExecutionError, WorkflowStepV2 } from "../../domain/v2/types";
import { presentExecutionError, type ErrorActionHint } from "./errorPresentation";
import { ExecutionErrorCard } from "./ExecutionErrorCard";
import { RunValueList } from "./RunValueList";

export type NodeRunDataTabProps = {
  definition: WorkflowDefinitionV2;
  nodeId: string;
  graphPath: string[];
  /** Selected run from history observation; when absent the tab resolves the latest run itself. */
  runId?: string | null;
  runStatus?: string;
  runCreatedAt?: string;
  /** Run-level error used when the failed step did not persist its own error. */
  runError?: WorkflowExecutionError;
  /** Frozen variable environment name for the run summary tag. */
  runEnvironment?: string | null;
  /** Steps supplied by the controller (observed run); omit to fetch by runId. */
  steps?: readonly RunStepInput[];
  onErrorAction?: (hint: ErrorActionHint) => void;
};

function toRunStep(step: WorkflowStepV2): RunStepInput {
  return { stepId: step.stepId, runId: step.runId, nodeId: step.nodeId, status: step.status, ...(step.input === undefined ? {} : { input: step.input }), ...(step.output === undefined ? {} : { output: step.output }), ...(step.startedAt ? { startedAt: step.startedAt } : {}), ...(step.finishedAt ? { finishedAt: step.finishedAt } : {}), ...(step.graphPath ? { graphPath: step.graphPath } : {}), ...(step.error ? { error: step.error } : {}) };
}

const statusNames: Record<string, string> = { completed: "已完成", success: "已完成", failed: "失败", running: "运行中", waiting: "等待回应", cancelled: "已停止", interrupted: "执行中断", queued: "排队中", prepared: "结果已暂存", continued: "已继续" };

/**
 * “运行数据” tab (batch 3): the node's input and written State values for the
 * selected run, defaulting to the latest. Read-only; no update mode and no raw
 * JSON in the list. The JSON stays available through the copy action.
 */
export function useRunSteps({ runId, steps }: { runId?: string | null; steps?: readonly RunStepInput[] }): { steps?: readonly RunStepInput[]; loading: boolean; error: string } {
  const [fetched, setFetched] = useState<RunStepInput[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const supplied = steps;
  useEffect(() => {
    let active = true;
    if (steps !== undefined || !runId) { setFetched(null); setLoading(false); setError(""); return () => { active = false; }; }
    setLoading(true);
    void workflowApiV2.steps(runId).then(result => { if (active) { setFetched(result.items.map(toRunStep)); setError(""); } }).catch(reason => { if (active) setError(workflowErrorMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [runId, steps === undefined]);
  if (steps !== undefined) return { steps, loading: false, error: "" };
  return { steps: fetched ?? undefined, loading, error };
}

function runTime(value: string | undefined): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function NodeRunDataTab({ definition, nodeId, graphPath, runId, runStatus, runCreatedAt, runError, runEnvironment, steps, onErrorAction }: NodeRunDataTabProps) {
  const [copied, setCopied] = useState("");
  const resolved = useRunSteps({ runId, steps });
  const supplied = resolved.steps;
  const loading = resolved.loading;
  const error = resolved.error;
  const data = useMemo(() => supplied ? nodeRunData(definition, supplied, nodeId, graphPath) : null, [definition, nodeId, graphPath, supplied]);
  const presentedError = data?.error ? presentExecutionError(data.error, { savedAt: runCreatedAt }) : runStatus === "failed" && runError ? presentExecutionError(runError, { savedAt: runCreatedAt }) : undefined;

  function copyJson() {
    if (!data) return;
    const text = JSON.stringify({ input: data.input, output: data.output, writes: data.writes, elapsedMs: data.elapsedMs, stepIndex: data.stepIndex, invocationCount: data.invocationCount }, null, 2);
    void navigator.clipboard?.writeText(text).then(() => setCopied("已复制这组运行数据")).catch(() => setCopied("复制失败，请手动选择"));
  }

  if (error) return <p role="alert" className="wf-run-data-note">{error}</p>;
  if (loading) return <p className="wf-run-data-note">正在读取所选运行的数据…</p>;
  if (!data) {
    const failed = runStatus === "failed" && runError ? presentExecutionError(runError, { savedAt: runCreatedAt }) : undefined;
    return failed ? <section className="wf-run-data" aria-label="节点运行数据"><ExecutionErrorCard error={failed} onAction={onErrorAction}/><p className="wf-run-data-note">此节点在读取或校验输入时停止，尚未产生执行步骤。</p></section> : <p className="wf-run-data-note">本次运行未经过此节点{runId ? "" : "；工作流还没有可用的运行记录"}。</p>;
  }

  const tone = runStatusTone(data.status);
  const writes: Record<string, JsonValue> = Object.fromEntries(data.writes.map(write => [write.field, write.value ?? null]));
  return <section className="wf-run-data" aria-label="节点运行数据">
    <div className="wf-run-data-meta">
      <span>{runTime(runCreatedAt)}</span><span aria-hidden="true">·</span>
      <span className="wf-run-data-duration">{data.elapsedMs === undefined ? "耗时未记录" : formatRunDuration(data.elapsedMs)}</span><span aria-hidden="true">·</span>
      <span className="wf-run-env-tag">{runEnvironment?.trim() || "默认"}</span>
      <span className="wf-run-data-meta-spacer" />
      <span className={`wf-run-status ${tone}`}><i aria-hidden="true" />{statusNames[data.status] ?? data.status}</span>
    </div>
    {presentedError ? <ExecutionErrorCard error={presentedError} onAction={onErrorAction}/> : null}
    <section className="wf-run-data-block">
      <header className="wf-run-data-block-head"><span aria-hidden="true" className="wf-run-data-accent" /><div><h3>本次输入</h3><p>这次运行读到的值 · {data.input === undefined ? 0 : (data.input && typeof data.input === "object" && !Array.isArray(data.input) ? Object.keys(data.input).length : 1)} 项</p></div></header>
      <RunValueList value={data.input} scalarName="输入" layout="stacked" emptyText="此步骤没有输入记录。"/>
    </section>
    <section className="wf-run-data-block">
      <header className="wf-run-data-block-head"><span aria-hidden="true" className="wf-run-data-accent" /><div><h3>写入的数据</h3><p>{data.writes.length ? `这次运行写入流程数据的字段 · ${data.writes.length} 项` : "此节点没有写入流程数据"}</p></div></header>
      {data.writes.length ? <RunValueList value={writes} layout="inline" emptyText="此节点没有写入流程数据。"/> : <p className="wf-run-data-note">此节点没有写入流程数据的映射。</p>}
    </section>
    <footer className="wf-run-data-footer">
      <small>运行数据为只读</small>
      <span className="wf-run-data-meta-spacer" />
      <button type="button" className="wf-run-data-copy" onClick={copyJson}><Copy size={11} aria-hidden="true"/>复制 JSON</button>
      {copied ? <small role="status">{copied}</small> : null}
    </footer>
  </section>;
}
