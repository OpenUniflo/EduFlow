import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import { resolveAssistantCapabilities } from "@/features/assistant/assistantContext";
import type { MockSession } from "@/features/auth/types";
import { recordMicroLearningActivity, type MicroInteraction, type MicroLearningProvider } from "./microLearning";

function correct(interaction:MicroInteraction, answer:string|string[]) {
  if(interaction.type==="choice")return answer===interaction.options[interaction.correctIndex];
  if(interaction.type==="ordering"||interaction.type==="mini-workflow")return Array.isArray(answer)&&answer.join("|")===interaction.correctOrder.join("|");
  if(interaction.type==="trace")return answer===interaction.correctStepId;
  return Array.isArray(answer)&&answer.length===interaction.pairs.length;
}

export function MicroLearningExperience({session,onLogout,provider}:{session:MockSession;onLogout():void;provider:MicroLearningProvider}){
  const navigate=useNavigate(); const {knowledgeId=""}=useParams(); const [searchParams]=useSearchParams(); const courseId=searchParams.get("courseId")??undefined;
  const lesson=useMemo(()=>provider.getLesson(knowledgeId,{courseId}),[courseId,knowledgeId,provider]);
  const [index,setIndex]=useState(0); const [answer,setAnswer]=useState<string|string[]>(""); const [feedback,setFeedback]=useState<"success"|"retry"|null>(null); const [completed,setCompleted]=useState(false);
  const context={workspace:"learning" as const,experienceMode:"learn" as const,userRole:session.role,capabilities:session.capabilities,courseId,knowledgeId};
  const capabilities=resolveAssistantCapabilities(context);
  if(!lesson)return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/><section className="atlas-empty-state"><h1>该知识暂不支持微学习</h1><p>Prototype 只为经过验证的 Golden Knowledge 提供 MicroLesson，不会自动生成不可靠内容。</p><button className="atlas-primary" onClick={()=>navigate(courseId?`/courses/${courseId}`:"/")}>返回</button></section></main>;
  const resolvedLesson=lesson; const step=resolvedLesson.steps[index]; const interaction=step.interaction;
  function submit(){if(!interaction){setFeedback("success");return;}setFeedback(correct(interaction,answer)?"success":"retry");}
  function next(){if(index<resolvedLesson.steps.length-1){setIndex((value)=>value+1);setAnswer("");setFeedback(null);return;}recordMicroLearningActivity({userId:session.userId,knowledgeId,lessonId:resolvedLesson.id,courseId,completedAt:new Date().toISOString()});setCompleted(true);}
  function toggle(value:string){setAnswer((current)=>Array.isArray(current)?current.includes(value)?current.filter((item)=>item!==value):[...current,value]:[value]);setFeedback(null);}
  return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/>
    <header className="micro-learning-header glass-v2"><button onClick={()=>navigate(courseId?`/courses/${courseId}`:"/")}><ArrowLeft size={16}/>返回</button><span><small>MICRO LEARNING · {lesson.estimatedMinutes} 分钟</small><strong>{lesson.title}</strong></span><i>{index+1} / {lesson.steps.length}</i></header>
    <section className="micro-learning-stage">
      <div className="micro-progress"><i style={{width:`${((index+(completed?1:0))/lesson.steps.length)*100}%`}}/></div>
      {completed?<article className="micro-card glass-v2 micro-complete"><Check size={36}/><span className="atlas-kicker">ACTIVITY RECORDED</span><h1>这次微学习已完成</h1><p>已记录为学习活动；它不会自动把 Knowledge 标记为 mastered，也不会与 Assignment 完成混淆。</p><div><button className="atlas-secondary" onClick={()=>{setIndex(0);setCompleted(false);setFeedback(null);}}><RotateCcw size={15}/>再练一次</button><button className="atlas-primary" onClick={()=>navigate("/")}>回到今日学习<ArrowRight size={15}/></button></div></article>:
      <article className="micro-card glass-v2"><span className="atlas-kicker">{step.kind.toUpperCase()}</span><h1>{step.title}</h1><p>{step.body}</p>{interaction?<div className={`micro-interaction ${interaction.type}`}>
        {interaction.type==="choice"?interaction.options.map((option)=><button key={option} className={answer===option?"selected":""} onClick={()=>{setAnswer(option);setFeedback(null);}}>{option}</button>):null}
        {interaction.type==="ordering"?interaction.items.map((item)=><button key={item} className={Array.isArray(answer)&&answer.includes(item)?"selected":""} onClick={()=>toggle(item)}><span>{Array.isArray(answer)?answer.indexOf(item)+1:0}</span>{item}</button>):null}
        {interaction.type==="mini-workflow"?interaction.nodes.map((item)=><button key={item} className={Array.isArray(answer)&&answer.includes(item)?"selected":""} onClick={()=>toggle(item)}><span>{Array.isArray(answer)?answer.indexOf(item)+1:0}</span>{item}</button>):null}
        {interaction.type==="trace"?interaction.steps.map((item)=><button key={item.id} className={answer===item.id?"selected":""} onClick={()=>{setAnswer(item.id);setFeedback(null);}}>{item.label}</button>):null}
        {interaction.type==="matching"?interaction.pairs.map((pair)=><button key={pair.left} className={Array.isArray(answer)&&answer.includes(pair.left)?"selected":""} onClick={()=>toggle(pair.left)}>{pair.left}<ArrowRight size={13}/>{pair.right}</button>):null}
      </div>:null}
      {feedback?<div className={`micro-feedback ${feedback}`}>{feedback==="success"?(step.successFeedback??"判断正确，可以继续。"):(step.retryFeedback??"再检查一次因果或执行顺序。")}</div>:null}
      <footer><button className="atlas-secondary" disabled={index===0} onClick={()=>{setIndex((value)=>value-1);setAnswer("");setFeedback(null);}}>上一步</button>{interaction&&feedback!=="success"?<button className="atlas-primary" disabled={!answer||(Array.isArray(answer)&&!answer.length)} onClick={submit}>检查答案</button>:<button className="atlas-primary" onClick={next}>{index===lesson.steps.length-1?"完成":"继续"}<ArrowRight size={15}/></button>}</footer></article>}
    </section>
    <EduFlowAssistant context={context} contextLabel={lesson.title}><div className="course-design-assistant-actions"><button onClick={()=>setFeedback("retry")}>给我提示</button><button onClick={()=>setFeedback("success")}>解释当前步骤</button>{capabilities.canStartMicroLesson?<button onClick={next}>下一步</button>:null}</div><p className="assistant-plain-response">Assistant 只解释当前 MicroStep，不会替你写入 mastery。</p></EduFlowAssistant>
  </main>;
}
