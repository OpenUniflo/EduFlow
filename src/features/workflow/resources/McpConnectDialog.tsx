import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { Extensions } from "../editor/v2/FunctionExecutionFields";
import { latestVersion, type CatalogConnection } from "./resourceModel";
import type { ConnectionTestResult, JsonValue, McpMarketItem, McpOAuthDiscovery } from "../domain/v2/types";
import { mcpAuthFromHint, mcpAuthTypeOf, mcpConnectionAuth, mcpConnectionErrorMessage, mcpConnectionRefFor, mcpConnectionTitle, mcpHeaderForHint, uniqueMcpRef, type McpDraftAuth } from "./mcpMarketModel";
import {
  closeMcpOAuthWindow,
  createMcpOAuthFlowId,
  failMcpOAuthWindow,
  navigateMcpOAuthWindow,
  openMcpOAuthWindow,
  subscribeMcpOAuthResult,
  withMcpOAuthReturnTo,
} from "./mcpOAuthWindow";
import { McpModal } from "./McpModal";

type Props = {
  environmentRef: string;
  server?: McpMarketItem;
  entry?: CatalogConnection;
  /** Catalog login recommendation: only show the provider login, never a configuration form. */
  loginOnly?: boolean;
  /** Exact scopes already verified for a catalog login recommendation. */
  loginScopes?: readonly string[];
  connections: readonly CatalogConnection[];
  returnTo: string;
  onClose: () => void;
  onSaved: (ref: string, version: number, content: Record<string, JsonValue>) => void;
  /** Called after the server catalog confirms a new-window OAuth connection. */
  onOAuthConnected?: (ref: string, version: number, content: Record<string, JsonValue>, result: ConnectionTestResult) => void;
};

type OAuthWait = { phase: "opening" | "waiting" | "verifying"; message: string };

type OAuthRuntime = {
  active: boolean;
  flowId: string;
  ref: string;
  version: number;
  popup: Window | null;
  pollTimer: number | null;
  deadlineTimer: number | null;
  closedTimer: number | null;
  probeTimer: number | null;
  unsubscribe: (() => void) | null;
  focus: (() => void) | null;
  visibility: (() => void) | null;
  checking: boolean;
  confirmingVersion: number;
  confirmedVersion: number;
  errorMessage: string;
  delay: number;
};

function parameterCount(schema: unknown) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return 0;
  const properties = (schema as { properties?: unknown }).properties;
  return properties && typeof properties === "object" && !Array.isArray(properties) ? Object.keys(properties).length : 0;
}

/**
 * A saved OAuth connection already contains the authorization server and
 * client registration that were verified when it was created. Re-authorizing
 * can therefore use that configuration directly instead of probing discovery
 * again. The server revalidates every saved URL and looks the connection up by
 * owner/environment/ref, so this browser projection is never authority.
 */
function savedOAuthDiscovery(entry: CatalogConnection | undefined): McpOAuthDiscovery | null {
  if (entry?.content.type !== "mcp-http" || entry.content.authType !== "oauth") return null;
  const value = entry.content.oauth;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const oauth = value as Record<string, JsonValue>;
  const issuer = typeof oauth.issuer === "string" ? oauth.issuer : "";
  const authorizationEndpoint = typeof oauth.authorizationEndpoint === "string" ? oauth.authorizationEndpoint : "";
  const tokenEndpoint = typeof oauth.tokenEndpoint === "string" ? oauth.tokenEndpoint : "";
  const clientId = typeof oauth.clientId === "string" ? oauth.clientId : "";
  const resource = typeof oauth.resource === "string" && oauth.resource ? oauth.resource : String(entry?.content.url ?? "");
  if (!issuer || !authorizationEndpoint || !tokenEndpoint || !clientId || !resource) return null;
  if (oauth.tokenEndpointAuthMethod !== undefined && oauth.tokenEndpointAuthMethod !== "none") return null;
  return {
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    resource,
    scopes: typeof oauth.scope === "string" ? [...new Set(oauth.scope.split(/\s+/).filter(Boolean))] : [],
  };
}

function wait(ms: number) {
  return new Promise<void>(resolve => { window.setTimeout(resolve, ms); });
}

