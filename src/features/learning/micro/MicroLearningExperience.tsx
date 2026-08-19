import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import type { MockSession } from "@/features/auth/types";
import { canCompleteMicroLesson, isMicroInteractionCorrect, recordMicroLearningActivity, resolveMicroLearningReturnTarget, type MicroLearningProvider } from "./microLearning";

export function MicroLearningExperience({session,onLogout,provider}:{session:MockSession;onLogout():void;provider:MicroLearningProvider}){
  const navigate=useNavigate(); const location=useLocation(); const {knowledgeId=""}=useParams(); const [searchParams]=useSearchParams(); const courseId=searchParams.get("courseId")??undefined;
  const lesson=useMemo(()=>provider.getLesson(knowledgeId,{courseId}),[courseId,knowledgeId,provider]);
  const [index,setIndex]=useState(0); const [answer,setAnswer]=useState<string|string[]>(""); const [gradingFeedback,setGradingFeedback]=useState<"success"|"retry"|null>(null); const [completedStepIds,setCompletedStepIds]=useState<Set<string>>(()=>new Set()); const [completed,setCompleted]=useState(false); const [whyOpen,setWhyOpen]=useState(false); const [assistantMessage,setAssistantMessage]=useState("Assistant 可以解释或提示，但不会替你答题或推进步骤。");
  const context={workspace:"learning" as const,experienceMode:"learn" as const,userRole:session.role,capabilities:session.capabilities,courseId,knowledgeId};
  const returnTarget=resolveMicroLearningReturnTarget(location.state,courseId);
  if(!lesson)return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/><section className="micro-unsupported"><button className="micro-unsupported-back" onClick={()=>navigate(returnTarget)}><ArrowLeft size={16}/>返回</button><div><span className="atlas-kicker">MICRO LEARNING</span><h1>该知识暂不支持快速学习</h1><p>当前还没有经过验证的 MicroLesson。你仍然可以返回课程，或继续查看关联课件。</p><button className="atlas-primary" onClick={()=>navigate(returnTarget)}>返回来源<ArrowRight size={15}/></button></div></section></main>;
  const resolvedLesson=lesson; const step=resolvedLesson.steps[index]; const interaction=step.interaction;
  const stepCompleted=completedStepIds.has(step.id);
  function submit(){if(!interaction)return;const valid=isMicroInteractionCorrect(interaction,answer);setGradingFeedback(valid?"success":"retry");if(valid)setCompletedStepIds((current)=>new Set(current).add(step.id));}
  function advance(completedIds=completedStepIds){if(!completedIds.has(step.id))return;if(index<resolvedLesson.steps.length-1){setIndex((value)=>value+1);setAnswer("");setGradingFeedback(null);setWhyOpen(false);setAssistantMessage("Assistant 可以解释或提示，但不会替你答题或推进步骤。");return;}if(!canCompleteMicroLesson(resolvedLesson.steps,completedIds))return;recordMicroLearningActivity({userId:session.userId,knowledgeId,lessonId:resolvedLesson.id,courseId,completedAt:new Date().toISOString()});setCompleted(true);}
  function completeAndAdvance(){const nextCompleted=new Set(completedStepIds).add(step.id);setCompletedStepIds(nextCompleted);advance(nextCompleted);}
  function toggle(value:string){setAnswer((current)=>Array.isArray(current)?current.includes(value)?current.filter((item)=>item!==value):[...current,value]:[value]);setGradingFeedback(null);}
  return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/>
    <header className="micro-learning-header"><button onClick={()=>navigate(returnTarget)}><ArrowLeft size={16}/>返回</button><span><small>MICRO LEARNING · {lesson.estimatedMinutes} 分钟</small><strong>{lesson.title}</strong></span><i>{index+1} / {lesson.steps.length}</i></header>
    <section className="micro-learning-stage">
      <div className="micro-progress"><i style={{width:`${((index+(completed?1:0))/lesson.steps.length)*100}%`}}/></div>
      {completed?<article className="micro-card micro-complete"><Check size={36}/><span className="atlas-kicker">ACTIVITY RECORDED</span><h1>这次微学习已完成</h1><p>已记录为学习活动；它不会自动把 Knowledge 标记为 mastered，也不会与 Assignment 完成混淆。</p><div><button className="atlas-secondary" onClick={()=>{setIndex(0);setCompleted(false);setCompletedStepIds(new Set());setAnswer("");setGradingFeedback(null);setWhyOpen(false);}}><RotateCcw size={15}/>再练一次</button><button className="atlas-primary" onClick={()=>navigate(returnTarget)}>返回来源<ArrowRight size={15}/></button></div></article>:
      <article className="micro-card"><span className="atlas-kicker">{step.kind.toUpperCase()}</span><h1>{step.title}</h1><p>{step.body}</p>{interaction?<div className={`micro-interaction ${interaction.type}`}>
        {interaction.type==="choice"?interaction.options.map((option)=><button key={option} disabled={stepCompleted} className={answer===option?"selected":""} onClick={()=>{setAnswer(option);setGradingFeedback(null);}}>{option}</button>):null}
        {interaction.type==="ordering"?interaction.items.map((item)=><button key={item} disabled={stepCompleted} className={Array.isArray(answer)&&answer.includes(item)?"selected":""} onClick={()=>toggle(item)}><span>{Array.isArray(answer)?answer.indexOf(item)+1:0}</span>{item}</button>):null}
        {interaction.type==="mini-workflow"?interaction.nodes.map((item)=><button key={item} disabled={stepCompleted} className={Array.isArray(answer)&&answer.includes(item)?"selected":""} onClick={()=>toggle(item)}><span>{Array.isArray(answer)?answer.indexOf(item)+1:0}</span>{item}</button>):null}
        {interaction.type==="trace"?interaction.steps.map((item)=><button key={item.id} disabled={stepCompleted} className={answer===item.id?"selected":""} onClick={()=>{setAnswer(item.id);setGradingFeedback(null);}}>{item.label}</button>):null}
      </div>:null}
      {gradingFeedback?<div className={`micro-feedback ${gradingFeedback}`}>{gradingFeedback==="success"?(step.successFeedback??"判断正确，可以继续。"):(step.retryFeedback??"再检查一次因果或执行顺序。")}</div>:null}
      {whyOpen?<div className="micro-inline-explanation"><strong>为什么？</strong><p>{step.successFeedback??"这一步关注的是可验证的判断与因果关系；先确认当前条件，再决定下一步。"}</p></div>:null}
      <footer><button className="atlas-secondary" onClick={()=>setWhyOpen((value)=>!value)}>{whyOpen?"收起说明":"为什么？"}</button><span/><button className="atlas-secondary" disabled={index===0} onClick={()=>{setIndex((value)=>value-1);setAnswer("");setGradingFeedback(null);setWhyOpen(false);}}>上一步</button>{interaction&&!stepCompleted?<button className="atlas-primary" disabled={!answer||(Array.isArray(answer)&&!answer.length)} onClick={submit}>检查答案</button>:<button className="atlas-primary" onClick={interaction?()=>advance():completeAndAdvance}>{index===lesson.steps.length-1?"完成":"继续"}<ArrowRight size={15}/></button>}</footer></article>}
    </section>
    <EduFlowAssistant context={context} contextLabel={lesson.title}><div className="course-design-assistant-actions"><button onClick={()=>setAssistantMessage("提示：先识别当前步骤要求验证的边界、因果或执行顺序，再选择答案。")}>给我提示</button><button onClick={()=>setAssistantMessage(`解释：${step.body}`)}>解释当前步骤</button></div><p className="assistant-plain-response">{assistantMessage}</p></EduFlowAssistant>
  </main>;
}
