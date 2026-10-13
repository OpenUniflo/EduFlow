import { createHash } from 'node:crypto';
import { routeStructure, type RouteConstraints, type RoutePlanningInput } from '../../src/shared/learning/routePlanning.js';
import { actionScopeKey, type RouteActionOption } from '../../src/shared/learning/routeExecution.js';
/** Relevant facts, capability states and executable alternatives, independent of presentation. */
export function routePreviewState(input: RoutePlanningInput, states: Record<string,unknown>[], constraints: RouteConstraints, baseVersionId: string|null, options: RouteActionOption[], decision?:unknown) {
 const structure=routeStructure(input,constraints);
 const relevant=new Set([...structure.nodeIds,...options.flatMap(option=>option.requiredCapabilityIds??[])]);
 return createHash('sha256').update(JSON.stringify({baseVersionId,structure,constraints,decision,currentNodeIds:input.currentNodeIds.filter(id=>relevant.has(id)).sort(),
   states:states.filter(row=>relevant.has(String(row.node_id))).map(row=>({nodeId:row.node_id,status:row.status})).sort((a,b)=>String(a.nodeId).localeCompare(String(b.nodeId))),
   options:[...options].sort((a,b)=>actionScopeKey(a).localeCompare(actionScopeKey(b))||a.actionId.localeCompare(b.actionId))
 })).digest('hex');
}
