import { ArrowUpRight, Loader2, Send, Target } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { snapshotAssistantContext, type AssistantContext } from "../assistantContext";
import { useAssistantRuntime } from "../AssistantRuntimeContext";

export function AssistantConversation({ context, compact = true }: { context: AssistantContext; compact?: boolean }) {
  const navigate = useNavigate();
  const runtime = useAssistantRuntime();
  const [input, setInput] = useState("");
  const [goalMode, setGoalMode] = useState(false);
  const [showGaps, setShowGaps] = useState(false);
  const visible = compact ? runtime.messages.slice(-8) : runtime.messages;
  async function submit() {
    const value = input.trim();
    if (!value || runtime.sending) return;
    setInput("");
    const snapshot = snapshotAssistantContext(context);
    if (goalMode) await runtime.planGoal(value, snapshot);
    else await runtime.send(value, snapshot);
  }
  async function useCourse(courseId:string){try{const selected=await runtime.useExistingCourse(courseId,snapshotAssistantContext(context));window.location.assign(`/courses/${encodeURIComponent(selected)}`);}catch{/* Runtime renders the product error. */}}
  async function createPersonal(sourceCourseId?:string){if(!window.confirm(sourceCourseId?"确认按当前目标范围基于这门课程创建个人课程？":"确认按当前目标 Knowledge 与事实前置范围创建个人课程？"))return;try{const created=await runtime.createPersonalCourse(sourceCourseId,snapshotAssistantContext(context));window.location.assign(`/courses/${encodeURIComponent(created)}?created=1`);}catch{/* Runtime renders the product error. */}}
  const plan=runtime.goalPlan; const best=plan?.matches[0];
  return <div className={`assistant-conversation ${compact ? "compact" : "full"}`}>
    <div className="assistant-conversation-messages" aria-live="polite">
      {runtime.loading ? <p className="assistant-empty"><Loader2 size={14} className="spin"/>正在加载对话…</p> : visible.length ? visible.map((message) => <article key={message.id} className={`assistant-chat-message ${message.role}`}><small>{message.role === "user" ? "你" : "EduFlow"}</small><p>{message.content || (runtime.sending ? "正在思考…" : "")}</p></article>) : <p className="assistant-empty">可以询问当前页面中的 Knowledge、Course、Material 或你的学习状态。</p>}
    </div>
    {plan?<section className="assistant-goal-plan" aria-label="学习目标规划结果">
      <div className="assistant-goal-plan-heading"><Target size={15}/><strong>目标 → Knowledge → Course</strong><button onClick={()=>{runtime.clearGoalPlan();setGoalMode(true);}}>重新规划</button></div>
      {plan.resolution.status==="ready"?<>
        <div className="assistant-goal-knowledge"><small>目标 Knowledge</small>{plan.resolution.targetKnowledge.map((item)=><span key={item.id}>{item.title}<i>{item.id}</i></span>)}</div>
        <div className="assistant-goal-knowledge prerequisites"><small>事实前置</small>{plan.prerequisiteKnowledge.length?plan.prerequisiteKnowledge.map((item)=><span key={item.id}>{item.title}<i>{item.id}</i></span>):<em>无额外 prerequisite</em>}</div>
        {best?<article className={`assistant-course-match ${best.level}`}><div><strong>{best.courseTitle}</strong><span>{best.level.toUpperCase()} · {best.courseType==="personal"?"个人课程":"标准课程"}</span></div><p>目标覆盖 {Math.round(best.targetCoverage*100)}% · 所需范围覆盖 {Math.round(best.requiredCoverage*100)}%</p>{showGaps?<div className="assistant-match-gaps"><small>缺少目标：{best.missingTargetKnowledgeIds.join("、")||"无"}</small><small>缺少前置：{best.missingPrerequisiteKnowledgeIds.join("、")||"无"}</small><small>额外范围：{best.extraKnowledgeIds.length} 项</small></div>:null}<div className="assistant-goal-actions">{best.level==="high"?<><button disabled={runtime.sending} onClick={()=>void useCourse(best.courseId)}>使用这门课程</button><button disabled={runtime.sending} onClick={()=>setShowGaps((value)=>!value)}>查看差异</button></>:best.level==="medium"?<><button disabled={runtime.sending} onClick={()=>void useCourse(best.courseId)}>直接使用</button><button disabled={runtime.sending} onClick={()=>void createPersonal(best.courseId)}>基于它定制</button><button disabled={runtime.sending} onClick={()=>setShowGaps((value)=>!value)}>查看差异</button></>:<><button disabled={runtime.sending} onClick={()=>void createPersonal()}>创建个人课程</button><button disabled={runtime.sending} onClick={()=>setShowGaps((value)=>!value)}>查看差异</button></>}</div></article>:<div className="assistant-goal-actions"><button disabled={runtime.sending} onClick={()=>void createPersonal()}>创建个人课程</button></div>}
      </>:<div className="assistant-goal-unresolved"><strong>{plan.resolution.status==="ambiguous"?"目标存在歧义":"当前 Knowledge 不支持该目标"}</strong><p>{plan.resolution.reason}</p>{plan.resolution.candidates.map((item)=><span key={item.id}>{item.title} · {item.id}</span>)}</div>}
    </section>:null}
    {runtime.error ? <p className="assistant-error" role="alert">{runtime.error}</p> : null}
    <div className="assistant-input-mode"><button className={goalMode?"active":""} onClick={()=>setGoalMode((value)=>!value)}><Target size={13}/>{goalMode?"目标规划中":"规划学习目标"}</button></div>
    <div className="course-design-assistant-input"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder={goalMode?"描述你想达到的学习目标…":"询问 EduFlow…"}/><button disabled={runtime.sending || !input.trim()} onClick={() => void submit()} aria-label={goalMode?"规划学习目标":"发送给 EduFlow Assistant"}>{runtime.sending ? <Loader2 size={15} className="spin"/> : <Send size={15}/>}</button></div>
    {compact ? <button className="assistant-open-full" onClick={() => navigate("/messages")}>进入完整对话<ArrowUpRight size={13}/></button> : null}
  </div>;
}
