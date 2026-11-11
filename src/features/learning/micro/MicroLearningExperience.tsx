import { resolveMicroCompletionContext } from "./microCompletionContext";
import { apiRequest } from "@/shared/api/apiClient";
import type { ActionRun } from "@/features/actions/model";
import { MicroBody } from "./MicroBody";
import { mechanismFeedback, mechanismMessage } from "@/shared/learning/microMechanisms";
import { NativeInteraction, initialAnswer } from "./NativeInteraction";
import { ArrowLeft,ArrowRight,BookOpen,Check,Minimize2,RotateCcw,X } from "lucide-react";
import { lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState,type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation,useNavigate,useParams,useSearchParams } from "react-router-dom";
import { applicationServices,refreshLearnerState } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import type { MockSession } from "@/features/auth/types";
import { microReviewSteps,firstMicroReviewStep,previousMicroReviewStep,resolveMicroResumeStep,isMicroReviewSubmissionCorrect,nextMicroReviewStep,resolveMicroLearningReturnTarget,type H5PContentDescriptor,type H5PResult,type MicroInteraction,type MicroLearningAnswer,type MicroLearningRepository,type MicroReviewCursor,type MicroStep,type MicroLearningPath } from "./microLearning";
import { scrollFeedbackIntoView } from "./microFeedbackScroll";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { ObjectShell } from "@/shared/ui/ObjectShell";
import { Pill } from "@/shared/ui/Pill";
import { MicroUnitRail } from "./MicroUnitRail";
import { MicroStepList } from "./MicroStepList";
import "./microImmersive.css";

const H5PPlayer=lazy(()=>import("./H5PInteraction").then((module)=>({default:module.H5PInteraction})));
const hasAnswer=(answer:MicroLearningAnswer)=>Array.isArray(answer)?answer.length>0&&answer.every((item)=>typeof item!=="string"||Boolean(item.trim())):typeof answer==="object"?answer.executed>0:Boolean(answer);

const microKindLabel: Record<MicroStep["kind"], string> = {
  challenge: "挑战", feedback: "反馈", explanation: "讲解", interaction: "互动", application: "应用", check: "检查", summary: "小结"
};

