import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X, Upload, FileText, ArrowLeft } from 'lucide-react';
import { evidenceRequest, readEvidenceLibrary, readEvidenceSource, readEvidenceHistory, uploadEvidence, type EvidenceSourceSummary, type EvidenceSourceDetail , type EvidenceHistory, type EvidenceProposal } from './evidenceClient';
import { ConversationWorkbenchShell } from '@/shared/components/ConversationWorkbenchShell';
import { CapabilityConversation, CapabilityWorkbenchContext } from './CapabilityConversation';
import './evidence.css';

type EvidenceSelection={sourceId?:string;runId?:string};
type Workspace=EvidenceSelection & {courseId?:string};
type EvidenceEnvironment={surfaceHost?:HTMLElement|null;foreground?:Workspace;revision:number;changed:()=>void;open:(courseId?:string,sourceId?:string,runId?:string)=>void;close:()=>void;confirmed:()=>Promise<void>;nodeTitle:(id:string)=>string;preview:(courseId:string,proposals:EvidenceProposal[])=>string};
const EvidenceContext=createContext<EvidenceEnvironment|null>(null);
export const useEvidenceWorkspace=()=>useContext(EvidenceContext);
const dateLabel=(value:string)=>new Date(value).toLocaleString('zh-CN');
const runLabel={running:'分析中',completed:'分析完成',failed:'分析未完成'};
const parseLabel=(source:EvidenceSourceSummary)=>source.archived_at?'已归档':source.parse_status==='ready'?'已解析':source.parse_status==='failed'?'解析失败':'等待上传 / 解析';
const errorText=(error:unknown)=>error instanceof Error?error.message:'操作暂未完成，请重试。';

export function EvidenceWorkspaceProvider({children,onConfirmed,nodeTitle,preview}:{children:ReactNode;onConfirmed:()=>Promise<void>;nodeTitle:(id:string)=>string;preview:EvidenceEnvironment['preview']}) {
 const [surfaceHost,setSurfaceHost]=useState<HTMLDivElement|null>(null);
 const [selection,setSelection]=useState<EvidenceSelection>({});
 const [workspace,setWorkspace]=useState<Workspace|null>(null);
 const [revision,setRevision]=useState(0);const changed=useCallback(()=>setRevision(value=>value+1),[]);
 const dialog=useRef<HTMLDialogElement>(null);const workspaceOpen=useRef(false);workspaceOpen.current=Boolean(workspace);const reduced=useReducedMotion();
 const returnFocus=useRef<HTMLElement|null>(null);
 const open=useCallback((courseId?:string,sourceId?:string,runId?:string)=>{const opener=document.activeElement as HTMLElement|null;returnFocus.current=opener?.closest('[aria-label="EduFlow Assistant"]')?.querySelector<HTMLButtonElement>('[aria-label="打开 EduFlow Assistant"]')??opener;setSelection({sourceId,runId});setWorkspace({courseId,sourceId,runId});},[]);
 const close=useCallback(()=>{setWorkspace(null);changed();},[changed]);
 useEffect(()=>{if(workspace&&!dialog.current?.open)dialog.current?.showModal();},[workspace]);
 const confirmed=async()=>{await onConfirmed();changed();};
 return <EvidenceContext.Provider value={{open,close,confirmed,nodeTitle,preview,revision,changed,surfaceHost:workspace?surfaceHost:null,foreground:workspace?{courseId:workspace.courseId,...selection}:undefined}}>{children}
  <dialog ref={dialog} className="capability-workspace" onCancel={event=>{event.preventDefault();close();}} aria-labelledby="capability-workspace-title">
   <AnimatePresence onExitComplete={()=>{if(!workspaceOpen.current){dialog.current?.close();if(returnFocus.current?.isConnected&&!returnFocus.current.closest('[inert]'))returnFocus.current.focus();}}}>{workspace?<motion.div key="workspace" initial={false} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:8}} transition={{duration:reduced?0:.24}} className="capability-workspace-content">
    <ConversationWorkbenchShell mode="个人能力" title="更新我的能力" titleId="capability-workspace-title" description="从真实资料中检查能力依据，再决定是否更新。" contextLabel={workspace.courseId?'课程项目上下文':'个人能力资料'} action={<button className="atlas-secondary" aria-label="关闭能力更新工作区" onClick={close}><X size={18}/>关闭</button>} context={<CapabilityWorkbenchContext/>}>
    <CapabilityConversation courseId={workspace.courseId} sourceId={workspace.sourceId} initialRunId={workspace.runId} key={`${workspace.courseId??''}:${workspace.sourceId??''}:${workspace.runId??''}`} onContextChange={setSelection}/>
    </ConversationWorkbenchShell>
   </motion.div>:null}</AnimatePresence>
   <div ref={setSurfaceHost} className="evidence-assistant-host"/>
  </dialog>
 </EvidenceContext.Provider>;
}

