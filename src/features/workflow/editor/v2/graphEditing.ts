import { sendTargetEdgeId } from "./sendProjection";
import type { EditorSnapshot } from "../../application/v2/editorHistory";

/** Place a disconnected addition before the end column without moving existing nodes. */
export function additionPosition(current: EditorSnapshot): { x: number; y: number } {
  const end = current.definition.nodes.find(node => node.type === "core.end");
  const endPoint = end ? current.editor.nodes[end.id] : undefined;
  const x = Math.max(80, (endPoint?.x ?? 640) - 280);
  let y = endPoint?.y ?? 160;
  // Conservative card footprint plus clearance, independent of selection/panels.
  const points = Object.values(current.editor.nodes);
  while (points.some(point => Math.abs(point.x - x) < 260 && Math.abs(point.y - y) < 220)) y += 220;
  return { x, y };
}

/** A canvas deletion, including all incident transitions, is one history transaction. */
export function removeCanvasElements(current: EditorSnapshot, nodeIds: string[], edgeIds: string[] = []): EditorSnapshot {
  const removedNodes = new Set(nodeIds);
  const removedEdges = new Set(edgeIds);
  for (const edge of current.definition.transitions) if (removedNodes.has(edge.from) || removedNodes.has(edge.to)) removedEdges.add(edge.id);
  return {
    definition: { ...current.definition, nodes: current.definition.nodes.filter(node => !removedNodes.has(node.id)).map(node=>node.type==="control.send"&&(removedNodes.has(String(node.config.target))||removedEdges.has(sendTargetEdgeId(node.id)))?{...node,config:{...node.config,target:""}}:node), transitions: current.definition.transitions.filter(edge => !removedEdges.has(edge.id)) },
    editor: { ...current.editor, nodes: Object.fromEntries(Object.entries(current.editor.nodes).filter(([id]) => !removedNodes.has(id))), edges: Object.fromEntries(Object.entries(current.editor.edges).filter(([id]) => !removedEdges.has(id))) },
  };
}
