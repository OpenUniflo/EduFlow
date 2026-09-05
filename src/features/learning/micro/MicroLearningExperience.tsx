import { MicroBody } from "./MicroBody";
import { mechanismFeedback, mechanismMessage } from "@/shared/learning/microMechanisms";
import { NativeInteraction, initialAnswer } from "./NativeInteraction";
import { ArrowLeft,ArrowRight,Check,RotateCcw } from "lucide-react";
import { lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState } from "react";
import { useLocation,useNavigate,useParams,useSearchParams } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices,refreshLearnerState } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import type { MockSession } from "@/features/auth/types";
import { firstMicroReviewStep,previousMicroReviewStep,resolveMicroResumeStep,isMicroReviewSubmissionCorrect,nextMicroReviewStep,resolveMicroLearningReturnTarget,type H5PContentDescriptor,type H5PResult,type MicroInteraction,type MicroLearningAnswer,type MicroLearningRepository,type MicroReviewCursor,type MicroStep,type MicroLearningPath } from "./microLearning";
import type { NavigationDecision } from "@/shared/learning/navigation";

const H5PPlayer=lazy(()=>import("./H5PInteraction").then((module)=>({default:module.H5PInteraction})));
const hasAnswer=(answer:MicroLearningAnswer)=>Array.isArray(answer)?answer.length>0&&answer.every((item)=>typeof item!=="string"||Boolean(item.trim())):typeof answer==="object"?answer.executed>0:Boolean(answer);

