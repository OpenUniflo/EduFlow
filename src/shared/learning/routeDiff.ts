import type { RouteSnapshot } from './routeVersion';
/** Compare Edge membership and ordered local Action decisions independently. */
export function routeDiff(current: Pick<RouteSnapshot,'selectedNodeIds'|'executionSteps'>, next: Pick<RouteSnapshot,'selectedNodeIds'|'executionSteps'>) {
  const oldSteps=current.executionSteps??[],steps=next.executionSteps??[];
  const oldEdges=[...new Set(oldSteps.map(step=>step.edgeId))],edges=[...new Set(steps.map(step=>step.edgeId))];
  const same=(a:{edgeId:string;actionId:string},b:{edgeId:string;actionId:string})=>a.edgeId===b.edgeId&&a.actionId===b.actionId;
  const reorderedEdgeIds=edges.filter(id=>{
    const before=oldSteps.filter(step=>step.edgeId===id && steps.some(next=>same(step,next))).map(step=>step.actionId);
    const after=steps.filter(step=>step.edgeId===id && oldSteps.some(old=>same(step,old))).map(step=>step.actionId);
    return JSON.stringify(before)!==JSON.stringify(after);
  });
  return {
    addedNodeIds:next.selectedNodeIds.filter(id=>!current.selectedNodeIds.includes(id)),
    removedNodeIds:current.selectedNodeIds.filter(id=>!next.selectedNodeIds.includes(id)),
    addedEdgeIds:edges.filter(id=>!oldEdges.includes(id)),removedEdgeIds:oldEdges.filter(id=>!edges.includes(id)),
    addedActions:steps.filter(step=>!oldSteps.some(old=>same(step,old))),
    removedActions:oldSteps.filter(old=>!steps.some(step=>same(step,old))),reorderedEdgeIds,
  };
}
