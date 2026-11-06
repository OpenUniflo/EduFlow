import { ArrowRight, BookOpen, CalendarDays, Lock, Network, Target } from "lucide-react";
import { useMemo } from "react";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { MockSession } from "@/features/auth/types";
import type { UserCourseState } from "@/features/course/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import { buildChapterProgress } from "@/features/home/courseChapterProgress";
import { Avatar } from "@/shared/ui/Avatar";
import { Pill } from "@/shared/ui/Pill";
import { shortDisplayName } from "@/shared/ui/displayName";

export type TodayOverviewProps = {
  session: MockSession;
  course: { runtime: CourseRuntimeData; state: UserCourseState; progress: number; nextLabel: string; currentChapter?: string } | null;
  counts: { learned: number; learning: number; practicing: number; mastered: number };
  records: readonly UserKnowledgeRecord[];
  currentKnowledgeId?: string;
  week: { labels: string[]; active: boolean[]; activity: number[]; count: number };
  recentTitle?: string;
  onOpenCourse: (origin?: DOMRect) => void;
  onOpenArchive: () => void;
};

export function TodayOverview({ session, course, counts, records, currentKnowledgeId, week, recentTitle, onOpenCourse, onOpenArchive }: TodayOverviewProps) {
  const chapters = useMemo(() => course ? buildChapterProgress({
    course: course.runtime,
    statusByNode: new Map(records.map((record) => [record.nodeId, record.status])),
    currentKnowledgeId,
    recentLessonId: course.state.recentLessonId
  }) : [], [course, currentKnowledgeId, records]);
  const visibleChapters = chapters.slice(0, 4);
  const hiddenChapterCount = Math.max(0, chapters.length - visibleChapters.length);
  const activityMax = Math.max(1, ...week.activity);
  const hasActivity = week.activity.some((count) => count > 0);
  return <section className="ef-home-today" aria-label="今日概览">
    <article className="ef-home-today-card is-continue">
      <header><span>继续学习</span><Pill tone={course ? "brand" : "quiet"} dot>{course ? "在学" : "待开始"}</Pill></header>
      {course ? <>
        <h2 title={course.runtime.course.title}>{course.runtime.course.title}</h2>
        <p>{course.runtime.chapters.length} 章 · {course.runtime.curriculumCoverages.length ? new Set(course.runtime.curriculumCoverages.map((coverage) => coverage.nodeId)).size : 0} 个要点{course.currentChapter ? ` · ${course.currentChapter}` : ""}</p>
        <div className="ef-home-chapter-track" aria-hidden="true">
          {visibleChapters.map((chapter) => <span key={chapter.id} className={chapter.state === "done" ? "is-done" : chapter.state === "current" ? "is-current" : ""}><i /><small title={chapter.title}>{chapter.title}</small></span>)}
          {hiddenChapterCount ? <span className="is-quiet"><i /><small>还有 {hiddenChapterCount} 章</small></span> : null}
        </div>
        {course.nextLabel ? <p className="ef-home-next"><ArrowRight size={13} aria-hidden="true" />{course.nextLabel}</p> : null}
        <div className="ef-home-progress-row"><span className="ef-home-progress-track"><i style={{ width: `${course.progress}%` }} /></span><strong>{course.progress}% 已完成</strong></div>
        <button type="button" className="ef-ui-btn ef-ui-btn--primary" onClick={(event) => onOpenCourse(event.currentTarget.getBoundingClientRect())}>继续学习<ArrowRight size={15} /></button>
      </> : <div className="ef-home-today-empty"><BookOpen size={22} /><h2>从一门课程开始</h2><p>还没有在学课程。可以在我的地图里选择一门课程，或和助手说说你的目标。</p><button type="button" className="ef-ui-btn ef-ui-btn--secondary" onClick={onOpenArchive}>浏览我的地图<ArrowRight size={15} /></button></div>}
    </article>

    <article className="ef-home-today-card is-archive">
      <header><span>我的地图</span><button type="button" className="ef-home-text-link" onClick={onOpenArchive}>我的地图<ArrowRight size={12} /></button></header>
      <div className="ef-home-mini-id"><Avatar name={session.name} size={40} personColor="me" /><span><strong>{shortDisplayName(session.name)}</strong><small><Lock size={11} aria-hidden="true" />仅自己可见</small></span></div>
      <div className="ef-home-mini-stats"><span><strong>{counts.learned}</strong><small>已学</small></span><span><strong>{counts.learning}</strong><small>在学</small></span><span><strong>{counts.practicing}</strong><small>动手任务</small></span></div>
      {hasActivity ? <div className="ef-home-spark" aria-hidden="true">{week.activity.map((count, index) => <i key={index} className={count > 0 ? "is-on" : ""} style={{ height: `${count > 0 ? 8 + Math.round(count / activityMax * 24) : 4}px` }} />)}</div> : null}
      <p className="ef-home-mini-recent"><span>最近点亮</span><strong>{recentTitle ?? "等待第一次学习"}</strong></p>
      <button type="button" className="ef-home-text-link" onClick={onOpenArchive}>打开我的地图<ArrowRight size={12} /></button>
    </article>

    <article className="ef-home-today-card is-week">
      <header><span>本周学习</span><Pill tone="quiet"><CalendarDays size={12} aria-hidden="true" />近 7 天</Pill></header>
      <div className="ef-home-week-count"><strong>{week.count}</strong><span>天有学习记录</span></div>
      <div className="ef-home-week" aria-label={`近 7 天 ${week.count} 天有学习记录`}>{week.labels.map((label, index) => <span key={`${label}:${index}`} className={week.active[index] ? "is-active" : ""}><i />{label}</span>)}</div>
      <div className="ef-home-week-note"><Target size={14} aria-hidden="true" /><span>{week.count ? "保持连续学习；完成后只记为已学，不会自动变成掌握。" : "本周还没有学习记录，从今日继续学习开始。"}</span></div>
      <div className="ef-home-week-actions"><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={onOpenArchive}><Network size={13} />查看我的地图</button></div>
    </article>
  </section>;
}
