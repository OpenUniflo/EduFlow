import { ArrowRight, Clock3, History, Network, Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import type { MockSession } from "@/features/auth/types";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { createMicroLearningNavigation } from "@/features/learning/micro/microLearning";
import { buildTodayQueue } from "@/features/learning/recommendation/todayQueue";
import { PersonalKnowledgeView } from "@/features/profile/pages/ProfileKnowledgePage";

type LearningView="today"|"knowledge"|"history";
const viewLabels:Record<LearningView,string>={today:"今天",knowledge:"我的知识",history:"记录"};

export function LearningPage({session,onLogout}:{session:MockSession;onLogout():void}){
  const navigate=useNavigate(); const [searchParams,setSearchParams]=useSearchParams();
  const requested=searchParams.get("view"); const active:LearningView=requested==="knowledge"||requested==="history"?requested:"today";
  const [revision,setRevision]=useState(0);
  useEffect(()=>applicationServices.learningProgressRepository.subscribe(()=>setRevision((value)=>value+1)),[]);
  useEffect(()=>applicationServices.userKnowledgeRepository.subscribe(()=>setRevision((value)=>value+1)),[]);
  useEffect(()=>applicationServices.microLearningRepository.subscribe(()=>setRevision((value)=>value+1)),[]);
  const runtimes=useMemo(()=>applicationServices.courseRepository.listCourseRuntimes(),[revision]);
  const graph=useMemo(()=>applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId)),[revision,session.userId]);
  const records=useMemo(()=>applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId),[revision,session.userId]);
  const states=useMemo(()=>runtimes.map((runtime)=>applicationServices.learningProgressRepository.getCourseState(session.userId,runtime.course.id)),[revision,runtimes,session.userId]);
  const queue=useMemo(()=>buildTodayQueue({runtimes,graph,userKnowledge:records,courseStates:states,limit:3}),[graph,records,runtimes,states]);
  const activities=useMemo(()=>records.flatMap((record)=>record.evidence??[]).sort((a,b)=>(b.createdAt??"").localeCompare(a.createdAt??"")),[records]);
  const nodeById=useMemo(()=>new Map(graph.nodes.map((node)=>[node.id,node])),[graph.nodes]);
  const current=queue[0];
  const currentMicroPath=current?applicationServices.microLearningRepository.getPath(current.knowledgeId,{courseId:current.courseId,mode:"learn"}):null;
  const assistantContext={workspace:"learning" as const,experienceMode:"learn" as const,userRole:session.role,capabilities:session.capabilities,courseId:current?.courseId,knowledgeId:current?.knowledgeId};
  function launchMicroLearning(){if(!current||!currentMicroPath)return;const target=createMicroLearningNavigation(current.knowledgeId,{courseId:current.courseId,returnTo:"/"});navigate(target.to,{state:target.state});}
  function changeView(view:LearningView){const next=new URLSearchParams(searchParams);if(view==="today")next.delete("view");else next.set("view",view);setSearchParams(next,{replace:true});}
  const viewTabs=<nav className="learning-view-tabs" aria-label="学习空间视图">{(Object.keys(viewLabels) as LearningView[]).map((view)=><button className={active===view?"active":""} key={view} onClick={()=>changeView(view)}>{viewLabels[view]}</button>)}</nav>;
  return <main className={`learning-space-page ${active}-view`}><GlobalNav active="learning" session={session} onLogout={onLogout}/>
    {active==="knowledge"?<section className="learning-knowledge"><header><span className="atlas-kicker">LEARNING SPACE</span><h1>我的知识</h1>{viewTabs}</header><PersonalKnowledgeView embedded session={session} onLogout={onLogout}/></section> : active==="history"?<section className="learning-history"><header><span className="atlas-kicker">LEARNING RECORD</span><h1>真实发生过的学习</h1><p>学习证据来自已完成的 Micro Path 与已验收的实训。</p>{viewTabs}</header><div className="learning-record-list">{activities.length?activities.map((activity)=><article className="glass-v2" key={activity.id}><History size={18}/><span><strong>{nodeById.get(activity.nodeId)?.title??activity.nodeId}</strong><small>{activity.label} · {activity.createdAt?new Date(activity.createdAt).toLocaleString("zh-CN"):"已记录"}</small></span></article>):<article className="glass-v2 learning-empty"><History size={22}/><strong>还没有学习证据</strong><p>完成已发布的 MicroLearningPath 或取得实训验收后会在这里出现。</p></article>}</div></section>:
    <section className="learning-today"><header><span className="atlas-kicker">LEARNING SPACE</span><h1>现在继续学什么</h1><p>课程决定方向，Knowledge prerequisite 决定是否可达，你的学习状态决定这一刻如何继续。</p>{viewTabs}</header>{current?<><article className="learning-focus"><div className="learning-focus-copy"><span className="learning-reason">{current.reason==="continue"?"继续学习":"下一项可学习"}</span><h2>{current.knowledgeTitle}</h2><p>{current.courseTitle} · 第 {current.lessonOrder} 课</p><div><span><Clock3 size={14}/>{current.estimatedMinutes} 分钟</span><span><Network size={14}/>真实 prerequisite 已满足</span></div><button className="atlas-primary" disabled={!currentMicroPath} onClick={launchMicroLearning}><Play size={16}/>{currentMicroPath?"开始快速学习":"该节点暂无 Quick Learn"}</button></div><div className="learning-local-path">{queue.map((item,index)=><button key={`${item.courseId}:${item.knowledgeId}`} onClick={()=>navigate(`/courses/${item.courseId}`)}><i>{index+1}</i><span><strong>{item.knowledgeTitle}</strong><small>{item.reason==="continue"?"Continue":"Learn"} · {item.estimatedMinutes} min</small></span><ArrowRight size={14}/></button>)}</div></article><section className="learning-next"><div><span className="atlas-kicker">LOCAL KNOWLEDGE PATH</span><h2>接下来 1–3 项</h2></div><span>顺序来自 Curriculum + DAG + User State</span></section></>:<article className="learning-focus learning-empty"><Sparkles size={28}/><h2>当前没有可继续的课程节点</h2><p>可以去探索说明学习目标，或进入课程选择新的教学路径。</p><button className="atlas-primary" onClick={()=>navigate("/explore")}>去探索<ArrowRight size={15}/></button></article>}</section>}
    {active!=="knowledge"?<EduFlowAssistant context={assistantContext} contextLabel={current?.knowledgeTitle??"Learning Space"}><div className="course-design-assistant-actions"><button>为什么推荐这个？</button><button>解释前置知识</button><button disabled={!currentMicroPath} onClick={launchMicroLearning}>{currentMicroPath?"快速学习":"暂无微学习内容"}</button></div><p className="assistant-plain-response">推荐仅使用现有 Curriculum、Knowledge DAG、Micro 进度与个人学习状态。</p></EduFlowAssistant>:null}
  </main>;
}
