import { ArrowDown,ArrowLeft,ArrowRight,ArrowUp,Check,GripVertical,RotateCcw } from "lucide-react";
import { lazy,Suspense,useCallback,useEffect,useMemo,useState } from "react";
import { useLocation,useNavigate,useParams,useSearchParams } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { refreshLearnerState } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import type { MockSession } from "@/features/auth/types";
import { resolveMicroLearningReturnTarget,type H5PContentDescriptor,type H5PResult,type MicroInteraction,type MicroLearningAnswer,type MicroLearningRepository,type MicroStep } from "./microLearning";

const H5PPlayer=lazy(()=>import("./H5PInteraction").then((module)=>({default:module.H5PInteraction})));
const MiniWorkflow=lazy(()=>import("./MiniWorkflowInteraction"));
const rotate=<T,>(items:T[])=>items.length>1?[...items.slice(1),items[0]]:items;
function initialAnswer(interaction?:MicroInteraction):MicroLearningAnswer { if(interaction?.type==="multiple-choice")return [];if(interaction?.type==="ordering")return rotate(interaction.items);if(interaction?.type==="mini-workflow")return rotate(interaction.nodes);return ""; }
const hasAnswer=(answer:MicroLearningAnswer)=>Array.isArray(answer)?answer.length>0:Boolean(answer);

