import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './conversationWorkbench.css';

/** Presentation only: callers retain sessions, submissions and confirmation authority. */
export function ConversationWorkbenchShell({ mode, title, titleId, description, contextLabel, action, context, children }: {
  mode: string; title: string; titleId?: string; description: string; contextLabel?: ReactNode;
  action: ReactNode; context: ReactNode; children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const rail=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{const media=window.matchMedia('(max-width:760px)');const align=()=>{if(rail.current)rail.current.open=!media.matches;};align();media.addEventListener('change',align);return()=>media.removeEventListener('change',align);},[]);
  return <motion.section className="conversation-workbench" aria-label={`${title}工作台`} initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .24 }}>
    <header className="workbench-header"><div className="workbench-heading"><span className="workbench-eyebrow">{mode}</span><h1 id={titleId}>{title}</h1><p>{description}</p>{contextLabel ? <small className="workbench-context-label">{contextLabel}</small> : null}</div><div className="workbench-header-action">{action}</div></header>
    <div className="workbench-body"><details className="workbench-context" ref={rail} open><summary>工作上下文与要求</summary><aside className="workbench-context-content" aria-label="工作上下文">{context}</aside></details><div className="workbench-conversation">{children}</div></div>
  </motion.section>;
}
