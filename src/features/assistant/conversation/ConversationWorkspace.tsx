import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Loader2, Send, Upload } from 'lucide-react';
import './conversationWorkspace.css';

export type ConversationItem = { id: string; role: 'user' | 'assistant'; content: ReactNode };
export function ConversationWorkspace({ mode, messages, loading = false, sending = false, composerDisabled = false, error, onRetry, onSend, onAttachment, composerActions, children, placeholder = '发消息，继续讨论…' }: {
  mode: 'assistant' | 'practice' | 'capability-update'; messages: ConversationItem[]; loading?: boolean; sending?: boolean; composerDisabled?: boolean;
  error?: string; onRetry?: () => void; onSend: (text: string) => Promise<boolean | void>; onAttachment?: (file: File) => void;
  composerActions?: ReactNode; children?: ReactNode; placeholder?: string;
}) {
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState(''); const bottom = useRef<HTMLDivElement>(null); const timeline = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(false); const input = useRef<HTMLTextAreaElement>(null); const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (nearBottom.current) timeline.current?.scrollTo({ top: timeline.current.scrollHeight, behavior: 'instant' }); }, [messages, sending]);
  async function send() { const original=draft;const text = original.trim(); if (!text || sending || composerDisabled) return; const focus=document.activeElement;nearBottom.current=true;if (await onSend(text) !== false) { setDraft(current=>current===original?'':current); if(document.activeElement===focus&&(focus===input.current||focus?.getAttribute('aria-label')==='发送对话消息'))input.current?.focus({ preventScroll: true }); } }
  return <div className={`conversation-workspace mode-${mode}`}>
    <div className="conversation-timeline" ref={timeline} role="log" aria-label="对话时间线" aria-live="polite" onScroll={() => { const el = timeline.current; if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
      {loading ? <p role="status">正在恢复对话…</p> : null}
      {messages.map(message => <motion.article className={`conversation-message workbench-card ${message.role}`} key={message.id} initial={{ opacity: 0, y: reduced ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .18 }}><small>{message.role === 'user' ? '你' : 'EduFlow'}</small><div className="conversation-message-content">{message.content}</div></motion.article>)}
      {children}
      {sending ? <p role="status"><Loader2 size={16} className="spin" />正在处理…</p> : null}<div ref={bottom}/>
    </div>
    {error ? <div className="conversation-error" role="alert"><p>{error}</p>{onRetry ? <button className="atlas-secondary" onClick={onRetry} disabled={sending}>重试</button> : null}</div> : null}
    <div className="conversation-composer composer-dock"><textarea ref={input} aria-label="对话消息" value={draft} onChange={event => setDraft(event.target.value)} placeholder={placeholder} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}/>
      <div className="conversation-composer-actions">{onAttachment ? <><button className="atlas-secondary" disabled={sending || composerDisabled} onClick={() => file.current?.click()}><Upload size={16}/>上传文件</button><input ref={file} type="file" aria-label="上传工作文件" accept=".txt,.md,.csv" hidden disabled={sending || composerDisabled} onChange={event => { const selected = event.target.files?.[0]; if (selected) onAttachment(selected); event.target.value = ''; }}/></> : null}{composerActions}<button className={composerActions ? "atlas-secondary" : "atlas-primary"} aria-label="发送对话消息" disabled={sending || composerDisabled || !draft.trim()} onClick={() => void send()}><Send size={16}/>发送</button></div>
    </div>
  </div>;
}
