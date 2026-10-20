import { useEffect, useRef } from "react";
import type { WorkflowDefinitionV2, WorkflowEventV2, WorkflowStepV2 } from "../../domain/v2/types";
import { streamTextForStep } from "./streamingPresentation";
function Text({text}:{text:string}) {
 const element=useRef<HTMLDivElement>(null),follow=useRef(true);
 useEffect(()=>{if(element.current&&follow.current)element.current.scrollTop=element.current.scrollHeight;},[text]);
 return <div className="wf-readable-output" ref={element} onScroll={()=>{const e=element.current;if(e)follow.current=e.scrollHeight-e.scrollTop-e.clientHeight<24;}}>{text}</div>;
}
export function ModelStreamFeed({definition,events,steps}:{definition:WorkflowDefinitionV2;events:WorkflowEventV2[];steps:WorkflowStepV2[]}) {
 const ids=Array.from(new Set(events.filter(e=>e.type==="node.output.delta"&&e.stepId).map(e=>e.stepId!))).slice(-20);
 const progress=events.filter(e=>e.type==="node.progress").slice(-10);
 if(!ids.length&&!progress.length&&!events.some(e=>e.type==="stream.gap"))return null;
 return <section aria-label="跨节点实时输出"><h3>实时输出</h3><p>生成中的片段是暂态，正式结果以提交完成的节点为准。重试会显示新尝试的片段。</p>{events.some(e=>e.type==="stream.gap")?<p role="status">部分过程因限额未保留，请查看节点最终结果。</p>:null}{progress.map(e=>{const p=e.payload;return <p key={e.eventId}>{e.nodeId}：{p&&typeof p==="object"&&!Array.isArray(p)&&typeof p.message==="string"?p.message:"读取已校验，准备处理"}{p&&typeof p==="object"&&!Array.isArray(p)&&typeof p.percent==="number"?`（自报${p.percent}%）`:""}</p>;})}{ids.map(id=>{const step=steps.find(s=>s.stepId===id);const path=step?.graphPath??[];let graph=definition;for(const p of path){const child=graph.nodes.find(n=>n.id===p)?.config.graph;if(child&&typeof child==="object")graph=child as unknown as WorkflowDefinitionV2;}const label=graph.nodes.find(n=>n.id===step?.nodeId)?.label??step?.nodeId??"模型输出";return <article className="wf-connection-card" key={id}><strong>{[...path,label].join(" / ")} · {step?.status==="completed"?"已提交":step?.status==="cancelled"||step?.error?.code==="RUN_CANCELLED"?"已取消 · 片段未提交":step?.status==="failed"?"本次处理失败":"暂态输出"}</strong><Text text={streamTextForStep(events,id)}/></article>;})}</section>;
}
