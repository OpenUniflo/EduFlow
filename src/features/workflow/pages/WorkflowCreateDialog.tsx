import { useEffect, useRef, useState } from "react";
import { Bot, ChevronRight, FilePlus2, GitBranch, Loader2, Search, Wrench } from "lucide-react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { firstUserModelProvider, userModelProviders } from "../resources/providerModel";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import { createEditorV2, createWorkflowV2 } from "../domain/v2/factory";
import { startingTemplateChain, startingTemplateVisual } from "../domain/v2/startingTemplates";
import type { WorkflowEnvironment, WorkflowTemplateDetail, WorkflowTemplateSummary, WorkflowTool } from "../domain/v2/types";
import { unresolvedCapabilities, type CapabilityBinding, type UnresolvedCapability } from "../domain/v2/connectionReferences";
import { templateRequirements } from "../domain/v2/templateCapabilities";
import { WorkflowDialog } from "../editor/v2/WorkflowDialog";

const bindingKey = (item: UnresolvedCapability) => `${item.graphPath.join("/")}:${item.nodeId}`;
const starterIcons = { assistant: Bot, search: Wrench, triage: GitBranch, flow: GitBranch } as const;

/**
 * New-workflow chooser. Starter and Course templates both come from
 * `workflow_templates`; starter cards are server definitions, never bundled
 * product content. Course templates stay under "更多模板".
 */
