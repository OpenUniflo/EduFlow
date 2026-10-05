import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '@/shared/api/apiClient';
import { getAssistantSession, streamAssistantMessage } from '../assistantClient';
import type { RecoveryReference } from './workspaceReferences';
import type { AssistantContextSnapshot, AssistantMessage, WorkspaceTimelineContent } from '../assistantContract';

export function useWorkspaceConversation(mode: 'practice' | 'capability-update', context: AssistantContextSnapshot, enabled = true) {
  const binding = JSON.stringify(context); const [sessionId, setSessionId] = useState<string>();
  const [messages, setMessages] = useState<AssistantMessage[]>([]); const [loading, setLoading] = useState(enabled); const [sending, setSending] = useState(false); const [error, setError] = useState('');
  const [retryRevision,setRetryRevision]=useState(0);
  const generation=useRef(0);const lastSend=useRef<{text:string;context:AssistantContextSnapshot}|undefined>(undefined);const [errorKind,setErrorKind]=useState<'load'|'send'|'record'>('load');
  const [references,setReferences]=useState<RecoveryReference[]>([]);
  const scope = useMemo(() => ({ active: false }), [binding, mode, enabled, retryRevision]);
  const activeScope = useRef(scope); activeScope.current = scope;
  const activeSession = useRef(sessionId); activeSession.current = sessionId;
  const isCurrent = () => scope.active && activeScope.current === scope && activeSession.current === sessionId;
  const reload = useCallback(async (id: string, epoch:number) => {const result=await getAssistantSession(id);if(generation.current===epoch && activeSession.current===id)setMessages(result.messages);}, []);
  useEffect(() => { let live = true; scope.active = true; setMessages([]); setSessionId(undefined); setLoading(enabled);setSending(false);setError('');setErrorKind('load'); lastSend.current=undefined; if (!enabled) return () => { scope.active=false; };
    const epoch=++generation.current;setReferences([]);const snapshot = JSON.parse(binding) as AssistantContextSnapshot;
    void apiRequest<{sessionId:string}>('/api/assistant', { method:'POST', body:JSON.stringify({ action:'workspace-session',mode,context:snapshot }) }).then(async result => { const detail = await getAssistantSession(result.sessionId); if (live) { setSessionId(result.sessionId); setMessages(detail.messages);try{const saved=JSON.parse(localStorage.getItem(`eduflow-workspace-refs:${result.sessionId}`)??'[]');if(Array.isArray(saved))setReferences(saved.filter(ref=>ref?.type==='workspace_event'&&['attachment','submission','diagnosis','confirmation'].includes(ref.event)&&typeof ref.referenceId==='string'));}catch{/* Hints never override authoritative API validation. */} } }).catch(error => { if (live) setError(error instanceof Error ? error.message : '对话恢复失败'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false;scope.active=false;if(generation.current===epoch)generation.current++; };
  }, [binding,mode,enabled,retryRevision,scope]);
  async function send(text: string, currentContext = context) {
    if (!isCurrent()) return false;
    if (!enabled) { setMessages(current => [...current,{id:crypto.randomUUID(),sessionId:'guest',role:'user',content:text,context,createdAt:new Date().toISOString()}]); return true; }
    if (!sessionId || sending) return false;lastSend.current={text,context:currentContext}; setSending(true); setError('');setErrorKind('send');
    const epoch=generation.current;const id = crypto.randomUUID(); setMessages(current => [...current,{id:crypto.randomUUID(),sessionId,role:'user',content:text,context:currentContext,createdAt:new Date().toISOString()},{id,sessionId,role:'assistant',content:'',context,createdAt:new Date().toISOString()}]);
    try { await streamAssistantMessage({sessionId,message:text,context:currentContext}, delta => {if(generation.current===epoch)setMessages(current => current.map(item => item.id === id ? {...item,content:item.content+delta} : item));}); await reload(sessionId,epoch); return generation.current===epoch; }
    catch(error) { if(generation.current===epoch)setError(error instanceof Error ? error.message : '回复暂未完成，请重试发送。'); await reload(sessionId,epoch).catch(() => undefined); return false; }
    finally { if(generation.current===epoch)setSending(false); }
  }
  async function record(event: WorkspaceTimelineContent['event'], referenceId: string) {
    if (!sessionId || !isCurrent()) return;
    const epoch=generation.current;const ref:RecoveryReference={type:'workspace_event',schemaVersion:1,event,referenceId,recordedAt:new Date().toISOString()};
    setReferences(current=>{const next=[...current.filter(item=>item.event!==event||item.referenceId!==referenceId),ref];try{localStorage.setItem(`eduflow-workspace-refs:${sessionId}`,JSON.stringify(next));}catch{/* Optional recovery hint. */}return next;});
    try { await apiRequest('/api/assistant',{method:'POST',body:JSON.stringify({action:'workspace-event',mode,sessionId,context,structuredContent:ref})}); await reload(sessionId,epoch); }
    catch { if(generation.current===epoch){setErrorKind('record');setError('正式记录已保存，对话记录暂未同步。刷新后会重新读取正式资料。');} }
  }
  function discardReference(id:string){if(!isCurrent())return;setReferences(current=>{const next=current.filter(ref=>ref.referenceId!==id);try{if(sessionId)localStorage.setItem(`eduflow-workspace-refs:${sessionId}`,JSON.stringify(next));}catch{/* Recovery hints only. */}return next;});}
  return {sessionId,messages,references,discardReference,loading,sending,error,send,record,retrySession:()=>setRetryRevision(value=>value+1),retry:()=>{if(errorKind==='send'&&lastSend.current)void send(lastSend.current.text,lastSend.current.context);else setRetryRevision(value=>value+1);}};
}
