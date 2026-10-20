import type { WorkflowPortPlacement } from "../../domain/v2/types";

type CanvasPorts = {
  outlets: string[];
  sources?: Record<string, WorkflowPortPlacement>;
  targets?: { id: string; placement?: WorkflowPortPlacement }[];
};

export function canvasPortSignature(data: CanvasPorts): string {
  return JSON.stringify([data.outlets, data.sources, data.targets]);
}

/** React Flow measures dynamic handles before edges may reference them. */
export function edgesWithMeasuredPorts<T extends { source: string; target: string }>(
  edges: T[], nodes: { id: string; data: CanvasPorts }[], ready: Record<string, string>,
): T[] {
  const signatures = new Map(nodes.map(node => [node.id, canvasPortSignature(node.data)]));
  return edges.filter(edge => signatures.has(edge.source) && signatures.has(edge.target)
    && ready[edge.source] === signatures.get(edge.source) && ready[edge.target] === signatures.get(edge.target));
}
