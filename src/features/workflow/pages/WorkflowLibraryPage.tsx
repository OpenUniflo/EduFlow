import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Clock3, FileText, FolderOpen, GitBranch, History, Link2, MoreHorizontal, Paperclip, Plus, Search, X } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { WorkflowDeleteImpact, WorkflowLibraryPage as LibraryPage, WorkflowSummaryV2 } from "../domain/v2/types";
import type { MyPracticeSubmission, PracticeSubmissionStatus } from "@/shared/learning/practiceSubmission";
import { Button } from "@/shared/ui/Button";
import { Pill, PreviewBadge, TextField, type PillTone } from "@/shared/ui";
import { WorkflowDialog } from "../editor/v2/WorkflowDialog";
import { WorkflowCreateDialog } from "./WorkflowCreateDialog";
import type { WorkflowVersionPreview } from "./worksPreview";
import { thumbnailNodes } from "./worksThumbnail";
import "./worksOverview.css";

type WorksTab = "all" | "workflow" | "practice";
type WorksSort = "updated" | "name";
type Action = { kind: "rename" | "copy" | "delete"; item: WorkflowSummaryV2 };
type WorksItem = { kind: "workflow"; item: WorkflowSummaryV2 } | { kind: "practice"; item: MyPracticeSubmission };
const scrollPositions = new Map<string, number>();
const tabItems: { id: WorksTab; label: string }[] = [{ id: "all", label: "全部" }, { id: "workflow", label: "工作流" }, { id: "practice", label: "实践提交" }];
const statusTone: Record<PracticeSubmissionStatus, { label: string; tone: PillTone }> = {
  draft: { label: "草稿", tone: "quiet" },
  submitted: { label: "审核中", tone: "warn" },
  needs_revision: { label: "需修改", tone: "warn" },
  accepted: { label: "已通过", tone: "ok" },
};
const nodeTone: Record<string, string> = {
  "core.start": "target",
  "core.end": "pending",
  "core.llm": "brand",
  "core.tool": "cyan",
  "core.router": "orange",
  "core.transform": "acquired",
};

function formatTime(value?: string) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function timestamp(value?: string) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function workflowSource(item: WorkflowSummaryV2) {
  return item.sourceTemplateId ? `课程模板${item.sourceName ? `：${item.sourceName}` : ""}` : "独立作品";
}

function workflowStatus(item: WorkflowSummaryV2): { label: string; tone: PillTone } {
  if (item.group === "test") return { label: "测试", tone: "warn" };
  if (item.sourceTemplateId) return { label: "模板", tone: "brand" };
  return { label: "草稿", tone: "quiet" };
}

function practiceAttemptMeta(item: MyPracticeSubmission) {
  if (item.attemptNumber === null) return item.status === "draft" ? "尚未提交" : "提交记录";
  return `第 ${item.attemptNumber} 次`;
}

function practiceAttemptThumbnail(item: MyPracticeSubmission) {
  if (item.attemptNumber === null) return item.status === "draft" ? "尚未提交" : "提交记录";
  return `第 ${item.attemptNumber} 次提交`;
}

function practiceMetaParts(item: MyPracticeSubmission) {
  return {
    copy: item.courseTitle,
    tail: [item.chapterNumber ? `第 ${item.chapterNumber} 章` : null, practiceAttemptMeta(item), typeof item.score === "number" ? `${item.score} 分` : null].filter(Boolean).join(" · ")
  };
}

function practiceContentSummary(item: MyPracticeSubmission) {
  const content = item.content;
  if (!content) return { Icon: FileText, summary: "" };
  if (content.fileName) return { Icon: Paperclip, summary: content.attachmentCount > 1 ? `${content.fileName} 等 ${content.attachmentCount} 份` : content.fileName };
  if (content.linkDomain) return { Icon: Link2, summary: content.linkDomain };
  if (content.attachmentCount) return { Icon: Paperclip, summary: `${content.attachmentCount} 份交付物` };
  if (content.text) return { Icon: FileText, summary: content.text };
  if (content.kind === "workflow") return { Icon: GitBranch, summary: "" };
  if (content.kind === "code") return { Icon: Paperclip, summary: "" };
  return { Icon: FileText, summary: "" };
}

