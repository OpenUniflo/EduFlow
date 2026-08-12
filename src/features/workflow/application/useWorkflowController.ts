import { useEffect, useMemo, useRef, useState } from "react";
import type { Connection } from "@xyflow/react";
import { addBranch, edge, getAutoEdgeHandles, getControlBranches, getNodeCanvasPosition, getNodeCanvasSize, getOppositeSide, isControlNode, isEdgeSideHandle } from "../domain/graphOperations";
import { createBlankWorkflow, createPaletteNode, getEdgeDefaults, getUniqueWorkflowName } from "../domain/workflowFactory";
import type { CreateNodePayload, EdgeSide, FlowEdge, FlowNode, NodePositionMap, RenameNodeResult, WorkflowDefinition } from "../domain/types";
import { addEdge, addNode, deleteControlBranch as removeControlBranch, deleteCustomWorkflow, deleteEdge, deleteNode, reconnectEdge, renameNode, renameWorkflow, replaceWorkflow, updateControlBranch as changeControlBranch, updateEdge, updateNode } from "../editor/workflowEditorOperations";
import type { PersistedRunHistory, PersistedStateValues, WorkflowPersistence } from "../repository/WorkflowPersistence";
import type { EnvironmentConfig, WorkflowRunRecord, WorkflowRuntime } from "../runtime/types";
import type { WorkflowCodeExporter } from "../editor/WorkflowCodeExporter";
import { canExecuteWorkflow, nextWorkflowStepIndex, resolveGeneratedWorkflow, WorkflowRunLifecycle } from "./WorkflowRunLifecycle";

export type WorkflowApplicationDependencies = {
  builtinWorkflows: WorkflowDefinition[];
  persistence: WorkflowPersistence;
  runtime: WorkflowRuntime;
  codeExporter: WorkflowCodeExporter;
  inferTemplateId(description: string): string;
  hydrationKey?: number;
};

export type UseWorkflowControllerOptions = {
  routeWorkflowId?: string;
  finalizeRunRecord(record: WorkflowRunRecord): WorkflowRunRecord;
  onRunCompleted(record: WorkflowRunRecord): void;
};

function stableStateValue(value: unknown) {
  if (value === undefined) return "__undefined__";
  if (!value || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value);
  try { return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort()); } catch { return String(value); }
}

