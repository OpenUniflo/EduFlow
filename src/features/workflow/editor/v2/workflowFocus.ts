import type { WorkflowDefinitionV2, WorkflowEditorFocus } from "../../domain/v2/types";
import { graphAtPath } from "../../domain/v2/authoring";

/**
 * A Works relationship click may ask the independent editor to select one call
 * node. The route loads the current definition first; a node that no longer
 * exists (for example an old revision was opened) must fall back to the normal
 * editor instead of failing navigation.
 */
export function resolveWorkflowFocus(definition: WorkflowDefinitionV2, focus?: WorkflowEditorFocus): WorkflowEditorFocus | undefined {
  if (!focus || !focus.nodeId || !Array.isArray(focus.graphPath) || focus.graphPath.length > 8) return undefined;
  if (!focus.graphPath.every(segment => typeof segment === "string" && segment.length > 0 && segment.length <= 200)) return undefined;
  try {
    const graph = graphAtPath(definition, focus.graphPath);
    return graph.nodes.some(node => node.id === focus.nodeId) ? { nodeId: focus.nodeId, graphPath: [...focus.graphPath] } : undefined;
  } catch {
    return undefined;
  }
}
