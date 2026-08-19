import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import { refreshLearnerState } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { resolveMicroLearningReturnTarget, type MicroLearningRepository, type MicroStep } from "./microLearning";

export function MicroLearningExperience({ session, onLogout, repository }: { session: MockSession; onLogout(): void; repository: MicroLearningRepository }) {
  const navigate = useNavigate(); const location = useLocation(); const { knowledgeId = "" } = useParams(); const [searchParams] = useSearchParams();
  const courseId = searchParams.get("courseId") ?? undefined; const [revision, setRevision] = useState(0);
  const [answer, setAnswer] = useState<string | string[]>(""); const [gradingFeedback, setGradingFeedback] = useState<"success" | "retry" | null>(null); const [whyOpen, setWhyOpen] = useState(false); const [busy, setBusy] = useState(false); const [assistantMessage, setAssistantMessage] = useState("Assistant 可以解释或提示，但不会替你答题或推进步骤。");
  useEffect(() => repository.subscribe(() => setRevision((value) => value + 1)), [repository]);
  const path = useMemo(() => repository.getPath(knowledgeId, { courseId, mode: "learn" }), [courseId, knowledgeId, repository, revision]);
  const progress = path ? repository.getPathProgress(path.id) : undefined;
  useEffect(() => { if (path && progress?.status !== "completed" && progress?.status !== "in_progress") void repository.start(path.id); }, [path, progress?.status, repository]);
  const unit = path?.units.find((item) => item.id === progress?.currentUnitId) ?? path?.units[0];
  const step = unit?.steps.find((item) => item.id === progress?.currentStepId) ?? unit?.steps[0];
  const unitProgress = unit ? repository.getUnitProgress(unit.id) : undefined;
  const completedStepIds = new Set(unitProgress?.completedStepIds ?? []);
  const stepCompleted = Boolean(step && completedStepIds.has(step.id));
  const returnTarget = resolveMicroLearningReturnTarget(location.state, courseId);
  const context = { workspace: "learning" as const, experienceMode: "learn" as const, userRole: session.role, capabilities: session.capabilities, courseId, knowledgeId };

  useEffect(() => { setAnswer(""); setGradingFeedback(null); setWhyOpen(false); }, [step?.id]);
  async function completeCurrent() {
    if (!path || !unit || !step || busy) return;
    setBusy(true);
    try {
      const result = await repository.completeStep(path.id, unit.id, step.id, step.interaction ? answer : undefined);
      setGradingFeedback(result.correct ? "success" : "retry");
      if (result.correct) await refreshLearnerState(session.userId);
    } finally { setBusy(false); }
  }
  function toggle(value: string) { setAnswer((current) => Array.isArray(current) ? current.includes(value) ? current.filter((item) => item !== value) : [...current, value] : [value]); setGradingFeedback(null); }
  if (!path) return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/><section className="micro-unsupported"><button className="micro-unsupported-back" onClick={() => navigate(returnTarget)}><ArrowLeft size={16}/>返回</button><div><span className="atlas-kicker">MICRO LEARNING</span><h1>该知识暂不支持快速学习</h1><p>当前还没有已发布的 MicroLearningPath。你仍然可以返回课程，或继续查看关联课件。</p><button className="atlas-primary" onClick={() => navigate(returnTarget)}>返回来源<ArrowRight size={15}/></button></div></section></main>;
  if (!unit || !step) return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/><section className="micro-unsupported"><h1>该快速学习内容尚未完整发布</h1><button className="atlas-primary" onClick={() => navigate(returnTarget)}>返回来源</button></section></main>;
  const total = path.units.reduce((sum, item) => sum + item.steps.length, 0); const currentIndex = path.units.filter((item) => item.position < unit.position).reduce((sum, item) => sum + item.steps.length, 0) + unit.steps.findIndex((item) => item.id === step.id) + 1;
  const interaction = step.interaction;
  return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/>
    <header className="micro-learning-header"><button onClick={() => navigate(returnTarget)}><ArrowLeft size={16}/>返回</button><span><small>MICRO LEARNING · {path.estimatedMinutes} 分钟</small><strong>{path.title}</strong></span><i>{progress?.status === "completed" ? total : currentIndex} / {total}</i></header>
    <section className="micro-learning-stage"><div className="micro-progress"><i style={{ width: `${((progress?.status === "completed" ? total : currentIndex - 1) / Math.max(total, 1)) * 100}%` }}/></div>
      {progress?.status === "completed" ? <article className="micro-card micro-complete"><Check size={36}/><span className="atlas-kicker">PATH COMPLETED</span><h1>这条微学习路径已完成</h1><p>完成已持久化为学习证据；它只会达到 learned，不会自动声称 mastery。</p><div><button className="atlas-secondary" onClick={() => void repository.start(path.id)}><RotateCcw size={15}/>查看路径</button><button className="atlas-primary" onClick={() => navigate(returnTarget)}>返回来源<ArrowRight size={15}/></button></div></article> :
        <article className="micro-card"><span className="atlas-kicker">UNIT {unit.position + 1} · {step.kind.toUpperCase()}</span><h1>{step.title}</h1><p>{step.body}</p>{interaction?.type === "h5p" ? <div className="micro-feedback retry">此 H5P 内容需要已配置的运行适配器，当前无法在此设备上完成。</div> : interaction ? <Interaction step={step} answer={answer} completed={stepCompleted} onAnswer={(value) => { setAnswer(value); setGradingFeedback(null); }} onToggle={toggle}/> : null}
        {gradingFeedback ? <div className={`micro-feedback ${gradingFeedback}`}>{gradingFeedback === "success" ? (step.successFeedback ?? "判断正确，正在保存进度。") : (step.retryFeedback ?? "再检查一次因果或执行顺序。")}</div> : null}
        {whyOpen ? <div className="micro-inline-explanation"><strong>为什么？</strong><p>{step.successFeedback ?? "这一步关注可验证的判断与因果关系；先确认当前条件，再决定下一步。"}</p></div> : null}
        <footer><button className="atlas-secondary" onClick={() => setWhyOpen((value) => !value)}>{whyOpen ? "收起说明" : "为什么？"}</button><span/>{interaction && !stepCompleted ? <button className="atlas-primary" disabled={busy || !answer || (Array.isArray(answer) && !answer.length) || interaction.type === "h5p"} onClick={() => void completeCurrent()}>检查答案</button> : <button className="atlas-primary" disabled={busy} onClick={() => void completeCurrent()}>{busy ? "保存中…" : "继续"}<ArrowRight size={15}/></button>}</footer></article>}
    </section>
    <EduFlowAssistant context={context} contextLabel={path.title}><div className="course-design-assistant-actions"><button onClick={() => setAssistantMessage("提示：先识别当前步骤要求验证的边界、因果或执行顺序，再选择答案。")}>给我提示</button><button onClick={() => setAssistantMessage(`解释：${step.body}`)}>解释当前步骤</button></div><p className="assistant-plain-response">{assistantMessage}</p></EduFlowAssistant>
  </main>;
}

function Interaction({ step, answer, completed, onAnswer, onToggle }: { step: MicroStep; answer: string | string[]; completed: boolean; onAnswer(value: string): void; onToggle(value: string): void }) {
  const interaction = step.interaction!;
  if (interaction.type === "choice") return <div className="micro-interaction choice">{interaction.options.map((option) => <button key={option} disabled={completed} className={answer === option ? "selected" : ""} onClick={() => onAnswer(option)}>{option}</button>)}</div>;
  if (interaction.type === "trace") return <div className="micro-interaction trace">{interaction.steps.map((item) => <button key={item.id} disabled={completed} className={answer === item.id ? "selected" : ""} onClick={() => onAnswer(item.id)}>{item.label}</button>)}</div>;
  if (interaction.type === "ordering" || interaction.type === "mini-workflow") { const items = interaction.type === "ordering" ? interaction.items : interaction.nodes; return <div className={`micro-interaction ${interaction.type}`}>{items.map((item) => <button key={item} disabled={completed} className={Array.isArray(answer) && answer.includes(item) ? "selected" : ""} onClick={() => onToggle(item)}><span>{Array.isArray(answer) ? answer.indexOf(item) + 1 : 0}</span>{item}</button>)}</div>; }
  return null;
}
