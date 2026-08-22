import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import type { AssistantContext } from "@/features/assistant/assistantContext";
import type { CourseDesignAssistantContext, CourseDesignAssistantProvider, CourseDesignAssistantResponse } from "@/features/course/courseDesignAssistant";
import { describeCourseAuthoringOperation } from "@/features/course/authoring/courseAuthoringProposal";

export function CourseDesignAssistant({ context, shellContext, designEnabled, provider, drawerOpen, onAction, onApplyProposal }: {
  context:CourseDesignAssistantContext;
  shellContext:AssistantContext;
  designEnabled:boolean;
  provider?:CourseDesignAssistantProvider;
  drawerOpen:boolean;
  onAction?(actionId:string):CourseDesignAssistantResponse|null|Promise<CourseDesignAssistantResponse|null>;
  onApplyProposal?(response:CourseDesignAssistantResponse):void;
}) {
  const actions=designEnabled?(provider?.getActions(context)??[]):[];
  const [input,setInput]=useState(""); const [response,setResponse]=useState<CourseDesignAssistantResponse|null>(null); const [pendingAction,setPendingAction]=useState<string|null>(null);
  useEffect(()=>setResponse(null),[context.key,designEnabled]);
  async function runAction(actionId:string){if(!designEnabled||!provider)return;setPendingAction(actionId);const handled=await onAction?.(actionId);setResponse(handled??provider.resolveAction(context,actionId));setPendingAction(null);}
  function send(){if(!input.trim())return;if(designEnabled&&provider)setResponse(provider.resolveText(context,input));else setResponse({message:`“${context.label}” 当前处于 Learn Mode。可以解释前置、课程位置与后续关系，但不会执行课程修改。`});}
  return <EduFlowAssistant context={shellContext} contextLabel={context.label} drawerOpen={drawerOpen}>
    <div className="course-design-assistant-actions">{designEnabled?actions.map((action)=><button key={action.id} disabled={Boolean(pendingAction)} onClick={()=>void runAction(action.id)}>{pendingAction===action.id?"处理中…":action.label}</button>):<><button onClick={()=>setResponse({message:"该位置由课程教学顺序决定，Knowledge prerequisite 只约束是否可达。"})}>为什么先学这个？</button><button onClick={()=>setResponse({message:"可从 Knowledge 详情中的“快速学习”进入对应 MicroLesson；没有 Golden Lesson 时会诚实提示不可用。"})}>如何快速学习？</button></>}</div>
    {response?<div className={`course-design-assistant-response ${response.fallback?"fallback":""}`} role="status"><span>{response.message}</span>{response.proposal&&designEnabled?<div className="course-design-proposal-preview"><strong>{response.proposal.title}</strong>{response.proposal.operations.map((operation,index)=><small key={`${operation.type}:${index}`}>{describeCourseAuthoringOperation(operation)}</small>)}<div><button onClick={()=>setResponse(null)}>取消</button><button onClick={()=>onApplyProposal?.(response)}>验证并应用</button></div></div>:null}</div>:null}
    <div className="course-design-assistant-input"><input value={input} onChange={(event)=>setInput(event.target.value)} onKeyDown={(event)=>event.key==="Enter"&&send()} placeholder={designEnabled?"询问课程结构、依赖、课件或实训…":"询问当前知识为什么在这里…"}/><button onClick={send} aria-label="发送给 EduFlow Assistant"><Send size={15}/></button></div>
  </EduFlowAssistant>;
}
