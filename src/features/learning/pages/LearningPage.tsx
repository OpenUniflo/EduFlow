import { ArrowRight, BookOpen, Clock3, History, Network, Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import type { MockSession } from "@/features/auth/types";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { readMicroLearningActivities, type MicroLearningProvider } from "@/features/learning/micro/microLearning";
import { listPersonalLearningPlans } from "@/features/learning/plans/personalLearningPlan";
import { buildTodayQueue } from "@/features/learning/recommendation/todayQueue";
import { PersonalKnowledgeView } from "@/features/profile/pages/ProfileKnowledgePage";

type LearningView="today"|"knowledge"|"history";
const viewLabels:Record<LearningView,string>={today:"今天",knowledge:"我的知识",history:"记录"};

export function LearningPage({session,onLogout,microLearningProvider}:{session:MockSession;onLogout():void;microLearningProvider:MicroLearningProvider}){
  const navigate=useNavigate(); const [searchParams,setSearchParams]=useSearchParams();
  const requested=searchParams.get("view"); const active:LearningView=requested==="knowledge"||requested==="history"?requested:"today";
  const [revision,setRevision]=useState(0);
  useEffect(()=>applicationServices.learningProgressRepository.subscribe(()=>setRevision((value)=>value+1)),[]);
  useEffect(()=>{const update=()=>setRevision((value)=>value+1);window.addEventListener("eduflow:micro-learning-activity",update);window.addEventListener("eduflow:personal-learning-plan",update);return()=>{window.removeEventListener("eduflow:micro-learning-activity",update);window.removeEventListener("eduflow:personal-learning-plan",update);};},[]);
  const runtimes=useMemo(()=>applicationServices.courseRepository.listCourseRuntimes(),[revision]);
  const graph=useMemo(()=>applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId)),[revision,session.userId]);
  const records=useMemo(()=>applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId),[revision,session.userId]);
  const states=useMemo(()=>runtimes.map((runtime)=>applicationServices.learningProgressRepository.getCourseState(session.userId,runtime.course.id)),[revision,runtimes,session.userId]);
  const queue=useMemo(()=>buildTodayQueue({runtimes,graph,userKnowledge:records,courseStates:states,limit:3}),[graph,records,runtimes,states]);
  const activities=useMemo(()=>readMicroLearningActivities(session.userId).sort((a,b)=>b.completedAt.localeCompare(a.completedAt)),[revision,session.userId]);
  const plans=useMemo(()=>listPersonalLearningPlans(session.userId),[revision,session.userId]);
  const nodeById=useMemo(()=>new Map(graph.nodes.map((node)=>[node.id,node])),[graph.nodes]);
  const current=queue[0];
  const assistantContext={workspace:"learning" as const,experienceMode:"learn" as const,userRole:session.role,capabilities:session.capabilities,courseId:current?.courseId,knowledgeId:current?.knowledgeId};
  function changeView(view:LearningView){const next=new URLSearchParams(searchParams);if(view==="today")next.delete("view");else next.set("view",view);setSearchParams(next,{replace:true});}
  return <main className={`learning-space-page ${active}-view`}><GlobalNav active="learning" session={session} onLogout={onLogout}/>
    <nav className="learning-view-tabs glass-v2" aria-label="学习空间视图">{(Object.keys(viewLabels) as LearningView[]).map((view)=><button className={active===view?"active":""} key={view} onClick={()=>changeView(view)}>{viewLabels[view]}</button>)}</nav>
    {active==="knowledge"?<PersonalKnowledgeView embedded session={session} onLogout={onLogout}/> : active==="history"?<section className="learning-history"><header><span className="atlas-kicker">LEARNING RECORD</span><h1>真实发生过的学习</h1><p>微学习活动、材料阅读和实训进度保持各自语义。</p></header><div className="learning-record-list">{activities.length?activities.map((activity)=><article className="glass-v2" key={activity.lessonId}><History size={18}/><span><strong>{nodeById.get(activity.knowledgeId)?.title??activity.knowledgeId}</strong><small>微学习完成 · {new Date(activity.completedAt).toLocaleString("zh-CN")}</small></span></article>):<article className="glass-v2 learning-empty"><History size={22}/><strong>还没有微学习记录</strong><p>完成 Golden MicroLesson 后会在这里出现，不会自动记为 mastery。</p></article>}</div></section>:
    <section className="learning-today"><header><span className="atlas-kicker">LEARNING SPACE</span><h1>现在继续学什么</h1><p>课程决定方向，Knowledge prerequisite 决定是否可达，你的学习状态决定这一刻如何继续。</p></header>{current?<><article className="learning-focus glass-v2"><div className="learning-focus-copy"><span className="learning-reason">{current.reason==="continue"?"继续学习":"下一项可学习"}</span><h2>{current.knowledgeTitle}</h2><p>{current.courseTitle} · 第 {current.lessonOrder} 课</p><div><span><Clock3 size={14}/>{current.estimatedMinutes} 分钟</span><span><Network size={14}/>真实 prerequisite 已满足</span></div><button className="atlas-primary" disabled={!microLearningProvider.getLesson(current.knowledgeId,{courseId:current.courseId})} onClick={()=>navigate(`/learn/micro/${current.knowledgeId}?courseId=${encodeURIComponent(current.courseId)}`)}><Play size={16}/>{microLearningProvider.getLesson(current.knowledgeId,{courseId:current.courseId})?"开始快速学习":"该节点暂无 Golden MicroLesson"}</button></div><div className="learning-local-path">{queue.map((item,index)=><button key={`${item.courseId}:${item.knowledgeId}`} onClick={()=>navigate(`/courses/${item.courseId}`)}><i>{index+1}</i><span><strong>{item.knowledgeTitle}</strong><small>{item.reason==="continue"?"Continue":"Learn"} · {item.estimatedMinutes} min</small></span><ArrowRight size={14}/></button>)}</div></article><section className="learning-next"><div><span className="atlas-kicker">LOCAL KNOWLEDGE PATH</span><h2>接下来 1–3 项</h2></div><span>顺序来自 Curriculum + DAG + User State</span></section></>:<article className="learning-focus glass-v2 learning-empty"><Sparkles size={28}/><h2>当前没有可继续的课程节点</h2><p>可以去探索说明学习目标，或进入课程选择新的教学路径。</p><button className="atlas-primary" onClick={()=>navigate("/explore")}>去探索<ArrowRight size={15}/></button></article>}
    {plans.length?<section className="learning-plan-strip"><div><span className="atlas-kicker">PERSONAL PATHS</span><h2>已加入我的学习</h2></div>{plans.map((plan)=><article className="glass-v2" key={plan.id}><BookOpen size={17}/><span><strong>{plan.goal}</strong><small>{plan.knowledgeIds.length} 个现有 Knowledge · Personal projection</small></span></article>)}</section>:null}</section>}
    {active!=="knowledge"?<EduFlowAssistant context={assistantContext} contextLabel={current?.knowledgeTitle??"Learning Space"}><div className="course-design-assistant-actions"><button>为什么推荐这个？</button><button>解释前置知识</button><button onClick={()=>current&&navigate(`/learn/micro/${current.knowledgeId}?courseId=${encodeURIComponent(current.courseId)}`)}>快速学习</button></div><p className="assistant-plain-response">推荐仅使用现有 Curriculum、Knowledge DAG 与个人学习状态。</p></EduFlowAssistant>:null}
  </main>;
}
