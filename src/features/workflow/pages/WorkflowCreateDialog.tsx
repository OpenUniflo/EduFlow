import { useEffect, useRef, useState } from "react";
import { FilePlus2, GitBranch, Search } from "lucide-react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import { createEditorV2, createWorkflowV2 } from "../domain/v2/factory";
import type { WorkflowTemplateSummary } from "../domain/v2/types";
import { templateRequirements } from "../domain/v2/templateCapabilities";
import { WorkflowDialog } from "../editor/v2/WorkflowDialog";

export function WorkflowCreateDialog({ initialTemplate, courseLaunch = false, onClose, onCreated }: {
  initialTemplate?: WorkflowTemplateSummary; courseLaunch?: boolean; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>(initialTemplate ? [initialTemplate] : []);
  const [selected, setSelected] = useState<WorkflowTemplateSummary | null>(initialTemplate ?? null);
  const [name, setName] = useState(initialTemplate?.name ?? "新建工作流");
  const [search, setSearch] = useState(""), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const pending = useRef(false), creationId = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    void workflowApiV2.templates().then(data => { if (active) { setTemplates(data.items); setLoadError(""); } }).catch(reason => { if (active) setLoadError(workflowErrorMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  function choose(template: WorkflowTemplateSummary | null) {
    setSelected(template); setName(template?.name ?? "新建工作流"); setError(""); creationId.current = crypto.randomUUID();
  }
  async function create() {
    if (pending.current || !name.trim()) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const definition = createWorkflowV2(name.trim());
      const receipt = selected
        ? await workflowApiV2.useTemplate(selected.workflowId, { name: name.trim(), fresh: !courseLaunch, creationId: creationId.current })
        : await workflowApiV2.create(definition, createEditorV2(definition), creationId.current);
      onCreated(receipt.workflowId);
    } catch (reason) { setError(workflowErrorMessage(reason)); }
    finally { pending.current = false; setBusy(false); }
  }
  const visible = templates.filter(item => `${item.name} ${item.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const requirements = selected ? templateRequirements(selected.workflowId) : [];
  return <WorkflowDialog title={courseLaunch ? "从实训模板创建工作流" : "新建工作流"} error={error} className="wf-library-dialog wf-create-dialog" onClose={() => { if (!pending.current) onClose(); }}>
    <p className="wf-dialog-intro">选择空白画布或起步模板，创建后可继续编辑。</p>
    <fieldset disabled={busy} className="wf-create-options">
      {!courseLaunch ? <button type="button" className={`wf-template-option ${selected === null ? "selected" : ""}`} aria-pressed={selected === null} onClick={() => choose(null)}><FilePlus2 size={22}/><span><strong>空白工作流</strong><small>只有入口和结束，从头搭建自己的流程。</small></span></button> : null}
      {!courseLaunch ? <label className="wf-template-search"><Search size={16}/><input aria-label="搜索模板" placeholder="搜索起步模板" value={search} onChange={e => setSearch(e.target.value)}/></label> : null}
      {loading ? <p role="status">正在加载模板…</p> : null}
      {loadError ? <div role="alert"><p>模板暂时无法加载：{loadError}</p><button type="button" onClick={() => { setLoading(true); setRetry(v => v + 1); }}>重新加载模板</button><p>仍可创建空白工作流。</p></div> : null}
      <div className="wf-template-grid" aria-label="起步模板">{(courseLaunch && initialTemplate ? [initialTemplate] : visible).map(template => <button type="button" key={template.workflowId} className={`wf-template-option ${selected?.workflowId === template.workflowId ? "selected" : ""}`} aria-pressed={selected?.workflowId === template.workflowId} onClick={() => choose(template)}><GitBranch size={20}/><span><strong>{template.name}</strong><small>{template.description}</small><em>创建后可在画布中查看与编辑</em></span></button>)}</div>
      {!loading && !loadError && !visible.length && !courseLaunch ? <p role="status">没有匹配的模板，试试其他关键词。</p> : null}
      {requirements.length ? <section className="wf-field-note" aria-label="模板执行能力"><strong>这个模板需要</strong><ul>{requirements.map(item => <li key={`${item.kind}:${item.label}`}>{item.kind === "model" ? "模型" : "工具"} · {item.label}<small>：{item.detail}</small></li>)}</ul><small>创建后在画布绑定当前账号的连接；缺少能力时运行前会提示。</small></section> : null}
      <label className="wf-dialog-name">工作流名称<input autoComplete="off" maxLength={120} value={name} onChange={e => { setName(e.target.value); creationId.current = crypto.randomUUID(); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void create(); } }}/></label>
    </fieldset>
    <footer className="wf-dialog-actions"><button disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? "正在创建…" : "创建并打开画布"}</button></footer>
  </WorkflowDialog>;
}