export function MicroLearningExperience({session,onLogout,repository}:{session:MockSession|null;onLogout():void;repository:MicroLearningRepository}) {
  const navigate=useNavigate(),location=useLocation(),{knowledgeId=""}=useParams(),[searchParams]=useSearchParams();
  const courseId=searchParams.get("courseId")??undefined;
  const actionRunId = searchParams.get("actionRunId") || undefined;
  const requestedPathId = searchParams.get("pathId") || (typeof location.state?.microPathId === "string" ? location.state.microPathId : undefined);
  const requestedUnitId = searchParams.get("unitId") || undefined;
  const requestedStepId = searchParams.get("stepId") || undefined;
  const [actionProgress, setActionProgress] = useState<{ stepIds: string[]; complete: boolean } | null>(null);
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    let live = true; setActionProgress(null); setActionError("");
    if (actionRunId && courseId) void apiRequest<{ run: ActionRun; microStepIds: string[] }>(`/api/edge-actions?courseId=${encodeURIComponent(courseId)}&runId=${encodeURIComponent(actionRunId)}`).then(async value => {
      if (value.run.micro_path_id !== requestedPathId || value.run.execution_snapshot.targetId !== knowledgeId || value.run.status === 'cancelled') throw new Error('该小练习与行动执行记录不匹配。');
      if (value.run.status !== 'completed') await apiRequest('/api/edge-actions', { method: 'POST', body: JSON.stringify({ action: 'transition', runId: actionRunId, operation: 'start' }) });
      if (live) setActionProgress({ stepIds: value.microStepIds, complete: value.run.status === 'completed' });
    }).catch(error => { if (live) setActionError(error instanceof Error ? error.message : '无法读取行动执行记录'); });
    return () => { live = false; };
  }, [actionRunId, courseId, requestedPathId, knowledgeId]);
  const recommendationDecisionId = typeof location.state?.recommendationDecisionId === "string" ? location.state.recommendationDecisionId : undefined;
  const [revision,setRevision]=useState(0),[navigationAttempt,setNavigationAttempt]=useState(0),[pinned,setPinned]=useState<MicroReviewCursor|null>(null),[reviewCursor,setReviewCursor]=useState<MicroReviewCursor|null>(null),[busy,setBusy]=useState(false),[navigationDecision,setNavigationDecision]=useState<NavigationDecision|null>(null),[navigationError,setNavigationError]=useState(false),[startError,setStartError]=useState(false);
  useEffect(()=>repository.subscribe(()=>setRevision((value)=>value+1)),[repository]);
  const pathCandidates=useMemo(()=>repository.listPathsForKnowledge(knowledgeId,{mode:"learn"}),[knowledgeId,repository,revision]);
  const path=useMemo(()=>{
    if(requestedPathId)return repository.getPath(knowledgeId,{mode:"learn",pathId:requestedPathId});
    if(courseId)return repository.getPath(knowledgeId,{courseId,mode:"learn"});
    // A direct link without Course context must resolve uniquely; otherwise
    // the page asks which real 小练习 the learner means.
    return pathCandidates.length===1?pathCandidates[0]:null;
  },[courseId,knowledgeId,pathCandidates,repository,requestedPathId]);
  const owningCourse=useMemo(()=>{
    const pathCourseId=courseId??path?.courseId;
    if(pathCourseId)return applicationServices.courseRepository.getCourse(pathCourseId);
    return applicationServices.courseRepository.listCourseRuntimes().find(runtime=>runtime.curriculumCoverages.some(coverage=>coverage.nodeId===knowledgeId));
  },[courseId,knowledgeId,path?.courseId,revision]);
  const progress=path?repository.getPathProgress(path.id):undefined;
  const actionReady = !actionRunId || Boolean(actionProgress);
  useEffect(()=>{if(path&&!actionRunId&&actionReady&&progress?.status!=="completed"&&progress?.status!=="in_progress"){setStartError(false);void repository.start(path.id,courseId).catch(()=>setStartError(true));}},[courseId,path,progress?.status,repository,actionReady,actionRunId]);
  useEffect(()=>{
    let active=true;
    setNavigationDecision(null);setNavigationError(false);
    if(session&&courseId&&!actionRunId&&progress?.status==="completed"&&!pinned) {
      void applicationServices.learnerStateService.getNavigation(courseId).then((decision)=>{if(active)setNavigationDecision(decision);}).catch(()=>{if(active)setNavigationError(true);});
    }
    return()=>{active=false;};
  },[courseId,knowledgeId,navigationAttempt,pinned,progress?.status,session,actionRunId]);
  useEffect(()=>{
    setReviewCursor(null);
    if (requestedUnitId && requestedStepId && path?.units.some((item) => item.id === requestedUnitId && item.steps.some((stepItem) => stepItem.id === requestedStepId))) setPinned({ unitId: requestedUnitId, stepId: requestedStepId });
    else setPinned(null);
  },[path?.id,actionRunId,requestedUnitId,requestedStepId]);
  const actionSteps = path && actionRunId ? microReviewSteps(path) : [];
  const actionCursor = actionSteps.find(cursor => !actionProgress?.stepIds.includes(cursor.stepId)) ?? actionSteps[actionSteps.length - 1];
  const formalUnit=path?.units.find((item)=>item.id===(pinned?.unitId??actionCursor?.unitId??progress?.currentUnitId))??path?.units[0];
  const formalStep=formalUnit?(pinned?formalUnit.steps.find((item)=>item.id===pinned.stepId):actionCursor?formalUnit.steps.find(item=>item.id===actionCursor.stepId):resolveMicroResumeStep(formalUnit,repository.getUnitProgress(formalUnit.id),progress?.currentStepId)):undefined;
  const unit=reviewCursor?path?.units.find((item)=>item.id===reviewCursor.unitId):formalUnit;
  const step=reviewCursor?unit?.steps.find((item)=>item.id===reviewCursor.stepId):formalStep;
  const returnTarget=resolveMicroLearningReturnTarget(location.state,courseId);
  useEffect(()=>{
    if(typeof window==="undefined")return;
    function onKeyDown(event:KeyboardEvent){if(event.key==="Escape"&&!event.defaultPrevented){event.preventDefault();navigate(returnTarget);}}
    window.addEventListener("keydown",onKeyDown);
    return()=>window.removeEventListener("keydown",onKeyDown);
  },[navigate,returnTarget]);
  const context=session?{workspace:"learning" as const,experienceMode:"learn" as const,userRole:session.role,capabilities:session.capabilities,...(owningCourse?{courseId:owningCourse.course.id}:{}),knowledgeId}:undefined;
  const complete=useCallback(async(unitId:string,stepId:string,submission?:Parameters<MicroLearningRepository["completeStep"]>[3],clientDurationMs?:number)=>{
    if(!path)return false;
    setBusy(true);setPinned({unitId,stepId});
    try { const result=await repository.completeStep(path.id,unitId,stepId,submission,courseId,{decisionId:recommendationDecisionId,clientDurationMs,actionRunId});if(actionRunId)setActionProgress({stepIds:result.actionStepIds??[],complete:result.completed});if(result.correct&&session)await refreshLearnerState(session.userId);return result.correct; }
    finally { setBusy(false); }
  },[courseId,path,repository,session,recommendationDecisionId,actionRunId]);
  if(actionRunId&&!actionProgress)return <MicroShellFallback title={actionError?'无法继续本次行动':'正在读取本次行动…'} body={actionError||'正在核对执行资源和起点能力。'} onBack={()=>navigate(returnTarget)}/>;
  if(!path&&pathCandidates.length>1)return <MicroShellFallback title="选择一个小练习" body={`这个知识点有 ${pathCandidates.length} 份已发布的小练习，请选择一份继续。`} note="请选择一份小练习；选择前不会记录进度。" onBack={()=>navigate(returnTarget)}>
    <div className="micro-unsupported-choices">{pathCandidates.map(candidate=><button key={candidate.id} type="button" className="atlas-secondary" onClick={()=>navigate(`/learn/micro/${encodeURIComponent(knowledgeId)}?pathId=${encodeURIComponent(candidate.id)}${candidate.courseId?`&courseId=${encodeURIComponent(candidate.courseId)}`:""}`)}><span>{candidate.title}<small>{candidate.courseId?applicationServices.courseRepository.getCourse(candidate.courseId)?.course.title??"课程小练习":"小练习"} · 约 {candidate.estimatedMinutes} 分钟</small></span><ArrowRight size={15}/></button>)}</div>
  </MicroShellFallback>;
  if(!path)return <MicroShellFallback title="该知识暂不支持小练习" body="当前还没有已发布的 MicroLearningPath。你仍然可以返回来源，或继续查看关联课件。" onBack={()=>navigate(returnTarget)}/>;
  if(!unit||!step||!formalUnit||!formalStep)return <MicroShellFallback title="该小练习内容尚未完整发布" body="这条学习内容还没有完整发布。" onBack={()=>navigate(returnTarget)}/>;
  const total=path.units.reduce((sum,item)=>sum+item.steps.length,0);
  const currentIndex=path.units.filter((item)=>item.position<unit.position).reduce((sum,item)=>sum+item.steps.length,0)+unit.steps.findIndex((item)=>item.id===step.id)+1;
  const formalCompleted=actionRunId?Boolean(actionProgress?.complete):progress?.status==="completed";
  const completedCount=actionRunId?(actionProgress?.stepIds.length??0):formalCompleted?total:path.units.reduce((sum,item)=>sum+(repository.getUnitProgress(item.id)?.completedStepIds.length??0),0);
  const showCompleted=formalCompleted&&!pinned&&!reviewCursor;
  const completionActions=resolveMicroCompletionContext({knowledgeId,runtime:courseId?applicationServices.courseRepository.getCourse(courseId):undefined,decision:navigationDecision,actionExecution:Boolean(actionRunId),hasMicro:(nodeId)=>Boolean(repository.getPath(nodeId,{courseId,mode:"learn"}))});
  const nextAction=completionActions.find((action)=>action.kind==="next");

  const previous=previousMicroReviewStep(path,{unitId:unit.id,stepId:step.id});
  const nextReview=()=>{if(!reviewCursor)return;const next=nextMicroReviewStep(path,reviewCursor);setReviewCursor(next&&!((!formalCompleted||pinned)&&next.unitId===formalUnit.id&&next.stepId===formalStep.id)&&!(next.unitId===progress?.currentUnitId&&next.stepId===progress?.currentStepId&&!formalCompleted)?next:null);};
  const [footerMount,setFooterMount]=useState<HTMLDivElement|null>(null);
  const courseTitle=owningCourse?.course.title;
  const minimize=()=>navigate(`/?micro=${encodeURIComponent(knowledgeId)}:${encodeURIComponent(path.id)}:${encodeURIComponent(courseId??"")}&view=side`);
  const shellTools = <>
    <button type="button" className="ef-micro-icon" onClick={minimize} aria-label="缩小为侧面板" title="缩小为侧面板"><Minimize2 size={16} aria-hidden="true" /></button>
    <button type="button" className="ef-micro-icon" onClick={() => navigate(returnTarget)} aria-label="退出小练习"><X size={16} aria-hidden="true" /></button>
  </>;
  const footerMeta = <div className="ef-micro-foot-progress" aria-label={actionRunId ? `本次行动进度 ${completedCount}/${total}` : `正式学习进度 ${completedCount}/${total}`}>
    <span className="ef-micro-segments" aria-hidden="true">{path.units.map((item) => {
      const unitProgress = repository.getUnitProgress(item.id)?.status;
      return <i key={item.id} data-state={unitProgress === "completed" ? "done" : item.id === unit.id ? "now" : "todo"} />;
    })}</span>
    <span>第 {(path.units.find((item) => item.id === unit.id)?.position ?? 0) + 1} / {path.units.length} 单元</span>
    {actionRunId ? <span>本次行动 · {completedCount} / {total}</span> : null}
  </div>;
  const stage = <div className="ef-micro-stage">
    <div className="ef-micro-content">
    {startError ? <div className="micro-feedback retry" role="alert">学习尚未成功启动；当前步骤不会被记录。<button type="button" onClick={() => { setStartError(false); void repository.start(path.id, courseId).catch(() => setStartError(true)); }}>重试启动</button></div> : null}
    {showCompleted ? <section className="micro-step-complete">
      <MicroStepList path={path} repository={repository} completedStepIds={actionRunId ? new Set(actionProgress?.stepIds ?? []) : undefined} onSelect={(unitId, stepId) => setReviewCursor({ unitId, stepId })} />
      {actionRunId && courseId ? <button className="atlas-primary micro-completion-next" onClick={() => navigate(`/courses/${encodeURIComponent(courseId)}`)}>继续正式路线<ArrowRight size={17} /></button> : null}
      {completionActions.length || navigationError ? <section className="micro-completion-context" aria-label="继续学习与相关内容"><h2>继续学习 / 相关内容</h2>
      {nextAction ? <button className="atlas-primary micro-completion-next" onClick={() => navigate(nextAction.href, { state: { returnTo: returnTarget, recommendationDecisionId: navigationDecision?.decisionId, microPathId: navigationDecision?.nextAction.resourceKind === "micro" ? navigationDecision.nextAction.resourceId : undefined } })}><span>继续下一项<strong>{nextAction.title}</strong></span><ArrowRight size={17} /></button> : null}
      {completionActions.filter((action) => action.kind !== "next").map((action) => <button key={action.href} className="atlas-secondary micro-completion-related" onClick={() => navigate(action.href, { state: { returnTo: `${location.pathname}${location.search}`, returnState: { returnTo: returnTarget } } })}><span>{action.kind === "material" ? "相关资料" : "相关练习"}<strong>{action.title}</strong></span><ArrowRight size={15} /></button>)}
      {navigationError ? <div className="micro-feedback retry" role="alert">下一步暂时无法加载；学习进度已保存。<button className="atlas-secondary" onClick={() => setNavigationAttempt((value) => value + 1)}>重试下一步</button></div> : null}
      </section> : null}<div className="micro-completion-footer"><button className="atlas-secondary" onClick={() => navigate(returnTarget)}>{courseId && returnTarget === `/courses/${encodeURIComponent(courseId)}` ? "返回课程" : "返回来源"}<ArrowRight size={15} /></button></div></section> : null}
    {!showCompleted ? <>
      {!formalCompleted || pinned ? <div hidden={Boolean(reviewCursor)} className="micro-step-slot"><MicroStepPanel variant="immersive" footerMount={footerMount} footerMeta={footerMeta} key={`${actionRunId ?? "learning"}:${path.id}:${formalStep.id}`} path={path} unitId={formalUnit.id} step={formalStep} repository={repository} session={session} review={false} active={!reviewCursor} busy={busy} previous={previousMicroReviewStep(path, { unitId: formalUnit.id, stepId: formalStep.id })} onBack={(cursor) => setReviewCursor(cursor)} onNext={() => setPinned(null)} onReturn={() => setReviewCursor(null)} onComplete={(submission, duration) => complete(formalUnit.id, formalStep.id, submission, duration)} /></div> : null}
      {reviewCursor ? <MicroStepPanel variant="immersive" footerMount={footerMount} footerMeta={footerMeta} key={`review:${path.id}:${step.id}`} path={path} unitId={unit.id} step={step} repository={repository} session={session} review active busy={busy} previous={previous} onBack={setReviewCursor} onNext={nextReview} onReturn={() => setReviewCursor(null)} /> : null}
    </> : null}
    </div>
  </div>;
  return <main className="micro-learning-page ef-micro-page">
    <ObjectShell size="immersive" className="ef-micro-shell" icon={<BookOpen size={18} />} title={showCompleted ? `${path.title}` : step.title} kicker={showCompleted ? <span>小练习 · 路径已完成</span> : <span>小练习 · {path.title}</span>} context={courseTitle?<span>{courseTitle}</span>:undefined} badge={showCompleted ? <Pill tone="ok">已完成</Pill> : <Pill tone="quiet">约 {path.estimatedMinutes} 分钟</Pill>} tools={shellTools} stage={stage} footer={showCompleted ? undefined : <div ref={setFooterMount} className="ef-micro-foot-host" />} inspector={<MicroUnitRail path={path} currentUnitId={unit.id} repository={repository} />} inspectorTitle="单元路径" />
    <EduFlowAssistant context={context ? { ...context, presentation: actionRunId ? "micro-action" : "micro-learning", actionRunId, microPathId: path.id, microUnitId: unit.id, microStepId: step.id } : undefined} locked={!session} contextLabel={path.title} />
  </main>;
}