function UploadSource({busy,onUpload,secondary=false}:{busy:boolean;onUpload:(file:File)=>void;secondary?:boolean}) {
 const input=useRef<HTMLInputElement>(null);
 return <><button className={secondary?"atlas-secondary":"atlas-primary"} disabled={busy} onClick={()=>input.current?.click()}><Upload size={16}/>上传资料</button><input ref={input} className="evidence-file-input" aria-label="上传证据资料" type="file" accept=".txt,.md,.csv" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)onUpload(file);event.target.value='';}}/></>;
}
function FormatHint(){return <p className="evidence-format">支持 TXT、Markdown、CSV，每份最多 24,000 字符。请提供本人已完成工作的过程与结果；计划或教材不代表已经具备能力。</p>;}
function Feedback({error,message}:{error?:string;message?:string}) {return <>{error?<p role="alert" className="evidence-error">{error}</p>:null}{message?<p role="status" className="evidence-success">{message}</p>:null}</>;}

function SourceDetail({sourceId,onBack,onRun}:{sourceId:string;onBack:()=>void;onRun:(id:string)=>void}) {
 const environment=useEvidenceWorkspace()!;const [data,setData]=useState<EvidenceSourceDetail|null>(null);const [error,setError]=useState('');const [downloading,setDownloading]=useState(false);
 useEffect(()=>{let live=true;setData(null);setError('');void readEvidenceSource(sourceId).then(value=>{if(live)setData(value);}).catch(error=>{if(live)setError(errorText(error));});return()=>{live=false;};},[sourceId,environment.revision]);
 async function download(){const popup=window.open('','_blank');if(!popup){setError('浏览器未能打开文件窗口，请允许此站点打开新窗口后重试。');return;}popup.opener=null;setDownloading(true);try{const {url}=await evidenceRequest<{url:string}>({action:'download',sourceId});popup.location.href=url;}catch(error){popup.close();setError(errorText(error));}finally{setDownloading(false);}}
 return <section className="evidence-source-detail" aria-label="资料详情"><button className="evidence-text-button" onClick={onBack}><ArrowLeft size={15}/>返回资料库</button><Feedback error={error}/>{!data&&!error?<p role="status">正在读取资料详情…</p>:data?<>
  <header><div><span className="evidence-eyebrow">原始资料与能力依据</span><h2>{data.source.title}</h2><p>{dateLabel(data.source.created_at)}</p></div><button className="atlas-secondary" disabled={downloading} onClick={()=>void download()}>打开原始文件</button></header>
  <details className="evidence-card"><summary>查看原文解析</summary><pre>{data.source.parsed_lines.map(line=>`${line.line}  ${line.text}`).join('\n')||'尚无可读取的解析内容。'}</pre></details>
  <div className="evidence-detail-columns"><section><h3>证据片段 · {data.units.length}</h3>{!data.units.length?<p>尚未从这份资料中提取能力表现。</p>:data.units.map(unit=><article className="evidence-card" key={unit.id}><small>原文第 {unit.source_line} 行</small><blockquote>{unit.quote}</blockquote><strong>{unit.capability}</strong><p>{unit.observation}</p>{data.proposals.filter(proposal=>proposal.unit_ids.includes(unit.id)).map(proposal=><p key={proposal.id}><strong>{proposal.node_id?environment.nodeTitle(proposal.node_id):'尚未匹配能力'}</strong> · {proposal.confirmation_state==='confirmed'?'已产生正式确认':proposal.confirmation_state==='rejected'?'已拒绝':'尚未确认'}<button className="evidence-text-button" onClick={()=>onRun(proposal.run_id)}>查看本次判断</button></p>)}</article>)}</section>
  <section><h3>参与过的能力分析 · {data.runs.length}</h3>{!data.runs.length?<p>还未用于能力判断。</p>:data.runs.map(run=><button className="evidence-history-row" key={run.id} onClick={()=>onRun(run.id)}><strong>{runLabel[run.status]}</strong><span>{dateLabel(run.created_at)}</span><small>{run.source_ids.length} 份资料 · 查看候选与确认记录</small></button>)}</section></div>
 </>:null}</section>;
}

