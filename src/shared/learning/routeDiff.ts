import type { RouteSnapshot } from './routeVersion';
/** Shared comparison for Preview and immutable History, independent of display order. */
export function routeDiff(current: Pick<RouteSnapshot,'selectedNodeIds'|'executionSteps'>, next: Pick<RouteSnapshot,'selectedNodeIds'|'executionSteps'>) {
  const oldSteps=current.executionSteps??[],steps=next.executionSteps??[];
  return {
    addedNodeIds:next.selectedNodeIds.filter(id=>!current.selectedNodeIds.includes(id)),
    removedNodeIds:current.selectedNodeIds.filter(id=>!next.selectedNodeIds.includes(id)),
    addedEdgeIds:steps.filter(step=>!oldSteps.some(old=>old.edgeId===step.edgeId)).map(step=>step.edgeId),
    removedEdgeIds:oldSteps.filter(old=>!steps.some(step=>step.edgeId===old.edgeId)).map(step=>step.edgeId),
    changedActions:steps.filter(step=>oldSteps.some(old=>old.edgeId===step.edgeId&&old.actionId!==step.actionId)),
  };
}
