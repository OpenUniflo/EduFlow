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
    <header className="navigator-path-heading"><span className="atlas-kicker">当前个人路线{model.version?` · V${model.version.versionNumber}`:''}</span><h2>一步一步，走向项目目标</h2><p>{targetOutcome??'按已采用的行动顺序继续。'}</p><p>已完成 {model.steps.filter(step=>step.completed).length} / {model.steps.length} 步。行动完成与能力状态分别记录。</p>
      {onInspectCapabilities?<button className="navigator-locate" onClick={()=>onInspectCapabilities()}>调整路线 →</button>:null}
      {model.currentIndex>=0?<button className="navigator-locate" onClick={()=>document.querySelector('.course-execution-path .navigator-stop.current')?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'})}>定位当前步骤 ↓</button>:null}
    </header>
    {model.needsAdjustment?<p role="status">{model.issue||'正式路线需要调整，请前往项目能力模型。'}</p>:null}
    {!model.steps.length && !model.needsAdjustment?<p role="status">当前路线没有待执行步骤。</p>:null}
    <ol className="navigator-track" aria-label="正式路线执行步骤">{model.steps.map((step,index)=>{
      const x=pathX(index),nextX=pathX(index+1);
      const label=step.state==='completed'?'已完成':step.state==='current'?'当前步骤':index===model.currentIndex+1?'下一步':'后续';
      return <motion.li initial={false} className={`navigator-stop ${step.state}`} key={`${step.edgeId}:${step.actionId}:${step.order}`} data-step-edge={step.edgeId} data-step-action={step.actionId} style={{'--path-x':`${x}%`} as CSSProperties}>
        {index<model.steps.length-1?<svg className="navigator-connector" data-execution-order="true" viewBox="0 0 100 220" preserveAspectRatio="none" aria-hidden="true"><path d={`M ${x} 36 C ${x} 145, ${nextX} 145, ${nextX} 256`} vectorEffect="non-scaling-stroke"/></svg>:null}
        <button className="navigator-node" aria-current={step.state==='current'?'step':undefined} aria-label={`${step.title}，${label}，查看详情`} onClick={()=>onSelect(step.sourceNodeId,step.edgeId,step.actionId)}><span>{step.completed?<Check size={25}/>:step.state==='current'?<Play size={24}/>:<Circle size={21}/>}</span></button>
        <div className="navigator-node-copy"><small>{label} · Step {index+1} · 关系内行动 {model.steps.slice(0,index+1).filter(item=>item.edgeId===step.edgeId).length}/{model.steps.filter(item=>item.edgeId===step.edgeId).length}</small><strong>{step.title}</strong><em>{step.action?`${step.action.type==='micro_learning'?'微学习':'实践任务'} · 约 ${step.action.estimated_minutes} 分钟`:'行动已不可用，需要调整路线'}</em>
          {step.state==='current'?<button className="atlas-primary" disabled={busy || model.needsAdjustment || step.unavailable || !step.canExecute} onClick={()=>onExecute(index)}>{step.run?.status==='in_progress'?'继续':'开始'}</button>:null}
        </div>
      </motion.li>;
    })}</ol>
    {model.steps.length>0 && model.currentIndex<0?<p className="navigator-finish">✓ 路线行动已完成 · 能力状态仍依据正式证据</p>:null}
  </section>;
}
