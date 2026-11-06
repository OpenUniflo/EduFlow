import { ArrowRight, BookOpen, Maximize2, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { resolveDisplayedMicroStep, resolveMicroResumeStep, type MicroLearningPath } from "@/features/learning/micro/microLearning";
import { resolveMicroCompletionContext } from "@/features/learning/micro/microCompletionContext";
import { MicroStepPanel } from "@/features/learning/micro/MicroLearningExperience";
import { MicroUnitRail } from "@/features/learning/micro/MicroUnitRail";
import { microImmersiveHref, microSurfaceForPath } from "@/features/learning/micro/microSurface";
import { ObjectShell } from "@/shared/ui/ObjectShell";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { Pill } from "@/shared/ui/Pill";

export type InlineMicroProps = {
  path: MicroLearningPath;
  knowledgeId: string;
  courseId?: string;
  session: MockSession;
  surface: "inline" | "panel";
  /** The conversation card owns the header when embedded in a timeline card. */
  hideHeader?: boolean;
  /** Called once when this path reaches completed. */
  onCompleted?: () => void;
  onClose?: () => void;
  onContext?: (label: string) => void;
  onExpand?: () => void;
  onStepChange?: (stepId: string) => void;
};

/**
 * Simple Micro runs inside the conversation card; complex Micro uses the same
 * runner in the right Object Shell panel. Both persist through the real
 * MicroLearningRepository and expand to the immersive route in place.
 */
export function InlineMicro({ path, knowledgeId, courseId, session, surface, hideHeader = false, onCompleted, onClose, onContext, onExpand, onStepChange }: InlineMicroProps) {
  const navigate = useNavigate();
  const [revision, setRevision] = useState(0);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pinned, setPinned] = useState<{ unitId: string; stepId: string } | null>(null);
  const [completionDecision, setCompletionDecision] = useState<NavigationDecision | null>(null);
  const [completionNavigationError, setCompletionNavigationError] = useState(false);
  const [completionAttempt, setCompletionAttempt] = useState(0);
  const [footerMount, setFooterMount] = useState<HTMLDivElement | null>(null);
  const stepRegionRef = useRef<HTMLDivElement>(null);
  useEffect(() => applicationServices.microLearningRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => { setPinned(null); }, [path.id]);

  const progress = useMemo(() => applicationServices.microLearningRepository.getPathProgress(path.id), [path.id, revision]);
  const completed = progress?.status === "completed";
  const currentUnit = useMemo(() => {
    const units = path.units;
    return units.find((unit) => unit.id === progress?.currentUnitId) ?? units.find((unit) => {
      const state = applicationServices.microLearningRepository.getUnitProgress(unit.id);
      return state?.status !== "completed";
    }) ?? units[units.length - 1];
  }, [path.id, path.units, progress?.currentUnitId, revision]);
  const currentStep = currentUnit ? resolveMicroResumeStep(currentUnit, applicationServices.microLearningRepository.getUnitProgress(currentUnit.id), progress?.currentStepId) : undefined;
  // Keep the just-graded step on screen until the learner explicitly continues,
  // matching the immersive runner. Without this the persisted progress remounts
  // the panel immediately and the success/retry feedback is never visible.
  const { unit: displayedUnit, step: displayedStep } = resolveDisplayedMicroStep(path, currentUnit, currentStep, pinned);
  useEffect(() => { if (displayedStep?.id) onStepChange?.(displayedStep.id); }, [displayedStep?.id, onStepChange]);
  // Classification drops zones below the fold on a 1280x720 Home card. Bring
  // the working area into view when that step appears; the card header's
  // duration/description are already hidden while expanded.
  useEffect(() => {
    if (!displayedStep?.id) return;
    const frame = window.requestAnimationFrame(() => {
      const region = stepRegionRef.current;
      const scroller = region?.closest<HTMLElement>(".ef-home-timeline");
      const zones = region?.querySelector<HTMLElement>(".micro-spatial-zones");
      if (!scroller || !zones) return;
      const top = Math.max(0, zones.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 72);
      scroller.scrollTo({ top, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [displayedStep?.id]);
  const showCompleted = completed && !pinned;
  const steps = path.units.reduce((total, unit) => total + unit.steps.length, 0);
  const completeSteps = completed ? steps : path.units.reduce((total, unit) => total + (applicationServices.microLearningRepository.getUnitProgress(unit.id)?.completedStepIds.length ?? 0), 0);
  const complex = microSurfaceForPath(path) === "panel";
  const panel = surface === "panel";
  const inlineWrap = (node: ReactNode) => surface === "inline" ? <section className="ef-home-micro-card" aria-label={`小练习 ${path.title}`}>{node}</section> : node;

  async function start() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await applicationServices.microLearningRepository.start(path.id, courseId);
      void refreshLearnerState(session.userId).catch(() => undefined);
      setStarted(true);
      onContext?.(path.title);
    } catch {
      setError("小练习尚未成功启动；当前步骤不会被记录。请重试。");
    } finally { setBusy(false); }
  }

  async function complete(submission?: Parameters<typeof applicationServices.microLearningRepository.completeStep>[3], durationMs?: number) {
    if (!displayedUnit || !displayedStep) return false;
    setPinned({ unitId: displayedUnit.id, stepId: displayedStep.id });
    setBusy(true); setError("");
    try {
      const result = await applicationServices.microLearningRepository.completeStep(path.id, displayedUnit.id, displayedStep.id, submission, courseId, { clientDurationMs: durationMs });
      // The step result is what releases the button; learner-state refresh is
      // only a background projection and must not keep the learner waiting.
      void refreshLearnerState(session.userId).catch(() => undefined);
      if (applicationServices.microLearningRepository.getPathProgress(path.id)?.status === "completed") onCompleted?.();
      return result.correct;
    } catch {
      setError("保存失败，进度没有被推进。请重试。");
      return false;
    } finally { setBusy(false); }
  }

  function expand() {
    if (onExpand) { onExpand(); return; }
    const target = microImmersiveHref(knowledgeId, { courseId, pathId: path.id, returnTo: "/" });
    navigate(target.to, { state: target.state });
  }

  useEffect(() => {
    let live = true;
    setCompletionDecision(null);
    setCompletionNavigationError(false);
    if (!showCompleted || !courseId) return () => { live = false; };
    void applicationServices.learnerStateService.getNavigation(courseId)
      .then((decision) => { if (live) setCompletionDecision(decision); })
      .catch(() => { if (live) setCompletionNavigationError(true); });
    return () => { live = false; };
  }, [completionAttempt, courseId, showCompleted]);

  const completionRuntime = courseId ? applicationServices.courseRepository.getCourse(courseId) : undefined;
  const completionActions = resolveMicroCompletionContext({
    knowledgeId,
    runtime: completionRuntime,
    decision: completionDecision,
    hasMicro: (nodeId) => Boolean(applicationServices.microLearningRepository.getPath(nodeId, { courseId, mode: "learn" }))
  });
  const nextCompletionAction = completionActions.find((action) => action.kind === "next");

  function openCompletionAction(action: (typeof completionActions)[number]) {
    const state = {
      returnTo: "/",
      recommendationDecisionId: completionDecision?.decisionId,
      microPathId: action.kind === "next" && completionDecision?.nextAction.resourceKind === "micro" ? completionDecision.nextAction.resourceId : undefined
    };
    navigate(action.href, { state });
  }

  const titleTools = <div className="ef-home-micro-tools">
    <button type="button" className="ef-home-icon" onClick={expand} aria-label="放大为沉浸" title="放大为沉浸"><Maximize2 size={15} aria-hidden="true" /></button>
    {onClose ? <button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭小练习工作区"><X size={15} aria-hidden="true" /></button> : null}
  </div>;

  const meta = <div className="ef-home-micro-meta">
    <Pill tone={completed ? "ok" : progress ? "brand" : "quiet"} dot>{completed ? "已完成" : progress ? "进行中" : "未开始"}</Pill>
    <span>约 {path.estimatedMinutes} 分钟</span>
    <span>{completeSteps} / {steps} 步</span>
    {courseId ? <span>{applicationServices.courseRepository.getCourse(courseId)?.course.title ?? "课程"}</span> : <span>独立学习</span>}
  </div>;

  const header = <div className="ef-home-micro-head">
    <span className="ef-home-micro-kicker"><BookOpen size={14} aria-hidden="true" />小练习 · {complex ? "复杂互动" : "对话内练习"}</span>
    <h3>{path.title}</h3>
    <p>{path.description ?? `完成 ${steps} 个步骤，记为已学。`}</p>
    {meta}
  </div>;

  const panelShell = (content: ReactNode) => <ObjectShell
    size="panel"
    className="ef-home-micro-shell"
    title={path.title}
    kicker={`小练习 · 第 ${(displayedUnit?.position ?? 0) + 1} / ${path.units.length} 单元`}
    context={<span>{complex ? "复杂小练习 · 右侧工作区" : "简单小练习"} · 约 {path.estimatedMinutes} 分钟 · {completeSteps} / {steps} 步</span>}
    tools={titleTools}
    footer={progress && displayedUnit && displayedStep && !showCompleted ? <div className="ef-home-micro-foot"><span>进度已保存 · {completeSteps} / {steps} 步</span><div ref={setFooterMount} className="ef-home-micro-foot-actions" /></div> : undefined}
  >
    {content}
  </ObjectShell>;

  if (showCompleted) {
    if (panel) return panelShell(<div className="ef-home-micro-panel-state">
      <div className="ef-home-micro-complete">
        <strong>这条小练习路径已完成</strong>
        <p>可以随时回到沉浸页复习，进度会保留。</p>
      </div>
      {completionActions.length || completionNavigationError ? <section className="micro-completion-context" aria-label="继续学习与相关内容">
        <h2>继续学习 / 相关内容</h2>
        {nextCompletionAction ? <button type="button" className="atlas-primary micro-completion-next" onClick={() => openCompletionAction(nextCompletionAction)}><span>继续下一项<strong>{nextCompletionAction.title}</strong></span><ArrowRight size={17} aria-hidden="true" /></button> : null}
        {completionActions.filter((action) => action.kind !== "next").map((action) => <button type="button" key={action.href} className="atlas-secondary micro-completion-related" onClick={() => openCompletionAction(action)}><span>{action.kind === "material" ? "相关资料" : "相关练习"}<strong>{action.title}</strong></span><ArrowRight size={15} aria-hidden="true" /></button>)}
        {completionNavigationError ? <div className="micro-feedback retry" role="alert">下一步暂时无法加载；学习进度已保存。<button type="button" className="atlas-secondary" onClick={() => setCompletionAttempt((value) => value + 1)}>重试下一步</button></div> : null}
      </section> : null}
      <div className="ef-home-micro-cta">
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={expand}>在沉浸页复习<ArrowRight size={14} aria-hidden="true" /></button>
      </div>
    </div>);
    return inlineWrap(<div className="ef-home-micro is-inline">
      {hideHeader ? null : header}
      <div className="ef-home-micro-done-row">
        <span>已完成</span>
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={expand}>复习<ArrowRight size={14} aria-hidden="true" /></button>
      </div>
    </div>);
  }

  if (!started && !progress) {
    if (panel) return panelShell(<div className="ef-home-micro-panel-state">
      <p className="ef-home-micro-panel-description">{path.description ?? `这条路径共 ${steps} 个步骤，完成后只记为已学。`}</p>
      {meta}
      {error ? <p className="ef-home-micro-error" role="alert">{error}<button type="button" onClick={() => void start()}>重试启动</button></p> : null}
      <div className="ef-home-micro-cta">
        <button type="button" className="ef-ui-btn ef-ui-btn--primary" disabled={busy} onClick={() => void start()}><Play size={15} aria-hidden="true" />{busy ? "正在启动…" : "开始"}</button>
        <button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={expand} aria-label="全屏进入小练习"><Maximize2 size={14} aria-hidden="true" />全屏</button>
      </div>
      <p className="ef-home-micro-note">按顺序完成即可。</p>
    </div>);
    return inlineWrap(<div className="ef-home-micro is-inline">
      {hideHeader ? null : header}
      {error ? <p className="ef-home-micro-error" role="alert">{error}<button type="button" onClick={() => void start()}>重试启动</button></p> : null}
      <div className="ef-home-micro-cta">
        <button type="button" className="ef-ui-btn ef-ui-btn--primary" disabled={busy} onClick={() => void start()}><Play size={15} aria-hidden="true" />{busy ? "正在启动…" : "开始这道小练习"}</button>
        <button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={expand} aria-label="全屏进入小练习"><Maximize2 size={14} aria-hidden="true" />全屏</button>
      </div>
      <p className="ef-home-micro-note">按顺序完成即可。</p>
    </div>);
  }

  const body = <div ref={stepRegionRef} className={`ef-home-micro ${panel ? "is-panel" : "is-inline"}${panel && complex ? " is-panel-complex" : ""}`}>
    {error ? <p className="ef-home-micro-error" role="alert">{error}</p> : null}
    {panel && complex ? <div className="ef-home-micro-rail"><MicroUnitRail path={path} currentUnitId={displayedUnit?.id ?? currentUnit?.id} repository={applicationServices.microLearningRepository} /></div> : null}
    {displayedUnit && displayedStep ? <MicroStepPanel key={`home:${path.id}:${displayedUnit.id}:${displayedStep.id}`} path={path} unitId={displayedUnit.id} step={displayedStep} repository={applicationServices.microLearningRepository} session={session} review={false} active busy={busy} previous={null} footerMount={panel ? footerMount : null} onBack={() => undefined} onNext={() => setPinned(null)} onReturn={() => undefined} onComplete={complete} /> : <p className="ef-home-micro-error">该小练习内容尚未完整发布。</p>}
  </div>;

  if (panel) return panelShell(body);
  return inlineWrap(body);
}
