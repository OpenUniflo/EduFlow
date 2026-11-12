import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Loader2, Upload } from 'lucide-react';
import { ComposerActionButton, onComposerKeyDown } from '@/shared/ui/ComposerAction';
import './conversationWorkspace.css';

export type ConversationItem = { id: string; role: 'user' | 'assistant'; content: ReactNode };
export function ConversationWorkspace({ mode, messages, loading = false, sending = false, replying = false, composerDisabled = false, error, onRetry, onSend, onStop, onAttachment, composerActions, children, placeholder = '发消息，继续讨论…', insertText, insertKey }: {
  mode: 'assistant' | 'practice' | 'capability-update'; messages: ConversationItem[]; loading?: boolean; sending?: boolean; replying?: boolean; composerDisabled?: boolean;
  error?: string; onRetry?: () => void; onSend: (text: string) => Promise<boolean | void>; onStop?: () => void; onAttachment?: (file: File) => void;
  composerActions?: ReactNode; children?: ReactNode; placeholder?: string; insertText?: string; insertKey?: string;
}) {
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState(''); const bottom = useRef<HTMLDivElement>(null); const timeline = useRef<HTMLDivElement>(null); const lastInsertKey = useRef<string | null>(null);
  const nearBottom = useRef(false); const input = useRef<HTMLTextAreaElement>(null); const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (nearBottom.current) timeline.current?.scrollTo({ top: timeline.current.scrollHeight, behavior: 'instant' }); }, [messages, sending]);
  useEffect(() => { if (!insertText || !insertKey || lastInsertKey.current === insertKey) return; lastInsertKey.current = insertKey; setDraft(current => current.trim() ? `${current.trimEnd()}\n${insertText}` : insertText); window.requestAnimationFrame(() => { input.current?.focus(); const next = input.current?.value.length ?? 0; input.current?.setSelectionRange(next, next); }); }, [insertKey, insertText]);
  async function send() {
    const original = draft;
    const text = original.trim();
    if (!text || sending || replying || composerDisabled) return;
    const focus = document.activeElement;
    nearBottom.current = true;
    // The sent text belongs to the user turn now. Clear the composer before
    // the stream starts; a rejected send restores it only when the learner has
    // not already started typing something new.
    setDraft("");
    try {
      const accepted = await onSend(text);
      if (accepted === false) setDraft(current => current ? current : original);
    } catch (error) {
      setDraft(current => current ? current : original);
      throw error;
    }
    if (document.activeElement === focus && (focus === input.current || focus?.getAttribute("aria-label") === "发送对话消息")) input.current?.focus({ preventScroll: true });
  }
  return <div className={`conversation-workspace mode-${mode}`}>
    <div className="conversation-timeline" ref={timeline} role="log" aria-label="对话时间线" aria-live="polite" onScroll={() => { const el = timeline.current; if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
      {loading ? <p role="status">正在恢复对话…</p> : null}
      {messages.map(message => <motion.article className={`conversation-message workbench-card ${message.role}`} key={message.id} initial={{ opacity: 0, y: reduced ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .18 }}><small>{message.role === 'user' ? '你' : 'EduFlow'}</small><div className="conversation-message-content">{message.content}</div></motion.article>)}
      {children}
      {sending ? <p role="status"><Loader2 size={16} className="spin" />正在处理…</p> : null}<div ref={bottom}/>
    </div>
    {error ? <div className="conversation-error" role="alert"><p>{error}</p>{onRetry ? <button className="atlas-secondary" onClick={onRetry} disabled={sending}>重试</button> : null}</div> : null}
    <div className="conversation-composer composer-dock"><textarea ref={input} aria-label="对话消息" value={draft} onChange={event => setDraft(event.target.value)} placeholder={placeholder} onKeyDown={event => onComposerKeyDown(event, replying, () => void send())}/>
      <div className="conversation-composer-actions">{onAttachment ? <><button className="atlas-secondary" disabled={sending || composerDisabled} onClick={() => file.current?.click()}><Upload size={16}/>上传文件</button><input ref={file} type="file" aria-label="上传工作文件" accept=".txt,.md,.csv" hidden disabled={sending || composerDisabled} onChange={event => { const selected = event.target.files?.[0]; if (selected) onAttachment(selected); event.target.value = ''; }}/></> : null}{composerActions}<ComposerActionButton replying={replying} canSend={!sending && !composerDisabled && Boolean(draft.trim())} onSend={() => void send()} onStop={onStop} idleLabel="发送对话消息" /></div>
    </div>
  </div>;
}
