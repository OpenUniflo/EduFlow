import { isNativeMicroInteractionCorrect, type NativeMicroInteraction } from "../../src/shared/learning/nativeMicroInteraction.js";

export type NativeAnswer = string|string[]|number[]|undefined;
export type H5PCompletion = { kind:"h5p-result"; contentRef:string; eventId:string; result:{ completed:boolean; success?:boolean; score?:number; maxScore?:number } };

const record = (value:unknown):Record<string,unknown>|null => value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
export function nativeInteractionCorrect(interaction:unknown,answer:NativeAnswer) {
  const item=record(interaction); if(!item)return true;
  return isNativeMicroInteractionCorrect(item as NativeMicroInteraction, answer);
}

export function parseH5PCompletion(value:unknown):H5PCompletion|null {
  const item=record(value), result=record(item?.result);
  if(item?.kind!=="h5p-result"||typeof item.contentRef!=="string"||!item.contentRef.trim()||typeof item.eventId!=="string"||!/^[-A-Za-z0-9_:]{1,160}$/.test(item.eventId)||typeof result?.completed!=="boolean")return null;
  if(result.success!==undefined&&typeof result.success!=="boolean")return null;
  for(const field of ["score","maxScore"] as const)if(result[field]!==undefined&&(typeof result[field]!=="number"||!Number.isFinite(result[field])||result[field]<0))return null;
  if(typeof result.score==="number"&&typeof result.maxScore==="number"&&result.score>result.maxScore)return null;
  return {kind:"h5p-result",contentRef:item.contentRef,eventId:item.eventId,result:{completed:result.completed,success:result.success as boolean|undefined,score:result.score as number|undefined,maxScore:result.maxScore as number|undefined}};
}

export function h5pCompletionPasses(completion:H5PCompletion,policy:"completed"|"passed") {
  return completion.result.completed&&(policy==="completed"||completion.result.success===true);
}
