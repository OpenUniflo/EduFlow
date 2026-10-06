import { isNodeScope, sameActionScope } from '@/shared/learning/routeExecution';
import { Check, Circle, Play } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';
import type { CourseExecutionModel } from './routeExecutionProjection';
import './coursePath.css';
// Restored from the pre-DAG CoursePathView. Geometry belongs only to Step order.
const pathX=(index:number)=>50+Math.round(18*Math.sin(index*Math.PI/2));
export function CoursePathView({model,targetOutcome,onInspectCapabilities,onSelect,onExecute,busy=false}: {
  model:CourseExecutionModel;targetOutcome?:string;onInspectCapabilities?(nodeId?:string):void;
  onSelect(nodeId:string,edgeId?:string,actionId?:string):void;onExecute(index:number):void;busy?:boolean;
}) {
  const reduced=useReducedMotion();
  return <section className="navigator-path course-execution-path" aria-label="学习路线">
    <header className="navigator-path-heading"><span className="atlas-kicker">当前个人路线{model.version?` · V${model.version.versionNumber}`:''}</span><h2>沿正式路线推进项目目标</h2><p>{targetOutcome??'选择当前可执行行动，同一关系内依序推进。'}</p><p>已完成 {model.steps.filter(step=>step.completed).length} / {model.steps.length} 步。行动完成与能力状态分别记录。</p>
      {onInspectCapabilities?<button className="navigator-locate" onClick={()=>onInspectCapabilities()}>调整路线 →</button>:null}
      {model.recommendedStepIndex>=0?<button className="navigator-locate" onClick={()=>document.querySelector('.course-execution-path .navigator-stop.recommended')?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'})}>定位推荐行动 ↓</button>:null}
    </header>
    {model.needsAdjustment?<p role="status">{model.issue||'正式路线需要调整，请前往项目能力模型。'}</p>:null}
    {!model.steps.length && !model.needsAdjustment?<p role="status">当前路线没有待执行步骤。</p>:null}
    <ol className="navigator-track" aria-label="正式路线执行步骤">{model.steps.map((step,index)=>{
      const x=pathX(index),nextX=pathX(index+1);
      const label=step.state==='completed'?'已完成':step.state==='in_progress'?'执行中':step.state==='satisfied'?'能力已满足 · 可选执行':step.state==='available'?'可执行':'等待条件';
      const recommended=index===model.recommendedStepIndex;
      return <motion.li initial={false} className={`navigator-stop ${step.state}${recommended?' recommended current':''}`} key={`${step.edgeId}:${step.actionId}:${step.order}`} data-step-edge={step.edgeId} data-step-action={step.actionId} style={{'--path-x':`${x}%`} as CSSProperties}>
        {index<model.steps.length-1?<svg className="navigator-connector" data-reading-order="true" viewBox="0 0 100 220" preserveAspectRatio="none" aria-hidden="true"><path d={`M ${x} 36 C ${x} 145, ${nextX} 145, ${nextX} 256`} vectorEffect="non-scaling-stroke"/></svg>:null}
        <button className="navigator-node" aria-current={recommended?'step':undefined} aria-label={`${step.title}，${label}，查看详情`} onClick={()=>onSelect(isNodeScope(step)?step.nodeId:step.sourceNodeId,step.edgeId,step.actionId)}><span>{step.completed?<Check size={25}/>:step.canExecute?<Play size={24}/>:<Circle size={21}/>}</span></button>
        <div className="navigator-node-copy"><small>{label}{recommended?' · 推荐下一步':''} · Step {index+1} · 范围内行动 {model.steps.slice(0,index+1).filter(item=>sameActionScope(item,step)).length}/{model.steps.filter(item=>sameActionScope(item,step)).length}</small><strong>{step.title}</strong><em>{step.action?`${step.action.type==='micro_learning'?'微学习':'实践任务'} · 约 ${step.action.estimated_minutes} 分钟`:'行动已不可用，需要调整路线'}</em>{!step.canExecute && !step.completed?<em>{step.reason}</em>:null}
          {step.canExecute && !step.completed || step.state==='in_progress'?<button className="atlas-primary" disabled={busy || model.needsAdjustment || step.unavailable || !step.canExecute} onClick={()=>onExecute(index)}>{step.run?.status==='in_progress'?'继续':step.satisfied?'可选执行':'开始'}</button>:null}
        </div>
      </motion.li>;
    })}</ol>
    {model.steps.length>0 && model.progressionSatisfied?<p className="navigator-finish">✓ 路线目标已满足{!model.actionsCompleted?' · 仍有可选补做行动':''} · 能力状态依据正式证据</p>:null}
  </section>;
}
