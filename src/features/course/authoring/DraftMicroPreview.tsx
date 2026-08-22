import { lazy,Suspense,useEffect,useMemo,useState } from "react";
import { apiRequest } from "@/shared/api/apiClient";
import { isMicroInteractionCorrect,type H5PContentDescriptor,type H5PResult,type MicroInteraction,type MicroLearningAnswer,type MicroLearningPath } from "@/features/learning/micro/microLearning";

const H5PPlayer=lazy(()=>import("@/features/learning/micro/H5PInteraction").then((module)=>({default:module.H5PInteraction})));

export function DraftMicroPreview({paths,knowledgeId}:{paths:MicroLearningPath[];knowledgeId:string}) {
  const path=paths.find((item)=>item.knowledgeId===knowledgeId&&item.mode==="learn"); const steps=useMemo(()=>path?.units.slice().sort((left,right)=>left.position-right.position).flatMap((unit)=>unit.steps)??[],[path]);
  const [index,setIndex]=useState(0),[answer,setAnswer]=useState<MicroLearningAnswer>(""),[feedback,setFeedback]=useState<string|null>(null); if(!path)return null;const step=steps[index];
  if(!step)return <section className="atlas-drawer-section"><h3>草稿 Micro Preview</h3><p>路径没有 Step，无法运行；发布检查会阻止该结构。</p></section>;
  const check=()=>{const correct=!step.interaction||isMicroInteractionCorrect(step.interaction,answer);setFeedback(correct?step.successFeedback??"正确。":step.retryFeedback??"请重试。");}; const interaction=step.interaction;
  const next=()=>{setAnswer("");setFeedback(null);if(index<steps.length-1)setIndex(index+1);};
  return <section className="atlas-drawer-section"><h3>草稿 Micro Preview</h3><p>{path.title} · {index+1}/{steps.length}</p><strong>{step.title}</strong><p>{step.body}</p><PreviewInteraction interaction={interaction} answer={answer} onAnswer={(value)=>{setAnswer(value);setFeedback(null);}} onH5P={(result)=>setFeedback(result.completed&&(interaction?.type!=="h5p"||interaction.completionPolicy==="completed"||result.success===true)?step.successFeedback??"H5P 已通过。":step.retryFeedback??"H5P 尚未满足完成条件。")} />
    <div className="course-authoring-inline-actions">{interaction?.type!=="h5p"?<button disabled={Boolean(interaction)&&!(Array.isArray(answer)?answer.length:answer)} onClick={check}>{interaction?"检查":"继续"}</button>:null}{feedback&&(feedback===step.successFeedback||feedback==="正确。"||feedback==="H5P 已通过。")&&index<steps.length-1?<button onClick={next}>下一步</button>:null}{index>0?<button onClick={()=>{setIndex(index-1);setFeedback(null);}}>上一步</button>:null}</div>{feedback?<p role="status">{feedback}</p>:null}</section>;
}

function PreviewInteraction({interaction,answer,onAnswer,onH5P}:{interaction?:MicroInteraction;answer:MicroLearningAnswer;onAnswer(value:MicroLearningAnswer):void;onH5P(result:H5PResult):void}) {
  if(!interaction)return null;
  if(interaction.type==="choice")return <div className="course-authoring-inline-actions">{interaction.options.map((option)=><button key={option} className={answer===option?"active":""} onClick={()=>onAnswer(option)}>{option}</button>)}</div>;
  if(interaction.type==="multiple-choice") {const selected=Array.isArray(answer)&&answer.every((item)=>typeof item==="number")?answer as number[]:[];return <div className="course-authoring-inline-actions">{interaction.options.map((option,index)=><button key={option} className={selected.includes(index)?"active":""} onClick={()=>onAnswer(selected.includes(index)?selected.filter((value)=>value!==index):[...selected,index])}>{option}</button>)}</div>;}
  if(interaction.type==="fill-blank")return <input value={typeof answer==="string"?answer:""} onChange={(event)=>onAnswer(event.target.value)} placeholder="填写答案"/>;
  if(interaction.type==="trace")return <div className="course-authoring-inline-actions">{interaction.steps.map((item)=><button key={item.id} className={answer===item.id?"active":""} onClick={()=>onAnswer(item.id)}>{item.label}</button>)}</div>;
  if(interaction.type==="ordering"||interaction.type==="mini-workflow") {const items=interaction.type==="ordering"?interaction.items:interaction.nodes;const selected=Array.isArray(answer)&&answer.every((item)=>typeof item==="string")?answer as string[]:[];return <div className="course-authoring-inline-actions">{items.map((item)=><button key={item} onClick={()=>onAnswer(selected.includes(item)?selected.filter((value)=>value!==item):[...selected,item])}>{selected.indexOf(item)+1||"·"} {item}</button>)}</div>;}
  return <AuthoringH5P contentRef={interaction.contentRef} onResult={onH5P}/>;
}

function AuthoringH5P({contentRef,onResult}:{contentRef:string;onResult(result:H5PResult):void}) {
  const [descriptor,setDescriptor]=useState<H5PContentDescriptor|null>(null),[error,setError]=useState(false);
  useEffect(()=>{let live=true;void apiRequest<H5PContentDescriptor>("/api/micro",{method:"POST",body:JSON.stringify({action:"resolve-h5p-content",contentRef})}).then((value)=>{if(live)setDescriptor(value);}).catch(()=>{if(live)setError(true);});return()=>{live=false;};},[contentRef]);
  if(error)return <p role="alert">该 H5P contentRef 不可用；发布也会被阻止。</p>;if(!descriptor)return <p>正在加载 H5P Preview…</p>;
  return <Suspense fallback={<p>正在载入 H5P Runtime…</p>}><H5PPlayer descriptor={descriptor} onResult={(_,result)=>onResult(result)}/></Suspense>;
}
