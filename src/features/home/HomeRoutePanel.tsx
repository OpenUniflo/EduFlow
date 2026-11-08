import { ArrowRight, Maximize2, Network, PanelRight, Route, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate, useReducedMotion } from "motion/react";
import { expandPanelFromRect, contractPanelToRect } from "@/shared/ui/panelMorph";
import { Pill } from "@/shared/ui/Pill";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { CourseRoutePanel, type CourseRouteMode, type CourseRouteStepAction } from "@/features/course/path/CourseRoutePanel";
import type { HomeCourseProjection } from "@/features/course/path/courseLearnerProjection";
import "./home.css";

const MORPH_MS = 400;
const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

/**
 * Home's route panel. One mounted CourseRoutePanel instance lives in a portal
 * container that is moved between the side slot and a native modal dialog, so
 * switching 侧边 / 整页 never remounts the route or loses its scroll/selection.
 */
export function HomeRoutePanel({ courseId, originRect, courseTitle, projection, decision, onClose, onOpenTree, onOpenCourse, onInteract, onStart, onModeChange }: {
  courseId: string;
  originRect?: DOMRect | null;
  courseTitle: string;
  projection: HomeCourseProjection;
  decision?: NavigationDecision | null;
  onClose(): void;
  onOpenTree(): void;
  onOpenCourse(): void;
  onInteract?(): void;
  onStart(action: CourseRouteStepAction): void;
  onModeChange?(mode: CourseRouteMode): void;
}) {
  const [mode, setMode] = useState<CourseRouteMode>("side");
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const reducedMotion = Boolean(useReducedMotion());
  const sideHost = useRef<HTMLElement>(null);
  const sideSlot = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pageSlot = useRef<HTMLDivElement>(null);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const modeOrigin = useRef<DOMRect | null>(null);
  const entered = useRef(false);
  const closing = useRef(false);
  const scrollPosition = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const restoreScrollPending = useRef(false);
  const [settleEpoch, setSettleEpoch] = useState(0);
  const [container] = useState(() => {
    const element = document.createElement("div");
    element.className = "ef-route-instance";
    element.dataset.routeInstance = "1";
    return element;
  });

  useEffect(() => onModeChange?.(mode), [mode, onModeChange]);

  /** Capture the live rectangle and scroll offset before the old host hides. */
  const changeMode = (next: CourseRouteMode) => {
    if (next === modeRef.current) return;
    const scroller = container.querySelector<HTMLElement>(".ef-imm-route-view");
    if (scroller) scrollPosition.current = scroller.scrollTop;
    modeOrigin.current = container.getBoundingClientRect();
    restoreScrollPending.current = true;
    setMode(next);
  };

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const update = () => {
      setNarrow(query.matches);
      if (query.matches) changeMode("side");
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Open the top layer before the move so the destination rectangle is real
  // when the FLIP measures it.
  useLayoutEffect(() => {
    if (mode === "page" && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
    if (mode !== "page" && dialogRef.current?.open) dialogRef.current.close();
  }, [mode]);

  // Move the already-mounted route; FLIP from the old visual rectangle to the
  // new one so both forms read as one object changing size.
  useLayoutEffect(() => {
    const target = mode === "page" ? pageSlot.current : sideSlot.current;
    if (!target) return;
    const from = modeOrigin.current ?? container.getBoundingClientRect();
    const scrollTop = scrollPosition.current;
    if (container.parentElement !== target) target.appendChild(container);
    modeOrigin.current = null;
    // Reparenting a scroll container can reset its offset in Chromium; keep
    // the exact reading position across the form change.
    const restoreScroll = () => {
      const next = container.querySelector<HTMLElement>(".ef-imm-route-view");
      if (next && next.scrollTop !== scrollTop) next.scrollTop = scrollTop;
    };
    if (restoreScrollPending.current) {
      restoreScroll();
      window.requestAnimationFrame(restoreScroll);
      restoreScrollPending.current = false;
    }
    const to = container.getBoundingClientRect();
    animation.current?.cancel();
    container.style.transform = "";
    const settle = () => setSettleEpoch((value) => value + 1);
    if (reducedMotion || !from.width || !from.height || !to.width || !to.height) {
      window.requestAnimationFrame(settle);
      return;
    }
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const scaleX = from.width / to.width;
    const scaleY = from.height / to.height;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01) return;
    container.style.transformOrigin = "top left";
    const controls = animate(container, {
      transform: [`translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`, "translate(0px, 0px) scale(1, 1)"]
    }, { duration: MORPH_MS / 1000, ease: EASE_OUT });
    animation.current = controls;
    void controls.finished.catch(() => undefined).then(() => {
      if (animation.current !== controls) return;
      animation.current = null;
      container.style.transform = "";
      container.style.transformOrigin = "";
      settle();
    });
  }, [container, mode, reducedMotion]);

  // The panel grows from the card/row that opened it, never from the screen
  // edge. Reduced motion opens at its final size directly.
  useLayoutEffect(() => {
    if (entered.current) return;
    entered.current = true;
    void expandPanelFromRect(container, originRect, reducedMotion);
  }, [container, originRect, reducedMotion]);

  const closeWithMorph = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    await contractPanelToRect(container, originRect, reducedMotion);
    onClose();
  }, [container, onClose, originRect, reducedMotion]);

  // The side panel owns its close so it contracts back before unmount. Page
  // mode keeps its existing Esc-to-side behaviour.
  useEffect(() => {
    if (mode === "page") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      void closeWithMorph();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeWithMorph, mode]);

  // Esc in page form returns to the side form; the global Home listener must
  // not close the whole route.
  useEffect(() => {
    if (mode !== "page") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      changeMode("side");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode]);

  useEffect(() => () => { animation.current?.cancel(); }, []);

  return <>
    <aside ref={sideHost} className="ef-home-route-panel-host" aria-label="完整路线" hidden={mode === "page"}>
      <div ref={sideSlot} className="ef-route-slot" />
    </aside>
    <dialog
      ref={dialogRef}
      className="ef-home-route-page"
      aria-label="完整路线"
      onCancel={(event) => { event.preventDefault(); changeMode("side"); }}
      onClick={(event) => { if (event.target === event.currentTarget) changeMode("side"); }}
    >
      <div ref={pageSlot} className="ef-route-page-slot" />
    </dialog>
    {createPortal(<section className="ef-home-route-panel" data-at={mode} data-course-id={courseId} aria-label="课程路线" onPointerDown={onInteract}>
      <header className="ef-home-route-panel-head">
        <span className="ef-home-route-panel-icon" aria-hidden="true"><Route size={16} /></span>
        <div className="ef-home-route-panel-title">
          <span className="ef-home-route-panel-subtitle" title={`你的学习路线 · 共 ${projection.chapters.length} 章`}>你的学习路线 · 共 {projection.chapters.length} 章</span>
          <h2>{courseTitle}</h2>
        </div>
        <Pill tone={projection.segment.complete ? "ok" : projection.segment.started ? "brand" : "quiet"} dot>{projection.segment.complete ? "已完成" : projection.segment.started ? "进行中" : "未开始"}</Pill>
        <div className="ef-home-route-panel-tools">
          {narrow ? null : <div className="ef-course-route-modes" role="group" aria-label="切换路线显示方式">
            <button type="button" aria-pressed={mode === "side"} aria-label="侧边显示" title="侧边显示" onClick={() => changeMode("side")}><PanelRight size={13} aria-hidden="true" /><span>侧边</span></button>
            <button type="button" aria-pressed={mode === "page"} aria-label="整页显示" title="整页显示" onClick={() => changeMode("page")}><Maximize2 size={13} aria-hidden="true" /><span>整页</span></button>
          </div>}
          <button type="button" className="ef-home-icon" onClick={() => void closeWithMorph()} aria-label="关闭路线面板"><X size={16} /></button>
        </div>
      </header>
      <div className="ef-home-route-panel-body">
        <CourseRoutePanel
          projection={projection}
          decision={decision}
          courseTitle={courseTitle}
          width={500}
          labelWidth={140}
          mode={mode}
          measureEpoch={settleEpoch}
          showHeader={false}
          onSelect={() => undefined}
          onStart={onStart}
          onOpenTree={onOpenTree}
        />
      </div>
      <footer className="ef-home-route-panel-foot">
        <span>一条路线走完所有章节</span>
        <span className="ef-home-route-panel-actions">
          <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={onOpenTree}><Network size={13} />立体视图</button>
          <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onOpenCourse} aria-label={`进入课程 ${courseTitle}`}>进入课程<ArrowRight size={13} /></button>
        </span>
      </footer>
    </section>, container)}
  </>;
}
