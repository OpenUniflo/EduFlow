import { ArrowRight, BookOpen, ChevronRight, Eye, Link2, Lock, Minus, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ArchiveCourse, ArchiveModel, ArchiveNode } from "../model/atlasModel";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import { Avatar } from "@/shared/ui/Avatar";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";
import { knowledgeStateLabelFor } from "@/shared/learning/knowledgePresentation";

export type PanelPerson = {
  id: string;
  name: string;
  accent: string;
  nodeIds: Set<string>;
  person?: FollowedPerson;
};

function shortName(person: FollowedPerson) {
  return person.displayName.replace(/^示例\s*·\s*/, "");
}

function statusLabel(status: ArchiveNode["status"]) {
  return knowledgeStateLabelFor(status);
}

function domainCoverage(model: ArchiveModel, people: readonly PanelPerson[]) {
  const groups = new Map<string, { name: string; color: string; total: number; counts: number[] }>();
  model.nodes.forEach((node) => {
    const group = groups.get(node.domainTitle) ?? { name: node.domainTitle, color: node.color, total: 0, counts: people.map(() => 0) };
    group.total += 1;
    people.forEach((person, index) => { if (person.nodeIds.has(node.id)) group.counts[index] += 1; });
    groups.set(node.domainTitle, group);
  });
  return Array.from(groups.values()).sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
}

function personCourses(model: ArchiveModel, people: readonly PanelPerson[]) {
  const ids = new Set(people.flatMap((person) => Array.from(person.nodeIds)));
  return model.courses.filter((course) => course.coveredKnowledgeIds.some((id) => ids.has(id)));
}

function CourseRow({ course, onFocus }: { course: ArchiveCourse; onFocus: (id: string) => void }) {
  return (
    <button type="button" className="ef-atlas-panel-course" onClick={() => onFocus(course.id)}>
      <span className="ef-atlas-panel-course-mark" aria-hidden>{course.title.slice(0, 1)}</span>
      <span className="ef-atlas-panel-course-copy">
        <b>{course.title}</b>
        <small>{course.state === "draft" ? `草稿 · ${course.knowledgeCount} 个知识点` : `${course.progress}% · ${course.nextLabel}`}</small>
      </span>
      <ChevronRight size={14} aria-hidden />
    </button>
  );
}

