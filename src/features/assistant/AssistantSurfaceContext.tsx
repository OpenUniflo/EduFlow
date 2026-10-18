import { createPortal } from 'react-dom';
import { fallbackAssistantContext } from './presentationContext';
import { createContext, useCallback, useContext, useMemo, useState, useLayoutEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { MockSession } from '@/features/auth/types';
import type { AssistantContext } from './assistantContext';
import { AssistantSurface } from './components/EduFlowAssistant';

export type AssistantSurfaceProps={context?:AssistantContext;contextLabel:string;children?:ReactNode;drawerOpen?:boolean;className?:string;locked?:boolean};
type Registration={id:string;route:string;props:AssistantSurfaceProps};
const RegistrationContext=createContext<((registration:Registration|null,id:string)=>void)|null>(null);
export const useAssistantRegistration=()=>useContext(RegistrationContext);

export function GlobalAssistantSurface({session,children,onUpdateCapabilities,foreground,surfaceHost}:{surfaceHost?:HTMLElement|null;session:MockSession;children:ReactNode;foreground?:AssistantSurfaceProps;onUpdateCapabilities:(courseId?:string)=>void}) {
  // The portal target remains stable while its DOM host moves into/out of the native modal.
  // React therefore preserves the open panel and unsent composer instead of remounting them.
  const [portalContainer]=useState(()=>typeof document==='undefined'?null:document.createElement('div'));
  useLayoutEffect(()=>{if(!portalContainer)return;(surfaceHost??document.body).appendChild(portalContainer);return()=>portalContainer.remove();},[surfaceHost,portalContainer]);
  const location=useLocation();const [registration,setRegistration]=useState<Registration|null>(null);
  const register=useCallback((next:Registration|null,id:string)=>setRegistration(current=>next??(current?.id===id?null:current)),[]);
  const fallback=useMemo<AssistantSurfaceProps>(()=>{
    return {contextLabel:'当前页面',context:{...fallbackAssistantContext(location.pathname),userRole:session.role,capabilities:session.capabilities}};
  },[location.pathname,session]);
  const props=foreground ?? (registration?.route===location.pathname?registration.props:fallback);
  const surface=<AssistantSurface {...props} locked={false} onUpdateCapabilities={()=>onUpdateCapabilities(props.context?.courseId)}/>;
  return <RegistrationContext.Provider value={register}>{children}{portalContainer?createPortal(surface,portalContainer):surface}</RegistrationContext.Provider>;
}
