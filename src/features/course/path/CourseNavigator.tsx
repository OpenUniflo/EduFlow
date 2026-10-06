import { ActionRunHistory } from '@/features/actions/ActionRunHistory';
import { routeExecutionProjection } from './routeExecutionProjection';
import type { useEdgeActions } from '@/features/actions/EdgeActionPanel';
import { satisfiesTeachingPrerequisite } from '@/shared/learning/teachingPrerequisites';
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Clock3 } from 'lucide-react';
import type { UserKnowledgeRecord } from '@/features/profile/types';
import type { CourseGraphData, CourseRuntimeData } from '../runtime/courseRuntime';
import { useRoutePlanning } from '../capability/useRoutePlanning';
import { CoursePathView } from './CoursePathView';

export function CourseNavigator({ graph, runtime, knowledge, authenticated, onSelect, onSignIn, onInspectCapabilities, actionControl, routeControl, knowledgeTitle }: {
  knowledgeTitle?(id: string): string | undefined;
  actionControl: ReturnType<typeof useEdgeActions>; routeControl: ReturnType<typeof useRoutePlanning>;
  graph: CourseGraphData; runtime: CourseRuntimeData; knowledge: UserKnowledgeRecord[]; authenticated: boolean;
  onSelect(id: string, edgeId?: string, actionId?:string): void;
  onSignIn(): void; onInspectCapabilities?(nodeId?: string): void;
}) {
  const reduced = useReducedMotion();
  const acquiredIds=knowledge.filter(record=>satisfiesTeachingPrerequisite(record.status)).map(record=>record.nodeId);
  const execution=routeExecutionProjection(runtime.course.id,routeControl.view,actionControl,acquiredIds);
  const recommendedIndex=execution.recommendedStepIndex;
  const recommended=execution.steps[recommendedIndex];
  const [switchRunId,setSwitchRunId]=useState<string|null>(null);
  const [switchStepIndex,setSwitchStepIndex]=useState<number>(-1);
  const switchConfirmation=useRef<HTMLElement>(null);
  const switchTrigger=useRef<HTMLElement|null>(null);
  useEffect(()=>{if(switchRunId){switchConfirmation.current?.focus();switchConfirmation.current?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'});}else switchTrigger.current?.focus();},[switchRunId,reduced]);
  const launch=async (index:number,confirmedRunId?:string)=>{
    const step=execution.steps[index];
    if(!step || execution.needsAdjustment || step.unavailable || !step.canExecute || actionControl.busy)return;
    if(step.run && actionControl.continuableRunIds?.includes(step.run.id)) { await actionControl.start(step.run,execution.version?.id);return; }
    const conflicting=actionControl.runs.find(run=>run.edge_id===step.edgeId && ['selected','in_progress'].includes(run.status));
    if(conflicting && !confirmedRunId){switchTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setSwitchStepIndex(index);setSwitchRunId(conflicting.id);return;}
    const run=await actionControl.select(step.actionId,confirmedRunId,undefined,execution.version?.id);
    if(run){setSwitchRunId(null);await actionControl.start(run,execution.version?.id);}
  };
  return <div className="course-navigator"><div className="navigator-columns">
    <aside className="navigator-queue" aria-label="课程行动队列">
      <motion.section className="navigator-next" key={recommended?.actionId??'empty'} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .2 }} aria-label="正式路线推荐" aria-live="polite">
        <span className="atlas-kicker">推荐下一步 · 可任选当前可执行行动</span>
        {!authenticated ? <><h2>登录后继续你的路线</h2><p>为你保留学习进度与行动历史。</p><button className="atlas-primary" onClick={onSignIn}>登录开始学习 <ArrowRight size={16} /></button></> : actionControl.loading || routeControl.busy ? <p role="status">正在读取路线与行动…</p> : execution.needsAdjustment || recommended?.unavailable ? <><h2>当前正式路线需要调整</h2><p>{execution.issue || '当前正式路线中的行动已不可用，需要调整路线。'}</p>{onInspectCapabilities?<button className="atlas-secondary" onClick={()=>onInspectCapabilities()}>调整路线</button>:null}</> : recommended ? <><h2>{recommended.title}</h2><p>{recommended.run?.status==='in_progress'?'继续正式路线中已选定的行动。':recommended.canExecute?'行动已选定，可以开始。':recommended.reason||'需要先形成起点能力或完成前置实训。'}</p><small><Clock3 size={12}/> {recommended.action?.estimated_minutes} 分钟</small><button className="atlas-primary" disabled={actionControl.busy || !recommended.canExecute} onClick={()=>void launch(recommendedIndex)}>{recommended.run?.status==='in_progress'?'继续此行动':'开始推荐行动'} <ArrowRight size={16}/></button></> : <><h2>{execution.progressionSatisfied?'路线目标已满足':execution.steps.length?'当前暂没有可执行行动':'当前没有待执行步骤'}</h2><p>{execution.progressionSatisfied && !execution.actionsCompleted ? '仍有可选补做行动，可在路线中选择。' : '执行历史继续保留；能力状态依据正式证据判断。'}</p>{onInspectCapabilities?<button className="atlas-secondary" onClick={()=>onInspectCapabilities()}>调整路线</button>:null}</>}
        {switchRunId?<section ref={switchConfirmation} tabIndex={-1} role="alertdialog" aria-label="确认切换行动"><h3>切换正在执行的行动？</h3><p>确认后停止这条关系上原有行动，历史记录会保留。</p><button className="atlas-secondary" disabled={actionControl.busy} onClick={()=>setSwitchRunId(null)}>保留当前行动</button><button className="atlas-primary" disabled={actionControl.busy} onClick={()=>void launch(switchStepIndex,switchRunId)}>确认切换并开始</button></section>:null}
        {actionControl.error ? <p role="alert">{actionControl.error}</p> : null}
      </motion.section>
      <ActionRunHistory runs={actionControl.runs} control={actionControl} courseId={runtime.course.id} acquiredIds={new Set(knowledge.filter(record => satisfiesTeachingPrerequisite(record.status)).map(record => record.nodeId))} title={id => knowledgeTitle?.(id) ?? graph.knowledgeNodes.find(node => node.id === id)?.title ?? routeControl.view?.activeVersion?.snapshot.titles[id] ?? id} visibleEdgeIds={new Set(execution.steps.map(step => step.edgeId))}/>
    </aside>
    {authenticated && (!routeControl.view || routeControl.view.activeVersion?.courseId !== runtime.course.id) ? <p role={routeControl.error ? "alert" : "status"}>{routeControl.error || "正在加载正式个人路线…"}</p> : <CoursePathView model={execution} busy={actionControl.busy} onExecute={index=>void launch(index)} targetOutcome={runtime.course.targetOutcome} onInspectCapabilities={onInspectCapabilities} onSelect={onSelect} />}
    </div>

  </div>;
}
