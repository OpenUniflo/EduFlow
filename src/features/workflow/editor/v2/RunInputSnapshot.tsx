import type { WorkflowRunV2 } from "../../domain/v2/types";
import { StructuredValue } from "./RunOutput";
import { pointerLabel, reuseReasonLabel, runRevisionNotice } from "./runInputReuse";

export function RunInputSnapshot({ run, currentRevision, readOnly = false }: { run: WorkflowRunV2; currentRevision: number; readOnly?: boolean }) {
  const reuse = run.inputReuse;
  const fields = reuse?.fields ?? [];
  const removed = reuse?.removedFields ?? [];
  const revisionNotice = runRevisionNotice(run.revision, currentRevision);
  return <details className="wf-run-input-snapshot">
    <summary>启动输入快照 · 保存版本 {run.revision} · {reuse?.complete ? "完整" : "部分脱敏"}</summary>
    <p className="wf-field-note">{readOnly ? "快照只用于核对调用方输入；重新运行会直接使用当前 Assignment 的权威输入，不会复用脱敏字段。" : "快照只保留可安全复用的字段；敏感、脱敏或缺失字段不显示原值，需要补齐后才能重跑。"}</p>
    {revisionNotice ? <p role="status">{revisionNotice}</p> : null}
    {fields.length ? <dl className="wf-data-fields">{fields.map(field => <div key={field.pointer}><dt>{pointerLabel(field.pointer)}</dt><dd><StructuredValue value={field.value}/></dd></div>)}</dl> : <p>{reuse?.reason ?? "此运行没有可展示的输入快照。"}</p>}
    {removed.length ? <details><summary>未包含的输入字段（{removed.length}）</summary><ul>{removed.map((field, index) => <li key={index}>{pointerLabel(field.pointer)}：{reuseReasonLabel(field.reason)}</li>)}</ul></details> : null}
  </details>;
}
