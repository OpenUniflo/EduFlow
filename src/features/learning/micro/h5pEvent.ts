import type { H5PResult } from "./microLearning";
const record=(value:unknown):Record<string,unknown>|null=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;

export function resultFromEvent(event:unknown,expectedObjectIri:string):{id:string;result:H5PResult}|null {
  const source=record(event),data=record(source?.data),statement=record(data?.statement??source?.statement),verb=record(statement?.verb),result=record(statement?.result),score=record(result?.score),object=record(statement?.object);
  const verbId=typeof verb?.id==="string"?verb.id:"";
  if(!/(answered|completed|passed|failed)$/.test(verbId)||object?.id!==expectedObjectIri)return null;
  const completed=result?.completion===true||/(completed|passed|failed)$/.test(verbId);
  const raw=typeof score?.raw==="number"?score.raw:undefined,max=typeof score?.max==="number"?score.max:undefined;
  const success=typeof result?.success==="boolean"?result.success:/passed$/.test(verbId)?true:/failed$/.test(verbId)?false:raw!==undefined&&max!==undefined&&max>0?raw>=max:undefined;
  const fingerprint=typeof statement?.id==="string"?statement.id:`${verbId}:${JSON.stringify(result??{})}`;let hash=2166136261;for(let index=0;index<fingerprint.length;index++){hash^=fingerprint.charCodeAt(index);hash=Math.imul(hash,16777619);}const id=`h5p:${(hash>>>0).toString(16)}`;
  return {id,result:{completed,success,score:raw,maxScore:max}};
}
