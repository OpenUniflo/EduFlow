import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { ApiRequestError } from "@/shared/api/apiClient";
import { workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../../repository/v2/WorkflowApiV2";
import type { Binding, JsonSchema, WorkflowDocumentV2, WorkflowEnvironment, WorkflowRevisionSummary } from "../../domain/v2/types";
import { referenceMappingIssues, type ReferenceMappingIssue } from "../../domain/v2/workflowReferenceMapping";
import { assessReferenceUpgrade, referenceUpgradeCanApply, referenceUpgradeDocumentMatches, type ReferenceFieldChange } from "../../domain/v2/workflowReferenceUpgrade";
import { typeLabel, types } from "./bindingTypes";
import { WorkflowDialog } from "./WorkflowDialog";

export type ReferenceUpgradeSelection = {
  workflowId: string;
  revision: number;
  environmentRef: string;
  name: string;
  document: WorkflowDocumentV2;
  latestRevision: number;
};

function schemaTypeText(schema: JsonSchema): string {
  try { return typeLabel(types(schema)); } catch { return "类型未声明"; }
}

function defaultText(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function hasDefault(field: { schema: JsonSchema }): boolean {
  return Object.prototype.hasOwnProperty.call(field.schema, "default");
}

function fieldSummary(field: { schema: JsonSchema; required: boolean }): string {
  return `${schemaTypeText(field.schema)} · ${field.required ? "必填" : "可选"}${hasDefault(field) ? ` · 默认 ${defaultText(field.schema.default)}` : ""}`;
}

function changeText(change: ReferenceFieldChange): string {
  if (change.kind === "added" && change.next) return `新增 · ${fieldSummary(change.next)}`;
  if (change.kind === "removed" && change.previous) return `移除 · 原 ${fieldSummary(change.previous)}`;
  if (!change.previous || !change.next) return "";
  const parts: string[] = [];
  if (change.attributes.includes("required")) parts.push(`必填：${change.previous.required ? "是" : "否"} → ${change.next.required ? "是" : "否"}`);
  if (change.attributes.includes("type")) parts.push(`类型：${schemaTypeText(change.previous.schema)} → ${schemaTypeText(change.next.schema)}`);
  if (change.attributes.includes("default")) parts.push(`默认：${hasDefault(change.previous) ? defaultText(change.previous.schema.default) : "无"} → ${hasDefault(change.next) ? defaultText(change.next.schema.default) : "无"}`);
  return parts.join("；");
}

function bindingText(binding: Binding): string {
  if (binding.source === "literal") return `固定值 ${defaultText(binding.value)}`;
  const source = binding.source === "input" ? "启动输入" : binding.source === "state" ? "父流程 State" : "运行环境";
  return `${source} ${binding.pointer}`;
}

function ChangeList({ title, changes }: { title: string; changes: ReferenceFieldChange[] }) {
  return <section aria-label={title}>
    <h4>{title} <small>{changes.length} 项变化</small></h4>
    {changes.length ? <ul className="wf-reference-upgrade-changes">
      {changes.map(change => {
        const field = change.next ?? change.previous;
        return <li key={`${change.kind}:${change.name}`} data-kind={change.kind}>
          <span className="wf-reference-upgrade-change-head"><code>{change.name}</code><span className={`wf-reference-tag ${change.kind === "added" ? "current" : change.kind === "removed" ? "missing" : "outdated"}`}>{change.kind === "added" ? "新增" : change.kind === "removed" ? "移除" : "变更"}</span></span>
          {field && field.title !== field.name ? <span className="wf-reference-upgrade-change-title">{field.title}</span> : null}
          <small>{changeText(change)}</small>
        </li>;
      })}
    </ul> : <p className="wf-reference-muted">{title === "输入" ? "输入接口没有声明变化。" : "输出接口没有声明变化。"}</p>}
  </section>;
}

function MappingRows({ title, rows, issueFields }: { title: string; rows: { name: string; text: string }[]; issueFields: Set<string> }) {
  return <section aria-label={title}>
    <h4>{title} <small>{rows.length} 项</small></h4>
    {rows.length ? <ul className="wf-reference-upgrade-mappings">
      {rows.map(row => <li key={row.name} data-invalid={issueFields.has(row.name) ? "true" : undefined}>
        <code>{row.name}</code>
        <span>{row.text}</span>
        <em>{issueFields.has(row.name) ? "需修复" : "保留原值"}</em>
      </li>)}
    </ul> : <p className="wf-reference-muted">{title === "输入映射" ? "目前没有输入映射。" : "目前没有输出写入。"}</p>}
  </section>;
}

/**
 * Preview one exact target revision before changing a parent call node.
 * It reads definitions only; the editor applies the returned revision and
 * keeps every existing input/write mapping verbatim.
 */
export function WorkflowReferenceUpgradeDialog({ workflowId, workflowName, currentRevision, currentEnvironmentRef, initialRevision, initialEnvironmentRef, environments, parentInputSchema, parentStateSchema, inputs, writes, onClose, onApply, onChangeTarget }: {
  workflowId: string;
  workflowName?: string;
  currentRevision: number;
  currentEnvironmentRef: string;
  initialRevision?: number;
  initialEnvironmentRef?: string;
  environments: WorkflowEnvironment[];
  parentInputSchema: JsonSchema;
  parentStateSchema: JsonSchema;
  inputs: Readonly<Record<string, Binding>>;
  writes: Readonly<Record<string, string>>;
  onClose: () => void;
  onApply: (selection: ReferenceUpgradeSelection) => void;
  onChangeTarget: () => void;
}) {
  const environmentRef = initialEnvironmentRef || currentEnvironmentRef;
  const [revisions, setRevisions] = useState<WorkflowRevisionSummary[]>([]);
  const [revisionLoading, setRevisionLoading] = useState(true);
  const [selectedRevision, setSelectedRevision] = useState(initialRevision ?? currentRevision);
  const [document, setDocument] = useState<WorkflowDocumentV2 | null>(null);
  const [previousDocument, setPreviousDocument] = useState<WorkflowDocumentV2 | null>(null);
  const [previousError, setPreviousError] = useState("");
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [listError, setListError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [applying, setApplying] = useState(false);
  const [retry, setRetry] = useState(0);
  const documentRequest = useRef(0);

  useEffect(() => {
    let active = true;
    setRevisionLoading(true); setListError("");
    void workflowApiV2.revisions(workflowId).then(result => {
      if (!active) return;
      setRevisions(result.items);
      if (!result.items.length) setListError("目标工作流没有可读取的修订。");
      setSelectedRevision(current => result.items.some(item => item.revision === current) ? current : result.items[0]?.revision ?? current);
    }).catch(reason => {
      if (!active) return;
      const missing = reason instanceof ApiRequestError && reason.status === 404;
      setListError(missing ? "目标工作流不存在、已删除，或当前账号无权访问。" : workflowErrorMessage(reason));
    }).finally(() => { if (active) setRevisionLoading(false); });
    return () => { active = false; };
  }, [workflowId, retry]);

  useEffect(() => {
    let active = true;
    setPreviousError("");
    void workflowApiV2.get(workflowId, currentRevision).then(result => {
      if (active) setPreviousDocument(result);
    }).catch(reason => {
      if (!active) return;
      const missing = reason instanceof ApiRequestError && reason.status === 404;
      setPreviousError(missing ? `当前固定的版本 ${currentRevision} 已不存在，或当前账号无权访问。` : workflowErrorMessage(reason));
    });
    return () => { active = false; };
  }, [workflowId, currentRevision, retry]);

  useEffect(() => {
    const run = documentRequest.current += 1;
    const known = revisions.some(item => item.revision === selectedRevision);
    if (!revisions.length || !known || revisionLoading) {
      setDocument(null); setDocumentLoading(false); setDocumentError("");
      return;
    }
    setDocument(null); setDocumentLoading(true); setDocumentError(""); setApplyError("");
    void workflowApiV2.get(workflowId, selectedRevision).then(result => {
      if (run === documentRequest.current) setDocument(result);
    }).catch(reason => {
      if (run !== documentRequest.current) return;
      const missing = reason instanceof ApiRequestError && reason.status === 404;
      setDocumentError(missing ? `版本 ${selectedRevision} 不存在、已删除，或当前账号无权访问。` : workflowErrorMessage(reason));
    }).finally(() => {
      if (run === documentRequest.current) setDocumentLoading(false);
    });
  }, [workflowId, selectedRevision, revisions, revisionLoading, retry]);

  const latestRevision = revisions.length ? Math.max(...revisions.map(item => item.revision)) : currentRevision;
  const environment = environments.find(item => item.environmentRef === environmentRef);
  const issues = useMemo<ReferenceMappingIssue[]>(() => document ? referenceMappingIssues(document.definition, inputs, writes, { inputSchema: parentInputSchema, stateSchema: parentStateSchema }) : [], [document, inputs, writes, parentInputSchema, parentStateSchema]);
  const assessment = useMemo(() => previousDocument && document ? assessReferenceUpgrade({
    previous: previousDocument.definition,
    next: document.definition,
    inputs,
    writes,
    inputSchema: parentInputSchema,
    stateSchema: parentStateSchema,
  }) : undefined, [previousDocument, document, inputs, writes, parentInputSchema, parentStateSchema]);
  const loadError = listError || documentError;
  const canApply = referenceUpgradeCanApply({
    document, selectedRevision, currentRevision,
    environmentAvailable: Boolean(environment), loading: revisionLoading || documentLoading,
    error: loadError, applying,
  });
  const issueFields = new Set(issues.map(issue => issue.field));
  const inputRows = Object.entries(inputs).map(([name, binding]) => ({ name, text: bindingText(binding) }));
  const outputRows = Object.entries(writes).map(([name, pointer]) => ({ name, text: `来自目标 ${pointer || "完整输出"}` }));
  const selectedLabel = revisions.find(item => item.revision === selectedRevision)?.name;

  async function apply() {
    if (!document || !canApply || applying) return;
    setApplying(true); setApplyError("");
    try {
      const exact = await workflowApiV2.get(workflowId, selectedRevision);
      // The confirm action may never substitute a newer head for the previewed revision.
      if (!referenceUpgradeDocumentMatches(selectedRevision, document, exact)) {
        setDocument(exact);
        setApplyError(`版本 ${selectedRevision} 的内容已变化，已重新读取。请确认新的预览后再应用。`);
        return;
      }
      if (exact.archived) {
        setDocument(exact);
        setApplyError(`版本 ${selectedRevision} 所在的目标工作流已归档，不能作为固定引用保存或运行。`);
        return;
      }
      let latest = latestRevision;
      try { latest = Math.max(latest, (await workflowApiV2.get(workflowId)).definition.revision); } catch { /* the exact revision is the authority for this apply */ }
      onApply({ workflowId, revision: selectedRevision, environmentRef, name: exact.definition.name, document: exact, latestRevision: latest });
    } catch (reason) {
      const missing = reason instanceof ApiRequestError && reason.status === 404;
      setApplyError(missing ? `版本 ${selectedRevision} 已不存在、已删除，或当前账号无权访问。请重新加载版本，或更换目标。` : workflowErrorMessage(reason));
    } finally {
      setApplying(false);
    }
  }

  return <WorkflowDialog title="检查并升级调用版本" className="wf-reference-upgrade-dialog" error={applyError || loadError} onClose={() => { if (!applying) onClose(); }}>
    <div className="wf-reference-upgrade">
      <header className="wf-reference-upgrade-head">
        <div>
          <small>独立工作流 · 固定版本引用</small>
          <h2>{document?.definition.name ?? workflowName ?? "目标工作流"}</h2>
          <p><span>版本 {currentRevision}</span><ArrowRight size={14} aria-hidden="true"/><strong>版本 {selectedRevision}</strong><span>· 运行环境 {environmentRef}</span></p>
        </div>
        <span className="wf-reference-tag outdated">调用方不会自动跟随</span>
      </header>

      <div className="wf-reference-upgrade-picker">
        <label>应用哪个确切版本
          <select aria-label="应用版本" value={selectedRevision} disabled={revisionLoading || !revisions.length || applying} onChange={event => { setSelectedRevision(Number(event.target.value)); setApplyError(""); }}>
            {!revisions.length ? <option value={selectedRevision}>{revisionLoading ? "正在加载版本…" : `版本 ${selectedRevision}`}</option> : revisions.map(item => <option key={item.revision} value={item.revision}>版本 {item.revision}{item.revision === latestRevision ? " · 目标当前最新" : item.revision === currentRevision ? " · 调用方当前固定" : item.revision > currentRevision ? " · 更新版本" : " · 旧版本"} · {item.name}</option>)}
          </select>
        </label>
        <div className="wf-reference-upgrade-version-notes">
          {selectedRevision === currentRevision ? <p>这仍是调用方当前固定的版本。请选择一个不同版本再应用。</p> : null}
          {latestRevision > selectedRevision ? <p className="wf-reference-version-note" role="note">目标已有更新版本 {latestRevision}；本次只应用你选择并预览的版本 {selectedRevision}，不会自动改为最新。</p> : null}
          {latestRevision === selectedRevision ? <p>版本 {selectedRevision} 是目标当前最新。应用后父调用节点固定于此版本，目标以后保存新版本也不会自动改变。</p> : null}
          {selectedRevision !== currentRevision && selectedRevision !== latestRevision ? <p>这是目标的一个中间版本：可以固定应用，不会强制跳到更新版本。</p> : null}
        </div>
      </div>

      {!environment ? <div className="wf-reference-warning" role="alert">
        <p><AlertTriangle size={15} aria-hidden="true"/>固定运行环境「{environmentRef}」当前不可用或无权访问；不能保存或运行此引用。</p>
        <button type="button" onClick={onChangeTarget}><Settings2 size={14}/>选择可用环境</button>
      </div> : null}
      {document?.archived ? <div className="wf-reference-warning" role="alert">
        <p><AlertTriangle size={15} aria-hidden="true"/>目标工作流已归档，不能作为固定引用保存或运行。请先恢复目标工作流，再检查版本。</p>
        <button type="button" onClick={onChangeTarget}><Settings2 size={14}/>更换调用目标</button>
      </div> : null}
      {previousError ? <div className="wf-reference-warning" role="note">
        <p><AlertTriangle size={15} aria-hidden="true"/>{previousError}</p>
        <p>无法比较当前固定版本与目标版本的接口变化；下方仍会按版本 {selectedRevision} 检查现有映射。应用存在的目标版本可以修复失效固定版本。</p>
      </div> : null}
      {!document && (revisionLoading || documentLoading) ? <p className="wf-reference-muted" role="status"><Loader2 size={14} className="spin" aria-hidden="true"/>正在读取版本 {selectedRevision} 的接口与映射…</p> : null}
      {documentError ? <div className="wf-reference-warning" role="alert">
        <p><AlertTriangle size={15} aria-hidden="true"/>{documentError}</p>
        <div className="wf-reference-repair-actions">
          <button type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14}/>重新读取版本</button>
          <button type="button" onClick={onChangeTarget}><Settings2 size={14}/>更换目标或环境</button>
        </div>
      </div> : null}
      {listError && !documentError ? <div className="wf-reference-warning" role="alert">
        <p><AlertTriangle size={15} aria-hidden="true"/>{listError}</p>
        <div className="wf-reference-repair-actions">
          <button type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14}/>重试读取</button>
          <button type="button" onClick={onChangeTarget}><Settings2 size={14}/>更换调用目标</button>
        </div>
      </div> : null}

      {document ? <>
        <section className="wf-reference-upgrade-diff" aria-label="接口变化">
          <header><h3>接口变化 <small>{selectedLabel ? `目标版本名 ${selectedLabel}` : "旧版本 → 新版本"}</small></h3>{assessment ? <span>{assessment.changes.total ? `${assessment.changes.total} 项声明变化` : "接口声明无变化"}</span> : <span>无法比较旧版本</span>}</header>
          {assessment ? <div className="wf-reference-upgrade-diff-grid">
            <ChangeList title="输入" changes={assessment.changes.inputs}/>
            <ChangeList title="输出" changes={assessment.changes.outputs}/>
          </div> : null}
        </section>

        <section className="wf-reference-upgrade-mapping" aria-label="现有映射兼容性">
          <header><h3>现有映射兼容性</h3><span>{Object.keys(inputs).length + Object.keys(writes).length} 项映射原值保留</span></header>
          <div className="wf-reference-upgrade-mapping-grid">
            <MappingRows title="输入映射" rows={inputRows} issueFields={issueFields}/>
            <MappingRows title="输出写入" rows={outputRows} issueFields={issueFields}/>
          </div>
          {issues.length ? <div className="wf-reference-warning" role="alert">
            <p><AlertTriangle size={15} aria-hidden="true"/>应用版本 {selectedRevision} 后有 {issues.length} 项映射需要修复</p>
            <ul>{issues.map(issue => <li key={`${issue.kind}:${issue.field}`}>{issue.message}</li>)}</ul>
            <p>映射不会被删除或猜测绑定。应用后会进入待修复草稿；保存与运行会暂停，直到修复完成。</p>
          </div> : <p className="wf-reference-ready" role="status">现有输入与输出映射与版本 {selectedRevision} 兼容{assessment?.changes.total ? "；接口有声明变化，但没有破坏当前映射" : ""}。</p>}
        </section>
      </> : null}
    </div>
    <footer className="wf-dialog-actions">
      <button type="button" onClick={onClose} disabled={applying}>取消</button>
      <button type="button" onClick={onChangeTarget} disabled={applying}><Settings2 size={14}/>更换目标或环境</button>
      <button type="button" className="primary" disabled={!canApply} onClick={() => void apply()}>{applying ? "正在校验版本…" : issues.length ? `应用版本 ${selectedRevision} 并修复映射` : `应用版本 ${selectedRevision}`}</button>
    </footer>
  </WorkflowDialog>;
}
