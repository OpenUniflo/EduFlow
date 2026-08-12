import type { EdgeSide, FlowEdge, FlowNode, NodePositionMap, WorkflowDefinition } from "./types";

export const edgeSides: EdgeSide[] = ["top", "right", "bottom", "left"];

export function node(
  id: string,
  label: string,
  subtitle: string,
  kind: FlowNode["kind"],
  x: number,
  y: number,
  reads: string[],
  writes: string[],
  logic: string,
  control?: FlowNode["control"]
): FlowNode {
  return { id, label, subtitle, kind, x, y, reads, writes, logic, control };
}

export function systemNode(id: string, label: string, x: number, y: number): FlowNode {
  return { id, label, subtitle: "System", kind: "system", x, y, reads: [], writes: [], logic: "工作流系统节点。" };
}

export function edge(id: string, from: string, to: string, label = "next", sourceHandle?: string, targetHandle?: string): FlowEdge {
  return { id, from, to, label, kind: "normal", sourceHandle, targetHandle };
}

export function isEdgeSideHandle(value?: string | null): value is EdgeSide {
  return edgeSides.includes(value as EdgeSide);
}

export function isControlNode(node?: FlowNode) {
  return node?.kind === "router" || node?.kind === "loop";
}

export function addBranch(branches: string[], label: string) {
  return branches.includes(label) ? branches : [...branches, label];
}

export function getOppositeSide(side: EdgeSide): EdgeSide {
  if (side === "top") return "bottom";
  if (side === "bottom") return "top";
  if (side === "left") return "right";
  return "left";
}

export function getUniqueNodeName(baseName: string, nodes: FlowNode[]) {
  const base = baseName.trim() || "Node";
  const used = new Set(nodes.map((item) => item.label));
  if (!used.has(base)) return base;
  let index = 2;
  let candidate = `${base} ${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${base} ${index}`;
  }
  return candidate;
}

export function getControlBranches(node: FlowNode, definition?: WorkflowDefinition) {
  const configured = node.control?.branches.filter(Boolean);
  if (configured?.length) return configured;
  if (definition && isControlNode(node)) {
    const outgoingLabels = definition.edges
      .filter((item) => item.from === node.id)
      .map((item) => item.label)
      .filter((label) => label && label !== "next");
    return Array.from(new Set(outgoingLabels));
  }
  if (node.kind === "router") return ["search", "writing", "agent", "end"];
  if (node.kind === "loop") return ["continue", "end"];
  return [];
}

export function isControlOutletEdge(candidate: FlowEdge, definition?: WorkflowDefinition) {
  const source = definition?.nodes.find((item) => item.id === candidate.from);
  if (!isControlNode(source)) return false;
  const branches = getControlBranches(source!, definition);
  return branches.includes(candidate.label) || branches.includes(candidate.sourceHandle ?? "");
}

export function getNodeCanvasPosition(candidate: FlowNode, positions: NodePositionMap) {
  return positions[candidate.id] ?? { x: candidate.x, y: candidate.y };
}

export function getNodeCanvasSize(_candidate: FlowNode) {
  return { width: 132, height: 132 };
}

export function getAutoEdgeHandles(candidate: FlowEdge, definition: WorkflowDefinition, positions: NodePositionMap) {
  const source = definition.nodes.find((item) => item.id === candidate.from);
  const target = definition.nodes.find((item) => item.id === candidate.to);
  if (!source || !target) return { sourceHandle: candidate.sourceHandle ?? "right", targetHandle: candidate.targetHandle ?? "left" };
  const sourcePosition = getNodeCanvasPosition(source, positions);
  const targetPosition = getNodeCanvasPosition(target, positions);
  const sourceSize = getNodeCanvasSize(source);
  const targetSize = getNodeCanvasSize(target);
  const dx = targetPosition.x + targetSize.width / 2 - (sourcePosition.x + sourceSize.width / 2);
  const dy = targetPosition.y + targetSize.height / 2 - (sourcePosition.y + sourceSize.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { sourceHandle: dx >= 0 ? "right" as const : "left" as const, targetHandle: dx >= 0 ? "left" as const : "right" as const };
  }
  return { sourceHandle: dy >= 0 ? "bottom" as const : "top" as const, targetHandle: dy >= 0 ? "top" as const : "bottom" as const };
}