export function MicroLearningExperience({session,onLogout,repository}:{session:MockSession;onLogout():void;repository:MicroLearningRepository}) {
  const navigate=useNavigate(),location=useLocation(),{knowledgeId=""}=useParams(),[searchParams]=useSearchParams(); const courseId=searchParams.get("courseId")??undefined;
  const [revision,setRevision]=useState(0),[answer,setAnswer]=useState<MicroLearningAnswer>(""),[grading,setGrading]=useState<"success"|"retry"|"error"|null>(null),[whyOpen,setWhyOpen]=useState(false),[busy,setBusy]=useState(false),[pinned,setPinned]=useState<{unitId:string;stepId:string}|null>(null),[assistantMessage,setAssistantMessage]=useState("Assistant 可以解释或提示，但不会替你答题或推进步骤。");
  useEffect(()=>repository.subscribe(()=>setRevision((value)=>value+1)),[repository]);
  const path=useMemo(()=>repository.getPath(knowledgeId,{courseId,mode:"learn"}),[courseId,knowledgeId,repository,revision]); const progress=path?repository.getPathProgress(path.id):undefined;
  useEffect(()=>{if(path&&progress?.status!=="completed"&&progress?.status!=="in_progress")void repository.start(path.id,courseId);},[courseId,path,progress?.status,repository]);
  const unit=path?.units.find((item)=>item.id===(pinned?.unitId??progress?.currentUnitId))??path?.units[0]; const step=unit?.steps.find((item)=>item.id===(pinned?.stepId??progress?.currentStepId))??unit?.steps[0];
  const returnTarget=resolveMicroLearningReturnTarget(location.state,courseId); const context={workspace:"learning" as const,experienceMode:"learn" as const,userRole:session.role,capabilities:session.capabilities,courseId,knowledgeId};
  useEffect(()=>{setAnswer(initialAnswer(step?.interaction));setGrading(null);setWhyOpen(false);},[step?.id]);
  const completeCurrent=useCallback(async(submission?:MicroLearningAnswer|{kind:"h5p-result";contentRef:string;eventId:string;result:H5PResult})=>{if(!path||!unit||!step||busy)return;setBusy(true);setPinned({unitId:unit.id,stepId:step.id});try{const result=await repository.completeStep(path.id, unit.id, step.id,submission??(step.interaction?answer:undefined));setGrading(result.correct?"success":"retry");if(result.correct)await refreshLearnerState(session.userId);else setPinned(null);}catch{setGrading("error");setPinned(null);}finally{setBusy(false);}},[answer,busy,path,repository,session.userId,step,unit]);
  if(!path)return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/><Unsupported title="该知识暂不支持快速学习" body="当前还没有已发布的 MicroLearningPath。你仍然可以返回来源，或继续查看关联课件。" onBack={()=>navigate(returnTarget)}/></main>;
  if(!unit||!step)return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/><Unsupported title="该快速学习内容尚未完整发布" body="发布内容缺少必要 Unit 或 Step。" onBack={()=>navigate(returnTarget)}/></main>;
  const total=path.units.reduce((sum,item)=>sum+item.steps.length,0),currentIndex=path.units.filter((item)=>item.position<unit.position).reduce((sum,item)=>sum+item.steps.length,0)+unit.steps.findIndex((item)=>item.id===step.id)+1,showCompleted=progress?.status==="completed"&&!pinned,interaction=step.interaction;
  const feedback=grading==="success"?(step.successFeedback??"判断正确，进度已保存。"):grading==="retry"?(step.retryFeedback??"答案尚未满足完成条件，请重试。"):grading==="error"?"保存失败，进度没有被推进。请重试。":null;
  return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/><header className="micro-learning-header"><button onClick={()=>navigate(returnTarget)}><ArrowLeft size={16}/>返回</button><span><small>MICRO LEARNING · {path.estimatedMinutes} 分钟</small><strong>{path.title}</strong></span><i>{showCompleted?total:currentIndex} / {total}</i></header>
    <section className="micro-learning-stage"><div className="micro-progress" aria-label={`学习进度 ${showCompleted?total:currentIndex-1}/${total}`}><i style={{width:`${((showCompleted?total:currentIndex-1)/Math.max(total,1))*100}%`}}/></div>
      {showCompleted?<article className="micro-card micro-complete"><Check size={36}/><span className="atlas-kicker">PATH COMPLETED</span><h1>这条微学习路径已完成</h1><p>完成已持久化为学习证据；它只会达到 learned，不会自动声称 mastery。</p><div><span className="atlas-pill"><RotateCcw size={15}/>已完成 · 查看状态</span><button className="atlas-primary" onClick={()=>navigate(returnTarget)}>返回来源<ArrowRight size={15}/></button></div></article>:
      <article className={`micro-card micro-step-${grading??"active"}`}><span className="atlas-kicker">UNIT {unit.position+1} · {step.kind.toUpperCase()}</span><h1>{step.title}</h1><p>{step.body}</p>
        {interaction?.type==="h5p"?<H5PStep repository={repository} pathId={path.id} unitId={unit.id} stepId={step.id} interaction={interaction} onResult={(eventId,result)=>void completeCurrent({kind:"h5p-result",contentRef:interaction.contentRef,eventId,result})}/>:interaction?<Interaction step={step} answer={answer} completed={grading==="success"} onAnswer={(value)=>{setAnswer(value);setGrading(null);}}/>:null}
        {feedback?<div className={`micro-feedback ${grading==="success"?"success":"retry"}`} role="status">{feedback}</div>:null}
        {whyOpen?<div className="micro-inline-explanation"><strong>提示</strong><p>{grading==="success"?(step.successFeedback??"已完成这一步。"):(step.retryFeedback??"先识别当前步骤要求验证的边界、因果或执行顺序。")}</p></div>:null}
        <footer><button className="atlas-secondary" onClick={()=>setWhyOpen((value)=>!value)}>{whyOpen?"收起提示":"为什么？"}</button><span/>{grading==="success"?<button className="atlas-primary" onClick={()=>{setPinned(null);setGrading(null);}}>继续<ArrowRight size={15}/></button>:interaction?.type==="h5p"?null:interaction?<button className="atlas-primary" disabled={busy||!hasAnswer(answer)} onClick={()=>void completeCurrent()}>{busy?"检查中…":"检查答案"}</button>:<button className="atlas-primary" disabled={busy} onClick={()=>void completeCurrent()}>{busy?"保存中…":"继续"}<ArrowRight size={15}/></button>}</footer>
      </article>}
    </section><EduFlowAssistant context={context} contextLabel={path.title}><div className="course-design-assistant-actions"><button onClick={()=>setAssistantMessage("提示：先识别当前步骤要求验证的边界、因果或执行顺序，再选择答案。")}>给我提示</button><button onClick={()=>setAssistantMessage(`解释：${step.body}`)}>解释当前步骤</button></div><p className="assistant-plain-response">{assistantMessage}</p></EduFlowAssistant></main>;
}

function Unsupported({title,body,onBack}:{title:string;body:string;onBack():void}) { return <section className="micro-unsupported"><button className="micro-unsupported-back" onClick={onBack}><ArrowLeft size={16}/>返回</button><div><span className="atlas-kicker">MICRO LEARNING</span><h1>{title}</h1><p>{body}</p><button className="atlas-primary" onClick={onBack}>返回来源<ArrowRight size={15}/></button></div></section>; }

