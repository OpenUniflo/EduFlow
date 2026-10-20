import type { WorkflowEventV2 } from "../../domain/v2/types";
/** A delta remains transient; each retry owns a separate stream. */
export function streamTextForStep(events: WorkflowEventV2[], stepId: string): string {
 const seen=new Set<string>();let active="legacy",text="";
 for(const event of [...events].sort((a,b)=>a.seq-b.seq)) {
  if(event.stepId!==stepId||seen.has(event.eventId))continue;seen.add(event.eventId);
  const p=event.payload;
  if(!p||typeof p!=="object"||Array.isArray(p))continue;
  if(event.type==="node.attempt.started"){text="";active="legacy";continue;}
  if(!["node.output.delta","node.output.end"].includes(event.type))continue;
  const stream=typeof p.streamId==="string"?p.streamId:"legacy";
  if(stream!==active){active=stream;text="";}
  if(event.type==="node.output.delta"&&typeof p.text==="string")text+=p.text;
  if(event.type==="node.output.end"&&p.status==="computed"&&typeof p.text==="string")text=p.text;
 }
 return text;
}
