import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Braces, MoreHorizontal, Pencil, Plus, Search, Server, Sparkles, Wrench, X } from "lucide-react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { ConnectionTestResult, JsonValue, WorkflowConfiguration, WorkflowTool } from "../domain/v2/types";
import { useExtensions, type FunctionVersion } from "../editor/v2/FunctionExecutionFields";
import { latestConnectionsOfType, resourceCounts, groupCatalogByRef } from "./resourceModel";
import { ResourceTestPanel } from "./ResourceTestPanel";
import { apiDisplayUrl } from "./apiResourceModel";
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
  if (section === "mcp") return { kind: "mcp", mode: "create" };
  if (section === "functions") return { kind: "function", mode: "create" };
  return null;
}

function functionName(entry: FunctionVersion): string {
  return String(entry.name ?? entry.ref);
}

export function ResourceCenterDialog({ open, environmentRef, initialSection, intent, onClose, onOpenReference, onResourcesChanged }: ResourceCenterProps) {
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
  const [tools, setTools] = useState<WorkflowTool[]>([]);
  const panel = useRef<HTMLElement>(null);

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
    if (!open || !intent || intent.kind !== "create") return;
    const next = editorForSection(intent.section);
    if (next) { setEditor(next); setEditorKey(current => current + 1); }
    // The intent stays visible until the user closes the editor or center.
  }, [open, intent?.section]);

  function reloadConfiguration() { setConfigurationGeneration(current => current + 1); }
  function handleResourcesChanged() { refreshExtensions(); reloadConfiguration(); onResourcesChanged?.(); }

  function openEditor(target: ResourceEditorTarget) { setEditor(target); setEditorKey(current => current + 1); setMenuOpen(null); setFeedback(null); }

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
      setFeedback({ ok: true, text: `已停用「${label}」v${version}；仍引用它的节点会提示版本不可用。` });
      handleResourcesChanged();
    } catch (reason) { setFeedback({ ok: false, text: workflowErrorMessage(reason) }); }
    finally { setBusyKey(""); }
  }

  if (!open) return null;

  const meta = resourceSectionMeta(section);
  const counts = resourceCounts({ connections: data?.connections, functions: data?.functions, variables: configuration?.variables });
  const countFor = (id: ResourceSection): number | undefined => id === "variables" ? counts.variables : data ? counts[id] : undefined;
  const query = search.trim().toLowerCase();
  const matches = (values: (string | undefined)[]) => !query || values.some(value => String(value ?? "").toLowerCase().includes(query));

  function sectionBody(): ReactNode {
    if (!environmentRef) return <p role="alert">工作流服务暂时不可用，暂时无法读取资源。</p>;
    if (extensionsError && section !== "variables") return <p role="alert">资源目录暂时无法读取：{extensionsError}<button type="button" onClick={refreshExtensions}>重试</button></p>;
    if (section === "variables") return <VariableTable configuration={configuration} loading={configurationLoading || (!configuration && !configurationError)} loadError={configurationError} onReloadConfiguration={reloadConfiguration} create={intent?.section === "variables"} onCreated={intent?.section === "variables" ? intent.onCreated : undefined} onConfigurationSaved={setConfiguration} onResourcesChanged={handleResourcesChanged} onOpenReference={onOpenReference}/>;
    if (!data) return <p role="status">正在读取资源…</p>;
    if (section === "providers") {
      const providers = latestConnectionsOfType(data.connections.filter(entry => matches([String(entry.content.name ?? entry.ref), entry.ref])), "provider");
      return <>
        {providers.map(entry => {
          const name = String(entry.content.name ?? entry.ref);
          const models = Array.isArray(entry.content.modelRefs) ? entry.content.modelRefs.map(String) : [];
          const key = `${entry.ref}@${entry.version}`;
          return <article className="wf-resource-center-row" key={key}>
            <span className="wf-resource-center-icon is-model" aria-hidden="true"><Sparkles size={17}/></span>
            <div className="wf-resource-center-copy"><div className="wf-resource-center-title"><strong>{name}</strong></div><div className="wf-resource-center-meta">{models.length} 个模型{models[0] ? ` · ${models[0]} 已启用` : ""}</div><div className="wf-resource-center-sub">v{entry.version} · {entry.hasCredential ? "已配置凭据" : "无凭据"}</div></div>
            <button type="button" className="wf-resource-center-iconbtn" aria-label={`编辑 ${name}`} title="编辑" disabled={Boolean(busyKey)} onClick={() => openEditor({ kind: "provider", mode: "edit", ref: entry.ref })}><Pencil size={15}/></button>
            <button type="button" className="wf-resource-center-test" disabled={Boolean(busyKey) || entry.disabled} onClick={() => void testConnection({ ref: entry.ref, version: entry.version })}>{busyKey === key ? "测试中…" : "测试"}</button>
            <details className="wf-resource-menu" open={menuOpen === key} onToggle={event => setMenuOpen((event.target as HTMLDetailsElement).open ? key : null)}><summary aria-label={`更多操作 ${name}`} aria-expanded={menuOpen === key}><MoreHorizontal size={15}/></summary><div className="wf-resource-menu-panel"><button type="button" disabled={busyKey === key || entry.disabled} onClick={() => void disable("connection", entry.ref, entry.version, name)}>停用此连接</button></div></details>
            {tests[key] ? <ResourceTestPanel result={tests[key]}/> : null}
          </article>;
        })}
        {!providers.length ? <EmptyRow text={query ? "没有匹配的模型供应商。" : "还没有模型供应商。点右上角「新建模型供应商」创建。"}/> : null}
      </>;
    }
    if (section === "apis") {
      const apis = latestConnectionsOfType(data.connections.filter(entry => matches([String(entry.content.name ?? entry.ref), entry.ref, String(entry.content.baseUrl ?? "")])), "http");
      const platformTools = tools.filter(tool => (tool.origin ?? "environment") !== "user" && !tool.connectionRef && (tool.ref === "hn_search" || /hacker news/i.test(tool.name)) && matches([tool.name, tool.ref]));
      return <>
        {platformTools.map(tool => <article className="wf-resource-center-row" key={tool.ref}>
          <span className="wf-resource-center-icon is-api" aria-hidden="true"><Server size={17}/></span>
          <div className="wf-resource-center-copy"><div className="wf-resource-center-title"><strong>{tool.ref === "hn_search" ? "Hacker News 搜索" : tool.name}</strong><span className="wf-resource-panel-badge is-platform">平台提供</span></div><div className="wf-resource-center-url"><span className="wf-resource-center-method">GET</span><code>hn.algolia.com/api/v1/search</code></div><div className="wf-resource-center-sub">4 个参数 · 平台提供的连接，编辑后保存为你的副本</div></div>
          <button type="button" className="wf-resource-center-iconbtn" aria-label="编辑 Hacker News 搜索" title="编辑" onClick={() => openEditor({ kind: "api", mode: "create", platformTool: tool })}><Pencil size={15}/></button>
          <button type="button" className="wf-resource-center-test" onClick={() => openEditor({ kind: "api", mode: "create", platformTool: tool })}>测试</button>
          <details className="wf-resource-menu"><summary aria-label={`更多操作 ${tool.name}`}><MoreHorizontal size={15}/></summary><div className="wf-resource-menu-panel"><button type="button" disabled>平台连接不可停用</button></div></details>
        </article>)}
        {apis.map(entry => {
          const name = String(entry.content.name ?? entry.ref);
          const key = `${entry.ref}@${entry.version}`;
          return <article className="wf-resource-center-row" key={key}>
            <span className="wf-resource-center-icon is-api" aria-hidden="true"><Server size={17}/></span>
            <div className="wf-resource-center-copy"><div className="wf-resource-center-title"><strong>{name}</strong></div><div className="wf-resource-center-url"><span className="wf-resource-center-method">{String(entry.content.method ?? "GET")}</span><code>{apiDisplayUrl(entry.content).replace(/^[A-Z]+ /, "").replace(/ · \d+ 个参数$/, "")}</code></div><div className="wf-resource-center-sub">{apiDisplayUrl(entry.content).match(/· (\d+) 个参数/)?.[1] ?? "0"} 个参数 · v{entry.version}</div></div>
            <button type="button" className="wf-resource-center-iconbtn" aria-label={`编辑 ${name}`} title="编辑" disabled={Boolean(busyKey)} onClick={() => openEditor({ kind: "api", mode: "edit", ref: entry.ref })}><Pencil size={15}/></button>
            <button type="button" className="wf-resource-center-test" disabled={Boolean(busyKey) || entry.disabled} onClick={() => openEditor({ kind: "api", mode: "edit", ref: entry.ref })}>测试</button>
            <details className="wf-resource-menu" open={menuOpen === key} onToggle={event => setMenuOpen((event.target as HTMLDetailsElement).open ? key : null)}><summary aria-label={`更多操作 ${name}`} aria-expanded={menuOpen === key}><MoreHorizontal size={15}/></summary><div className="wf-resource-menu-panel"><button type="button" disabled={busyKey === key || entry.disabled} onClick={() => void disable("connection", entry.ref, entry.version, name)}>停用此连接</button></div></details>
            {tests[key] ? <ResourceTestPanel result={tests[key]}/> : null}
          </article>;
        })}
        {!apis.length && !platformTools.length ? <EmptyRow text={query ? "没有匹配的 API 连接。" : "还没有 API 连接。点右上角「新建 API」创建。"}/> : null}
      </>;
    }
    if (section === "mcp") {
      const services = latestConnectionsOfType(data.connections.filter(entry => matches([String(entry.content.name ?? entry.ref), String(entry.content.url ?? "")])), "mcp-http");
      return <>
        {services.map(entry => {
          const name = String(entry.content.name ?? entry.ref);
          const key = `${entry.ref}@${entry.version}`;
          return <article className="wf-resource-center-row" key={key}>
            <span className="wf-resource-center-icon is-mcp" aria-hidden="true"><Server size={17}/></span>
            <div className="wf-resource-center-copy"><div className="wf-resource-center-title"><strong>{name}</strong></div><div className="wf-resource-center-meta">{String(entry.content.url ?? "")}</div><div className="wf-resource-center-sub">v{entry.version} · {entry.hasCredential ? "已配置凭据" : "无凭据"}</div></div>
            <button type="button" className="wf-resource-center-iconbtn" aria-label={`编辑 ${name}`} title="编辑" disabled={Boolean(busyKey)} onClick={() => openEditor({ kind: "mcp", mode: "edit", ref: entry.ref })}><Pencil size={15}/></button>
            <button type="button" className="wf-resource-center-test" disabled={Boolean(busyKey) || entry.disabled} onClick={() => void testConnection({ ref: entry.ref, version: entry.version })}>{busyKey === key ? "测试中…" : "测试"}</button>
            <details className="wf-resource-menu" open={menuOpen === key} onToggle={event => setMenuOpen((event.target as HTMLDetailsElement).open ? key : null)}><summary aria-label={`更多操作 ${name}`} aria-expanded={menuOpen === key}><MoreHorizontal size={15}/></summary><div className="wf-resource-menu-panel"><button type="button" disabled={busyKey === key || entry.disabled} onClick={() => void disable("connection", entry.ref, entry.version, name)}>停用此连接</button></div></details>
            {tests[key] ? <ResourceTestPanel result={tests[key]}/> : null}
          </article>;
        })}
        {!services.length ? <EmptyRow text={query ? "没有匹配的 MCP 服务。" : "还没有 MCP 服务连接。"}/> : null}
      </>;
    }
    const groups = groupCatalogByRef(data.functions).filter(group => matches([group.ref, functionName(group.latest)]));
    return <>
      {groups.map(group => {
        const entry = group.latest;
        const name = functionName(entry);
        const key = `${entry.ref}@${entry.version}`;
        return <article className="wf-resource-center-row" key={key}>
          <span className="wf-resource-center-icon is-fn" aria-hidden="true"><Wrench size={17}/></span>
          <div className="wf-resource-center-copy"><div className="wf-resource-center-title"><strong>{name}</strong></div><div className="wf-resource-center-meta">{String(entry.language ?? "python") === "javascript" ? "JavaScript" : "Python"} · {entry.purpose === "handler" ? "错误处理函数" : "节点函数"} · v{entry.version}</div><div className="wf-resource-center-sub">{entry.disabled ? "已停用" : "可用"}</div></div>
          <button type="button" className="wf-resource-center-iconbtn" aria-label={`编辑 ${name}`} title="编辑" disabled={Boolean(busyKey)} onClick={() => openEditor({ kind: "function", mode: "edit", ref: entry.ref, version: entry.version })}><Pencil size={15}/></button>
          <button type="button" className="wf-resource-center-test" disabled={Boolean(busyKey) || Boolean(entry.disabled)} onClick={() => openEditor({ kind: "function", mode: "edit", ref: entry.ref, version: entry.version })}>测试</button>
          <details className="wf-resource-menu" open={menuOpen === key} onToggle={event => setMenuOpen((event.target as HTMLDetailsElement).open ? key : null)}><summary aria-label={`更多操作 ${name}`} aria-expanded={menuOpen === key}><MoreHorizontal size={15}/></summary><div className="wf-resource-menu-panel"><button type="button" disabled={busyKey === key || entry.disabled} onClick={() => void disable("function", entry.ref, entry.version, name)}>停用此函数</button></div></details>
        </article>;
      })}
      {!groups.length ? <EmptyRow text={query ? "没有匹配的函数。" : "还没有已发布的函数。可从函数节点或右上角新建。"}/> : null}
    </>;
  }

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) { if (event.target === event.currentTarget) onClose(); }
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
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
            <label className="wf-resource-center-search"><Search size={13}/><input aria-label="搜索资源" placeholder="搜索名称或地址…" value={search} onChange={event => setSearch(event.target.value)}/></label>
            {showNew && section !== "providers" ? <button type="button" className="primary wf-resource-center-new" onClick={() => openEditor(editorForSection(section)!)}><Plus size={12}/>{section === "apis" ? "新建 API" : "新建"}</button> : null}
            {showNew && section === "providers" ? <button type="button" className="primary wf-resource-center-new" onClick={() => openEditor({ kind: "provider", mode: "create" })}><Plus size={12}/>新建模型供应商</button> : null}
            {section === "functions" ? <button type="button" className="primary wf-resource-center-new" onClick={() => openEditor({ kind: "function", mode: "create" })}><Plus size={12}/>新建函数</button> : null}
            {section === "mcp" ? <button type="button" className="primary wf-resource-center-new" onClick={() => openEditor({ kind: "mcp", mode: "create" })}><Plus size={12}/>新建 MCP 服务</button> : null}
          </div>
          {intent?.section === section ? <p className="wf-resource-intent">正在为节点新建资源：创建成功后自动回填，悬窗保持打开直到你关闭。</p> : null}
          {feedback ? <p className={feedback.ok ? "wf-resource-feedback" : "wf-resource-feedback is-error"} role={feedback.ok ? "status" : "alert"}>{feedback.text}</p> : null}
          <div className="wf-resource-center-list">{sectionBody()}</div>
        </div>
      </div>
    </section>
    {editor ? <ResourceEditor key={`${editorKey}:${editor.kind}:${editor.mode}`} environmentRef={environmentRef} target={editor} onClose={() => setEditor(null)} onSaved={(ref, version, content) => { refreshExtensions(); reloadConfiguration(); onResourcesChanged?.(); if (intent?.section === section) intent.onCreated(ref, version, content); }} /> : null}
  </>;
}

function EmptyRow({ text, hint }: { text: string; hint?: string }) {
  return <div className="wf-resource-center-empty"><span aria-hidden="true"><Plus size={15}/></span><p>{text}</p>{hint ? <p>{hint}</p> : null}</div>;
}
