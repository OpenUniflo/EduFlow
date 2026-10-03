import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { MockSession } from '@/features/auth/types';
import type { AssistantContext } from './assistantContext';
import { AssistantSurface } from './components/EduFlowAssistant';

export type AssistantSurfaceProps={context?:AssistantContext;contextLabel:string;children?:ReactNode;drawerOpen?:boolean;className?:string;locked?:boolean};
type Registration={id:string;route:string;props:AssistantSurfaceProps};
const RegistrationContext=createContext<((registration:Registration|null,id:string)=>void)|null>(null);
export const useAssistantRegistration=()=>useContext(RegistrationContext);

export function GlobalAssistantSurface({session,children,onUpdateCapabilities}:{session:MockSession;children:ReactNode;onUpdateCapabilities:(courseId?:string)=>void}) {
  const location=useLocation();const [registration,setRegistration]=useState<Registration|null>(null);
  const register=useCallback((next:Registration|null,id:string)=>setRegistration(current=>next??(current?.id===id?null:current)),[]);
  const fallback=useMemo<AssistantSurfaceProps>(()=>{
    const courseId=/^\/courses\/([^/]+)/.exec(location.pathname)?.[1];
    const workspace=location.pathname.startsWith('/explore')?'explore':location.pathname.startsWith('/courses')?'courses':location.pathname.startsWith('/teaching')?'teaching':location.pathname.startsWith('/workflows')?'canvas':'learning';
    return {contextLabel:'当前页面',context:{workspace,experienceMode:'learn',userRole:session.role,capabilities:session.capabilities,...(courseId?{courseId:decodeURIComponent(courseId)}:{})}};
  },[location.pathname,session]);
  const props=registration?.route===location.pathname?registration.props:fallback;
  return <RegistrationContext.Provider value={register}>{children}<AssistantSurface {...props} locked={false} onUpdateCapabilities={()=>onUpdateCapabilities(props.context?.courseId)}/></RegistrationContext.Provider>;
}
