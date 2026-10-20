import type { WorkflowDefinitionV2, WorkflowTransitionV2 } from "../../domain/v2/types";
export const sendTargetEdgeId = (id: string) => `view-send-target:${id}`;
/** A drawn relation projects Send.config.target; it is never persisted as a serial transition. */
export function sendTargetRelations(graph: WorkflowDefinitionV2): WorkflowTransitionV2[] {
  return graph.nodes.filter(node=>node.type==="control.send"&&typeof node.config.target==="string"&&graph.nodes.some(target=>target.id===node.config.target)).map(node=>({id:sendTargetEdgeId(node.id),from:node.id,outlet:"item",to:String(node.config.target)}));
}