export function McpConnectDialog({ environmentRef, server, entry, loginOnly = false, loginScopes, connections, returnTo, onClose, onSaved, onOAuthConnected }: Props) {
  const existing = Boolean(entry);
  const loginFlow = Boolean(loginOnly && server && !entry);
  const presetScopes = loginFlow ? [...(loginScopes ?? [])] : [];
  const existingAuth = entry ? mcpAuthTypeOf(entry.content, entry.hasCredential) : null;
  const [name, setName] = useState(entry ? mcpConnectionTitle(entry) : server?.title ?? "");
  const [ref, setRef] = useState(entry?.ref ?? (server ? mcpConnectionRefFor(server, connections) : ""));
  const [refTouched, setRefTouched] = useState(Boolean(entry || server));
  const [url, setUrl] = useState(entry ? String(entry.content.url ?? "") : server?.url ?? "");
  const [transport, setTransport] = useState<"streamable-http" | "sse">(entry ? (entry.content.transport === "sse" ? "sse" : "streamable-http") : server?.transport ?? "streamable-http");
  const [authType, setAuthType] = useState<McpDraftAuth>(loginFlow ? "oauth" : existingAuth ?? (server ? mcpAuthFromHint(server.authHint) : "none"));
  const [credentialHeader, setCredentialHeader] = useState(entry ? String(entry.content.credentialHeader ?? "X-API-Key") : mcpHeaderForHint(server?.authHint, server?.headerHints ?? []));
  const [credential, setCredential] = useState("");
  const [oauth, setOauth] = useState<Record<string, JsonValue> | null>(entry && entry.content.oauth && typeof entry.content.oauth === "object" && !Array.isArray(entry.content.oauth) ? entry.content.oauth as Record<string, JsonValue> : null);
  const [reauth, setReauth] = useState(false);
  const [scopeInfo, setScopeInfo] = useState<McpOAuthDiscovery | null>(() => savedOAuthDiscovery(entry));
  const savedScope = (() => {
    const value = entry?.content.oauth;
    return value && typeof value === "object" && !Array.isArray(value) && typeof value.scope === "string" ? value.scope : "";
  })();
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(() => new Set((loginFlow ? presetScopes : savedScope.split(" ").filter(Boolean))));
  const [scopeLoading, setScopeLoading] = useState(false);
  const [tools, setTools] = useState<ConnectionTestResult["tools"] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(Array.isArray(entry?.content.allowedToolNames) ? entry.content.allowedToolNames.filter((item): item is string => typeof item === "string") : []));
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [oauthWait, setOauthWait] = useState<OAuthWait | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const oauthRef = useRef<OAuthRuntime | null>(null);

  const sourceId = server?.sourceId ?? (typeof entry?.content.registryServerId === "string" ? entry.content.registryServerId : "");
  const serverTitle = server?.title ?? (typeof entry?.content.serverTitle === "string" ? entry.content.serverTitle : "");
  const isOAuth = authType === "oauth";
  const oauthStart = isOAuth && (!entry || reauth);
  const canReuseCredential = Boolean(entry?.hasCredential) && (existingAuth === authType || authType === "legacy");
  const oauthBlocked = isOAuth && !existing;
  const selectedCount = selected.size;
  const allSelected = Boolean(tools?.length) && tools!.every(tool => selected.has(tool.name));
  const title = existing ? "配置 MCP 连接" : loginFlow ? `登录${server!.title}` : server ? `连接 ${server.title}` : "连接自定义 MCP 服务";
  const subtitle = existing ? `${entry ? mcpConnectionAuth(entry) : ""} · 保存后更新当前连接，旧工作流的调用同样受当前权限约束` : loginFlow ? "在服务方新窗口完成登录授权；本页不填写连接配置。" : "仅支持远程 MCP 服务；不会在本机安装或运行任何本地服务。";

  useEffect(() => {
    if (entry) void readTools();
    // The entry identity is immutable; loading once per dialog keeps the form stable.
  }, [entry?.ref, entry?.version]);

  useEffect(() => () => {
    const runtime = oauthRef.current;
    if (runtime) stopOAuthRuntime(runtime, { closePopup: true });
  }, []);

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

  function stopOAuthRuntime(runtime: OAuthRuntime, options: { closePopup?: boolean } = {}) {
    if (!runtime) return;
    runtime.active = false;
    if (typeof window !== "undefined") {
      if (runtime.pollTimer !== null) window.clearTimeout(runtime.pollTimer);
      if (runtime.deadlineTimer !== null) window.clearTimeout(runtime.deadlineTimer);
      if (runtime.closedTimer !== null) window.clearInterval(runtime.closedTimer);
      if (runtime.probeTimer !== null) window.clearTimeout(runtime.probeTimer);
      if (runtime.focus) window.removeEventListener("focus", runtime.focus);
    }
    if (typeof document !== "undefined" && runtime.visibility) document.removeEventListener("visibilitychange", runtime.visibility);
    runtime.pollTimer = null; runtime.deadlineTimer = null; runtime.closedTimer = null; runtime.probeTimer = null;
    runtime.unsubscribe?.();
    runtime.unsubscribe = null;
    if (options.closePopup) closeMcpOAuthWindow(runtime.popup);
    if (oauthRef.current === runtime) oauthRef.current = null;
  }

  function finishOAuthError(runtime: OAuthRuntime, message: string) {
    if (!runtime.active) return;
    stopOAuthRuntime(runtime, { closePopup: true });
    setOauthWait(null); setBusy(false); setPopupBlocked(false); setError(message);
  }

  function finishOAuthCancelled(runtime: OAuthRuntime) {
    if (!runtime.active) return;
    stopOAuthRuntime(runtime, { closePopup: true });
    setOauthWait(null); setBusy(false); setPopupBlocked(false);
    setError("授权窗口已关闭，服务端未检测到新的连接。可以重试，或稍后在“已连接”中确认。");
  }

  function finishOAuthAuthorized(runtime: OAuthRuntime, connection: CatalogConnection, result: ConnectionTestResult) {
    if (!runtime.active) return;
    stopOAuthRuntime(runtime, { closePopup: true });
    setOauthWait(null); setBusy(false); setPopupBlocked(false);
    if (onOAuthConnected) onOAuthConnected(connection.ref, connection.version, connection.content, result);
    else onSaved(connection.ref, connection.version, connection.content);
  }

  async function serverConnectionFor(runtime: OAuthRuntime): Promise<CatalogConnection | null> {
    const catalog = await workflowApiV2.extensions<Extensions>(environmentRef);
    return catalog.connections.find(item =>
      item.ref === runtime.ref
      && item.version >= runtime.version
      && !item.disabled
      && item.hasCredential
    ) ?? null;
  }

  async function confirmOAuthConnection(runtime: OAuthRuntime, connection: CatalogConnection) {
    if (!runtime.active || runtime.confirmingVersion === connection.version || runtime.confirmedVersion === connection.version) return;
    runtime.confirmingVersion = connection.version;
    setOauthWait({ phase: "verifying", message: "服务端已保存新连接，正在核对连接与工具权限…" });
    let result: ConnectionTestResult;
    try {
      result = await workflowApiV2.testExtension(environmentRef, { ref: connection.ref, version: connection.version });
    } catch (reason) {
      result = { ok: false, error: { code: "CONNECTION_TEST_FAILED", message: workflowErrorMessage(reason) } };
    }
    if (!runtime.active) return;
    runtime.confirmedVersion = connection.version;
    finishOAuthAuthorized(runtime, connection, result);
  }

  function scheduleOAuthPoll(runtime: OAuthRuntime) {
    if (!runtime.active || runtime.pollTimer !== null) return;
    const delay = runtime.delay;
    runtime.pollTimer = window.setTimeout(() => {
      runtime.pollTimer = null;
      runtime.delay = Math.min(Math.round(runtime.delay * 1.35), 8000);
      void checkOAuthConnection(runtime, "poll");
    }, delay);
  }

  async function checkOAuthConnection(runtime: OAuthRuntime, trigger: "poll" | "focus" | "notification" | "notification-error" | "manual") {
    if (!runtime.active || runtime.checking) return;
    runtime.checking = true;
    try {
      const connection = await serverConnectionFor(runtime);
      if (!runtime.active) return;
      if (connection) {
        await confirmOAuthConnection(runtime, connection);
        return;
      }
      if (trigger === "notification-error") finishOAuthError(runtime, runtime.errorMessage || "OAuth 授权未完成，请重新发起。");
      else if (trigger === "manual") setOauthWait({ phase: "waiting", message: "服务端还没有新连接。请确认已在授权窗口完成登录；本页会继续自动检查。" });
    } catch {
      // A transient catalog read is not proof that authorization failed; keep
      // polling. The deadline and popup-close reconciliation still bound it.
      if (trigger === "notification-error" && runtime.active) finishOAuthError(runtime, runtime.errorMessage || "OAuth 授权未完成，请重新发起。");
    } finally {
      runtime.checking = false;
      if (runtime.active) scheduleOAuthPoll(runtime);
    }
  }

  async function reconcileClosedOAuth(runtime: OAuthRuntime) {
    // The window can close after the provider already redirected but before the
    // native notification is delivered. Give the callback a short grace period
    // and re-read the authoritative server catalog before saying "cancelled".
    // Token exchange plus the server's tool discovery can take several
    // seconds. Re-read the catalog for long enough that a callback already in
    // flight is not misreported as cancelled, while the user still gets a
    // bounded result if the window was really closed.
    await wait(1200);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!runtime.active) return;
      try {
        const connection = await serverConnectionFor(runtime);
        if (!runtime.active) return;
        if (connection) {
          await confirmOAuthConnection(runtime, connection);
          return;
        }
      } catch { /* keep trying within the grace period */ }
      if (attempt < 3) await wait(2000);
    }
    if (runtime.active) finishOAuthCancelled(runtime);
  }

  function beginOAuthWait(runtime: OAuthRuntime) {
    runtime.unsubscribe = subscribeMcpOAuthResult(runtime.flowId, notification => {
      if (!runtime.active) return;
      if (notification.status === "error") {
        runtime.errorMessage = notification.message || "OAuth 授权未完成，请重新发起。";
        void checkOAuthConnection(runtime, "notification-error");
      } else {
        void checkOAuthConnection(runtime, "notification");
      }
    });
    runtime.focus = () => { if (runtime.active) void checkOAuthConnection(runtime, "focus"); };
    runtime.visibility = () => {
      if (runtime.active && typeof document !== "undefined" && document.visibilityState === "visible") void checkOAuthConnection(runtime, "focus");
    };
    window.addEventListener("focus", runtime.focus);
    document.addEventListener("visibilitychange", runtime.visibility);
    // A provider with COOP (for example an authentication gateway) disowns the
    // WindowProxy: `popup.closed` reads true while the window is still open and
    // the user is still signing in. Probe shortly after navigation and only
    // trust close detection when COOP did not sever the reference. Otherwise
    // polling, the focus check and the flow deadline remain the authority.
    runtime.probeTimer = window.setTimeout(() => {
      runtime.probeTimer = null;
      if (!runtime.active) return;
      const closeReliable = !runtime.popup?.closed;
      if (!closeReliable) {
        // COOP disowned the proxy, or the window closed very early. Polling is
        // the only reliable signal; never declare cancellation from `closed`.
        if (runtime.popup?.closed) void checkOAuthConnection(runtime, "focus");
        return;
      }
      runtime.closedTimer = window.setInterval(() => {
        if (!runtime.active) return;
        if (!runtime.popup?.closed) return;
        if (runtime.closedTimer !== null) { window.clearInterval(runtime.closedTimer); runtime.closedTimer = null; }
        setOauthWait({ phase: "verifying", message: "授权窗口已关闭，正在向服务端核对是否已完成授权…" });
        void reconcileClosedOAuth(runtime);
      }, 700);
    }, 1500);
    runtime.deadlineTimer = window.setTimeout(() => {
      if (runtime.active) finishOAuthError(runtime, "OAuth 授权超时。请重新发起授权，或改用 API Key。");
    }, 10 * 60 * 1000);
    scheduleOAuthPoll(runtime);
  }

  function cancelOAuthWait() {
    const runtime = oauthRef.current;
    // The blank window is still ours and can be closed. Once the provider page
    // has loaded, browsers with opener isolation refuse a script close; the
    // user may then close that window manually.
    if (runtime) stopOAuthRuntime(runtime, { closePopup: true });
    setOauthWait(null); setBusy(false); setPopupBlocked(false);
    setError(""); setNotice("已停止等待授权。本页可以重新发起授权；如果服务方授权窗口仍然开着，可以手动关闭。若服务方已经完成授权，连接可能稍后出现在“已连接”中。");
  }

  function checkOAuthNow() {
    const runtime = oauthRef.current;
    if (!runtime || runtime.checking) return;
    setOauthWait(current => current ? { ...current, phase: "verifying", message: "正在向服务端读取连接…" } : current);
    void checkOAuthConnection(runtime, "manual");
  }

  function closeDialog() {
    const runtime = oauthRef.current;
    if (runtime) stopOAuthRuntime(runtime, { closePopup: true });
    onClose();
  }

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

  async function loadScopes() {
    setError(""); setScopeLoading(true);
    try {
      const result = await workflowApiV2.discoverMcpOAuth({ url: url.trim() });
      setScopeInfo(result);
      setSelectedScopes(current => current.size ? current : new Set());
      if (!result.scopes.length) setNotice("服务未声明授权范围，将不申请额外范围。");
    } catch (reason) { setError(workflowErrorMessage(reason)); }
    finally { setScopeLoading(false); }
  }

  async function ensureOAuthScopes(): Promise<McpOAuthDiscovery> {
    if (scopeInfo) return scopeInfo;
    setScopeLoading(true);
    try {
      const available = await workflowApiV2.discoverMcpOAuth({ url: url.trim() });
      setScopeInfo(available);
      return available;
    } finally { setScopeLoading(false); }
  }

  async function requestOAuthAuthorization(targetRef: string, version: number, flowId: string) {
    if (loginFlow) {
      if (!presetScopes.length) throw new Error("此推荐服务未配置授权范围，请改用“配置”连接。");
      return workflowApiV2.startMcpOAuth({
        environmentRef, ref: targetRef, version, name: name.trim(), url: url.trim(), transport,
        ...(sourceId ? { sourceId } : {}), ...(serverTitle ? { serverTitle } : {}),
        returnTo: withMcpOAuthReturnTo(returnTo, flowId, true),
        scopes: presetScopes,
      });
    }
    const available = await ensureOAuthScopes();
    if (available.scopes.length && !selectedScopes.size) {
      throw new Error(`请先选择本次连接需要的授权范围：${available.scopes.join("、")}`);
    }
    return workflowApiV2.startMcpOAuth({
      environmentRef, ref: targetRef, version, name: name.trim(), url: url.trim(), transport,
      ...(sourceId ? { sourceId } : {}), ...(serverTitle ? { serverTitle } : {}),
      returnTo: withMcpOAuthReturnTo(returnTo, flowId, true),
      ...(available.scopes.length ? { scopes: [...selectedScopes] } : {}),
      ...(available.resourceMetadataUrl ? { resourceMetadataUrl: available.resourceMetadataUrl } : {}),
    });
  }

  async function startOAuthInNewWindow(finalRef: string, version: number) {
    if (oauthRef.current) return;
    if (scopeInfo?.scopes.length && !selectedScopes.size) {
      setError(`请先选择本次连接需要的授权范围：${scopeInfo.scopes.join("、")}`);
      return;
    }
    const popup = openMcpOAuthWindow();
    if (!popup) {
      setPopupBlocked(true);
      setError("浏览器拦截了授权窗口。请允许此站点打开弹出窗口后重试；未保存任何新连接。");
      return;
    }
    const flowId = createMcpOAuthFlowId();
    const runtime: OAuthRuntime = {
      active: true, flowId, ref: finalRef, version, popup,
      pollTimer: null, deadlineTimer: null, closedTimer: null, probeTimer: null,
      unsubscribe: null, focus: null, visibility: null,
      checking: false, confirmingVersion: 0, confirmedVersion: 0,
      errorMessage: "", delay: 1800,
    };
    oauthRef.current = runtime;
    setPopupBlocked(false); setError(""); setNotice("");
    setOauthWait({ phase: "opening", message: "正在读取授权配置并准备服务方登录页…" });
    setBusy(true);
    try {
      const result = await requestOAuthAuthorization(finalRef, version, flowId);
      if (oauthRef.current !== runtime || !runtime.active) return;
      if (!navigateMcpOAuthWindow(popup, result.authorizationUrl)) throw new Error("授权窗口已关闭，请重新发起授权。");
      setOauthWait({ phase: "waiting", message: "授权窗口已打开。请在新窗口/标签页完成服务方登录；本页会从服务端自动确认连接，不会跳转。" });
      setBusy(false);
      beginOAuthWait(runtime);
    } catch (reason) {
      if (oauthRef.current === runtime) {
        failMcpOAuthWindow(popup, "授权窗口未能启动，请回到 EduFlow 重试。");
        stopOAuthRuntime(runtime, { closePopup: true });
        setOauthWait(null); setBusy(false); setPopupBlocked(false);
        setError(workflowErrorMessage(reason));
      }
    }
  }

  async function save() {
    setError(""); setNotice("");
    if (!name.trim()) { setError("请填写名称。"); return; }
    const finalRef = ref.trim() || generateRef(name);
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(finalRef)) { setError("连接标识需以字母开头，只能使用字母、数字、下划线、点和短横线。"); return; }
    if (!ref.trim()) setRef(finalRef);
    if (!/^https?:\/\//i.test(url.trim())) { setError("服务地址需以 http:// 或 https:// 开头。"); return; }
    if ((authType === "bearer" || authType === "api-key" || authType === "legacy") && !credential && !canReuseCredential) { setError("请填写凭据。"); return; }
    if (oauthStart) {
      const version = latestVersion(connections, finalRef) + 1;
      await startOAuthInNewWindow(finalRef, version);
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

  const waiting = Boolean(oauthWait);
  const footerHint = waiting
    ? oauthWait!.phase === "opening"
      ? "正在准备服务方授权页…"
      : oauthWait!.phase === "verifying"
        ? "正在从服务端确认授权与连接状态…"
        : "授权窗口已打开；完成后本页会自动确认。"
    : oauthStart && popupBlocked
      ? "授权窗口被浏览器拦截。允许弹窗后重试。"
      : loginFlow
        ? "将在服务方新窗口完成登录；工具权限不会自动授予"
        : oauthStart
          ? "将在新窗口/标签页完成授权；工具权限不会自动授予"
          : `${selectedCount} 个工具将允许在工作流中使用`;

  return <McpModal
    title={title}
    subtitle={subtitle}
    onClose={closeDialog}
    wide
    footer={<>
      <span className="wf-mcp-modal-hint">{footerHint}</span>
      <div className="wf-resource-actions">
        {waiting ? <>
          <button type="button" onClick={cancelOAuthWait}>取消授权</button>
          <button type="button" className="primary" disabled={oauthWait!.phase !== "waiting"} onClick={checkOAuthNow}>{oauthWait!.phase === "verifying" ? "正在确认…" : "我已完成，检查连接"}</button>
        </> : <>
          <button type="button" onClick={closeDialog} disabled={busy}>取消</button>
          <button type="button" className="primary" onClick={() => void save()} disabled={busy || scopeLoading}>{scopeLoading ? "读取范围…" : busy ? (oauthStart ? "正在打开登录窗口…" : "正在保存…") : oauthStart ? (popupBlocked ? (loginFlow ? "重试登录窗口" : "重试授权窗口") : (loginFlow ? "登录并授权" : "前往授权")) : "保存连接"}</button>
        </>}
      </div>
    </>}
  >
    {error ? <p className="wf-resource-feedback is-error" role="alert">{error}</p> : null}
    {notice ? <p className="wf-resource-feedback" role="status">{notice}</p> : null}
    {waiting ? <>
      <div className="wf-mcp-oauth-note" role="status">
        <strong>{oauthWait!.phase === "opening" ? "正在打开授权窗口" : oauthWait!.phase === "verifying" ? "正在确认授权结果" : "等待服务方授权"}</strong>
        <p>{oauthWait!.message}</p>
        <p>原 EduFlow 页面会保持打开，并从服务端重新读取真实连接；不会仅凭窗口消息判定已连接。工具权限仍需由你明确勾选。</p>
      </div>
      <p className="wf-field-note">如果授权窗口被关闭，本页仍会继续向服务端核对已完成的授权；未完成时可点“取消授权”后重试。</p>
    </> : loginFlow ? <>
      <div className="wf-mcp-oauth-note" role="status">
        <strong>服务方登录</strong>
        <p>点击“登录并授权”会在新窗口打开 {server!.name} 的登录页。EduFlow 不接收或保存你的账号密码，也不在此页填写连接配置。</p>
        <p>授权范围：{presetScopes.length ? presetScopes.join("、") : "由服务方声明"}。工具权限仍需在连接后明确勾选。</p>
      </div>
      <dl className="wf-mcp-detail-list">
        <dt>服务地址</dt><dd><code>{url}</code></dd>
        <dt>鉴权方式</dt><dd>OAuth</dd>
      </dl>
      {server?.websiteUrl ? <p><a href={server.websiteUrl} target="_blank" rel="noreferrer">服务说明 <ExternalLink size={12} aria-hidden /></a></p> : null}
      <p className="wf-field-note">登录成功后本页会从服务端确认连接并切到“已连接”；不会自动允许任何工具。若服务方未完成授权，可关闭窗口后重试。</p>
    </> : <>
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
        <p>{existing && !reauth ? "已有授权令牌由服务端安全保管。需要重新登录服务方时，勾选“重新授权”。" : "点击“前往授权”会打开新的窗口或标签页；在服务方完成登录后，本页会从服务端确认连接。原页不会跳走，也不会自动允许任何工具。"}</p>
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
        {oauthBlocked ? <p className="wf-field-note">OAuth 授权完成后会保存连接，但不会自动允许工具；本页会自动切到“已连接”并定位该连接，请在那里明确勾选。</p> : null}
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
    </>}
  </McpModal>;
}
