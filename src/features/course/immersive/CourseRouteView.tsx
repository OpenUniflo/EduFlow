import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, Edit3, Flag, Play } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { WindingRouteLayout, WindingStep, WindingStepInput } from "./courseTreeLayout";
import "./immersive.css";

type ContinueStep = { title: string; minutes?: number; meta?: string; onStart(): void };

export type CourseRouteMode = "side" | "page";

type Props = {
  layout: WindingRouteLayout;
  steps: readonly WindingStepInput[];
  usingActiveRoute: boolean;
  routeRecommended?: boolean;
  routeVersionNumber?: number;
  reducedMotion: boolean;
  continueStep?: ContinueStep;
  showHeader?: boolean;
  showAdjust?: boolean;
  labelWidth?: number;
  /** A card may ask the route to open at one chapter or step, not only the current step. */
  focusStepId?: string;
  mode?: CourseRouteMode;
  measureEpoch?: number;
  cardWidth?: number;
  courseTitle?: string;
  onSelect(step: WindingStep): void;
  onStart(step: WindingStep): void;
  onAdjust?(): void;
};

type Rect = { left: number; top: number; right: number; bottom: number };
type Placement = { index: number; left: number; top: number };

const CARD_GAP = 52;
const CANVAS_EDGE = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function overlapArea(a: Rect, b: Rect) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

function stepActionLabel(step: WindingStep) {
  if (step.status === "current") return step.kind === "practice" ? "打开任务" : "开始";
  if (step.status === "done") return step.kind === "practice" ? "再做" : "再练";
  return "";
}

type RouteStepRowProps = {
  step: WindingStep;
  isCurrent: boolean;
  isSelected: boolean;
  labelWidth: number;
  width: number;
  onChoose(step: WindingStep): void;
  registerStep(index: number, element: HTMLButtonElement | null): void;
  registerLabel(index: number, element: HTMLButtonElement | null): void;
};

/** Memoised so a sticky-header update never re-renders the other 116 steps. */
const RouteStepRow = memo(function RouteStepRow({ step, isCurrent, isSelected, labelWidth, width, onChoose, registerStep, registerLabel }: RouteStepRowProps) {
  const leftRoom = step.x - 56 - CANVAS_EDGE;
  const rightRoom = width - CANVAS_EDGE - (step.x + 56);
  // Put the label on the smaller side and leave the larger side for the one
  // action card. This keeps both inside the lane on narrow side panels.
  const side = leftRoom > rightRoom ? "right" : "left";
  return <div>
    <button
      ref={(element) => registerStep(step.index, element)}
      type="button"
      className={`ef-imm-route-step is-${step.status}${isSelected ? " is-selected" : ""}`}
      style={{ left: `${step.x}px`, top: `${step.y - 48}px` }}
      data-route-interactive
      aria-label={`${step.title} · ${isCurrent ? "当前" : step.status === "locked" ? "未解锁" : step.stateLabel}`}
      aria-current={isCurrent ? "step" : undefined}
      onClick={() => onChoose(step)}
    >
      <span className="ef-imm-route-disc" aria-hidden="true" />
      <span className="ef-imm-route-icon" aria-hidden="true">{step.status === "done" ? "✓" : step.status === "current" ? "▶" : ""}</span>
    </button>
    <button
      ref={(element) => registerLabel(step.index, element)}
      type="button"
      tabIndex={-1}
      data-route-interactive
      className={`ef-imm-route-label ${side === "right" ? "is-right" : "is-left"} ${step.status === "locked" ? "is-pending" : ""}${isSelected ? " is-selected" : ""}`}
      style={{ left: `${side === "right" ? step.x + 56 : step.x - 56 - labelWidth}px`, top: `${step.y - 12}px`, width: `${labelWidth}px` }}
      onClick={() => onChoose(step)}
    >
      <b>{step.title}</b>
      <small>{isCurrent ? "当前" : step.status === "locked" ? "未解锁" : step.stateLabel}{step.minutes ? ` · ${step.minutes} 分钟` : ""}{step.meta ? ` · ${step.meta}` : ""}</small>
    </button>
  </div>;
});

/**
 * Duolingo / Brilliant style journey. The DOM owns the scroll container; the
 * path and disc coordinates are the pure `buildWindingRoute` result. Selection
 * and the sticky chapter header are presentation state only: they never rebuild
 * the layout or move a node.
 */
