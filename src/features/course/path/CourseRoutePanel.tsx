import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import { buildWindingRoute, type WindingStep, type WindingStepInput } from "@/features/course/immersive/courseTreeLayout";
import { CourseRouteView } from "@/features/course/immersive/CourseRouteView";
import { resolveCourseRouteAction, type HomeCourseProjection } from "./courseLearnerProjection";
import { knowledgeStateLabelFor } from "@/shared/learning/knowledgePresentation";

export type CourseRouteStepAction = {
  step: WindingStep;
  nodeId: string;
  kind: "micro" | "practice" | "none";
  pathId?: string;
  assignmentId?: string;
};

export type CourseRouteMode = "side" | "page";

/**
 * The learner route shown on the Course page and in the Home side panel. It is
 * a normal web document: every chapter of the Course on one continuous road,
 * with no folded rows and no 3D. Layout is derived only from the Course order,
 * the learner's status and the panel width; selection and scrolling live inside
 * CourseRouteView and never recompute these coordinates.
 */
export function CourseRoutePanel({
  projection,
  decision,
  courseTitle,
  showHeader = true,
  width = 560,
  labelWidth,
  mode = "side",
  measureEpoch = 0,
  focusNodeId,
  onSelect,
  onStart
}: {
  projection: HomeCourseProjection;
  decision?: NavigationDecision | null;
  courseTitle: string;
  showHeader?: boolean;
  width?: number;
  labelWidth?: number;
  mode?: CourseRouteMode;
  measureEpoch?: number;
  /** Open the route at this Knowledge step (chapter/card deep link). */
  focusNodeId?: string;
  onSelect(action: CourseRouteStepAction): void;
  onStart(action: CourseRouteStepAction): void;
}) {
  const steps = useMemo<WindingStepInput[]>(() => {
    const opening = projection.segment.started && !projection.segment.complete ? projection.segment.currentStep?.nodeId : undefined;
    const nextNodeId = decision?.nextAction.nodeId;
    const chapterByNode = new Map<string, HomeCourseProjection["chapters"][number]>();
    projection.chapters.forEach((chapter) => chapter.nodeIds.forEach((nodeId) => chapterByNode.set(nodeId, chapter)));
    return projection.chapters.flatMap((chapter) => chapter.nodeIds.map((nodeId) => {
      const micro = projection.microByNode.get(nodeId);
      const practice = projection.practiceByNode.get(nodeId);
      const nodeStatus = projection.knowledgeStatusByNode.get(nodeId);
      const learned = satisfiesTeachingPrerequisite(nodeStatus);
      const currentId = opening ?? nextNodeId;
      const current = currentId === nodeId;
      const choice = resolveCourseRouteAction({
        nodeId,
        ...(micro ? { micro } : {}),
        ...(practice ? { practice } : {}),
        ...(projection.segment.currentStep ? { currentStep: { nodeId: projection.segment.currentStep.nodeId, kind: projection.segment.currentStep.kind } } : {}),
        microLearned: learned,
        practiceDone: projection.segment.steps.find((item) => item.kind === "practice" && item.nodeId === nodeId)?.status === "done"
      });
      const chosenMinutes = choice.kind === "micro" ? micro?.estimatedMinutes : choice.kind === "practice" ? practice?.estimatedMinutes : undefined;
      const meta = choice.kind === "micro"
        ? `小练习${practice ? " · 之后有动手任务" : ""}`
        : choice.kind === "practice"
          ? "动手任务"
          : undefined;
      return {
        id: nodeId,
        title: projection.titleByNode.get(nodeId) ?? nodeId,
        chapterId: chapterByNode.get(nodeId)?.id ?? chapter.id,
        chapterTitle: chapterByNode.get(nodeId)?.title ?? chapter.title,
        chapterNumber: chapterByNode.get(nodeId)?.displayNumber ?? chapter.displayNumber,
        status: current ? "current" : learned ? "done" : "locked",
        stateLabel: current ? "当前" : knowledgeStateLabelFor(nodeStatus),
        learned,
        ...(chosenMinutes ? { minutes: chosenMinutes } : {}),
        ...(meta ? { meta } : {}),
        kind: choice.kind === "micro" ? "micro" : choice.kind === "practice" ? "practice" : "none"
      } satisfies WindingStepInput;
    }));
  }, [decision?.nextAction.nodeId, projection]);

  const hostRef = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState<number | null>(null);
  const lastSideWidth = useRef<number | null>(null);

  // The route must follow the real container, including the 460px side panel
  // at 1280 and the 420px one below it. Reserve 16px for a classic scrollbar.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const next = Math.max(280, Math.floor(host.clientWidth / 8) * 8 - 16);
      setHostWidth((current) => current === next ? current : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const fittedWidth = Math.min(width, hostWidth ?? width);
  // Switching side/page moves the same instance into a wider host; keep the
  // side-form coordinates so scroll and selection cannot jump with the morph.
  const effectiveWidth = mode === "page" && lastSideWidth.current ? lastSideWidth.current : fittedWidth;
  useLayoutEffect(() => {
    if (mode !== "page") lastSideWidth.current = fittedWidth;
  }, [fittedWidth, mode]);

  const cardWidth = effectiveWidth < 400 ? 120 : effectiveWidth < 480 ? 140 : effectiveWidth < 540 ? 160 : 200;
  const maxLabelWidth = effectiveWidth < 400 ? 90 : effectiveWidth < 480 ? 110 : effectiveWidth < 540 ? 130 : 140;
  const resolvedLabelWidth = Math.min(labelWidth ?? maxLabelWidth, maxLabelWidth);
  const layout = useMemo(() => buildWindingRoute(steps, effectiveWidth), [effectiveWidth, steps]);
  const actionFor = (step: WindingStep): CourseRouteStepAction => {
    const micro = projection.microByNode.get(step.id);
    const practice = projection.practiceByNode.get(step.id);
    const currentStep = projection.segment.currentStep;
    const practiceStatus = projection.segment.steps.find((item) => item.kind === "practice" && item.nodeId === step.id)?.status;
    const choice = resolveCourseRouteAction({
      nodeId: step.id,
      ...(micro ? { micro } : {}),
      ...(practice ? { practice } : {}),
      ...(currentStep ? { currentStep: { nodeId: currentStep.nodeId, kind: currentStep.kind } } : {}),
      microLearned: satisfiesTeachingPrerequisite(projection.knowledgeStatusByNode.get(step.id)),
      practiceDone: practiceStatus === "done"
    });
    if (choice.kind === "micro") return { step, nodeId: step.id, kind: "micro", pathId: choice.pathId };
    if (choice.kind === "practice") return { step, nodeId: step.id, kind: "practice", assignmentId: choice.assignmentId };
    return { step, nodeId: step.id, kind: "none" };
  };

  return <div className="ef-course-route-host" ref={hostRef}>
    <CourseRouteView
      layout={layout}
      steps={steps}
      mode={mode}
      measureEpoch={measureEpoch}
      focusStepId={focusNodeId}
      courseTitle={courseTitle}
      cardWidth={cardWidth}
      usingActiveRoute
      routeRecommended
      reducedMotion={false}
      showHeader={showHeader}
      showAdjust={false}
      labelWidth={resolvedLabelWidth}
      onSelect={(step) => onSelect(actionFor(step))}
      onStart={(step) => onStart(actionFor(step))}
    />
  </div>;
}