function compareItems(left: WorksItem, right: WorksItem, sort: WorksSort) {
  if (sort === "name") {
    const leftName = left.kind === "workflow" ? left.item.name : left.item.assignmentTitle;
    const rightName = right.kind === "workflow" ? right.item.name : right.item.assignmentTitle;
    const byName = leftName.localeCompare(rightName, "zh-CN");
    if (byName !== 0) return byName;
  }
  const byTime = timestamp(right.item.updatedAt) - timestamp(left.item.updatedAt);
  if (byTime !== 0) return byTime;
  return (left.kind === "workflow" ? left.item.workflowId : `${left.item.courseId}:${left.item.assignmentId}`).localeCompare(right.kind === "workflow" ? right.item.workflowId : `${right.item.courseId}:${right.item.assignmentId}`);
}

async function loadAllWorkflows() {
  const items: WorkflowSummaryV2[] = [];
  for (let page = 1; ; page += 1) {
    const result: LibraryPage = await workflowApiV2.listPage({ search: "", scope: "all", sort: "updated", page, pageSize: 48 });
    items.push(...result.items);
    if (!result.items.length || items.length >= result.total) return items;
  }
}

type PracticeSubmissionSource = { listMyPracticeSubmissions(): Promise<{ items: MyPracticeSubmission[] }> };