export function useWorkflowController(dependencies: WorkflowApplicationDependencies, options: UseWorkflowControllerOptions) {
  const { builtinWorkflows, persistence, runtime } = dependencies;
  const { finalizeRunRecord, onRunCompleted, routeWorkflowId } = options;
  const [initialState] = useState(() => {
    const stored = persistence.readState();
    const settings = persistence.readSettings();
    const workflows = stored.workflows?.length ? stored.workflows : builtinWorkflows;
    const activeTemplateId = routeWorkflowId ?? stored.activeTemplateId ?? workflows[0]?.id;
    const activeTemplate = workflows.find((item) => item.id === activeTemplateId) ?? workflows[0] ?? builtinWorkflows[0];
    return {
      workflows,
      activeTemplateId: activeTemplate.id,
      workflowDescription: routeWorkflowId && routeWorkflowId !== stored.activeTemplateId ? activeTemplate.description : stored.workflowDescription ?? activeTemplate.description,
      schemaSaved: stored.schemaSaved ?? false,
      nodePositions: stored.nodePositions ?? {},
      stateValues: stored.stateValues ?? {},
      runHistory: stored.runHistory ?? {},
      settings
    };
  });
  const [workflows, setWorkflows] = useState(initialState.workflows);
  const [activeTemplateId, setActiveTemplateId] = useState(initialState.activeTemplateId);
  const [workflowDescription, setWorkflowDescription] = useState(initialState.workflowDescription);
  const [schemaSaved, setSchemaSaved] = useState(initialState.schemaSaved);
  const [nodePositions, setNodePositions] = useState<NodePositionMap>(initialState.nodePositions);
  const [stateValues, setStateValues] = useState<PersistedStateValues>(initialState.stateValues);
  const [runHistory, setRunHistory] = useState<PersistedRunHistory>(initialState.runHistory);
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>(initialState.settings.environments);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState(initialState.settings.activeEnvironmentId);
  const [runIndex, setRunIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const runLifecycleRef = useRef(new WorkflowRunLifecycle());
  const skipPersistenceEffectsRef = useRef(0);

  const activeTemplate = useMemo(
    () => (routeWorkflowId ? workflows.find((item) => item.id === routeWorkflowId) : undefined)
      ?? workflows.find((item) => item.id === activeTemplateId)
      ?? workflows[0]
      ?? builtinWorkflows[0],
    [activeTemplateId, builtinWorkflows, routeWorkflowId, workflows]
  );
  const routeTemplate = routeWorkflowId ? workflows.find((item) => item.id === routeWorkflowId) : undefined;
  const activeRunItem = runIndex >= 0 ? activeTemplate.runOrder[runIndex] ?? "" : "";
  const activeStateValues = useMemo(() => ({ ...runtime.createInitialState(), ...(stateValues[activeTemplate.id] ?? {}) }), [activeTemplate.id, runtime, stateValues]);
  const visibleStateValues = useMemo(() => runIndex < 0 || !activeRunItem ? activeStateValues : runtime.createStateSnapshot(activeTemplate, activeStateValues, runIndex), [activeRunItem, activeStateValues, activeTemplate, runIndex, runtime]);
  const updatedStateFields = useMemo(() => {
    if (runIndex < 0 || runIndex >= activeTemplate.runOrder.length - 1) return [];
    const previous = runIndex > 0 ? runtime.createStateSnapshot(activeTemplate, activeStateValues, runIndex - 1) : activeStateValues;
    return Array.from(new Set([...Object.keys(previous), ...Object.keys(visibleStateValues)])).filter((field) => stableStateValue(previous[field]) !== stableStateValue(visibleStateValues[field]));
  }, [activeStateValues, activeTemplate, runIndex, runtime, visibleStateValues]);
  const activeRunHistory = runHistory[activeTemplate.id] ?? [];

  useEffect(() => {
    if (!dependencies.hydrationKey) return;
    const stored = persistence.readState();
    const nextSettings = persistence.readSettings();
    const nextWorkflows = stored.workflows?.length ? stored.workflows : builtinWorkflows;
    const nextActiveTemplateId = routeWorkflowId ?? stored.activeTemplateId ?? nextWorkflows[0]?.id;
    const nextActiveTemplate = nextWorkflows.find((item) => item.id === nextActiveTemplateId) ?? nextWorkflows[0] ?? builtinWorkflows[0];
    skipPersistenceEffectsRef.current = 2;
    setWorkflows(nextWorkflows);
    setActiveTemplateId(nextActiveTemplate.id);
    setWorkflowDescription(stored.workflowDescription ?? nextActiveTemplate.description);
    setSchemaSaved(stored.schemaSaved ?? false);
    setNodePositions(stored.nodePositions ?? {});
    setStateValues(stored.stateValues ?? {});
    setRunHistory(stored.runHistory ?? {});
    setEnvironments(nextSettings.environments);
    setActiveEnvironmentId(nextSettings.activeEnvironmentId);
  }, [builtinWorkflows, dependencies.hydrationKey, persistence, routeWorkflowId]);

  useEffect(() => {
    if (!routeWorkflowId) return;
    const next = workflows.find((item) => item.id === routeWorkflowId);
    if (!next || next.id === activeTemplateId) return;
    setActiveTemplateId(next.id);
    setWorkflowDescription(next.description);
    setRunIndex(-1);
    setIsRunning(false);
    runLifecycleRef.current.stop();
    setNodePositions({});
  }, [activeTemplateId, routeWorkflowId, workflows]);

  useEffect(() => {
    if (skipPersistenceEffectsRef.current > 0) { skipPersistenceEffectsRef.current -= 1; return; }
    persistence.writeState({ workflows, activeTemplateId: activeTemplate.id, workflowDescription, schemaSaved, nodePositions, stateValues, runHistory });
  }, [activeTemplate.id, nodePositions, persistence, runHistory, schemaSaved, stateValues, workflowDescription, workflows]);

  useEffect(() => {
    if (skipPersistenceEffectsRef.current > 0) { skipPersistenceEffectsRef.current -= 1; return; }
    const safeEnvironments = environments.length ? environments : initialState.settings.environments;
    const safeActiveId = safeEnvironments.some((item) => item.id === activeEnvironmentId) ? activeEnvironmentId : safeEnvironments[0].id;
    persistence.writeSettings({ ...initialState.settings, environments: safeEnvironments, activeEnvironmentId: safeActiveId });
    if (safeActiveId !== activeEnvironmentId) setActiveEnvironmentId(safeActiveId);
  }, [activeEnvironmentId, environments, initialState.settings, persistence]);

  useEffect(() => {
    if (!isRunning) return;
    if (runIndex >= activeTemplate.runOrder.length - 1) {
      const existing = runHistory[activeTemplate.id] ?? [];
      const completed = runLifecycleRef.current.complete(runtime.createRunRecord(activeTemplate, activeStateValues, existing.length + 1), existing, onRunCompleted);
      if (completed) {
        setRunHistory((history) => ({ ...history, [activeTemplate.id]: completed.history }));
      }
      setIsRunning(false);
      return;
    }
    return runtime.scheduleNextStep(() => setRunIndex((value) => value + 1));
  }, [activeStateValues, activeTemplate, isRunning, onRunCompleted, runHistory, runIndex, runtime]);

  function updateActiveDefinition(update: (definition: WorkflowDefinition) => WorkflowDefinition) {
    setWorkflows((items) => replaceWorkflow(items, update(items.find((item) => item.id === activeTemplate.id) ?? activeTemplate)));
  }

  function switchTemplate(templateId: string) {
    const next = workflows.find((item) => item.id === templateId) ?? builtinWorkflows.find((item) => item.id === templateId) ?? builtinWorkflows[0];
    setActiveTemplateId(next.id);
    setWorkflowDescription(next.description);
    setRunIndex(-1);
    setIsRunning(false);
    runLifecycleRef.current.stop();
    setNodePositions({});
  }

  function createWorkflow() {
    const next = createBlankWorkflow(getUniqueWorkflowName("新建工作流", workflows));
    setWorkflows((items) => [next, ...items]);
    setActiveTemplateId(next.id);
    setWorkflowDescription(next.description);
    setSchemaSaved(false);
    setRunIndex(-1);
    setIsRunning(false);
    runLifecycleRef.current.stop();
    setNodePositions({});
    return next.id;
  }

  function removeWorkflow(workflowId: string) {
    const remaining = deleteCustomWorkflow(workflows, workflowId);
    if (remaining === workflows) return null;
    const fallback = remaining[0] ?? builtinWorkflows[0];
    setWorkflows(remaining.length ? remaining : [fallback]);
    if (activeTemplateId === workflowId) switchTemplate(fallback.id);
    return fallback.id;
  }

  function createCanvasNode(payload: CreateNodePayload) {
    const next = createPaletteNode(payload, activeTemplate.nodes.length, activeTemplate.nodes);
    updateActiveDefinition((definition) => addNode(definition, next));
    setNodePositions((items) => ({ ...items, [next.id]: { x: next.x, y: next.y } }));
    return next;
  }

  function quickAddCanvasNode(sourceId: string, side: EdgeSide, payload: Pick<CreateNodePayload, "label" | "kind">) {
    const source = activeTemplate.nodes.find((item) => item.id === sourceId);
    if (!source) return null;
    const draft = createPaletteNode(payload, activeTemplate.nodes.length, activeTemplate.nodes);
    const sourcePosition = getNodeCanvasPosition(source, nodePositions);
    const sourceSize = getNodeCanvasSize(source);
    const targetSize = getNodeCanvasSize(draft);
    const gap = 92;
    const centerX = sourcePosition.x + sourceSize.width / 2;
    const centerY = sourcePosition.y + sourceSize.height / 2;
    const position = side === "right" ? { x: sourcePosition.x + sourceSize.width + gap, y: centerY - targetSize.height / 2 }
      : side === "left" ? { x: sourcePosition.x - targetSize.width - gap, y: centerY - targetSize.height / 2 }
        : side === "bottom" ? { x: centerX - targetSize.width / 2, y: sourcePosition.y + sourceSize.height + gap }
          : { x: centerX - targetSize.width / 2, y: sourcePosition.y - targetSize.height - gap };
    const next = { ...draft, ...position };
    const label = isControlNode(source) ? `branch-${Date.now().toString().slice(-4)}` : getEdgeDefaults().label;
    const nextEdge = edge(`edge-${sourceId}-${next.id}-${Date.now()}`, sourceId, next.id, label, side, getOppositeSide(side));
    updateActiveDefinition((definition) => addEdge(addNode(definition, next), nextEdge));
    setNodePositions((items) => ({ ...items, [next.id]: position }));
    return next;
  }

  function renameCanvasNode(nodeId: string, name: string): RenameNodeResult {
    const outcome = renameNode(activeTemplate, nodeId, name);
    if (!outcome.result.ok) return outcome.result;
    const newName = outcome.result.name;
    updateActiveDefinition(() => outcome.definition);
    setNodePositions((items) => {
      if (!items[nodeId]) return items;
      const next: NodePositionMap = { ...items, [newName]: items[nodeId] };
      delete next[nodeId];
      return next;
    });
    return outcome.result;
  }

  function createCanvasEdge(connection: Connection) {
    if (!connection.source || !connection.target) return null;
    const source = activeTemplate.nodes.find((item) => item.id === connection.source);
    const label = isControlNode(source) ? `branch-${Date.now().toString().slice(-4)}` : getEdgeDefaults().label;
    const draft = edge(`edge-${connection.source}-${connection.target}-${Date.now()}`, connection.source, connection.target, label, isEdgeSideHandle(connection.sourceHandle) ? connection.sourceHandle : undefined, isEdgeSideHandle(connection.targetHandle) ? connection.targetHandle : undefined);
    const handles = draft.sourceHandle && draft.targetHandle ? { sourceHandle: draft.sourceHandle, targetHandle: draft.targetHandle } : getAutoEdgeHandles(draft, activeTemplate, nodePositions);
    const next = { ...draft, ...handles };
    updateActiveDefinition((definition) => addEdge(definition, next));
    return next;
  }

  function addControlBranch(nodeId: string) {
    const source = activeTemplate.nodes.find((item) => item.id === nodeId);
    if (!source) return null;
    const branches = getControlBranches(source, activeTemplate);
    const base = source.kind === "loop" ? (branches.includes("continue") ? "end" : "continue") : "branch";
    let label = base;
    let index = 1;
    while (branches.includes(label)) { index += 1; label = `${base}_${index}`; }
    const target = activeTemplate.nodes.find((item) => item.id === "end" && item.id !== nodeId) ?? activeTemplate.nodes.find((item) => item.id !== nodeId);
    if (!target) return null;
    const draft = edge(`edge-${nodeId}-${target.id}-${Date.now()}`, nodeId, target.id, label);
    const next = { ...draft, ...getAutoEdgeHandles(draft, activeTemplate, nodePositions) };
    updateActiveDefinition((definition) => addEdge(definition, next));
    return next;
  }

  function removeCanvasNode(nodeId: string) {
    updateActiveDefinition((definition) => deleteNode(definition, nodeId));
    setNodePositions((items) => { const next = { ...items }; delete next[nodeId]; return next; });
  }

  function generateWorkflowFromDescription(description = workflowDescription) {
    const generated = resolveGeneratedWorkflow(description, workflowDescription, dependencies.inferTemplateId);
    setWorkflowDescription(generated.description);
    const templateId = generated.templateId;
    setActiveTemplateId(templateId);
    setRunIndex(-1);
    setIsRunning(false);
    runLifecycleRef.current.stop();
    setNodePositions({});
    setSchemaSaved(true);
    return templateId;
  }

  function updateStateField(fieldName: string, value: unknown) {
    setStateValues((values) => ({ ...values, [activeTemplate.id]: { ...values[activeTemplate.id], [fieldName]: value } }));
    setSchemaSaved(false);
  }

  function runFlow() {
    if (!canExecuteWorkflow(schemaSaved)) return false;
    setRunIndex(0);
    setIsRunning(true);
    runLifecycleRef.current.start(activeTemplate.id, finalizeRunRecord);
    return true;
  }

  function stepFlow() {
    if (!canExecuteWorkflow(schemaSaved)) return false;
    setIsRunning(false);
    runLifecycleRef.current.stop();
    setRunIndex((value) => nextWorkflowStepIndex(value, activeTemplate.runOrder.length));
    return true;
  }

  function stopRun() { setIsRunning(false); runLifecycleRef.current.stop(); }

  return {
    workflows, activeTemplate, activeTemplateId, routeTemplate, workflowDescription, schemaSaved, nodePositions, codeExporter: dependencies.codeExporter,
    environments, activeEnvironmentId, runIndex, isRunning, activeRunItem, visibleStateValues, updatedStateFields,
    activeRunHistory, runHistory, stateValues,
    setWorkflowDescription, setSchemaSaved, setNodePositions, setActiveEnvironmentId,
    saveEnvironments(next: EnvironmentConfig[], activeId: string) { setEnvironments(next); setActiveEnvironmentId(activeId); },
    switchTemplate, createWorkflow, deleteWorkflow: removeWorkflow,
    renameWorkflow(name: string) { setWorkflows((items) => renameWorkflow(items, activeTemplate.id, name)); },
    createCanvasNode, quickAddCanvasNode, renameCanvasNode,
    createCanvasEdge,
    reconnectCanvasEdge(edgeId: string, connection: Connection) { updateActiveDefinition((definition) => reconnectEdge(definition, edgeId, connection)); },
    deleteCanvasEdge(edgeId: string) { updateActiveDefinition((definition) => deleteEdge(definition, edgeId)); },
    updateCanvasEdge(edgeId: string, updates: Partial<Pick<FlowEdge, "label" | "sourceHandle" | "targetHandle">>) { updateActiveDefinition((definition) => updateEdge(definition, edgeId, updates)); },
    updateCanvasNode(nodeId: string, updates: Partial<Pick<FlowNode, "subtitle" | "logic" | "reads" | "writes" | "code" | "codeReview" | "codeSnapshots" | "control">>) { updateActiveDefinition((definition) => updateNode(definition, nodeId, updates)); },
    updateControlBranch(nodeId: string, branch: string, updates: { label?: string; target?: string }) { updateActiveDefinition((definition) => changeControlBranch(definition, nodeId, branch, updates, nodePositions)); },
    addControlBranch,
    deleteControlBranch(nodeId: string, branch: string) { updateActiveDefinition((definition) => removeControlBranch(definition, nodeId, branch)); },
    deleteCanvasNode: removeCanvasNode, generateWorkflowFromDescription, updateStateField, runFlow, stepFlow, stopRun
  };
}

export type WorkflowController = ReturnType<typeof useWorkflowController>;
