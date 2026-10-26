import { useState } from "react";
import { Copy } from "lucide-react";
import type { JsonValue, WorkflowDefinitionV2 } from "../../domain/v2/types";
import { formatRunDuration, relativeRunTime, runElapsed, runStatusTone } from "../../domain/v2/runSummary";
import { RunValueList } from "./RunValueList";
import { StateFields } from "./StateFields";

const statusNames: Record<string, string> = { completed: "已完成", success: "已完成", failed: "失败", running: "运行中", waiting: "等待回应", cancelled: "已停止", interrupted: "执行中断", queued: "排队中", continued: "已继续" };

/**
 * Data panel with two tabs. “字段” owns the State definition; “最近运行的值” is
 * a read-only projection of the selected run's final State and never writes the
 * field definitions.
 */
export function StatePanel({ definition, onChange, readOnly = false, onLocateNode, latestValues, runStatus, runCreatedAt, runStartedAt, runFinishedAt, runEnvironment }: {
  definition: WorkflowDefinitionV2;
  onChange: (definition: WorkflowDefinitionV2) => void;
  readOnly?: boolean;
  onLocateNode?: (nodeId: string) => void;
  latestValues?: JsonValue;
  runStatus?: string;
  runCreatedAt?: string;
  runStartedAt?: string;
  runFinishedAt?: string;
  runEnvironment?: string | null;
}) {
  const [tab, setTab] = useState<"fields" | "values">("fields");
  const [copied, setCopied] = useState(false);
  const tone = runStatusTone(runStatus);
  const elapsed = formatRunDuration(runElapsed({ startedAt: runStartedAt, finishedAt: runFinishedAt }));

  function copyValues() {
    if (latestValues === undefined) return;
    void navigator.clipboard?.writeText(JSON.stringify(latestValues, null, 2)).then(() => setCopied(true)).catch(() => setCopied(false));
  }

  return <section className="wf-state-panel" aria-label="数据面板">
    <div className="wf-state-panel-tabs" role="tablist" aria-label="数据面板标签">
      <button type="button" role="tab" aria-selected={tab === "fields"} aria-pressed={tab === "fields"} onClick={() => setTab("fields")}>字段</button>
      <button type="button" role="tab" aria-selected={tab === "values"} aria-pressed={tab === "values"} onClick={() => setTab("values")}>最近运行的值</button>
    </div>
    {tab === "fields" ? <div className="wf-state-panel-fields">
      <fieldset className="wf-node-form" disabled={readOnly}><StateFields definition={definition} onChange={onChange} readOnly={readOnly} onLocateNode={onLocateNode}/></fieldset>
    </div> : <div className="wf-state-panel-values" role="tabpanel" aria-label="最近运行的值">
      {latestValues === undefined ? <p className="wf-empty-note">还没有运行记录。运行一次后，这里会显示最近一次运行写入的值。</p> : <>
        <div className="wf-run-data-meta">
          <span>最近一次运行</span><span aria-hidden="true">·</span>
          <span>{relativeRunTime(runCreatedAt) || "时间未知"}</span>{elapsed ? <><span aria-hidden="true">·</span><span className="wf-run-data-duration">{elapsed}</span></> : null}
          <span className="wf-run-env-tag">{runEnvironment?.trim() || "默认"}</span>
          <span className="wf-run-data-meta-spacer" />
          <span className={`wf-run-status ${tone}`}><i aria-hidden="true" />{statusNames[runStatus ?? ""] ?? "已完成"}</span>
        </div>
        <div className="wf-state-values-card"><RunValueList value={latestValues} layout="inline" emptyText="这次运行没有写入值。"/></div>
        <div className="wf-run-data-footer">
          <small>这里显示最近一次运行的值，不写入字段定义。</small>
          <span className="wf-run-data-meta-spacer" />
          <button type="button" className="wf-run-data-copy" onClick={copyValues}><Copy size={11} aria-hidden="true"/>复制 JSON</button>
          {copied ? <small role="status">{copied ? "已复制" : "复制失败"}</small> : null}
        </div>
      </>}
    </div>}
  </section>;
}
