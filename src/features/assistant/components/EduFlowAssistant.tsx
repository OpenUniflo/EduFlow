import { motion, useReducedMotion } from 'motion/react';
import '../assistantSurface.css';
import { Bot, Pin, X } from "lucide-react";
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authGateState } from "@/features/auth/authRedirect";
import { useAssistantRegistration, type AssistantSurfaceProps } from "../AssistantSurfaceContext";
import { AssistantConversation } from "./AssistantConversation";

/** Page adapters register context; only the app-owned surface renders for authenticated users. */
export function EduFlowAssistant(props: AssistantSurfaceProps) {
  const register=useAssistantRegistration();const id=useId();const location=useLocation();
  const {context,contextLabel,children,drawerOpen,className,locked}=props;
  useLayoutEffect(()=>{
    if(!register)return;
    register({id,route:location.pathname,props:{context,contextLabel,children,drawerOpen,className,locked}},id);
    return ()=>register(null,id);
  },[register,id,location.pathname,context,contextLabel,children,drawerOpen,className,locked]);
  return register?null:<AssistantSurface {...props}/>;
}

export function AssistantSurface({ context, contextLabel, children, drawerOpen = false, className = "", locked: lockedProp = false, onUpdateCapabilities }: AssistantSurfaceProps & {onUpdateCapabilities?:()=>void}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [hovered, setHovered] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timerRef = useRef<number | null>(null);
  const open = hovered || pinned;
  const reducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  function close() { setPinned(false); setHovered(false); triggerRef.current?.focus(); }

  useEffect(() => { if (pinned) panelRef.current?.querySelector<HTMLInputElement>("input,button")?.focus(); }, [pinned]);
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);
  function enter() { setHasOpened(true); if (timerRef.current) window.clearTimeout(timerRef.current); setHovered(true); }
  function leave() { if (panelRef.current?.contains(document.activeElement)) return; if (!pinned) timerRef.current = window.setTimeout(() => setHovered(false), 220); }

  const locked = lockedProp || !context;
  return <aside className={`eduflow-assistant course-design-assistant ${drawerOpen ? "drawer-open" : ""} ${open ? "open" : ""} ${pinned ? "pinned" : ""} ${className}`} onMouseEnter={enter} onMouseLeave={leave} onBlur={event => { if (!pinned && !event.currentTarget.contains(event.relatedTarget as Node | null) && !event.currentTarget.matches(":hover")) setHovered(false); }} onKeyDown={event => { if(event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); } }} aria-label="EduFlow Assistant" data-presentation={context?.presentation} data-workspace={context?.workspace ?? "locked"} data-experience-mode={context?.experienceMode ?? "learn"}>
    {hasOpened ? <motion.section ref={panelRef} initial={false} animate={open?{opacity:1,scale:1,y:0,visibility:'visible'}:{opacity:0,scale:reducedMotion?1:.97,y:reducedMotion?0:10,transitionEnd:{visibility:'hidden'}}} transition={{duration:reducedMotion?0:.24,ease:'easeOut'}} style={{pointerEvents:open?'auto':'none'}} inert={!open} aria-hidden={!open} className="course-design-assistant-panel eduflow-assistant-panel glass-v2">
      <header><div><Bot size={18}/><span><strong>EduFlow Assistant</strong><small title={contextLabel}>{locked ? '登录后使用 EduFlow Assistant' : contextLabel}</small></span></div><div className="assistant-window-controls"><button aria-label={pinned ? '取消固定 Assistant' : '固定 Assistant'} aria-pressed={pinned} onClick={() => setPinned(value => !value)}><Pin size={15}/></button><button onClick={close} aria-label="关闭 EduFlow Assistant"><X size={16}/></button></div></header>
      {!locked && onUpdateCapabilities ? <div className="assistant-primary-operation"><button className="atlas-primary" onClick={()=>{close();onUpdateCapabilities();}}>更新我的能力</button><small>从你的资料中确认新的能力</small></div> : null}
      {locked ? <div className="course-design-assistant-actions"><p>Assistant 会读取个人对话与学习上下文，因此不为匿名访客创建会话。</p><button className="atlas-primary" onClick={() => navigate("/login", { state: authGateState(location) })}>登录后使用 Assistant</button></div> : (children ?? <AssistantConversation context={context!}/>)}
    </motion.section> : null}
    <button ref={triggerRef} className="course-design-assistant-trigger" onClick={() => { if(pinned) close(); else {setPinned(true);enter();} }} aria-label="打开 EduFlow Assistant" aria-expanded={open}><Bot size={22}/>{pinned ? <Pin size={10}/> : null}</button>
  </aside>;
}
