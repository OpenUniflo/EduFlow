import { useCallback,useEffect,useRef,useState } from "react";
import frameJs from "h5p-standalone/dist/frame.bundle.js?url";
import frameCss from "h5p-standalone/dist/styles/h5p.css?url";
import type { H5PContentDescriptor,H5PResult } from "./microLearning";

type Dispatcher={on?(name:string,listener:(event:unknown)=>void):void;off?(name:string,listener:(event:unknown)=>void):void};
type H5PWindow=Window&{H5P?:{externalDispatcher?:Dispatcher}};
const record=(value:unknown):Record<string,unknown>|null=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;

function resultFromEvent(event:unknown,expectedObjectIri:string):{id:string;result:H5PResult}|null {
  const source=record(event),data=record(source?.data),statement=record(data?.statement??source?.statement),verb=record(statement?.verb),result=record(statement?.result),score=record(result?.score),object=record(statement?.object);
  const verbId=typeof verb?.id==="string"?verb.id:"";
  if(!/(answered|completed|passed|failed)$/.test(verbId)||(typeof object?.id==="string"&&object.id!==expectedObjectIri))return null;
  const completed=result?.completion===true||/(completed|passed|failed)$/.test(verbId);
  const raw=typeof score?.raw==="number"?score.raw:undefined,max=typeof score?.max==="number"?score.max:undefined;
  const success=typeof result?.success==="boolean"?result.success:/passed$/.test(verbId)?true:/failed$/.test(verbId)?false:raw!==undefined&&max!==undefined&&max>0?raw>=max:undefined;
  const fingerprint=typeof statement?.id==="string"?statement.id:`${verbId}:${JSON.stringify(result??{})}`;let hash=2166136261;for(let index=0;index<fingerprint.length;index++){hash^=fingerprint.charCodeAt(index);hash=Math.imul(hash,16777619);}const id=`h5p:${(hash>>>0).toString(16)}`;
  return {id,result:{completed,success,score:raw,maxScore:max}};
}

export function H5PInteraction({descriptor,onResult}:{descriptor:H5PContentDescriptor;onResult(eventId:string,result:H5PResult):void}) {
  const host=useRef<HTMLDivElement>(null); const emitted=useRef(new Set<string>()); const onResultRef=useRef(onResult); const [attempt,setAttempt]=useState(0); const [state,setState]=useState<"loading"|"ready"|"error">("loading");
  useEffect(()=>{onResultRef.current=onResult;},[onResult]);
  const load=useCallback(()=>setAttempt((value)=>value+1),[]);
  useEffect(()=>{
    let disposed=false; let dispatcher:Dispatcher|undefined; const target=host.current; if(!target)return;
    target.replaceChildren(); setState("loading");
    const objectIri=`urn:eduflow:h5p:${descriptor.id}`;const listener=(event:unknown)=>{const mapped=resultFromEvent(event,objectIri);if(!mapped||emitted.current.has(mapped.id))return;emitted.current.add(mapped.id);onResultRef.current(mapped.id,mapped.result);};
    const timeout=window.setTimeout(()=>{if(!disposed)setState("error");},15000);
    void import("h5p-standalone").then(async(module)=>{
      if(disposed)return;
      const candidate=module as unknown as {H5P?:new(element:HTMLElement,options:Record<string,unknown>)=>Promise<unknown>;default?:{H5P?:new(element:HTMLElement,options:Record<string,unknown>)=>Promise<unknown>}};
      const Player=candidate.H5P??candidate.default?.H5P; if(!Player)throw new Error("H5P adapter unavailable");
      await new Player(target,{h5pJsonPath:descriptor.contentUrl,frameJs,frameCss,frame:false,reportingIsEnabled:true,xAPIObjectIRI:objectIri});
      if(disposed)return; dispatcher=(window as H5PWindow).H5P?.externalDispatcher; dispatcher?.on?.("xAPI",listener); window.clearTimeout(timeout); setState("ready");
    }).catch(()=>{window.clearTimeout(timeout);if(!disposed)setState("error");});
    return()=>{disposed=true;window.clearTimeout(timeout);dispatcher?.off?.("xAPI",listener);target.replaceChildren();};
  },[attempt,descriptor]);
  return <div className="micro-h5p-shell" aria-busy={state==="loading"}>
    {state==="loading"?<p role="status">正在加载互动内容…</p>:null}
    {state==="error"?<div className="micro-feedback retry" role="alert"><strong>该互动内容暂时无法加载</strong><span>内容、运行适配器或资源可能不可用。进度不会自动跳过。</span><button type="button" onClick={load}>重试</button></div>:null}
    <div ref={host} className="micro-h5p-host" hidden={state==="error"}/>
  </div>;
}
