import { Maximize2, Network, PanelRight, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate, useReducedMotion } from "motion/react";
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
export function HomeRoutePanel({ courseTitle, projection, decision, onClose, onOpenTree, onStart, onModeChange }: {
  courseTitle: string;
  projection: HomeCourseProjection;
  decision?: NavigationDecision | null;
  onClose(): void;
  onOpenTree(): void;
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
  const originRect = useRef<DOMRect | null>(null);
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
    originRect.current = container.getBoundingClientRect();
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
    const from = originRect.current ?? container.getBoundingClientRect();
    const scrollTop = scrollPosition.current;
    if (container.parentElement !== target) target.appendChild(container);
    originRect.current = null;
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
    {createPortal(<section className="ef-home-route-panel" data-at={mode} aria-label="课程路线">
      <header className="ef-home-route-panel-head">
        <div>
          <span className="ef-home-route-panel-subtitle" title={`${courseTitle} · 共 ${projection.chapters.length} 章`}>{courseTitle} · 共 {projection.chapters.length} 章</span>
          <h2>你的学习路线</h2>
        </div>
        <div className="ef-home-route-panel-tools">
          {narrow ? null : <div className="ef-course-route-modes" role="group" aria-label="切换路线显示方式">
            <button type="button" aria-pressed={mode === "side"} onClick={() => changeMode("side")}><PanelRight size={13} aria-hidden="true" />侧边</button>
            <button type="button" aria-pressed={mode === "page"} onClick={() => changeMode("page")}><Maximize2 size={13} aria-hidden="true" />整页</button>
          </div>}
          <button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭路线面板"><X size={16} /></button>
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
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={onOpenTree}><Network size={13} />立体视图</button>
      </footer>
    </section>, container)}
  </>;
}
