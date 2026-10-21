import {expect,it} from "vitest";
import {briefValue,latestNodeSteps,presentRunSteps,processingDescription,stepWrites,summaryFields} from "./executionPresentation";
import type {WorkflowEventV2,WorkflowNodeV2,WorkflowStepV2} from "../../domain/v2/types";
const step=(invocation:number,attempt=1)=>({runId:"run-a",stepId:`step-${invocation}-${attempt}`,nodeId:"model",invocation,attempt,status:"completed"} as WorkflowStepV2);
it("selects latest invocation and retry without collapsing unrelated records",()=>{const records=[step(3),step(1),step(2),step(3,2)];expect(latestNodeSteps(records).get("model")?.stepId).toBe("step-3-2");expect(records).toHaveLength(4);});
it("uses the authoritative after value for reducers instead of calling an append patch final state",()=>{const record=step(1);const events=[{protocolVersion:"1",eventId:"event",runId:"run-a",seq:1,occurredAt:"2026-10-17T00:00:00Z",stepId:record.stepId,type:"state.updated",payload:{patch:{items:[2]},changes:[{field:"items",before:[1],after:[1,2]}]}} as WorkflowEventV2];expect(stepWrites(record,events)).toEqual({items:[1,2]});expect(stepWrites(step(2),events)).toBeUndefined();});
it("keeps false, zero and null in compact summaries",()=>{expect(summaryFields({enabled:false,count:0})).toContain("false");expect(summaryFields({enabled:false,count:0})).toContain("0");expect(summaryFields(null)).toBe("null");});
it("prefers message body, tool identity and review conclusions over structural JSON",()=>{
  const messages={messages:[{role:"user",content:"订单 A1001 何时发货？"},{role:"assistant",content:[{type:"text",text:"预计明天发出。"}]}]};
  expect(summaryFields(messages)).toContain("预计明天发出");
  expect(summaryFields(messages)).not.toContain('"role"');
  expect(summaryFields([{dimension:"成本",conclusion:"可控"},{dimension:"风险",conclusion:"低"}])).toContain("成本：可控");
  const tool=summaryFields({tool:"order_lookup",arguments:{orderId:"A1001"},result:{status:"shipped"}});
  expect(tool).toContain("order_lookup");
  expect(tool).toContain("A1001");
  expect(tool).toContain("shipped");
  expect(briefValue({role:"user",content:"hello"})).toBe("用户：hello");
});
it("describes function and subgraph processing without falling back to a generic sentence",()=>{
  const fn={id:"fn",label:"函数",type:"core.function",typeVersion:1,config:{functionRef:"prepare"},inputs:{},writes:{}} as WorkflowNodeV2;
  const subgraph={id:"sub",label:"子图",type:"core.subgraph",typeVersion:1,config:{graph:{name:"评审子图"}},inputs:{},writes:{}} as WorkflowNodeV2;
  expect(processingDescription(fn)).toContain("prepare");
  expect(processingDescription(subgraph)).toContain("评审子图");
});
it("presents unfinished steps consistently with terminal Run state without mutating API rows",()=>{
  const running={...step(1),status:"running"};const completed=step(2);
  const records=presentRunSteps({status:"cancelled",finishedAt:"2026-10-18T00:00:00Z"},[running,completed]);
  expect(records[0].status).toBe("cancelled");expect(records[0].error?.code).toBe("RUN_CANCELLED");
  expect(records[1]).toBe(completed);expect(running.status).toBe("running");
  expect(presentRunSteps({status:"failed"},[running])[0].status).toBe("interrupted");
  const stopped={...step(3),status:'failed',error:{code:'RUN_CANCELLED',message:'Cancellation requested'}};
  expect(presentRunSteps({status:'cancelled'},[stopped])[0].status).toBe('cancelled');
  expect(presentRunSteps({status:'cancelled'},[{...stopped,error:{code:'CODE_EXECUTION_FAILED',message:'Earlier failure'}}])[0].status).toBe('failed');
});

it("joins superstep State by checkpoint and exposes only the selected frozen node fields",()=>{
 const record=step(4);const node={id:'model',writes:{items:'/value'},config:{authoring:{interrupt:{title:'Confirm',schema:{type:'object'},resumeWrites:{confirmed:'confirmed'}}}}} as unknown as import('../../domain/v2/types').WorkflowNodeV2;
 const base={protocolVersion:'1' as const,occurredAt:'2026-10-18T00:00:00Z'};
 const events:WorkflowEventV2[]=[
  {...base,eventId:'merged',seq:1,runId:'run-a',type:'state.updated',payload:{checkpointId:'cp',patch:{items:[1,2],confirmed:false,other:99},changes:[{field:'items',before:[1],after:[1,2]},{field:'confirmed',before:true,after:false},{field:'other',before:0,after:99}]}},
  {...base,eventId:'completed',seq:2,runId:'run-a',stepId:record.stepId,type:'step.completed',payload:{checkpointId:'cp'}}
 ];
 expect(stepWrites(record,events,node)).toEqual({items:[1,2],confirmed:false});
 expect(stepWrites({...record,stepId:'someone-else'},events,node)).toBeUndefined();
 expect(stepWrites({...record,runId:'another-run'},events,node)).toBeUndefined();
});
