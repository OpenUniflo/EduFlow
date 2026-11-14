import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import { latestVersion, type CatalogConnection } from "./resourceModel";
import type { ConnectionTestResult, JsonValue, McpMarketItem, McpOAuthDiscovery } from "../domain/v2/types";
import { mcpAuthFromHint, mcpAuthTypeOf, mcpConnectionAuth, mcpConnectionErrorMessage, mcpConnectionRefFor, mcpConnectionTitle, mcpHeaderForHint, uniqueMcpRef, type McpDraftAuth } from "./mcpMarketModel";
import { McpModal } from "./McpModal";

type Props = {
  environmentRef: string;
  server?: McpMarketItem;
  entry?: CatalogConnection;
  connections: readonly CatalogConnection[];
  returnTo: string;
  onClose: () => void;
  onSaved: (ref: string, version: number, content: Record<string, JsonValue>) => void;
};

function parameterCount(schema: unknown) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return 0;
  const properties = (schema as { properties?: unknown }).properties;
  return properties && typeof properties === "object" && !Array.isArray(properties) ? Object.keys(properties).length : 0;
}

export function McpConnectDialog({ environmentRef, server, entry, connections, returnTo, onClose, onSaved }: Props) {
  const existing = Boolean(entry);
  const existingAuth = entry ? mcpAuthTypeOf(entry.content, entry.hasCredential) : null;
  const [name, setName] = useState(entry ? mcpConnectionTitle(entry) : server?.title ?? "");
  const [ref, setRef] = useState(entry?.ref ?? (server ? mcpConnectionRefFor(server, connections) : ""));
  const [refTouched, setRefTouched] = useState(Boolean(entry || server));
  const [url, setUrl] = useState(entry ? String(entry.content.url ?? "") : server?.url ?? "");
  const [transport, setTransport] = useState<"streamable-http" | "sse">(entry ? (entry.content.transport === "sse" ? "sse" : "streamable-http") : server?.transport ?? "streamable-http");
  const [authType, setAuthType] = useState<McpDraftAuth>(existingAuth ?? (server ? mcpAuthFromHint(server.authHint) : "none"));
  const [credentialHeader, setCredentialHeader] = useState(entry ? String(entry.content.credentialHeader ?? "X-API-Key") : mcpHeaderForHint(server?.authHint, server?.headerHints ?? []));
  const [credential, setCredential] = useState("");
  const [oauth, setOauth] = useState<Record<string, JsonValue> | null>(entry && entry.content.oauth && typeof entry.content.oauth === "object" && !Array.isArray(entry.content.oauth) ? entry.content.oauth as Record<string, JsonValue> : null);
  const [reauth, setReauth] = useState(false);
  const [scopeInfo, setScopeInfo] = useState<McpOAuthDiscovery | null>(null);
  const [resourceMetadataUrl, setResourceMetadataUrl] = useState("");
  const savedScope = (() => {
    const value = entry?.content.oauth;
    return value && typeof value === "object" && !Array.isArray(value) && typeof value.scope === "string" ? value.scope : "";
  })();
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(() => new Set(savedScope.split(" ").filter(Boolean)));
  const [scopeLoading, setScopeLoading] = useState(false);
  const [tools, setTools] = useState<ConnectionTestResult["tools"] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(Array.isArray(entry?.content.allowedToolNames) ? entry.content.allowedToolNames.filter((item): item is string => typeof item === "string") : []));
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const sourceId = server?.sourceId ?? (typeof entry?.content.registryServerId === "string" ? entry.content.registryServerId : "");
  const serverTitle = server?.title ?? (typeof entry?.content.serverTitle === "string" ? entry.content.serverTitle : "");
  const isOAuth = authType === "oauth";
  const canReuseCredential = Boolean(entry?.hasCredential) && (existingAuth === authType || authType === "legacy");
  const oauthBlocked = isOAuth && !existing;
  const selectedCount = selected.size;
  const allSelected = Boolean(tools?.length) && tools!.every(tool => selected.has(tool.name));
  const title = existing ? "配置 MCP 连接" : server ? `连接 ${server.title}` : "连接自定义 MCP 服务";
  const subtitle = existing ? `${entry ? mcpConnectionAuth(entry) : ""} · 保存后更新当前连接，旧工作流的调用同样受当前权限约束` : "仅支持远程 MCP 服务；不会在本机安装或运行任何本地服务。";

  useEffect(() => {
    if (entry) void readTools();
    // The entry identity is immutable; loading once per dialog keeps the form stable.
  }, [entry?.ref, entry?.version]);

  const draftContent = useMemo<Record<string, JsonValue>>(() => {
    const content: Record<string, JsonValue> = {
      type: "mcp-http", name: name.trim(), url: url.trim(), transport, authType,
      allowedToolNames: [...selected],
      ...(sourceId ? { registryServerId: sourceId } : {}),
      ...(serverTitle ? { serverTitle } : {}),
    };
    if (authType === "api-key") content.credentialHeader = credentialHeader.trim() || "X-API-Key";
    if (authType === "oauth" && oauth) content.oauth = oauth;
    return content;
  }, [authType, credentialHeader, name, oauth, selected, serverTitle, sourceId, transport, url]);

  function toggleTool(toolName: string) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(toolName)) next.delete(toolName); else next.add(toolName);
      return next;
    });
  }
  function selectAll() {
    if (!tools) return;
    setSelected(allSelected ? new Set() : new Set(tools.map(tool => tool.name)));
  }
  function generateRef(value: string) {
    return uniqueMcpRef(value.trim() || server?.suggestedRef || "mcp_service", connections.map(item => item.ref));
  }
  async function loadScopes() {
    setError(""); setScopeLoading(true);
    try {
      const result = await workflowApiV2.discoverMcpOAuth({ url: url.trim() });
      setScopeInfo(result);
      setResourceMetadataUrl(result.resourceMetadataUrl ?? "");
      setSelectedScopes(current => current.size ? current : new Set());
      if (!result.scopes.length) setNotice("服务未声明授权范围，将不申请额外范围。");
    } catch (reason) { setError(workflowErrorMessage(reason)); }
    finally { setScopeLoading(false); }
  }
  async function readTools() {
    setToolsError(""); setToolsLoading(true); setError("");
    try {
      let result: ConnectionTestResult;
      if (entry && !credential) {
        result = await workflowApiV2.testExtension(environmentRef, { ref: entry.ref, version: entry.version });
      } else {
        if (!url.trim()) throw new Error("请填写服务地址。");
        if ((authType === "bearer" || authType === "api-key" || authType === "legacy") && !credential && !canReuseCredential) throw new Error("请填写凭据后再读取工具。");
        result = await workflowApiV2.inspectMcp(environmentRef, { content: draftContent, credential });
      }
      if (!result.ok) throw new Error(mcpConnectionErrorMessage(result.error?.code));
      const discovered = result.tools ?? [];
      setTools(discovered);
      // Reading discovery never grants permission. Only an explicit checkbox
      // selection is persisted as allowedToolNames.
      setSelected(current => current.size ? current : new Set());
      setNotice(discovered.length ? `已读取 ${discovered.length} 个工具；默认不授权，请明确勾选允许项。` : "连接成功，但此服务没有返回工具。");
    } catch (reason) {
      setToolsError(reason instanceof Error ? reason.message : workflowErrorMessage(reason));
    } finally { setToolsLoading(false); }
  }
  async function startOAuth(version: number, targetRef: string) {
    if (!url.trim() || !name.trim() || !targetRef) throw new Error("请填写名称和服务地址。");
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(targetRef)) throw new Error("连接标识需以字母开头，只能使用字母、数字、下划线、点和短横线。");
    let available = scopeInfo;
    if (!available) {
      setScopeLoading(true);
      try { available = await workflowApiV2.discoverMcpOAuth({ url: url.trim() }); setScopeInfo(available); setResourceMetadataUrl(available.resourceMetadataUrl ?? ""); }
      finally { setScopeLoading(false); }
    }
    if (available.scopes.length && !selectedScopes.size) {
      setError(`请先选择本次连接需要的授权范围：${available.scopes.join("、")}`);
      return;
    }
    const result = await workflowApiV2.startMcpOAuth({
      environmentRef, ref: targetRef, version, name: name.trim(), url: url.trim(), transport,
      ...(sourceId ? { sourceId } : {}), ...(serverTitle ? { serverTitle } : {}), returnTo,
      ...(available.scopes.length ? { scopes: [...selectedScopes] } : {}),
      ...(resourceMetadataUrl ? { resourceMetadataUrl } : {}),
    });
    window.location.assign(result.authorizationUrl);
  }
  async function save() {
    setError(""); setNotice("");
    if (!name.trim()) { setError("请填写名称。"); return; }
    const finalRef = ref.trim() || generateRef(name);
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(finalRef)) { setError("连接标识需以字母开头，只能使用字母、数字、下划线、点和短横线。"); return; }
    if (!ref.trim()) setRef(finalRef);
    if (!/^https?:\/\//i.test(url.trim())) { setError("服务地址需以 http:// 或 https:// 开头。"); return; }
    if ((authType === "bearer" || authType === "api-key" || authType === "legacy") && !credential && !canReuseCredential) { setError("请填写凭据。"); return; }
    if (isOAuth && (!entry || reauth)) {
      setBusy(true);
      try { await startOAuth(latestVersion(connections, finalRef) + 1, finalRef); }
      catch (reason) { setError(workflowErrorMessage(reason)); setBusy(false); }
      return;
    }
    const version = latestVersion(connections, finalRef) + 1;
    const content: Record<string, JsonValue> = { ...draftContent, allowedToolNames: [...selected] };
    setBusy(true);
    try {
      await workflowApiV2.extension(environmentRef, {
        action: "publish", kind: "connection", ref: finalRef, version, content,
        ...(credential && !isOAuth ? { credential } : {}),
      });
      const savedNotice = `已保存「${name.trim()}」v${version}。`;
      try {
        const tested = await workflowApiV2.testExtension(environmentRef, { ref: finalRef, version });
        if (tested.ok) setNotice(`${savedNotice}服务端返回 ${tested.tools?.length ?? 0} 个工具，已允许 ${selected.size} 个。`);
        else setNotice(`${savedNotice}但连接测试失败：${mcpConnectionErrorMessage(tested.error?.code)}。可在“已连接”中重试。`);
      } catch (reason) {
        setNotice(`${savedNotice}但连接测试失败：${workflowErrorMessage(reason)}。可在“已连接”中重试。`);
      }
      onSaved(finalRef, version, content);
    } catch (reason) {
      setError(workflowErrorMessage(reason));
    } finally { setBusy(false); }
  }

  return <McpModal
    title={title}
    subtitle={subtitle}
    onClose={onClose}
    wide
    footer={<>
      <span className="wf-mcp-modal-hint">{isOAuth && (!entry || reauth) ? "将跳转到服务方完成 OAuth 授权；工具权限不会自动授予" : `${selectedCount} 个工具将允许在工作流中使用`}</span>
      <div className="wf-resource-actions">
        <button type="button" onClick={onClose} disabled={busy}>取消</button>
        <button type="button" className="primary" onClick={() => void save()} disabled={busy || scopeLoading}>{scopeLoading ? "读取范围…" : busy ? "正在保存…" : isOAuth && (!entry || reauth) ? "前往授权" : "保存连接"}</button>
      </div>
    </>}
  >
    {error ? <p className="wf-resource-feedback is-error" role="alert">{error}</p> : null}
    {notice ? <p className="wf-resource-feedback" role="status">{notice}</p> : null}
    <div className="wf-mcp-form-grid">
      <label>名称<input aria-label="MCP 连接名称" value={name} onChange={event => { const value = event.target.value; setName(value); if (!existing && !refTouched) setRef(generateRef(value)); }} placeholder="例如 团队知识库" /></label>
      <div className="wf-mcp-ref-preview"><span>连接标识</span><code>{ref || "保存时自动生成"}</code></div>
    </div>
    <details className="wf-mcp-advanced"><summary>高级：自定义连接标识</summary><label>连接标识<input aria-label="MCP 连接标识" value={ref} readOnly={existing} onChange={event => { setRefTouched(true); setRef(event.target.value); }} placeholder="留空时按名称自动生成" /><small>只用于代码和引用，不会出现在主要操作流程中。</small></label></details>
    <label>服务地址<input aria-label="MCP 服务地址" value={url} readOnly={Boolean(server)} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/mcp" /></label>
    <div className="wf-mcp-form-grid">
      <label>传输方式<select aria-label="MCP 传输方式" value={transport} onChange={event => setTransport(event.target.value === "sse" ? "sse" : "streamable-http")}><option value="streamable-http">Streamable HTTP</option><option value="sse">SSE</option></select></label>
      <label>鉴权方式<select aria-label="MCP 鉴权方式" value={authType} onChange={event => { setAuthType(event.target.value as McpDraftAuth); setTools(null); setSelected(new Set()); }}><option value="none">无需鉴权</option><option value="bearer">Bearer 令牌</option><option value="api-key">API Key</option><option value="oauth">OAuth</option>{existingAuth === "legacy" ? <option value="legacy">旧版凭据（Authorization 原值）</option> : null}</select></label>
    </div>
    {authType === "api-key" ? <label>凭据请求头<input aria-label="MCP 凭据请求头" value={credentialHeader} onChange={event => setCredentialHeader(event.target.value)} placeholder="X-API-Key" /></label> : null}
    {authType === "bearer" || authType === "api-key" || authType === "legacy" ? <label>凭据{canReuseCredential ? "（留空沿用已保存凭据）" : ""}<input aria-label="MCP 连接凭据" type="password" autoComplete="new-password" value={credential} onChange={event => setCredential(event.target.value)} placeholder={canReuseCredential ? "已保存，留空表示不更换" : "只保存在服务端，不会显示或回传"} /></label> : null}
    {isOAuth ? <div className="wf-mcp-oauth-note">
      <strong>OAuth 连接</strong>
      <p>{existing && !reauth ? "已有授权令牌由服务端安全保管。需要重新登录服务方时，勾选“重新授权”。" : "点击“前往授权”后在服务方页面登录；回调只保存授权令牌，不会默认允许任何工具。"}</p>
      {existing ? <label className="wf-resource-checkbox"><input type="checkbox" checked={reauth} onChange={event => setReauth(event.target.checked)} />重新授权</label> : null}
      {(!existing || reauth) ? <div className="wf-mcp-scope-picker">
        <div><strong>授权范围</strong><button type="button" disabled={scopeLoading} onClick={() => void loadScopes()}>{scopeLoading ? "读取中…" : scopeInfo ? "重新读取" : "读取可用范围"}</button></div>
        {scopeInfo ? scopeInfo.scopes.length ? <fieldset><legend>只申请本次需要的范围</legend>{scopeInfo.scopes.map(scope => <label className="wf-resource-checkbox" key={scope}><input type="checkbox" checked={selectedScopes.has(scope)} onChange={() => setSelectedScopes(current => { const next = new Set(current); if (next.has(scope)) next.delete(scope); else next.add(scope); return next; })} /><span>{scope}</span></label>)}</fieldset> : <p className="wf-field-note">服务未声明授权范围，将不申请额外范围。</p> : <p className="wf-field-note">先读取服务声明的范围并选择；不选择时不会自动申请全部范围。</p>}
      </div> : <p className="wf-field-note">当前申请范围：{typeof oauth?.scope === "string" && oauth.scope ? oauth.scope : "服务未声明，未申请额外范围"}</p>}
      {server?.websiteUrl ? <a href={server.websiteUrl} target="_blank" rel="noreferrer">服务说明<ExternalLink size={12} aria-hidden /></a> : null}
    </div> : null}
    <section className="wf-mcp-tools-editor" aria-label="工具范围">
      <header>
        <div><h4>允许使用的工具</h4><p>{entry ? "连接测试只读取工具元数据；保存后，节点里只会出现勾选的工具。" : "先读取服务真实提供的工具，再选择允许范围。未勾选的工具不会进入工作流。"}</p></div>
        <div className="wf-resource-actions">
          {tools?.length ? <button type="button" onClick={selectAll}>{allSelected ? "取消全选" : "全选"}</button> : null}
          <button type="button" disabled={toolsLoading || oauthBlocked} onClick={() => void readTools()}>{toolsLoading ? <><LoaderCircle size={13} aria-hidden /> 读取中…</> : <><RefreshCw size={13} aria-hidden /> {tools ? "刷新工具" : entry ? "读取当前工具" : "读取工具"}</>}</button>
        </div>
      </header>
      {oauthBlocked ? <p className="wf-field-note">OAuth 授权完成后会保存连接，但不会自动允许工具；请回到“已连接”配置明确勾选。</p> : null}
      {toolsError ? <p className="wf-resource-feedback is-error" role="alert">{toolsError}</p> : null}
      {tools?.length ? <ul className="wf-mcp-tool-checklist">{tools.map(tool => <li key={tool.name}>
        <label className="wf-resource-checkbox">
          <input type="checkbox" checked={selected.has(tool.name)} onChange={() => toggleTool(tool.name)} />
          <span><strong>{tool.name}</strong>{tool.description ? <small>{tool.description}</small> : null}</span>
        </label>
        <span className="wf-mcp-tool-meta">{parameterCount(tool.inputSchema)} 个参数</span>
      </li>)}</ul> : null}
      {tools && !tools.length ? <p className="wf-field-note">服务没有返回工具；连接仍可保存，但工作流里暂时无法选择工具。</p> : null}
      {!tools && !oauthBlocked ? <p className="wf-field-note">{entry && selectedCount ? `已保存 ${selectedCount} 个允许工具；点击“读取当前工具”核对服务端最新列表。` : "还没有读取工具。读取后可以逐个确认允许使用的工具。"}</p> : null}
      {selectedCount ? <p className="wf-mcp-selected-note"><Check size={13} aria-hidden /> 已允许 {selectedCount} 个工具</p> : null}
    </section>
    <p className="wf-field-note">凭据只提交到服务端安全存储；页面不会读取、显示或回传已保存的密钥。保存会更新当前连接，旧工作流的调用同样受当前权限约束。</p>
  </McpModal>;
}
