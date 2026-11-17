import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, CircleAlert, ExternalLink, LoaderCircle, Plus, RefreshCw, Search, Server, ShieldCheck, Wrench, X } from "lucide-react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { ConnectionTestResult, JsonValue, McpMarketItem, McpMarketPage, ResourceReferenceRow, WorkflowTool } from "../domain/v2/types";
import type { Extensions } from "../editor/v2/FunctionExecutionFields";
import { latestVersion, type CatalogConnection } from "./resourceModel";
import { ResourceReferences } from "./ResourceReferences";
import { ResourceDeleteDialog } from "./ResourceDeleteDialog";
import { ResourceTestPanel } from "./ResourceTestPanel";
import type { ResourceSectionProps } from "./resourceTypes";
import {
  dedupeMcpMarketItems, latestMcpConnections, mcpAuthHintLabel, mcpAuthTypeOf, mcpCategoryGroups, mcpConnectionAuth, mcpConnectionErrorMessage,
  mcpConnectionFor, mcpAllowedToolNames, mcpConnectionStatus, mcpConnectionTitle, mcpQuickConnectDraft, mcpRecommendationAction, mcpSourceLabel,
  mcpSyncLabel, mcpToolCountLabels, mcpToolMatchesQuery, mcpToolState, mcpTransportLabel, normalizeMcpUrl, resolveRecommendedMcpServers,
  type McpTab, type McpToolState,
} from "./mcpMarketModel";
import { McpConnectDialog } from "./McpConnectDialog";
import { McpModal } from "./McpModal";

type Feedback = { ok: boolean; text: string } | null;
type TestView = { key: string; result: ConnectionTestResult };
type ReferenceView = { key: string; loading: boolean; error: string; rows: ResourceReferenceRow[] };
type DialogState =
  | { kind: "connect"; server?: McpMarketItem; entry?: CatalogConnection; loginOnly?: boolean }
  | { kind: "details"; server: McpMarketItem }
  | { kind: "admin" }
  | { kind: "disable"; entry: CatalogConnection }
  | { kind: "delete"; entry: CatalogConnection }
  | { kind: "tools"; entry: CatalogConnection };

export type McpResourceProps = Pick<ResourceSectionProps, "environmentRef" | "create" | "onCreated" | "onResourcesChanged" | "onOpenReference"> & {
  connections: Extensions["connections"];
  tools?: readonly WorkflowTool[];
  initialTab?: McpTab;
  focusRef?: string;
  notice?: string;
  discovery?: Record<string, readonly string[]>;
};

function MarketCard({ item, connection, state, recommended = false, actionLabel, busy = false, onDetails, onConnect }: {
  item: McpMarketItem; connection?: CatalogConnection; state?: McpToolState; recommended?: boolean; actionLabel?: string; busy?: boolean;
  onDetails: () => void; onConnect: () => void;
}) {
  return <article className="wf-mcp-card" data-mcp-server={item.id} data-mcp-url={item.url}>
    <div className="wf-mcp-card-head">
      <span className="wf-mcp-icon" aria-hidden="true">{(item.title || item.name).slice(0, 2).toUpperCase()}</span>
      <div className="wf-mcp-card-title"><strong>{item.title}</strong><small>{item.name}</small></div>
      {connection ? <span className={`wf-mcp-badge ${connection.disabled ? "is-warn" : "is-ok"}`}><Check size={11} aria-hidden /> {connection.disabled ? "已断开" : "已连接"}</span> : null}
    </div>
    <p className="wf-mcp-card-description">{item.description || "此服务暂未提供说明。"}</p>
    <div className="wf-mcp-card-meta">
      {recommended ? <span className="wf-mcp-badge is-ok">推荐</span> : null}
      <span className="wf-mcp-badge">{mcpSourceLabel(item.source)}</span>
      <span className="wf-mcp-badge">{item.categoryLabel}</span>
      <span className="wf-mcp-badge">{mcpAuthHintLabel(item.authHint)}</span>
      <span className="wf-mcp-badge">{mcpTransportLabel(item.transport)}</span>
    </div>
    <div className="wf-mcp-card-actions">
      <button type="button" onClick={onDetails}>详情</button>
      <button type="button" className="primary" disabled={busy} onClick={onConnect}>{busy ? "连接中…" : actionLabel ?? (connection ? "配置" : "连接")}</button>
    </div>
    {connection ? <p className={`wf-mcp-card-connected${connection.disabled ? " is-disabled" : ""}`}>{mcpConnectionAuth(connection)} · {connection.disabled ? (() => { const labels = mcpToolCountLabels(state ?? { allowed: 0, discovered: null, usable: 0, known: false }, { disabled: true }); return `已断开 · ${labels.allowed} · ${labels.discovered} · ${labels.usable}`; })() : state ? `${mcpToolCountLabels(state).allowed} · ${mcpToolCountLabels(state).discovered} · ${mcpToolCountLabels(state).usable}` : "工具状态待读取"}</p> : null}
  </article>;
}