export function MicroLearningExperience({session,onLogout,repository}:{session:MockSession|null;onLogout():void;repository:MicroLearningRepository}) {
  const navigate=useNavigate(),location=useLocation(),{knowledgeId=""}=useParams(),[searchParams]=useSearchParams();
  const courseId=searchParams.get("courseId")??undefined;
  const [revision,setRevision]=useState(0),[pinned,setPinned]=useState<MicroReviewCursor|null>(null),[reviewCursor,setReviewCursor]=useState<MicroReviewCursor|null>(null),[busy,setBusy]=useState(false),[navigationDecision,setNavigationDecision]=useState<NavigationDecision|null>(null),[navigationError,setNavigationError]=useState(false),[startError,setStartError]=useState(false);
  useEffect(()=>repository.subscribe(()=>setRevision((value)=>value+1)),[repository]);
  const path=useMemo(()=>repository.getPath(knowledgeId,{courseId,mode:"learn"}),[courseId,knowledgeId,repository,revision]);
  const progress=path?repository.getPathProgress(path.id):undefined;
  useEffect(()=>{if(path&&progress?.status!=="completed"&&progress?.status!=="in_progress"){setStartError(false);void repository.start(path.id,courseId).catch(()=>setStartError(true));}},[courseId,path,progress?.status,repository]);
  useEffect(()=>{if(session&&courseId&&progress?.status==="completed"&&!pinned){setNavigationError(false);void applicationServices.learnerStateService.getNavigation(courseId).then(setNavigationDecision).catch(()=>setNavigationError(true));}},[courseId,pinned,progress?.status,session]);
  useEffect(()=>{setReviewCursor(null);setPinned(null);},[path?.id]);
  const formalUnit=path?.units.find((item)=>item.id===(pinned?.unitId??progress?.currentUnitId))??path?.units[0];
  const formalStep=formalUnit?(pinned?formalUnit.steps.find((item)=>item.id===pinned.stepId):resolveMicroResumeStep(formalUnit,repository.getUnitProgress(formalUnit.id),progress?.currentStepId)):undefined;
  const unit=reviewCursor?path?.units.find((item)=>item.id===reviewCursor.unitId):formalUnit;
  const step=reviewCursor?unit?.steps.find((item)=>item.id===reviewCursor.stepId):formalStep;
  const returnTarget=resolveMicroLearningReturnTarget(location.state,courseId);
  const context=session?{workspace:"learning" as const,experienceMode:"learn" as const,userRole:session.role,capabilities:session.capabilities,courseId,knowledgeId}:undefined;
  const complete=useCallback(async(unitId:string,stepId:string,submission?:Parameters<MicroLearningRepository["completeStep"]>[3])=>{
    if(!path)return false;
    setBusy(true);setPinned({unitId,stepId});
    try { const result=await repository.completeStep(path.id,unitId,stepId,submission,courseId);if(result.correct&&session)await refreshLearnerState(session.userId);return result.correct; }
    finally { setBusy(false); }
  },[courseId,path,repository,session]);
  if(!path)return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/><Unsupported title="该知识暂不支持快速学习" body="当前还没有已发布的 MicroLearningPath。你仍然可以返回来源，或继续查看关联课件。" onBack={()=>navigate(returnTarget)}/></main>;
  if(!unit||!step||!formalUnit||!formalStep)return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/><Unsupported title="该快速学习内容尚未完整发布" body="发布内容缺少必要 Unit 或 Step。" onBack={()=>navigate(returnTarget)}/></main>;
  const total=path.units.reduce((sum,item)=>sum+item.steps.length,0);
  const currentIndex=path.units.filter((item)=>item.position<unit.position).reduce((sum,item)=>sum+item.steps.length,0)+unit.steps.findIndex((item)=>item.id===step.id)+1;
  const formalCompleted=progress?.status==="completed";
  const completedCount=formalCompleted?total:path.units.reduce((sum,item)=>sum+(repository.getUnitProgress(item.id)?.completedStepIds.length??0),0);
  const showCompleted=formalCompleted&&!pinned&&!reviewCursor;
  const nextActionHref=navigationDecision?.nextAction.resourceKind==="assignment"&&navigationDecision.nextAction.resourceId?`/courses/${encodeURIComponent(courseId!)}/assignments/${encodeURIComponent(navigationDecision.nextAction.resourceId)}`:navigationDecision?.nextAction.resourceKind==="material"&&navigationDecision.nextAction.resourceId?`/courses/${encodeURIComponent(courseId!)}/materials/${encodeURIComponent(navigationDecision.nextAction.resourceId)}`:returnTarget;
  const previous=previousMicroReviewStep(path,{unitId:unit.id,stepId:step.id});
  const nextReview=()=>{if(!reviewCursor)return;const next=nextMicroReviewStep(path,reviewCursor);setReviewCursor(next&&!((!formalCompleted||pinned)&&next.unitId===formalUnit.id&&next.stepId===formalStep.id)&&!(next.unitId===progress?.currentUnitId&&next.stepId===progress?.currentStepId&&!formalCompleted)?next:null);};
  return <main className="micro-learning-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/><header className="micro-learning-header"><button onClick={()=>navigate(returnTarget)}><ArrowLeft size={16}/>返回</button><span><small>MICRO LEARNING · {path.estimatedMinutes} 分钟</small><strong>{path.title}</strong></span><i>{showCompleted?total:currentIndex} / {total}</i></header>
    <section className="micro-learning-stage">{startError?<div className="micro-feedback retry" role="alert">学习尚未成功启动；当前 Step 不会被记录。<button type="button" onClick={()=>{setStartError(false);void repository.start(path.id,courseId).catch(()=>setStartError(true));}}>重试启动</button></div>:null}<div className="micro-progress" aria-label={`正式学习进度 ${completedCount}/${total}`}><i style={{width:`${completedCount/Math.max(total,1)*100}%`}}/></div>
      {showCompleted?<article className="micro-card micro-complete"><Check size={36}/><span className="atlas-kicker">PATH COMPLETED</span><h1>这条微学习路径已完成</h1><p>{session?"完成已持久化为学习证据；主动复习不会清空进度、重复完成证据或降低学习状态。":"你已完成一次匿名本地体验；答案与进度不会写入账户或 learner state。"}</p>{navigationDecision?<section className="micro-next-action"><small>NEXT ACTION · {navigationDecision.policyVersion}</small><strong>{navigationDecision.nextAction.kind==="practice"?"用实训证明掌握":"继续学习路线"}</strong><span>{navigationDecision.nextAction.reason}</span></section>:navigationError?<div className="micro-feedback retry" role="alert">下一步暂时无法加载；学习进度已保存，你可以重试或返回课程。</div>:null}<div><button className="atlas-secondary" onClick={()=>setReviewCursor(firstMicroReviewStep(path))}><RotateCcw size={15}/>重新复习</button>{navigationError&&courseId?<button className="atlas-secondary" onClick={()=>{setNavigationError(false);void applicationServices.learnerStateService.getNavigation(courseId).then(setNavigationDecision).catch(()=>setNavigationError(true));}}>重试下一步</button>:null}<button className="atlas-primary" onClick={()=>navigate(navigationDecision?nextActionHref:returnTarget)}>{navigationDecision?"前往下一步":"返回来源"}<ArrowRight size={15}/></button></div></article>:null}
      {!showCompleted?<>
        {!formalCompleted||pinned?<div hidden={Boolean(reviewCursor)} className="micro-step-slot"><MicroStepPanel key={`${path.id}:${formalStep.id}`} path={path} unitId={formalUnit.id} step={formalStep} repository={repository} session={session} review={false} active={!reviewCursor} busy={busy} previous={previousMicroReviewStep(path,{unitId:formalUnit.id,stepId:formalStep.id})} onBack={(cursor)=>setReviewCursor(cursor)} onNext={()=>setPinned(null)} onReturn={()=>setReviewCursor(null)} onComplete={(submission)=>complete(formalUnit.id,formalStep.id,submission)}/></div>:null}
        {reviewCursor?<MicroStepPanel key={`review:${path.id}:${step.id}`} path={path} unitId={unit.id} step={step} repository={repository} session={session} review active busy={busy} previous={previous} onBack={setReviewCursor} onNext={nextReview} onReturn={()=>setReviewCursor(null)}/>:null}
      </>:null}
    </section><EduFlowAssistant context={context?{...context,microPathId:path.id,microUnitId:unit.id,microStepId:step.id}:undefined} locked={!session} contextLabel={path.title}/></main>;
}