export function WorkflowCreateDialog({ initialTemplate, courseLaunch = false, onClose, onCreated }: {
  initialTemplate?: WorkflowTemplateSummary; courseLaunch?: boolean; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [starterTemplates, setStarterTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [courseTemplates, setCourseTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [selected, setSelected] = useState<WorkflowTemplateSummary | null>(initialTemplate ?? null);
  const [name, setName] = useState(initialTemplate?.name ?? "新建工作流");
  const [search, setSearch] = useState(""), [templatesLoading, setTemplatesLoading] = useState(!courseLaunch), [templatesError, setTemplatesError] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState("");
  const [environments, setEnvironments] = useState<WorkflowEnvironment[]>([]), [environmentRef, setEnvironmentRef] = useState("");
  const [environmentTools, setEnvironmentTools] = useState<WorkflowTool[]>([]), [environmentError, setEnvironmentError] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const pending = useRef(false), creationId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (courseLaunch) { setTemplatesLoading(false); return; }
    let active = true;
    setTemplatesLoading(true); setTemplatesError("");
    void Promise.all([workflowApiV2.templates("starter"), workflowApiV2.templates("course")]).then(([starters, courses]) => {
      if (!active) return;
      setStarterTemplates(starters.items); setCourseTemplates(courses.items); setTemplatesError("");
    }).catch(reason => { if (active) setTemplatesError(workflowErrorMessage(reason)); }).finally(() => { if (active) setTemplatesLoading(false); });
    return () => { active = false; };
  }, [retry, courseLaunch]);

  useEffect(() => {
    let active = true;
    void workflowApiV2.environments().then(data => {
      if (!active) return;
      setEnvironments(data.items);
      setEnvironmentRef(current => current || data.items[0]?.environmentRef || "");
      setEnvironmentError("");
    }).catch(reason => { if (active) setEnvironmentError(workflowErrorMessage(reason)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!environmentRef) { setEnvironmentTools([]); return () => { active = false; }; }
    void workflowApiV2.tools(environmentRef).then(data => { if (active) setEnvironmentTools(data.items); }).catch(() => { if (active) setEnvironmentTools([]); });
    return () => { active = false; };
  }, [environmentRef]);

  useEffect(() => {
    let active = true;
    setDetail(null); setDetailError(""); setSelections({});
    if (!selected || courseLaunch) { setDetailLoading(false); return () => { active = false; }; }
    setDetailLoading(true);
    void workflowApiV2.template(selected.workflowId, selected.purpose).then(data => { if (active) setDetail(data); }).catch(reason => { if (active) setDetailError(workflowErrorMessage(reason)); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selected?.workflowId, selected?.purpose, courseLaunch]);

  const currentEnvironment = environments.find(item => item.environmentRef === environmentRef);
  const providerOptions = userModelProviders(currentEnvironment?.providers ?? []);
  const provider = firstUserModelProvider(currentEnvironment?.providers ?? []);
  const toolOptions = environmentTools.filter(tool => tool.available !== false);
  const unresolved = detail ? unresolvedCapabilities(detail.definition) : [];
  const isStarter = selected?.purpose === "starter";
  const bindingRequired = !courseLaunch && Boolean(selected) && !isStarter && unresolved.length > 0;
  const allBound = unresolved.every(item => Boolean(selections[bindingKey(item)]));
  const detailBlocked = !courseLaunch && Boolean(selected) && (detailLoading || Boolean(detailError));
  const canCreate = !busy && Boolean(name.trim()) && !detailBlocked && (!bindingRequired || (Boolean(environmentRef) && allBound));
  const requirements = selected ? templateRequirements(selected.workflowId) : [];
  const searchText = search.trim().toLocaleLowerCase();
  const visibleTemplates = courseTemplates.filter(item => `${item.name} ${item.description}`.toLocaleLowerCase().includes(searchText));

  // Starter templates are usable without a connection. Pre-select the current
  // environment's provider and HN search so the common path needs no extra click.
  useEffect(() => {
    if (!detail || selected?.purpose !== "starter" || courseLaunch) return;
    const missing = unresolvedCapabilities(detail.definition);
    if (!missing.length) return;
    setSelections(current => {
      const next = { ...current };
      let changed = false;
      for (const item of missing) {
        const key = bindingKey(item);
        if (next[key]) continue;
        if (item.kind === "provider" && provider) { next[key] = provider.ref; changed = true; }
        if (item.kind === "tool") {
          const tool = environmentTools.find(candidate => candidate.ref === "hn_search" && candidate.available !== false) ?? environmentTools.find(candidate => candidate.available !== false);
          if (tool) { next[key] = tool.ref; changed = true; }
        }
      }
      return changed ? next : current;
    });
  }, [detail, selected?.purpose, courseLaunch, provider, environmentTools]);

  function choose(template: WorkflowTemplateSummary | null) {
    setSelected(template); setName(template?.name ?? "新建工作流"); setError(""); creationId.current = crypto.randomUUID();
  }

  function selectedBinding(item: UnresolvedCapability): CapabilityBinding | null {
    const reference = selections[bindingKey(item)];
    if (!reference) return null;
    if (item.kind === "provider") {
      const found = providerOptions.find(candidate => candidate.ref === reference && candidate.modelRefs.length);
      if (!found) return null;
      return { ...item, reference, modelRef: found.modelRefs[0] };
    }
    const tool = environmentTools.find(candidate => candidate.ref === reference && candidate.available !== false);
    if (!tool) return null;
    return { ...item, reference, contractDigest: tool.contractDigest };
  }

  async function create() {
    if (pending.current || !name.trim()) return;
    if (detailBlocked) { setError("模板执行能力尚未读取完成，请先重试。"); return; }
    const resolved = unresolved.map(selectedBinding);
    if (bindingRequired && resolved.some(item => !item)) { setError("请先为模板的每一项执行能力选择连接。"); return; }
    const bindings = resolved.filter((item): item is CapabilityBinding => Boolean(item)).map(item => ({
      nodeId: item.nodeId, graphPath: item.graphPath, field: item.field, reference: item.reference,
      ...(item.modelRef ? { modelRef: item.modelRef } : {}), ...(item.contractDigest ? { contractDigest: item.contractDigest } : {}),
    }));
    pending.current = true; setBusy(true); setError("");
    try {
      if (selected) {
        const receipt = await workflowApiV2.useTemplate(selected.workflowId, { name: name.trim(), fresh: !courseLaunch, creationId: creationId.current, ...(bindings.length ? { environmentRef, bindings } : {}) });
        onCreated(receipt.workflowId);
      } else {
        const base = createWorkflowV2(name.trim());
        const receipt = await workflowApiV2.create(base, createEditorV2(base), creationId.current);
        onCreated(receipt.workflowId);
      }
    } catch (reason) { setError(workflowErrorMessage(reason)); }
    finally { pending.current = false; setBusy(false); }
  }

  const starterOptions = starterTemplates.map(template => {
    const visual = startingTemplateVisual(template.definition);
    const Icon = starterIcons[visual];
    return <button type="button" key={template.workflowId} className={`wf-template-option ${selected?.workflowId === template.workflowId ? "selected" : ""}`} aria-pressed={selected?.workflowId === template.workflowId} onClick={() => choose(template)}>
      <Icon size={20}/><span><strong>{template.name}</strong><small>{startingTemplateChain(template.definition)} · {template.description}</small></span>
    </button>;
  });

  return <WorkflowDialog title={courseLaunch ? "从实训模板创建工作流" : "新建工作流"} error={error} className="wf-library-dialog wf-create-dialog" onClose={() => { if (!pending.current) onClose(); }}>
    <p className="wf-dialog-intro">选择空白画布或起步流程，创建后可继续编辑。</p>
    <fieldset disabled={busy} className="wf-create-options">
      {!courseLaunch ? <button type="button" className={`wf-template-option ${!selected ? "selected" : ""}`} aria-pressed={!selected} onClick={() => choose(null)}><FilePlus2 size={22}/><span><strong>空白工作流</strong><small>只有入口和结束，从头搭建自己的流程。</small></span></button> : null}
      {!courseLaunch ? <div className="wf-starter-section">
        <h3 className="wf-template-section-title">起步模板</h3>
        {templatesLoading ? <div className="wf-template-skeleton" role="status"><Loader2 size={15}/>正在加载起步模板…</div> : null}
        {templatesError ? <div className="wf-template-load-error" role="alert"><p>模板暂时无法加载：{templatesError}</p><button type="button" onClick={() => { setTemplatesLoading(true); setRetry(value => value + 1); }}>重新加载模板</button><p>仍可创建空白工作流。</p></div> : null}
        {!templatesLoading && !templatesError ? (starterOptions.length ? <div className="wf-starter-picks" aria-label="起步模板">{starterOptions}</div> : <p role="status">暂时没有起步模板，可从空白开始。</p>) : null}
      </div> : null}
      {!courseLaunch ? <label className="wf-template-search"><Search size={16}/><input aria-label="搜索模板" placeholder="搜索更多模板" value={search} onChange={e => setSearch(e.target.value)}/></label> : null}
      {!courseLaunch ? <details className="wf-more-templates">
        <summary><ChevronRight size={15} aria-hidden="true"/><span><strong>更多模板</strong><small>课程模板</small></span><small>{templatesLoading ? "加载中…" : `${visibleTemplates.length} 个`}</small></summary>
        <div className="wf-more-templates-body">
          {templatesLoading ? <div className="wf-template-skeleton" role="status"><Loader2 size={15}/>正在加载模板…</div> : null}
          {templatesError ? <div className="wf-template-load-error" role="alert"><p>课程模板暂时无法加载。</p><button type="button" onClick={() => { setTemplatesLoading(true); setRetry(value => value + 1); }}>重新加载模板</button></div> : null}
          <div className="wf-template-grid" aria-label="更多模板">{visibleTemplates.map(template => <button type="button" key={template.workflowId} className={`wf-template-option ${selected?.workflowId === template.workflowId ? "selected" : ""}`} aria-pressed={selected?.workflowId === template.workflowId} onClick={() => choose(template)}><GitBranch size={20}/><span><strong>{template.name}</strong><small>{template.description}</small><em>创建后可在画布中查看与编辑</em></span></button>)}</div>
          {!templatesLoading && !templatesError && !visibleTemplates.length ? <p role="status">没有匹配的模板，试试其他关键词。</p> : null}
        </div>
      </details> : null}
      {courseLaunch && initialTemplate ? <div className="wf-template-grid" aria-label="实训模板"><button type="button" className="wf-template-option selected" aria-pressed="true"><GitBranch size={20}/><span><strong>{initialTemplate.name}</strong><small>{initialTemplate.description}</small></span></button></div> : null}
      {requirements.length ? <section className="wf-field-note" aria-label="模板执行能力"><strong>这个模板需要</strong><ul>{requirements.map(item => <li key={`${item.kind}:${item.label}`}>{item.kind === "model" ? "模型" : "工具"} · {item.label}<small>：{item.detail}</small></li>)}</ul><small>创建时绑定当前账号的连接；缺少能力时不能创建。</small></section> : null}
      {!courseLaunch && selected && (detailLoading || detailError || unresolved.length) ? <section className="wf-field-note" aria-label="绑定执行能力">
        <strong>绑定执行能力</strong>
        {detailLoading ? <p role="status">正在读取模板定义…</p> : null}
        {detailError ? <p role="alert">无法读取模板定义：{detailError}</p> : null}
        {!detailLoading && !detailError ? <>
          <p>{unresolved.length} 项{isStarter ? "可绑定" : "需要绑定"}到当前账号；绑定只写入你的副本。</p>
          {environmentError ? <p role="alert">工作流服务暂时不可用，无法校验连接。</p> : null}
          {unresolved.map(item => <label key={bindingKey(item)}>{item.kind === "provider" ? "模型" : "工具"} · {item.label}
            <select aria-label={`为 ${item.label} 选择执行能力`} value={selections[bindingKey(item)] ?? ""} onChange={event => setSelections(current => ({ ...current, [bindingKey(item)]: event.target.value }))}>
              <option value="">选择{item.kind === "provider" ? "模型连接" : "工具连接"}</option>
              {item.kind === "provider" ? providerOptions.map(provider => <option key={provider.ref} value={provider.ref}>{provider.name}{provider.version ? ` · v${provider.version}` : ""}</option>) : toolOptions.map(tool => <option key={tool.ref} value={tool.ref}>{tool.name}{tool.version ? ` · v${tool.version}` : ""}</option>)}
            </select>
            {(item.kind === "provider" ? providerOptions : toolOptions).length ? null : <small>当前账号没有可用{item.kind === "provider" ? "模型连接" : "工具连接"}；请先在资源中心配置。</small>}
          </label>)}
          {!environmentRef ? <small>工作流服务暂时不可用，无法创建带模板的工作流。</small> : null}
          {bindingRequired && environmentRef && !allBound ? <small>请为每一项选择连接后再创建。</small> : null}
          {!bindingRequired && isStarter ? <small>可先绑定当前连接，也可创建后在画布中配置。</small> : null}
        </> : null}
      </section> : null}
      <label className="wf-dialog-name">工作流名称<input autoComplete="off" maxLength={120} value={name} onChange={e => { setName(e.target.value); creationId.current = crypto.randomUUID(); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void create(); } }}/></label>
    </fieldset>
    <footer className="wf-dialog-actions"><button disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={!canCreate} onClick={() => void create()}>{busy ? "正在创建…" : "创建并打开画布"}</button></footer>
  </WorkflowDialog>;
}