export function McpResource({ environmentRef, create = false, onCreated, onResourcesChanged, onOpenReference, connections, tools = [], initialTab = "market", focusRef = "", notice = "", discovery = {} }: McpResourceProps) {
  const [tab, setTab] = useState<McpTab>(initialTab);
  const [market, setMarket] = useState<McpMarketPage | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState("");
  const [search, setSearch] = useState("");
  const [connectedSearch, setConnectedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [marketGeneration, setMarketGeneration] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(create ? { kind: "connect" } : null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busyKey, setBusyKey] = useState("");
  const [tests, setTests] = useState<Record<string, ConnectionTestResult>>({});
  const [localDiscovered, setLocalDiscovered] = useState<Record<string, string[]>>({});
  const [localTools, setLocalTools] = useState<WorkflowTool[]>([]);
  const [references, setReferences] = useState<ReferenceView | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [focusedRef, setFocusedRef] = useState(focusRef);
  const quickConnectRef = useRef(false);

  useEffect(() => {
    if (focusRef) setFocusedRef(focusRef);
  }, [focusRef]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setMarketLoading(true); setMarketError("");
      workflowApiV2.mcpMarket({ q: search.trim() || undefined, category: category || undefined, page: 1, limit: 120 })
        .then(result => { if (active) setMarket(result); })
        .catch(reason => { if (active) setMarketError(workflowErrorMessage(reason)); })
        .finally(() => { if (active) setMarketLoading(false); });
    }, search.trim() ? 260 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, category, marketGeneration]);

  useEffect(() => {
    setNoticeDismissed(false);
  }, [notice]);

  const connected = useMemo(() => latestMcpConnections(connections), [connections]);
  const mcpTools = useMemo(() => {
    const latest = new Map(connected.map(entry => [entry.ref, entry.version]));
    return tools.filter(tool => {
      if (!tool.connectionRef) return false;
      const version = latest.get(tool.connectionRef);
      if (version === undefined) return false;
      const connector = tool.connectorRef ?? "";
      return !connector || connector.endsWith(`:${version}`);
    });
  }, [connected, tools]);
  const toolPool = useMemo(() => {
    const byRef = new Map(mcpTools.map(tool => [tool.ref, tool]));
    for (const tool of localTools) byRef.set(tool.ref, tool);
    return [...byRef.values()];
  }, [mcpTools, localTools]);
  const filteredConnected = useMemo(() => {
    const query = connectedSearch.trim().toLocaleLowerCase();
    return connected.filter(entry => !query || `${mcpConnectionTitle(entry)} ${entry.ref} ${String(entry.content.url ?? "")}`.toLocaleLowerCase().includes(query));
  }, [connected, connectedSearch]);
  const items = useMemo(() => dedupeMcpMarketItems(market?.items ?? []), [market?.items]);
  const recommendedItems = useMemo(() => resolveRecommendedMcpServers(items, market?.recommendedIds ?? []), [items, market?.recommendedIds]);
  const recommendedIdentity = useMemo(() => ({
    ids: new Set(recommendedItems.map(item => item.id)),
    urls: new Set(recommendedItems.map(item => normalizeMcpUrl(item.url))),
  }), [recommendedItems]);
  const groups = useMemo(() => {
    const recommended = items.filter(item => recommendedIdentity.ids.has(item.id) || recommendedIdentity.urls.has(normalizeMcpUrl(item.url)));
    const ordinary = items.filter(item => !recommendedIdentity.ids.has(item.id) && !recommendedIdentity.urls.has(normalizeMcpUrl(item.url)));
    return mcpCategoryGroups([...recommended, ...ordinary]);
  }, [items, recommendedIdentity]);
  const toolGroups = useMemo(() => {
    const latest = new Map(connected.map(entry => [entry.ref, entry]));
    const groups = new Map<string, { entry: CatalogConnection; tools: WorkflowTool[] }>();
    for (const entry of connected) groups.set(entry.ref, { entry, tools: [] });
    for (const tool of mcpTools) {
      if (!tool.connectionRef || !latest.has(tool.connectionRef)) continue;
      const group = groups.get(tool.connectionRef);
      if (group) group.tools.push(tool);
    }
    return [...groups.values()].filter(group => !connectedSearch.trim() || mcpConnectionTitle(group.entry).toLocaleLowerCase().includes(connectedSearch.trim().toLocaleLowerCase()) || group.tools.some(tool => mcpToolMatchesQuery(tool, connectedSearch)));
  }, [connected, mcpTools, connectedSearch]);

  useEffect(() => {
    if (tab !== "connected" || !focusedRef) return;
    const card = [...document.querySelectorAll<HTMLElement>("[data-mcp-connection]")]
      .find(node => node.dataset.mcpConnection === focusedRef);
    card?.scrollIntoView({ block: "nearest" });
  }, [tab, focusedRef, connected.length]);

  function refreshAll() {
    setMarketGeneration(value => value + 1);
    onResourcesChanged?.();
  }
  function isRecommendedItem(item: McpMarketItem): boolean {
    return recommendedIdentity.ids.has(item.id) || recommendedIdentity.urls.has(normalizeMcpUrl(item.url));
  }
  function recommendationLabel(item: McpMarketItem, entry?: CatalogConnection): string {
    if (entry) return "配置";
    const action = mcpRecommendationAction(item);
    return action === "login" ? "登录授权" : action === "quick" ? "一键连接" : "连接";
  }
  function openConnect(item: McpMarketItem) {
    const entry = mcpConnectionFor(item, connections);
    if (entry) { setDialog({ kind: "connect", entry }); return; }
    const action = mcpRecommendationAction(item);
    if (action === "login") { setDialog({ kind: "connect", server: item, loginOnly: true }); return; }
    if (action === "quick") { setDialog(null); void quickConnect(item); return; }
    setDialog({ kind: "connect", server: item });
  }
  async function quickConnect(item: McpMarketItem) {
    if (busyKey || quickConnectRef.current) return;
    const entry = mcpConnectionFor(item, connections);
    if (entry) { setDialog({ kind: "connect", entry }); return; }
    let draft: ReturnType<typeof mcpQuickConnectDraft>;
    try {
      draft = mcpQuickConnectDraft(item, connections);
    } catch (reason) {
      setFeedback({ ok: false, text: reason instanceof Error ? reason.message : workflowErrorMessage(reason) });
      return;
    }
    quickConnectRef.current = true;
    setBusyKey(`quick:${item.id}`);
    setFeedback(null);
    try {
      // Publishing a guest connection is the user's explicit connect action.
      // It deliberately grants no tools: allowedToolNames stays empty until
      // the owner reviews and selects them in the existing tool scope editor.
      await workflowApiV2.extension(environmentRef, {
        action: "publish", kind: "connection", ref: draft.ref, version: draft.version, content: draft.content,
      });
      setTab("connected"); setFocusedRef(draft.ref); setConnectedSearch("");
      setFeedback({ ok: true, text: `已连接「${item.title}」v${draft.version}，未自动授予任何工具。请在“已连接”中点“配置”明确勾选允许使用的工具。` });
      refreshAll();
      void workflowApiV2.testExtension(environmentRef, { ref: draft.ref, version: draft.version }).then(result => {
        setTests(current => ({ ...current, [`${draft.ref}@${draft.version}`]: result }));
        if (result.ok) {
          const names = result.discoveredToolNames ?? result.tools?.map(tool => tool.name) ?? [];
          setLocalDiscovered(current => ({ ...current, [draft.ref]: names }));
        }
      }).catch(() => undefined);
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally {
      quickConnectRef.current = false;
      setBusyKey("");
    }
  }
  function discoveredNamesFor(entry: CatalogConnection): string[] | undefined {
    const persisted = discovery[entry.ref];
    if (persisted !== undefined) return [...persisted];
    const local = localDiscovered[entry.ref];
    if (local !== undefined) return local;
    const result = tests[`${entry.ref}@${entry.version}`];
    if (result?.ok) return result.discoveredToolNames ?? result.tools?.map(tool => tool.name);
    return undefined;
  }
  function toolStateFor(entry: CatalogConnection): McpToolState {
    return mcpToolState(entry, toolPool, discoveredNamesFor(entry));
  }
  const toolTotals = useMemo(() => {
    const states = connected.map(entry => toolStateFor(entry));
    return {
      allowed: states.reduce((total, state) => total + state.allowed, 0),
      discovered: states.every(state => state.discovered !== null) ? states.reduce((total, state) => total + (state.discovered ?? 0), 0) : null,
      usable: states.reduce((total, state) => total + (state.usable ?? 0), 0),
      hasDisabled: connected.some(entry => entry.disabled),
    };
  }, [connected, toolPool, tests]);
  async function loadMore() {
    if (!market?.hasMore || loadingMore) return;
    setLoadingMore(true); setMarketError("");
    try {
      const next = await workflowApiV2.mcpMarket({ q: search.trim() || undefined, category: category || undefined, page: market.page + 1, limit: market.limit });
      setMarket(current => current ? { ...next, items: [...current.items, ...next.items.filter(item => !current.items.some(existing => existing.id === item.id))] } : next);
    } catch (reason) { setMarketError(workflowErrorMessage(reason)); }
    finally { setLoadingMore(false); }
  }
  async function syncMarket() {
    setBusyKey("market-sync"); setMarketError("");
    try { await workflowApiV2.syncMcpMarket(6); setMarketGeneration(value => value + 1); }
    catch (reason) { setMarketError(workflowErrorMessage(reason)); }
    finally { setBusyKey(""); }
  }
  async function testConnection(entry: CatalogConnection) {
    const key = `${entry.ref}@${entry.version}`;
    setBusyKey(`test:${key}`); setFeedback(null);
    try {
      // Discovery is a full tools/list refresh. The server persists the complete
      // non-sensitive result and returns only the allowed subset for execution.
      const result = await workflowApiV2.discover(environmentRef, entry.connectionKey);
      const names = result.discoveredToolNames ?? result.items.map(tool => tool.name);
      setLocalDiscovered(current => ({ ...current, [entry.ref]: names }));
      const discoveredTools = result.items.filter(tool => tool.connectorRef === entry.connectionKey || tool.connectionRef === entry.ref);
      setLocalTools(current => [...current.filter(tool => tool.connectorRef !== entry.connectionKey && tool.connectionRef !== entry.ref), ...discoveredTools]);
      setTests(current => ({ ...current, [key]: { ok: true, tools: discoveredTools } }));
      setFeedback({ ok: true, text: `「${mcpConnectionTitle(entry)}」工具已刷新：服务端返回 ${names.length} 个工具，当前允许 ${mcpAllowedToolNames(entry).length} 个。` });
      onResourcesChanged?.();
    } catch (reason) { setFeedback({ ok: false, text: workflowErrorMessage(reason) }); }
    finally { setBusyKey(""); }
  }
  async function confirmDisable(entry: CatalogConnection) {
    setBusyKey(`disable:${entry.ref}@${entry.version}`); setFeedback(null);
    try {
      await workflowApiV2.extension(environmentRef, { action: "disable", kind: "connection", ref: entry.ref, version: entry.version });
      setDialog(null); setFeedback({ ok: true, text: `已断开「${mcpConnectionTitle(entry)}」并撤销全部历史版本；旧工作流调用会在服务端被拒绝。` }); refreshAll();
    } catch (reason) { setFeedback({ ok: false, text: workflowErrorMessage(reason) }); }
    finally { setBusyKey(""); }
  }
  async function toggleReferences(entry: CatalogConnection) {
    if (references?.key === entry.ref) { setReferences(null); return; }
    setReferences({ key: entry.ref, loading: true, error: "", rows: [] });
    try {
      const result = await workflowApiV2.extensionReferences(entry.ref, environmentRef);
      setReferences({ key: entry.ref, loading: false, error: "", rows: result.items });
    } catch (reason) {
      setReferences({ key: entry.ref, loading: false, error: workflowErrorMessage(reason), rows: [] });
    }
  }

  function renderMarketCard(item: McpMarketItem) {
    const entry = mcpConnectionFor(item, connections);
    return <MarketCard key={item.id} item={item} connection={entry}
      state={entry ? toolStateFor(entry) : undefined} recommended={isRecommendedItem(item)}
      actionLabel={recommendationLabel(item, entry)} busy={busyKey === `quick:${item.id}`}
      onDetails={() => setDialog({ kind: "details", server: item })}
      onConnect={() => openConnect(item)} />;
  }

  const visibleNotice = notice && !noticeDismissed ? notice : "";
  const tabs: { id: McpTab; label: string; count?: number }[] = [
    { id: "market", label: "市场" },
    { id: "connected", label: "已连接", count: connected.length },
    { id: "tools", label: "工具", count: toolTotals.usable },
  ];
  return <section className="wf-mcp" aria-label="MCP 连接器">
    <div className="wf-mcp-topbar">
      <div className="wf-mcp-tabs" role="tablist" aria-label="MCP 视图">
        {tabs.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}{typeof item.count === "number" ? <small>{item.count}</small> : null}</button>)}
      </div>
      <button type="button" className="primary wf-mcp-add" onClick={() => setDialog({ kind: "connect" })}><Plus size={14} aria-hidden /> 添加连接</button>
    </div>
    {visibleNotice ? <div className="wf-mcp-notice" role="status"><span>{visibleNotice}</span><button type="button" aria-label="关闭提示" onClick={() => setNoticeDismissed(true)}><X size={13} aria-hidden /></button></div> : null}
    {feedback ? <p className={feedback.ok ? "wf-resource-feedback" : "wf-resource-feedback is-error"} role={feedback.ok ? "status" : "alert"}>{feedback.text}</p> : null}

    {tab === "market" ? <>
      <div className="wf-mcp-toolbar">
        <label className="wf-mcp-search"><Search size={14} aria-hidden /><input aria-label="搜索 MCP 市场" placeholder="搜索服务名称、说明或地址…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="wf-resource-actions">
          {market?.canAdmin ? <button type="button" onClick={() => setDialog({ kind: "admin" })}><ShieldCheck size={13} aria-hidden /> 补充目录</button> : null}
          <button type="button" disabled={Boolean(busyKey)} onClick={() => void syncMarket()}>{busyKey === "market-sync" ? <><LoaderCircle size={13} aria-hidden /> 同步中…</> : <><RefreshCw size={13} aria-hidden /> 更新目录</>}</button>
          {market?.sync.hasMore ? <button type="button" disabled={Boolean(busyKey)} onClick={() => void syncMarket()}>{busyKey === "market-sync" ? "同步中…" : "继续同步"}</button> : null}
        </div>
      </div>
      <div className="wf-mcp-category-row" aria-label="MCP 分类">
        <button type="button" aria-pressed={!category} onClick={() => setCategory("")}>全部</button>
        {(market?.categories ?? []).filter(item => item.count > 0 || item.key === category).map(item => <button key={item.key} type="button" aria-pressed={category === item.key} onClick={() => setCategory(item.key)}>{item.label}<small>{item.count}</small></button>)}
      </div>
      {market ? <p className={`wf-mcp-sync ${market.sync.status === "error" ? "is-error" : ""}`} role={market.sync.status === "error" ? "alert" : "status"}>{mcpSyncLabel(market.sync)} · 已加载 {items.length} / {market.total} 个匹配服务</p> : null}
      {marketError ? <div className="wf-mcp-error" role="alert"><CircleAlert size={15} aria-hidden /><span>{marketError}</span><button type="button" onClick={() => setMarketGeneration(value => value + 1)}>重试</button></div> : null}
      {marketLoading && !market ? <p className="wf-mcp-loading" role="status"><LoaderCircle size={15} aria-hidden /> 正在读取官方 Registry 目录…</p> : null}
      {!marketLoading && market && !items.length ? <div className="wf-mcp-empty"><Server size={24} aria-hidden /><h4>没有匹配的 MCP 服务</h4><p>{search || category ? "试试清除搜索或分类筛选。" : "官方 Registry 暂时没有可用的远程服务；稍后再更新目录。"}</p></div> : null}
      {search || category ? <section className="wf-mcp-section" aria-label="搜索结果"><header><div><h4>{category ? market?.categories.find(item => item.key === category)?.label ?? "筛选结果" : "搜索结果"}</h4><p>{items.length} 个服务</p></div></header><div className="wf-mcp-grid">{items.map(renderMarketCard)}</div></section> : null}
      {!search && !category ? groups.map(group => <section className="wf-mcp-section" key={group.key} aria-label={group.label}>
        <header><div><h4>{group.label}</h4><p>{group.items.length} 个服务</p></div><button type="button" className="wf-mcp-link" onClick={() => setCategory(group.key)}>查看全部 <ChevronRight size={13} aria-hidden /></button></header>
        <div className="wf-mcp-grid">{group.items.slice(0, 9).map(renderMarketCard)}</div>
      </section>) : null}
      {market?.hasMore ? <div className="wf-mcp-more"><button type="button" className="primary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "加载中…" : `加载更多（已加载 ${items.length} / ${market.total}）`}</button></div> : null}
      <div className="wf-mcp-custom"><button type="button" onClick={() => setDialog({ kind: "connect" })}>连接自定义远程 MCP 服务</button><span>只接受 HTTPS 远程地址；不会安装或运行本地服务。</span></div>
    </> : null}

    {tab === "connected" ? <section className="wf-mcp-connected" aria-label="已连接的 MCP 服务">
      <div className="wf-mcp-toolbar"><label className="wf-mcp-search"><Search size={14} aria-hidden /><input aria-label="搜索已连接服务" placeholder="搜索已连接服务…" value={connectedSearch} onChange={event => setConnectedSearch(event.target.value)} /></label><span className="wf-mcp-count">{filteredConnected.length} 个连接</span></div>
      {!filteredConnected.length ? <div className="wf-mcp-empty"><Server size={24} aria-hidden /><h4>还没有已连接的 MCP 服务</h4><p>从市场选择一个服务连接，或连接自定义远程地址。</p><button type="button" className="primary" onClick={() => setTab("market")}>去市场看看</button></div> : null}
      <div className="wf-mcp-connection-list">{filteredConnected.map(entry => {
        const key = `${entry.ref}@${entry.version}`;
        const state = toolStateFor(entry);
        const labels = mcpToolCountLabels(state, { disabled: entry.disabled });
        const status = mcpConnectionStatus(entry, state);
        const testResult = tests[key];
        const olderVersions = connections.filter(item => item.ref === entry.ref && item.version < entry.version).length;
        return <article className="wf-mcp-connection-card" key={key} data-mcp-connection={entry.ref} data-focused={focusedRef === entry.ref ? "true" : undefined}>
          <header>
            <span className={`wf-mcp-status is-${status.tone}`}>{status.label}</span>
            <div><strong>{mcpConnectionTitle(entry)}</strong><small>当前 v{entry.version} · {mcpTransportLabel(String(entry.content.transport ?? "streamable-http"))}</small></div>
          </header>
          <p className="wf-mcp-connection-url">{String(entry.content.url ?? "")}</p>
          <div className="wf-mcp-card-meta"><span className="wf-mcp-badge">{mcpConnectionAuth(entry)}</span><span className="wf-mcp-badge">{labels.allowed}</span><span className="wf-mcp-badge">{labels.discovered}</span><span className={`wf-mcp-badge${state.usable === 0 ? " is-warn" : ""}`}>{labels.usable}</span></div>
          {!entry.disabled && state.allowed > 0 && state.discovered === null ? <p className="wf-field-note is-warn" role="status">已保存 {state.allowed} 个允许工具，但本页尚未读取服务端工具列表。点“刷新工具”确认服务实际返回哪些工具；未知不会当作 0 个配置。</p> : null}
          {!entry.disabled && state.discovered !== null && state.allowed > 0 && state.usable === 0 ? <p className="wf-field-note is-warn" role="status">服务返回了工具，但已允许的工具都不在其中。请刷新工具并重新核对允许范围。</p> : null}
          {olderVersions ? <p className="wf-field-note">另有 {olderVersions} 个历史版本，仅用于旧工作流；它们的调用同样受当前允许范围约束。</p> : null}
          <div className="wf-mcp-card-actions">
            <button type="button" className={entry.disabled ? "primary" : undefined} onClick={() => setDialog({ kind: "connect", entry })}>{entry.disabled ? "重新连接" : "配置"}</button>
            {entry.disabled ? null : <>
              <button type="button" disabled={busyKey === `test:${key}`} onClick={() => void testConnection(entry)}>{busyKey === `test:${key}` ? "读取中…" : state.discovered === null ? "刷新工具" : "测试连接"}</button>
              <button type="button" onClick={() => setDialog({ kind: "tools", entry })}>工具范围</button>
            </>}
            <button type="button" aria-expanded={references?.key === entry.ref} onClick={() => void toggleReferences(entry)}>引用</button>
            {entry.disabled ? <button type="button" className="danger" onClick={() => setDialog({ kind: "delete", entry })}>永久删除</button> : <button type="button" className="danger" disabled={busyKey === `disable:${key}`} onClick={() => setDialog({ kind: "disable", entry })}>断开</button>}
          </div>
          {entry.disabled ? <p className="wf-field-note" role="status">此连接已断开且不可调用；允许配置仍保留 {state.allowed} 项，但实际可用为 0。点“重新连接”新建版本后会重新读取工具范围。</p> : null}
          {testResult && !entry.disabled ? <ResourceTestPanel result={testResult} toolsLabel="当前允许的工具" /> : null}
          {references?.key === entry.ref ? <div className="wf-resource-inline-references"><h4>引用位置</h4><ResourceReferences rows={references.rows} loading={references.loading} error={references.error} onOpen={onOpenReference} emptyText="暂无工作流引用此服务。" /></div> : null}
        </article>;
      })}</div>
    </section> : null}

    {tab === "tools" ? <section className="wf-mcp-tools" aria-label="MCP 工具">
      <div className="wf-mcp-toolbar"><label className="wf-mcp-search"><Search size={14} aria-hidden /><input aria-label="搜索 MCP 工具" placeholder="搜索工具名称或说明…" value={connectedSearch} onChange={event => setConnectedSearch(event.target.value)} /></label><span className="wf-mcp-count">已允许 {toolTotals.allowed} · {toolTotals.discovered === null ? (toolTotals.hasDisabled ? "发现记录不完整" : "发现待刷新") : `已发现 ${toolTotals.discovered}`} · 可用 {toolTotals.usable}</span></div>
      {!connected.length ? <div className="wf-mcp-empty"><Wrench size={24} aria-hidden /><h4>还没有可用的 MCP 工具</h4><p>连接服务并完成一次测试后，工具会出现在这里；只有已允许的工具能进入工作流。</p></div> : null}
      <div className="wf-mcp-tool-groups">{toolGroups.map(group => {
        const state = toolStateFor(group.entry);
        const labels = mcpToolCountLabels(state, { disabled: group.entry.disabled });
        return <article className="wf-mcp-tool-group" key={group.entry.ref}>
          <header><div><strong>{mcpConnectionTitle(group.entry)}</strong><small>{mcpConnectionAuth(group.entry)} · {labels.allowed} · {labels.discovered} · {labels.usable} · v{group.entry.version}</small></div><div className="wf-resource-actions">{group.entry.disabled ? <><button type="button" className="danger" onClick={() => setDialog({ kind: "delete", entry: group.entry })}>永久删除</button><button type="button" className="primary" onClick={() => setDialog({ kind: "connect", entry: group.entry })}>重新连接</button></> : <><button type="button" disabled={busyKey === `test:${group.entry.ref}@${group.entry.version}`} onClick={() => void testConnection(group.entry)}>{busyKey === `test:${group.entry.ref}@${group.entry.version}` ? "读取中…" : "刷新工具"}</button><button type="button" className="primary" onClick={() => setDialog({ kind: "tools", entry: group.entry })}>管理范围</button></>}</div></header>
          {!group.entry.disabled && group.tools.length ? <ul>{group.tools.map(tool => <li key={tool.ref}><span><strong>{tool.name}</strong>{tool.description ? <small>{tool.description}</small> : null}</span><span className="wf-mcp-tool-meta">{tool.available === false ? "不可用" : [tool.declaredReadOnly ? "服务声明只读" : tool.declaredDestructive ? "服务声明可能写入" : "", typeof tool.inputSchema === "object" && tool.inputSchema ? `${Object.keys((tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {}).length} 个参数` : ""].filter(Boolean).join(" · ")}</span></li>)}</ul> : <p className={`wf-field-note${state.allowed ? " is-warn" : ""}`}>{group.entry.disabled ? "连接已断开，当前没有可调用工具。允许配置仍保留，实际可用为 0；重新连接后刷新工具范围。" : state.discovered === null ? "尚未读取服务端工具；已允许数量不会被当成发现数量。点“刷新工具”读取实际列表。" : "服务端本次没有返回可进入工作流的工具。已允许配置仍保留，可在“管理范围”中核对。"}</p>}
        </article>;
      })}</div>
      <p className="wf-field-note">工具列表来自服务端 tools/list；工作流节点只能选择当前明确允许的工具。收窄范围或断开连接后，服务端会拒绝旧工作流的调用并显示明确错误。</p>
    </section> : null}

    {dialog?.kind === "connect" ? <McpConnectDialog
      key={`${dialog.server?.id ?? dialog.entry?.ref ?? "custom"}:${dialog.entry?.version ?? "new"}:${dialog.loginOnly ? "login" : "config"}`}
      environmentRef={environmentRef}
      server={dialog.server}
      entry={dialog.entry}
      loginOnly={dialog.loginOnly}
      loginScopes={dialog.loginOnly ? dialog.server?.oauthScopes : undefined}
      connections={connections}
      returnTo={typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`}
      onClose={() => setDialog(null)}
      onSaved={(ref, version, content) => {
        setDialog(null); setTab("connected"); setFeedback({ ok: true, text: `已保存 MCP 连接「${ref}」。` }); refreshAll(); onCreated?.(ref, version, content);
        // Keep "discovered" distinct from "allowed" after the dialog closes.
        void workflowApiV2.testExtension(environmentRef, { ref, version }).then(result => {
          setTests(current => ({ ...current, [`${ref}@${version}`]: result }));
        }).catch(() => undefined);
      }}
      onOAuthConnected={(ref, version, _content, result) => {
        setDialog(null); setTab("connected"); setFocusedRef(ref); setConnectedSearch("");
        if (result.ok) {
          // testExtension returns every tool with an allowed flag; the card's
          // shared test panel is labelled as the allowed subset, so only keep
          // the discovery names here and let "刷新工具" load the allowed list.
          const names = result.discoveredToolNames ?? result.tools?.map(tool => tool.name) ?? [];
          setLocalDiscovered(current => ({ ...current, [ref]: names }));
        } else {
          setTests(current => ({ ...current, [`${ref}@${version}`]: result }));
        }
        setFeedback(result.ok
          ? { ok: true, text: `OAuth 授权已由服务端确认，连接「${ref}」v${version} 已保存，服务端返回 ${result.tools?.length ?? 0} 个工具。已切到“已连接”并定位该连接；请点“配置”明确勾选允许使用的工具。` }
          : { ok: false, text: `OAuth 授权已保存为「${ref}」v${version}，但连接测试未通过：${result.error?.message || mcpConnectionErrorMessage(result.error?.code)}。可在“已连接”中重试，工具权限尚未授予。` });
        refreshAll();
      }}
    /> : null}
    {dialog?.kind === "details" ? <MarketDetails item={dialog.server} connection={mcpConnectionFor(dialog.server, connections)} state={(() => { const entry = mcpConnectionFor(dialog.server, connections); return entry ? toolStateFor(entry) : undefined; })()} onClose={() => setDialog(null)} onConnect={() => openConnect(dialog.server)} /> : null}
    {dialog?.kind === "admin" && market ? <McpAdminDialog categories={market.categories} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setFeedback({ ok: true, text: "补充目录已保存。" }); refreshAll(); }} /> : null}
    {dialog?.kind === "delete" ? <ResourceDeleteDialog
      key={`delete:${dialog.entry.ref}:${dialog.entry.version}`}
      environmentRef={environmentRef}
      target={{ kind: "connection", ref: dialog.entry.ref, version: dialog.entry.version, name: mcpConnectionTitle(dialog.entry), noun: "MCP 连接", versions: connections.filter(item => item.ref === dialog.entry.ref).length, hasCredential: dialog.entry.hasCredential }}
      onClose={() => setDialog(null)}
      onDeleted={message => { setDialog(null); setFeedback({ ok: true, text: message }); refreshAll(); }}
      onOpenReference={row => { setDialog(null); onOpenReference?.(row); }}
    /> : null}
    {dialog?.kind === "disable" ? <McpModal title="断开 MCP 连接" subtitle={`${mcpConnectionTitle(dialog.entry)} · v${dialog.entry.version}`} onClose={() => setDialog(null)} footer={<div className="wf-resource-actions"><button type="button" onClick={() => setDialog(null)}>取消</button><button type="button" className="danger" disabled={Boolean(busyKey)} onClick={() => void confirmDisable(dialog.entry)}>{busyKey ? "正在断开…" : "断开连接"}</button></div>}><p>断开后，该连接的所有版本都会停止调用，凭据权限立即失效；已有历史结果不受影响。</p><p className="wf-field-note">需要恢复时请重新连接；旧工作流会明确提示连接已断开。</p></McpModal> : null}
    {dialog?.kind === "tools" ? <McpToolPolicyDialog environmentRef={environmentRef} entry={dialog.entry} connections={connections} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setFeedback({ ok: true, text: "工具允许范围已更新。" }); refreshAll(); }} /> : null}
  </section>;
}

function MarketDetails({ item, connection, state, onClose, onConnect }: { item: McpMarketItem; connection?: CatalogConnection; state?: McpToolState; onClose: () => void; onConnect: () => void }) {
  const action = mcpRecommendationAction(item);
  return <McpModal title={item.title} subtitle={item.name} onClose={onClose} wide footer={<div className="wf-resource-actions"><button type="button" onClick={onClose}>关闭</button><button type="button" className="primary" onClick={onConnect}>{connection ? "配置连接" : action === "login" ? "登录授权" : action === "quick" ? "一键连接" : "连接此服务"}</button></div>}>
    <div className="wf-mcp-detail-meta"><span className="wf-mcp-badge">{mcpSourceLabel(item.source, true)}</span><span className="wf-mcp-badge">{item.categoryLabel}</span><span className="wf-mcp-badge">{mcpTransportLabel(item.transport)}</span><span className="wf-mcp-badge">{mcpAuthHintLabel(item.authHint)}</span>{item.recommended ? <span className="wf-mcp-badge is-ok">推荐</span> : null}{item.featured && item.source !== "platform" ? <span className="wf-mcp-badge is-ok">管理员置顶</span> : null}</div>
    <p className="wf-mcp-detail-description">{item.description || "此服务暂未提供说明。"}</p>
    <dl className="wf-mcp-detail-list">
      <dt>远程地址</dt><dd><code>{item.url}</code></dd>
      <dt>版本</dt><dd>{item.version || "未标注"}</dd>
      {item.sourceId ? <><dt>来源标识</dt><dd>{item.sourceId}</dd></> : null}
      {item.websiteUrl ? <><dt>服务主页</dt><dd><a href={item.websiteUrl} target="_blank" rel="noreferrer">打开 <ExternalLink size={12} aria-hidden /></a></dd></> : null}
      {item.repositoryUrl ? <><dt>代码仓库</dt><dd><a href={item.repositoryUrl} target="_blank" rel="noreferrer">查看 <ExternalLink size={12} aria-hidden /></a></dd></> : null}
      {connection ? <><dt>当前连接</dt><dd>{mcpConnectionTitle(connection)} · {mcpConnectionAuth(connection)} · {state ? `${mcpToolCountLabels(state, { disabled: connection.disabled }).allowed} · ${mcpToolCountLabels(state, { disabled: connection.disabled }).discovered} · ${mcpToolCountLabels(state, { disabled: connection.disabled }).usable}` : "工具状态待读取"}</dd></> : null}
    </dl>
    {item.headerHints.length ? <section><h4>服务声明的请求头</h4><ul className="wf-mcp-header-hints">{item.headerHints.map(header => <li key={header.name}><code>{header.name}</code>{header.isSecret ? <span className="wf-mcp-badge">需要密钥</span> : null}{header.description ? <small>{header.description}</small> : null}</li>)}</ul></section> : null}
    <p className="wf-field-note">连接时会先读取服务真实返回的工具，再让你选择允许范围。只有远程 MCP 服务会被展示；本地包和本地命令不会安装或运行。</p>
  </McpModal>;
}

function McpAdminDialog({ categories, onClose, onSaved }: { categories: { key: string; label: string }[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categories[0]?.key ?? "other");
  const [authHint, setAuthHint] = useState("unknown");
  const [featured, setFeatured] = useState(false);
  const [connectMode, setConnectMode] = useState<"config" | "quick" | "login">("config");
  const [oauthScopes, setOauthScopes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function toggleFeatured(value: boolean) {
    setFeatured(value);
    if (!value) setConnectMode("config");
  }
  function chooseMode(value: "config" | "quick" | "login") {
    setConnectMode(value);
    if (value === "quick") setAuthHint("none");
    if (value === "login") setAuthHint("oauth");
  }
  async function save() {
    const scopes = [...new Set(oauthScopes.split(/[\s,]+/).filter(Boolean))];
    if (connectMode === "quick" && authHint !== "none") { setError("免配置直连需要选择“无需鉴权”。"); return; }
    if (connectMode === "login" && authHint !== "oauth") { setError("服务方登录需要选择 OAuth 鉴权。"); return; }
    if (connectMode === "login" && !scopes.length) { setError("服务方登录需要至少一个已核验的授权范围。"); return; }
    setBusy(true); setError("");
    try {
      await workflowApiV2.supplementMcpMarket({
        title: title.trim(), name: title.trim(), url: url.trim(), description: description.trim(), category, authHint,
        ...(websiteUrl.trim() ? { websiteUrl: websiteUrl.trim() } : {}),
        featured, connectMode: featured ? connectMode : "config",
        oauthScopes: featured && connectMode === "login" ? scopes : [], transport: "streamable-http",
      });
      onSaved();
    } catch (reason) { setError(workflowErrorMessage(reason)); }
    finally { setBusy(false); }
  }
  return <McpModal title="补充 MCP 目录" subtitle="仅管理员可用；推荐位与连接方式保存在数据库，不写入代码仓库或种子数据" onClose={onClose} footer={<div className="wf-resource-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存补充项"}</button></div>}>
    {error ? <p className="wf-resource-feedback is-error" role="alert">{error}</p> : null}
    <label>名称<input value={title} onChange={event => setTitle(event.target.value)} placeholder="例如 内部知识库 MCP" /></label>
    <label>远程地址<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/mcp" /></label>
    <label>服务主页（可选）<input value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://example.com" /></label>
    <label>说明<textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} placeholder="只写真实有文档或 Registry 证据的能力说明" /></label>
    <div className="wf-mcp-form-grid"><label>分类<select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>鉴权提示<select aria-label="鉴权提示" value={authHint} onChange={event => setAuthHint(event.target.value)}><option value="unknown">待确认</option><option value="none">无需鉴权</option><option value="oauth">OAuth</option><option value="bearer">Bearer</option><option value="api-key">API Key</option></select></label></div>
    <label className="wf-resource-checkbox"><input type="checkbox" checked={featured} onChange={event => toggleFeatured(event.target.checked)} />放入目录推荐/置顶位（不代表官方质量认证）</label>
    {featured ? <div className="wf-mcp-form-grid">
      <label>推荐连接方式<select aria-label="推荐连接方式" value={connectMode} onChange={event => chooseMode(event.target.value as "config" | "quick" | "login")}><option value="config">需要用户确认配置（默认）</option><option value="quick">免配置直连（仅无需鉴权）</option><option value="login">服务方登录（仅 OAuth）</option></select></label>
      {connectMode === "login" ? <label>已核验授权范围<input aria-label="已核验授权范围" value={oauthScopes} onChange={event => setOauthScopes(event.target.value)} placeholder="例如 scope:read scope:write" /></label> : null}
    </div> : null}
    <p className="wf-field-note">默认需要用户确认连接配置；只有显式选择免配置直连或服务方登录时，推荐卡才跳过配置表单。任何连接都不会自动授予工具权限。保存前会校验 HTTPS、公网目标和推荐元数据一致性。</p>
  </McpModal>;
}

function McpToolPolicyDialog({ environmentRef, entry, connections, onClose, onSaved }: { environmentRef: string; entry: CatalogConnection; connections: readonly CatalogConnection[]; onClose: () => void; onSaved: () => void }) {
  const [tools, setTools] = useState<ConnectionTestResult["tools"] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(Array.isArray(entry.content.allowedToolNames) ? entry.content.allowedToolNames.filter((name): name is string => typeof name === "string") : []));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    workflowApiV2.testExtension(environmentRef, { ref: entry.ref, version: entry.version })
      .then(result => { if (!active) return; if (!result.ok) throw new Error(mcpConnectionErrorMessage(result.error?.code)); setTools(result.tools ?? []); })
      .catch(reason => { if (active) setError(workflowErrorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entry.ref, entry.version, environmentRef]);
  function toggle(name: string) {
    setSelected(current => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  }
  async function save() {
    setBusy(true); setError("");
    const version = latestVersion(connections, entry.ref) + 1;
    const authType = mcpAuthTypeOf(entry.content, entry.hasCredential);
    const content: Record<string, JsonValue> = { ...entry.content, authType, allowedToolNames: [...selected] };
    try {
      await workflowApiV2.extension(environmentRef, { action: "publish", kind: "connection", ref: entry.ref, version, content });
      await workflowApiV2.testExtension(environmentRef, { ref: entry.ref, version }).catch(() => undefined);
      onSaved();
    } catch (reason) { setError(workflowErrorMessage(reason)); }
    finally { setBusy(false); }
  }
  return <McpModal title="管理工具允许范围" subtitle={`${mcpConnectionTitle(entry)} · 更新当前允许范围`} onClose={onClose} wide footer={<div className="wf-resource-actions"><span className="wf-mcp-modal-hint">已允许 {selected.size} / {tools?.length ?? 0} 个工具</span><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" disabled={busy || loading} onClick={() => void save()}>{busy ? "保存中…" : "保存允许范围"}</button></div>}>
    {error ? <p className="wf-resource-feedback is-error" role="alert">{error}</p> : null}
    {loading ? <p className="wf-mcp-loading" role="status"><LoaderCircle size={15} aria-hidden /> 正在读取服务端工具…</p> : null}
    {tools?.length ? <ul className="wf-mcp-tool-checklist">{tools.map(tool => <li key={tool.name}><label className="wf-resource-checkbox"><input type="checkbox" checked={selected.has(tool.name)} onChange={() => toggle(tool.name)} /><span><strong>{tool.name}</strong>{tool.description ? <small>{tool.description}</small> : null}</span></label></li>)}</ul> : null}
    {!loading && tools && !tools.length ? <p className="wf-field-note">服务没有返回工具；连接仍保留，但工作流里暂时没有可选择的工具。</p> : null}
    <p className="wf-field-note">保存后，旧工作流绑定也会按当前允许范围执行；未允许的工具会在服务端被拒绝，不会伪造成功。</p>
  </McpModal>;
}
