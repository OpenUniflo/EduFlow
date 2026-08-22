import { Bot, Pin, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AssistantContext } from "@/features/assistant/assistantContext";

export function EduFlowAssistant({ context, contextLabel, children, drawerOpen = false, className = "" }: {
  context: AssistantContext;
  contextLabel: string;
  children: ReactNode;
  drawerOpen?: boolean;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timerRef = useRef<number | null>(null);
  const open = hovered || pinned;

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);
  function enter() { if (timerRef.current) window.clearTimeout(timerRef.current); setHovered(true); }
  function leave() { if (!pinned) timerRef.current = window.setTimeout(() => setHovered(false), 220); }

  return <aside className={`eduflow-assistant course-design-assistant ${drawerOpen ? "drawer-open" : ""} ${open ? "open" : ""} ${pinned ? "pinned" : ""} ${className}`} onMouseEnter={enter} onMouseLeave={leave} aria-label="EduFlow Assistant" data-workspace={context.workspace} data-experience-mode={context.experienceMode}>
    {open ? <section className="course-design-assistant-panel eduflow-assistant-panel glass-v2">
      <header><div><Bot size={18}/><span><strong>EduFlow Assistant</strong><small>{pinned ? "已固定 · 基于当前页面上下文" : "悬停预览 · 点击固定"}</small></span></div>{pinned ? <button onClick={() => { setPinned(false); setHovered(false); }} aria-label="关闭 EduFlow Assistant"><X size={16}/></button> : null}</header>
      <div className="course-design-assistant-context"><span>当前上下文</span><strong>{contextLabel}</strong><small>{context.workspace} · {context.experienceMode}</small></div>
      {children}
    </section> : null}
    <button className="course-design-assistant-trigger" onClick={() => { setPinned((value) => !value); setHovered(true); }} aria-label="打开 EduFlow Assistant" aria-expanded={open}><Bot size={22}/>{pinned ? <Pin size={10}/> : null}</button>
  </aside>;
}