export function CourseRouteView({
  layout, steps, usingActiveRoute, routeRecommended = false, routeVersionNumber, reducedMotion,
  continueStep, showHeader = true, showAdjust = true, labelWidth = 180, focusStepId, mode = "side", measureEpoch = 0,
  cardWidth = 200,
  courseTitle,
  onSelect, onStart, onAdjust
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef(new Map<number, HTMLButtonElement>());
  const labelRefs = useRef(new Map<number, HTMLButtonElement>());
  const headerRefs = useRef(new Map<string, HTMLDivElement>());
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());
  const positionedLayout = useRef<WindingRouteLayout | null>(null);
  const userScrolled = useRef(false);
  const suppressScrollEnd = useRef(false);
  const [ready, setReady] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const focusIndex = focusStepId ? layout.steps.findIndex((step) => step.id === focusStepId) : -1;
  const [activeHeaderId, setActiveHeaderId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [measureVersion, setMeasureVersion] = useState(0);
  const reduceMotion = reducedMotion || Boolean(useReducedMotion());
  const resolvedLabelWidth = Math.min(labelWidth, layout.width < 480 ? 110 : layout.width < 540 ? 130 : 140);
  const current = layout.currentIndex >= 0 ? layout.steps[layout.currentIndex] : null;
  const done = layout.steps.filter((step) => step.learned ?? step.status === "done").length;
  const routeLabel = routeRecommended ? "推荐路线" : "我的路线";
  const selected = selectedIndex == null ? current : layout.steps[selectedIndex];
  const activeHeader = layout.headers.find((header) => header.id === activeHeaderId)
    ?? layout.headers.find((header) => header.id === headerForStep(layout, current)?.id)
    ?? layout.headers[0];
  const activeSteps = activeHeader ? steps.filter((step) => step.chapterId === activeHeader.chapterId) : [];
  const activeDone = activeSteps.filter((step) => step.learned ?? step.status === "done").length;

  /** The chapter a step belongs to when a chapter id repeats in the route. */
  function headerForStep(route: WindingRouteLayout, step: WindingStep | null) {
    if (!step) return route.headers[0];
    let match = route.headers[0];
    for (const header of route.headers) if (header.y <= step.y) match = header;
    return match;
  }

  /** Return the view to the current step; Esc/blank use the smooth variant. */
  const revealCurrent = useCallback((smooth = true) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const top = current ? Math.max(0, current.y - scroller.clientHeight * 0.5) : 0;
    if (smooth && !reduceMotion) scroller.scrollTo({ top, behavior: "smooth" });
    else scroller.scrollTop = top;
    setActiveHeaderId(headerForStep(layout, current)?.id ?? null);
  }, [current, layout, reduceMotion]);

  // First paint is held back until the current step has been placed at the
  // middle of the viewport. This is a direct assignment, never a scroll
  // animation from the top, and it survives a portal move to the page form.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const target = focusStepId && focusIndex >= 0 ? layout.steps[focusIndex] : layout.currentIndex >= 0 ? layout.steps[layout.currentIndex] : null;
    if (!scroller) return;
    if (!target) {
      setActiveHeaderId(layout.headers[0]?.id ?? null);
      setReady(true);
      return;
    }
    const apply = () => {
      const height = scroller.clientHeight;
      if (!height) return false;
      const top = Math.max(0, target.y - height * 0.5);
      suppressScrollEnd.current = true;
      scroller.scrollTop = top;
      window.setTimeout(() => { suppressScrollEnd.current = false; }, 160);
      setActiveHeaderId(headerForStep(layout, target)?.id ?? null);
      positionedLayout.current = layout;
      setReady(true);
      return true;
    };
    if (apply()) return;
    if (typeof ResizeObserver === "undefined") { setReady(true); return; }
    const observer = new ResizeObserver(() => { if (apply()) observer.disconnect(); });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [focusIndex, focusStepId, layout]);

  // A later structural revision gets the same one-shot positioning, but only
  // after the panel was already positioned once.
  useLayoutEffect(() => {
    if (!ready || positionedLayout.current === layout) return;
    const scroller = scrollRef.current;
    const target = focusStepId && focusIndex >= 0 ? layout.steps[focusIndex] : layout.currentIndex >= 0 ? layout.steps[layout.currentIndex] : null;
    if (!scroller || !target) return;
    suppressScrollEnd.current = true;
    scroller.scrollTop = Math.max(0, target.y - scroller.clientHeight * 0.5);
    window.setTimeout(() => { suppressScrollEnd.current = false; }, 160);
    positionedLayout.current = layout;
    setActiveHeaderId(headerForStep(layout, target)?.id ?? null);
  }, [focusIndex, focusStepId, layout, ready]);

  // The portal host restores scrollTop after moving between forms; ignore the
  // resulting scrollend so it cannot move the sticky bar back a chapter.
  useEffect(() => {
    suppressScrollEnd.current = true;
    const timer = window.setTimeout(() => { suppressScrollEnd.current = false; }, 260);
    return () => window.clearTimeout(timer);
  }, [mode]);

  // The sticky chapter header is driven by IntersectionObserver, never by a
  // per-frame scroll handler. On each crossing we read the real header
  // positions once and pick the last banner already above the reading line.
  useEffect(() => {
    if (!ready) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    // Keep the chapter of the current step until the learner actually scrolls;
    // then the observer owns the sticky header.
    const markScrolled = () => { userScrolled.current = true; };
    const update = () => {
      if (!userScrolled.current) return;
      const list = [...sectionRefs.current.entries()]
        .flatMap(([id, element]) => element.isConnected ? [{ id, top: element.getBoundingClientRect().top }] : [])
        .sort((left, right) => left.top - right.top);
      if (!list.length) return;
      const line = scroller.getBoundingClientRect().top + 64;
      let active = list[0].id;
      for (const item of list) if (item.top <= line) active = item.id;
      setActiveHeaderId(active);
    };
    // Programmatic jumps can cross a whole chapter between two observer
    // frames. `scrollend` recomputes once after the jump; it is not a
    // per-frame scroll calculation.
    const onScrollEnd = () => {
      if (suppressScrollEnd.current) return;
      userScrolled.current = true;
      update();
    };
    scroller.addEventListener("wheel", markScrolled, { passive: true });
    scroller.addEventListener("touchmove", markScrolled, { passive: true });
    scroller.addEventListener("keydown", markScrolled);
    scroller.addEventListener("scrollend", onScrollEnd);
    if (typeof IntersectionObserver === "undefined") return () => {
      scroller.removeEventListener("wheel", markScrolled);
      scroller.removeEventListener("touchmove", markScrolled);
      scroller.removeEventListener("keydown", markScrolled);
      scroller.removeEventListener("scrollend", onScrollEnd);
    };
    const observer = new IntersectionObserver(update, {
      root: scroller,
      rootMargin: "0px 0px -70% 0px",
      threshold: [0, 0.01, 1]
    });
    sectionRefs.current.forEach((element) => { if (element.isConnected) observer.observe(element); });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("wheel", markScrolled);
      scroller.removeEventListener("touchmove", markScrolled);
      scroller.removeEventListener("keydown", markScrolled);
      scroller.removeEventListener("scrollend", onScrollEnd);
    };
  }, [layout, mode, ready]);

  // The action card is placed from measured rectangles. Only the card moves;
  // every route node keeps the coordinates produced by buildWindingRoute.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const canvas = canvasRef.current;
    const scroller = scrollRef.current;
    if (!card || !canvas || !scroller || !selected) { setPlacement(null); return; }
    const canvasRect = canvas.getBoundingClientRect();
    const width = canvas.clientWidth || layout.width;
    const height = canvas.clientHeight || layout.height;
    const actualWidth = card.offsetWidth || cardWidth;
    const cardHeight = card.offsetHeight || 72;
    const obstacles: Rect[] = [];
    const collect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      obstacles.push({ left: rect.left - canvasRect.left, top: rect.top - canvasRect.top, right: rect.right - canvasRect.left, bottom: rect.bottom - canvasRect.top });
    };
    stepRefs.current.forEach(collect);
    labelRefs.current.forEach(collect);
    headerRefs.current.forEach(collect);
    const boundedLeft = (left: number) => clamp(left, CANVAS_EDGE, width - actualWidth - CANVAS_EDGE);
    const boundedTop = (top: number) => clamp(top, CANVAS_EDGE, height - cardHeight - CANVAS_EDGE);
    const centerLeft = selected.x - actualWidth / 2;
    const edgeLeft = CANVAS_EDGE;
    const edgeRight = width - actualWidth - CANVAS_EDGE;
    const besideRight = selected.x + 56;
    const besideLeft = selected.x - 56 - actualWidth;
    const chapterBanner = [...layout.headers].filter((header) => header.y <= selected.y).pop();
    const nearTop = Math.max(
      selected.y - cardHeight / 2,
      chapterBanner ? chapterBanner.y + chapterBanner.height / 2 + CANVAS_EDGE : CANVAS_EDGE
    );
    // Current step gets the reserved slot below its text; other nodes prefer a
    // side that does not cross their own label.
    const belowTop = selected.y + 74;
    const aboveTop = selected.y - CARD_GAP - cardHeight;
    const make = (left: number, top: number) => ({ left: boundedLeft(left), top: boundedTop(top) });
    const belowRow = [make(centerLeft, belowTop), make(edgeLeft, belowTop), make(edgeRight, belowTop)];
    const nearRow = [make(centerLeft, nearTop), make(edgeLeft, nearTop), make(edgeRight, nearTop)];
    const aboveRow = [make(centerLeft, aboveTop), make(edgeLeft, aboveTop), make(edgeRight, aboveTop)];
    const besideRow = [make(besideRight, nearTop), make(besideLeft, nearTop), make(besideRight, belowTop), make(besideLeft, belowTop)];
    const ordered = selectedIndex == null
      ? [...belowRow, ...nearRow, ...besideRow, ...aboveRow]
      : [...besideRow, ...nearRow, ...belowRow, ...aboveRow];
    const inBounds = (candidate: { left: number; top: number }) => candidate.left >= CANVAS_EDGE - 0.5
      && candidate.top >= CANVAS_EDGE - 0.5
      && candidate.left + actualWidth <= width - CANVAS_EDGE + 0.5
      && candidate.top + cardHeight <= height - CANVAS_EDGE + 0.5;
    const unique: Array<{ left: number; top: number }> = [];
    const seen = new Set<string>();
    ordered.forEach((candidate) => {
      const key = `${Math.round(candidate.left)}:${Math.round(candidate.top)}`;
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(candidate);
    });
    const valid = unique.filter(inBounds);
    const candidates = valid.length ? valid : unique;
    const overlaps = candidates.map((candidate) => {
      const rect = { left: candidate.left, top: candidate.top, right: candidate.left + actualWidth, bottom: candidate.top + cardHeight };
      return obstacles.reduce((area, obstacle) => area + overlapArea(rect, obstacle), 0);
    });
    const best = Math.min(...overlaps);
    const chosen = candidates[overlaps.indexOf(best)] ?? belowRow[0];
    setPlacement({ index: selected.index, left: chosen.left, top: chosen.top });
  }, [selected, layout, measureVersion, selectedIndex, measureEpoch]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const canvas = canvasRef.current;
    if (!scroller || !canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setMeasureVersion((value) => value + 1));
    observer.observe(scroller);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [mode]);

  // Esc returns the card to the current step first. Only a second Esc reaches
  // the panel host (which closes the side panel or leaves the page form).
  useEffect(() => {
    if (selectedIndex == null || mode === "page") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedIndex(null);
      revealCurrent(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode, revealCurrent, selectedIndex]);

  useEffect(() => {
    if (selectedIndex != null && selectedIndex >= layout.steps.length) setSelectedIndex(null);
  }, [layout.steps.length, selectedIndex]);

  const placed = placement && selected && placement.index === selected.index;
  const cardVisible = Boolean(selected && placed);
  const currentChapterHeader = headerForStep(layout, current);

  const chooseStep = useCallback((step: WindingStep) => {
    setSelectedIndex(step.index);
    onSelect(step);
  }, [onSelect]);

  const registerStep = useCallback((index: number, element: HTMLButtonElement | null) => {
    if (element) stepRefs.current.set(index, element);
    else stepRefs.current.delete(index);
  }, []);

  const registerLabel = useCallback((index: number, element: HTMLButtonElement | null) => {
    if (element) labelRefs.current.set(index, element);
    else labelRefs.current.delete(index);
  }, []);

  function clearSelection(event: React.MouseEvent<HTMLDivElement>) {
    if (selectedIndex == null) return;
    if ((event.target as Element).closest("[data-route-interactive]")) return;
    setSelectedIndex(null);
    revealCurrent(true);
  }

  return <div className={`ef-course-route-shell is-${mode}${ready ? " is-ready" : ""}`} data-route-mode={mode}>
    <div className="ef-imm-route-view" ref={scrollRef} aria-label={routeLabel} onClick={clearSelection}>
      <div className="ef-imm-route-sticky" role="status" style={{ width: `${layout.width}px` }}>
        <BookOpen size={14} aria-hidden="true" />
        <b>{activeHeader?.title ?? currentChapterHeader?.title ?? courseTitle ?? "课程路线"}</b>
        <span>已学 {activeDone} / {activeSteps.length}</span>
      </div>
      <div className="ef-imm-route-wrap" style={{ width: `${layout.width}px`, maxWidth: "100%" }}>
        {showHeader ? <header className="ef-imm-route-head">
          <div>
            <h2>{usingActiveRoute ? `${routeLabel}${!routeRecommended && routeVersionNumber ? ` · V${routeVersionNumber}` : ""}` : "课程顺序"}</h2>
            <p>{usingActiveRoute ? layout.currentIndex >= 0 ? `${steps.length} 步 · 已完成 ${done} 步 · 当前第 ${layout.currentIndex + 1} 步` : continueStep ? `${steps.length} 步 · ${routeLabel}已完成 · 继续学习：${continueStep.title}` : `${steps.length} 步 · 已全部完成` : `尚未建立有效的个人路线 · 按课程顺序显示 ${steps.length} 步`}</p>
          </div>
          {showAdjust && onAdjust ? <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={onAdjust}><Edit3 size={13} />调整路线</button> : null}
        </header> : null}
        {!usingActiveRoute ? <p className="ef-imm-route-note">当前没有已采用的个人路线版本，因此按课程顺序展示；建立路线后可在这里按执行顺序闯关。</p> : null}
        {continueStep && layout.currentIndex < 0 ? (
          <div className="ef-imm-route-continue">
            <b>继续学习 · {continueStep.title}</b>
            <small>{continueStep.minutes ? `${continueStep.minutes} 分钟` : "当前课程进度"}{continueStep.meta ? ` · ${continueStep.meta}` : ""}</small>
            <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={continueStep.onStart}><Play size={14} />开始</button>
          </div>
        ) : null}
        <div className="ef-imm-route-canvas" ref={canvasRef} style={{ height: `${layout.height}px` }}>
          <svg className="ef-imm-route-svg" width={layout.width} height={layout.height} aria-hidden="true">
            <path d={layout.path} fill="none" stroke="var(--line-strong)" strokeWidth={10} strokeLinecap="round" strokeDasharray="2 16" />
            {layout.donePath ? <path d={layout.donePath} fill="none" stroke="var(--brand)" strokeWidth={10} strokeLinecap="round" opacity={0.85} /> : null}
          </svg>
          {layout.headers.map((header, index) => {
            const next = layout.headers[index + 1];
            const top = header.y - header.height / 2;
            const bottom = next ? next.y - next.height / 2 : layout.height;
            return <div
              key={`section:${header.id}`}
              ref={(element) => { if (element) sectionRefs.current.set(header.id, element); else sectionRefs.current.delete(header.id); }}
              className="ef-imm-route-chapter-section"
              data-route-header-id={header.id}
              style={{ top: `${top}px`, height: `${Math.max(1, bottom - top)}px` }}
              aria-hidden="true"
            />;
          })}
          {layout.headers.map((header) => (
            <div
              key={header.id}
              ref={(element) => { if (element) headerRefs.current.set(header.id, element); else headerRefs.current.delete(header.id); }}
              className="ef-imm-route-chapter"
              data-route-chapter-id={header.chapterId}
              data-route-header-id={header.id}
              title={header.title}
              style={{ left: `${header.x}px`, top: `${header.y - header.height / 2}px` }}
            >
              <div><small>{header.title.includes("·") ? header.title.split("·")[0].trim() : "章节"}</small><b>{header.title.includes("·") ? header.title.split("·").slice(1).join("·").trim() : header.title}</b></div>
            </div>
          ))}
          {layout.steps.map((step) => <RouteStepRow
            key={step.id}
            step={step}
            isCurrent={layout.currentIndex === step.index}
            isSelected={step.index === selected?.index}
            labelWidth={resolvedLabelWidth}
            width={layout.width}
            onChoose={chooseStep}
            registerStep={registerStep}
            registerLabel={registerLabel}
          />)}
          {selected ? <div
            ref={cardRef}
            className={`ef-imm-route-action${cardWidth <= 170 ? " is-stacked" : ""}`}
            data-route-interactive
            data-route-action-index={selected.index}
            style={{
              left: `${placed ? placement.left : 0}px`,
              top: `${placed ? placement.top : 0}px`,
              width: `${cardWidth}px`,
              visibility: placed ? "visible" : "hidden"
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ef-imm-route-action-copy">
              <small>{selected.status === "current" ? "当前步骤" : selected.status === "done" ? "已学" : selected.status === "locked" ? "未解锁" : selected.stateLabel}</small>
              <b title={selected.title}>{selected.title}</b>
            </div>
            {selected.status === "locked" ? <span className="ef-imm-route-action-locked" title="完成前置知识点后解锁">完成前置知识点后解锁</span> : selected.kind === "none" ? <span className="ef-imm-route-action-locked">无任务</span> : <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => onStart(selected)}><Play size={14} />{stepActionLabel(selected)}</button>}
          </div> : null}
          {!current && layout.steps.length ? <div className="ef-imm-route-complete" style={{ top: `${layout.steps[layout.steps.length - 1].y + 74}px` }}>
            <b><Flag size={16} />路线已完成</b>
            <small>所有步骤都已获得；可在课程树里继续复习或调整路线。</small>
          </div> : null}
        </div>
      </div>
    </div>
  </div>;
}
