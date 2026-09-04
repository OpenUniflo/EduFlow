import { ArrowRight, Minus, Pause, Play, Plus, RefreshCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import type { MockSession } from "@/features/auth/types";
import { KnowledgeAtlasScene, type KnowledgeAtlasSceneHandle } from "@/features/knowledge/components/KnowledgeAtlasScene";
import { useDomainGovernance } from "@/features/knowledge/domain/domainStore";
import { buildGlobalAtlasProjection } from "@/features/knowledge/projections/atlasProjections";
import { globalKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { createMicroLearningNavigation } from "@/features/learning/micro/microLearning";
import { buildMaterialDeepLink } from "@/features/material/materialNavigation";
import { KnowledgeContextSelector } from "@/features/learning/components/KnowledgeContextSelector";
import { KnowledgeResourceActions } from "@/features/learning/components/KnowledgeResourceActions";
import { defaultKnowledgeContextId, projectKnowledgeLearningResources, resolveKnowledgeLearningContext, type KnowledgeAssignmentResource, type KnowledgeMaterialResource } from "@/features/learning/resources/knowledgeLearningResources";

export function ExplorePage({session,onLogout}:{session:MockSession|null;onLogout():void}){
  const navigate=useNavigate(); const sceneRef=useRef<KnowledgeAtlasSceneHandle>(null); const governance=useDomainGovernance();
  const [revision,setRevision]=useState(0);
  useEffect(()=>applicationServices.userKnowledgeRepository.subscribe(()=>setRevision((value)=>value+1)),[]);
  useEffect(()=>applicationServices.learningProgressRepository.subscribe(()=>setRevision((value)=>value+1)),[]);
  useEffect(()=>applicationServices.microLearningRepository.subscribe(()=>setRevision((value)=>value+1)),[]);
  const runtimes=useMemo(()=>applicationServices.courseRepository.listCourseRuntimes().filter((runtime)=>runtime.course.lifecycle==="published"),[revision]);
  const courseStates=useMemo(()=>session?runtimes.map((runtime)=>applicationServices.learningProgressRepository.getCourseState(session.userId,runtime.course.id)):[],[revision,runtimes,session]);
  const atlas=useMemo(()=>buildGlobalAtlasProjection(applicationServices.knowledgeRepository.getVisibleGraph(globalKnowledgeAccess),governance,runtimes),[governance,runtimes]);
  const [selectedId,setSelectedId]=useState<string|null>(null); const [contextByKnowledge,setContextByKnowledge]=useState<Record<string,string>>({}); const [searchMatchId,setSearchMatchId]=useState<string|null>(null); const [query,setQuery]=useState(""); const [paused,setPaused]=useState(false);
  const selected=selectedId?(()=>{const node=atlas.nodes.find((candidate)=>candidate.id===selectedId);return node?{...node,scope:node.knowledge?.scope??"global"}:null;})():null;
  const selectedRecord=selectedId&&session?applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId).find((record)=>record.nodeId===selectedId):undefined;
  const selectedResources=useMemo(()=>selectedId?projectKnowledgeLearningResources({knowledgeId:selectedId,runtimes,courseStates,microRepository:applicationServices.microLearningRepository}):null,[courseStates,runtimes,selectedId,revision]);
  const selectedContextId=selectedResources&&selectedId?(contextByKnowledge[selectedId]??defaultKnowledgeContextId(selectedResources)):"standalone";
  const selectedContext=selectedResources?resolveKnowledgeLearningContext(selectedResources,selectedContextId):null;
  const assistantContext=session?{workspace:"explore" as const,experienceMode:"learn" as const,userRole:session.role,capabilities:session.capabilities,courseId:selectedContext?.kind==="course"?selectedContext.courseId:undefined,knowledgeId:selectedId??undefined}:undefined;
  function locate(){const needle=query.trim().toLowerCase();const match=atlas.nodes.find((node)=>node.title.toLowerCase().includes(needle));if(!match)return;setSelectedId(match.id);setSearchMatchId(match.id);}
  async function openMicro(){if(!selected||!selectedContext?.micro.path)return;const courseId=selectedContext.kind==="course"?selectedContext.courseId:undefined;const target=createMicroLearningNavigation(selected.id,{courseId,returnTo:"/explore"});navigate(target.to,{state:target.state});}
  async function openMaterial(material:KnowledgeMaterialResource){if(!selected)return;if(session){await applicationServices.learnerStateService.startMaterial(material.courseId,material.materialId,selected.id);await refreshLearnerState(session.userId);}navigate(buildMaterialDeepLink({courseId:material.courseId,materialId:material.materialId,segmentId:material.segmentId}));}
  async function openAssignment(assignment:KnowledgeAssignmentResource){if(session){await applicationServices.learnerStateService.startAssignment(assignment.courseId,assignment.assignmentId);await refreshLearnerState(session.userId);}navigate(`/courses/${assignment.courseId}/assignments/${assignment.assignmentId}`);}
  return <main className="explore-page"><GlobalNav active="explore" session={session} onLogout={onLogout}/>
    <KnowledgeAtlasScene ref={sceneRef} className="atlas-star-canvas" variant="global" nodes={atlas.nodes} edges={atlas.edges} selectedId={selectedId} searchMatchId={searchMatchId} autoRotate={!paused&&!selectedId} onNodeClick={(node)=>setSelectedId(node.id)} onBackgroundClick={()=>setSelectedId(null)}/><div className="atlas-home-veil" aria-hidden="true"/>
    <header className="explore-heading"><span className="atlas-kicker">GLOBAL KNOWLEDGE ATLAS</span><h1>探索知识世界</h1><p>先定位已知 Knowledge；不知道从哪里开始时，再告诉 Assistant 你想学什么。</p><label className="explore-search glass-v2"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} onKeyDown={(event)=>event.key==="Enter"&&locate()} placeholder="搜索知识节点……" aria-label="搜索知识节点"/><button onClick={locate}>定位</button></label></header>
    {selected&&selectedResources&&selectedContext?<aside className="atlas-node-panel explore-knowledge-panel glass-v2"><button className="atlas-panel-close" onClick={()=>setSelectedId(null)} aria-label="关闭简介"><X size={17}/></button><div className="atlas-pill"><i style={{background:selected.color}}/>{selected.domainTitle} · {selected.scope}</div><h2>{selected.title}</h2>{session?<span className={`explore-knowledge-status ${selectedRecord?.status??"explore"}`}>学习状态 · {selectedRecord?.status==="learning"?"学习中":selectedRecord?.status==="learned"?"已学习":selectedRecord?.status==="practicing"?"实训中":selectedRecord?.status==="mastered"?"已掌握":"可探索"}</span>:<span className="explore-knowledge-status explore">公开学习内容 · 匿名浏览</span>}<p>{selected.description}</p><KnowledgeContextSelector resources={selectedResources} value={selectedContextId} onChange={(value)=>setContextByKnowledge((current)=>({...current,[selected.id]:value}))}/><KnowledgeResourceActions context={selectedContext} onMicro={()=>void openMicro()} onMaterial={(resource)=>void openMaterial(resource)} onAssignment={(resource)=>void openAssignment(resource)}/>{selectedContext.kind==="course"?<section className="atlas-node-dependencies"><h3>课程位置</h3><div><button onClick={()=>navigate(`/courses/${selectedContext.courseId}`)}><ArrowRight size={12}/>{selectedContext.courseTitle}{selectedContext.chapterTitle?` · ${selectedContext.chapterTitle}`:""}{selectedContext.lessonTitle?` · ${selectedContext.lessonTitle}`:""}</button></div></section>:null}{!selectedContext.micro.available&&!selectedContext.materials.length&&!selectedContext.assignments.length?<p className="assistant-empty">当前没有可执行的学习活动。仅查看此内容不会改变学习状态。</p>:null}</aside>:null}
    <div className="atlas-home-hint glass-v2">拖动旋转 · 滚轮缩放 · 单击 Knowledge 查看详情</div><div className="atlas-home-controls"><button onClick={()=>sceneRef.current?.zoomBy(.9)}><Minus size={17}/></button><button onClick={()=>sceneRef.current?.zoomBy(1.1)}><Plus size={17}/></button><button onClick={()=>setPaused((value)=>!value)}>{paused?<Play size={17}/>:<Pause size={17}/>}</button><button onClick={()=>{setSelectedId(null);setSearchMatchId(null);sceneRef.current?.reset();}}><RefreshCcw size={17}/></button></div>
    <EduFlowAssistant context={assistantContext} locked={!session} contextLabel={selected?.title??"Global Knowledge Atlas"} className="explore-assistant"/>
  </main>;
}