function H5PStep({repository,pathId,unitId,stepId,interaction,onResult}:{repository:MicroLearningRepository;pathId:string;unitId:string;stepId:string;interaction:Extract<MicroInteraction,{type:"h5p"}>;onResult(eventId:string,result:H5PResult):void}) {
  const [descriptor,setDescriptor]=useState<H5PContentDescriptor|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let live=true;setDescriptor(null);setError(false);void repository.resolveH5PContent(pathId,unitId,stepId,interaction.contentRef).then((value)=>{if(live)setDescriptor(value);}).catch(()=>{if(live)setError(true);});return()=>{live=false;};},[attempt,interaction.contentRef,pathId,repository,stepId,unitId]);
  if(error)return <div className="micro-feedback retry" role="alert"><strong>该互动内容暂时无法加载</strong><span>内容引用不可用，当前 Step 不会被跳过。</span><button type="button" onClick={()=>setAttempt((value)=>value+1)}>重试</button></div>;
  if(!descriptor)return <p className="micro-h5p-loading" role="status">正在验证互动内容…</p>;
  return <Suspense fallback={<p className="micro-h5p-loading">正在载入 H5P Runtime…</p>}><H5PPlayer descriptor={descriptor} onResult={onResult}/></Suspense>;
}

function Interaction({step,answer,completed,onAnswer}:{step:MicroStep;answer:MicroLearningAnswer;completed:boolean;onAnswer(value:MicroLearningAnswer):void}) {
  const interaction=step.interaction!;
  if(interaction.type==="choice")return <div className="micro-interaction choice">{interaction.options.map((option)=><button key={option} disabled={completed} className={answer===option?"selected":""} onClick={()=>onAnswer(option)}>{option}</button>)}</div>;
  if(interaction.type==="multiple-choice") { const selected=Array.isArray(answer)&&answer.every((item)=>typeof item==="number")?answer as number[]:[];return <div className="micro-interaction multiple-choice" role="group" aria-label="多选题">{interaction.options.map((option,index)=><button key={option} role="checkbox" aria-checked={selected.includes(index)} disabled={completed} className={selected.includes(index)?"selected":""} onClick={()=>onAnswer(selected.includes(index)?selected.filter((item)=>item!==index):[...selected,index])}><span>{selected.includes(index)?"✓":""}</span>{option}</button>)}</div>; }
  if(interaction.type==="fill-blank")return <label className="micro-fill-blank"><span>填写答案</span><input disabled={completed} value={typeof answer==="string"?answer:""} onChange={(event)=>onAnswer(event.target.value)} autoComplete="off"/></label>;
  if(interaction.type==="trace")return <div className="micro-interaction trace">{interaction.steps.map((item,index)=><button key={item.id} disabled={completed} className={answer===item.id?"selected":""} onClick={()=>onAnswer(item.id)}><span>{index+1}</span>{item.label}</button>)}</div>;
  if(interaction.type==="ordering") { const value=Array.isArray(answer)&&answer.every((item)=>typeof item==="string")?answer as string[]:rotate(interaction.items);return <ReorderInteraction value={value} disabled={completed} onChange={onAnswer}/>; }
  if(interaction.type==="mini-workflow") { const value=Array.isArray(answer)&&answer.every((item)=>typeof item==="string")?answer as string[]:rotate(interaction.nodes);return <Suspense fallback={<p>正在加载 Workflow 互动…</p>}><MiniWorkflow items={interaction.nodes} value={value} disabled={completed} onChange={onAnswer} onReset={()=>onAnswer(rotate(interaction.nodes))}/></Suspense>; }
  return null;
}

function ReorderInteraction({value,disabled,onChange}:{value:string[];disabled:boolean;onChange(value:string[]):void}) {
  const [dragging,setDragging]=useState<number|null>(null); const move=(from:number,to:number)=>{if(disabled||from===to||to<0||to>=value.length)return;const next=[...value];const [item]=next.splice(from,1);next.splice(to,0,item);onChange(next);setDragging(to);};
  return <div className="micro-reorder" role="list" aria-label="拖动排序">{value.map((item,index)=><div key={item} role="listitem" data-reorder-index={index} className={dragging===index?"dragging":""}><button type="button" className="micro-drag-handle" disabled={disabled} aria-label={`拖动 ${item}`} onPointerDown={(event)=>{event.currentTarget.setPointerCapture(event.pointerId);setDragging(index);}} onPointerMove={(event)=>{if(dragging===null)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>("[data-reorder-index]");const next=Number(target?.dataset.reorderIndex);if(Number.isInteger(next)&&next!==dragging)move(dragging,next);}} onPointerUp={()=>setDragging(null)} onPointerCancel={()=>setDragging(null)}><GripVertical size={16}/></button><span>{index+1}</span><strong>{item}</strong><button type="button" disabled={disabled||index===0} onClick={()=>move(index,index-1)} aria-label={`${item} 上移`}><ArrowUp size={14}/></button><button type="button" disabled={disabled||index===value.length-1} onClick={()=>move(index,index+1)} aria-label={`${item} 下移`}><ArrowDown size={14}/></button></div>)}</div>;
}
