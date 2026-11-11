import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { applicationServices } from "@/app/services/applicationServices";
import { MicroHostLayer, MicroHostProvider, useMicroHostController } from "@/features/home/MicroHost";
import { type RightPanel } from "@/features/home/rightPanel";
import { ObjectPanelSwitch } from "@/features/home/ObjectPanelSwitch";
import { panelForTarget } from "@/features/home/panelForTarget";
import type { CourseRouteStepAction } from "@/features/course/path/CourseRoutePanel";
import { useCourseProjection } from "@/features/course/path/useCourseProjection";
import type { MockSession } from "@/features/auth/types";
import { expandPanelFromRect } from "@/shared/ui/panelMorph";
import { ActiveAssistantObjectContext, type ActiveAssistantObject } from "./activeObject";
import { useAssistantRuntime } from "./AssistantRuntimeContext";
import type { AssistantObjectTarget } from "./objectTarget";
import "@/features/home/home.css";
import "./globalObjectHost.css";

const EMPTY_PANEL: RightPanel = { kind: "none" };

/**
 * One Object Shell host for every page outside Home. The floating Assistant
 * dispatches a presentation-neutral target; this host opens the same panels the
 * Home conversation uses, on the page the learner is already reading.
 */
export function GlobalObjectHost({ session, children }: { session: MockSession; children: React.ReactNode }) {
  const assistant = useAssistantRuntime();
  const location = useLocation();
  const navigate = useNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const microHost = useMicroHostController({ session, conversationKey: assistant.activeSessionId });
  const [panel, setPanel] = useState<RightPanel>(EMPTY_PANEL);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const panelPath = useRef<string | null>(null);
  const savedPanel = useRef<{ path: string; panel: RightPanel } | null>(null);
  const objectPanelRef = useRef<HTMLDivElement>(null);
  const route = useCourseProjection(session, panel.kind === "route" ? panel.courseId : null);

  function openObject(target: AssistantObjectTarget, nextOrigin?: DOMRect, nextTrigger?: HTMLElement | null) {
    setOrigin(nextOrigin ?? null);
    setTrigger(nextTrigger ?? null);
    panelPath.current = location.pathname;
    savedPanel.current = null;
    microHost.dismissSide();
    setPanel(panelForTarget(target));
  }

  function closePanel() {
    savedPanel.current = null;
    setPanel(EMPTY_PANEL);
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AssistantObjectTarget>).detail;
      if (detail && typeof detail === "object") openObject(detail);
    };
    window.addEventListener("eduflow:open-object", handler);
    return () => window.removeEventListener("eduflow:open-object", handler);
  }, [location.pathname]);

  // A dedicated page opened by 放大 closes the panel, and returning restores the
  // same object instead of leaving a stale overlay on the next page.
  useEffect(() => {
    if (panel.kind === "none") {
      const saved = savedPanel.current;
      if (saved && saved.path === location.pathname) {
        savedPanel.current = null;
        setPanel(saved.panel);
      }
      return;
    }
    if (panelPath.current && panelPath.current !== location.pathname) {
      savedPanel.current = { path: panelPath.current, panel: panel };
      setPanel(EMPTY_PANEL);
    }
  }, [location.pathname, panel]);

  useEffect(() => {
    if (panel.kind === "none" || panel.kind === "route") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("dialog[open]")) return;
      closePanel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panel.kind]);

  useEffect(() => {
    if (panel.kind === "none" || panel.kind === "route") return;
    void expandPanelFromRect(objectPanelRef.current, trigger?.isConnected ? trigger.getBoundingClientRect() : origin, reducedMotion);
  }, [origin, panel.kind, reducedMotion, trigger]);

  const activeObject = useMemo<ActiveAssistantObject | null>(() => {
    const presence = microHost.presence;
    if (presence && presence.form !== "closed") {
      const path = applicationServices.microLearningRepository.getPath(presence.knowledgeId, {
        mode: "learn",
        pathId: presence.pathId,
        ...(presence.courseId ? { courseId: presence.courseId } : {})
      });
      return { kind: "micro", pathId: presence.pathId, knowledgeId: presence.knowledgeId, ...(presence.courseId ? { courseId: presence.courseId } : {}), title: path?.title ?? "小练习" };
    }
    if (panel.kind === "knowledge") return { kind: "knowledge", nodeId: panel.nodeId, title: applicationServices.knowledgeRepository.getNode(panel.nodeId, { visibleScopes: ["global", "tenant", "user"], userId: session.userId })?.title ?? "知识点" };
    if (panel.kind === "practice") return { kind: "practice", courseId: panel.courseId, assignmentId: panel.assignmentId, title: panel.title };
    if (panel.kind === "route") return { kind: "route", courseId: panel.courseId, title: route.runtime?.course.title ?? "课程路线" };
    if (panel.kind === "material") return { kind: "material", courseId: panel.courseId, materialId: panel.materialId, title: applicationServices.courseRepository.getCourse(panel.courseId)?.materials.find((item) => item.id === panel.materialId)?.title ?? "资料" };
    if (panel.kind === "records") return { kind: "records", title: "学习记录" };
    if (panel.kind === "brief") {
      const message = assistant.messages.find((item) => item.id === panel.messageId);
      const brief = message?.structuredContent?.type === "course_creation_brief" ? message.structuredContent : null;
      return { kind: "brief", messageId: panel.messageId, title: brief?.goal ?? "课程简介" };
    }
    return null;
  }, [assistant.messages, microHost.presence, panel, route.runtime, session.userId]);

  function openRouteStep(action: CourseRouteStepAction, courseId: string) {
    closePanel();
    if (action.kind === "micro" && action.pathId) {
      microHost.open({ pathId: action.pathId, knowledgeId: action.nodeId, courseId });
      return;
    }
    if (action.kind === "practice" && action.assignmentId) {
      openObject({ kind: "practice", courseId, assignmentId: action.assignmentId });
      return;
    }
    navigate(`/courses/${encodeURIComponent(courseId)}`);
  }

  function openPracticeNext(step: { nodeId?: string; resourceKind: string; resourceId?: string; microPathId?: string; title: string }) {
    const courseId = panel.kind === "practice" ? panel.courseId : null;
    if (!courseId) return;
    closePanel();
    if (step.microPathId && step.nodeId) {
      microHost.open({ pathId: step.microPathId, knowledgeId: step.nodeId, courseId });
      return;
    }
    if (step.resourceKind === "assignment" && step.resourceId) {
      openObject({ kind: "practice", courseId, assignmentId: step.resourceId });
      return;
    }
    navigate(`/courses/${encodeURIComponent(courseId)}`);
  }

  return <MicroHostProvider host={microHost}>
    <ActiveAssistantObjectContext.Provider value={activeObject}>{children}</ActiveAssistantObjectContext.Provider>
    {location.pathname !== "/" ? <MicroHostLayer host={microHost} session={session} /> : null}
    {location.pathname !== "/" ? <ObjectPanelSwitch
      panel={panel}
      session={session}
      messages={assistant.messages}
      onClose={closePanel}
      onOpenCourse={(courseId) => { closePanel(); navigate(`/courses/${encodeURIComponent(courseId)}`); }}
      onSelectNode={(nodeId) => setPanel({ kind: "knowledge", nodeId })}
      route={panel.kind === "route" && route.projection && route.runtime ? {
        panel,
        runtime: route.runtime,
        projection: route.projection,
        decision: route.decision,
        originRect: origin,
        originElement: trigger,
        onStart: (action) => openRouteStep(action, panel.courseId)
      } : null}
      practice={panel.kind === "practice" ? {
        panel,
        assistantSessionId: assistant.activeSessionId ?? undefined,
        onOpenNextStep: openPracticeNext,
        onClose: closePanel,
        surface: { className: "ef-global-object-panel ef-global-practice", ref: objectPanelRef, dataFloatingPanel: true }
      } : null}
      surfaces={{
        route: { className: "ef-global-object-panel", ref: objectPanelRef, dataFloatingPanel: true },
        knowledge: { className: "ef-global-object-panel", ref: objectPanelRef, dataFloatingPanel: true },
        material: { className: "ef-global-object-panel", ref: objectPanelRef, dataFloatingPanel: true },
        records: { className: "ef-global-object-panel", ref: objectPanelRef, dataFloatingPanel: true },
        brief: { className: "ef-global-object-panel", ref: objectPanelRef, dataFloatingPanel: true }
      }}
    /> : null}
  </MicroHostProvider>;
}
