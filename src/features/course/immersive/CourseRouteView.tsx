import { useEffect, useRef } from "react";
import { Edit3, Flag, Play } from "lucide-react";
import type { WindingRouteLayout, WindingStep, WindingStepInput } from "./courseTreeLayout";
import "./immersive.css";

type ContinueStep = { title: string; minutes?: number; meta?: string; onStart(): void };

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
  labelSide?: "left" | "right";
  labelWidth?: number;
  onSelect(step: WindingStep): void;
  onStart(step: WindingStep): void;
  onAdjust?(): void;
};

/**
 * Duolingo / Brilliant style journey. The DOM owns the scroll container; the
 * path and disc coordinates are the pure `buildWindingRoute` result.
 */
export function CourseRouteView({ layout, steps, usingActiveRoute, routeRecommended = false, routeVersionNumber, reducedMotion, continueStep, showHeader = true, showAdjust = true, labelSide, labelWidth = 180, onSelect, onStart, onAdjust }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  const lastRef = useRef<HTMLButtonElement>(null);
  const current = layout.currentIndex >= 0 ? layout.steps[layout.currentIndex] : null;
  const done = layout.steps.filter((step) => step.status === "done").length;
  const routeLabel = routeRecommended ? "推荐路线" : "我的路线";

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const scrollable = (node: HTMLElement) => {
      const style = window.getComputedStyle(node);
      return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
    };
    let scroller: HTMLElement | null = root;
    while (scroller && !scrollable(scroller)) scroller = scroller.parentElement;
    if (!scroller) return;
    // A completed personal route has no current step; show the real course
    // "continue" action at the top instead of scrolling to the end.
    if (layout.currentIndex < 0 && continueStep) { scroller.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" }); return; }
    const target = currentRef.current ?? lastRef.current;
    if (!target) return;
    const top = Math.max(0, target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - scroller.clientHeight * 0.35);
    scroller.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
  }, [continueStep, layout.currentIndex, reducedMotion]);

  return (
    <div className="ef-imm-route-view" ref={scrollRef} aria-label={routeLabel}>
      <div className="ef-imm-route-wrap">
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
        <div className="ef-imm-route-canvas" style={{ height: `${layout.height}px` }}>
          <svg className="ef-imm-route-svg" width={layout.width} height={layout.height} aria-hidden="true">
            <path d={layout.path} fill="none" stroke="var(--line-strong)" strokeWidth={10} strokeLinecap="round" strokeDasharray="2 16" />
            {layout.donePath ? <path d={layout.donePath} fill="none" stroke="var(--brand)" strokeWidth={10} strokeLinecap="round" opacity={0.85} /> : null}
          </svg>
          {layout.headers.map((header) => (
            <div key={header.id} className="ef-imm-route-chapter" style={{ left: `${header.x}px`, top: `${header.y - header.height / 2}px`, width: `${header.width}px` }}>
              <div><small>{header.title.includes("·") ? header.title.split("·")[0].trim() : "章节"}</small><b>{header.title.includes("·") ? header.title.split("·").slice(1).join("·").trim() : header.title}</b></div>
            </div>
          ))}
          {layout.steps.map((step) => {
            const isCurrent = layout.currentIndex === step.index;
            const side = labelSide ?? step.side;
            return (
              <div key={step.id}>
                <button
                  ref={isCurrent ? currentRef : step.index === layout.steps.length - 1 ? lastRef : undefined}
                  type="button"
                  className={`ef-imm-route-step is-${step.status}`}
                  style={{ left: `${step.x}px`, top: `${step.y - 48}px` }}
                  aria-label={`${step.title} · ${step.stateLabel}${isCurrent ? " · 当前" : ""}`}
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={() => onSelect(step)}
                >
                  <span className="ef-imm-route-disc" aria-hidden="true" />
                  <span className="ef-imm-route-icon" aria-hidden="true">{step.status === "done" ? "✓" : step.status === "current" ? "▶" : ""}</span>
                </button>
                <div className={`ef-imm-route-text ${side === "right" ? "is-right" : "is-left"}`} style={{ left: `${side === "right" ? step.x + 56 : step.x - 56 - labelWidth}px`, top: `${step.y - 12}px`, width: `${labelWidth}px` }}>
                  <b>{step.title}</b>
                  <small>{step.stateLabel}{isCurrent ? " · 当前" : ""}{step.minutes ? ` · ${step.minutes} 分钟` : ""}{step.meta ? ` · ${step.meta}` : ""}</small>
                </div>
              </div>
            );
          })}
          {current ? (
            <div className="ef-imm-route-start" style={{ top: `${current.y + 104}px` }}>
              <b>{current.title}</b>
              <small>第 {current.index + 1} 步 · {current.stateLabel} · 当前{current.minutes ? ` · ${current.minutes} 分钟` : ""}{current.meta ? ` · ${current.meta}` : ""}</small>
              <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => onStart(current)}><Play size={14} />开始</button>
            </div>
          ) : (
            <div className="ef-imm-route-start" style={{ top: `${layout.steps.length ? layout.steps[layout.steps.length - 1].y + 74 : 40}px` }}>
              <b><Flag size={16} />路线已完成</b>
              <small>所有步骤都已获得；可在课程树里继续复习或调整路线。</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
