import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Braces, MoreHorizontal, Pencil, Plus, Search, Server, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { ConnectionTestResult, JsonValue, ResourceReferenceRow, WorkflowConfiguration, WorkflowTool } from "../domain/v2/types";
import { useExtensions, type FunctionVersion } from "../editor/v2/FunctionExecutionFields";
import { latestConnectionsOfType, modelRefsOf, platformApiTools, resourceCounts, groupCatalogByRef, type CatalogConnection } from "./resourceModel";
import { ResourceTestPanel } from "./ResourceTestPanel";
import { ResourceReferences } from "./ResourceReferences";
import { McpResource } from "./McpResource";
import { apiDisplayUrl } from "./apiResourceModel";
import { providerModelSummary } from "./providerModel";
import { ResourceEditor, type ResourceEditorTarget } from "./ResourceEditor";
import { VariableTable } from "./VariableTable";
import { RESOURCE_SECTIONS, resourceSectionMeta, type ResourceCenterProps, type ResourceSection } from "./resourceTypes";
import "./resourceCenter.css";
import "./resourceEditor.css";

export type { ResourceCenterIntent, ResourceCenterProps, ResourceCreated, ResourceIntent, ResourceSection } from "./resourceTypes";

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';

type Feedback = { ok: boolean; text: string } | null;
type TestView = { key: string; result: ConnectionTestResult };
type MenuKey = string | null;
type ProviderDeleteState = {
  entry: CatalogConnection;
  loading: boolean;
  error: string;
  references: ResourceReferenceRow[];
  confirmed: boolean;
};

function sectionIcon(section: ResourceSection) {
  if (section === "providers") return <Sparkles size={17}/>;
  if (section === "apis") return <Server size={17}/>;
  if (section === "mcp") return <Server size={17}/>;
  if (section === "functions") return <Wrench size={17}/>;
  return <Braces size={17}/>;
}

function editorForSection(section: ResourceSection): ResourceEditorTarget | null {
  if (section === "providers") return { kind: "provider", mode: "create" };
  if (section === "apis") return { kind: "api", mode: "create" };
  if (section === "functions") return { kind: "function", mode: "create" };
  return null;
}

function functionName(entry: FunctionVersion): string {
  return String(entry.name ?? entry.ref);
}

