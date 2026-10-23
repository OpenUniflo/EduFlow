import { useEffect, useState } from "react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import { useExtensions } from "../editor/v2/FunctionExecutionFields";
import { connectionDraftIssue } from "../editor/v2/connectionDraft";
import type { ConnectionTestResult, JsonValue, ResourceReferenceRow, WorkflowTool } from "../domain/v2/types";
import { connectionTypeLabel, credentialLabel, latestConnectionsOfType, latestVersion } from "./resourceModel";
import { ResourceReferences } from "./ResourceReferences";
import { ResourceTestPanel } from "./ResourceTestPanel";
import type { ResourceSectionProps } from "./resourceTypes";

type Feedback = { ok: boolean; text: string };
type ReferenceView = { key: string; loading: boolean; error: string; rows: ResourceReferenceRow[] };
type TestView = { key: string; result: ConnectionTestResult };

/** Migration of the previous MCP HTTP connection form into the resource center. */
export function McpResource({ environmentRef, create = false, onCreated, onResourcesChanged, onOpenReference, tools }: Pick<ResourceSectionProps, "environmentRef" | "create" | "onCreated" | "onResourcesChanged" | "onOpenReference"> & { tools?: readonly WorkflowTool[] }) {
  const { data, error, refresh } = useExtensions(environmentRef);
  const [ref, setRef] = useState("");
  const [url, setUrl] = useState("");
  const [names, setNames] = useState("");
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [test, setTest] = useState<TestView | null>(null);
  const [references, setReferences] = useState<ReferenceView | null>(null);
  const [loadedTools, setLoadedTools] = useState<WorkflowTool[]>([]);
  const [toolsError, setToolsError] = useState("");
  const [toolsGeneration, setToolsGeneration] = useState(0);

  useEffect(() => {
    if (tools || !environmentRef) return;
    let active = true;
    workflowApiV2.tools(environmentRef)
      .then(result => { if (active) { setLoadedTools(result.items); setToolsError(""); } })
      .catch(reason => { if (active) setToolsError(workflowErrorMessage(reason)); });
    return () => { active = false; };
  }, [environmentRef, tools, toolsGeneration]);

  if (!environmentRef) return <p role="alert">工作流服务暂时不可用，暂时无法读取资源。</p>;
  if (!data) return <p role={error ? "alert" : "status"}>{error || "正在读取 MCP 服务…"}{error ? <button type="button" onClick={refresh}>重试</button> : null}</p>;

  const connections = latestConnectionsOfType(data.connections, "mcp-http");
  const catalogTools = tools ?? loadedTools;
  const nextVersion = latestVersion(data.connections, ref.trim()) + 1;
  const draftIssue = connectionDraftIssue({ kind: "mcp-http", ref, url, credential, version: nextVersion });

  async function publish() {
    if (draftIssue) return;
    const version = nextVersion;
    const name = ref.trim();
    const content: Record<string, JsonValue> = {
      type: "mcp-http", name, url: url.trim(),
      allowedToolNames: names.split(",").map(item => item.trim()).filter(Boolean),
    };
    setBusy(true); setFeedback(null);
    try {
      await workflowApiV2.extension(environmentRef, { action: "publish", kind: "connection", ref: name, version, content, credential });
      setCredential("");
      setFeedback({ ok: true, text: `已保存 MCP 服务「${name}」v${version}；正在运行的任务仍使用已冻结的连接。` });
      refresh(); setToolsGeneration(current => current + 1); onCreated?.(name, version, content); onResourcesChanged?.();
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusy(false); }
  }

  async function testConnection(entry: (typeof connections)[number]) {
    const key = `${entry.ref}@${entry.version}`;
    setBusy(true); setFeedback(null);
    try {
      const result = await workflowApiV2.testExtension(environmentRef, { ref: entry.ref, version: entry.version });
      setTest({ key, result });
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusy(false); }
  }

  async function disableConnection(entry: (typeof connections)[number]) {
    setBusy(true); setFeedback(null);
    try {
      await workflowApiV2.extension(environmentRef, { action: "disable", kind: "connection", ref: entry.ref, version: entry.version });
      setFeedback({ ok: true, text: `已停用 MCP 服务「${entry.ref}」v${entry.version}。` });
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
    <legend>新建 MCP 服务连接</legend>
    <label>连接标识<input aria-label="MCP 连接标识" value={ref} onChange={event => setRef(event.target.value)} placeholder="例如 knowledge_search" /></label>
    <label>MCP HTTP 地址<input aria-label="MCP 服务地址" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/mcp" /></label>
    <label>允许的工具名称（逗号分隔）<input aria-label="MCP 允许工具" value={names} onChange={event => setNames(event.target.value)} placeholder="留空表示不限制" /></label>
    <label>凭据（可选）<input aria-label="MCP 连接凭据" type="password" autoComplete="new-password" value={credential} onChange={event => setCredential(event.target.value)} /></label>
    <small>以 Authorization 头传入，请填写完整值，例如 Bearer …。测试会按当前连接发现可用工具。</small>
    {draftIssue ? <small role="status">{draftIssue}</small> : null}
    <button type="button" className="primary" disabled={Boolean(draftIssue) || busy} title={draftIssue || undefined} onClick={() => void publish()}>{busy ? "正在保存…" : `保存连接 v${nextVersion}`}</button>
  </fieldset>;

  return <section className="wf-resource-section" aria-label="MCP 服务">
    <p className="wf-field-note">MCP 服务连接由当前账号持有；测试结果里的工具来自实际发现，不写入工作流定义。</p>
    {feedback ? <p className={feedback.ok ? "wf-resource-feedback" : "wf-resource-feedback is-error"} role={feedback.ok ? "status" : "alert"}>{feedback.text}</p> : null}
    {create ? form : <details className="wf-resource-create"><summary>添加 MCP 服务</summary>{form}</details>}
    {toolsError ? <p role="alert">工具目录暂时无法读取：{toolsError}</p> : null}

    <h3>现有 MCP 服务（{connections.length}）</h3>
    {connections.length ? connections.map(entry => {
      const key = `${entry.ref}@${entry.version}`;
      const discovered = catalogTools.filter(tool => tool.connectionRef === entry.ref);
      return <article className="wf-resource-card" key={key}>
        <header><strong>{String(entry.content.name ?? entry.ref)}</strong><span className="wf-resource-badge">{connectionTypeLabel(String(entry.content.type))} · v{entry.version}</span></header>
        <p className="wf-resource-card-meta">{String(entry.content.url ?? "")}</p>
        <small>{credentialLabel(entry)} · 已发现 {discovered.length} 个工具</small>
        <div className="wf-resource-actions">
          <button type="button" disabled={busy || entry.disabled} onClick={() => void testConnection(entry)}>测试连接</button>
          <button type="button" aria-expanded={references?.key === entry.ref} onClick={() => void toggleReferences(entry.ref)}>引用</button>
          <button type="button" disabled={busy || entry.disabled} onClick={() => void disableConnection(entry)}>停用连接</button>
        </div>
        {discovered.length ? <details className="wf-resource-tools"><summary>已发现的工具（{discovered.length}）</summary><ul>{discovered.map(tool => <li key={tool.ref}><strong>{tool.name}</strong>{tool.description ? <small>{tool.description}</small> : null}</li>)}</ul></details> : null}
        {test?.key === key ? <ResourceTestPanel result={test.result} /> : null}
        {references?.key === entry.ref ? <div className="wf-resource-inline-references"><h4>引用位置</h4><ResourceReferences rows={references.rows} loading={references.loading} error={references.error} onOpen={onOpenReference} emptyText="暂无工作流引用此服务。" /></div> : null}
      </article>;
    }) : <p className="wf-resource-empty">还没有 MCP 服务连接。</p>}
  </section>;
}