export function MicroStepPanel({path,unitId,step,repository,session,review,active,busy,previous,onBack,onNext,onReturn,onComplete,variant="card",footerMount=null,footerMeta,progressLabel,inlineFormActions,onFeedbackShown}:{path:MicroLearningPath;unitId:string;step:MicroStep;repository:MicroLearningRepository;session:MockSession|null;review:boolean;active:boolean;busy:boolean;previous:MicroReviewCursor|null;onBack(cursor:MicroReviewCursor):void;onNext():void;onReturn():void;onComplete?(submission?:Parameters<MicroLearningRepository["completeStep"]>[3],durationMs?:number):Promise<boolean>;variant?:"card"|"immersive";footerMount?:HTMLElement|null;footerMeta?:ReactNode;progressLabel?:ReactNode;inlineFormActions?:ReactNode;onFeedbackShown?():void}) {
  const [answer,setAnswer]=useState<MicroLearningAnswer>(()=>initialAnswer(step.interaction)),[touched,setTouched]=useState(false),[grading,setGrading]=useState<"success"|"retry"|"error"|null>(null),[whyOpen,setWhyOpen]=useState(false);
  const inFlight=useRef(false),interaction=step.interaction,feedbackRef=useRef<HTMLDivElement>(null),lastFeedbackRef=useRef<string|null>(null);
  // Client-reported visible elapsed time only; never used as an attainment signal.
  const elapsed=useRef({total:0,since:performance.now()});
  useEffect(()=>{if(!active)return;elapsed.current.since=performance.now();return()=>{elapsed.current.total+=performance.now()-elapsed.current.since;};},[active]);
  const mechanism=interaction&&(interaction.type==="flow-execution"||interaction.type==="simulation"||interaction.type==="data-transform")?interaction:undefined;
  const result=mechanism?mechanismFeedback(mechanism,answer):undefined;
  const completeCurrent=async(submission?:Parameters<MicroLearningRepository["completeStep"]>[3])=>{
    if(!active||inFlight.current||busy||(!review&&grading==="success"))return;
    const value=submission??(interaction?answer:undefined);
    if(review){setGrading(isMicroReviewSubmissionCorrect(interaction,value)?"success":"retry");return;}
    inFlight.current=true;
    try{const duration=Math.min(86400000,Math.round(elapsed.current.total+performance.now()-elapsed.current.since));setGrading(await onComplete?.(value,duration)?"success":"retry");elapsed.current={total:0,since:performance.now()};}catch{setGrading("error");}finally{inFlight.current=false;}
  };
  const concreteFeedback=mechanism&&result?mechanismMessage(mechanism,result):interaction?.type==="categorize"&&Array.isArray(answer)?interaction.items.flatMap((item,index)=>answer[index]!==interaction.correctCategories[index]?[`「${item.label}」应归入「${interaction.correctCategories[index]}」。`]:[]).join(" "):interaction?.type==="ordering"&&Array.isArray(answer)?`第 ${interaction.correctOrder.findIndex((item,index)=>item!==answer[index])+1} 个位置不符合顺序。`:undefined;
  const acknowledgment=mechanism?.mode==="explore"?"演示已执行":interaction?"判断正确":"已浏览本页";
  const feedback=grading==="success"?(step.successFeedback??(review?`${acknowledgment}；复习结果不会改写原进度。`:session?`${acknowledgment}，进度已保存。`:`${acknowledgment}；本次匿名体验不会保存进度。`)):grading==="retry"?(concreteFeedback||step.retryFeedback||"答案尚未满足完成条件，请重试。"):grading==="error"?"保存失败，进度没有被推进。请重试。":null;
  const feedbackKey=feedback?`${grading}:${typeof feedback==="string"?feedback:JSON.stringify(feedback)}`:null;
  useEffect(() => {
    const previous=lastFeedbackRef.current;
    lastFeedbackRef.current=feedbackKey;
    if(!feedbackKey||previous===feedbackKey)return;
    // Scroll exactly once, after this feedback has committed. Subsequent
    // manual scrolling is never overridden.
    const frame=window.requestAnimationFrame(()=>{onFeedbackShown?.();const node=feedbackRef.current;if(node)scrollFeedbackIntoView(node);});
    return()=>window.cancelAnimationFrame(frame);
  },[feedbackKey,onFeedbackShown]);
  const demonstration=step.kind==="explanation"||step.kind==="summary";
  const immersive=variant==="immersive";
  // Data-driven explanation: do not repeat the body when the only available
  // explanation is the same content the learner is already reading.
  const whyContent=[mechanism?.teaching?.explanation,step.retryFeedback].find((content)=>content!=null&&JSON.stringify(content)!==JSON.stringify(step.body));
  const whyButton=whyContent?<button className="atlas-secondary" onClick={()=>setWhyOpen((value)=>!value)}>{whyOpen?"收起解释":"为什么？"}</button>:null;
  const previousButton=immersive||!previous?null:<button className="atlas-secondary" disabled={busy} onClick={()=>previous&&onBack(previous)}><ArrowLeft size={15}/>上一步</button>;
  const primaryActions=review?<>{interaction&&!demonstration&&interaction.type!=="h5p"?<button className="atlas-secondary" disabled={!hasAnswer(answer)} onClick={()=>void completeCurrent()}>检查答案</button>:null}<button className="atlas-primary" onClick={onNext}>下一步<ArrowRight size={15}/></button></>:grading==="success"?<button className="atlas-primary" disabled={busy} onClick={onNext}>继续<ArrowRight size={15}/></button>:interaction?.type==="h5p"?<button className="atlas-primary" disabled>完成互动后继续<ArrowRight size={15}/></button>:<button className="atlas-primary" disabled={busy||Boolean(interaction&&(!hasAnswer(answer)||((interaction.type==="parameter-lab"||interaction.type==="matrix-tensor")&&!touched)))} onClick={()=>void completeCurrent()}>{busy?"保存中…":interaction&&!demonstration?"检查答案":"继续"}<ArrowRight size={15}/></button>;
  // Left: persisted progress. Right: secondary controls first, primary last.
  const footerContent=<><div className="ef-micro-foot-left">{immersive?footerMeta:<span className="ef-micro-foot-progress-text">{progressLabel}</span>}{inlineFormActions}</div><span className="ef-micro-foot-actions">{previousButton}{whyButton}{primaryActions}</span></>;
  return <article className={immersive?`micro-step micro-step--immersive micro-step-${grading??"active"}`:`micro-card micro-step-${grading??"active"}`}><span className="atlas-kicker">{review?"复习 · ":""}第 {(path.units.find((unit)=>unit.id===unitId)?.position??0)+1} 单元 · {microKindLabel[step.kind]}</span><h1>{step.title}</h1><MicroBody body={step.body}/>
    {review?<div className="micro-review-banner"><span>回看中 · 正式进度保持不变</span><button type="button" onClick={onReturn}>返回当前进度</button></div>:null}
    {interaction?.type==="h5p"?<H5PStep repository={repository} pathId={path.id} unitId={unitId} stepId={step.id} interaction={interaction} onResult={(eventId,result)=>void completeCurrent({kind:"h5p-result",contentRef:interaction.contentRef,eventId,result})}/>:interaction?<NativeInteraction step={step} answer={answer} completed={!active||(!review&&grading==="success")} demonstration={demonstration} onAnswer={(value)=>{setAnswer(value);setTouched(true);setGrading(null);}}/>:null}
    {immersive
      ? (feedback?<div ref={feedbackRef} className={`micro-feedback ${grading==="success"?"success":"retry"}`} role="status"><MicroBody body={feedback}/></div>:null)
      : <div className="micro-feedback-slot" role="status" aria-live="polite">{feedback?<div ref={feedbackRef} className={`micro-feedback ${grading==="success"?"success":"retry"}`}><MicroBody body={feedback}/></div>:null}</div>}
    {whyOpen&&whyContent?<div className="micro-inline-explanation"><strong>机制解释</strong><MicroBody body={whyContent}/><small>这是预先准备的教学解释；{session?"可以":"登录后可"}继续和 EduFlow 助手讨论当前步骤，不影响评分。</small></div>:null}
    {footerMount ? createPortal(<div className="ef-micro-foot">{footerContent}</div>,footerMount) : <footer style={review ? { marginTop: "var(--sp-20)" } : undefined}>{footerContent}</footer>}
  </article>;
}

