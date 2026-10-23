import { useState } from "react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import { useExtensions } from "../editor/v2/FunctionExecutionFields";
import { JsonField } from "../editor/v2/JsonField";
import { connectionDraftIssue, connectionTestIssue } from "../editor/v2/connectionDraft";
import type { ConnectionTestResult, JsonValue, ResourceReferenceRow } from "../domain/v2/types";
import { connectionAccessLabel, connectionTypeLabel, credentialLabel, latestConnectionsOfType, latestVersion } from "./resourceModel";
import { ResourceReferences } from "./ResourceReferences";
import { ResourceTestPanel } from "./ResourceTestPanel";
import type { ResourceSectionProps } from "./resourceTypes";

type Feedback = { ok: boolean; text: string };
type ReferenceView = { key: string; loading: boolean; error: string; rows: ResourceReferenceRow[] };
type TestView = { key: string; result: ConnectionTestResult };

/** Migration of the previous HTTP connection form into the resource center. */
export function ApiResource({ environmentRef, create = false, onCreated, onResourcesChanged, onOpenReference }: Pick<ResourceSectionProps, "environmentRef" | "create" | "onCreated" | "onResourcesChanged" | "onOpenReference">) {
  const { data, error, refresh } = useExtensions(environmentRef);
  const [ref, setRef] = useState("");
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("/");
  const [credential, setCredential] = useState("");
  const [write, setWrite] = useState(false);
  const [argumentsValue, setArgumentsValue] = useState<Record<string, JsonValue>>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [test, setTest] = useState<TestView | null>(null);
  const [references, setReferences] = useState<ReferenceView | null>(null);

  if (!environmentRef) return <p role="alert">工作流服务暂时不可用，暂时无法读取资源。</p>;
  if (!data) return <p role={error ? "alert" : "status"}>{error || "正在读取 API 连接…"}{error ? <button type="button" onClick={refresh}>重试</button> : null}</p>;

  const connections = latestConnectionsOfType(data.connections, "http");
  const nextVersion = latestVersion(data.connections, ref.trim()) + 1;
  const draftIssue = connectionDraftIssue({ kind: "http", ref, url, credential, version: nextVersion });
  const hasWriteConnection = data.connections.some(connection => !connection.disabled && String(connection.content.sideEffect) === "write");

  async function publish() {
    if (draftIssue) return;
    const version = nextVersion;
    const name = ref.trim();
    const content: Record<string, JsonValue> = {
      type: "http", name, baseUrl: url.trim(), path, method: write ? "POST" : "GET",
      sideEffect: write ? "write" : "read", inputSchema: { type: "object" }, outputSchema: { type: "object" },
    };
    setBusy(true); setFeedback(null);
    try {
      await workflowApiV2.extension(environmentRef, { action: "publish", kind: "connection", ref: name, version, content, credential });
      setCredential("");
      setFeedback({ ok: true, text: `已保存连接「${name}」v${version}；正在运行的任务仍使用已冻结的连接。` });
      refresh(); onCreated?.(name, version, content); onResourcesChanged?.();
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusy(false); }
  }

  async function testConnection(entry: (typeof connections)[number]) {
    const key = `${entry.ref}@${entry.version}`;
    setBusy(true); setFeedback(null);
    try {
      const result = await workflowApiV2.testExtension(environmentRef, { ref: entry.ref, version: entry.version, arguments: argumentsValue, confirmExternalEffect: confirm });
      setTest({ key, result });
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusy(false); }
  }

  async function disableConnection(entry: (typeof connections)[number]) {
    setBusy(true); setFeedback(null);
    try {
      await workflowApiV2.extension(environmentRef, { action: "disable", kind: "connection", ref: entry.ref, version: entry.version });
      setFeedback({ ok: true, text: `已停用连接「${entry.ref}」v${entry.version}；仍引用它的节点会提示版本不可用。` });
      refresh(); onResourcesChanged?.();
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusy(false); }
  }

  async function toggleReferences(connectionRef: string) {
    if (references?.key === connectionRef) { setReferences(null); return; }
    setReferences({ key: connectionRef, loading: true, error: "", rows: [] });
    try {
      const result = await workflowApiV2.extensionReferences(connectionRef, environmentRef);
      setReferences({ key: connectionRef, loading: false, error: "", rows: result.items });
    } catch (reason) {
      setReferences({ key: connectionRef, loading: false, error: workflowErrorMessage(reason), rows: [] });
    }
  }

  const form = <fieldset className="wf-resource-form" disabled={busy}>
    <legend>新建 API 连接</legend>
    <label>连接标识<input aria-label="API 连接标识" value={ref} onChange={event => setRef(event.target.value)} placeholder="例如 price_service" /></label>
    <label>服务地址<input aria-label="API 服务地址" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com" /></label>
    <label>请求路径<input aria-label="API 请求路径" value={path} onChange={event => setPath(event.target.value)} /></label>
    <label className="wf-resource-checkbox"><input type="checkbox" checked={write} onChange={event => setWrite(event.target.checked)} />POST 请求，可能修改外部数据</label>
    <label>凭据（可选）<input aria-label="API 连接凭据" type="password" autoComplete="new-password" value={credential} onChange={event => setCredential(event.target.value)} /></label>
    <small>以 Authorization 头传入，请填写完整值，例如 Bearer …。凭据加密保存，页面只显示是否已配置。</small>
    {draftIssue ? <small role="status">{draftIssue}</small> : null}
    <button type="button" className="primary" disabled={Boolean(draftIssue) || busy} title={draftIssue || undefined} onClick={() => void publish()}>{busy ? "正在保存…" : `保存连接 v${nextVersion}`}</button>
  </fieldset>;

  return <section className="wf-resource-section" aria-label="API 连接">
    <p className="wf-field-note">HTTP 接口连接由当前账号持有；保存后发布为固定版本，节点引用具体版本。</p>
    {feedback ? <p className={feedback.ok ? "wf-resource-feedback" : "wf-resource-feedback is-error"} role={feedback.ok ? "status" : "alert"}>{feedback.text}</p> : null}
    {create ? form : <details className="wf-resource-create"><summary>添加 API 连接</summary>{form}</details>}

    <details className="wf-resource-arguments">
      <summary>连接测试参数</summary>
      <JsonField label="连接测试参数" value={argumentsValue} onChange={setArgumentsValue} />
      <label className="wf-resource-checkbox"><input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)} />允许本次测试修改外部数据</label>
      {hasWriteConnection && !confirm ? <p className="wf-field-note">存在写入连接；测试前请勾选「允许本次测试修改外部数据」。</p> : null}
    </details>

    <h3>现有 API 连接（{connections.length}）</h3>
    {connections.length ? connections.map(entry => {
      const key = `${entry.ref}@${entry.version}`;
      const testIssue = connectionTestIssue({ sideEffect: entry.content.sideEffect, confirm, disabled: entry.disabled });
      return <article className="wf-resource-card" key={key}>
        <header><strong>{String(entry.content.name ?? entry.ref)}</strong><span className="wf-resource-badge">{connectionTypeLabel(String(entry.content.type))} · v{entry.version}</span></header>
        <p className="wf-resource-card-meta">{String(entry.content.baseUrl ?? "")}{String(entry.content.path ?? "/")}</p>
        <small>{String(entry.content.method ?? "GET")} · {connectionAccessLabel(entry.content)} · {credentialLabel(entry)}</small>
        <div className="wf-resource-actions">
          <button type="button" disabled={busy || Boolean(testIssue)} title={testIssue || undefined} onClick={() => void testConnection(entry)}>测试连接</button>
          <button type="button" aria-expanded={references?.key === entry.ref} onClick={() => void toggleReferences(entry.ref)}>引用</button>
          <button type="button" disabled={busy || entry.disabled} onClick={() => void disableConnection(entry)}>停用连接</button>
        </div>
        {testIssue ? <small className="wf-field-note">{testIssue}</small> : null}
        {test?.key === key ? <ResourceTestPanel result={test.result} /> : null}
        {references?.key === entry.ref ? <div className="wf-resource-inline-references"><h4>引用位置</h4><ResourceReferences rows={references.rows} loading={references.loading} error={references.error} onOpen={onOpenReference} emptyText="暂无工作流引用此连接。" /></div> : null}
      </article>;
    }) : <p className="wf-resource-empty">还没有 API 连接。</p>}
  </section>;
}
