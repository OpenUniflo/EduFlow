import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import { useExtensions } from "../editor/v2/FunctionExecutionFields";
import type { WorkflowConfiguration } from "../domain/v2/types";
import { ApiResource } from "./ApiResource";
import { FunctionResource } from "./FunctionResource";
import { McpResource } from "./McpResource";
import { ProviderResource } from "./ProviderResource";
import { VariableTable } from "./VariableTable";
import { resourceCounts } from "./resourceModel";
import { RESOURCE_SECTIONS, resourceSectionMeta, type ResourceCenterProps, type ResourceSection } from "./resourceTypes";
import "./resourceCenter.css";

export type { ResourceCenterIntent, ResourceCenterProps, ResourceCreated, ResourceIntent, ResourceSection } from "./resourceTypes";

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';

/** L3 resource-center shell: dimmed canvas, inset panel, section navigation and a single close action. */
export function ResourceCenterDialog({ open, environmentRef, initialSection, intent, onClose, onOpenReference, onResourcesChanged }: ResourceCenterProps) {
  const { data, error: extensionsError, refresh: refreshExtensions } = useExtensions(open && environmentRef ? environmentRef : undefined);
  const [section, setSection] = useState<ResourceSection>(() => intent?.section ?? initialSection ?? "providers");
  const [configuration, setConfiguration] = useState<WorkflowConfiguration | null>(null);
  const [configurationLoading, setConfigurationLoading] = useState(false);
  const [configurationError, setConfigurationError] = useState("");
  const [configurationGeneration, setConfigurationGeneration] = useState(0);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    setSection(intent?.section ?? initialSection ?? "providers");
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
    if (!open || typeof document === "undefined") return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = panel.current?.querySelector<HTMLElement>("[data-resource-autofocus]") ?? panel.current;
    target?.focus();
    return () => { previous?.focus?.(); };
  }, [open]);

  if (!open) return null;

  const meta = resourceSectionMeta(section);
  const counts = resourceCounts({ connections: data?.connections, functions: data?.functions, variables: configuration?.variables });
  const countFor = (id: ResourceSection): number | undefined => id === "variables" ? counts.variables : data ? counts[id] : undefined;

  function reloadConfiguration() {
    setConfigurationGeneration(current => current + 1);
  }

  function handleResourcesChanged() {
    refreshExtensions();
    reloadConfiguration();
    onResourcesChanged?.();
  }

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
    if (event.key !== "Tab" || !panel.current || typeof document === "undefined") return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function sectionBody(): ReactNode {
    if (!environmentRef) return <p role="alert">工作流服务暂时不可用，暂时无法读取资源。</p>;
    const creatingHere = intent?.section === section ? intent.onCreated : undefined;
    switch (section) {
      case "providers":
        return <ProviderResource environmentRef={environmentRef} create={intent?.section === "providers"} onCreated={creatingHere} onResourcesChanged={handleResourcesChanged} onOpenReference={onOpenReference} />;
      case "apis":
        return <ApiResource environmentRef={environmentRef} create={intent?.section === "apis"} onCreated={creatingHere} onResourcesChanged={handleResourcesChanged} onOpenReference={onOpenReference} />;
      case "mcp":
        return <McpResource environmentRef={environmentRef} create={intent?.section === "mcp"} onCreated={creatingHere} onResourcesChanged={handleResourcesChanged} onOpenReference={onOpenReference} />;
      case "functions":
        return <FunctionResource environmentRef={environmentRef} onResourcesChanged={handleResourcesChanged} onOpenReference={onOpenReference} />;
      case "variables":
        return <VariableTable configuration={configuration} loading={configurationLoading || (!configuration && !configurationError)} loadError={configurationError} onReloadConfiguration={reloadConfiguration} create={intent?.section === "variables"} onCreated={creatingHere} onConfigurationSaved={setConfiguration} onResourcesChanged={handleResourcesChanged} onOpenReference={onOpenReference} />;
    }
  }

  return <>
    <div className="wf-resource-backdrop" aria-hidden="true" onMouseDown={handleBackdrop} />
    <section className="wf-resource-dialog" role="dialog" aria-modal="true" aria-labelledby="wf-resource-title" aria-describedby="wf-resource-description" tabIndex={-1} ref={panel} onKeyDown={handleKeyDown}>
      <header className="wf-resource-header">
        <div>
          <h2 id="wf-resource-title">资源中心</h2>
          <p id="wf-resource-description">管理当前账号的模型、API、MCP 服务、函数与变量。资源按版本保存，编辑不会自动替换正在引用旧版本的节点。</p>
        </div>
        <button type="button" className="wf-resource-close" aria-label="关闭资源中心" onClick={onClose}>关闭</button>
      </header>
      <div className="wf-resource-body">
        <nav className="wf-resource-nav" aria-label="资源分类">
          {RESOURCE_SECTIONS.map((item, index) => <button key={item.id} type="button" data-resource-section={item.id} data-resource-count={countFor(item.id)} data-resource-autofocus={index === 0 ? true : undefined} aria-pressed={section === item.id} onClick={() => setSection(item.id)}>
            <span>{item.label}</span><small aria-hidden="true">{countFor(item.id) ?? ""}</small>
          </button>)}
        </nav>
        <div className="wf-resource-content">
          <header><h3>{meta.label}</h3><p>{meta.hint}</p></header>
          {extensionsError ? <p role="alert">资源目录暂时无法读取：{extensionsError}<button type="button" onClick={refreshExtensions}>重试</button></p> : null}
          {intent?.section === section ? <p className="wf-resource-intent">正在为节点新建资源：创建成功后自动回填，悬窗保持打开直到你关闭。</p> : null}
          {sectionBody()}
        </div>
      </div>
    </section>
  </>;
}
