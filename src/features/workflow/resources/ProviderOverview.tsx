import { useEffect, useState } from "react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { ResourceReferenceRow } from "../domain/v2/types";
import {
  canSaveModelDraft, credentialRequiredForConnection, draftModelsFor, filterProviderCards, isLocalProvider,
  latestVisibleProviders, modelRowsFor, modelSelectionDirty, modelSourceLabel, modelUsageCount,
  providerAddress, providerDisplayName, providerModelRefs, providerPublishRequest,
  providerTestStatusLabel, providerTypeLabel, providerUsageCount, testModelsOf,
  type ProviderTestState,
} from "./providerModel";
import { credentialLabel, type CatalogConnection } from "./resourceModel";
import { ResourceReferences } from "./ResourceReferences";
import { ResourceTestPanel } from "./ResourceTestPanel";

export type ProviderOverviewProps = {
  environmentRef: string;
  connections: readonly CatalogConnection[];
  loading?: boolean;
  error?: string;
  onReload?: () => void;
  onRequestAdd: () => void;
  onRequestEdit: (ref: string) => void;
  onResourcesChanged?: () => void;
  onOpenReference?: (row: ResourceReferenceRow) => void;
};

type ReferenceState = { loading: boolean; error: string; rows: ResourceReferenceRow[] };
type Feedback = { ok: boolean; text: string };
type ExpandedPanel = "references" | "versions";

function providerInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

