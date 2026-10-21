import type { WorkflowRunV2 } from "../../domain/v2/types";
import { StructuredValue } from "./RunOutput";

function pointerLabel(pointer: string): string {
  const parts = pointer.split("/").slice(1).map(token => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  return parts.length ? parts.join(" / ") : "全部启动输入";
}

function reasonLabel(reason: string): string {
  return ({ sensitive: "敏感字段，需要重新填写", redacted: "历史值已脱敏，需要重新填写", missing: "历史记录中缺少完整值" })[reason] ?? "此字段不可从历史复用";
}

export function RunInputSnapshot({ run, currentRevision }: { run: WorkflowRunV2; currentRevision: number }) {
  const reuse = run.inputReuse;
  const fields = reuse?.fields ?? [];
  const removed = reuse?.removedFields ?? [];
  return <details className="wf-run-input-snapshot">
    <summary>启动输入快照 · 修订 {run.revision} · {reuse?.complete ? "完整" : "部分脱敏"}</summary>
    <p className="wf-field-note">快照只保留可安全复用的字段；敏感、脱敏或缺失字段不显示原值，需要补齐后才能重跑。</p>
    {run.revision !== currentRevision ? <p role="status">此运行使用修订 {run.revision}；当前编辑为修订 {currentRevision}。复用输入会创建当前修订的新运行，不会重放原修订；可先用“查看执行修订的定义与布局”核对原修订。</p> : null}
    {fields.length ? <dl className="wf-data-fields">{fields.map(field => <div key={field.pointer}><dt>{pointerLabel(field.pointer)}</dt><dd><StructuredValue value={field.value}/></dd></div>)}</dl> : <p>{reuse?.reason ?? "此运行没有可展示的输入快照。"}</p>}
    {removed.length ? <details><summary>未包含的输入字段（{removed.length}）</summary><ul>{removed.map((field, index) => <li key={index}>{pointerLabel(field.pointer)}：{reasonLabel(field.reason)}</li>)}</ul></details> : null}
  </details>;
}
