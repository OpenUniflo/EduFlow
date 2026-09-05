import { NativeInteraction, initialAnswer } from "@/features/learning/micro/NativeInteraction";
import { lazy,Suspense,useEffect,useMemo,useState } from "react";
import { apiRequest } from "@/shared/api/apiClient";
import { isMicroInteractionCorrect,type H5PContentDescriptor,type H5PResult,type MicroInteraction,type MicroLearningAnswer,type MicroLearningPath } from "@/features/learning/micro/microLearning";

const H5PPlayer=lazy(()=>import("@/features/learning/micro/H5PInteraction").then((module)=>({default:module.H5PInteraction})));

export function DraftMicroPreview({paths,knowledgeId}:{paths:MicroLearningPath[];knowledgeId:string}) {
  const path=paths.find((item)=>item.knowledgeId===knowledgeId&&item.mode==="learn"); const steps=useMemo(()=>path?.units.slice().sort((left,right)=>left.position-right.position).flatMap((unit)=>unit.steps)??[],[path]);
  const [index,setIndex]=useState(0),[answer,setAnswer]=useState<MicroLearningAnswer>(""),[feedback,setFeedback]=useState<string|null>(null),[correct,setCorrect]=useState(false); useEffect(()=>{setIndex(0);},[path?.id]); useEffect(()=>{setAnswer(initialAnswer(steps[index]?.interaction));setFeedback(null);setCorrect(false);},[path?.id,index,steps]); if(!path)return null;const step=steps[index];
  if(!step)return <section className="atlas-drawer-section"><h3>草稿 Micro Preview</h3><p>路径没有 Step，无法运行；发布检查会阻止该结构。</p></section>;
  const check=()=>{const correct=!step.interaction||isMicroInteractionCorrect(step.interaction,answer);setCorrect(correct);setFeedback(correct?step.successFeedback??"正确。":step.retryFeedback??"请重试。");}; const interaction=step.interaction;
  const next=()=>{setAnswer("");setFeedback(null);if(index<steps.length-1)setIndex(index+1);};
  return <section className="atlas-drawer-section"><h3>草稿 Micro Preview</h3><p>{path.title} · {index+1}/{steps.length}</p><strong>{step.title}</strong><p>{step.body}</p><PreviewInteraction key={`${path.id}:${step.id}:${JSON.stringify(step.interaction)}`} interaction={interaction} answer={answer} onAnswer={(value)=>{setAnswer(value);setFeedback(null);setCorrect(false);}} onH5P={(result)=>{setCorrect(result.completed&&(interaction?.type!=="h5p"||interaction.completionPolicy==="completed"||result.success===true));setFeedback(result.completed&&(interaction?.type!=="h5p"||interaction.completionPolicy==="completed"||result.success===true)?step.successFeedback??"H5P 已通过。":step.retryFeedback??"H5P 尚未满足完成条件。");}} />
    <div className="course-authoring-inline-actions">{interaction?.type!=="h5p"?<button disabled={Boolean(interaction)&&!(Array.isArray(answer)?answer.length:answer)} onClick={check}>{interaction?"检查":"继续"}</button>:null}{correct&&index<steps.length-1?<button onClick={next}>下一步</button>:null}{index>0?<button onClick={()=>{setIndex(index-1);setFeedback(null);}}>上一步</button>:null}</div>{feedback?<p role="status">{feedback}</p>:null}</section>;
}

function PreviewInteraction({interaction,answer,onAnswer,onH5P}:{interaction?:MicroInteraction;answer:MicroLearningAnswer;onAnswer(value:MicroLearningAnswer):void;onH5P(result:H5PResult):void}) {
  if(!interaction)return null;
  if(interaction.type!=="h5p")return <NativeInteraction step={{id:"preview",kind:"interaction",title:"",body:"",interaction}} answer={answer} completed={false} onAnswer={onAnswer}/>;
  if(interaction.type==="h5p")return <AuthoringH5P contentRef={interaction.contentRef} onResult={onH5P}/>;
  return null;
}

function AuthoringH5P({contentRef,onResult}:{contentRef:string;onResult(result:H5PResult):void}) {
  const [descriptor,setDescriptor]=useState<H5PContentDescriptor|null>(null),[error,setError]=useState(false);
  useEffect(()=>{let live=true;void apiRequest<H5PContentDescriptor>("/api/micro",{method:"POST",body:JSON.stringify({action:"resolve-h5p-content",contentRef})}).then((value)=>{if(live)setDescriptor(value);}).catch(()=>{if(live)setError(true);});return()=>{live=false;};},[contentRef]);
  if(error)return <p role="alert">该 H5P contentRef 不可用；发布也会被阻止。</p>;if(!descriptor)return <p>正在加载 H5P Preview…</p>;
  return <Suspense fallback={<p>正在载入 H5P Runtime…</p>}><H5PPlayer descriptor={descriptor} onResult={(_,result)=>onResult(result)}/></Suspense>;
}
