import type { CapabilityModel, RouteConstraints } from './routePlanning';
import { isNodeScope, type RouteActionChoice } from './routeExecution';

/** Describe stale draft intent without mutating the adopted route or its history. */
export function routeModelChanges(model: CapabilityModel, constraints: RouteConstraints, choices: readonly RouteActionChoice[], edgeIds: readonly string[] = [], retainedNodeIds: readonly string[] = []) {
  const nodes = new Set(model.orderedNodeIds), edges = new Set(model.supportEdges.map(edge => edge.id));
  const nodeIds = [...new Set([...retainedNodeIds, ...constraints.includeNodeIds, ...constraints.excludeNodeIds, ...choices.flatMap(choice => isNodeScope(choice) ? [choice.nodeId] : [])])].filter(id => !nodes.has(id)).sort();
  const removedEdgeIds = [...new Set([...edgeIds, ...choices.flatMap(choice => isNodeScope(choice) ? [] : [choice.edgeId])])].filter(id => !edges.has(id)).sort();
  return { nodeIds, edgeIds: removedEdgeIds,
    constraints: {includeNodeIds:[...new Set([...constraints.includeNodeIds,...retainedNodeIds])].filter(id=>nodes.has(id)&&!constraints.excludeNodeIds.includes(id)).sort(),excludeNodeIds:constraints.excludeNodeIds.filter(id=>nodes.has(id))},
    choices: choices.filter(choice=>isNodeScope(choice)?nodes.has(choice.nodeId):edges.has(choice.edgeId)),
    selectedEdgeIds: edgeIds.filter(id=>edges.has(id)),
  };
}
