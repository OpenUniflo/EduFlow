import { BookOpen, Compass, GraduationCap, LogIn, LogOut, Network, ShieldCheck, UserPlus, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { MockSession } from "@/features/auth/types";
import { canManageCourses, canManageKnowledgeDomains } from "@/features/auth/capabilities";

export type GlobalNavActive="learning"|"explore"|"courses"|"canvas"|"teaching"|"system";
export type GlobalNavItem={id:GlobalNavActive;to:string;label:string};

export function getPrimaryNavigationItems(session?:MockSession|null):GlobalNavItem[]{
  const items:GlobalNavItem[]=[{id:"learning",to:"/",label:"学习"},{id:"explore",to:"/explore",label:"探索"},{id:"courses",to:"/courses",label:"课程"},{id:"canvas",to:"/workflows",label:"画布"}];
  if(canManageCourses(session))items.push({id:"teaching",to:"/teaching",label:"教学管理"});
  if(canManageKnowledgeDomains(session))items.push({id:"system",to:"/system",label:"系统管理"});
  return items;
}

const icons={learning:GraduationCap,explore:Compass,courses:BookOpen,canvas:Workflow,teaching:BookOpen,system:ShieldCheck};
function initials(name:string){return name.trim().slice(0,2).toUpperCase()||"ED";}

export function GlobalNav({active,session,onLogout}:{active:GlobalNavActive;session?:MockSession|null;onLogout?:()=>void}){
  const navigate=useNavigate(); const [accountOpen,setAccountOpen]=useState(false);
  useEffect(()=>{function close(event:KeyboardEvent){if(event.key==="Escape")setAccountOpen(false);}window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[]);
  return <nav className="atlas-global-nav global-tab-nav" aria-label="全局导航">
    <button className="global-nav-brand glass-v2" onClick={()=>navigate("/")} aria-label="返回学习空间"><span><Network size={18}/></span><strong>EduFlow</strong></button>
    <div className="global-nav-tabs glass-v2">{getPrimaryNavigationItems(session).map((item)=>{const Icon=icons[item.id];return <NavLink key={item.id} to={item.to} className={active===item.id?"active":""}><Icon size={15}/><span>{item.label}</span></NavLink>;})}</div>
    {session?<div className={`global-account ${accountOpen?"open":""}`}><button className="global-account-trigger glass-v2" onClick={()=>setAccountOpen((value)=>!value)} aria-expanded={accountOpen} aria-label="账户菜单"><span>{initials(session.name)}</span></button>{accountOpen?<div className="global-account-popover glass-v2"><strong>{session.name}</strong><small>{session.email}</small><button onClick={()=>{setAccountOpen(false);navigate("/?view=knowledge");}}><GraduationCap size={14}/>我的知识</button>{onLogout?<button onClick={onLogout}><LogOut size={14}/>退出登录</button>:null}</div>:null}</div>:<div className="guest-auth-actions glass-v2"><button aria-label="登录" onClick={()=>navigate("/login")}><LogIn size={14}/>登录</button><button aria-label="注册" onClick={()=>navigate("/register")}><UserPlus size={14}/>注册</button></div>}
  </nav>;
}
