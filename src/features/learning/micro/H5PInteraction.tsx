import { resultFromEvent } from "./h5pEvent";
import { useCallback,useEffect,useRef,useState } from "react";
import frameJs from "h5p-standalone/dist/frame.bundle.js?url";
import frameCss from "h5p-standalone/dist/styles/h5p.css?url";
import type { H5PContentDescriptor,H5PResult } from "./microLearning";

type Dispatcher={on?(name:string,listener:(event:unknown)=>void):void;off?(name:string,listener:(event:unknown)=>void):void};
type H5PWindow=Window&{H5P?:{externalDispatcher?:Dispatcher}};

export function H5PInteraction({descriptor,onResult}:{descriptor:H5PContentDescriptor;onResult(eventId:string,result:H5PResult):void}) {
  const host=useRef<HTMLDivElement>(null); const onResultRef=useRef(onResult); const [lastEvent,setLastEvent]=useState<{id:string;result:H5PResult}|null>(null); const [attempt,setAttempt]=useState(0); const [state,setState]=useState<"loading"|"ready"|"error">("loading");
  useEffect(()=>{onResultRef.current=onResult;},[onResult]);
  const load=useCallback(()=>setAttempt((value)=>value+1),[]);
  useEffect(()=>{
    let disposed=false; let dispatcher:Dispatcher|undefined; const target=host.current; if(!target)return;
    target.replaceChildren(); const mount=document.createElement("div");target.append(mount); const emitted=new Set<string>();setLastEvent(null); setState("loading");
    const objectIri=`urn:eduflow:h5p:${descriptor.id}`;const listener=(event:unknown)=>{const mapped=resultFromEvent(event,objectIri);if(!mapped||emitted.has(mapped.id))return;emitted.add(mapped.id);setLastEvent(mapped);onResultRef.current(mapped.id,mapped.result);};
    const timeout=window.setTimeout(()=>{if(!disposed)setState("error");},15000);
    void import("h5p-standalone").then(async(module)=>{
      if(disposed)return;
      const candidate=module as unknown as {H5P?:new(element:HTMLElement,options:Record<string,unknown>)=>Promise<unknown>;default?:{H5P?:new(element:HTMLElement,options:Record<string,unknown>)=>Promise<unknown>}};
      const Player=candidate.H5P??candidate.default?.H5P; if(!Player)throw new Error("H5P adapter unavailable");
      await new Player(mount,{h5pJsonPath:descriptor.contentUrl,frameJs,frameCss,frame:false,reportingIsEnabled:true,xAPIObjectIRI:objectIri});
      if(disposed)return; dispatcher=(window as H5PWindow).H5P?.externalDispatcher; dispatcher?.on?.("xAPI",listener); window.clearTimeout(timeout); setState("ready");
    }).catch(()=>{window.clearTimeout(timeout);if(!disposed)setState("error");});
    return()=>{disposed=true;window.clearTimeout(timeout);dispatcher?.off?.("xAPI",listener);mount.remove();};
  },[attempt,descriptor]);
  return <div className="micro-h5p-shell" aria-busy={state==="loading"}>
    {state==="loading"?<p role="status">正在加载互动内容…</p>:null}
    {state==="error"?<div className="micro-feedback retry" role="alert"><strong>该互动内容暂时无法加载</strong><span>内容、运行适配器或资源可能不可用。进度不会自动跳过。</span><button type="button" onClick={load}>重试</button></div>:null}
    {state==="ready"&&lastEvent?<button type="button" className="atlas-secondary" onClick={()=>onResultRef.current(lastEvent.id,lastEvent.result)}>重新提交互动结果</button>:null}
    <div ref={host} className="micro-h5p-host" hidden={state==="error"}/>
  </div>;
}
