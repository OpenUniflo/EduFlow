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
  const [hasOpened, setHasOpened] = useState(false);
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  function close() { setOpen(false); triggerRef.current?.focus(); }
  function toggle() { setHasOpened(true); setOpen((value) => !value); }

  useEffect(() => { if (open) panelRef.current?.querySelector<HTMLInputElement>("input,button")?.focus(); }, [open]);
  useEffect(() => {
    const closeSurface = () => setOpen(false);
    window.addEventListener("eduflow:assistant-close", closeSurface);
    return () => window.removeEventListener("eduflow:assistant-close", closeSurface);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const panels = [...document.querySelectorAll<HTMLElement>("[data-floating-panel]")]
        .filter((element) => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
        .filter((element) => !element.closest('[aria-hidden="true"],[inert]'))
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .sort((left, right) => right.right - left.right);
      const panel = panels[0];
      const avoid = panel ? Math.max(0, window.innerWidth - panel.left + 12) : 0;
      root.style.setProperty("--ef-floating-avoid-right", `${Math.round(avoid)}px`);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "data-floating-panel"] });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--ef-floating-avoid-right");
    };
  }, []);

  const locked = lockedProp || !context;
  return <aside className={`eduflow-assistant course-design-assistant ${drawerOpen ? "drawer-open" : ""} ${open ? "open pinned" : ""} ${className}`} onKeyDown={event => { if(event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); } }} aria-label="EduFlow Assistant" data-presentation={context?.presentation} data-workspace={context?.workspace ?? "locked"} data-experience-mode={context?.experienceMode ?? "learn"}>
    {hasOpened ? <motion.section ref={panelRef} initial={false} animate={open?{opacity:1,scale:1,y:0}:{opacity:0,scale:reducedMotion?1:.97,y:reducedMotion?0:10}} transition={{duration:reducedMotion?0:.24,ease:'easeOut'}} style={{pointerEvents:open?'auto':'none'}} inert={!open} aria-hidden={!open} className="course-design-assistant-panel eduflow-assistant-panel glass-v2">
      <header><div><Bot size={18}/><span><strong>EduFlow Assistant</strong><small title={contextLabel}>{locked ? '登录后使用 EduFlow Assistant' : contextLabel}</small></span></div><div className="assistant-window-controls"><button aria-label={open ? '收起 Assistant' : '展开 Assistant'} aria-pressed={open} onClick={toggle}><Pin size={15}/></button><button onClick={close} aria-label="关闭 EduFlow Assistant"><X size={16}/></button></div></header>
      {!locked && onUpdateCapabilities ? <div className="assistant-primary-operation"><button className="atlas-primary" onClick={()=>{close();onUpdateCapabilities();}}>更新我的能力</button><small>从你的资料中确认新的能力</small></div> : null}
      {locked ? <div className="course-design-assistant-actions"><p>Assistant 会读取个人对话与学习上下文，因此不为匿名访客创建会话。</p><button className="atlas-primary" onClick={() => navigate("/login", { state: authGateState(location) })}>登录后使用 Assistant</button></div> : (children ?? <AssistantConversation context={context!}/>)}
    </motion.section> : null}
    <button ref={triggerRef} className="course-design-assistant-trigger" onClick={toggle} aria-label="打开 EduFlow Assistant" aria-expanded={open}><Bot size={22}/>{open ? <Pin size={10}/> : null}</button>
  </aside>;
}
