import { useEffect, useRef, useState } from "react";
import { FilePlus2, GitBranch, Search } from "lucide-react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import { createEditorV2, createWorkflowV2 } from "../domain/v2/factory";
import type { WorkflowEnvironment, WorkflowTemplateDetail, WorkflowTemplateSummary, WorkflowTool } from "../domain/v2/types";
import { unresolvedCapabilities, type CapabilityBinding, type UnresolvedCapability } from "../domain/v2/connectionReferences";
import { templateRequirements } from "../domain/v2/templateCapabilities";
import { WorkflowDialog } from "../editor/v2/WorkflowDialog";

const bindingKey = (item: UnresolvedCapability) => `${item.graphPath.join("/")}:${item.nodeId}`;

export function WorkflowCreateDialog({ initialTemplate, courseLaunch = false, onClose, onCreated }: {
  initialTemplate?: WorkflowTemplateSummary; courseLaunch?: boolean; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>(initialTemplate ? [initialTemplate] : []);
  const [selected, setSelected] = useState<WorkflowTemplateSummary | null>(initialTemplate ?? null);
  const [name, setName] = useState(initialTemplate?.name ?? "新建工作流");
  const [search, setSearch] = useState(""), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState("");
  const [environments, setEnvironments] = useState<WorkflowEnvironment[]>([]), [environmentRef, setEnvironmentRef] = useState("");
  const [environmentTools, setEnvironmentTools] = useState<WorkflowTool[]>([]), [environmentError, setEnvironmentError] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const pending = useRef(false), creationId = useRef(crypto.randomUUID());

  useEffect(() => {
    let active = true;
    void workflowApiV2.templates().then(data => { if (active) { setTemplates(data.items); setLoadError(""); } }).catch(reason => { if (active) setLoadError(workflowErrorMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

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
    void workflowApiV2.template(selected.workflowId).then(data => { if (active) setDetail(data); }).catch(reason => { if (active) setDetailError(workflowErrorMessage(reason)); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selected?.workflowId, courseLaunch]);

  function choose(template: WorkflowTemplateSummary | null) {
    setSelected(template); setName(template?.name ?? "新建工作流"); setError(""); creationId.current = crypto.randomUUID();
  }

  const currentEnvironment = environments.find(item => item.environmentRef === environmentRef);
  const providerOptions = currentEnvironment?.providers.filter(provider => provider.modelRefs.length > 0) ?? [];
  const toolOptions = environmentTools.filter(tool => tool.available !== false);
  const unresolved = detail ? unresolvedCapabilities(detail.definition) : [];
  const needsBinding = !courseLaunch && Boolean(selected) && Boolean(detail) && unresolved.length > 0;
  const allBound = unresolved.every(item => Boolean(selections[bindingKey(item)]));
  const detailBlocked = !courseLaunch && Boolean(selected) && (detailLoading || Boolean(detailError));
  const canCreate = !busy && Boolean(name.trim()) && !detailBlocked && (!needsBinding || (Boolean(environmentRef) && allBound));
  const requirements = selected ? templateRequirements(selected.workflowId) : [];

  function selectedBinding(item: UnresolvedCapability): CapabilityBinding | null {
    const reference = selections[bindingKey(item)];
    if (!reference) return null;
    if (item.kind === "provider") {
      const provider = currentEnvironment?.providers.find(candidate => candidate.ref === reference && candidate.modelRefs.length);
      if (!provider) return null;
      return { ...item, reference, modelRef: provider.modelRefs[0] };
    }
    const tool = environmentTools.find(candidate => candidate.ref === reference && candidate.available !== false);
    if (!tool) return null;
    return { ...item, reference, contractDigest: tool.contractDigest };
  }

  async function create() {
    if (pending.current || !name.trim()) return;
    if (detailBlocked) { setError("模板执行能力尚未读取完成，请先重试。"); return; }
    const resolved = unresolved.map(selectedBinding);
    if (needsBinding && resolved.some(item => !item)) { setError("请先为模板的每一项执行能力选择连接。"); return; }
    const bindings = resolved.filter((item): item is CapabilityBinding => Boolean(item)).map(item => ({
      nodeId: item.nodeId, graphPath: item.graphPath, field: item.field, reference: item.reference,
      ...(item.modelRef ? { modelRef: item.modelRef } : {}), ...(item.contractDigest ? { contractDigest: item.contractDigest } : {}),
    }));
    pending.current = true; setBusy(true); setError("");
    try {
      const definition = createWorkflowV2(name.trim());
      const receipt = selected
        ? await workflowApiV2.useTemplate(selected.workflowId, { name: name.trim(), fresh: !courseLaunch, creationId: creationId.current, ...(bindings.length ? { environmentRef, bindings } : {}) })
        : await workflowApiV2.create(definition, createEditorV2(definition), creationId.current);
      onCreated(receipt.workflowId);
    } catch (reason) { setError(workflowErrorMessage(reason)); }
    finally { pending.current = false; setBusy(false); }
  }

  const visible = templates.filter(item => `${item.name} ${item.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <WorkflowDialog title={courseLaunch ? "从实训模板创建工作流" : "新建工作流"} error={error} className="wf-library-dialog wf-create-dialog" onClose={() => { if (!pending.current) onClose(); }}>
    <p className="wf-dialog-intro">选择空白画布或起步模板，创建后可继续编辑。</p>
    <fieldset disabled={busy} className="wf-create-options">
      {!courseLaunch ? <button type="button" className={`wf-template-option ${selected === null ? "selected" : ""}`} aria-pressed={selected === null} onClick={() => choose(null)}><FilePlus2 size={22}/><span><strong>空白工作流</strong><small>只有入口和结束，从头搭建自己的流程。</small></span></button> : null}
      {!courseLaunch ? <label className="wf-template-search"><Search size={16}/><input aria-label="搜索模板" placeholder="搜索起步模板" value={search} onChange={e => setSearch(e.target.value)}/></label> : null}
      {loading ? <p role="status">正在加载模板…</p> : null}
      {loadError ? <div role="alert"><p>模板暂时无法加载：{loadError}</p><button type="button" onClick={() => { setLoading(true); setRetry(v => v + 1); }}>重新加载模板</button><p>仍可创建空白工作流。</p></div> : null}
      <div className="wf-template-grid" aria-label="起步模板">{(courseLaunch && initialTemplate ? [initialTemplate] : visible).map(template => <button type="button" key={template.workflowId} className={`wf-template-option ${selected?.workflowId === template.workflowId ? "selected" : ""}`} aria-pressed={selected?.workflowId === template.workflowId} onClick={() => choose(template)}><GitBranch size={20}/><span><strong>{template.name}</strong><small>{template.description}</small><em>创建后可在画布中查看与编辑</em></span></button>)}</div>
      {!loading && !loadError && !visible.length && !courseLaunch ? <p role="status">没有匹配的模板，试试其他关键词。</p> : null}
      {requirements.length ? <section className="wf-field-note" aria-label="模板执行能力"><strong>这个模板需要</strong><ul>{requirements.map(item => <li key={`${item.kind}:${item.label}`}>{item.kind === "model" ? "模型" : "工具"} · {item.label}<small>：{item.detail}</small></li>)}</ul><small>创建时绑定当前账号的连接；缺少能力时不能创建。</small></section> : null}
      {!courseLaunch && selected && (detailLoading || detailError || unresolved.length) ? <section className="wf-field-note" aria-label="绑定执行能力">
        <strong>绑定执行能力</strong>
        {detailLoading ? <p role="status">正在读取模板定义…</p> : null}
        {detailError ? <p role="alert">无法读取模板定义：{detailError}</p> : null}
        {!detailLoading && !detailError ? <>
          <p>{unresolved.length} 项需要绑定到当前账号；绑定只写入你的副本。</p>
          {environmentError ? <p role="alert">工作流服务暂时不可用，无法校验连接。</p> : null}
          {unresolved.map(item => <label key={bindingKey(item)}>{item.kind === "provider" ? "模型" : "工具"} · {item.label}
            <select aria-label={`为 ${item.label} 选择执行能力`} value={selections[bindingKey(item)] ?? ""} onChange={event => setSelections(current => ({ ...current, [bindingKey(item)]: event.target.value }))}>
              <option value="">选择{item.kind === "provider" ? "模型连接" : "工具连接"}</option>
              {item.kind === "provider" ? providerOptions.map(provider => <option key={provider.ref} value={provider.ref}>{provider.name}{provider.version ? ` · v${provider.version}` : ""}</option>) : toolOptions.map(tool => <option key={tool.ref} value={tool.ref}>{tool.name}{tool.version ? ` · v${tool.version}` : ""}</option>)}
            </select>
            {(item.kind === "provider" ? providerOptions : toolOptions).length ? null : <small>当前账号没有可用{item.kind === "provider" ? "模型连接" : "工具连接"}；请先在资源中心配置。</small>}
          </label>)}
          {!environmentRef ? <small>工作流服务暂时不可用，无法创建带模板的工作流。</small> : null}
          {environmentRef && !allBound ? <small>请为每一项选择连接后再创建。</small> : null}
        </> : null}
      </section> : null}
      <label className="wf-dialog-name">工作流名称<input autoComplete="off" maxLength={120} value={name} onChange={e => { setName(e.target.value); creationId.current = crypto.randomUUID(); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void create(); } }}/></label>
    </fieldset>
    <footer className="wf-dialog-actions"><button disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={!canCreate} onClick={() => void create()}>{busy ? "正在创建…" : "创建并打开画布"}</button></footer>
  </WorkflowDialog>;
}