export function ResourceCenterDialog({ open, environmentRef, environmentLoading, environmentError, onRetryEnvironment, initialSection, initialMcpTab, focusMcpRef, notice, intent, onClose, onOpenReference, onResourcesChanged }: ResourceCenterProps) {
  const { data, error: extensionsError, refresh: refreshExtensions } = useExtensions(open && environmentRef ? environmentRef : undefined);
  const [section, setSection] = useState<ResourceSection>(() => intent?.section ?? initialSection ?? "providers");
  const [configuration, setConfiguration] = useState<WorkflowConfiguration | null>(null);
  const [configurationLoading, setConfigurationLoading] = useState(false);
  const [configurationError, setConfigurationError] = useState("");
  const [configurationGeneration, setConfigurationGeneration] = useState(0);
  const [editor, setEditor] = useState<ResourceEditorTarget | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [tests, setTests] = useState<Record<string, ConnectionTestResult>>({});
  const [busyKey, setBusyKey] = useState("");
  const [menuOpen, setMenuOpen] = useState<MenuKey>(null);
  const [providerDelete, setProviderDelete] = useState<ProviderDeleteState | null>(null);
  const [tools, setTools] = useState<WorkflowTool[]>([]);
  const panel = useRef<HTMLElement>(null);
  const intentOpenedRef = useRef("");

  useEffect(() => {
    if (!open) return;
    setSection(intent?.section ?? initialSection ?? "providers");
    setSearch(""); setFeedback(null); setTests({}); setMenuOpen(null);
  }, [open, intent?.section, initialSection]);

  useEffect(() => {
    if (!open || !environmentRef) return;
    let active = true;
    setConfigurationLoading(true);
    workflowApiV2.configuration()
      .then(value => { if (active) { setConfiguration(value); setConfigurationError(""); } })
      .catch(reason => { if (active) setConfigurationError(workflowErrorMessage(reason)); })
      .finally(() => { if (active) setConfigurationLoading(false); });
    return () => { active = false; };
  }, [open, environmentRef, configurationGeneration]);

  useEffect(() => {
    if (!open || !environmentRef) return;
    let active = true;
    const request = workflowApiV2.tools?.(environmentRef);
    if (request) request.then(result => { if (active) setTools(result.items); }).catch(() => { if (active) setTools([]); });
    return () => { active = false; };
  }, [open, environmentRef, data]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = panel.current?.querySelector<HTMLElement>("[data-resource-autofocus]") ?? panel.current;
    target?.focus();
    return () => { previous?.focus?.(); };
  }, [open]);

  useEffect(() => {
    if (!open || !intent || intent.kind !== "create" || !environmentRef || !data) return;
    const key = `${intent.section}:${environmentRef}`;
    if (intentOpenedRef.current === key) return;
    intentOpenedRef.current = key;
    const next = editorForSection(intent.section);
    if (next) { setEditor(next); setEditorKey(current => current + 1); }
    // The intent stays visible until the user closes the editor or center.
  }, [open, intent?.section, environmentRef, data]);

  useEffect(() => {
    if (!open) intentOpenedRef.current = "";
  }, [open]);

  function reloadConfiguration() { setConfigurationGeneration(current => current + 1); }
  function handleResourcesChanged() { refreshExtensions(); reloadConfiguration(); onResourcesChanged?.(); }

  function openEditor(target: ResourceEditorTarget) {
    // Never open an editor before the environment and its catalog are ready:
    // it would show a service error for data that is merely still loading.
    if (!environmentRef || !data) return;
    setEditor(target); setEditorKey(current => current + 1); setMenuOpen(null); setFeedback(null);
  }

  async function testConnection(entry: { ref: string; version: number; sideEffect?: string }) {
    const key = `${entry.ref}@${entry.version}`;
    setBusyKey(key); setFeedback(null);
    try { setTests(current => ({ ...current, [key]: { ok: false } })); const result = await workflowApiV2.testExtension(environmentRef, { ref: entry.ref, version: entry.version }); setTests(current => ({ ...current, [key]: result })); }
    catch (reason) { setFeedback({ ok: false, text: workflowErrorMessage(reason) }); }
    finally { setBusyKey(""); }
  }

  async function disable(kind: "connection" | "function", ref: string, version: number, label: string) {
    setBusyKey(`${ref}@${version}`); setFeedback(null); setMenuOpen(null);
    try {
      await workflowApiV2.extension(environmentRef, { action: "disable", kind, ref, version });
      setFeedback({ ok: true, text: kind === "connection"
        ? `已停用「${label}」并撤销它的全部版本；测试不可用，仍引用它的节点会提示连接不可用。可随时恢复连接。`
        : `已停用「${label}」v${version}；仍引用它的节点会提示版本不可用。` });
      handleResourcesChanged();
    } catch (reason) { setFeedback({ ok: false, text: workflowErrorMessage(reason) }); }
    finally { setBusyKey(""); }
  }

  async function restoreConnection(entry: CatalogConnection) {
    setBusyKey(`restore:${entry.ref}`); setFeedback(null); setMenuOpen(null);
    try {
      await workflowApiV2.extension(environmentRef, {
        action: "restore", kind: "connection", ref: entry.ref, version: entry.version + 1,
      });
      setFeedback({ ok: true, text: `已恢复「${String(entry.content.name ?? entry.ref)}」为 v${entry.version + 1}；旧版本绑定仍保持停用，请在工作流节点中改选新版本并重新测试。` });
      handleResourcesChanged();
    } catch (reason) { setFeedback({ ok: false, text: workflowErrorMessage(reason) }); }
    finally { setBusyKey(""); }
  }

  async function inspectBeforeDelete(entry: CatalogConnection) {
    setMenuOpen(null); setFeedback(null);
    setProviderDelete({ entry, loading: true, error: "", references: [], confirmed: false });
    try {
      const result = await workflowApiV2.extensionReferences(entry.ref, environmentRef);
      setProviderDelete(current => current && current.entry.ref === entry.ref
        ? { ...current, loading: false, references: result.items }
        : current);
    } catch (reason) {
      setProviderDelete(current => current && current.entry.ref === entry.ref
        ? { ...current, loading: false, error: workflowErrorMessage(reason) }
        : current);
    }
  }

  async function retryDeleteImpact() {
    if (!providerDelete) return;
    await inspectBeforeDelete(providerDelete.entry);
  }

  async function deleteProvider() {
    const target = providerDelete;
    if (!target || target.loading || target.error || target.references.length || !target.confirmed) return;
    const name = String(target.entry.content.name ?? target.entry.ref);
    setBusyKey(`delete:${target.entry.ref}`);
    try {
      await workflowApiV2.extension(environmentRef, {
        action: "delete", kind: "connection", ref: target.entry.ref, version: target.entry.version,
      });
      setProviderDelete(null);
      setFeedback({ ok: true, text: `已删除「${name}」及其全部版本和托管凭据；稳定标识 ${target.entry.ref} 不再可用。` });
      handleResourcesChanged();
    } catch (reason) {
      const text = workflowErrorMessage(reason);
      setProviderDelete(current => current ? { ...current, error: text } : current);
      // A concurrent Workflow may have added a reference after the first scan.
      // Refresh the impact list so the user gets a concrete way forward.
      try {
        const result = await workflowApiV2.extensionReferences(target.entry.ref, environmentRef);
        setProviderDelete(current => current ? { ...current, references: result.items } : current);
      } catch { /* keep the server error; deletion stays disabled */ }
    } finally { setBusyKey(""); }
  }

  if (!open) return null;

  const mcpDiscovery = useMemo(() => {
    const values: Record<string, string[]> = {};
    for (const connector of data?.environment?.connectors ?? []) {
      if (!connector.connectionRef || !Array.isArray(connector.discoveredToolNames)) continue;
      values[connector.connectionRef] = [...connector.discoveredToolNames];
    }
    return values;
  }, [data?.environment?.connectors]);
  const meta = resourceSectionMeta(section);
  const resourcesReady = Boolean(environmentRef) && Boolean(data) && !extensionsError;
  const newDisabledReason = !environmentRef ? "正在准备资源环境…" : !data ? "正在读取资源目录…" : extensionsError ? "资源目录加载失败，请先重试。" : "";
  const counts = resourceCounts({ connections: data?.connections, functions: data?.functions, variables: configuration?.variables, tools });
  const countFor = (id: ResourceSection): number | undefined => id === "variables" ? counts.variables : data ? counts[id] : undefined;
  const query = search.trim().toLowerCase();
  const matches = (values: (string | undefined)[]) => !query || values.some(value => String(value ?? "").toLowerCase().includes(query));

  function sectionBody(): ReactNode {
    // Keep an already mounted resource body during a catalog refresh. Replacing
    // it with the loading row unmounts McpResource and loses tab/search/feedback.
    if (environmentLoading && (!environmentRef || !data)) return <p className="wf-resource-loading" role="status" data-resource-state="loading">正在连接工作流服务…</p>;
    if (environmentError && (!environmentRef || !data)) return <div className="wf-resource-conflict" role="alert" data-resource-state="error"><p>{environmentError}</p>{onRetryEnvironment ? <button type="button" onClick={onRetryEnvironment}>重试连接</button> : null}</div>;
    if (!environmentRef) return <div className="wf-resource-center-empty" role="status" data-resource-state="empty">
      <p>工作流服务已连接，但还没有可用环境。请先在工作流中创建环境，然后重试。</p>
      {onRetryEnvironment ? <button type="button" onClick={onRetryEnvironment}>刷新环境</button> : null}
    </div>;
    if (extensionsError && section !== "variables") return <p role="alert">资源目录暂时无法读取：{extensionsError}<button type="button" onClick={refreshExtensions}>重试</button></p>;
    if (section === "variables") return <VariableTable configuration={configuration} loading={configurationLoading || (!configuration && !configurationError)} loadError={configurationError} onReloadConfiguration={reloadConfiguration} create={intent?.section === "variables"} onCreated={intent?.section === "variables" ? intent.onCreated : undefined} onConfigurationSaved={setConfiguration} onResourcesChanged={handleResourcesChanged} onOpenReference={onOpenReference}/>;
    if (!data) return <p role="status">正在读取资源…</p>;
    if (section === "providers") {
      const providers = latestConnectionsOfType(data.connections.filter(entry => matches([String(entry.content.name ?? entry.ref), entry.ref])), "provider");
      return <>
        {providers.map(entry => {
          const name = String(entry.content.name ?? entry.ref);
          const models = modelRefsOf(entry.content);
          const key = `${entry.ref}@${entry.version}`;
          return <article className="wf-resource-center-row" data-provider-ref={entry.ref} key={key}>
            <span className="wf-resource-center-icon is-model" aria-hidden="true"><Sparkles size={17}/></span>
            <div className="wf-resource-center-copy">
              <div className="wf-resource-center-title"><strong>{name}</strong>{entry.disabled ? <span className="wf-resource-badge is-disabled">已停用</span> : null}</div>
              <div className="wf-resource-center-meta">{providerModelSummary(models)}</div>
              <div className="wf-resource-center-sub">v{entry.version} · {entry.hasCredential ? "已配置加密凭据" : "无凭据"} {entry.disabled ? "· 测试不可用；恢复连接后可重新测试" : ""}</div>
              {entry.disabled ? <p className="wf-resource-disabled-note" role="status">连接已停用，所有历史版本都不会在运行时使用。恢复会创建新版本并沿用已保存的凭据，随后请重新测试。</p> : null}
            </div>
            <div className="wf-resource-center-actions">
              <button type="button" className="wf-resource-center-iconbtn" aria-label={`编辑 ${name}`} title={entry.disabled ? "先恢复连接再编辑" : "编辑显示名称、模型或地址"} disabled={Boolean(busyKey) || entry.disabled} onClick={() => openEditor({ kind: "provider", mode: "edit", ref: entry.ref })}><Pencil size={15}/></button>
              <button type="button" className="wf-resource-center-test" title={entry.disabled ? "连接已停用；恢复后再测试" : undefined} disabled={Boolean(busyKey) || entry.disabled} onClick={() => void testConnection({ ref: entry.ref, version: entry.version })}>{busyKey === key ? "测试中…" : "测试"}</button>
              <details className="wf-resource-menu" open={menuOpen === key} onToggle={event => setMenuOpen((event.target as HTMLDetailsElement).open ? key : null)}><summary aria-label={`更多操作 ${name}`} aria-expanded={menuOpen === key}><MoreHorizontal size={15}/></summary><div className="wf-resource-menu-panel">
                {entry.disabled
                  ? <button type="button" data-provider-action="restore" disabled={busyKey === `restore:${entry.ref}`} onClick={() => void restoreConnection(entry)}>恢复连接</button>
                  : <button type="button" data-provider-action="disable" disabled={busyKey === key} onClick={() => void disable("connection", entry.ref, entry.version, name)}>停用此连接</button>}
                <button type="button" className="is-danger" data-provider-action="delete" disabled={Boolean(busyKey)} onClick={() => void inspectBeforeDelete(entry)}>删除供应商…</button>
              </div></details>
            </div>
            {tests[key] ? <ResourceTestPanel result={tests[key]}/> : null}
          </article>;
        })}
        {!providers.length ? <EmptyRow text={query ? "没有匹配的模型供应商。" : "还没有模型供应商。点右上角「新建模型供应商」创建。"}/> : null}
      </>;
    }
    if (section === "apis") {
      const apis = latestConnectionsOfType(data.connections.filter(entry => matches([String(entry.content.name ?? entry.ref), entry.ref, String(entry.content.baseUrl ?? "")])), "http");
      const platformTools = platformApiTools(tools).filter(tool => matches([tool.name, tool.ref]));
      return <>
        {platformTools.map(tool => {
          const paramCount = tool.inputSchema && typeof tool.inputSchema === "object" && tool.inputSchema.properties && typeof tool.inputSchema.properties === "object" && !Array.isArray(tool.inputSchema.properties) ? Object.keys(tool.inputSchema.properties).length : 0;
          return <article className="wf-resource-center-row" key={tool.ref}>
            <span className="wf-resource-center-icon is-api" aria-hidden="true"><Server size={17}/></span>
            <div className="wf-resource-center-copy"><div className="wf-resource-center-title"><strong>{tool.name || tool.ref}</strong><span className="wf-resource-panel-badge is-platform">平台提供</span></div><div className="wf-resource-center-url"><span className="wf-resource-center-method">API</span><code>{tool.ref}</code></div><div className="wf-resource-center-sub">{paramCount} 个参数 · {tool.description || "平台提供的连接，编辑后保存为你的副本"}</div></div>
            <div className="wf-resource-center-actions">
              <button type="button" className="wf-resource-center-iconbtn" aria-label={`编辑 ${tool.name || tool.ref}`} title="编辑" onClick={() => openEditor({ kind: "api", mode: "create", platformTool: tool })}><Pencil size={15}/></button>
              <button type="button" className="wf-resource-center-test" onClick={() => openEditor({ kind: "api", mode: "create", platformTool: tool })}>测试</button>
              <details className="wf-resource-menu"><summary aria-label={`更多操作 ${tool.name || tool.ref}`}><MoreHorizontal size={15}/></summary><div className="wf-resource-menu-panel"><button type="button" disabled>平台连接不可停用</button></div></details>
            </div>
          </article>;
        })}
        {apis.map(entry => {
          const name = String(entry.content.name ?? entry.ref);
          const key = `${entry.ref}@${entry.version}`;
          return <article className="wf-resource-center-row" key={key}>
            <span className="wf-resource-center-icon is-api" aria-hidden="true"><Server size={17}/></span>
            <div className="wf-resource-center-copy"><div className="wf-resource-center-title"><strong>{name}</strong><span className="wf-resource-panel-badge is-mine">我创建的</span></div><div className="wf-resource-center-url"><span className="wf-resource-center-method">{String(entry.content.method ?? "GET")}</span><code>{apiDisplayUrl(entry.content).replace(/^[A-Z]+ /, "").replace(/ · \d+ 个参数$/, "")}</code></div><div className="wf-resource-center-sub">{apiDisplayUrl(entry.content).match(/· (\d+) 个参数/)?.[1] ?? "0"} 个参数 · v{entry.version}</div></div>
            <div className="wf-resource-center-actions">
              <button type="button" className="wf-resource-center-iconbtn" aria-label={`编辑 ${name}`} title="编辑" disabled={Boolean(busyKey)} onClick={() => openEditor({ kind: "api", mode: "edit", ref: entry.ref })}><Pencil size={15}/></button>
              <button type="button" className="wf-resource-center-test" disabled={Boolean(busyKey) || entry.disabled} onClick={() => openEditor({ kind: "api", mode: "edit", ref: entry.ref })}>测试</button>
              <details className="wf-resource-menu" open={menuOpen === key} onToggle={event => setMenuOpen((event.target as HTMLDetailsElement).open ? key : null)}><summary aria-label={`更多操作 ${name}`} aria-expanded={menuOpen === key}><MoreHorizontal size={15}/></summary><div className="wf-resource-menu-panel"><button type="button" disabled={busyKey === key || entry.disabled} onClick={() => void disable("connection", entry.ref, entry.version, name)}>停用此连接</button></div></details>
            </div>
            {tests[key] ? <ResourceTestPanel result={tests[key]}/> : null}
          </article>;
        })}
        {!apis.length && !platformTools.length ? <EmptyRow text={query ? "没有匹配的 API 连接。" : "还没有 API 连接。点右上角「新建 API」创建。"}/> : null}
      </>;
    }
    if (section === "mcp") return <McpResource
      environmentRef={environmentRef}
      connections={data.connections}
      tools={tools}
      discovery={mcpDiscovery}
      create={intent?.section === "mcp"}
      initialTab={initialMcpTab}
      focusRef={focusMcpRef}
      notice={notice}
      onCreated={intent?.section === "mcp" ? intent.onCreated : undefined}
      onResourcesChanged={handleResourcesChanged}
      onOpenReference={onOpenReference}
    />;
    const groups = groupCatalogByRef(data.functions).filter(group => matches([group.ref, functionName(group.latest)]));
    return <>
      {groups.map(group => {
        const entry = group.latest;
        const name = functionName(entry);
        const key = `${entry.ref}@${entry.version}`;
        return <article className="wf-resource-center-row" key={key}>
          <span className="wf-resource-center-icon is-fn" aria-hidden="true"><Wrench size={17}/></span>
          <div className="wf-resource-center-copy"><div className="wf-resource-center-title"><strong>{name}</strong></div><div className="wf-resource-center-meta">{String(entry.language ?? "python") === "javascript" ? "JavaScript" : "Python"} · {entry.purpose === "handler" ? "错误处理函数" : "节点函数"} · v{entry.version}</div><div className="wf-resource-center-sub">{entry.disabled ? "已停用" : "可用"}</div></div>
          <div className="wf-resource-center-actions">
            <button type="button" className="wf-resource-center-iconbtn" aria-label={`编辑 ${name}`} title="编辑" disabled={Boolean(busyKey)} onClick={() => openEditor({ kind: "function", mode: "edit", ref: entry.ref, version: entry.version })}><Pencil size={15}/></button>
            <button type="button" className="wf-resource-center-test" disabled={Boolean(busyKey) || Boolean(entry.disabled)} onClick={() => openEditor({ kind: "function", mode: "edit", ref: entry.ref, version: entry.version })}>测试</button>
            <details className="wf-resource-menu" open={menuOpen === key} onToggle={event => setMenuOpen((event.target as HTMLDetailsElement).open ? key : null)}><summary aria-label={`更多操作 ${name}`} aria-expanded={menuOpen === key}><MoreHorizontal size={15}/></summary><div className="wf-resource-menu-panel"><button type="button" disabled={busyKey === key || entry.disabled} onClick={() => void disable("function", entry.ref, entry.version, name)}>停用此函数</button></div></details>
          </div>
        </article>;
      })}
      {!groups.length ? <EmptyRow text={query ? "没有匹配的函数。" : "还没有已发布的函数。可从函数节点或右上角新建。"}/> : null}
    </>;
  }

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) { if (event.target === event.currentTarget) onClose(); }
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    // A native nested dialog owns Escape and its own focus trap.
    if (panel.current?.querySelector("dialog[open]")) return;
    if (event.key === "Escape") { event.stopPropagation(); if (editor) { setEditor(null); return; } onClose(); return; }
    if (event.key !== "Tab" || !panel.current || typeof document === "undefined") return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const showNew = section !== "variables" && section !== "functions" && section !== "mcp";
  return <>
    <div className="wf-resource-backdrop" aria-hidden="true" onMouseDown={handleBackdrop} />
    <section className="wf-resource-dialog" role="dialog" aria-modal="true" aria-labelledby="wf-resource-title" aria-describedby="wf-resource-description" tabIndex={-1} ref={panel} onKeyDown={handleKeyDown}>
      <header className="wf-resource-header">
        <div className="wf-resource-center-heading"><div className="wf-resource-center-logo" aria-hidden="true"><Braces size={17}/></div><div><h2 id="wf-resource-title">资源中心</h2><p id="wf-resource-description">模型、API、MCP、函数和变量在这里统一管理，节点里直接选择</p></div></div>
        <button type="button" className="wf-editor-iconbtn" aria-label="关闭资源中心" title="关闭" onClick={onClose}><X size={17}/></button>
      </header>
      <div className="wf-resource-body">
        <nav className="wf-resource-nav" aria-label="资源分类">
          {RESOURCE_SECTIONS.map((item, index) => <button key={item.id} type="button" data-resource-section={item.id} data-resource-count={countFor(item.id)} data-resource-autofocus={index === 0 ? true : undefined} aria-pressed={section === item.id} onClick={() => { setSection(item.id); setMenuOpen(null); }}><span>{item.label}</span><small aria-hidden="true">{countFor(item.id) ?? ""}</small></button>)}
        </nav>
        <div className="wf-resource-content">
          <div className="wf-resource-center-toolbar">
            <div><h3>{meta.label}</h3><p>{meta.hint}</p></div>
            {section !== "mcp" ? <label className="wf-resource-center-search"><Search size={13}/><input aria-label="搜索资源" placeholder="搜索名称或地址…" value={search} onChange={event => setSearch(event.target.value)}/></label> : null}
            {showNew && section !== "providers" ? <button type="button" className="primary wf-resource-center-new" disabled={!resourcesReady || environmentLoading} title={newDisabledReason || (environmentLoading ? "正在准备资源环境…" : undefined)} onClick={() => openEditor(editorForSection(section)!)}><Plus size={12}/>{section === "apis" ? "新建 API" : "新建"}</button> : null}
            {showNew && section === "providers" ? <button type="button" className="primary wf-resource-center-new" disabled={!resourcesReady || environmentLoading} title={newDisabledReason || (environmentLoading ? "正在准备资源环境…" : undefined)} onClick={() => openEditor({ kind: "provider", mode: "create" })}><Plus size={12}/>新建模型供应商</button> : null}
            {section === "functions" ? <button type="button" className="primary wf-resource-center-new" disabled={!resourcesReady || environmentLoading} title={newDisabledReason || (environmentLoading ? "正在准备资源环境…" : undefined)} onClick={() => openEditor({ kind: "function", mode: "create" })}><Plus size={12}/>新建函数</button> : null}
          </div>
          {intent?.section === section ? <p className="wf-resource-intent">正在为节点新建资源：创建成功后自动回填，悬窗保持打开直到你关闭。</p> : null}
          {feedback ? <p className={feedback.ok ? "wf-resource-feedback" : "wf-resource-feedback is-error"} role={feedback.ok ? "status" : "alert"}>{feedback.text}</p> : null}
          <div className="wf-resource-center-list">{sectionBody()}</div>
        </div>
      </div>
    </section>
    {providerDelete ? (() => {
      const name = String(providerDelete.entry.content.name ?? providerDelete.entry.ref);
      const versions = data?.connections.filter(entry => entry.ref === providerDelete.entry.ref).length ?? 1;
      const workflowCount = new Set(providerDelete.references.map(row => row.workflowId)).size;
      const blocked = providerDelete.loading || Boolean(providerDelete.error) || providerDelete.references.length > 0;
      const deleting = busyKey === `delete:${providerDelete.entry.ref}`;
      return <>
        <div className="wf-resource-modal-backdrop" aria-hidden="true" onMouseDown={event => { if (event.target === event.currentTarget && !deleting) setProviderDelete(null); }} />
        <section className="wf-resource-modal wf-provider-delete" role="dialog" aria-modal="true" aria-labelledby="wf-provider-delete-title" aria-describedby="wf-provider-delete-desc"
          onKeyDown={event => { if (event.key === "Escape" && !deleting) { event.stopPropagation(); setProviderDelete(null); } }}>
          <header className="wf-resource-modal-header">
            <div><h3 id="wf-provider-delete-title">删除模型供应商</h3><p id="wf-provider-delete-desc">先核对引用；有引用的供应商不会被删除，也不会破坏现有工作流。</p></div>
            <button type="button" className="wf-resource-close" aria-label="关闭删除确认" disabled={deleting} onClick={() => setProviderDelete(null)}>关闭</button>
          </header>
          <div className="wf-resource-modal-body">
            <dl className="wf-provider-delete-facts">
              <div><dt>显示名称</dt><dd>{name}</dd></div>
              <div><dt>稳定标识</dt><dd><code>{providerDelete.entry.ref}</code></dd></div>
              <div><dt>版本</dt><dd>{versions} 个（最新 v{providerDelete.entry.version}）</dd></div>
              <div><dt>凭据</dt><dd>{providerDelete.entry.hasCredential ? "将删除托管凭据" : "无托管凭据"}</dd></div>
            </dl>
            {providerDelete.loading ? <p role="status">正在检查工作流引用…</p> : null}
            {providerDelete.error ? <div className="wf-resource-conflict" role="alert"><p>{providerDelete.error}</p><button type="button" onClick={() => void retryDeleteImpact()}>重新检查引用</button></div> : null}
            <p className="wf-field-note">仍有排队、运行中或等待回应的运行使用此连接时，删除会被拒绝；请先等待结束或取消运行。</p>
            {!providerDelete.loading && !providerDelete.error ? (providerDelete.references.length
              ? <div className="wf-resource-conflict" role="alert">
                  <p><strong>不能删除：仍被引用。</strong>这个供应商被 {workflowCount} 个工作流中的 {providerDelete.references.length} 个节点引用。请先在这些工作流中替换或移除供应商，然后重新检查。</p>
                  <ResourceReferences rows={providerDelete.references} onOpen={row => { setProviderDelete(null); onOpenReference?.(row); }} />
                </div>
              : <div className="wf-provider-delete-clear" role="status">
                  <strong>未发现当前工作流引用。</strong>
                  <p>删除会移除全部 {versions} 个版本{providerDelete.entry.hasCredential ? "及托管凭据" : ""}，且无法撤销。稳定标识 <code>{providerDelete.entry.ref}</code> 不再可用。</p>
                  <label className="wf-resource-checkbox"><input type="checkbox" checked={providerDelete.confirmed} onChange={event => setProviderDelete(current => current ? { ...current, confirmed: event.target.checked } : current)} />我确认删除该供应商及其全部版本，并理解引用会失效。</label>
                </div>) : null}
          </div>
          <footer className="wf-resource-modal-footer">
            <span>{blocked ? "引用检查未通过，删除按钮保持禁用。" : "服务端会在删除前再次检查引用和版本。"}</span>
            <div className="wf-resource-actions">
              <button type="button" disabled={deleting} onClick={() => setProviderDelete(null)}>取消</button>
              <button type="button" className="danger" data-provider-action="confirm-delete" disabled={blocked || deleting || !providerDelete.confirmed} onClick={() => void deleteProvider()}>{deleting ? "正在删除…" : "永久删除"}</button>
            </div>
          </footer>
        </section>
      </>;
    })() : null}
    {editor ? <ResourceEditor key={`${editorKey}:${editor.kind}:${editor.mode}`} environmentRef={environmentRef} target={editor} onClose={() => setEditor(null)} onSaved={(ref, version, content) => { refreshExtensions(); reloadConfiguration(); onResourcesChanged?.(); setFeedback({ ok: true, text: `已保存「${String(content?.name ?? ref)}」v${version}。` }); if (intent?.section === section) intent.onCreated(ref, version, content); }} /> : null}
  </>;
}

function EmptyRow({ text, hint }: { text: string; hint?: string }) {
  return <div className="wf-resource-center-empty"><span aria-hidden="true"><Plus size={15}/></span><p>{text}</p>{hint ? <p>{hint}</p> : null}</div>;
}
