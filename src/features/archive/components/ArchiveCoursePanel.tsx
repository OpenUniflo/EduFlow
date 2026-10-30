import { ArrowRight, BookOpen, FileText, Layers3, List, Map, Search, Sparkles } from "lucide-react";
import type { ArchiveCourse, ArchiveModel } from "../model/atlasModel";

function ProgressRing({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="ef-archive-course-ring" aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15.5" className="ef-archive-course-ring-track" />
        <circle cx="18" cy="18" r="15.5" className="ef-archive-course-ring-value" pathLength={100} strokeDasharray={`${safe} 100`} />
      </svg>
      <b>{safe}%</b>
    </span>
  );
}

function CourseRow({ course, focused, onFocus, onOpen, onOpenChapters }: { course: ArchiveCourse; focused: boolean; onFocus: () => void; onOpen: () => void; onOpenChapters: () => void }) {
  return (
    <div className={`ef-archive-course-row ${focused ? "is-focused" : ""}`} data-course-state={course.state}>
      <button type="button" className="ef-archive-course-main" onClick={onFocus} title={course.title}>
        {course.state === "draft" ? <span className="ef-archive-course-icon"><FileText size={15} aria-hidden /></span> : <ProgressRing value={course.progress} />}
        <span className="ef-archive-course-copy">
          <b>{course.title}</b>
          <small>{course.state === "draft" ? `草稿 · ${course.knowledgeCount} 个知识` : course.nextLabel}</small>
        </span>
      </button>
      <button type="button" className="ef-archive-course-open" onClick={onOpen} aria-label={`进入 ${course.title}`}><ArrowRight size={14} aria-hidden /></button>
      {focused ? (
        <div className="ef-archive-course-detail">
          <div className="ef-archive-course-detail-progress"><span>实践进度 <b>{course.progress}%</b></span><i aria-hidden><b style={{ width: `${Math.max(0, Math.min(100, course.progress))}%` }} /></i></div>
          <small>{course.nextLabel}</small>
          <div className="ef-archive-course-detail-actions">
            <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onOpen}>进入课程</button>
            <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={onOpenChapters}>查看章节</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ArchiveCoursePanel({ model, focusedCourseId, guest, listMode, error, onFocusCourse, onOpenCourse, onOpenChapters, onOpenSearch, onOpenAssistant, onToggleList, onLocateMe, onSelectCached, hasHistory, onRetry }: {
  model: ArchiveModel;
  focusedCourseId: string | null;
  guest: boolean;
  listMode: boolean;
  error: boolean;
  onFocusCourse: (courseId: string) => void;
  onOpenCourse: (courseId: string) => void;
  onOpenChapters: (courseId: string) => void;
  onOpenSearch: () => void;
  onOpenAssistant: () => void;
  onToggleList: () => void;
  onLocateMe: () => void;
  onSelectCached: (id: string) => void;
  hasHistory: boolean;
  onRetry?: () => void;
}) {
  const active = model.courses.filter((course) => course.state === "active" || course.state === "draft").slice(0, 3);
  const recommended = model.courses.filter((course) => course.state === "recommended").slice(0, 3);
  const publicCourses = model.courses.filter((course) => course.state === "recommended" || course.state === "published").slice(0, 8);
  const cached = model.nodes.filter((node) => node.isMine).slice(0, 12);
  const list = cached.length ? cached : model.nodes.slice().sort((left, right) => right.visualImportance - left.visualImportance).slice(0, 12);

  return (
    <section className="ef-archive-course-panel" aria-label="档案课程浮层" data-error={error ? "true" : undefined}>
      <header className="ef-archive-panel-head">
        <span className="ef-archive-panel-kicker"><BookOpen size={14} aria-hidden />{guest ? "公开课程" : "课程"}</span>
        <span className="ef-archive-panel-meta">{error ? "缓存" : guest ? `${publicCourses.length} 门` : hasHistory ? `${model.stats.weekDays} 天 · 本周` : "本周 0 天"}</span>
      </header>

      {error ? (
        <div className="ef-archive-view-toggle" role="group" aria-label="查看方式">
          <button type="button" className={listMode ? "" : "is-on"} onClick={() => listMode && onToggleList()} aria-pressed={!listMode}><Map size={13} aria-hidden />星图</button>
          <button type="button" className={listMode ? "is-on" : ""} onClick={() => !listMode && onToggleList()} aria-pressed={listMode}><List size={13} aria-hidden />列表查看</button>
        </div>
      ) : (
        <button type="button" className="ef-archive-search-trigger" onClick={onOpenSearch}>
          <Search size={15} aria-hidden />
          <span>搜索课程、知识或同学</span>
          <kbd>⌘K</kbd>
        </button>
      )}

      {error ? (
        <>
          <p className="ef-archive-cached-note"><span aria-hidden>●</span>{listMode ? "星图暂时不可用，已改用列表查看。" : "星图缓存已保留；切到列表可查看缓存知识。"}</p>
          {listMode ? <div className="ef-archive-cached-list">
            <div className="ef-archive-cached-head"><b>已缓存的知识</b><span>{cached.length || list.length} / {model.nodes.length}</span></div>
            {list.map((node) => (
              <button type="button" key={node.id} onClick={() => onSelectCached(node.id)} className="ef-archive-cached-row">
                <span className={`ef-archive-cached-dot status-${node.status}`} aria-hidden />
                <span><b>{node.title}</b><small>{node.domainTitle} · {node.courseContexts[0]?.courseTitle ?? "全局知识"}</small></span>
                <em>{node.status === "learning" ? "在学" : node.status === "learned" ? "已学" : node.status === "practicing" ? "实训" : node.status === "mastered" ? "掌握" : "可探索"}</em>
              </button>
            ))}
          </div> : null}
          {onRetry ? <button type="button" className="ef-archive-retry-inline" onClick={onRetry}>重试加载</button> : null}
        </>
      ) : guest ? (
        <>
          <div className="ef-archive-section-head"><b>全部公开课程</b><span>按热度</span></div>
          <div className="ef-archive-rec-list">
            {publicCourses.map((course) => (
              <button type="button" key={course.id} className="ef-archive-rec-row" onClick={() => onOpenCourse(course.id)} title={course.title}>
                <span className="ef-archive-rec-icon"><BookOpen size={14} aria-hidden /></span>
                <span><b>{course.title}</b><small>{course.chapterCount} 章 · {course.knowledgeCount} 个知识 · {course.lessonCount} 课</small></span>
                <span className="ef-archive-rec-kind">公开</span>
              </button>
            ))}
          </div>
          <div className="ef-archive-panel-foot"><span>{model.stats.totalNodes} 个公开知识</span><span>{model.stats.totalEdges} 条关系</span></div>
        </>
      ) : !hasHistory ? (
        <>
          <div className="ef-archive-empty-card">
            <Sparkles size={19} aria-hidden />
            <b>还没有学习记录</b>
            <p>选一门课，从第一个知识开始；也可以让助手按你的目标找一条路线。</p>
            <div><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onOpenSearch}>找一门课程</button><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={onOpenAssistant}>问助手</button></div>
          </div>
          <div className="ef-archive-rec-head"><b>推荐课程</b><span>{recommended.length} 门</span></div>
          <div className="ef-archive-rec-list">
            {recommended.map((course) => (
              <button type="button" key={course.id} className="ef-archive-rec-row" onClick={() => onOpenCourse(course.id)} title={course.title}>
                <span className="ef-archive-rec-icon"><BookOpen size={14} aria-hidden /></span>
                <span><b>{course.title}</b><small>{course.chapterCount} 章 · {course.knowledgeCount} 个知识 · {course.lessonCount} 课</small></span>
                <ArrowRight size={14} aria-hidden />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="ef-archive-section-head"><b>正在学习</b><span>{active.filter((course) => course.state === "active").length} 在学 · {active.filter((course) => course.state === "draft").length} 草稿</span></div>
          <div className="ef-archive-course-list">
            {active.map((course) => <CourseRow key={course.id} course={course} focused={focusedCourseId === course.id} onFocus={() => onFocusCourse(course.id)} onOpen={() => onOpenCourse(course.id)} onOpenChapters={() => onOpenChapters(course.id)} />)}
            {!active.length ? <p className="ef-archive-muted">还没有在学课程，从下面的推荐开始。</p> : null}
          </div>
          <div className="ef-archive-section-head"><b>推荐</b><span>{recommended.length} 门</span></div>
          <div className="ef-archive-rec-list">
            {recommended.map((course) => (
              <button type="button" key={course.id} className="ef-archive-rec-row" onClick={() => onFocusCourse(course.id)} title={course.title}>
                <span className="ef-archive-rec-icon"><Layers3 size={14} aria-hidden /></span>
                <span><b>{course.title}</b><small>补上 {course.knowledgeCount} 个知识 · {course.chapterCount} 章</small></span>
                <span className="ef-archive-rec-kind">课程</span>
              </button>
            ))}
          </div>
          <footer className="ef-archive-panel-foot">
            <span>本周学习 <b>{model.stats.weekDays}</b> 天</span>
            <span><b>{model.stats.mine}</b> 个知识</span>
          </footer>
        </>
      )}
    </section>
  );
}
