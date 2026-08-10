import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type Connection } from "@xyflow/react";
import { Navigate, Route as RouterRoute, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { NavigationProvider } from "./contexts/NavigationContext";
import { WorkflowProvider } from "./contexts/WorkflowContext";
import {
  type BottomTab,
  type ConfigTarget,
  type CreateNodePayload,
  type EdgeSide,
  type EnvironmentConfig,
  type FlowEdge,
  type FlowNode,
  type MockSession,
  type PersistedAppState,
  type PersistedRunHistory,
  type PersistedStateValues,
  type RenameNodeResult,
  type Selection,
  type StateTab,
  type Template,
  type WorkflowViewMode,
  addBranch,
  createBlankWorkflow,
  createPaletteNode,
  createRuntimeStateSnapshot,
  createWorkflowRunRecord,
  edge,
  getDefaultStateValues,
  getAutoEdgeHandles,
  getControlBranches,
  getEdgeDefaults,
  getNodeCanvasPosition,
  getNodeCanvasSize,
  getNodeKindLabel,
  getOppositeSide,
  getUniqueWorkflowName,
  inferTemplateIdFromDescription,
  isControlNode,
  isEdgeSideHandle,
  mergeBuiltinWorkflows,
  readMockSession,
  readStoredMockSettings,
  readStoredAppState,
  sessionStorageKey,
  settingsStorageKey,
  storageKey,
  templates
} from "./app/model";
import {
  AuthPage,
  Canvas,
  CodeModal,
  ConfigPopover,
  Inspector,
  NotFoundPage,
  PlaceholderShell,
  RunHistoryDetail,
  RunPanel,
  Topbar
} from "./components/app";
import { AtlasHome } from "./v2/pages/AtlasHome";
import { CourseCenterPage } from "./v2/pages/CoursePages";
import { CourseGraphPage } from "./v2/pages/CourseGraphPage";
import { LessonPage } from "./v2/pages/LessonPage";
import { WorkflowLibraryPage } from "./v2/pages/WorkflowLibraryPage";
import { ProfileKnowledgePage } from "./v2/pages/ProfileKnowledgePage";
import { GlobalNav } from "./v2/components/GlobalNav";
import { applicationServices } from "./v2/services/applicationServices";
import { completeAssignment, workflowLaunchContextFromLocation } from "./v2/progress/progressService";
import { DomainManagementPage } from "./v2/admin/domains/DomainManagementPage";
import { canManageKnowledgeDomains } from "./v2/session/capabilities";

const courseRepository = applicationServices.courseRepository;

function stableStateValue(value: unknown) {
  if (value === undefined) return "__undefined__";
  if (!value || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value);

  try {
    return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
  } catch {
    return String(value);
  }
}

function getAuthRedirect(state: unknown) {
  if (!state || typeof state !== "object" || !("from" in state)) return "/";
  const from = (state as { from?: unknown }).from;
  if (!from || typeof from !== "object" || !("pathname" in from)) return "/";
  const pathname = String((from as { pathname: unknown }).pathname);
  const search = "search" in from ? String((from as { search?: unknown }).search ?? "") : "";
  return `${pathname}${search}`;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const workflowMatch = useMatch("/workflows/:workflowId");
  const routeWorkflowId = workflowMatch?.params.workflowId;

  const [initialState] = useState(() => {
    const stored = readStoredAppState();
    const settings = readStoredMockSettings();
    const workflows = mergeBuiltinWorkflows(stored.workflows);
    const activeTemplateId = routeWorkflowId ?? stored.activeTemplateId ?? "showcase";
    const activeTemplate = workflows.find((item) => item.id === activeTemplateId) ?? workflows[0] ?? templates[0];
    const workflowDescription =
      routeWorkflowId && routeWorkflowId !== stored.activeTemplateId
        ? activeTemplate.description
        : stored.workflowDescription ?? activeTemplate.description;

    return {
      workflows,
      activeTemplateId: activeTemplate.id,
      workflowDescription,
      schemaSaved: stored.schemaSaved ?? false,
      nodePositions: stored.nodePositions ?? {},
      stateValues: stored.stateValues ?? {},
      runHistory: stored.runHistory ?? {},
      settings
    };
  });
  const [session, setSession] = useState<MockSession | null>(() => readMockSession());
  const [workflows, setWorkflows] = useState<Template[]>(initialState.workflows);
  const [activeTemplateId, setActiveTemplateId] = useState(initialState.activeTemplateId);
  const [workflowDescription, setWorkflowDescription] = useState(initialState.workflowDescription);
  const [selection, setSelection] = useState<Selection>({ type: "state" });
  const [configTarget, setConfigTarget] = useState<ConfigTarget | null>(null);
  const [schemaSaved, setSchemaSaved] = useState(initialState.schemaSaved);
  const [stateTab, setStateTab] = useState<StateTab>("Schema");
  const [bottomOpen, setBottomOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomTab>("运行结果");
  const [runIndex, setRunIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [layoutPulse, setLayoutPulse] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [workflowViewMode, setWorkflowViewMode] = useState<WorkflowViewMode>("gallery");
  const [draggingPaletteNode, setDraggingPaletteNode] = useState<CreateNodePayload | null>(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>(initialState.nodePositions);
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>(initialState.settings.environments);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState(initialState.settings.activeEnvironmentId);
  const [stateValues, setStateValues] = useState<PersistedStateValues>(initialState.stateValues);
  const [runHistory, setRunHistory] = useState<PersistedRunHistory>(initialState.runHistory);
  const [selectedRunHistoryId, setSelectedRunHistoryId] = useState<string | null>(null);
  const activeRunSessionRef = useRef<string | null>(null);

  const activeTemplate = useMemo(
    () => (routeWorkflowId ? workflows.find((item) => item.id === routeWorkflowId) : undefined) ?? workflows.find((item) => item.id === activeTemplateId) ?? workflows[0] ?? templates[0],
    [activeTemplateId, routeWorkflowId, workflows]
  );
  const routeTemplate = routeWorkflowId ? workflows.find((item) => item.id === routeWorkflowId) : undefined;
  const activeRunItem = runIndex >= 0 ? activeTemplate.runOrder[runIndex] ?? "" : "";
  const activeStateValues = useMemo(() => ({ ...getDefaultStateValues(), ...(stateValues[activeTemplate.id] ?? {}) }), [activeTemplate.id, stateValues]);
  const visibleStateValues = useMemo(() => {
    if (runIndex < 0 || !activeRunItem) return activeStateValues;
    return createRuntimeStateSnapshot(activeTemplate, activeStateValues, runIndex);
  }, [activeRunItem, activeStateValues, activeTemplate, runIndex]);
  const updatedStateFields = useMemo(() => {
    if (runIndex < 0 || runIndex >= activeTemplate.runOrder.length - 1) return [];
    const previousState = runIndex > 0 ? createRuntimeStateSnapshot(activeTemplate, activeStateValues, runIndex - 1) : activeStateValues;
    const fields = new Set([...Object.keys(previousState), ...Object.keys(visibleStateValues)]);
    return Array.from(fields).filter((field) => stableStateValue(previousState[field]) !== stableStateValue(visibleStateValues[field]));
  }, [activeStateValues, activeTemplate, runIndex, visibleStateValues]);
  const activeRunHistory = runHistory[activeTemplate.id] ?? [];
  const allCourseAssignments = useMemo(() => courseRepository.listCourseRuntimes().flatMap((runtime) => runtime.assignments), []);
  const selectedRunHistory = activeRunHistory.find((item) => item.id === selectedRunHistoryId) ?? null;
  const configNode = configTarget?.type === "node" ? activeTemplate.nodes.find((item) => item.id === configTarget.id) : undefined;
  const configEdge = configTarget?.type === "edge" ? activeTemplate.edges.find((item) => item.id === configTarget.id) : undefined;

  useEffect(() => {
    if (!routeWorkflowId) return;
    const nextTemplate = workflows.find((item) => item.id === routeWorkflowId);
    if (!nextTemplate || nextTemplate.id === activeTemplateId) return;
    setActiveTemplateId(nextTemplate.id);
    setWorkflowDescription(nextTemplate.description);
    setSelection({ type: "workflow" });
    setConfigTarget(null);
    setRunIndex(-1);
    setIsRunning(false);
    activeRunSessionRef.current = null;
    setSelectedRunHistoryId(null);
    setBottomOpen(false);
    setNodePositions({});
  }, [activeTemplateId, routeWorkflowId, workflows]);

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        workflows,
        activeTemplateId: activeTemplate.id,
        workflowDescription,
        schemaSaved,
        nodePositions,
        stateValues,
        runHistory
      } satisfies PersistedAppState)
    );
  }, [activeTemplate.id, nodePositions, runHistory, schemaSaved, stateValues, workflowDescription, workflows]);

  useEffect(() => {
    const safeEnvironments = environments.length ? environments : initialState.settings.environments;
    const safeActiveId = safeEnvironments.some((item) => item.id === activeEnvironmentId) ? activeEnvironmentId : safeEnvironments[0].id;
    const settings = readStoredMockSettings();
    window.localStorage.setItem(
      settingsStorageKey,
      JSON.stringify({
        ...settings,
        environments: safeEnvironments,
        activeEnvironmentId: safeActiveId
      })
    );
    if (safeActiveId !== activeEnvironmentId) {
      setActiveEnvironmentId(safeActiveId);
    }
  }, [activeEnvironmentId, environments, initialState.settings.environments]);

  useEffect(() => {
    if (!isRunning) return;

    if (runIndex >= activeTemplate.runOrder.length - 1) {
      const runSessionId = activeRunSessionRef.current;
      if (runSessionId) {
        setRunHistory((history) => {
          const existing = history[activeTemplate.id] ?? [];
          if (existing.some((item) => item.id === runSessionId)) return history;
          const launchContext = workflowLaunchContextFromLocation(activeTemplate.id, location.search);
          const record = {
            ...createWorkflowRunRecord(activeTemplate, activeStateValues, existing.length + 1, launchContext ?? undefined),
            id: runSessionId
          };
          return {
            ...history,
            [activeTemplate.id]: [record, ...existing].slice(0, 20)
          };
        });
        const launchContext = workflowLaunchContextFromLocation(activeTemplate.id, location.search);
        if (launchContext && session) completeAssignment({ userId: session.email, courseId: launchContext.courseId, assignmentId: launchContext.assignmentId });
        activeRunSessionRef.current = null;
      }
      setIsRunning(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setRunIndex((value) => value + 1);
    }, 760);

    return () => window.clearTimeout(timer);
  }, [activeStateValues, activeTemplate, isRunning, location.search, runIndex, session]);

  useEffect(() => {
    if (!draggingPaletteNode) return;

    function clearDraggingNode() {
      window.setTimeout(() => setDraggingPaletteNode(null), 0);
    }

    window.addEventListener("mouseup", clearDraggingNode);
    return () => window.removeEventListener("mouseup", clearDraggingNode);
  }, [draggingPaletteNode]);

  function switchTemplate(templateId: string) {
    const nextTemplate = workflows.find((item) => item.id === templateId) ?? templates.find((item) => item.id === templateId) ?? templates[0];
    setActiveTemplateId(templateId);
    setWorkflowDescription(nextTemplate.description);
    setSelection({ type: "workflow" });
    setConfigTarget(null);
    setRunIndex(-1);
    setIsRunning(false);
    activeRunSessionRef.current = null;
    setSelectedRunHistoryId(null);
    setBottomOpen(false);
    setNodePositions({});
  }

  function openWorkflow(templateId: string) {
    switchTemplate(templateId);
    navigate(`/workflows/${templateId}`);
  }

  function openCourses() {
    navigate("/courses");
  }

  function openProfile() {
    navigate("/profile");
  }

  function createWorkflow() {
    const nextWorkflow = createBlankWorkflow(getUniqueWorkflowName("新建工作流", workflows));
    setWorkflows((items) => [nextWorkflow, ...items]);
    setActiveTemplateId(nextWorkflow.id);
    setWorkflowDescription(nextWorkflow.description);
    setSchemaSaved(false);
    setStateTab("Schema");
    setSelection({ type: "workflow" });
    setConfigTarget(null);
    setRunIndex(-1);
    setIsRunning(false);
    activeRunSessionRef.current = null;
    setSelectedRunHistoryId(null);
    setBottomOpen(false);
    setNodePositions({});
    navigate(`/workflows/${nextWorkflow.id}`);
  }

  function renameActiveWorkflow(nextName: string) {
    const uniqueName = getUniqueWorkflowName(nextName, workflows, activeTemplate.id);
    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              name: uniqueName
            }
          : item
      )
    );
  }

  function createCanvasNode(payload: CreateNodePayload) {
    const currentNodeCount = activeTemplate.nodes.length;
    const nextNode = createPaletteNode(payload, currentNodeCount, activeTemplate.nodes);
    setDraggingPaletteNode(null);
    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: [...item.nodes, nextNode]
            }
          : item
      )
    );
    setNodePositions((items) => ({ ...items, [nextNode.id]: { x: nextNode.x, y: nextNode.y } }));
    setSelection({ type: "node", id: nextNode.id });
    setConfigTarget(null);
  }

  function quickAddCanvasNode(sourceId: string, side: EdgeSide, payload: Pick<CreateNodePayload, "label" | "kind">) {
    const sourceNode = activeTemplate.nodes.find((item) => item.id === sourceId);
    if (!sourceNode) return;

    const draftNode = createPaletteNode(payload, activeTemplate.nodes.length, activeTemplate.nodes);
    const sourcePosition = getNodeCanvasPosition(sourceNode, nodePositions);
    const sourceSize = getNodeCanvasSize(sourceNode);
    const targetSize = getNodeCanvasSize(draftNode);
    const gap = 92;
    const centerX = sourcePosition.x + sourceSize.width / 2;
    const centerY = sourcePosition.y + sourceSize.height / 2;
    const nextPosition =
      side === "right"
        ? { x: sourcePosition.x + sourceSize.width + gap, y: centerY - targetSize.height / 2 }
        : side === "left"
          ? { x: sourcePosition.x - targetSize.width - gap, y: centerY - targetSize.height / 2 }
          : side === "bottom"
            ? { x: centerX - targetSize.width / 2, y: sourcePosition.y + sourceSize.height + gap }
            : { x: centerX - targetSize.width / 2, y: sourcePosition.y - targetSize.height - gap };
    const nextNode = {
      ...draftNode,
      x: nextPosition.x,
      y: nextPosition.y
    };
    const edgeLabel = sourceNode.kind === "router" || sourceNode.kind === "loop" ? `branch-${Date.now().toString().slice(-4)}` : getEdgeDefaults().label;
    const nextEdge = edge(
      `edge-${sourceId}-${nextNode.id}-${Date.now()}`,
      sourceId,
      nextNode.id,
      edgeLabel,
      side,
      getOppositeSide(side)
    );

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: [
                ...item.nodes.map((nodeItem) =>
                  nodeItem.id === sourceId && isControlNode(nodeItem)
                    ? {
                        ...nodeItem,
                        control: {
                          branches: addBranch(getControlBranches(nodeItem, item), edgeLabel)
                        }
                      }
                    : nodeItem
                ),
                nextNode
              ],
              edges: [...item.edges, nextEdge]
            }
          : item
      )
    );
    setNodePositions((items) => ({ ...items, [nextNode.id]: nextPosition }));
    setSelection({ type: "node", id: nextNode.id });
    setConfigTarget({ type: "node", id: nextNode.id });
  }

  function renameCanvasNode(nodeId: string, nextName: string): RenameNodeResult {
    const normalizedName = nextName.trim();
    if (!normalizedName) {
      return { ok: false, message: "名字不能为空。" };
    }

    const targetNode = activeTemplate.nodes.find((item) => item.id === nodeId);
    if (!targetNode) {
      return { ok: false, message: "节点不存在。" };
    }
    if (targetNode.kind === "system") {
      return { ok: false, message: "Start / End 节点名字固定。" };
    }
    if (targetNode.label === normalizedName && targetNode.id === normalizedName) {
      return { ok: true, name: normalizedName };
    }

    const duplicated = activeTemplate.nodes.some((item) => item.id !== nodeId && item.label === normalizedName);
    if (duplicated) {
      return { ok: false, message: "同一个画布中不能有两个同名节点。" };
    }

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: item.nodes.map((nodeItem) =>
                nodeItem.id === nodeId
                  ? {
                      ...nodeItem,
                      id: normalizedName,
                      label: normalizedName,
                      subtitle: `${getNodeKindLabel(nodeItem.kind)} / ${normalizedName}`
                    }
                  : nodeItem
              ),
              edges: item.edges.map((edgeItem) => ({
                ...edgeItem,
                from: edgeItem.from === nodeId ? normalizedName : edgeItem.from,
                to: edgeItem.to === nodeId ? normalizedName : edgeItem.to
              })),
              runOrder: item.runOrder.map((runItem) => (runItem === nodeId ? normalizedName : runItem))
            }
          : item
      )
    );
    setNodePositions((items) => {
      const next = { ...items };
      if (next[nodeId]) {
        next[normalizedName] = next[nodeId];
        delete next[nodeId];
      }
      return next;
    });
    setSelection((current) => (current.type === "node" && current.id === nodeId ? { type: "node", id: normalizedName } : current));
    setConfigTarget((current) => (current?.type === "node" && current.id === nodeId ? { type: "node", id: normalizedName } : current));

    return { ok: true, name: normalizedName };
  }

  function createCanvasEdge(connection: Connection) {
    if (!connection.source || !connection.target) return;

    const sourceNode = activeTemplate.nodes.find((item) => item.id === connection.source);
    const label = sourceNode && (sourceNode.kind === "router" || sourceNode.kind === "loop") ? `branch-${Date.now().toString().slice(-4)}` : getEdgeDefaults().label;
    const draftEdge = edge(
      `edge-${connection.source}-${connection.target}-${Date.now()}`,
      connection.source,
      connection.target,
      label,
      isEdgeSideHandle(connection.sourceHandle) ? connection.sourceHandle : undefined,
      isEdgeSideHandle(connection.targetHandle) ? connection.targetHandle : undefined
    );
    const handles =
      draftEdge.sourceHandle && draftEdge.targetHandle
        ? { sourceHandle: draftEdge.sourceHandle, targetHandle: draftEdge.targetHandle }
        : getAutoEdgeHandles(draftEdge, activeTemplate, nodePositions);
    const nextEdge = {
      ...draftEdge,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle
    };

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: isControlNode(item.nodes.find((nodeItem) => nodeItem.id === nextEdge.from))
                ? item.nodes.map((nodeItem) =>
                    nodeItem.id === nextEdge.from
                      ? {
                          ...nodeItem,
                          control: {
                            branches: addBranch(getControlBranches(nodeItem, item), nextEdge.label)
                          }
                        }
                      : nodeItem
                  )
                : item.nodes,
              edges: [...item.edges, nextEdge]
            }
          : item
      )
    );
    setSelection({ type: "edge", id: nextEdge.id });
    setConfigTarget(null);
  }

  function reconnectCanvasEdge(edgeId: string, connection: Connection) {
    if (!connection.source || !connection.target) return;

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? (() => {
              const previousEdge = item.edges.find((edgeItem) => edgeItem.id === edgeId);
              const nextSource = connection.source!;
              const nextEdges = item.edges.map((edgeItem) =>
                edgeItem.id === edgeId
                  ? {
                      ...edgeItem,
                      from: nextSource,
                      to: connection.target!,
                      sourceHandle: isEdgeSideHandle(connection.sourceHandle) ? connection.sourceHandle : edgeItem.sourceHandle,
                      targetHandle: isEdgeSideHandle(connection.targetHandle) ? connection.targetHandle : edgeItem.targetHandle
                    }
                  : edgeItem
              );

              return {
                ...item,
                nodes: previousEdge
                  ? item.nodes.map((nodeItem) => {
                      if (!isControlNode(nodeItem)) return nodeItem;

                      const branches = getControlBranches(nodeItem, item);
                      if (nodeItem.id === previousEdge.from && nodeItem.id !== nextSource) {
                        return {
                          ...nodeItem,
                          control: {
                            branches: branches.filter((branch) => branch !== previousEdge.label)
                          }
                        };
                      }
                      if (nodeItem.id === nextSource) {
                        return {
                          ...nodeItem,
                          control: {
                            branches: addBranch(branches, previousEdge.label)
                          }
                        };
                      }
                      return nodeItem;
                    })
                  : item.nodes,
                edges: nextEdges
              };
            })()
          : item
      )
    );
    setSelection({ type: "edge", id: edgeId });
  }

  function deleteCanvasEdge(edgeId: string) {
    const edgeToDelete = activeTemplate.edges.find((item) => item.id === edgeId);
    if (!edgeToDelete) return;

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: isControlNode(item.nodes.find((nodeItem) => nodeItem.id === edgeToDelete.from))
                ? item.nodes.map((nodeItem) =>
                    nodeItem.id === edgeToDelete.from
                      ? {
                          ...nodeItem,
                          control: {
                            branches: getControlBranches(nodeItem, item).filter((branch) => branch !== edgeToDelete.label)
                          }
                        }
                      : nodeItem
                  )
                : item.nodes,
              edges: item.edges.filter((edgeItem) => edgeItem.id !== edgeId),
              runOrder: item.runOrder.filter((runItem) => runItem !== edgeId)
            }
          : item
      )
    );
    setSelection({ type: "workflow" });
    setConfigTarget(null);
  }

  function updateCanvasEdge(edgeId: string, updates: Partial<Pick<FlowEdge, "label" | "sourceHandle" | "targetHandle">>) {
    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? (() => {
              const previousEdge = item.edges.find((edgeItem) => edgeItem.id === edgeId);
              const nextLabel = updates.label?.trim();
              return {
                ...item,
                nodes:
                  previousEdge && nextLabel && isControlNode(item.nodes.find((nodeItem) => nodeItem.id === previousEdge.from))
                    ? item.nodes.map((nodeItem) =>
                        nodeItem.id === previousEdge.from
                          ? {
                              ...nodeItem,
                              control: {
                                branches: getControlBranches(nodeItem, item).map((branch) => (branch === previousEdge.label ? nextLabel : branch))
                              }
                            }
                          : nodeItem
                      )
                    : item.nodes,
                edges: item.edges.map((edgeItem) =>
                  edgeItem.id === edgeId
                    ? {
                        ...edgeItem,
                        ...updates,
                        label: nextLabel ?? edgeItem.label
                      }
                    : edgeItem
                )
              };
            })()
          : item
      )
    );
  }

  function updateCanvasNode(nodeId: string, updates: Partial<Pick<FlowNode, "subtitle" | "logic" | "reads" | "writes" | "code" | "codeReview" | "codeSnapshots" | "control">>) {
    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: item.nodes.map((nodeItem) =>
                nodeItem.id === nodeId
                  ? {
                      ...nodeItem,
                      ...updates,
                      reads: updates.reads ? updates.reads.filter(Boolean) : nodeItem.reads,
                      writes: updates.writes ? updates.writes.filter(Boolean) : nodeItem.writes
                    }
                  : nodeItem
              )
            }
          : item
      )
    );
  }

  function updateControlBranch(nodeId: string, branch: string, updates: { label?: string; target?: string }) {
    const nextLabel = updates.label?.trim() || branch;
    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: item.nodes.map((nodeItem) =>
                nodeItem.id === nodeId
                  ? {
                      ...nodeItem,
                      control: {
                        branches: getControlBranches(nodeItem, item).map((candidate) => (candidate === branch ? nextLabel : candidate))
                      }
                    }
                  : nodeItem
              ),
              edges: item.edges.map((edgeItem) =>
                edgeItem.from === nodeId && (edgeItem.label === branch || edgeItem.sourceHandle === branch)
                  ? (() => {
                      const nextEdge = {
                        ...edgeItem,
                        label: nextLabel,
                        to: updates.target ?? edgeItem.to
                      };
                      if (!updates.target) return nextEdge;

                      const handles = getAutoEdgeHandles(nextEdge, item, nodePositions);
                      return {
                        ...nextEdge,
                        sourceHandle: handles.sourceHandle,
                        targetHandle: handles.targetHandle
                      };
                    })()
                  : edgeItem
              )
            }
          : item
      )
    );
  }

  function addControlBranch(nodeId: string) {
    const sourceNode = activeTemplate.nodes.find((item) => item.id === nodeId);
    if (!sourceNode) return;

    const branches = getControlBranches(sourceNode, activeTemplate);
    const base = sourceNode.kind === "loop" ? (branches.includes("continue") ? "end" : "continue") : "branch";
    let index = 1;
    let label = base;
    while (branches.includes(label)) {
      index += 1;
      label = `${base}_${index}`;
    }
    const target = activeTemplate.nodes.find((item) => item.id === "end" && item.id !== nodeId) ?? activeTemplate.nodes.find((item) => item.id !== nodeId);
    if (!target) return;

    const draftEdge = edge(`edge-${nodeId}-${target.id}-${Date.now()}`, nodeId, target.id, label);
    const nextEdge = {
      ...draftEdge,
      ...getAutoEdgeHandles(draftEdge, activeTemplate, nodePositions)
    };
    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: item.nodes.map((nodeItem) =>
                nodeItem.id === nodeId
                  ? {
                      ...nodeItem,
                      control: {
                        branches: [...getControlBranches(nodeItem, item), label]
                      }
                    }
                  : nodeItem
              ),
              edges: [...item.edges, nextEdge]
            }
          : item
      )
    );
    setSelection({ type: "edge", id: nextEdge.id });
  }

  function deleteControlBranch(nodeId: string, branch: string) {
    const removedEdgeIds = activeTemplate.edges
      .filter((edgeItem) => edgeItem.from === nodeId && (edgeItem.label === branch || edgeItem.sourceHandle === branch))
      .map((edgeItem) => edgeItem.id);

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: item.nodes.map((nodeItem) =>
                nodeItem.id === nodeId
                  ? {
                      ...nodeItem,
                      control: {
                        branches: getControlBranches(nodeItem, item).filter((candidate) => candidate !== branch)
                      }
                    }
                  : nodeItem
              ),
              edges: item.edges.filter((edgeItem) => !(edgeItem.from === nodeId && (edgeItem.label === branch || edgeItem.sourceHandle === branch))),
              runOrder: item.runOrder.filter((runItem) => !removedEdgeIds.includes(runItem))
            }
          : item
      )
    );
  }

  function deleteCanvasNode(nodeId: string) {
    const nodeToDelete = activeTemplate.nodes.find((item) => item.id === nodeId);
    if (!nodeToDelete || nodeToDelete.kind === "system") return;
    const removedEdgeIds = activeTemplate.edges
      .filter((edgeItem) => edgeItem.from === nodeId || edgeItem.to === nodeId)
      .map((edgeItem) => edgeItem.id);

    setWorkflows((items) =>
      items.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              nodes: item.nodes.filter((nodeItem) => nodeItem.id !== nodeId),
              edges: item.edges.filter((edgeItem) => edgeItem.from !== nodeId && edgeItem.to !== nodeId),
              runOrder: item.runOrder.filter((runItem) => runItem !== nodeId && !removedEdgeIds.includes(runItem))
            }
          : item
      )
    );
    setNodePositions((items) => {
      const next = { ...items };
      delete next[nodeId];
      return next;
    });
    setSelection({ type: "workflow" });
    setConfigTarget(null);
  }

  function deleteWorkflow(workflowId: string) {
    const target = workflows.find((item) => item.id === workflowId);
    if (!target || !target.id.startsWith("blank-")) return;

    const remaining = workflows.filter((item) => item.id !== workflowId);
    const fallback = remaining[0] ?? templates[0];
    setWorkflows(remaining.length ? remaining : [fallback]);

    if (activeTemplateId === workflowId) {
      setActiveTemplateId(fallback.id);
      setWorkflowDescription(fallback.description);
      setSelection({ type: "workflow" });
      setConfigTarget(null);
      setRunIndex(-1);
      setIsRunning(false);
      activeRunSessionRef.current = null;
      setSelectedRunHistoryId(null);
      setBottomOpen(false);
      setNodePositions({});
    }
  }

  function returnHome() {
    setIsRunning(false);
    activeRunSessionRef.current = null;
    setSelectedRunHistoryId(null);
    setBottomOpen(false);
    setConfigTarget(null);
    setCodeModalOpen(false);
    navigate("/");
  }

  function logout() {
    window.localStorage.removeItem(sessionStorageKey);
    setSession(null);
    navigate("/login", { replace: true });
  }

  function generateWorkflowFromDescription(description = workflowDescription) {
    const nextDescription = description.trim() || workflowDescription;
    setWorkflowDescription(nextDescription);
    const nextTemplateId = inferTemplateIdFromDescription(nextDescription);
    setActiveTemplateId(nextTemplateId);
    setSchemaSaved(true);
    setStateTab("Schema");
    setSelection({ type: "workflow" });
    setConfigTarget(null);
    setRunIndex(-1);
    setIsRunning(false);
    activeRunSessionRef.current = null;
    setSelectedRunHistoryId(null);
    setBottomOpen(false);
    setNodePositions({});
    setLayoutPulse(true);
    window.setTimeout(() => setLayoutPulse(false), 720);
  }

  function updateStateField(fieldName: string, value: unknown) {
    setStateValues((values) => ({
      ...values,
      [activeTemplate.id]: {
        ...values[activeTemplate.id],
        [fieldName]: value
      }
    }));
    setSchemaSaved(false);
  }

  function runFlow() {
    if (!schemaSaved) {
      setSelection({ type: "state" });
      setStateTab("Schema");
      setRightCollapsed(false);
      return;
    }
    setBottomOpen(true);
    setActiveTab("执行轨迹");
    setStateTab("Schema");
    setRightCollapsed(false);
    setRunIndex(0);
    setIsRunning(true);
    activeRunSessionRef.current = `${activeTemplate.id}-${Date.now()}`;
  }

  function stepFlow() {
    if (!schemaSaved) {
      setSelection({ type: "state" });
      setStateTab("Schema");
      setRightCollapsed(false);
      return;
    }
    setBottomOpen(true);
    setActiveTab("执行轨迹");
    setStateTab("Schema");
    setRightCollapsed(false);
    setIsRunning(false);
    activeRunSessionRef.current = null;
    setRunIndex((value) => (value + 1 >= activeTemplate.runOrder.length ? 0 : value + 1));
  }

  function showCode() {
    setCodeModalOpen(true);
  }

  function autoLayout() {
    setLayoutPulse(true);
    window.setTimeout(() => setLayoutPulse(false), 720);
  }

  function completeAuth(nextSession: MockSession) {
    window.localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession));
    setSession(nextSession);
    navigate(getAuthRedirect(location.state), { replace: true });
  }

  function protectedElement(element: ReactNode) {
    return session ? element : <Navigate to="/login" replace state={{ from: location }} />;
  }

  const navigationContextValue = {
    onGoCourses: openCourses,
    onGoTasks: () => navigate("/"),
    onGoWorkflows: returnHome,
    onGoProfile: openProfile,
    onGoSettings: () => navigate("/settings"),
    onGoNotifications: () => navigate("/notifications"),
    onGoMessages: () => navigate("/messages"),
    onLogout: logout
  };

  const atlasHome = session ? <AtlasHome session={session} onLogout={logout} /> : null;

  const workflowLibrary = session ? (
    <WorkflowLibraryPage
      session={session}
      onLogout={logout}
      viewMode={workflowViewMode}
      workflows={workflows}
      activeTemplateId={activeTemplateId}
      onViewMode={setWorkflowViewMode}
      onOpenWorkflow={openWorkflow}
      onCreateWorkflow={createWorkflow}
      onDeleteWorkflow={deleteWorkflow}
    />
  ) : null;

  const coursesPage = session ? <CourseCenterPage session={session} onLogout={logout} /> : null;

  const courseDetailPage = session ? <CourseGraphPage session={session} onLogout={logout} /> : null;

  const lessonPage = session ? <LessonPage session={session} onLogout={logout} /> : null;

  const profilePage = session ? <ProfileKnowledgePage session={session} onLogout={logout} /> : null;
  const domainManagementPage = session ? <DomainManagementPage session={session} onLogout={logout} /> : null;

  const canvasPage = routeTemplate ? (
    <main className="app-shell atlas-canvas-shell">
      <div className="workspace-glow" aria-hidden="true" />
      {session ? <div className="atlas-canvas-nav"><GlobalNav active="workflows" session={session} onLogout={logout} /></div> : null}
      <Canvas
        template={activeTemplate}
        workflowDescription={workflowDescription}
        activeRunItem={activeRunItem}
        selection={selection}
        configTarget={configTarget}
        schemaSaved={schemaSaved}
        layoutPulse={layoutPulse}
        nodePositions={nodePositions}
        onNodePositions={setNodePositions}
        onSelect={setSelection}
        onOpenConfig={setConfigTarget}
        onCloseConfig={() => setConfigTarget(null)}
        onWorkflowDescription={setWorkflowDescription}
        onGenerateWorkflow={generateWorkflowFromDescription}
        onCreateNode={createCanvasNode}
        onCreateEdge={createCanvasEdge}
        onReconnectEdge={reconnectCanvasEdge}
        onQuickAddNode={quickAddCanvasNode}
        onUpdateNode={updateCanvasNode}
        draggingPaletteNode={draggingPaletteNode}
        onFinishNodeDrag={() => setDraggingPaletteNode(null)}
        onDeleteNode={deleteCanvasNode}
        onDeleteEdge={deleteCanvasEdge}
      />
      <Topbar
        template={activeTemplate}
        workflowName={activeTemplate.name}
        schemaSaved={schemaSaved}
        isRunning={isRunning}
        onBack={() => navigate("/workflows")}
        onRenameWorkflow={renameActiveWorkflow}
        onRun={runFlow}
        onStep={stepFlow}
        onShowCode={showCode}
        nodePositions={nodePositions}
        environments={environments}
        activeEnvironmentId={activeEnvironmentId}
        onSelectEnvironment={setActiveEnvironmentId}
        onSaveEnvironments={(nextEnvironments, nextActiveId) => {
          setEnvironments(nextEnvironments);
          setActiveEnvironmentId(nextActiveId);
        }}
      />

      <Inspector
        collapsed={rightCollapsed}
        onCollapsed={setRightCollapsed}
        activeTab={stateTab}
        onTab={setStateTab}
        schemaSaved={schemaSaved}
        template={activeTemplate}
        runIndex={runIndex}
        activeRunItem={activeRunItem}
        stateValues={visibleStateValues}
        updatedStateFields={updatedStateFields}
        runHistory={activeRunHistory}
        selectedRunHistoryId={selectedRunHistoryId}
        onOpenRunHistory={(run) => setSelectedRunHistoryId(run.id)}
        onStateFieldChange={updateStateField}
        onSaveSchema={() => setSchemaSaved(true)}
      />

      {selectedRunHistory && (
        <RunHistoryDetail key={selectedRunHistory.id} run={selectedRunHistory} onClose={() => setSelectedRunHistoryId(null)} />
      )}

      <ConfigPopover
        target={configTarget}
        node={configNode}
        edge={configEdge}
        activeRunItem={activeRunItem}
        onDeleteNode={deleteCanvasNode}
        onDeleteEdge={deleteCanvasEdge}
        onRenameNode={renameCanvasNode}
        onUpdateEdge={updateCanvasEdge}
        onUpdateNode={updateCanvasNode}
        onAddControlBranch={addControlBranch}
        onUpdateControlBranch={updateControlBranch}
        onDeleteControlBranch={deleteControlBranch}
        template={activeTemplate}
        activeEnvironment={environments.find((item) => item.id === activeEnvironmentId) ?? environments[0]}
        onClose={() => setConfigTarget(null)}
      />

      <CodeModal open={codeModalOpen} template={activeTemplate} onClose={() => setCodeModalOpen(false)} />

      <RunPanel
        open={bottomOpen}
        activeTab={activeTab}
        template={activeTemplate}
        runIndex={runIndex}
        onToggle={() => setBottomOpen((value) => !value)}
        onTab={setActiveTab}
      />
      {allCourseAssignments.some((item) => item.workflowTemplateId === activeTemplate.id) && activeRunHistory.length ? (
        <aside className="atlas-canvas-acceptance glass-v2">
          <div><strong>Demo Evaluation · 验收通过</strong><span>结构 92 · 行为 88 · 结果 90 · 轨迹 94</span></div>
          <div><span>模型调用 {Math.max(2, Math.round(activeTemplate.nodes.length / 2))}</span><span>工具调用 {activeTemplate.nodes.filter((item) => item.kind === "tool").length}</span><span>总分 91</span></div>
        </aside>
      ) : null}
    </main>
  ) : (
    <NotFoundPage onHome={returnHome} />
  );

  const authContextValue = {
    session,
    completeAuth,
    logout
  };
  const workflowContextValue = {
    workflows,
    activeTemplate,
    activeTemplateId,
    selection,
    schemaSaved,
    openWorkflow,
    createWorkflow,
    deleteWorkflow
  };
  return (
    <AuthProvider value={authContextValue}>
      <NavigationProvider value={navigationContextValue}>
        <WorkflowProvider value={workflowContextValue}>
          <Routes>
              <RouterRoute path="/login" element={session ? <Navigate to={getAuthRedirect(location.state)} replace /> : <AuthPage mode="login" />} />
              <RouterRoute path="/register" element={session ? <Navigate to={getAuthRedirect(location.state)} replace /> : <AuthPage mode="register" />} />
              <RouterRoute path="/" element={protectedElement(atlasHome)} />
              <RouterRoute path="/workflows" element={protectedElement(workflowLibrary)} />
              <RouterRoute path="/workflows/:workflowId" element={protectedElement(canvasPage)} />
              <RouterRoute path="/courses" element={protectedElement(coursesPage)} />
              <RouterRoute path="/courses/:courseId" element={protectedElement(courseDetailPage)} />
              <RouterRoute path="/courses/:courseId/materials/:materialId" element={protectedElement(lessonPage)} />
              <RouterRoute path="/courses/:courseId/chapters/:chapterId" element={protectedElement(courseDetailPage)} />
              <RouterRoute path="/tasks/*" element={<Navigate to="/" replace />} />
              <RouterRoute path="/profile" element={protectedElement(profilePage)} />
              <RouterRoute path="/admin/domains" element={canManageKnowledgeDomains(session) ? protectedElement(domainManagementPage) : <Navigate to="/" replace />} />
              <RouterRoute path="/profile/*" element={<Navigate to="/profile" replace />} />
              <RouterRoute path="/settings/*" element={<Navigate to="/" replace />} />
              <RouterRoute path="/notifications/*" element={<Navigate to="/" replace />} />
              <RouterRoute path="/messages/*" element={<Navigate to="/" replace />} />
              <RouterRoute path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </WorkflowProvider>
      </NavigationProvider>
    </AuthProvider>
  );
}