/** Model supplier overview: cards, enabled-model staging, test results and references. */
export function ProviderOverview({
  environmentRef, connections, loading = false, error = "",
  onReload, onRequestAdd, onRequestEdit, onResourcesChanged, onOpenReference,
}: ProviderOverviewProps) {
  const providers = latestVisibleProviders(connections);
  const providerRefsKey = providers.map(entry => entry.ref).join("\u0000");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [tests, setTests] = useState<Record<string, ProviderTestState>>({});
  const [references, setReferences] = useState<Record<string, ReferenceState>>({});
  const [expanded, setExpanded] = useState<Record<string, ExpandedPanel | undefined>>({});
  const [busyRef, setBusyRef] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    let active = true;
    const initial: Record<string, ReferenceState> = {};
    for (const provider of providers) initial[provider.ref] = { loading: true, error: "", rows: [] };
    setReferences(initial);
    for (const provider of providers) {
      workflowApiV2.extensionReferences(provider.ref, environmentRef)
        .then(result => { if (active) setReferences(current => ({ ...current, [provider.ref]: { loading: false, error: "", rows: result.items } })); })
        .catch(reason => { if (active) setReferences(current => ({ ...current, [provider.ref]: { loading: false, error: workflowErrorMessage(reason), rows: [] } })); });
    }
    return () => { active = false; };
  }, [environmentRef, providerRefsKey]);

  const filtered = filterProviderCards(providers, [], search);

  function toggleModel(entry: CatalogConnection, model: string, enabled: boolean) {
    const current = providerModelRefs(entry);
    const draft = drafts[entry.ref] ?? current;
    const next = enabled ? (draft.includes(model) ? [...draft] : [...draft, model]) : draft.filter(item => item !== model);
    setDrafts(currentDrafts => {
      const copy = { ...currentDrafts };
      if (modelSelectionDirty(current, next)) copy[entry.ref] = next;
      else delete copy[entry.ref];
      return copy;
    });
    setFeedback(null);
  }

  function discardDraft(entry: CatalogConnection) {
    setDrafts(current => { const copy = { ...current }; delete copy[entry.ref]; return copy; });
    setCredentials(current => { const copy = { ...current }; delete copy[entry.ref]; return copy; });
    setFeedback(null);
  }

  async function publishDraft(entry: CatalogConnection) {
    const draft = draftModelsFor(entry, drafts);
    if (!canSaveModelDraft(draft)) return;
    setBusyRef(entry.ref); setFeedback(null);
    try {
      await workflowApiV2.extension(environmentRef, providerPublishRequest(entry, draft, credentials[entry.ref] ?? ""));
      setFeedback({ ok: true, text: `已保存「${providerDisplayName(entry)}」的 ${draft.length} 个模型。` });
      discardDraft(entry);
      onResourcesChanged?.();
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusyRef(""); }
  }

  async function testConnection(entry: CatalogConnection) {
    setBusyRef(entry.ref); setFeedback(null);
    try {
      const result = await workflowApiV2.testExtension(environmentRef, { ref: entry.ref, version: entry.version });
      setTests(current => ({ ...current, [entry.ref]: { result, at: Date.now() } }));
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusyRef(""); }
  }

  async function disableConnection(entry: CatalogConnection) {
    setBusyRef(entry.ref); setFeedback(null);
    try {
      await workflowApiV2.extension(environmentRef, { action: "disable", kind: "connection", ref: entry.ref, version: entry.version });
      setFeedback({ ok: true, text: `已停用「${providerDisplayName(entry)}」；引用它的节点会提示不可用。` });
      onResourcesChanged?.();
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusyRef(""); }
  }

  function toggleExpanded(ref: string, panel: ExpandedPanel) {
    setExpanded(current => ({ ...current, [ref]: current[ref] === panel ? undefined : panel }));
  }

  return <section className="wf-resource-section" aria-label="模型供应商总览">
    <div className="wf-resource-overview-toolbar">
      <p className="wf-field-note">一个供应商保存一份地址和凭据，可以启用多个模型。</p>
      <div className="wf-resource-overview-actions">
        <label>搜索供应商或模型<input aria-label="搜索模型供应商" value={search} onChange={event => setSearch(event.target.value)} placeholder="名称、类型或模型名" /></label>
        <button type="button" className="primary" data-provider-action="add" onClick={onRequestAdd}>+ 添加模型</button>
      </div>
    </div>
    {feedback ? <p className={feedback.ok ? "wf-resource-feedback" : "wf-resource-feedback is-error"} role={feedback.ok ? "status" : "alert"}>{feedback.text}</p> : null}
    {error ? <p role="alert">模型供应商暂时无法读取：{error}{onReload ? <button type="button" onClick={onReload}>重试</button> : null}</p> : null}
    {loading ? <p role="status">正在读取模型供应商…</p> : null}

    {filtered.providers.map(entry => {
      const current = providerModelRefs(entry);
      const draft = draftModelsFor(entry, drafts);
      const test = tests[entry.ref];
      const rows = modelRowsFor(entry, draft, testModelsOf(test));
      const referenceState = references[entry.ref];
      const dirty = modelSelectionDirty(current, draft);
      const credentialRequired = credentialRequiredForConnection(entry) || entry.hasCredential;
      const credential = credentials[entry.ref] ?? "";
      const canSave = canSaveModelDraft(draft) && !busyRef && (!credentialRequired || Boolean(credential.trim()));
      const usage = referenceState?.loading ? "正在读取引用…" : referenceState?.error ? "引用暂时无法读取" : `被 ${providerUsageCount(referenceState?.rows ?? [])} 个工作流使用`;
      return <article className="wf-resource-provider-card" data-provider-ref={entry.ref} key={`${entry.ref}@${entry.version}`}>
        <header className="wf-resource-provider-head">
          <span className="wf-resource-provider-icon" aria-hidden="true">{providerInitial(providerDisplayName(entry))}</span>
          <div className="wf-resource-provider-identity">
            <strong>{providerDisplayName(entry)}</strong>
            <small>{providerTypeLabel(entry)} · {providerAddress(entry)}</small>
          </div>
          <div className="wf-resource-provider-badges">
            {isLocalProvider(entry) ? <span className="wf-resource-badge is-local">仅本地开发可用</span> : null}
            {entry.disabled ? <span className="wf-resource-badge is-disabled">已停用</span> : null}
          </div>
          <div className="wf-resource-actions">
            <button type="button" data-provider-action="test" disabled={Boolean(busyRef) || entry.disabled} onClick={() => void testConnection(entry)}>{busyRef === entry.ref ? "处理中…" : "测试连接"}</button>
            <button type="button" data-provider-action="edit" disabled={Boolean(busyRef) || entry.disabled} onClick={() => onRequestEdit(entry.ref)}>编辑</button>
            <details className="wf-resource-menu">
              <summary aria-label={`更多操作 ${providerDisplayName(entry)}`}>⋯</summary>
              <div className="wf-resource-menu-panel">
                <button type="button" data-provider-action="disable" disabled={Boolean(busyRef) || entry.disabled} onClick={() => void disableConnection(entry)}>停用</button>
                    <button type="button" data-provider-action="references" aria-expanded={expanded[entry.ref] === "references"} onClick={() => toggleExpanded(entry.ref, "references")}>引用</button>
              </div>
            </details>
          </div>
        </header>
        <p className="wf-resource-provider-meta">{credentialLabel(entry)} · {usage} · {providerTestStatusLabel(test)}</p>
        <table className="wf-resource-table wf-resource-provider-models">
          <thead><tr><th>模型</th><th>来源</th><th>引用节点</th><th>启用</th></tr></thead>
          <tbody>{rows.map(model => <tr key={model} data-model={model}>
            <td><strong>{model}</strong></td>
            <td>{modelSourceLabel(entry, model, draft, testModelsOf(test))}</td>
            <td>{referenceState?.loading ? "读取中…" : referenceState?.error ? "—" : `${modelUsageCount(referenceState?.rows ?? [], model)} 个节点`}</td>
            <td><input type="checkbox" role="switch" data-model-ref={model} aria-label={`启用模型 ${model}`} checked={draft.includes(model)} disabled={Boolean(busyRef) || entry.disabled} onChange={event => toggleModel(entry, model, event.target.checked)} /></td>
          </tr>)}</tbody>
        </table>
        {!rows.length ? <p className="wf-resource-empty">还没有启用的模型。点击「编辑」添加模型。</p> : null}
        {test ? <ResourceTestPanel result={test.result} /> : null}
        {expanded[entry.ref] === "references" ? <div className="wf-resource-inline-references"><h4>引用位置</h4><ResourceReferences rows={referenceState?.rows ?? []} loading={referenceState?.loading} error={referenceState?.error} onOpen={onOpenReference} emptyText="暂无工作流引用此供应商。" /></div> : null}
        {dirty ? <div className="wf-resource-stage-bar" data-provider-confirm={entry.ref}>
          <p>保存后，模型会出现在节点里；已经保存的工作流保持原样。</p>
          {credentialRequired ? <label>API Key<input aria-label={`保存模型 API Key ${entry.ref}`} type="password" autoComplete="new-password" value={credential} onChange={event => setCredentials(current => ({ ...current, [entry.ref]: event.target.value }))} /></label> : null}
          {!canSaveModelDraft(draft) ? <p role="alert">至少保留一个模型才能保存。</p> : null}
          {credentialRequired && !credential.trim() ? <small>重新输入 API Key 才能发布新版本（只写不读）。</small> : null}
          <div className="wf-resource-actions">
            <button type="button" data-provider-action="discard" onClick={() => discardDraft(entry)}>放弃</button>
            <button type="button" className="primary" data-provider-action="save" disabled={!canSave} title={!canSave ? "至少保留一个模型并填写 API Key。" : undefined} onClick={() => void publishDraft(entry)}>保存模型</button>
          </div>
        </div> : null}
      </article>;
    })}

    {!filtered.providers.length && !loading ? <p className="wf-resource-empty">{search.trim() ? "没有匹配的供应商或模型。" : "还没有模型供应商。点击「+ 添加模型」创建，或检查是否已停用。"}</p> : null}
  </section>;
}