function MicroStepPanel({path,unitId,step,repository,session,review,active,busy,previous,onBack,onNext,onReturn,onComplete}:{path:MicroLearningPath;unitId:string;step:MicroStep;repository:MicroLearningRepository;session:MockSession|null;review:boolean;active:boolean;busy:boolean;previous:MicroReviewCursor|null;onBack(cursor:MicroReviewCursor):void;onNext():void;onReturn():void;onComplete?(submission?:Parameters<MicroLearningRepository["completeStep"]>[3]):Promise<boolean>}) {
  const [answer,setAnswer]=useState<MicroLearningAnswer>(()=>initialAnswer(step.interaction)),[touched,setTouched]=useState(false),[grading,setGrading]=useState<"success"|"retry"|"error"|null>(null),[whyOpen,setWhyOpen]=useState(false);
  const inFlight=useRef(false),interaction=step.interaction;
  const mechanism=interaction&&(interaction.type==="flow-execution"||interaction.type==="simulation"||interaction.type==="data-transform")?interaction:undefined;
  const result=mechanism?mechanismFeedback(mechanism,answer):undefined;
  const completeCurrent=async(submission?:Parameters<MicroLearningRepository["completeStep"]>[3])=>{
    if(!active||inFlight.current||busy||(!review&&grading==="success"))return;
    const value=submission??(interaction?answer:undefined);
    if(review){setGrading(isMicroReviewSubmissionCorrect(interaction,value)?"success":"retry");return;}
    inFlight.current=true;
    try{setGrading(await onComplete?.(value)?"success":"retry");}catch{setGrading("error");}finally{inFlight.current=false;}
  };
  const concreteFeedback=mechanism&&result?mechanismMessage(mechanism,result):interaction?.type==="categorize"&&Array.isArray(answer)?interaction.items.flatMap((item,index)=>answer[index]!==interaction.correctCategories[index]?[`「${item.label}」应归入「${interaction.correctCategories[index]}」。`]:[]).join(" "):interaction?.type==="ordering"&&Array.isArray(answer)?`第 ${interaction.correctOrder.findIndex((item,index)=>item!==answer[index])+1} 个位置不符合顺序。`:undefined;
  const feedback=grading==="success"?(step.successFeedback??(review?"判断正确；复习结果不会改写原进度。":session?"判断正确，进度已保存。":"判断正确；本次匿名体验不会保存进度。")):grading==="retry"?(concreteFeedback||step.retryFeedback||"答案尚未满足完成条件，请重试。"):grading==="error"?"保存失败，进度没有被推进。请重试。":null;
  const demonstration=step.kind==="explanation"||step.kind==="summary";
  return <article className={`micro-card micro-step-${grading??"active"}`}><span className="atlas-kicker">{review?"REVIEW · ":""}UNIT {(path.units.find((unit)=>unit.id===unitId)?.position??0)+1} · {step.kind.toUpperCase()}</span><h1>{step.title}</h1><MicroBody body={step.body}/>
    {review?<div className="micro-review-banner"><span>回看中 · 正式进度保持不变</span><button type="button" onClick={onReturn}>返回当前进度</button></div>:null}
    {interaction?.type==="h5p"?<H5PStep repository={repository} pathId={path.id} unitId={unitId} stepId={step.id} interaction={interaction} onResult={(eventId,result)=>void completeCurrent({kind:"h5p-result",contentRef:interaction.contentRef,eventId,result})}/>:interaction?<NativeInteraction step={step} answer={answer} completed={!active||(!review&&grading==="success")} demonstration={demonstration} onAnswer={(value)=>{setAnswer(value);setTouched(true);setGrading(null);}}/>:null}
    {feedback?<div className={`micro-feedback ${grading==="success"?"success":"retry"}`} role="status"><MicroBody body={feedback}/></div>:null}
    {whyOpen?<div className="micro-inline-explanation"><strong>机制解释</strong><MicroBody body={mechanism?.teaching?.explanation??step.retryFeedback??step.body}/><small>此处为预设教学解释；登录后可通过右下角 EduFlow Assistant 继续讨论当前步骤，不参与评分。</small></div>:null}
    <footer><button className="atlas-secondary" disabled={!previous||busy} onClick={()=>previous&&onBack(previous)}><ArrowLeft size={15}/>上一步</button><button className="atlas-secondary" onClick={()=>setWhyOpen((value)=>!value)}>{whyOpen?"收起解释":"为什么？"}</button>
      {review?<>{interaction&&!demonstration&&interaction.type!=="h5p"?<button className="atlas-secondary" disabled={!hasAnswer(answer)} onClick={()=>void completeCurrent()}>检查答案</button>:null}<button className="atlas-primary" onClick={onNext}>下一步<ArrowRight size={15}/></button></>:grading==="success"?<button className="atlas-primary" disabled={busy} onClick={onNext}>继续<ArrowRight size={15}/></button>:interaction?.type==="h5p"?null:<button className="atlas-primary" disabled={busy||Boolean(interaction&&(!hasAnswer(answer)||((interaction.type==="parameter-lab"||interaction.type==="matrix-tensor")&&!touched)))} onClick={()=>void completeCurrent()}>{busy?"保存中…":interaction&&!demonstration?"检查答案":"继续"}<ArrowRight size={15}/></button>}
    </footer>
  </article>;
}