export function WorkflowLibraryPage({ userId, learnerStateService, onOpenWorkflow, versionPreviews = [] }: { userId: string; learnerStateService: PracticeSubmissionSource; onOpenWorkflow: (id: string, returnTo?: string) => void; versionPreviews?: readonly WorkflowVersionPreview[] }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const search = (params.get("q") ?? "").slice(0, 200);
  const tab: WorksTab = params.get("type") === "workflow" ? "workflow" : params.get("type") === "practice" ? "practice" : "all";
  const scope = params.get("scope") === "course" ? "course" : params.get("scope") === "personal" ? "personal" : "all";
  const sort: WorksSort = params.get("sort") === "name" ? "name" : "updated";
  const requestedPage = Math.max(1, Math.min(1000000, Number(params.get("page")) || 1));
  const pageSize = params.get("size") === "24" ? 24 : 12;
  const [workflows, setWorkflows] = useState<WorkflowSummaryV2[] | null>(null);
  const [practice, setPractice] = useState<MyPracticeSubmission[] | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [retry, setRetry] = useState(0), [creating, setCreating] = useState(false), [action, setAction] = useState<Action | null>(null);
  const [menu, setMenu] = useState<string | null>(null), [versions, setVersions] = useState<WorkflowSummaryV2 | null>(null), [notice, setNotice] = useState("");
  const restored = useRef(false);
  const returnTo = `/works${params.size ? `?${params.toString()}` : ""}`;
  const scrollKey = `${userId}:${returnTo}`;

  useEffect(() => {
    if (params.get("create") !== "1") return;
    setCreating(true);
    const next = new URLSearchParams(params);
    next.delete("create");
    setParams(next, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void Promise.all([loadAllWorkflows(), learnerStateService.listMyPracticeSubmissions()]).then(([workflowItems, submissions]) => {
      if (!active) return;
      setWorkflows(workflowItems); setPractice(submissions.items); setError("");
    }).catch(reason => { if (active) setError(workflowErrorMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry, learnerStateService]);

  useEffect(() => {
    if (loading || restored.current) return;
    restored.current = true;
    const position = scrollPositions.get(scrollKey) ?? 0;
    if (position) requestAnimationFrame(() => window.scrollTo({ top: position }));
  }, [loading, scrollKey]);

  useEffect(() => {
    if (!menu) return;
    function outside(event: PointerEvent) { if (!(event.target instanceof Element) || !event.target.closest(".ef-works-menu")) setMenu(null); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setMenu(null); document.querySelector<HTMLButtonElement>(".ef-works-menu-button[aria-expanded='true']")?.focus(); } }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [menu]);

  useEffect(() => {
    if (!versions) return;
    function outside(event: PointerEvent) { if (!(event.target instanceof Element) || !event.target.closest(".ef-works-version-pop, .ef-works-menu")) setVersions(null); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setVersions(null); }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [versions]);

  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true }); setMenu(null); setVersions(null);
  }
  function chooseTab(nextTab: WorksTab) {
    const next = new URLSearchParams(params);
    if (nextTab === "all") next.delete("type"); else next.set("type", nextTab);
    if (nextTab !== "workflow") next.delete("scope");
    next.delete("page"); setParams(next, { replace: true }); setMenu(null); setVersions(null);
  }
  function clearFilters() { setParams({}, { replace: true }); setMenu(null); setVersions(null); }
  function refresh(message: string) { setNotice(message); setLoading(true); setAction(null); setVersions(null); setRetry(value => value + 1); }
  function openWorkflow(item: WorkflowSummaryV2) { scrollPositions.set(scrollKey, window.scrollY); onOpenWorkflow(item.workflowId, returnTo); }
  function openPractice(item: MyPracticeSubmission) { scrollPositions.set(scrollKey, window.scrollY); navigate(`/courses/${encodeURIComponent(item.courseId)}/assignments/${encodeURIComponent(item.assignmentId)}`); }

  const searchText = search.trim().toLocaleLowerCase();
  const workflowCount = workflows?.length ?? 0;
  const practiceCount = practice?.length ?? 0;
  const scopedWorkflows = (workflows ?? []).filter(item => scope === "all" || (scope === "course" ? Boolean(item.sourceTemplateId) : !item.sourceTemplateId));
  const filteredWorkflows = scopedWorkflows.filter(item => `${item.name} ${item.description} ${item.sourceName ?? ""}`.toLocaleLowerCase().includes(searchText));
  const filteredPractice = (practice ?? []).filter(item => `${item.courseTitle} ${item.assignmentTitle}`.toLocaleLowerCase().includes(searchText));
  const filtered: WorksItem[] = tab === "workflow"
    ? filteredWorkflows.map(item => ({ kind: "workflow" as const, item }))
    : tab === "practice"
      ? filteredPractice.map(item => ({ kind: "practice" as const, item }))
      : [...filteredWorkflows.map(item => ({ kind: "workflow" as const, item })), ...filteredPractice.map(item => ({ kind: "practice" as const, item }))];
  filtered.sort((left, right) => compareItems(left, right, sort));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(requestedPage, pages);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalCount = workflowCount + practiceCount;
  const filtering = Boolean(search.trim()) || (tab === "workflow" && scope !== "all");
  const counts: Record<WorksTab, number> = { all: totalCount, workflow: workflowCount, practice: practiceCount };

  return <main className="ef-works-page">
    <header className="ef-works-head">
      <div className="ef-works-copy">
        <nav className="ef-works-crumb" aria-label="面包屑"><Link to="/">首页</Link><span aria-hidden="true">/</span><b>作品</b><span aria-hidden="true">/</span><span>总览</span></nav>
        <div className="ef-works-title-row"><h1>我的作品</h1><p className="ef-works-sum" aria-live="polite">{error ? <b>作品暂时不可用</b> : <><b>{loading && !workflows ? "正在读取…" : `${totalCount} 项作品`}</b><span aria-hidden="true" className="ef-works-sep" /><span>{loading && !workflows ? "…" : `${workflowCount} 个工作流`}</span><span aria-hidden="true" className="ef-works-sep" /><span>{loading && !practice ? "…" : `${practiceCount} 份实践提交`}</span></>}</p></div>
      </div>
      <div className="ef-works-actions">
        <TextField className="ef-works-search" icon={<Search size={16} aria-hidden="true" />} aria-label="搜索作品" placeholder="搜索作品、课程或评价" maxLength={200} value={search} onChange={event => change("q", event.target.value)} />
        <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>新建作品</Button>
      </div>
    </header>

    <div className="ef-works-toolbar">
      <div className="ef-works-tabs" role="group" aria-label="作品类型">
        {tabItems.map(item => <button key={item.id} type="button" className="ef-works-tab" aria-pressed={tab === item.id} onClick={() => chooseTab(item.id)}>{item.label} <b>{workflows === null || practice === null ? "…" : counts[item.id]}</b></button>)}
      </div>
      <div className="ef-works-tools">
        {tab === "workflow" ? <label className="ef-works-select"><span>来源</span><select aria-label="工作流来源" value={scope} onChange={event => change("scope", event.target.value)}><option value="all">全部来源</option><option value="personal">独立作品</option><option value="course">课程模板</option></select></label> : null}
        <label className="ef-works-sort"><Clock3 size={14} aria-hidden="true" /><select aria-label="作品排序" value={sort} onChange={event => change("sort", event.target.value)}><option value="updated">最近更新</option><option value="name">名称</option></select><ChevronDown size={14} aria-hidden="true" /></label>
      </div>
    </div>

    {notice ? <p className="ef-works-notice" role="status">{notice}</p> : null}
    {error ? <section className="ef-works-state ef-works-state--error" role="alert"><AlertTriangle size={26} aria-hidden="true" /><h2>作品暂时无法加载</h2><p>{error}</p><Button variant="secondary" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>重试</Button></section>
      : loading ? <div className="ef-works-grid" aria-busy="true" aria-label="正在加载作品">{Array.from({ length: 8 }, (_, index) => <div className="ef-works-skeleton" key={index}><span /><span /><span /><span /></div>)}</div>
      : visible.length ? <>
        <section className="ef-works-grid" aria-label="我的作品列表">
          {visible.map(entry => entry.kind === "workflow"
            ? <WorkflowCard key={entry.item.workflowId} item={entry.item} menuOpen={menu === entry.item.workflowId} versionsOpen={versions?.workflowId === entry.item.workflowId} onOpen={() => openWorkflow(entry.item)} onMenu={() => { setVersions(null); setMenu(menu === entry.item.workflowId ? null : entry.item.workflowId); }} onVersions={() => { setMenu(null); setVersions(versions?.workflowId === entry.item.workflowId ? null : entry.item); }} onCloseVersions={() => setVersions(null)} versionPreviews={versionPreviews} onAction={kind => { setMenu(null); setVersions(null); setAction({ kind, item: entry.item }); }} />
            : <PracticeCard key={`${entry.item.courseId}:${entry.item.assignmentId}`} item={entry.item} onOpen={() => openPractice(entry.item)} />)}
        </section>
        <nav className="ef-works-pagination" aria-label="作品分页">
          <label>每页 <select aria-label="每页数量" value={pageSize} onChange={event => change("size", event.target.value)}><option value="12">12 条</option><option value="24">24 条</option></select></label>
          <span>共 {filtered.length} 项 · 第 {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} 项</span>
          <div className="ef-works-pager"><Button size="32" variant="secondary" disabled={page <= 1} onClick={() => change("page", String(page - 1))}>上一页</Button><span>第 {page} / {pages} 页</span><Button size="32" variant="secondary" disabled={page >= pages} onClick={() => change("page", String(page + 1))}>下一页</Button></div>
        </nav>
      </> : <section className="ef-works-state">
        <FolderOpen size={30} aria-hidden="true" />
        <h2>{filtering ? "没有匹配的作品" : tab === "practice" ? "还没有实践提交" : tab === "workflow" ? "还没有工作流" : "还没有作品"}</h2>
        <p>{filtering ? "调整搜索词或来源后再试。" : tab === "practice" ? "完成课程实践后，提交会出现在这里。" : "从空白画布或起步模板开始搭建第一个工作流。"}</p>
        <div className="ef-works-state-actions">{filtering ? <Button variant="secondary" onClick={clearFilters}>清除筛选</Button> : null}{tab !== "practice" ? <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>新建作品</Button> : null}</div>
      </section>}
    {creating ? <WorkflowCreateDialog onClose={() => setCreating(false)} onCreated={id => onOpenWorkflow(id, returnTo)} /> : null}
    {action ? <WorkflowLibraryAction key={`${action.kind}:${action.item.workflowId}`} action={action} onClose={() => setAction(null)} onDone={refresh} /> : null}
  </main>;
}

function useThumbnailWidth() {
  const ref = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(element.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function WorkflowCard({ item, menuOpen, versionsOpen, onOpen, onMenu, onVersions, onCloseVersions, versionPreviews, onAction }: {
  item: WorkflowSummaryV2;
  menuOpen: boolean;
  versionsOpen: boolean;
  onOpen: () => void;
  onMenu: () => void;
  onVersions: () => void;
  onCloseVersions: () => void;
  versionPreviews: readonly WorkflowVersionPreview[];
  onAction: (kind: Action["kind"]) => void;
}) {
  const nodes = item.nodes ?? [];
  const { ref: thumbRef, width } = useThumbnailWidth();
  const { visible, remaining } = thumbnailNodes(nodes, width);
  const status = workflowStatus(item);
  return <article className={`ef-works-card${versionsOpen ? " is-overlay-open" : ""}`}>
    <div className="ef-works-thumb ef-works-thumb--flow">
      <button ref={thumbRef} type="button" className="ef-works-thumb-button" onClick={onOpen} aria-label={`打开工作流 ${item.name}`}>
        <span className="ef-works-kind">工作流</span>
        <span className="ef-works-flow" aria-hidden="true">{visible.length ? visible.map((node, index) => <Fragment key={`${node.id}:${index}`}>{index ? <span className="ef-works-line" /> : null}<span className="ef-works-node"><span className={`ef-works-dot ef-works-dot--${nodeTone[node.type] ?? "pending"}`} /></span></Fragment>) : <span className="ef-works-node"><span className="ef-works-dot ef-works-dot--pending" /></span>}{remaining > 0 ? <><span className="ef-works-line" /><span className="ef-works-more">+{remaining}</span></> : null}</span>
      </button>
    </div>
    <div className="ef-works-menu">
      <button type="button" className="ef-works-menu-button" aria-label={`管理 ${item.name}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={onMenu}><MoreHorizontal size={18} /></button>
      {menuOpen ? <div className="ef-works-menu-pop" role="menu">
        <button type="button" role="menuitem" className="ef-works-menu-versions" aria-haspopup="dialog" onClick={onVersions}><History size={14} aria-hidden="true" />版本历史（预览）</button>
        {(['rename', 'copy', 'delete'] as const).map(kind => <button key={kind} type="button" role="menuitem" className={kind === "delete" ? "is-danger" : ""} onClick={() => onAction(kind)}>{kind === "rename" ? "重命名" : kind === "copy" ? "复制" : "删除"}</button>)}
      </div> : null}
      {versionsOpen ? <section className="ef-works-version-pop" role="dialog" aria-label="版本历史（预览）">
        <header><div><strong>版本历史</strong><PreviewBadge /></div><button type="button" className="ef-works-version-close" aria-label="关闭版本历史预览" onClick={onCloseVersions}><X size={14} /></button></header>
        <p>只读预览，使用示例数据；不代表真实修订，也不会保存。</p>
        {versionPreviews.length ? <ol>{versionPreviews.map(version => <li key={version.id}>
          <span className="ef-works-version-label">{version.label}</span>
          <span className="ef-works-version-summary">{version.summary}</span>
          <span className="ef-works-version-meta">{version.nodeCount} 个节点 · {formatTime(version.createdAt)}</span>
        </li>)}</ol> : <p role="status">暂无版本预览。</p>}
      </section> : null}
    </div>
    <button type="button" className="ef-works-card-main" onClick={onOpen}>
      <span className="ef-works-title" role="heading" aria-level={2} title={item.name}>{item.name}</span>
      <span className="ef-works-meta" title={workflowSource(item)}><span className="ef-works-meta-copy">{workflowSource(item)} · {item.nodeCount ?? nodes.length} 个节点</span></span>
      <span className="ef-works-foot"><Pill tone={status.tone} dot>{status.label}</Pill><time dateTime={item.updatedAt}>{formatTime(item.updatedAt)}</time></span>
    </button>
  </article>;
}

function PracticeCard({ item, onOpen }: { item: MyPracticeSubmission; onOpen: () => void }) {
  const status = statusTone[item.status];
  const { Icon, summary } = practiceContentSummary(item);
  const thumbnailAttempt = practiceAttemptThumbnail(item);
  const thumbnailTime = formatTime(item.submittedAt ?? item.updatedAt);
  const meta = practiceMetaParts(item);
  return <article className="ef-works-card">
    <button type="button" className="ef-works-thumb ef-works-thumb--code" onClick={onOpen} aria-label={`打开实践 ${item.assignmentTitle}`}>
      <span className="ef-works-kind">实践提交</span>
      <span className="ef-works-practice">
        <span className="ef-works-practice-icon" aria-hidden="true"><Icon size={18} /></span>
        <span className="ef-works-practice-copy">
          {summary ? <strong title={summary}>{summary}</strong> : null}
          <small>{summary ? `${thumbnailAttempt} · ${thumbnailTime}` : thumbnailAttempt}</small>
        </span>
      </span>
    </button>
    <button type="button" className="ef-works-card-main" onClick={onOpen}>
      <span className="ef-works-title" role="heading" aria-level={2} title={item.assignmentTitle}>{item.assignmentTitle}</span>
      <span className="ef-works-meta" title={`${meta.copy} · ${meta.tail}`}><span className="ef-works-meta-copy">{meta.copy} · </span><span className="ef-works-meta-tail">{meta.tail}</span></span>
      <span className="ef-works-foot"><Pill tone={status.tone} dot>{status.label}</Pill><time dateTime={item.updatedAt}>{formatTime(item.updatedAt)}</time></span>
    </button>
  </article>;
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
    {kind === "delete" ? <><p>确定删除“{item.name}”？此操作不可恢复。</p>{impact ? <p>将删除 {impact.revisions} 个版本及 {impact.runs} 条运行记录和调试详情。共享模板、课程动手任务和已有学习证据会保留。</p> : !error ? <p role="status">正在检查删除范围…</p> : <button onClick={() => setRetry(value => value + 1)}>重新检查</button>}{impact?.activeRuns ? <p role="alert">当前有 {impact.activeRuns} 条运行尚未结束，请结束后再删除。</p> : null}</> : <><p>{kind === "copy" ? "复制当前保存的节点配置和布局，运行记录不会复制。" : "更新名称会创建一个新修订，已有运行记录会保留。"}</p><label className="wf-dialog-name">工作流名称<input disabled={busy} maxLength={120} value={name} onChange={event => { setName(event.target.value); creationId.current = crypto.randomUUID(); }} onKeyDown={event => { if (event.key === "Enter" && name.trim()) void submit(); }} /></label></>}
    <footer className="wf-dialog-actions"><button disabled={busy} onClick={onClose}>取消</button><button className={kind === "delete" ? "danger" : "primary"} disabled={busy || (kind === "delete" ? !impact || Boolean(impact.activeRuns) : !name.trim())} onClick={() => void submit()}>{busy ? "正在处理…" : kind === "delete" ? "确认删除" : kind === "copy" ? "创建副本" : "保存名称"}</button></footer>
  </WorkflowDialog>;
}
