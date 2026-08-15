import { Bot, Pin, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CourseDesignAssistantContext, CourseDesignAssistantProvider, CourseDesignAssistantResponse } from "@/features/course/courseDesignAssistant";

export function CourseDesignAssistant({ context, provider, drawerOpen }: { context:CourseDesignAssistantContext; provider?:CourseDesignAssistantProvider; drawerOpen:boolean }) {
  const actions = provider?.getActions(context) ?? [];
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<CourseDesignAssistantResponse | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => { setResponse(null); }, [context.key]);
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);
  if (!provider || !actions.length) return null;

  function enter() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setHovered(true);
  }
  function leave() {
    if (pinned) return;
    closeTimer.current = window.setTimeout(() => setHovered(false), 220);
  }
  function runAction(actionId:string) {
    setPinned(true);
    setHovered(true);
    setResponse(provider!.resolveAction(context, actionId));
  }
  function send() {
    if (!input.trim()) return;
    setResponse(provider!.resolveText(context, input));
  }
  const open = hovered || pinned;
  return <aside className={`course-design-assistant ${drawerOpen ? "drawer-open" : ""} ${open ? "open" : ""} ${pinned ? "pinned" : ""}`} onMouseEnter={enter} onMouseLeave={leave} aria-label="AI 课程助手">
    {open ? <section className="course-design-assistant-panel glass-v2">
      <header><div><Bot size={18}/><span><strong>AI 课程助手</strong><small>{pinned ? "已固定对话" : "悬停预览 · 点击图标固定"}</small></span></div>{pinned ? <button onClick={() => {setPinned(false);setHovered(false);}} aria-label="关闭 AI 课程助手"><X size={16}/></button> : null}</header>
      <div className="course-design-assistant-context"><span>当前上下文</span><strong>{context.label}</strong><small>{context.kind === "course" ? "Course" : context.kind === "chapter" ? "Chapter" : context.kind === "knowledge" ? "Knowledge" : "Assignment"}</small></div>
      <div className="course-design-assistant-actions">{actions.map((action) => <button key={action.id} onClick={() => runAction(action.id)}>{action.label}</button>)}</div>
      {response ? <div className={`course-design-assistant-response ${response.fallback ? "fallback" : ""}`} role="status">{response.message}</div> : null}
      {pinned ? <div className="course-design-assistant-input"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {if(event.key === "Enter") send();}} placeholder="询问课程结构、依赖、课件或实训…"/><button onClick={send} aria-label="发送课程设计问题"><Send size={15}/></button></div> : null}
    </section> : null}
    <button className="course-design-assistant-trigger" onClick={() => {setPinned((value) => !value);setHovered(true);}} aria-label="打开 AI 课程助手" aria-expanded={open}><Bot size={22}/>{pinned ? <Pin size={10}/> : null}</button>
  </aside>;
}
