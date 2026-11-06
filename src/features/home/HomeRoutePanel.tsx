import { Network, X } from "lucide-react";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { CourseRoutePanel, type CourseRouteStepAction } from "@/features/course/path/CourseRoutePanel";
import type { HomeCourseProjection } from "@/features/course/path/courseLearnerProjection";

export function HomeRoutePanel({ courseTitle, projection, decision, onClose, onOpenTree, onStart }: {
  courseTitle: string;
  projection: HomeCourseProjection;
  decision?: NavigationDecision | null;
  onClose(): void;
  onOpenTree(): void;
  onStart(action: CourseRouteStepAction): void;
}) {
  return <aside className="ef-home-route-panel" aria-label="完整路线">
    <header className="ef-home-route-panel-head">
      <div>
        <span>{courseTitle} · 共 {projection.chapters.length} 章</span>
        <h2>你的学习路线</h2>
      </div>
      <button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭路线面板"><X size={16} /></button>
    </header>
    <div className="ef-home-route-panel-body">
      <CourseRoutePanel
        projection={projection}
        decision={decision}
        courseTitle={courseTitle}
        width={480}
        labelSide="right"
        labelWidth={120}
        showHeader={false}
        onSelect={onStart}
        onStart={onStart}
      />
    </div>
    <footer className="ef-home-route-panel-foot">
      <span>第 {projection.chapters.find((chapter) => chapter.id === projection.currentChapterId)?.order ?? 1} 章</span>
      <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={onOpenTree}><Network size={13} />立体视图</button>
    </footer>
  </aside>;
}
