export type NativeAnswer = string|string[]|number[]|undefined;
export type H5PCompletion = { kind:"h5p-result"; contentRef:string; eventId:string; result:{ completed:boolean; success?:boolean; score?:number; maxScore?:number } };

const record = (value:unknown):Record<string,unknown>|null => value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
const strings = (value:unknown) => Array.isArray(value)&&value.every((item)=>typeof item==="string")?value as string[]:null;
const numbers = (value:unknown) => Array.isArray(value)&&value.every((item)=>typeof item==="number"&&Number.isInteger(item))?value as number[]:null;

export function nativeInteractionCorrect(interaction:unknown,answer:NativeAnswer) {
  const item=record(interaction); if(!item)return true;
  if(item.type==="choice") { const options=strings(item.options); return Boolean(options)&&typeof item.correctIndex==="number"&&answer===options?.[item.correctIndex]; }
  if(item.type==="multiple-choice") { const selected=numbers(answer); const expected=numbers(item.correctIndexes); if(!selected||!expected)return false; const left=[...new Set(selected)].sort((a,b)=>a-b); const right=[...new Set(expected)].sort((a,b)=>a-b); return left.length===right.length&&left.every((value,index)=>value===right[index]); }
  if(item.type==="fill-blank") { const accepted=strings(item.answers); if(!accepted||typeof answer!=="string")return false; const normalize=(value:string)=>item.caseSensitive===true?value.trim():value.trim().toLocaleLowerCase(); return accepted.some((candidate)=>normalize(candidate)===normalize(answer)); }
  if(item.type==="trace")return typeof answer==="string"&&answer===item.correctStepId;
  if(item.type==="ordering"||item.type==="mini-workflow") { const expected=strings(item.correctOrder); return Boolean(expected)&&Array.isArray(answer)&&answer.every((value)=>typeof value==="string")&&answer.join("|")===expected?.join("|"); }
  return false;
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
