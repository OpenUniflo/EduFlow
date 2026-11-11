import type { ReactNode, RefObject } from "react";
import { archiveHref } from "@/features/archive/model/atlasParams";
import type { AssistantMessage } from "@/features/assistant/assistantContract";
import type { MockSession } from "@/features/auth/types";
import { PracticeObject } from "@/features/course/practice/PracticeObject";
import type { CourseRouteMode, CourseRouteStepAction } from "@/features/course/path/CourseRoutePanel";
import type { HomeCourseProjection } from "@/features/course/path/courseLearnerProjection";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { CourseBriefPanel } from "./CourseBriefPanel";
import { HomeRoutePanel } from "./HomeRoutePanel";
import { KnowledgePanel } from "./KnowledgePanel";
import { MaterialPanel } from "./MaterialPanel";
import { RecordsPanel } from "./RecordsPanel";
import type { RightPanel } from "./rightPanel";

/** A host-owned wrapper around one panel kind. Home and GlobalObjectHost only
 * differ in these surfaces and in their state/history lifecycle. */
export type ObjectPanelSurface = {
  className?: string;
  ref?: RefObject<HTMLDivElement | null>;
  onPointerDown?(): void;
  dataFloatingPanel?: boolean;
};

export type ObjectPanelRoute = {
  panel: Extract<RightPanel, { kind: "route" }>;
  runtime: CourseRuntimeData;
  projection: HomeCourseProjection;
  decision: NavigationDecision | null;
  onModeChange?(mode: CourseRouteMode): void;
  originRect?: DOMRect | null;
  originElement?: HTMLElement | null;
  onBack?(): void;
  backLabel?: string;
  onStart(action: CourseRouteStepAction, courseId: string): void;
  onInteract?(): void;
};

export type ObjectPanelPractice = {
  panel: Extract<RightPanel, { kind: "practice" }>;
  assistantSessionId?: string;
  onOpenNextStep(step: { nodeId?: string; resourceKind: string; resourceId?: string; microPathId?: string; title: string }): void;
  onClose(): void;
  surface: ObjectPanelSurface;
};

export type ObjectPanelSwitchProps = {
  panel: RightPanel;
  session: MockSession;
  messages: readonly AssistantMessage[];
  onClose(): void;
  onOpenCourse(courseId: string): void;
  onSelectNode(nodeId: string): void;
  route?: ObjectPanelRoute | null;
  practice?: ObjectPanelPractice | null;
  surfaces?: Partial<Record<RightPanel["kind"], ObjectPanelSurface>>;
};

function Surface({ surface, children }: { surface?: ObjectPanelSurface; children: ReactNode }) {
  if (!surface) return <>{children}</>;
  return <div ref={surface.ref} className={surface.className} onPointerDown={surface.onPointerDown} data-floating-panel={surface.dataFloatingPanel ? "true" : undefined}>{children}</div>;
}

/**
 * The only panel render switch. Hosts pass their surface wrappers and
 * host-specific callbacks; no host re-lists the panel components.
 */
export function ObjectPanelSwitch({
  panel,
  session,
  messages,
  onClose,
  onOpenCourse,
  onSelectNode,
  route,
  practice,
  surfaces
}: ObjectPanelSwitchProps) {
  const practiceNode = practice ? <Surface surface={practice.surface}>
    <PracticeObject
      key={`${practice.panel.courseId}:${practice.panel.assignmentId}`}
      session={session}
      courseId={practice.panel.courseId}
      assignmentId={practice.panel.assignmentId}
      {...(practice.panel.attemptId ? { attemptId: practice.panel.attemptId } : {})}
      size="panel"
      assistantSessionId={practice.assistantSessionId}
      onOpenNextStep={practice.onOpenNextStep}
      onClose={practice.onClose}
      onReturn={practice.onClose}
    />
  </Surface> : null;

  if (panel.kind === "practice") return practiceNode;

  let active: ReactNode = null;
  if (panel.kind === "route" && route) {
    active = <Surface surface={surfaces?.route}>
      <HomeRoutePanel
        courseId={route.panel.courseId}
        {...(route.panel.chapterId ? { chapterId: route.panel.chapterId } : {})}
        {...(route.panel.nodeId ? { focusNodeId: route.panel.nodeId } : {})}
        originRect={route.originRect}
        originElement={route.originElement}
        courseTitle={route.runtime.course.title}
        projection={route.projection}
        decision={route.decision}
        {...(route.onBack ? { onBack: route.onBack } : {})}
        {...(route.backLabel ? { backLabel: route.backLabel } : {})}
        {...(route.onModeChange ? { onModeChange: route.onModeChange } : {})}
        onClose={onClose}
        onStart={(action) => route.onStart(action, route.panel.courseId)}
        {...(route.onInteract ? { onInteract: route.onInteract } : {})}
      />
    </Surface>;
  } else if (panel.kind === "knowledge") {
    active = <Surface surface={surfaces?.knowledge}>
      <KnowledgePanel
        session={session}
        nodeId={panel.nodeId}
        archiveHref={archiveHref({ focus: `knowledge:${panel.nodeId}` })}
        onClose={onClose}
        onOpenCourse={onOpenCourse}
        onSelectNode={onSelectNode}
      />
    </Surface>;
  } else if (panel.kind === "material") {
    active = <Surface surface={surfaces?.material}>
      <MaterialPanel
        courseId={panel.courseId}
        materialId={panel.materialId}
        {...(panel.segmentId ? { segmentId: panel.segmentId } : {})}
        onClose={onClose}
      />
    </Surface>;
  } else if (panel.kind === "records") {
    active = <Surface surface={surfaces?.records}><RecordsPanel onClose={onClose} /></Surface>;
  } else if (panel.kind === "brief") {
    active = <Surface surface={surfaces?.brief}>
      <CourseBriefPanel messageId={panel.messageId} messages={messages} onClose={onClose} />
    </Surface>;
  }

  return <>{practiceNode}{active}</>;
}
