import { BookOpen, Check, Map as MapIcon } from "lucide-react";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import { buildWindingRoute, type WindingStep, type WindingStepInput } from "@/features/course/immersive/courseTreeLayout";
import { CourseRouteView } from "@/features/course/immersive/CourseRouteView";
import type { HomeCourseProjection } from "./courseLearnerProjection";

export type CourseRouteStepAction = {
  step: WindingStep;
  nodeId: string;
  kind: "micro" | "practice" | "none";
  pathId?: string;
  assignmentId?: string;
};

/**
 * The learner route shown on the Course page and in the Home side panel. It is
 * a normal web view: one current chapter expanded, the rest folded, no 3D and
 * no layout authority beyond the Course's explicit order.
 */
export function CourseRoutePanel({ projection, decision, courseTitle, showHeader = true, width = 560, labelSide, labelWidth, onSelect, onStart }: {
  projection: HomeCourseProjection;
  decision?: NavigationDecision | null;
  courseTitle: string;
  showHeader?: boolean;
  width?: number;
  labelSide?: "left" | "right";
  labelWidth?: number;
  onSelect(action: CourseRouteStepAction): void;
  onStart(action: CourseRouteStepAction): void;
}) {
  const currentChapter = projection.chapters.find((chapter) => chapter.id === projection.currentChapterId) ?? projection.chapters[0];
  const chapter = currentChapter;
  const chapterNodes = chapter ? projection.orderedNodeIds.filter((nodeId) => chapter.nodeIds.includes(nodeId)) : [];
  const stepInputs: WindingStepInput[] = chapterNodes.map((nodeId) => {
    const micro = projection.microByNode.get(nodeId);
    const practice = projection.practiceByNode.get(nodeId);
    const nodeStatus = projection.knowledgeStatusByNode.get(nodeId);
    const learned = satisfiesTeachingPrerequisite(nodeStatus);
    const opening = projection.segment.started && !projection.segment.complete ? projection.segment.currentStep?.nodeId : undefined;
    const current = opening ? opening === nodeId : !learned && decision?.nextAction.nodeId === nodeId;
    return {
      id: nodeId,
      title: projection.titleByNode.get(nodeId) ?? nodeId,
      chapterId: chapter?.id ?? "",
      chapterTitle: chapter?.title ?? courseTitle,
      chapterNumber: chapter?.order ?? 1,
      status: current ? "current" : learned ? "done" : "locked",
      stateLabel: nodeStatus === "mastered" ? "已掌握" : nodeStatus === "practicing" ? "动手任务中" : learned ? "已学" : current ? "在学" : "待学",
      ...(micro?.estimatedMinutes || practice?.estimatedMinutes ? { minutes: micro?.estimatedMinutes ?? practice?.estimatedMinutes } : {}),
      meta: practice ? (micro ? "小练习 · 动手任务" : "动手任务") : micro ? "小练习" : undefined
    };
  });

  const layout = buildWindingRoute(stepInputs, width);
  const done = chapter?.learnedCount ?? stepInputs.filter((step) => step.status === "done").length;
  const folds = projection.chapters.filter((item) => item.id !== chapter?.id);

  const actionFor = (step: WindingStep): CourseRouteStepAction => {
    const micro = projection.microByNode.get(step.id);
    const practice = projection.practiceByNode.get(step.id);
    if (micro) return { step, nodeId: step.id, kind: "micro", pathId: micro.pathId };
    if (practice) return { step, nodeId: step.id, kind: "practice", assignmentId: practice.assignmentId };
    return { step, nodeId: step.id, kind: "none" };
  };

  return <div className="ef-course-route-view">
    {chapter ? <div className="ef-course-route-banner" role="status">
      <span><BookOpen size={14} aria-hidden="true" />第 {chapter.order} 章 · {chapter.title}</span>
      <b>{done} / {chapter.nodeIds.length} 已学</b>
    </div> : null}
    <CourseRouteView
      layout={layout}
      steps={stepInputs}
      usingActiveRoute
      routeRecommended
      reducedMotion={false}
      showHeader={showHeader}
      showAdjust={false}
      labelSide={labelSide}
      labelWidth={labelWidth}
      onSelect={(step) => onSelect(actionFor(step))}
      onStart={(step) => onStart(actionFor(step))}
    />
    {folds.length ? <div className="ef-course-route-folds" aria-label="其他章节">
      {folds.map((item) => <div key={item.id} className="ef-course-route-fold">
        <span><strong>第 {item.order} 章 · {item.title}</strong><small>{item.nodeIds.length} 个要点 · {item.microCount} 个小练习</small></span>
        <span className="ef-course-route-fold-progress">{item.learnedCount === item.nodeIds.length && item.nodeIds.length ? <><Check size={13} aria-hidden="true" />已学完</> : `${item.learnedCount} / ${item.nodeIds.length}`}</span>
      </div>)}
    </div> : null}
    <p className="ef-course-route-note"><MapIcon size={13} aria-hidden="true" />只展开当前章；完整结构和能力关系在课程树里查看。</p>
  </div>;
}
