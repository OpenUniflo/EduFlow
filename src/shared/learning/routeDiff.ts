import { actionScopeKey, sameActionScope, isNodeScope, executionEdgeIds, type RouteActionChoice } from './routeExecution';
/** Compare membership and local Action order for both scopes, without fake endpoints. */
export function routeDiff(current:{selectedNodeIds:readonly string[];executionSteps?:readonly RouteActionChoice[]},next:{selectedNodeIds:readonly string[];executionSteps?:readonly RouteActionChoice[]}) {
  const oldSteps=current.executionSteps??[],steps=next.executionSteps??[];
  const oldEdges=executionEdgeIds(oldSteps),edges=executionEdgeIds(steps);
  const same=(a:RouteActionChoice,b:RouteActionChoice)=>sameActionScope(a,b)&&a.actionId===b.actionId;
  const scopes=[...new Map(steps.map(step=>[actionScopeKey(step),step])).values()];
  const reordered=scopes.filter(scope=>{
    const before=oldSteps.filter(step=>sameActionScope(step,scope)&&steps.some(next=>same(step,next))).map(step=>step.actionId);
    const after=steps.filter(step=>sameActionScope(step,scope)&&oldSteps.some(old=>same(step,old))).map(step=>step.actionId);
    return JSON.stringify(before)!==JSON.stringify(after);
  });
  return {
    addedNodeIds:next.selectedNodeIds.filter(id=>!current.selectedNodeIds.includes(id)),removedNodeIds:current.selectedNodeIds.filter(id=>!next.selectedNodeIds.includes(id)),
    addedEdgeIds:edges.filter(id=>!oldEdges.includes(id)),removedEdgeIds:oldEdges.filter(id=>!edges.includes(id)),
    addedActions:steps.filter(step=>!oldSteps.some(old=>same(step,old))),removedActions:oldSteps.filter(old=>!steps.some(step=>same(step,old))),
    reorderedEdgeIds:reordered.flatMap(scope=>isNodeScope(scope)?[]:[scope.edgeId]),reorderedNodeIds:reordered.flatMap(scope=>isNodeScope(scope)?[scope.nodeId]:[]),
  };
}
