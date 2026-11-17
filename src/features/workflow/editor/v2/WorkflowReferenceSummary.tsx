import { AlertTriangle, ArrowUpRight, Boxes, Loader2, RefreshCw, Settings2 } from "lucide-react";
import type { WorkflowEnvironment, WorkflowReferenceTargetInfo } from "../../domain/v2/types";
import type { WorkflowReference } from "../../domain/v2/workflowReferences";
import { referenceInputFields, referenceOutputFields, referenceRevisionStatus, type ReferenceMappingIssue } from "../../domain/v2/workflowReferenceMapping";
import type { ReferenceDocumentState } from "./referenceDocuments";

export type { ReferenceDocumentState } from "./referenceDocuments";

/**
 * Call target summary and mapping repair state. The actual input/output rows
 * remain in the existing node tables below this section.
 */
export function WorkflowReferenceSummary({ reference, summary, state, environments, mappingIssues, readOnly, onChangeTarget, onOpenTarget, onUpgrade, onRetry, onRemoveInputs, onRemoveWrites }: {
  reference: WorkflowReference;
  summary?: WorkflowReferenceTargetInfo;
  state?: ReferenceDocumentState;
  environments: WorkflowEnvironment[];
  mappingIssues: ReferenceMappingIssue[];
  readOnly: boolean;
  onChangeTarget: () => void;
  onOpenTarget: () => void;
  onUpgrade: () => void;
  onRetry: () => void;
  onRemoveInputs: (names: string[]) => void;
  onRemoveWrites: (names: string[]) => void;
}) {
  const document = state?.status === "ready" ? state.document : undefined;
  const error = state?.status === "error" ? state.message : undefined;
  const latestRevision = Math.max(state?.status === "ready" ? state.latestRevision : 0, summary?.currentRevision ?? 0) || undefined;
  const status = referenceRevisionStatus({
    pinnedRevision: reference.revision,
    currentRevision: latestRevision,
    archived: document?.archived ?? summary?.archived,
    missing: Boolean(error && state?.status === "error" && state.missing) || summary?.reason === "missing",
  });
  const environmentAvailable = environments.some(environment => environment.environmentRef === reference.environmentRef);
  const inputs = document ? referenceInputFields(document.definition.inputSchema) : [];
  const outputs = document ? referenceOutputFields(document.definition.outputSchema) : [];
  const invalidInputs = mappingIssues.filter(issue => issue.kind === "input-extra" || issue.kind === "input-type").map(issue => issue.field);
  const invalidWrites = mappingIssues.filter(issue => issue.kind === "output-extra").map(issue => issue.field);

  return <div className="wf-reference-summary" data-tone={status.tone}>
    <div className="wf-reference-summary-head">
      <span className="wf-reference-summary-icon" aria-hidden="true"><Boxes size={17}/></span>
      <div className="wf-reference-summary-copy">
        <strong>{document?.definition.name ?? summary?.name ?? "调用工作流"}</strong>
        <small>固定版本 {reference.revision} · 环境 {reference.environmentRef}</small>
      </div>
      <span className={`wf-reference-tag ${status.tone}`}>{status.label}</span>
    </div>
    <div className="wf-reference-summary-actions">
      <button type="button" className="wf-reference-open" onClick={onOpenTarget}><ArrowUpRight size={15}/>打开目标工作流</button>
      {!readOnly && latestRevision !== undefined && reference.revision < latestRevision ? <button type="button" className="wf-reference-upgrade" onClick={onUpgrade}><RefreshCw size={14}/>检查/升级版本</button> : null}
      {!readOnly ? <button type="button" onClick={onChangeTarget}><Settings2 size={14}/>更换目标或版本</button> : null}
    </div>
    {state?.status === "loading" ? <p className="wf-reference-muted" role="status"><Loader2 size={14} className="spin" aria-hidden="true"/>正在读取固定版本 {reference.revision} 的接口…</p> : null}
    {error ? <div className="wf-reference-warning" role="alert"><p><AlertTriangle size={15} aria-hidden="true"/>{error}</p><p>不会回退到目标最新版本或父流程。可返回调用节点重新选择目标，或重试读取。</p><button type="button" onClick={onRetry}><RefreshCw size={14}/>重试读取</button></div> : null}
    {latestRevision !== undefined && reference.revision < latestRevision ? <p className="wf-reference-version-note" role="note">目标已有更新版本 {latestRevision}；调用仍固定为版本 {reference.revision}，保存目标新版本不会自动改变此引用。可先检查接口变化和映射，再明确应用。</p> : null}
    {document?.archived ? <p className="wf-reference-warning" role="alert">目标工作流已归档；此引用不能再执行，请更换目标或恢复目标工作流。</p> : null}
    {!environmentAvailable ? <p className="wf-reference-warning" role="alert">目标运行环境「{reference.environmentRef}」当前不可用，请更换环境后再保存或运行。</p> : null}
    {document ? <>
      <div className="wf-reference-interface-summary">
        <span><strong>{inputs.length}</strong> 个输入{inputs.some(field => field.required) ? ` · ${inputs.filter(field => field.required).length} 个必填` : ""}</span>
        <span><strong>{outputs.length}</strong> 个输出</span>
        <span>接口已读取</span>
      </div>
      {mappingIssues.length ? <div className="wf-reference-warning" role="alert">
        <p><AlertTriangle size={15} aria-hidden="true"/>固定版本接口与现有映射有 {mappingIssues.length} 处不一致</p>
        <ul>{mappingIssues.map(issue => <li key={`${issue.kind}:${issue.field}`}>{issue.message}</li>)}</ul>
        <div className="wf-reference-repair-actions">
          {invalidInputs.length ? <button type="button" disabled={readOnly} onClick={() => onRemoveInputs([...new Set(invalidInputs)])}>移除无效输入映射</button> : null}
          {invalidWrites.length ? <button type="button" disabled={readOnly} onClick={() => onRemoveWrites([...new Set(invalidWrites)])}>移除无效输出映射</button> : null}
        </div>
        <small>映射不会在切换目标时自动删除。请在上方输入、下方输出表中补齐必填项并修正来源。</small>
      </div> : <p className="wf-reference-ready" role="status">接口映射与固定版本一致。</p>}
    </> : null}
  </div>;
}