export function EvidenceLibrary({onContextChange}:{onContextChange?:(selection:EvidenceSelection)=>void}) {
 const environment=useEvidenceWorkspace()!;const [sources,setSources]=useState<EvidenceSourceSummary[]>([]);const [detail,setDetail]=useState<string|null>(null);const [historyOpen,setHistoryOpen]=useState(false);const [history,setHistory]=useState<EvidenceHistory>({runs:[],nextCursor:null});
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
 useEffect(()=>{onContextChange?.({sourceId:detail??undefined});},[detail,onContextChange]);
 useEffect(()=>{let live=true;setLoading(true);void readEvidenceLibrary().then(value=>{if(live)setSources(value.sources);}).catch(error=>{if(live)setError(errorText(error));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[environment.revision]);
 async function upload(file:File){setBusy(true);setError('');try{const id=await uploadEvidence(file);environment.changed();setDetail(id);setMessage('资料已保存并完成解析。');}catch(error){setError(errorText(error));environment.changed();}finally{setBusy(false);}}
 async function loadHistory(cursor?:string){setBusy(true);setError('');try{const value=await readEvidenceHistory(cursor);setHistory(current=>({runs:cursor?[...current.runs,...value.runs]:value.runs,nextCursor:value.nextCursor}));setHistoryOpen(true);setDetail(null);}catch(error){setError(errorText(error));}finally{setBusy(false);}}
 async function archive(id:string){setBusy(true);setError('');try{await evidenceRequest({action:'archive',sourceId:id});environment.changed();setMessage('资料已归档，正式确认记录仍然保留。');}catch(error){setError(errorText(error));}finally{setBusy(false);}}
 return <div className="evidence-library"><header className="evidence-library-header"><div><span className="evidence-eyebrow">个人资料库</span><h1>我的证据</h1><p>保存做过的工作，追溯能力判断的来源。</p></div><div className="evidence-actions"><UploadSource busy={busy} onUpload={file=>void upload(file)}/><button className="atlas-secondary" onClick={()=>environment.open()}>更新我的能力</button></div></header>
  <FormatHint/><Feedback error={error} message={message}/>
  {detail?<SourceDetail sourceId={detail} onBack={()=>setDetail(null)} onRun={id=>environment.open(undefined,detail,id)}/>:historyOpen?<section aria-label="能力分析历史"><button className="evidence-text-button" onClick={()=>setHistoryOpen(false)}><ArrowLeft size={15}/>返回资料库</button><h2>能力分析历史</h2><p>每次分析独立保存。打开某次分析，查看它的资料、候选和确认结果。</p>{history.runs.length?history.runs.map(run=><button className="evidence-history-row" key={run.id} onClick={()=>environment.open(undefined,undefined,run.id)}><strong>{runLabel[run.status]}</strong><span>{dateLabel(run.created_at)}</span><small>{run.source_ids.length} 份资料</small></button>):<p>还没有能力分析记录。</p>}{history.nextCursor?<button className="atlas-secondary" disabled={busy} onClick={()=>void loadHistory(history.nextCursor!)}>加载更早记录</button>:null}</section>:<>
   <div className="evidence-section-heading"><h2>资料 · {sources.length}</h2><button className="evidence-text-button" disabled={busy} onClick={()=>void loadHistory()}>查看能力分析历史</button></div>
   {loading?<p role="status">正在读取资料摘要…</p>:!sources.length?<div className="evidence-empty"><FileText size={32}/><h3>先保存一份真实工作资料</h3><p>可以是任务复盘、项目记录或带有结果的操作说明。上传不会自动更新能力。</p></div>:<div className="evidence-source-grid">{sources.map(source=><article className={`evidence-card ${source.archived_at?'archived':''}`} key={source.id}><div className="evidence-card-title"><FileText size={18}/><h3>{source.title}</h3><span className="evidence-status">{parseLabel(source)}</span></div><small>{dateLabel(source.created_at)} · {source.provenance.kind==='user-upload'?'本人上传':'执行资料'}</small><dl><div><dt>用于能力判断</dt><dd>{source.diagnosisCount?`${source.diagnosisCount} 次`:'尚未使用'}</dd></div><div><dt>关联能力</dt><dd>{source.capabilityCount} 项</dd></div><div><dt>正式确认</dt><dd>{source.confirmedCount} 项</dd></div></dl>{source.parse_error?<p className="evidence-error">{source.parse_error}</p>:null}<div className="evidence-actions"><button className="atlas-secondary" onClick={()=>setDetail(source.id)}>查看资料与依据</button>{!source.archived_at?<button className="evidence-text-button" disabled={busy} onClick={()=>void archive(source.id)}>归档</button>:null}</div></article>)}</div>}
  </>}
 </div>;
}
