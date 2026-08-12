import {
  addBranch,
  getAutoEdgeHandles,
  getControlBranches,
  isControlNode,
  isEdgeSideHandle
} from "../domain/graphOperations";
import { getNodeKindLabel, getUniqueWorkflowName } from "../domain/workflowFactory";
import type { FlowEdge, FlowNode, NodePositionMap, RenameNodeResult, WorkflowDefinition } from "../domain/types";

export type EdgeConnection = {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export function replaceWorkflow(workflows: WorkflowDefinition[], workflow: WorkflowDefinition) {
  return workflows.map((item) => item.id === workflow.id ? workflow : item);
}

export function renameWorkflow(workflows: WorkflowDefinition[], workflowId: string, nextName: string) {
  const name = getUniqueWorkflowName(nextName, workflows, workflowId);
  return workflows.map((item) => item.id === workflowId ? { ...item, name } : item);
}

export function deleteCustomWorkflow(workflows: WorkflowDefinition[], workflowId: string) {
  const target = workflows.find((item) => item.id === workflowId);
  return !target?.id.startsWith("blank-") ? workflows : workflows.filter((item) => item.id !== workflowId);
}

export function renameNode(definition: WorkflowDefinition, nodeId: string, nextName: string): { definition: WorkflowDefinition; result: RenameNodeResult } {
  const normalizedName = nextName.trim();
  if (!normalizedName) return { definition, result: { ok: false, message: "名字不能为空。" } };
  const target = definition.nodes.find((item) => item.id === nodeId);
  if (!target) return { definition, result: { ok: false, message: "节点不存在。" } };
  if (target.kind === "system") return { definition, result: { ok: false, message: "Start / End 节点名字固定。" } };
  if (target.label === normalizedName && target.id === normalizedName) return { definition, result: { ok: true, name: normalizedName } };
  if (definition.nodes.some((item) => item.id !== nodeId && item.label === normalizedName)) {
    return { definition, result: { ok: false, message: "同一个画布中不能有两个同名节点。" } };
  }
  return {
    definition: {
      ...definition,
      nodes: definition.nodes.map((item) => item.id === nodeId ? { ...item, id: normalizedName, label: normalizedName, subtitle: `${getNodeKindLabel(item.kind)} / ${normalizedName}` } : item),
      edges: definition.edges.map((item) => ({ ...item, from: item.from === nodeId ? normalizedName : item.from, to: item.to === nodeId ? normalizedName : item.to })),
      runOrder: definition.runOrder.map((item) => item === nodeId ? normalizedName : item)
    },
    result: { ok: true, name: normalizedName }
  };
}

export function addNode(definition: WorkflowDefinition, candidate: FlowNode) {
  return { ...definition, nodes: [...definition.nodes, candidate] };
}

export function updateNode(definition: WorkflowDefinition, nodeId: string, updates: Partial<Pick<FlowNode, "subtitle" | "logic" | "reads" | "writes" | "code" | "codeReview" | "codeSnapshots" | "control">>) {
  return {
    ...definition,
    nodes: definition.nodes.map((item) => item.id === nodeId ? {
      ...item,
      ...updates,
      reads: updates.reads ? updates.reads.filter(Boolean) : item.reads,
      writes: updates.writes ? updates.writes.filter(Boolean) : item.writes
    } : item)
  };
}

export function deleteNode(definition: WorkflowDefinition, nodeId: string) {
  const target = definition.nodes.find((item) => item.id === nodeId);
  if (!target || target.kind === "system") return definition;
  const removedEdges = definition.edges.filter((item) => item.from === nodeId || item.to === nodeId).map((item) => item.id);
  return {
    ...definition,
    nodes: definition.nodes.filter((item) => item.id !== nodeId),
    edges: definition.edges.filter((item) => item.from !== nodeId && item.to !== nodeId),
    runOrder: definition.runOrder.filter((item) => item !== nodeId && !removedEdges.includes(item))
  };
}

export function addEdge(definition: WorkflowDefinition, candidate: FlowEdge) {
  return {
    ...definition,
    nodes: isControlNode(definition.nodes.find((item) => item.id === candidate.from))
      ? definition.nodes.map((item) => item.id === candidate.from ? { ...item, control: { branches: addBranch(getControlBranches(item, definition), candidate.label) } } : item)
      : definition.nodes,
    edges: [...definition.edges, candidate]
  };
}

export function reconnectEdge(definition: WorkflowDefinition, edgeId: string, connection: EdgeConnection) {
  if (!connection.source || !connection.target) return definition;
  const previous = definition.edges.find((item) => item.id === edgeId);
  if (!previous) return definition;
  const nextSource = connection.source;
  return {
    ...definition,
    nodes: definition.nodes.map((item) => {
      if (!isControlNode(item)) return item;
      const branches = getControlBranches(item, definition);
      if (item.id === previous.from && item.id !== nextSource) return { ...item, control: { branches: branches.filter((branch) => branch !== previous.label) } };
      if (item.id === nextSource) return { ...item, control: { branches: addBranch(branches, previous.label) } };
      return item;
    }),
    edges: definition.edges.map((item) => item.id === edgeId ? {
      ...item,
      from: nextSource,
      to: connection.target!,
      sourceHandle: isEdgeSideHandle(connection.sourceHandle) ? connection.sourceHandle : item.sourceHandle,
      targetHandle: isEdgeSideHandle(connection.targetHandle) ? connection.targetHandle : item.targetHandle
    } : item)
  };
}

export function deleteEdge(definition: WorkflowDefinition, edgeId: string) {
  const target = definition.edges.find((item) => item.id === edgeId);
  if (!target) return definition;
  return {
    ...definition,
    nodes: isControlNode(definition.nodes.find((item) => item.id === target.from))
      ? definition.nodes.map((item) => item.id === target.from ? { ...item, control: { branches: getControlBranches(item, definition).filter((branch) => branch !== target.label) } } : item)
      : definition.nodes,
    edges: definition.edges.filter((item) => item.id !== edgeId),
    runOrder: definition.runOrder.filter((item) => item !== edgeId)
  };
}

export function updateEdge(definition: WorkflowDefinition, edgeId: string, updates: Partial<Pick<FlowEdge, "label" | "sourceHandle" | "targetHandle">>) {
  const previous = definition.edges.find((item) => item.id === edgeId);
  const label = updates.label?.trim();
  return {
    ...definition,
    nodes: previous && label && isControlNode(definition.nodes.find((item) => item.id === previous.from))
      ? definition.nodes.map((item) => item.id === previous.from ? { ...item, control: { branches: getControlBranches(item, definition).map((branch) => branch === previous.label ? label : branch) } } : item)
      : definition.nodes,
    edges: definition.edges.map((item) => item.id === edgeId ? { ...item, ...updates, label: label ?? item.label } : item)
  };
}

export function updateControlBranch(definition: WorkflowDefinition, nodeId: string, branch: string, updates: { label?: string; target?: string }, positions: NodePositionMap) {
  const label = updates.label?.trim() || branch;
  return {
    ...definition,
    nodes: definition.nodes.map((item) => item.id === nodeId ? { ...item, control: { branches: getControlBranches(item, definition).map((candidate) => candidate === branch ? label : candidate) } } : item),
    edges: definition.edges.map((item) => {
      if (item.from !== nodeId || (item.label !== branch && item.sourceHandle !== branch)) return item;
      const next = { ...item, label, to: updates.target ?? item.to };
      return updates.target ? { ...next, ...getAutoEdgeHandles(next, definition, positions) } : next;
    })
  };
}

export function deleteControlBranch(definition: WorkflowDefinition, nodeId: string, branch: string) {
  const removedEdges = definition.edges.filter((item) => item.from === nodeId && (item.label === branch || item.sourceHandle === branch)).map((item) => item.id);
  return {
    ...definition,
    nodes: definition.nodes.map((item) => item.id === nodeId ? { ...item, control: { branches: getControlBranches(item, definition).filter((candidate) => candidate !== branch) } } : item),
    edges: definition.edges.filter((item) => !(item.from === nodeId && (item.label === branch || item.sourceHandle === branch))),
    runOrder: definition.runOrder.filter((item) => !removedEdges.includes(item))
  };
}
