import { useEffect,useMemo,useState } from "react";
import { Background,Controls,MarkerType,ReactFlow,type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const positions=(order:string[]):Node[]=>order.map((label,index)=>({id:label,position:{x:24+index*150,y:index%2?112:42},data:{label},draggable:true,selectable:true,style:{width:120,border:"1px solid #cdd5e4",borderRadius:12,background:"#fff",fontSize:11,fontWeight:700}}));

export default function MiniWorkflowInteraction({items,value,disabled,onChange,onReset}:{items:string[];value:string[];disabled:boolean;onChange(value:string[]):void;onReset():void}) {
  const order=value.length===items.length?value:items; const [nodes,setNodes]=useState<Node[]>(()=>positions(order));
  useEffect(()=>setNodes(positions(order)),[order.join("|")]);
  const edges=useMemo(()=>order.slice(0,-1).map((source,index)=>({id:`${source}-${order[index+1]}`,source,target:order[index+1],markerEnd:{type:MarkerType.ArrowClosed},style:{stroke:"#8b97aa"}})),[order]);
  const move=(index:number,delta:number)=>{const target=index+delta;if(disabled||target<0||target>=order.length)return;const next=[...order];[next[index],next[target]]=[next[target],next[index]];onChange(next);};
  return <div className="micro-mini-workflow">
    <div className="micro-workflow-canvas" aria-label="可拖动 Mini Workflow 画布">
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={(changes)=>setNodes((current)=>changes.reduce((all,change)=>change.type==="position"?all.map((node)=>node.id===change.id?{...node,position:change.position??node.position}:node):all,current))} onNodeDragStop={(_,dragged)=>{if(disabled)return;const next=nodes.map((node)=>node.id===dragged.id?dragged:node).sort((a,b)=>a.position.x-b.position.x).map((node)=>node.id);onChange(next);}} nodesDraggable={!disabled} nodesConnectable={false} fitView proOptions={{hideAttribution:true}}><Background gap={18} size={1}/><Controls showInteractive={false}/></ReactFlow>
    </div>
    <ol className="micro-workflow-accessible" aria-label="Workflow 连接顺序">{order.map((item,index)=><li key={item}><span>{index+1}</span><strong>{item}</strong><button type="button" disabled={disabled||index===0} onClick={()=>move(index,-1)} aria-label={`${item} 前移`}>←</button><button type="button" disabled={disabled||index===order.length-1} onClick={()=>move(index,1)} aria-label={`${item} 后移`}>→</button></li>)}</ol>
    <button type="button" className="atlas-secondary" disabled={disabled} onClick={onReset}>重置</button>
  </div>;
}