function MicroShellFallback({title,body,onBack,children,note="当前内容暂时无法学习；本步骤不会被跳过。"}:{title:string;body:string;onBack():void;children?:ReactNode;note?:string}) {
  const navigate=useNavigate();
  return <main className="micro-learning-page ef-micro-page"><ObjectShell size="immersive" className="ef-micro-shell" title={title} kicker="小练习" context="沉浸学习" tools={<button type="button" className="ef-micro-icon" onClick={onBack} aria-label="退出小练习"><X size={16}/></button>} stage={<Unsupported title={title} body={body} onBack={onBack}>{children}</Unsupported>} inspector={<div className="ef-micro-rail"><p className="ef-micro-rail-note">{note}</p><button type="button" className="ef-micro-rail-link" onClick={()=>navigate("/")}>返回首页</button></div>} inspectorTitle="单元路径"/></main>;
}

function Unsupported({title,body,onBack,children}:{title:string;body:string;onBack():void;children?:ReactNode}) { return <section className="micro-unsupported"><button className="micro-unsupported-back" onClick={onBack}><ArrowLeft size={16}/>返回</button><div><span className="atlas-kicker">小练习</span><h1>{title}</h1><p>{body}</p>{children}<button className="atlas-primary" onClick={onBack}>返回来源<ArrowRight size={15}/></button></div></section>; }

function H5PStep({repository,pathId,unitId,stepId,interaction,onResult}:{repository:MicroLearningRepository;pathId:string;unitId:string;stepId:string;interaction:Extract<MicroInteraction,{type:"h5p"}>;onResult(eventId:string,result:H5PResult):void}) {
  const [descriptor,setDescriptor]=useState<H5PContentDescriptor|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let live=true;setDescriptor(null);setError(false);void repository.resolveH5PContent(pathId,unitId,stepId,interaction.contentRef).then((value)=>{if(live)setDescriptor(value);}).catch(()=>{if(live)setError(true);});return()=>{live=false;};},[attempt,interaction.contentRef,pathId,repository,stepId,unitId]);
  if(error)return <div className="micro-feedback retry" role="alert"><strong>该互动内容暂时无法加载</strong><span>这段互动暂时无法显示，本步骤不会被跳过。</span><button type="button" onClick={()=>setAttempt((value)=>value+1)}>重试</button></div>;
  if(!descriptor)return <p className="micro-h5p-loading" role="status">正在验证互动内容…</p>;
  return <Suspense fallback={<p className="micro-h5p-loading">正在载入互动内容…</p>}><H5PPlayer descriptor={descriptor} onResult={onResult}/></Suspense>;
}
