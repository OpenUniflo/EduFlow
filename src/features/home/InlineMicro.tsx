import { ArrowRight, BookOpen, Maximize2, Play, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { resolveMicroResumeStep, type MicroLearningPath } from "@/features/learning/micro/microLearning";
import { MicroStepPanel } from "@/features/learning/micro/MicroLearningExperience";
import { MicroUnitRail } from "@/features/learning/micro/MicroUnitRail";
import { microImmersiveHref, microSurfaceForPath } from "@/features/learning/micro/microSurface";
import { ObjectShell } from "@/shared/ui/ObjectShell";
import { Pill } from "@/shared/ui/Pill";

export type InlineMicroProps = {
  path: MicroLearningPath;
  knowledgeId: string;
  courseId?: string;
  session: MockSession;
  surface: "inline" | "panel";
  onClose?: () => void;
  onContext?: (label: string) => void;
  onExpand?: () => void;
};

/**
 * Simple Micro runs inside the conversation card; complex Micro uses the same
 * runner in the right Object Shell panel. Both persist through the real
 * MicroLearningRepository and expand to the immersive route in place.
 */
export function InlineMicro({ path, knowledgeId, courseId, session, surface, onClose, onContext, onExpand }: InlineMicroProps) {
  const navigate = useNavigate();
  const [revision, setRevision] = useState(0);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  useEffect(() => applicationServices.microLearningRepository.subscribe(() => setRevision((value) => value + 1)), []);

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
  const steps = path.units.reduce((total, unit) => total + unit.steps.length, 0);
  const completeSteps = completed ? steps : path.units.reduce((total, unit) => total + (applicationServices.microLearningRepository.getUnitProgress(unit.id)?.completedStepIds.length ?? 0), 0);
  const complex = microSurfaceForPath(path) === "panel";
  const inlineWrap = (node: ReactNode) => surface === "inline" ? <section className="ef-home-micro-card" aria-label={`微学习 ${path.title}`}>{node}</section> : node;

  async function start() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await applicationServices.microLearningRepository.start(path.id, courseId);
      setStarted(true);
      onContext?.(path.title);
    } catch {
      setError("微学习尚未成功启动；当前步骤不会被记录。请重试。");
    } finally { setBusy(false); }
  }

  async function complete(submission?: Parameters<typeof applicationServices.microLearningRepository.completeStep>[3], durationMs?: number) {
    if (!currentUnit || !currentStep) return false;
    setBusy(true); setError("");
    try {
      const result = await applicationServices.microLearningRepository.completeStep(path.id, currentUnit.id, currentStep.id, submission, courseId, { clientDurationMs: durationMs });
      await refreshLearnerState(session.userId).catch(() => undefined);
      setNonce((value) => value + 1);
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

  const titleTools = <div className="ef-home-micro-tools">
    <button type="button" className="ef-home-icon" onClick={expand} aria-label="放大为沉浸" title="放大为沉浸"><Maximize2 size={15} aria-hidden="true" /></button>
    {onClose ? <button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭微学习工作区"><X size={15} aria-hidden="true" /></button> : null}
  </div>;

  const header = <div className="ef-home-micro-head">
    <span className="ef-home-micro-kicker"><BookOpen size={14} aria-hidden="true" />微学习 · {complex ? "复杂互动" : "对话内练习"}</span>
    <h3>{path.title}</h3>
    <p>{path.description ?? `完成 ${steps} 个步骤，记为已学习。`}</p>
    <div className="ef-home-micro-meta">
      <Pill tone={completed ? "ok" : progress ? "brand" : "quiet"} dot>{completed ? "已完成" : progress ? "进行中" : "未开始"}</Pill>
      <span>约 {path.estimatedMinutes} 分钟</span>
      <span>{completeSteps} / {steps} 步</span>
      {courseId ? <span>{applicationServices.courseRepository.getCourse(courseId)?.course.title ?? "课程"}</span> : <span>独立学习</span>}
    </div>
  </div>;

  if (completed) {
    return inlineWrap(<div className={`ef-home-micro ${surface === "panel" ? "is-panel" : "is-inline"}`}>
      {header}
      {surface === "inline" ? <div className="ef-home-micro-done-row">
        <span>完成只记为「已学习」，不会自动变成掌握。</span>
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={expand}>复习<ArrowRight size={14} aria-hidden="true" /></button>
      </div> : <div className="ef-home-micro-complete">
        <strong>这条微学习路径已完成</strong>
        <p>完成只记为「已学习」，不会自动变成掌握。关闭工作区不会丢失进度，可以随时回到沉浸页复习。</p>
        <div>
          <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={expand}>在沉浸页复习<ArrowRight size={14} aria-hidden="true" /></button>
        </div>
      </div>}
    </div>);
  }

  if (!started && !progress) {
    return inlineWrap(<div className={`ef-home-micro ${surface === "panel" ? "is-panel" : "is-inline"}`}>
      {header}
      {error ? <p className="ef-home-micro-error" role="alert">{error}<button type="button" onClick={() => void start()}>重试启动</button></p> : null}
      <div className="ef-home-micro-cta">
        <button type="button" className="ef-ui-btn ef-ui-btn--primary" disabled={busy} onClick={() => void start()}><Play size={15} aria-hidden="true" />{busy ? "正在启动…" : complex ? "在右侧工作区开始" : "开始这道热身题"}</button>
        <button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={expand}>直接进入沉浸</button>
      </div>
      <p className="ef-home-micro-note">路径来自课程结构，顺序固定。完成只记为已学习。</p>
    </div>);
  }

  const body = <div className={`ef-home-micro ${surface === "panel" ? "is-panel" : "is-inline"}`}>
    {error ? <p className="ef-home-micro-error" role="alert">{error}</p> : null}
    {surface === "panel" && complex ? <div className="ef-home-micro-rail"><MicroUnitRail path={path} currentUnitId={currentUnit?.id} repository={applicationServices.microLearningRepository} /></div> : null}
    {currentUnit && currentStep ? <MicroStepPanel key={`home:${path.id}:${currentUnit.id}:${currentStep.id}:${nonce}`} path={path} unitId={currentUnit.id} step={currentStep} repository={applicationServices.microLearningRepository} session={session} review={false} active busy={busy} previous={null} onBack={() => undefined} onNext={() => setNonce((value) => value + 1)} onReturn={() => undefined} onComplete={complete} /> : <p className="ef-home-micro-error">该微学习内容尚未完整发布。</p>}
  </div>;

  if (surface === "panel") {
    return <ObjectShell size="panel" className="ef-home-micro-shell" title={path.title} kicker={`微学习 · 第 ${(currentUnit?.position ?? 0) + 1} / ${path.units.length} 单元`} context={<span>{complex ? "复杂微学习 · 右侧工作区" : "简单微学习"} · 约 {path.estimatedMinutes} 分钟 · {completeSteps} / {steps} 步 · 完成只记为已学习</span>} tools={titleTools} footer={<div className="ef-home-micro-foot"><span>进度已保存 · {completeSteps} / {steps} 步</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={expand}>放大为沉浸<Maximize2 size={14} aria-hidden="true" /></button></div>}>
      {body}
    </ObjectShell>;
  }

  return inlineWrap(body);
}
