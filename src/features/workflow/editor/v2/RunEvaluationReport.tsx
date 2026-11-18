import { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, MinusCircle, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import type { WorkflowEvaluation, WorkflowEvaluationDimension, WorkflowEvaluationSemantic } from "../../domain/v2/types";

const statusLabel: Record<WorkflowEvaluation["status"], string> = {
  queued: "评价排队中",
  running: "正在评价",
  completed: "评价已完成",
  failed: "评价失败",
};
const outcomeLabel: Record<string, string> = {
  passed: "通过",
  needs_improvement: "待改进",
  failed: "未通过",
  insufficient_evidence: "证据不足",
  rules_passed: "基础检查通过",
};
const semanticLabel: Record<WorkflowEvaluationSemantic["status"], string> = {
  pending: "语义评价准备中",
  not_configured: "未设置语义评价",
  completed: "语义评价已完成",
  failed: "语义评价失败",
  skipped_hard_failure: "确定性检查未通过，未调用模型",
  insufficient_evidence: "证据不足，未做语义评价",
  not_evaluated: "语义评价未执行",
};

export function evaluationTone(item: WorkflowEvaluation | undefined) {
  if (!item) return "pending";
  if (item.status === "failed") return "danger";
  if (item.status === "queued" || item.status === "running") return "pending";
  if (item.outcome === "passed") return "passed";
  if (item.outcome === "failed") return "danger";
  if (item.outcome === "needs_improvement") return "warning";
  return "muted";
}

export function evaluationLabel(item: WorkflowEvaluation | undefined) {
  if (!item) return "尚未生成评价";
  if (item.status !== "completed") return statusLabel[item.status];
  return outcomeLabel[item.outcome ?? ""] ?? "评价已完成";
}

function timeText(value: string | null | undefined) {
  if (!value) return "时间未知";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN");
}

function DimensionIcon({ status }: { status: WorkflowEvaluationDimension["status"] }) {
  if (status === "passed") return <CheckCircle2 size={15} aria-hidden="true" />;
  if (status === "failed") return <XCircle size={15} aria-hidden="true" />;
  if (status === "not_evaluated") return <AlertTriangle size={15} aria-hidden="true" />;
  return <MinusCircle size={15} aria-hidden="true" />;
}

function dimensionStatusText(status: WorkflowEvaluationDimension["status"]) {
  return status === "passed" ? "通过" : status === "failed" ? "未通过" : status === "not_evaluated" ? "未评价" : "不适用";
}

function DimensionRow({ dimension }: { dimension: WorkflowEvaluationDimension }) {
  return <li className={`wf-eval-dimension ${dimension.status}`}>
    <span className="wf-eval-dimension-icon"><DimensionIcon status={dimension.status} /></span>
    <div className="wf-eval-dimension-copy">
      <div className="wf-eval-dimension-heading"><strong>{dimension.label}</strong><span>{dimension.source === "semantic" ? "目标评价" : "实际运行检查"} · {dimensionStatusText(dimension.status)}{typeof dimension.score === "number" ? ` · 模型评分 ${dimension.score.toFixed(2)}` : ""}</span></div>
      <p>{dimension.reason}</p>
      {dimension.evidence.length ? <details className="wf-eval-evidence"><summary>查看证据（{dimension.evidence.length}）</summary><dl>{dimension.evidence.map((evidence, index) => <div key={`${evidence.label}-${index}`}><dt>{evidence.label}</dt><dd>{evidence.value || "—"}</dd></div>)}</dl></details> : null}
    </div>
  </li>;
}

function SemanticNotice({ semantic }: { semantic: WorkflowEvaluationSemantic }) {
  if (semantic.status === "completed") return null;
  const alert = semantic.status === "failed";
  return <div className={`wf-eval-semantic ${alert ? "danger" : "muted"}`} role={alert ? "alert" : "status"}>
    <strong>{semanticLabel[semantic.status]}</strong>
    <p>{semantic.reason || "语义评价没有执行。"}</p>
    {semantic.errorCode ? <small>技术代码：{semantic.errorCode}</small> : null}
  </div>;
}

export function RunEvaluationReport({ evaluations, loading, error, runStatus, onRefresh, onRetry, busy }: {
  evaluations: WorkflowEvaluation[];
  loading: boolean;
  error: string;
  runStatus: string;
  onRefresh: () => void;
  onRetry: () => void;
  busy?: boolean;
}) {
  const [selectedId, setSelectedId] = useEvaluationSelection(evaluations);
  const selected = evaluations.find(item => item.evaluationId === selectedId) ?? evaluations[0] as WorkflowEvaluation | undefined;
  const terminalRun = ["success", "failed", "cancelled"].includes(runStatus);
  const report = selected?.report;
  const tone = evaluationTone(selected);
  return <section className="wf-eval-report" aria-label="完成情况评价">
    <header className="wf-eval-report-header">
      <div className="wf-eval-title"><span className="wf-eval-eyebrow"><ClipboardCheck size={14} aria-hidden="true" /> 完成评价</span><h3>这次运行完成得怎么样</h3></div>
      <span className={`wf-eval-badge ${tone}`} role="status">{loading && !selected ? "正在读取评价" : evaluationLabel(selected)}</span>
    </header>
    <p className="wf-field-note">运行状态与评价状态分开记录。评价只读取真实运行记录，不会改写原运行结果、学习进度或掌握度。</p>
    {error ? <div className="wf-eval-error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span>{error}</span><button type="button" onClick={onRefresh} disabled={loading}>刷新评价</button>{terminalRun ? <button type="button" onClick={onRetry} disabled={busy}>重新触发评价</button> : null}</div> : null}
    {!selected && !error ? <div className="wf-eval-empty" role="status">
      <span>{terminalRun ? (loading ? <><Loader2 size={15} className="spin" aria-hidden="true" /> 正在读取这次运行的完成评价…</> : "评价任务尚未出现。基础检查会在运行结束后自动开始；可稍后刷新。") : "运行结束后会自动开始基础检查。"}</span>
      {terminalRun ? <span className="wf-eval-empty-actions">
        <button type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={14} aria-hidden="true" />刷新评价</button>
        <button type="button" onClick={onRetry} disabled={busy}><RotateCcw size={14} aria-hidden="true" />重新触发评价</button>
        <small>重新触发只生成基础评价，不会重新运行工作流。</small>
      </span> : null}
    </div> : null}
    {selected ? <>
      {evaluations.length > 1 ? <label className="wf-eval-history">评价历史<select aria-label="选择评价记录" value={selected.evaluationId} onChange={event => setSelectedId(event.target.value)}>{evaluations.map((item, index) => <option key={item.evaluationId} value={item.evaluationId}>{index === evaluations.length - 1 ? "最早" : index === 0 ? "最新" : `第 ${evaluations.length - index} 次`} · {item.trigger === "manual" ? "手动重评" : "自动评价"} · {timeText(item.createdAt)}</option>)}</select></label> : null}
      {(selected.status === "queued" || selected.status === "running") ? <div className="wf-eval-progress" role="status"><Loader2 size={16} className="spin" aria-hidden="true" /><div><strong>{selected.status === "queued" ? "基础检查排队中" : "正在评价"}</strong><p>{selected.status === "queued" ? "运行已经结束，评价任务已持久化；页面刷新后仍会继续。" : "正在检查实际输出、步骤与工具记录；如果配置了目标，还会调用所选模型做目标完成评价。"}</p></div></div> : null}
      {selected.status === "failed" ? <div className="wf-eval-error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><div><strong>本次评价没有完成</strong><p>{selected.error?.message || "评价服务暂时不可用。"}</p><small>{selected.error?.code ?? "EVALUATION_FAILED"} · 第 {selected.attemptCount}/{selected.maxAttempts} 次尝试。原运行结果不受影响。</small></div></div> : null}
      {report ? <>
        <div className="wf-eval-total"><div><span className="wf-eval-kicker">{report.mode === "semantic" ? "基础检查 + 目标评价" : "基础运行检查"}</span><strong>{report.headline}</strong><p>{report.summary}</p></div><span className={`wf-eval-total-badge ${tone}`}>{outcomeLabel[report.outcome] ?? report.outcome}</span></div>
        <SemanticNotice semantic={report.semantic} />
        {report.trace.stepsTruncated || report.trace.toolEventsTruncated ? <div className="wf-eval-semantic danger" role="alert"><strong>证据记录不完整</strong><p>{report.trace.stepsTruncated ? `运行共有 ${report.trace.stepCount} 个步骤，本次只读取到 ${report.trace.stepReturned ?? "部分"} 个。` : ""}{report.trace.toolEventsTruncated ? `工具事件共有 ${report.trace.toolEventCount} 条，本次只读取到 ${report.trace.toolEventReturned ?? "部分"} 条。` : ""}不能把部分记录当成完整轨迹；请以完整运行记录为准。</p></div> : null}
        <ul className="wf-eval-dimensions" aria-label="评价维度">{report.dimensions.map((dimension, index) => <DimensionRow key={`${dimension.key}-${index}`} dimension={dimension} />)}</ul>
        {report.hardFailures.length ? <details className="wf-eval-hard"><summary><AlertTriangle size={14} aria-hidden="true" /> 确定性检查未通过（{report.hardFailures.length}）</summary><ul>{report.hardFailures.map((failure, index) => <li key={`${failure.code}-${index}`}><strong>{failure.code}</strong><span>{failure.reason}</span><small>证据：{failure.evidence}</small></li>)}</ul><p className="wf-field-note">这些是运行事实，模型不能覆盖。</p></details> : null}
        {report.suggestions.length ? <div className="wf-eval-suggestions"><h4>可以怎么改进</h4><ul>{report.suggestions.map((suggestion, index) => <li key={`${suggestion}-${index}`}>{suggestion}</li>)}</ul></div> : null}
        <details className="wf-eval-basis"><summary>评价依据与记录（可复核）</summary><dl>
          <div><dt>评价版本</dt><dd>评价规则 {report.promptVersion} · 标准版本 {report.rubric.version || "未设置"} · {report.rubric.criteria.length} 条标准</dd></div>
          <div><dt>目标</dt><dd>{report.rubric.goal || "未设置评价目标"}</dd></div>
          <div><dt>实际轨迹</dt><dd>{report.trace.stepCount} 个步骤（读取 {report.trace.stepReturned ?? report.trace.stepCount}）· {report.trace.failedStepCount} 个未完成 · {report.trace.toolEventCount} 条工具事件（{report.trace.toolCallCount ?? "—"} 个调用）· {report.trace.complete ? "轨迹完整" : "轨迹不完整"}</dd></div>
          {(report.trace.toolRecoveredCount ?? 0) + (report.trace.toolFinalFailureCount ?? 0) > 0 ? <div><dt>工具恢复</dt><dd>{report.trace.toolRecoveredCount ?? 0} 个调用在重试后完成 · {report.trace.toolFinalFailureCount ?? 0} 个最终失败 · {report.trace.toolIncompleteCount ?? 0} 个未完成</dd></div> : null}
          <div><dt>评价模型</dt><dd>{report.semantic.provider ? `${report.semantic.provider} / ` : ""}{report.semantic.model || "未调用模型"}{report.semantic.adapter ? ` · ${report.semantic.adapter}` : ""}{report.semantic.deepevalVersion ? ` · DeepEval ${report.semantic.deepevalVersion}` : ""}</dd></div>
          <div><dt>生成时间</dt><dd>{timeText(report.generatedAt)}</dd></div>
        </dl>{report.rubric.criteria.length ? <div className="wf-eval-criteria"><strong>本次冻结的评分标准</strong><ol>{report.rubric.criteria.map((criterion, index) => <li key={`${criterion}-${index}`}>{criterion}</li>)}</ol></div> : null}<ul className="wf-eval-limitations">{report.limitations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></details>
      </> : null}
      <footer className="wf-eval-actions">
        <button type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={14} aria-hidden="true" />刷新评价</button>
        <button type="button" onClick={onRetry} disabled={busy}><RotateCcw size={14} aria-hidden="true" />重新评价</button>
        <span>重评会创建新记录，原报告保留；不会重新运行工作流。</span>
      </footer>
    </> : null}
  </section>;
}

export function RunEvaluationSummary({ evaluations, loading, error, onOpen }: { evaluations: WorkflowEvaluation[]; loading: boolean; error: string; onOpen: () => void }) {
  const latest = evaluations[0];
  return <div className="wf-run-eval-summary">
    <span className="wf-eval-eyebrow"><ClipboardCheck size={13} aria-hidden="true" />完成评价</span>
    <span className={`wf-eval-badge ${evaluationTone(latest)}`}>{loading && !latest ? "读取中…" : error && !latest ? "暂时无法读取" : evaluationLabel(latest)}</span>
    <button type="button" onClick={onOpen}>查看报告</button>
  </div>;
}

/** Keeps a selected historical evaluation when a newer one appears, without a reset effect. */
function useEvaluationSelection(evaluations: WorkflowEvaluation[]) {
  const [selectedId, setSelectedId] = useState("");
  const valid = evaluations.some(item => item.evaluationId === selectedId) ? selectedId : (evaluations[0]?.evaluationId ?? "");
  return [valid, setSelectedId] as const;
}
