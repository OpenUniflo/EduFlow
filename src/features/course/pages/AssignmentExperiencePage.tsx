import { ArrowLeft, Check, Clock3, FileCode2, Network } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { courseAssignmentEligibility, evaluateTraceSelection } from "@/features/course/assignmentExperience";
import { useOptionalUserCourseState, workflowLaunchUrl } from "@/features/learning/progress/progressService";
import { globalKnowledgeAccess, userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { ConversationWorkspace, type ConversationItem } from "@/features/assistant/conversation/ConversationWorkspace";
import { orderedWorkspaceReferences } from '@/features/assistant/conversation/workspaceReferences';
import { useWorkspaceConversation } from "@/features/assistant/conversation/useWorkspaceConversation";
import { CapabilityConversation } from "@/features/evidence/CapabilityConversation";
import { evidenceRequest, readEvidenceSource, uploadEvidence, type EvidenceUploadProgress } from "@/features/evidence/evidenceClient";
import { ApiRequestError } from "@/shared/api/apiClient";
import { authGateState } from "@/features/auth/authRedirect";
import type { AssignmentResponse } from "@/shared/learning/assignmentAttempt";


export function AssignmentExperiencePage({ session, onLogout }: { session: MockSession | null; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId = "", assignmentId = "" } = useParams();
  const actionRunId = new URLSearchParams(location.search).get("actionRunId") || undefined;
  const runtime = applicationServices.courseRepository.getCourse(courseId);
  const assignment = runtime?.assignments.find((item) => item.id === assignmentId);
  const courseState = useOptionalUserCourseState(session?.userId, courseId);
  const [, setKnowledgeRevision] = useState(0);
  useEffect(() => applicationServices.userKnowledgeRepository.subscribe(() => setKnowledgeRevision(value => value + 1)), []);
  const eligibility = runtime && assignment ? courseAssignmentEligibility(runtime, assignment.id, session ? applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId) : [], courseState) : null;
  const [startConfirmed, setStartConfirmed] = useState(false);
  const [resultLoaded, setResultLoaded] = useState(false);
  const [retryRevision,setRetryRevision]=useState(0);
  const [retry,setRetry]=useState<(()=>void)>();
  const [needsRevision, setNeedsRevision] = useState(false);
  const submissionKey=useRef(crypto.randomUUID());
  const [submitted, setSubmitted] = useState(false); const [accepted, setAccepted] = useState(false); const [busy, setBusy] = useState(false);  const [feedback,setFeedback]=useState<string|null>(null); const [requestError,setRequestError]=useState<string|null>(null);
  const knowledgeById = useMemo(() => new Map(applicationServices.knowledgeRepository.getVisibleGraph(session?userKnowledgeAccess(session.userId):globalKnowledgeAccess).nodes.map((node) => [node.id, node])), [session]);
  const [answer,setAnswer] = useState(""); const [traceStep,setTraceStep] = useState("");
  const [formalAttachmentIds,setFormalAttachmentIds]=useState<string[]>([]);
  const [attachmentIds,setAttachmentIds] = useState<string[]>([]); const [attachmentTitles,setAttachmentTitles] = useState<Record<string,string>>({});
  const [attemptId,setAttemptId] = useState<string>(); const [capabilitySources,setCapabilitySources] = useState<string[]>();
  const context = useMemo(() => ({workspace:"courses" as const,experienceMode:"learn" as const,presentation:"practice",courseId,assignmentId,actionRunId}),[courseId,assignmentId,actionRunId]);
  const chat = useWorkspaceConversation("practice",context,Boolean(session&&assignment));
  const savedAttachments = JSON.stringify(orderedWorkspaceReferences(chat.messages,chat.references).filter(ref=>ref.event==='attachment').map(ref=>ref.referenceId));
  useEffect(()=>{let live=true;const ids=[...new Set(JSON.parse(savedAttachments) as string[])];void Promise.allSettled(ids.map(id=>readEvidenceSource(id))).then(results=>{if(!live)return;const values=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);let unavailable=false;results.forEach((result,index)=>{if(result.status==='rejected'){if(result.reason instanceof ApiRequestError&&result.reason.status===404)chat.discardReference(ids[index]);else unavailable=true;}});const uploads=values.filter(value=>!value.source.archived_at&&value.source.provenance.kind==='practice-attachment'&&value.source.provenance.courseId===courseId&&value.source.provenance.assignmentId===assignmentId&&value.source.provenance.actionRunId===actionRunId);setAttachmentIds(uploads.slice(-4).map(value=>value.source.id));setAttachmentTitles(Object.fromEntries(values.map(value=>[value.source.id,value.source.title])));if(unavailable){setRequestError('部分附件暂时无法读取，已恢复可用附件。请重试恢复。');setRetry(()=>()=>setRetryRevision(value=>value+1));}});return()=>{live=false;};},[savedAttachments,courseId,assignmentId,actionRunId,retryRevision]);

  const experience = assignment?.experience ?? { type: assignment?.mode === "workflow" ? "workflow" : "answer", prompt: assignment?.description };
  const stableAssignmentId = assignment?.id??"";
  const coverages = (runtime?.assignmentCoverages??[]).filter((coverage) => coverage.assignmentId === assignment?.id);
  const dependencies = (runtime?.assignmentDependencies??[]).filter((dependency) => dependency.targetAssignmentId === assignment?.id).flatMap((dependency) => {
    const source = runtime?.assignments.find((item) => item.id === dependency.sourceAssignmentId);
    return source ? [source] : [];
  });
  useEffect(() => {
    if (!session || !stableAssignmentId || (!actionRunId && !eligibility?.canStart)) return;
    let live = true; setStartConfirmed(false); setRequestError(null);
    void applicationServices.learnerStateService.startAssignment(courseId, stableAssignmentId, actionRunId, true)
      .then(async () => { await refreshLearnerState(session.userId); if (live) setStartConfirmed(true); })
      .catch(() => { if (live) setRequestError("无法启动实训，学习条件可能已变化，请返回课程后重试。"); });
    return () => { live = false; };
  }, [courseId, session, stableAssignmentId, eligibility?.canStart, actionRunId,retryRevision]);
  useEffect(()=>{if(!session||!stableAssignmentId)return;let live=true;setResultLoaded(false);setRequestError(null);void applicationServices.learnerStateService.getAssignmentResult(courseId,stableAssignmentId,actionRunId).then(({result})=>{if(!live||!result)return;setSubmitted(true);setNeedsRevision(result.outcome === "failed");setAccepted(result.accepted);setFeedback(result.feedback.message);setAttemptId(result.attemptId);setFormalAttachmentIds(result.response?.attachmentSourceIds??[]);if(result.response?.kind==='answer')setAnswer(result.response.text);if(result.response?.kind==='code'){setAnswer(result.response.code??'');setAttachmentIds(result.response.attachmentSourceIds??[]);}if(result.response?.kind==='trace')setTraceStep(result.response.selectedStepId);}).catch(()=>{if(live)setRequestError("已保存的结果或下一步暂时无法加载，请重试。");}).finally(()=>{if(live)setResultLoaded(true);});return()=>{live=false;};},[courseId,session,stableAssignmentId,actionRunId,retryRevision]);
  useEffect(() => {
    submissionKey.current = crypto.randomUUID();
    setSubmitted(false); setAccepted(false); setNeedsRevision(false); setFeedback(null);setAnswer("");setTraceStep("");setAttachmentIds([]);setFormalAttachmentIds([]);setAttachmentTitles({});setAttemptId(undefined);setCapabilitySources(undefined);
  }, [courseId, stableAssignmentId, actionRunId]);
  const savedDiagnosis = chat.references.some(ref=>['diagnosis','confirmation'].includes(ref.event))||chat.messages.some(message=>message.structuredContent?.type==='workspace_event'&&['diagnosis','confirmation'].includes(message.structuredContent.event));
  useEffect(()=>{if(savedDiagnosis)setCapabilitySources(JSON.parse(savedAttachments) as string[]);},[savedDiagnosis,savedAttachments]);
  if (!runtime || !assignment) return <main className="assignment-page"><GlobalNav active="courses" session={session} onLogout={onLogout} /><section className="atlas-empty-state"><h1>实训不存在</h1><button className="atlas-primary" onClick={() => navigate(`/courses/${courseId}`)}>返回课程</button></section></main>;
  async function submit(response: AssignmentResponse) {
    if (busy || (session && (!startConfirmed || !resultLoaded || (!actionRunId && !eligibility?.canSubmit)))) return; setBusy(true);setRequestError(null);setRetry(()=>()=>void submit(response));
    try {
      if (!session) {
        setSubmitted(true);
        setAccepted(response.kind === "trace" && evaluateTraceSelection(experience, response.selectedStepId));
        return;
      }
      const result = await applicationServices.learnerStateService.submitAssignment(courseId, stableAssignmentId, response,submissionKey.current,actionRunId,true);
      setSubmitted(true);
      setAttemptId(result.attemptId);setFormalAttachmentIds(response.attachmentSourceIds??[]);
      await chat.record("submission",result.attemptId);
      setAccepted(result.accepted);
      setNeedsRevision(result.outcome === "failed");
      setFeedback(result.feedback.message);
      await refreshLearnerState(session.userId).catch(()=>{setRequestError('正式实践结果已保存，能力投影暂未刷新。重试读取即可。');setRetry(()=>()=>setRetryRevision(value=>value+1));});

    }
    catch { setRequestError("提交失败，未确认保存结果。请检查网络后重试。"); }
    finally { setBusy(false); }
  }
  async function attach(file:File,progress:EvidenceUploadProgress={}) {if(attachmentIds.length>=4&&!progress.upload){setRequestError('每次实践最多选择4份附件，请先完成当前提交。');return;}if(!session){setRequestError("登录后才能保存真实文件。");return;}setBusy(true);setRequestError(null);setRetry(()=>()=>void attach(file,progress));try{const id=await uploadEvidence(file,{courseId,assignmentId,actionRunId},progress);setAttachmentIds(current=>[...current,id].slice(-4));setAttachmentTitles(current=>({...current,[id]:file.name}));await chat.record("attachment",id);}catch(error){setRequestError(error instanceof Error?error.message:"上传失败，请重新上传。");}finally{setBusy(false);}}
  async function inspectCapability() {if(!attemptId||!chat.sessionId)return;setBusy(true);setRequestError(null);setRetry(()=>()=>void inspectCapability());try{const result=await evidenceRequest<{sourceIds:string[]}>({action:'assignment-source',attemptId});for(const id of result.sourceIds)await chat.record('attachment',id);setCapabilitySources(result.sourceIds);}catch(error){setRequestError(error instanceof Error?error.message:'证据资料暂未保存，请重试。');}finally{setBusy(false);}}
  const task:ConversationItem={id:'practice-task',role:'assistant',content:<><h2>{assignment.title}</h2><p>{experience.prompt??assignment.description}</p><details><summary>任务背景与要求</summary><p>{assignment.description}</p><ul>{assignment.requirements.map(requirement=><li key={requirement}>{requirement}</li>)}</ul><p>预期输出：{assignment.expectedOutput}</p></details><h3>验收标准</h3><ul>{assignment.acceptanceCriteria.map(criterion=><li key={criterion}>{criterion}</li>)}</ul><small>普通消息用于讨论；下方明确的正式提交才会保存 Assignment Response。</small></>};
  const messages:ConversationItem[]=[task,...chat.messages.map(message=>({id:message.id,role:message.role,content:message.structuredContent?.type==='workspace_event'?<><p>{message.content}</p><small>{message.structuredContent.event==='attachment'?attachmentTitles[message.structuredContent.referenceId]??message.structuredContent.referenceId:`记录 ${message.structuredContent.referenceId}`}</small></>:<><p>{message.content}</p>{message.role==='user'&&!submitted&&experience.type!=='trace'&&experience.type!=='workflow'?<button className="atlas-secondary" onClick={()=>setAnswer(message.content)}>将这条消息作为本次实践成果</button>:null}</>}))];
  if(submitted)messages.push({id:'practice-result',role:'assistant',content:<div className={`assignment-submitted ${accepted?'passed':'not-passed'}`}><h2>{!session?'本次匿名体验已完成':accepted?'本次实训已通过正式验收':'本次提交已记录'}</h2><p>{feedback??'匿名体验只在当前页面保存。'}</p><p>Practice 完成与能力形成是独立状态。正式能力和路线没有自动更新。</p>{formalAttachmentIds.length?<ul>{formalAttachmentIds.map(id=><li key={id}>{attachmentTitles[id]??'本人提交的原始文件'}<button className="atlas-secondary" onClick={()=>void evidenceRequest<{url:string}>({action:'download',sourceId:id}).then(result=>window.open(result.url,'_blank','noopener')).catch(()=>setRequestError('原始文件暂时无法打开，请重试。'))}>查看原文件</button></li>)}</ul>:null}{session&&attemptId?<button className="atlas-primary" disabled={busy||!chat.sessionId} onClick={()=>void inspectCapability()}>检查能力变化</button>:null}<button className="atlas-secondary" onClick={()=>navigate(`/courses/${encodeURIComponent(courseId)}`)}>继续正式路线</button></div>});
  const canSubmit=!busy&&(!session||(startConfirmed&&resultLoaded&&Boolean(chat.sessionId)&&(Boolean(actionRunId)||Boolean(eligibility?.canSubmit))));
  const response:AssignmentResponse=experience.type==='trace'?{kind:'trace',selectedStepId:traceStep,attachmentSourceIds:attachmentIds}:experience.type==='code'?{kind:'code',code:answer.trim()||undefined,attachmentSourceIds:attachmentIds,fileName:attachmentIds.map(id=>attachmentTitles[id]).filter(Boolean).join('、')||undefined}:{kind:'answer',text:answer.trim(),attachmentSourceIds:attachmentIds};
  const ready=experience.type==='trace'?Boolean(traceStep):experience.type==='code'?Boolean(answer.trim()||attachmentIds.length):Boolean(answer.trim());
  if(!submitted&&experience.type!=='workflow')messages.push({id:'formal-submission',role:'assistant',content:<section className="assignment-experience-body"><h3>{experience.type==='trace'?'选择最早失败点':'准备本次正式成果'}</h3>{experience.type==='trace'?<div className="assignment-trace">{experience.traceSteps?.map((step,index)=><button disabled={busy} key={step.id} className={traceStep===step.id?'selected':''} aria-pressed={traceStep===step.id} onClick={()=>setTraceStep(step.id)}><span>{String(index+1).padStart(2,'0')}</span><code>{step.label}</code></button>)}</div>:<><details open={Boolean(answer)}><summary>{answer?"已准备正式成果 · 复核或编辑":"直接编辑正式成果（也可从本人消息选择）"}</summary><label>本次正式提交内容<textarea aria-label="正式实践成果" value={answer} onChange={event=>setAnswer(event.target.value)} placeholder="写下本人完成的过程、计算依据、结论与边界…"/></label></details>{attachmentIds.length?<ul>{attachmentIds.map(id=><li key={id}>{attachmentTitles[id]??id} · 已保存原始文件 <button className="atlas-secondary" onClick={()=>void evidenceRequest<{url:string}>({action:'download',sourceId:id}).then(result=>window.open(result.url,'_blank','noopener')).catch(()=>setRequestError('原始文件暂时无法打开，请重试。'))}>查看原文件</button></li>)}</ul>:null}<p>这里的成果和选定附件将进入正式提交；普通聊天与 Assistant 回复不会自动加入。</p></>}<button className="atlas-primary" disabled={!canSubmit||!ready} onClick={()=>void submit(response)}>{session?'正式提交本次实践':'完成本地体验'}</button></section>});
  if(!submitted&&experience.type==='workflow')messages.push({id:'workflow-launch',role:'assistant',content:<><p>在现有工作流画布完成任务，执行结果仍由 Workflow Runtime 保存。</p><button className="atlas-primary" onClick={()=>session?navigate(workflowLaunchUrl({courseId,assignmentId:assignment.id,workflowTemplateId:assignment.workflowTemplateId!})):navigate('/login',{state:authGateState(location)})}>{session?'进入画布':'登录后进入画布'}</button></>});
  return <main className="assignment-page">
    <GlobalNav active="courses" session={session} onLogout={onLogout} />
    <header className="assignment-page-header glass-v2"><button onClick={() => navigate(`/courses/${courseId}`)}><ArrowLeft size={17} />返回课程</button><div><span>COURSE ASSIGNMENT</span><h1>{assignment.title}</h1><p>{assignment.description}</p></div><aside><span><Clock3 size={14} />{assignment.estimatedMinutes ?? 25} 分钟</span><span><Network size={14} />{coverages.length} 个 Knowledge</span><span><FileCode2 size={14} />{experience.type}</span></aside></header>
    <div className="assignment-page-grid">
      <aside className="assignment-shell-sidebar glass-v2">
        <section><h3>关联 Knowledge</h3>{coverages.map((coverage) => <span key={coverage.id}>◆ {knowledgeById.get(coverage.nodeId)?.title ?? coverage.nodeId}</span>)}</section>
        <section><h3>前置实训</h3>{dependencies.length ? dependencies.map((item) => <span key={item.id}>→ {item.title}</span>) : <span>当前实训无直接前置任务</span>}</section>
        {assignment.inheritedOutputs?.length ? <section><h3>已继承成果</h3>{assignment.inheritedOutputs.map((item) => <span key={item}><Check size={13} />{item}</span>)}{assignment.dependencyRationale ? <p>{assignment.dependencyRationale}</p> : null}</section> : null}
        <section><h3>任务要求</h3>{assignment.requirements.map((item) => <span key={item}>• {item}</span>)}</section>
        <section><h3>预期输出</h3><span>{assignment.expectedOutput}</span></section>
        <section><h3>验收标准</h3>{assignment.acceptanceCriteria.map((item) => <span key={item}>✓ {item}</span>)}</section>
      </aside>
      <article className="assignment-experience-card glass-v2">
        {session&&(!resultLoaded||((Boolean(actionRunId)||eligibility?.canStart)&&!startConfirmed))&&!submitted?<p role="status">正在恢复正式结果并确认实践条件…</p>:null}
        {capabilitySources?<CapabilityConversation courseId={courseId} initialSourceIds={capabilitySources} conversation={chat} prefix={messages.filter(message=>message.id==='practice-task'||message.id==='practice-result')}/>:<ConversationWorkspace mode="practice" messages={messages} loading={chat.loading} sending={busy||chat.sending||chat.loading} error={requestError??chat.error} onRetry={requestError?retry??(()=>setRetryRevision(value=>value+1)):chat.retry} onSend={text=>{setRetry(()=>()=>void chat.send(text));return chat.send(text);}} onAttachment={session&&chat.sessionId?file=>void attach(file):undefined}/>}
        {session&&needsRevision&&!accepted?<button className="atlas-secondary" disabled={busy} onClick={()=>{submissionKey.current=crypto.randomUUID();setSubmitted(false);setCapabilitySources(undefined);setAttachmentIds(formalAttachmentIds);setRequestError(null);}}>继续修改</button>:null}
        {session&&!actionRunId&&eligibility?.reason&&!eligibility.viewOnly?<p role="status">{eligibility.reason}</p>:null}

      </article>
    </div>

  </main>;
}
