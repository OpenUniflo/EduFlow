import { useCallback, useEffect } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import type { useRoutePlanning } from './useRoutePlanning';
export function PlanningNavigationGuard({control}: {control:ReturnType<typeof useRoutePlanning>}) {
  const blocker=useBlocker(control.dirty);
  useBeforeUnload(useCallback((event:BeforeUnloadEvent)=>{if(control.dirty){event.preventDefault();event.returnValue='';}},[control.dirty]));
  useEffect(()=>{if(blocker.state==='blocked')control.requestDismiss(()=>blocker.proceed(),()=>blocker.reset());},[blocker.state]);
  return null;
}
