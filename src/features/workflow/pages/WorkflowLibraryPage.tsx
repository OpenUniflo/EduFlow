import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, GitBranch, MoreHorizontal, Plus, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { WorkflowDeleteImpact, WorkflowLibraryPage as LibraryPage, WorkflowSummaryV2 } from "../domain/v2/types";
import type { CourseRepository } from "@/features/course/repository/CourseRepository";
import type { LearningProgressRepository } from "@/features/learning/progress/LearningProgressRepository";
import { WorkflowDialog } from "../editor/v2/WorkflowDialog";
import { WorkflowCreateDialog } from "./WorkflowCreateDialog";
import "../editor/v2/workflowV2.css";

type Action = { kind: "rename" | "copy" | "delete"; item: WorkflowSummaryV2 };
const scrollPositions = new Map<string, number>();
export function WorkflowLibraryPage({ navigation, userId, onOpenWorkflow }: { navigation: ReactNode; userId: string; courseRepository: CourseRepository; learningProgressRepository: LearningProgressRepository; onOpenWorkflow: (id: string, returnTo?: string) => void }) {
  const [params, setParams] = useSearchParams();
  const search = (params.get("q") ?? "").slice(0, 200), scope = params.get("scope") === "course" ? "course" : params.get("scope") === "personal" ? "personal" : "all";
  const sort = params.get("sort") === "name" ? "name" : "updated", page = Math.max(1, Math.min(1000000, Number(params.get("page")) || 1)), pageSize = params.get("size") === "24" ? 24 : 12;
  const [data, setData] = useState<LibraryPage | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [retry, setRetry] = useState(0), [creating, setCreating] = useState(false), [action, setAction] = useState<Action | null>(null), [menu, setMenu] = useState<string | null>(null), [notice, setNotice] = useState("");
  const root = useRef<HTMLElement>(null), returnTo = `/workflows${params.size ? `?${params}` : ""}`, scrollKey = `${userId}:${returnTo}`;
  useEffect(() => {
    if (!menu) return;
    function outside(event: PointerEvent) { if (!(event.target instanceof Element) || !event.target.closest(".wf-card-menu")) setMenu(null); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setMenu(null); root.current?.querySelector<HTMLButtonElement>(`[aria-expanded="true"]`)?.focus(); } }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [menu]);
  function change(key: string, value: string) { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.delete("page"); setParams(next, { replace: true }); setMenu(null); }
  useEffect(() => {
    let active = true;
    void workflowApiV2.listPage({ search, scope, sort, page: Math.floor(page), pageSize }).then(result => {
      if (!active) return;
      setData(result); setError("");
    }).catch(reason => { if (active) setError(workflowErrorMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, scope, sort, page, pageSize, retry]);
  useEffect(() => { if (data && !loading) { const frame = requestAnimationFrame(() => { if (root.current) root.current.scrollTop = scrollPositions.get(scrollKey) ?? 0; }); return () => cancelAnimationFrame(frame); } }, [data, loading, scrollKey]);
  function refresh(message: string) { setNotice(message); setLoading(true); setAction(null); setRetry(v => v + 1); }
  function open(item: WorkflowSummaryV2) { scrollPositions.set(scrollKey, root.current?.scrollTop ?? 0); onOpenWorkflow(item.workflowId, returnTo); }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  return <main ref={root} className="atlas-page-shell wf-library-page" onScroll={e => scrollPositions.set(scrollKey, e.currentTarget.scrollTop)}>{navigation}<div className="wf-library-content">
    <header className="wf-library-hero"><div><small>工作流空间</small><h1>工作流</h1><p>管理你的工作流，从空白或模板开始搭建。</p></div><button className="primary" onClick={() => setCreating(true)}><Plus size={18}/>新建工作流</button></header>
    <section className="wf-library-browser" aria-label="工作流库">
      <div className="wf-library-search"><label><Search size={17}/><input aria-label="搜索工作流" placeholder="搜索名称或描述" maxLength={200} value={search} onChange={e => { setLoading(true); change("q", e.target.value); }}/></label><select aria-label="工作流范围" value={scope} onChange={e => { setLoading(true); change("scope", e.target.value); }}><option value="all">全部工作流</option><option value="personal">独立工作流</option><option value="course">课程模板来源</option></select><select aria-label="工作流排序" value={sort} onChange={e => { setLoading(true); change("sort", e.target.value); }}><option value="updated">最近更新</option><option value="name">名称</option></select></div>
      {notice ? <p role="status" className="wf-library-notice">{notice}</p> : null}
      {error ? <div role="alert"><p>{error}</p><button onClick={() => { setLoading(true); setRetry(v => v + 1); }}>重试</button></div> : loading ? <p role="status" className="wf-library-pending">正在加载工作流…</p> : data ? <>
        <div className="wf-library-count">共 {data.total} 个工作流{data.total ? ` · 第 ${(data.page - 1) * pageSize + 1}–${Math.min(data.page * pageSize, data.total)} 个` : ""}</div>
        <div className="wf-v2-library-grid">{data.items.map(item => <article key={item.workflowId} className="wf-v2-library-card">
          <div className="wf-card-heading"><GitBranch size={21}/><div className="wf-card-menu"><button aria-label={`管理 ${item.name}`} aria-expanded={menu === item.workflowId} onClick={() => setMenu(menu === item.workflowId ? null : item.workflowId)}><MoreHorizontal size={19}/></button>{menu === item.workflowId ? <div className="wf-card-actions" onKeyDown={e => { if (e.key === "Escape") { e.currentTarget.closest(".wf-card-menu")?.querySelector<HTMLButtonElement>("button")?.focus(); setMenu(null); e.stopPropagation(); } }}>{(["rename", "copy", "delete"] as const).map(kind => <button key={kind} className={kind === "delete" ? "danger" : ""} onClick={e => { e.currentTarget.closest(".wf-card-menu")?.querySelector<HTMLButtonElement>("button")?.focus(); setAction({ kind, item }); setMenu(null); }}>{kind === "rename" ? "重命名" : kind === "copy" ? "复制" : "删除"}</button>)}</div> : null}</div></div>
          <button className="wf-card-open" onClick={() => open(item)}><small title={item.sourceName ?? "独立工作流"}>{item.sourceName ? `模板：${item.sourceName}` : "独立工作流"}</small><h2 title={item.name}>{item.name}</h2><p>{item.description || "打开画布，配置节点与执行路径。"}</p><footer><span>{item.nodeCount ?? 0} 个节点 · 保存版本 {item.revision}</span><ArrowRight size={16}/></footer></button>
          <time className="wf-card-time" dateTime={item.updatedAt}>更新于 {item.updatedAt ? new Date(item.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "未知"}</time>
        </article>)}</div>
        {!data.items.length ? <div className="wf-library-empty"><GitBranch size={34}/><h2>{search || scope !== "all" ? "没有匹配的工作流" : "创建你的第一个工作流"}</h2><p>{search || scope !== "all" ? "调整搜索词或范围后再试。" : "选择空白画布或起步模板，开始搭建。"}</p>{search || scope !== "all" ? <button onClick={() => { setLoading(true); setParams({}, { replace: true }); }}>清除筛选</button> : <button onClick={() => setCreating(true)}>新建工作流</button>}</div> : null}
        <nav className="wf-library-pagination" aria-label="工作流分页"><label>每页 <select aria-label="每页数量" value={pageSize} onChange={e => { setLoading(true); change("size", e.target.value); }}><option value="12">12 条</option><option value="24">24 条</option></select></label><span>第 {data.page} / {pages} 页</span><button disabled={data.page <= 1} onClick={() => { setLoading(true); change("page", String(data.page - 1)); }}>上一页</button><button disabled={data.page >= pages} onClick={() => { setLoading(true); change("page", String(data.page + 1)); }}>下一页</button></nav>
      </> : null}
    </section>
  </div>{creating ? <WorkflowCreateDialog onClose={() => setCreating(false)} onCreated={id => onOpenWorkflow(id, returnTo)}/> : null}{action ? <WorkflowLibraryAction key={`${action.kind}:${action.item.workflowId}`} action={action} onClose={() => { setAction(null); setRetry(v => v + 1); }} onDone={refresh}/> : null}</main>;
}

function WorkflowLibraryAction({ action: { kind, item }, onClose, onDone }: { action: Action; onClose: () => void; onDone: (message: string) => void }) {
  const [name, setName] = useState(kind === "copy" ? `${item.name.slice(0, 117)} 副本` : item.name), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState<WorkflowDeleteImpact | null>(null), [retry, setRetry] = useState(0);
  const pending = useRef(false), creationId = useRef(crypto.randomUUID());
  useEffect(() => {
    if (kind !== "delete") return;
    let active = true;
    void workflowApiV2.deleteImpact(item.workflowId).then(value => { if (active) { setImpact(value); setError(""); } }).catch(reason => { if (active) setError(workflowErrorMessage(reason)); });
    return () => { active = false; };
  }, [kind, item.workflowId, retry]);
  async function submit() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (kind === "delete") await workflowApiV2.remove(item.workflowId, impact!.revision);
      else if (kind === "rename") await workflowApiV2.rename(item.workflowId, item.revision, name.trim());
      else await workflowApiV2.copy(item.workflowId, item.revision, name.trim(), creationId.current);
      onDone(kind === "delete" ? "工作流已删除。" : kind === "rename" ? "名称已更新。" : "副本已创建，可在列表中打开。若未显示，请检查当前筛选条件。");
    } catch (reason) { setError(workflowErrorMessage(reason)); }
    finally { pending.current = false; setBusy(false); }
  }
  const title = kind === "delete" ? "删除工作流" : kind === "rename" ? "重命名工作流" : "复制工作流";
  return <WorkflowDialog title={title} className="wf-library-dialog wf-action-dialog" error={error} onClose={() => { if (!pending.current) onClose(); }}>
    {kind === "delete" ? <><p>确定删除“{item.name}”？此操作不可恢复。</p>{impact ? <p>将删除 {impact.revisions} 个版本及 {impact.runs} 条运行记录和调试详情。共享模板、课程实训和已有学习证据会保留。</p> : !error ? <p role="status">正在检查删除范围…</p> : <button onClick={() => setRetry(v => v + 1)}>重新检查</button>}{impact?.activeRuns ? <p role="alert">当前有 {impact.activeRuns} 条运行尚未结束，请结束后再删除。</p> : null}</> : <><p>{kind === "copy" ? "复制当前保存的节点配置和布局，运行记录不会复制。" : "更新名称会创建一个新修订，已有运行记录会保留。"}</p><label className="wf-dialog-name">工作流名称<input disabled={busy} maxLength={120} value={name} onChange={e => { setName(e.target.value); creationId.current = crypto.randomUUID(); }} onKeyDown={e => { if (e.key === "Enter" && name.trim()) void submit(); }}/></label></>}
    <footer className="wf-dialog-actions"><button disabled={busy} onClick={onClose}>取消</button><button className={kind === "delete" ? "danger" : "primary"} disabled={busy || (kind === "delete" ? !impact || !!impact.activeRuns : !name.trim())} onClick={() => void submit()}>{busy ? "正在处理…" : kind === "delete" ? "确认删除" : kind === "copy" ? "创建副本" : "保存名称"}</button></footer>
  </WorkflowDialog>;
}