function Unsupported({title,body,onBack}:{title:string;body:string;onBack():void}) { return <section className="micro-unsupported"><button className="micro-unsupported-back" onClick={onBack}><ArrowLeft size={16}/>返回</button><div><span className="atlas-kicker">MICRO LEARNING</span><h1>{title}</h1><p>{body}</p><button className="atlas-primary" onClick={onBack}>返回来源<ArrowRight size={15}/></button></div></section>; }

function H5PStep({repository,pathId,unitId,stepId,interaction,onResult}:{repository:MicroLearningRepository;pathId:string;unitId:string;stepId:string;interaction:Extract<MicroInteraction,{type:"h5p"}>;onResult(eventId:string,result:H5PResult):void}) {
  const [descriptor,setDescriptor]=useState<H5PContentDescriptor|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let live=true;setDescriptor(null);setError(false);void repository.resolveH5PContent(pathId,unitId,stepId,interaction.contentRef).then((value)=>{if(live)setDescriptor(value);}).catch(()=>{if(live)setError(true);});return()=>{live=false;};},[attempt,interaction.contentRef,pathId,repository,stepId,unitId]);
  if(error)return <div className="micro-feedback retry" role="alert"><strong>该互动内容暂时无法加载</strong><span>内容引用不可用，当前 Step 不会被跳过。</span><button type="button" onClick={()=>setAttempt((value)=>value+1)}>重试</button></div>;
  if(!descriptor)return <p className="micro-h5p-loading" role="status">正在验证互动内容…</p>;
  return <Suspense fallback={<p className="micro-h5p-loading">正在载入 H5P Runtime…</p>}><H5PPlayer descriptor={descriptor} onResult={onResult}/></Suspense>;
}
