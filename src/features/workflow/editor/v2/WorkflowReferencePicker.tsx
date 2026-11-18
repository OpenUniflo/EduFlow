import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Loader2, Search } from "lucide-react";
import { ApiRequestError } from "@/shared/api/apiClient";
import { workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../../repository/v2/WorkflowApiV2";
import { referenceInputFields, referenceMappingIssues, referenceOutputFields } from "../../domain/v2/workflowReferenceMapping";
import type { Binding, JsonSchema, WorkflowDocumentV2, WorkflowEnvironment, WorkflowRevisionSummary, WorkflowSummaryV2 } from "../../domain/v2/types";
import { typeLabel, types } from "./bindingTypes";
import { WorkflowDialog } from "./WorkflowDialog";
import { referencePickerCanApply } from "./referencePickerState";

export type ReferencePickerSelection = {
  workflowId: string;
  revision: number;
  environmentRef: string;
  name: string;
  latestRevision: number;
  document: WorkflowDocumentV2;
};

type PickerTarget = { workflowId: string; revision: number; environmentRef: string };

function schemaTypeText(schema: JsonSchema): string {
  try { return typeLabel(types(schema)); } catch { return "类型未声明"; }
}

function defaultText(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN");
}

/**
 * Selector for an independent Workflow, one exact revision and the target
 * environment. It only returns a selection; inserting or re-pointing the node
 * remains the editor's decision, so cancelling never leaves a half node.
 */
export function WorkflowReferencePicker({ currentWorkflowId, target, inputs, writes, inputSchema, stateSchema, environments, defaultEnvironmentRef, mode, onApply, onClose }: {
  currentWorkflowId: string;
  target?: PickerTarget;
  inputs: Record<string, Binding>;
  writes: Record<string, string>;
  inputSchema?: JsonSchema;
  stateSchema?: JsonSchema;
  environments: WorkflowEnvironment[];
  defaultEnvironmentRef: string;
  mode: "create" | "edit";
  onApply: (selection: ReferencePickerSelection) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<WorkflowSummaryV2[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(target?.workflowId ?? "");
  const [selectedRevision, setSelectedRevision] = useState<number | null>(target?.revision ?? null);
  const [selectedEnvironment, setSelectedEnvironment] = useState(target?.environmentRef || defaultEnvironmentRef || environments[0]?.environmentRef || "");
  const [revisions, setRevisions] = useState<WorkflowRevisionSummary[]>([]);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [revisionError, setRevisionError] = useState("");
  const [document, setDocument] = useState<WorkflowDocumentV2 | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const listRequest = useRef(0);
  const revisionRequest = useRef(0);
  const documentRequest = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
    setItems([]);
    setTotal(0);
  }, [debounced]);

  useEffect(() => {
    let active = true;
    setListLoading(true); setListError("");
    const run = listRequest.current += 1;
    void workflowApiV2.listPage({ search: debounced, scope: "all", sort: "updated", page, pageSize: 12 })
      .then(result => {
        if (!active || run !== listRequest.current) return;
        setItems(current => page === 1 ? result.items : [...current, ...result.items]);
        setTotal(result.total);
      })
      .catch(reason => { if (active && run === listRequest.current) setListError(workflowErrorMessage(reason)); })
      .finally(() => { if (active && run === listRequest.current) setListLoading(false); });
    return () => { active = false; };
  }, [debounced, page]);

  useEffect(() => {
    const run = revisionRequest.current += 1;
    if (!selectedWorkflowId) {
      setRevisions([]); setRevisionLoading(false); setRevisionError(""); setSelectedRevision(null);
      setDocument(null); setDocumentLoading(false); setDocumentError("");
      return;
    }
    // Switching targets must immediately stop offering the previous target's
    // revisions and definitions, even before the new request settles.
    setRevisions([]);
    setRevisionLoading(true); setRevisionError("");
    setDocument(null); setDocumentLoading(false); setDocumentError("");
    void workflowApiV2.revisions(selectedWorkflowId)
      .then(result => {
        if (run !== revisionRequest.current) return;
        setRevisions(result.items);
        if (!result.items.length) { setRevisionError("此工作流没有可读取的修订。"); setSelectedRevision(null); return; }
        setSelectedRevision(current => current !== null && result.items.some(item => item.revision === current) ? current : result.items[0].revision);
      })
      .catch(reason => {
        if (run !== revisionRequest.current) return;
        setRevisions([]);
        setRevisionError(workflowErrorMessage(reason));
        setSelectedRevision(null);
      })
      .finally(() => { if (run === revisionRequest.current) setRevisionLoading(false); });
  }, [selectedWorkflowId]);

  useEffect(() => {
    const run = documentRequest.current += 1;
    const revisionKnown = selectedRevision !== null && revisions.some(item => item.revision === selectedRevision);
    if (!selectedWorkflowId || selectedRevision === null || revisionLoading || !revisionKnown) {
      setDocument(null); setDocumentError(""); setDocumentLoading(false);
      return;
    }
    setDocument(null); setDocumentLoading(true); setDocumentError("");
    void workflowApiV2.get(selectedWorkflowId, selectedRevision)
      .then(result => { if (run === documentRequest.current) setDocument(result); })
      .catch(reason => {
        if (run !== documentRequest.current) return;
        setDocument(null);
        const missing = reason instanceof ApiRequestError && reason.status === 404;
        setDocumentError(missing ? `目标修订 ${selectedRevision} 不存在，或当前账号无权访问。` : workflowErrorMessage(reason));
      })
      .finally(() => { if (run === documentRequest.current) setDocumentLoading(false); });
  }, [selectedWorkflowId, selectedRevision, revisions, revisionLoading]);

  const latestRevision = selectedRevision === null ? undefined : revisions[0]?.revision;
  const selectedSummary = items.find(item => item.workflowId === selectedWorkflowId);
  const selectedName = document?.definition.name ?? selectedSummary?.name ?? revisions.find(item => item.revision === selectedRevision)?.name ?? selectedWorkflowId;
  const issues = useMemo(() => document ? referenceMappingIssues(document.definition, inputs, writes, { ...(inputSchema ? { inputSchema } : {}), ...(stateSchema ? { stateSchema } : {}) }) : [], [document, inputs, writes, inputSchema, stateSchema]);
  const inputFields = useMemo(() => document ? referenceInputFields(document.definition.inputSchema) : [], [document]);
  const outputFields = useMemo(() => document ? referenceOutputFields(document.definition.outputSchema) : [], [document]);
  const environment = environments.find(item => item.environmentRef === selectedEnvironment);
  const unchanged = Boolean(target && target.workflowId === selectedWorkflowId && target.revision === selectedRevision && target.environmentRef === selectedEnvironment);
  const canApply = referencePickerCanApply({
    document, selectedWorkflowId, selectedRevision, selectedEnvironment,
    environmentAvailable: Boolean(environment), revisionLoading, revisionError,
    documentLoading, documentError, unchanged,
  });
  const hasResults = items.length > 0;
  const canLoadMore = items.length < total;

  function chooseWorkflow(item: WorkflowSummaryV2) {
    if (item.workflowId === currentWorkflowId) return;
    // Re-clicking the already selected target must not clear its revision list
    // without a selectedWorkflowId change that would fetch it again.
    if (item.workflowId === selectedWorkflowId) return;
    setSelectedWorkflowId(item.workflowId);
    setSelectedRevision(item.revision);
    setRevisions([]);
    setRevisionLoading(true);
    setDocument(null);
    setDocumentError("");
  }

  return <WorkflowDialog title={mode === "create" ? "添加调用工作流" : "更换调用目标"} className="wf-reference-picker-dialog" error={listError || revisionError || documentError} onClose={onClose}>
    <div className="wf-reference-picker">
      <section className="wf-reference-picker-list" aria-label="可选择的工作流">
        <div className="wf-reference-search"><Search size={14} aria-hidden="true"/><input autoFocus aria-label="搜索工作流" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索本人可访问的工作流…" /></div>
        <div className="wf-reference-results" role="listbox" aria-label="工作流列表">
          {listLoading && page === 1 ? <p role="status" className="wf-reference-muted"><Loader2 size={14} className="spin" aria-hidden="true"/>正在加载工作流…</p> : null}
          {!listLoading && !hasResults ? <p className="wf-reference-muted">{debounced ? "没有匹配的工作流。" : "还没有可调用的工作流。先创建并保存一个独立工作流，再回到这里选择。"}</p> : null}
          {items.map(item => {
            const disabled = item.workflowId === currentWorkflowId;
            const selected = item.workflowId === selectedWorkflowId;
            return <button key={item.workflowId} type="button" role="option" aria-selected={selected} disabled={disabled} className={`wf-reference-result${selected ? " selected" : ""}`} title={disabled ? "不能调用当前工作流自身" : item.description} onClick={() => chooseWorkflow(item)}>
              <span className="wf-reference-result-main"><strong>{item.name}</strong><small>{item.description || "无描述"}</small></span>
              <span className="wf-reference-result-meta"><small>版本 {item.revision}</small><small>{item.nodeCount ?? 0} 个节点</small>{disabled ? <small>当前工作流</small> : selected ? <Check size={14} aria-hidden="true"/> : <ChevronRight size={14} aria-hidden="true"/>}</span>
            </button>;
          })}
          {canLoadMore ? <button type="button" className="wf-text-button" disabled={listLoading} onClick={() => setPage(current => current + 1)}>{listLoading ? "正在加载…" : `加载更多（${items.length}/${total}）`}</button> : null}
        </div>
      </section>

      <section className="wf-reference-picker-detail" aria-label="调用配置">
        {!selectedWorkflowId ? <div className="wf-reference-empty"><strong>先选择一个已有工作流</strong><p>调用节点保存目标工作流、固定版本和目标运行环境，不复制它的节点或布局。</p></div> : <>
          <header className="wf-reference-target-head">
            <div><small>调用目标</small><h3>{selectedName}</h3><code>{selectedWorkflowId}</code></div>
            <span className={`wf-reference-tag${document?.archived ? " danger" : ""}`}>{documentLoading ? "正在读取…" : document?.archived ? "已归档" : "普通工作流"}</span>
          </header>
          <div className="wf-reference-picker-fields">
            <label>固定版本
              <select aria-label="固定版本" value={selectedRevision ?? ""} disabled={revisionLoading || !revisions.length} onChange={event => setSelectedRevision(Number(event.target.value))}>
                {!revisions.length ? <option value="">{revisionLoading ? "正在加载版本…" : "没有可用版本"}</option> : revisions.map(item => <option key={item.revision} value={item.revision}>版本 {item.revision}{item.revision === latestRevision ? " · 当前最新" : " · 旧版本"} · {item.name}</option>)}
              </select>
            </label>
            <label>目标运行环境
              <select aria-label="目标运行环境" value={selectedEnvironment} onChange={event => setSelectedEnvironment(event.target.value)}>
                {!environments.length ? <option value="">没有可用环境</option> : environments.map(item => <option key={item.environmentRef} value={item.environmentRef}>{item.name} · {item.environmentRef}</option>)}
              </select>
            </label>
          </div>
          <p className="wf-reference-field-note" role="note">
            {selectedRevision !== null && latestRevision !== undefined && selectedRevision < latestRevision
              ? `这是旧版本 ${selectedRevision}。从调用节点打开时默认只读，可显式切换到最新版本 ${latestRevision}；父引用仍固定为版本 ${selectedRevision}。`
              : "目标的最新修订会被固定下来。之后目标保存新修订不会自动改变此引用。"}
            {selectedRevision !== null && !revisions.some(item => item.revision === selectedRevision) && !revisionLoading ? " 当前固定版本已不在版本列表中，继续使用前请确认目标状态。" : ""}
          </p>
          {environment ? null : <p className="wf-reference-warning" role="alert">所选运行环境当前不可用，请先选择本人已获授权的环境。</p>}
          {document?.archived ? <p className="wf-reference-warning" role="alert">目标工作流已归档，不能保存为新的调用引用。</p> : null}

          <div className="wf-reference-interface">
            <section aria-label="目标输入接口">
              <h4>输入接口 <small>{inputFields.length} 项</small></h4>
              {documentLoading ? <p className="wf-reference-muted">正在读取目标修订…</p> : inputFields.length ? <ul className="wf-reference-field-list">{inputFields.map(field => <li key={field.name}>
                <span className="wf-reference-field-name"><code>{field.name}</code><span>{field.title}</span></span>
                <span className="wf-reference-field-meta"><small>{schemaTypeText(field.schema)}</small>{field.required ? <small className="required">必填</small> : <small>可选</small>}{field.defaultValue !== undefined ? <small>默认 {defaultText(field.defaultValue)}</small> : null}</span>
              </li>)}</ul> : <p className="wf-reference-muted">此版本没有声明输入字段。</p>}
            </section>
            <section aria-label="目标输出接口">
              <h4>输出接口 <small>{outputFields.length} 项</small></h4>
              {documentLoading ? <p className="wf-reference-muted">正在读取目标修订…</p> : outputFields.length ? <ul className="wf-reference-field-list">{outputFields.map(field => <li key={field.name}>
                <span className="wf-reference-field-name"><code>{field.name}</code><span>{field.title}</span></span>
                <span className="wf-reference-field-meta"><small>{schemaTypeText(field.schema)}</small>{field.required ? <small className="required">必返回</small> : <small>可选</small>}</span>
              </li>)}</ul> : <p className="wf-reference-muted">此版本没有声明输出字段。</p>}
            </section>
          </div>

          {issues.length ? <div className="wf-reference-warning" role="alert">
            <p><AlertTriangle size={15} aria-hidden="true"/>{mode === "create" ? `添加后需要完成 ${issues.length} 项映射` : `切换后需要修复 ${issues.length} 项映射`}</p>
            <ul>{issues.slice(0, 8).map(issue => <li key={`${issue.kind}:${issue.field}`}>{issue.message}</li>)}</ul>
            <small>{mode === "create" ? "先在节点面板中连接必填输入、配置输出写入，再保存或运行。" : "现有输入/输出映射会原样保留，不会静默删除。保存前请在节点面板中修复。"}</small>
          </div> : null}
        </>}
      </section>
    </div>
    <footer className="wf-dialog-actions">
      <button type="button" onClick={onClose}>取消</button>
      <button type="button" className="primary" disabled={!canApply} onClick={() => {
        if (!document || selectedRevision === null) return;
        onApply({ workflowId: selectedWorkflowId, revision: selectedRevision, environmentRef: selectedEnvironment, name: selectedName, latestRevision: latestRevision ?? selectedRevision, document });
      }}>{mode === "create" ? "添加调用节点" : issues.length ? "保留映射并切换" : "使用此目标"}</button>
    </footer>
  </WorkflowDialog>;
}
