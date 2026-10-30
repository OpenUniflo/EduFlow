import { ArrowRight, Bell, Check, Copy, Globe2, Lock, Search, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import type { ArchiveModel } from "../model/atlasModel";
import type { AtlasLayout } from "../model/atlasLayout";
import { Avatar } from "@/shared/ui/Avatar";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";

function shortName(person: FollowedPerson) {
  return person.displayName.replace(/^示例\s*·\s*/, "");
}

function useDialogFocus(open: boolean, onClose: () => void) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
  return closeRef;
}

function DialogShell({ title, kicker, icon, children, footer, onClose, className = "" }: {
  title: string;
  kicker: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const closeRef = useDialogFocus(true, onClose);
  return (
    <div className="ef-archive-scrim" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`ef-archive-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
        <header className="ef-archive-dialog-head">
          <span className="ef-archive-dialog-icon" aria-hidden>{icon}</span>
          <div><span>{kicker}</span><h2>{title}</h2></div>
          <PreviewBadge />
          <button ref={closeRef} type="button" className="ef-archive-dialog-close" onClick={onClose} aria-label="关闭"><X size={16} aria-hidden /></button>
        </header>
        <div className="ef-archive-dialog-body">{children}</div>
        {footer ? <footer className="ef-archive-dialog-foot">{footer}</footer> : null}
      </section>
    </div>
  );
}

function PersonRow({ person, tab, selected, onCompare, onView, onPreviewAction }: { person: FollowedPerson; tab: PeopleDialogTab; selected: boolean; onCompare: () => void; onView: () => void; onPreviewAction: () => void }) {
  return (
    <article className={`ef-archive-person-row ef-archive-person-row--${person.accent}`} data-preview="sample">
      <Avatar name={shortName(person)} size={40} personColor={person.accent} />
      <div className="ef-archive-person-copy">
        <b>{person.displayName}</b>
        <span>{person.visibility === "private" ? "未公开学习进度 · 仅公开作品" : person.activityLabel}</span>
        <small>{person.bio ?? "示例档案"} · {person.visibility === "private" ? "仅公开概览" : `${person.sharedKnowledgeIds?.length ?? person.sharedKnowledgeCount} 个公开知识`}</small>
      </div>
      <div className="ef-archive-person-actions">
        <button type="button" className={selected ? "is-on" : ""} onClick={onCompare} aria-pressed={selected}>{selected ? "对比中" : "加入对比"}</button>
        <button type="button" onClick={onView}>查看档案</button>
        <button type="button" className="ef-archive-person-secondary" onClick={onPreviewAction}>{tab === "followers" ? "回关" : "取消关注"}</button>
      </div>
    </article>
  );
}

export type PeopleDialogTab = "following" | "followers" | "share";

export function ArchivePeopleDialog({ open, tab, people, selectedIds, model, sessionName, onClose, onTab, onToggleCompare, onViewPerson }: {
  open: boolean;
  tab: PeopleDialogTab;
  people: readonly FollowedPerson[];
  selectedIds: readonly string[];
  model: ArchiveModel;
  sessionName: string;
  onClose: () => void;
  onTab: (tab: PeopleDialogTab) => void;
  onToggleCompare: (person: FollowedPerson) => void;
  onViewPerson: (person: FollowedPerson) => void;
}) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [shareScope, setShareScope] = useState<"private" | "followers" | "org" | "link">("link");
  const [shareProgress, setShareProgress] = useState(true);
  const [shareRoute, setShareRoute] = useState(true);
  const [shareWorks, setShareWorks] = useState(false);
  const peopleForTab = useMemo(() => {
    const list = tab === "followers" ? people.filter((person) => person.followsMe) : people;
    const needle = query.trim().toLowerCase();
    return needle ? list.filter((person) => person.displayName.toLowerCase().includes(needle) || person.handle.toLowerCase().includes(needle)) : list;
  }, [people, query, tab]);
  if (!open) return null;
  const footer = <><span><Lock size={12} aria-hidden />预览区域只读，不会写入，也不会生成真实分享链接</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onClose}>完成</button></>;
  return (
    <DialogShell title="人与分享" kicker="档案 · 社交预览" icon={<Users size={18} aria-hidden />} onClose={onClose} footer={footer} className="ef-archive-dialog--people">
      <nav className="ef-archive-dialog-tabs" aria-label="人与分享">
        <button type="button" className={tab === "following" ? "is-on" : ""} onClick={() => onTab("following")}>关注的人 {people.length}</button>
        <button type="button" className={tab === "followers" ? "is-on" : ""} onClick={() => onTab("followers")}>关注我的 {people.filter((person) => person.followsMe).length}</button>
        <button type="button" className={tab === "share" ? "is-on" : ""} onClick={() => onTab("share")}>可见性与分享</button>
      </nav>
      {tab !== "share" ? (
        <>
          <div className="ef-archive-dialog-search"><Search size={15} aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索关注的人" aria-label="搜索关注的人" /></div>
          <div className="ef-archive-dialog-list">
            {peopleForTab.map((person) => <PersonRow key={person.id} person={person} tab={tab} selected={selectedIds.includes(person.id)} onCompare={() => onToggleCompare(person)} onView={() => onViewPerson(person)} onPreviewAction={() => setNotice("预览只读：关注关系没有写入。")} />)}
            {!peopleForTab.length ? <p className="ef-archive-muted">没有匹配的示例人物。</p> : null}
          </div>
          {notice ? <p className="ef-archive-dialog-notice" role="status">{notice}</p> : null}
          <p className="ef-archive-dialog-note">关注为单向关系；对比最多 3 位示例人物。你只能看到对方公开给你的部分。</p>
        </>
      ) : (
        <div className="ef-archive-share-grid">
          <div className="ef-archive-share-left">
            <div className="ef-archive-share-section"><b>可见范围</b><span>单选</span></div>
            {[
              { id: "private", label: "仅自己", detail: "只有你能看到", icon: <Lock size={14} aria-hidden /> },
              { id: "followers", label: "关注我的人", detail: "关注你的人可以查看公开子集", icon: <Users size={14} aria-hidden /> },
              { id: "org", label: "组织内", detail: "同组织成员可以查看", icon: <ShieldCheck size={14} aria-hidden /> },
              { id: "link", label: "有链接的人", detail: "拿到快照链接的人可以查看", icon: <Globe2 size={14} aria-hidden /> }
            ].map((option) => (
              <label key={option.id} className={`ef-archive-vis-option ${shareScope === option.id ? "is-on" : ""}`}>
                <input type="radio" name="archive-share-scope" checked={shareScope === option.id} onChange={() => setShareScope(option.id as typeof shareScope)} />
                <span className="ef-archive-vis-icon">{option.icon}</span>
                <span><b>{option.label}</b><small>{option.detail}</small></span>
                <i aria-hidden />
              </label>
            ))}
            <div className="ef-archive-share-section"><b>分项</b><span>链接与预览同步</span></div>
            <label className="ef-archive-switch"><input type="checkbox" checked={shareProgress} onChange={(event) => setShareProgress(event.target.checked)} /><span /><span><b>学习进度</b><small>{model.stats.learned} 已学 · {model.stats.learning} 在学</small></span></label>
            <label className="ef-archive-switch"><input type="checkbox" checked={shareRoute} onChange={(event) => setShareRoute(event.target.checked)} /><span /><span><b>路线</b><small>只包含公开知识，不含分数</small></span></label>
            <label className="ef-archive-switch"><input type="checkbox" checked={shareWorks} onChange={(event) => setShareWorks(event.target.checked)} /><span /><span><b>作品</b><small>精选作品，不含分数与失败尝试</small></span></label>
            <div className="ef-archive-never"><Lock size={12} aria-hidden /><span><b>永不展示</b> 分数、失败尝试、对话与 AI 评价细节。</span></div>
          </div>
          <div className="ef-archive-share-right">
            <div className="ef-archive-preview-label"><b>他人视角</b><span>实时预览</span></div>
            <ArchiveMiniMap model={model} />
            <div className="ef-archive-share-card">
              <Avatar name={sessionName} size={40} personColor="me" decorative />
              <div><b>{sessionName} · 公开档案</b><span>{model.stats.mine} 个公开知识 · {model.stats.learned} 已学 · {model.stats.learning} 在学</span></div>
              <em>{shareScope === "private" ? "仅自己" : shareScope === "link" ? "有链接的人" : shareScope === "org" ? "组织内" : "关注我的人"}</em>
            </div>
            <div className="ef-archive-link-box"><span>预览中不会生成真实链接</span><button type="button" disabled><Copy size={13} aria-hidden />复制链接</button></div>
            <p className="ef-archive-share-note">这是示例预览：可见性、分项开关和链接都不会保存，也不会写入任何真实分享状态。</p>
          </div>
        </div>
      )}
    </DialogShell>
  );
}

function ArchiveMiniMap({ model }: { model: ArchiveModel }) {
  const nodes = model.nodes.slice(0, 90);
  const xs = nodes.map((node) => node.id.length).concat(1);
  const spread = Math.max(1, ...xs);
  return (
    <div className="ef-archive-mini-map" aria-label="公开档案缩略星图" role="img">
      <span className="ef-archive-mini-badge"><i aria-hidden />公开子集</span>
      {nodes.map((node, index) => (
        <i key={node.id} className={node.isMine ? "is-mine" : ""} style={{ left: `${8 + ((index * 37 + node.id.charCodeAt(0)) % 84)}%`, top: `${12 + ((index * 23 + node.id.length) % 72)}%`, background: node.color, opacity: node.isMine ? 0.9 : 0.4 }} />
      ))}
      <span className="ef-archive-mini-empty" aria-hidden>{spread > 0 ? "" : ""}</span>
    </div>
  );
}

export function ArchiveNotificationsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const samples = [
    { id: "n1", icon: <Users size={15} aria-hidden />, title: "示例 · 阿青 公开了新的学习进度", detail: "3 门课程 · 本周 5 次学习", time: "今天 09:20" },
    { id: "n2", icon: <UserRound size={15} aria-hidden />, title: "示例 · 周然 邀请你对比档案", detail: "仅包含公开知识，不含分数与失败尝试", time: "昨天 18:40" },
    { id: "n3", icon: <Bell size={15} aria-hidden />, title: "示例 · 本周学习回顾已生成", detail: "预览通知，不会发送真实消息", time: "10/27 08:00" }
  ];
  return (
    <DialogShell title="通知" kicker="档案 · 通知预览" icon={<Bell size={18} aria-hidden />} onClose={onClose} className="ef-archive-dialog--notifications"
      footer={<><span><Lock size={12} aria-hidden />预览数据，不会写入</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onClose}>完成</button></>}>
      <ul className="ef-archive-notifications">
        {samples.map((sample) => <li key={sample.id} data-preview="sample"><span className="ef-archive-notification-icon">{sample.icon}</span><span><b>{sample.title}</b><small>{sample.detail}</small></span><time>{sample.time}</time></li>)}
      </ul>
      <p className="ef-archive-dialog-note">通知后端尚未接入；这里展示的是明显标记的示例数据。</p>
    </DialogShell>
  );
}

export function ArchivePeoplePicker({ open, people, selectedIds, onClose, onToggle, onFinish }: {
  open: boolean;
  people: readonly FollowedPerson[];
  selectedIds: readonly string[];
  onClose: () => void;
  onToggle: (person: FollowedPerson) => void;
  onFinish: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  const filtered = people.filter((person) => !query.trim() || person.displayName.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="ef-archive-picker" role="dialog" aria-modal="true" aria-label="加入对比">
      <header className="ef-archive-picker-head">
        <div><b>加入对比</b><span>从关注的人中选，最多 3 位</span></div>
        <PreviewBadge />
        <button type="button" className="ef-archive-dialog-close" onClick={onClose} aria-label="关闭"><X size={15} aria-hidden /></button>
      </header>
      <label className="ef-archive-dialog-search"><Search size={15} aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索我关注的人" aria-label="搜索我关注的人" /></label>
      <div className="ef-archive-picker-list">
        <div className="ef-archive-result-head"><b>我关注的</b><span>{selectedIds.length + 1}/4</span></div>
        {filtered.map((person) => {
          const selected = selectedIds.includes(person.id);
          return (
            <div className="ef-archive-picker-row" key={person.id} data-preview="sample">
              <Avatar name={shortName(person)} size={32} personColor={person.accent} decorative />
              <span><b>{shortName(person)}</b><small>{person.visibility === "private" ? "未公开学习进度" : `公开 ${person.sharedKnowledgeIds?.length ?? person.sharedKnowledgeCount} 个知识`}</small></span>
              <button type="button" disabled={selected || selectedIds.length >= 3} onClick={() => onToggle(person)}>{selected ? <><Check size={12} aria-hidden />已选</> : "加入对比"}</button>
            </div>
          );
        })}
      </div>
      <footer className="ef-archive-picker-foot"><span>预览 · 示例数据只读</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onFinish}>完成</button></footer>
    </div>
  );
}

export function ArchivePeerCard({ person, model, onClose, onCompare, onOpenCourse }: {
  person: FollowedPerson;
  model: ArchiveModel;
  onClose: () => void;
  onCompare: () => void;
  onOpenCourse: (courseId: string) => void;
}) {
  const shared = (person.sharedKnowledgeIds ?? []).filter((id) => model.nodeById.has(id));
  const overlap = shared.filter((id) => model.mineNodeIds.has(id)).length;
  const course = model.courses
    .filter((item) => item.state === "recommended" || item.state === "published" || item.state === "active")
    .map((item) => ({ item, hit: item.coveredKnowledgeIds.filter((id) => shared.includes(id)).length }))
    .sort((left, right) => right.hit - left.hit || left.item.title.localeCompare(right.item.title))[0]?.item;
  const domains = new Map<string, { color: string; count: number }>();
  shared.forEach((id) => {
    const node = model.nodeById.get(id);
    if (!node) return;
    const current = domains.get(node.domainTitle) ?? { color: node.color, count: 0 };
    domains.set(node.domainTitle, { color: current.color, count: current.count + 1 });
  });
  return (
    <aside className="ef-archive-peer-card" aria-label={`${person.displayName} 的公开档案`} data-preview="sample">
      <header className="ef-archive-peer-head">
        <Avatar name={shortName(person)} size={40} personColor={person.accent} />
        <div><b>{person.displayName}</b><span>公开档案 · 关注的人</span></div>
        <button type="button" className="ef-archive-dialog-close" onClick={onClose} aria-label="关闭"><X size={15} aria-hidden /></button>
      </header>
      <PreviewBadge />
      <p className="ef-archive-peer-bio">{person.bio ?? "示例档案"}</p>
      <div className="ef-archive-peer-stats">
        <span><b>{shared.length}</b><small>公开知识</small></span>
        <span><b>{overlap}</b><small>和你重合</small></span>
        <span><b>{Math.max(0, shared.length - overlap)}</b><small>她有你没有</small></span>
      </div>
      <div className="ef-archive-peer-domains">
        {[...domains.entries()].sort((left, right) => right[1].count - left[1].count).slice(0, 4).map(([name, value]) => (
          <div key={name}><span><i style={{ background: value.color }} aria-hidden />{name}</span><em style={{ width: `${Math.round(value.count / Math.max(1, shared.length) * 100)}%` }} /><b>{value.count}</b></div>
        ))}
      </div>
      <div className="ef-archive-peer-actions">
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={onCompare}>和我对比</button>
        <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => onOpenCourse(course?.id ?? model.courses[0]?.id ?? "")}>查看她的路线<ArrowRight size={14} aria-hidden /></button>
      </div>
      <p className="ef-archive-peer-note"><Lock size={12} aria-hidden />公开子集 · 不含分数与失败尝试</p>
    </aside>
  );
}

export function ArchiveCompareCard({ model, sessionName, peopleCount, onShare, onVisibility, onFitMine }: {
  model: ArchiveModel;
  sessionName: string;
  peopleCount: number;
  onShare: () => void;
  onVisibility: () => void;
  onFitMine: () => void;
}) {
  const domains = new Map<string, { color: string; count: number }>();
  model.nodes.filter((node) => node.isMine).forEach((node) => {
    const current = domains.get(node.domainTitle) ?? { color: node.color, count: 0 };
    domains.set(node.domainTitle, { color: current.color, count: current.count + 1 });
  });
  return (
    <aside className="ef-archive-compare-card" aria-label="我的档案 · 对比">
      <header><Avatar name={sessionName} size={40} personColor="me" /><div><b>{sessionName}</b><span>我的档案 · 对比中</span></div><em>{peopleCount + 1} 人</em></header>
      <PreviewBadge />
      <div className="ef-archive-compare-stats">
        <span><b>{model.stats.mine}</b><small>我的知识</small></span>
        <span><b>{model.stats.learned}</b><small>已学</small></span>
        <span><b>{model.stats.learning}</b><small>在学</small></span>
      </div>
      <div className="ef-archive-compare-domains">
        {[...domains.entries()].sort((left, right) => right[1].count - left[1].count).slice(0, 5).map(([name, value]) => (
          <div key={name}><span><i style={{ background: value.color }} aria-hidden />{name}</span><em style={{ width: `${Math.round(value.count / Math.max(1, model.stats.mine) * 100)}%`, background: value.color }} /><b>{value.count}</b></div>
        ))}
      </div>
      <div className="ef-archive-compare-actions"><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={onShare}>分享</button><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onVisibility}>可见性<ArrowRight size={13} aria-hidden /></button></div>
      <p className="ef-archive-peer-note"><button type="button" className="ef-archive-text-btn" onClick={onFitMine}>本周学习 {model.stats.weekDays} 天 · {model.stats.mine} 个知识</button></p>
    </aside>
  );
}

export function ArchiveCompareNodeCard({ node, people, sessionName, onClose, onAskAssistant }: {
  node: { id: string; title: string; domainTitle: string; color: string; isMine: boolean; status: string };
  people: readonly FollowedPerson[];
  sessionName: string;
  onClose: () => void;
  onAskAssistant: (goal: string) => void;
}) {
  const [learned, setLearned] = useState(false);
  return (
    <aside className="ef-archive-compare-node-card" aria-label={`${node.title} 对比详情`} data-preview="sample">
      <header>
        <span className="ef-archive-hover-kicker"><i style={{ background: node.color }} aria-hidden />节点 · {node.domainTitle}</span>
        <button type="button" className="ef-archive-dialog-close" onClick={onClose} aria-label="关闭节点详情"><X size={14} aria-hidden /></button>
      </header>
      <b className="ef-archive-compare-node-title">{node.title}</b>
      <PreviewBadge />
      <div className="ef-archive-compare-node-list">
        {people.map((person) => {
          const shared = Boolean(person.sharedKnowledgeIds?.includes(node.id));
          const status = shared ? (person.sharedKnowledgeStatuses?.[node.id] === "learning" ? "在学" : "已学") : "没有";
          return <div key={person.id} className={shared ? "is-yes" : ""}><i style={{ background: `var(--p-${person.accent === "me" ? "me" : person.accent})` }} aria-hidden /><b>{shortName(person)}</b><span>{status}</span></div>;
        })}
        <div className={node.isMine ? "is-yes" : ""}><i style={{ background: "var(--p-me)" }} aria-hidden /><b>{sessionName}</b><span>{node.isMine ? (node.status === "learning" ? "在学" : node.status === "learned" || node.status === "mastered" ? "已学" : "目标") : "没有"}</span></div>
      </div>
      <div className="ef-archive-compare-node-actions">
        <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => setLearned(true)} disabled={learned || node.isMine}>{learned ? "已加入目标" : "我也想学"}</button>
        <button type="button" className="ef-archive-text-btn" onClick={() => onAskAssistant(`我想学「${node.title}」，帮我找一条路线。`)}>交给小助手</button>
      </div>
      <p className="ef-archive-compare-node-note"><Lock size={11} aria-hidden />预览数据，不会写入学习状态</p>
    </aside>
  );
}

export function ArchiveNodeHoverCard({ title, domain, domainColor, people, canLearn, onLearn }: {
  title: string;
  domain: string;
  domainColor: string;
  people: Array<{ name: string; has: boolean; color: string }>;
  canLearn: boolean;
  onLearn: () => void;
}) {
  return (
    <div className="ef-archive-hover-card" role="tooltip" data-preview={people.length ? "sample" : undefined}>
      <div className="ef-archive-hover-kicker"><i style={{ background: domainColor }} aria-hidden />{domain}</div>
      <b>{title}</b>
      {people.length ? <PreviewBadge /> : null}
      {people.length ? <div className="ef-archive-hover-people">{people.map((person) => <span key={person.name}><i style={{ background: person.color }} aria-hidden />{person.name}<em>{person.has ? "已学" : "没有"}</em></span>)}</div> : null}
      {canLearn ? <button type="button" onClick={onLearn}>我也想学<ArrowRight size={12} aria-hidden /></button> : null}
    </div>
  );
}