export function ArchivePersonPanel({ model, people, view, sessionName, collapsed, onCollapse, onExpandStrip, onFocusCourse, onCompare, onOpenPeople, onOpenCourse }: {
  model: ArchiveModel;
  people: readonly PanelPerson[];
  view: "me" | "person" | "compare";
  sessionName: string;
  collapsed: boolean;
  onCollapse: () => void;
  onExpandStrip: () => void;
  onFocusCourse: (courseId: string) => void;
  onCompare: (personId: string) => void;
  onOpenPeople: () => void;
  onOpenCourse: (courseId: string) => void;
}) {
  const coverage = useMemo(() => domainCoverage(model, people), [model, people]);
  const courses = useMemo(() => personCourses(model, people), [model, people]);
  // One active-Course projection feeds both the count and the list. The old
  // "正在学习" list used every related Course while the count used only active
  // ones, so the same panel disagreed with itself.
  const activeCourses = useMemo(() => courses.filter((course) => course.state === "active"), [courses]);
  const listedCourses = view === "me" ? activeCourses : courses;
  const mine = model.nodes.filter((node) => node.isMine);
  const learning = mine.filter((node) => node.status === "learning" || node.status === "practicing");
  const recent = mine.filter((node) => node.updatedAt).slice().sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")).slice(0, 3);
  const single = people[0];
  const sharedOnly = people.some((person) => person.person?.visibility === "private");
  const coreCount = new Set(people.flatMap((person) => Array.from(person.nodeIds))).size;

  if (collapsed) {
    return (
      <button type="button" className="ef-atlas-strip ef-ui-glass ef-ui-glass--regular" onClick={onExpandStrip} aria-label="展开个人面板">
        {single ? <Avatar name={view === "me" ? sessionName : single.name} size={28} personColor={single.accent as "me" | "orange" | "cyan" | "rose"} decorative /> : <Users size={16} aria-hidden />}
        <b>{view === "compare" ? `对比 · ${people.length} 人` : view === "me" ? "我的面板" : `${single?.name ?? ""} 的地图`}</b>
        <span>展开</span>
      </button>
    );
  }

  return (
    <aside className="ef-atlas-panel ef-atlas-person-panel ef-ui-glass ef-ui-glass--regular" aria-label={view === "compare" ? "对比面板" : view === "me" ? "我的面板" : "个人地图面板"}>
      <header className="ef-atlas-panel-head">
        {view === "compare" ? <span className="ef-atlas-panel-avatar"><Users size={20} aria-hidden /></span> : <Avatar name={view === "me" ? sessionName : single?.name ?? ""} size={40} personColor={(single?.accent ?? "me") as "me" | "orange" | "cyan" | "rose"} decorative />}
        <div className="ef-atlas-panel-title">
          <h2>{view === "compare" ? `对比 · ${people.map((person) => person.name).join(" 与 ")}` : view === "me" ? "我" : single?.name}</h2>
          <p>{view === "me" ? `我的地图 · 本周学习 ${model.stats.weekDays} 天` : view === "compare" ? "节点外环按人物颜色分段" : "公开地图 · 预览 · 示例数据"}</p>
        </div>
        <button type="button" className="ef-atlas-icon-btn" onClick={onCollapse} aria-label="收起个人面板"><Minus size={15} aria-hidden /></button>
      </header>

      {view === "person" ? <div className="ef-atlas-panel-preview"><PreviewBadge /></div> : null}

      {view === "compare" ? (
        <div className="ef-atlas-person-chips">
          {people.map((person) => (
            <span key={person.id} style={{ "--pc": `var(--p-${person.accent})` } as React.CSSProperties}><i aria-hidden />{person.name} {person.nodeIds.size}</span>
          ))}
        </div>
      ) : null}
      {view === "compare" ? <div className="ef-atlas-panel-preview"><PreviewBadge /></div> : null}

      <div className="ef-atlas-stat-row">
        {view === "me" ? (
          <>
            <span><b>{model.stats.mine}</b><small>我的知识</small></span>
            <span><b>{learning.length}</b><small>在学</small></span>
            <span><b>{activeCourses.length}</b><small>在学课程</small></span>
          </>
        ) : view === "compare" ? (
          <>
            <span><b>{coreCount}</b><small>并集知识点</small></span>
            <span><b>{people.length}</b><small>对比人物</small></span>
            <span><b>{courses.length}</b><small>相关课程</small></span>
          </>
        ) : (
          <>
            <span><b>{single?.nodeIds.size ?? 0}</b><small>公开知识</small></span>
            <span><b>{courses.length}</b><small>共同课程</small></span>
            <span><b>{sharedOnly ? "—" : `${single?.person?.sharedKnowledgeCount ?? single?.nodeIds.size ?? 0}`}</b><small>授权范围</small></span>
          </>
        )}
      </div>

      <section className="ef-atlas-panel-section">
        <h3>{view === "me" ? "正在学习" : "相关课程"}</h3>
        {listedCourses.slice(0, 4).map((course) => <CourseRow key={course.id} course={course} onFocus={onFocusCourse} />)}
        {!listedCourses.length ? <p className="ef-atlas-panel-empty">{view === "me" ? "还没有在学课程。" : "还没有关联课程。"}</p> : null}
        {view === "me" && listedCourses.length ? <button type="button" className="ef-atlas-panel-more" onClick={() => onFocusCourse(listedCourses[0].id)}>在星图中查看第一门课 <ArrowRight size={12} aria-hidden /></button> : null}
      </section>

      <section className="ef-atlas-panel-section">
        <h3>各领域覆盖</h3>
        <div className="ef-atlas-domain-bars">
          {coverage.slice(0, 7).map((domain) => (
            <div key={domain.name}>
              <span><i style={{ background: domain.color }} aria-hidden />{domain.name}</span>
              <span className="ef-atlas-domain-bar">
                {people.map((person, index) => (
                  <s key={person.id} style={{ width: `${domain.total ? (domain.counts[index] / domain.total) * 100 : 0}%`, background: `var(--p-${person.accent})` }} aria-hidden />
                ))}
              </span>
              <em>{people.map((person, index) => domain.counts[index]).join(" / ")} / {domain.total}</em>
            </div>
          ))}
        </div>
      </section>

      {view === "me" && recent.length ? (
        <section className="ef-atlas-panel-section">
          <h3>最近学习</h3>
          <ul className="ef-atlas-recent">
            {recent.map((node) => <li key={node.id}><span>{node.title}</span><em>{node.updatedAt ? new Date(node.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : statusLabel(node.status)}</em></li>)}
          </ul>
        </section>
      ) : null}

      <footer className="ef-atlas-panel-foot">
        {view === "me" ? (
          <><button type="button" className="ef-atlas-panel-cta" onClick={onOpenPeople}><Users size={13} aria-hidden />人与分享</button><button type="button" className="ef-atlas-panel-cta" onClick={() => onOpenCourse(model.courses.find((course) => course.state === "active")?.id ?? "")} disabled={!model.courses.some((course) => course.state === "active")}><BookOpen size={13} aria-hidden />进入课程</button></>
        ) : view === "person" && single ? (
          <><button type="button" className="ef-atlas-panel-cta" onClick={() => onCompare(single.id)}>与我对比</button><button type="button" className="ef-atlas-panel-cta" onClick={onOpenPeople}><Users size={13} aria-hidden />人与分享</button></>
        ) : (
          <button type="button" className="ef-atlas-panel-cta" onClick={onOpenPeople}><Users size={13} aria-hidden />人与分享</button>
        )}
        <span className="ef-atlas-panel-note"><Lock size={11} aria-hidden />只读 · 预览不写入学习状态</span>
      </footer>
    </aside>
  );
}

export function ArchivePeopleSharePanel({ people, sessionName, collapsed, onExpandStrip, onClose, onView, onCompare }: {
  people: readonly FollowedPerson[];
  sessionName: string;
  collapsed: boolean;
  onExpandStrip: () => void;
  onClose: () => void;
  onView: (person: FollowedPerson) => void;
  onCompare: (person: FollowedPerson) => void;
}) {
  const [scope, setScope] = useState<"private" | "followers" | "org" | "link">("followers");
  const [shareCreated, setShareCreated] = useState(false);
  const [error, setError] = useState("");
  const scopes = [
    { id: "private", label: "仅自己" },
    { id: "followers", label: "关注我的人" },
    { id: "org", label: "组织内" },
    { id: "link", label: "有链接的人" }
  ] as const;
  if (collapsed) {
    return (
      <button type="button" className="ef-atlas-strip ef-ui-glass ef-ui-glass--regular" onClick={onExpandStrip} aria-label="展开人与分享">
        <Users size={16} aria-hidden />
        <b>人与分享</b>
        <span>展开</span>
      </button>
    );
  }
  return (
    <aside className="ef-atlas-panel ef-atlas-share-panel ef-ui-glass ef-ui-glass--regular" aria-label="人与分享">
      <header className="ef-atlas-panel-head">
        <span className="ef-atlas-panel-avatar"><Users size={20} aria-hidden /></span>
        <div className="ef-atlas-panel-title"><h2>人与分享</h2><p>关注的人、可见范围与分享链接</p></div>
        <button type="button" className="ef-atlas-icon-btn" onClick={onClose} aria-label="关闭人与分享"><X size={15} aria-hidden /></button>
      </header>
      <div className="ef-atlas-panel-preview"><PreviewBadge /></div>
      <section className="ef-atlas-panel-section">
        <h3>我关注的人 · {people.length}</h3>
        {people.filter((person) => person.sample).map((person) => (
          <div className="ef-atlas-person-row" key={person.id} data-preview="sample">
            <Avatar name={shortName(person)} size={28} personColor={person.accent as "me" | "orange" | "cyan" | "rose"} decorative />
            <span><b>{shortName(person)}</b><small>{person.visibility === "private" ? "仅公开作品" : `公开 ${person.sharedKnowledgeIds?.length ?? person.sharedKnowledgeCount} 个知识点`}</small></span>
            <button type="button" className="ef-atlas-mini-btn" onClick={() => onView(person)}><Eye size={12} aria-hidden />查看</button>
            <button type="button" className="ef-atlas-mini-btn" onClick={() => onCompare(person)}>对比</button>
          </div>
        ))}
      </section>
      <section className="ef-atlas-panel-section">
        <h3>谁能看到我的地图</h3>
        <div className="ef-atlas-seg">
          {scopes.map((item) => <button type="button" key={item.id} className={scope === item.id ? "is-on" : ""} onClick={() => setScope(item.id)} aria-pressed={scope === item.id}>{item.label}</button>)}
        </div>
        <p className="ef-atlas-panel-note"><Lock size={11} aria-hidden />可见性为预览设置，不会写入真实账号。</p>
      </section>
      <section className="ef-atlas-panel-section">
        <h3>分享</h3>
        <p className="ef-atlas-panel-copy">生成一个可随时撤销的链接，默认 30 天后失效。分享只包含公开子集，不含分数与失败尝试。</p>
        <button type="button" className="ef-atlas-panel-cta" onClick={() => { setShareCreated(true); setError(""); }}><Link2 size={13} aria-hidden />{shareCreated ? "已生成示例链接（不可访问）" : "生成分享链接（示例）"}</button>
        {shareCreated ? <button type="button" className="ef-atlas-mini-btn" onClick={() => { setShareCreated(false); setError("已撤销示例链接。"); }}>撤销</button> : null}
        {error ? <p className="ef-atlas-panel-note" role="status">{error}</p> : null}
      </section>
      <footer className="ef-atlas-panel-foot"><span className="ef-atlas-panel-note"><Lock size={11} aria-hidden />示例身份 · 只读预览</span><span className="ef-atlas-panel-note">{sessionName} 的地图</span></footer>
    </aside>
  );
}
