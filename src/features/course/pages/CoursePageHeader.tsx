import { ArrowLeft, Network, Route } from "lucide-react";
import type { CourseHeaderModel } from "./courseHeaderModel";
import type { CourseView } from "./courseEntry";

export type CoursePageHeaderProps = {
  courseTitle: string;
  model: CourseHeaderModel;
  authenticated: boolean;
  view: CourseView;
  backLabel: string;
  onBack(): void;
  onViewChange(view: CourseView): void;
};

/**
 * The only Course page header. It is mounted above whichever view is active,
 * so switching 路线 / 课程树 replaces only the body underneath it.
 */
export function CoursePageHeader({
  courseTitle,
  model,
  authenticated,
  view,
  backLabel,
  onBack,
  onViewChange
}: CoursePageHeaderProps) {
  const progressLabel = authenticated
    ? `已学 ${model.learned} / ${model.total}`
    : `公开课程 · ${model.chapterCount} 章 · ${model.total} 个知识点`;
  return <header className="ef-course-page-header">
    <button type="button" className="ef-course-page-back" onClick={onBack} aria-label={`返回${backLabel}`}>
      <ArrowLeft size={16} aria-hidden="true" />
      <span>返回{backLabel}</span>
    </button>
    <div className="ef-course-page-title">
      <span>课程</span>
      <h1 title={courseTitle}>{courseTitle}</h1>
      <div className="ef-course-page-summary">
        {authenticated ? <span
          className="ef-course-page-progress"
          role="progressbar"
          aria-label={`课程进度 ${progressLabel}`}
          aria-valuemin={0}
          aria-valuemax={model.total}
          aria-valuenow={model.learned}
        ><i style={{ width: `${model.progress}%` }} /></span> : null}
        <span>{progressLabel}</span>
        {authenticated && model.currentChapter ? <span className="ef-course-page-current">当前：{model.currentChapter}</span> : null}
      </div>
    </div>
    <nav className="ef-course-page-tabs" aria-label="课程视图" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={view === "route"}
        className={view === "route" ? "is-on" : ""}
        onClick={() => onViewChange("route")}
      ><Route size={14} aria-hidden="true" />路线</button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "tree"}
        className={view === "tree" ? "is-on" : ""}
        onClick={() => onViewChange("tree")}
      ><Network size={14} aria-hidden="true" />课程树</button>
    </nav>
  </header>;
}
