import { validateSchemaValue } from "../../domain/v2/validation";
import { executionObservation, runStatusLabels } from "./executionObservation";
import { NodeResponseForm, type ResponseDraft } from './NodeResponseForm';
import { initializeResponseDraft } from './responseDraft';
import { ReviewContext, reviewContextFacts } from './ReviewContext';
import { StartInputFields } from './StartInputFields';
import { ThreadRecoveryPanel } from './ThreadRecoveryPanel';
import { sendTargetEdgeId, sendTargetRelations } from "./sendProjection";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { subscribeApiAuthenticationFailure, type ApiAuthenticationFailure } from "@/shared/api/apiClient";
import { acknowledgeWorkflowSessionRecovery, peekWorkflowSessionRecovery, rejectRecoveredWorkflowSubmission, retainWorkflowSessionRecovery } from "./workflowSessionRecovery";
import { useBlocker, useBeforeUnload } from "react-router-dom";
import { Background, MiniMap, MarkerType, ReactFlow, ReactFlowProvider, type Connection, type Edge, type EdgeChange, type NodeChange, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Copy, Play, Plus, Square, Trash2, Undo2, Redo2, X, ChevronLeft, Braces, AlertTriangle, History, Settings2, Layers3, Download, ZoomIn, ZoomOut, Maximize, Map as MapIcon, MessageSquareText, MoreHorizontal, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { runSubmittedNotice, useWorkflowV2Controller, workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { environmentAvailability } from "../../application/v2/environmentAvailability";
import { AuthoringProcessing, NodeRuntimeFields } from "./AuthoringFields";
import { insertAuthoringNode } from "../../domain/v2/messageAuthoring";
import { RouterFields } from "./RouterFields";
import { GraphRuntimeFields } from "./GraphRuntimeFields";
import { GraphInterfaceFields } from "./GraphInterfaceFields";
import { scopedWorkflow } from "../../application/v2/scopedWorkflow";
import { authoringNodeTypes, createAuthoringNode, frontendCapabilities, graphAtPath, graphInNode, editorAtPath, nodeOutlets, nodeAuthoring, outletDisplayName } from "../../domain/v2/authoring";
import { createNodeV2 } from "../../domain/v2/factory";
import { nodeCardSummary } from "../../domain/v2/nodeSummary";
import type { Binding, EditorDocumentV2, JsonSchema, JsonValue, LlmConfigV2, VariableEnvironment, WorkflowConfiguration, WorkflowDefinitionV2, WorkflowDiagnostic, WorkflowDocumentV2, WorkflowLaunchContext, WorkflowNodeV2, WorkflowRevisionSummary, WorkflowRouting, WorkflowRunV2, WorkflowTool } from "../../domain/v2/types";
import { bindingSchema, executionPolicySchema, formatSchemaError, stateSchemaV2 } from "../../domain/v2/schema";
import { z } from "zod";
import { WorkflowDialog } from "./WorkflowDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { JsonField, JsonDraftProvider, type JsonDraftStore } from "./JsonField";
import { putValue } from "./SchemaForm";
import { RunPreparationDialog } from "./RunPreparationDialog";
import { RunInputSnapshot } from "./RunInputSnapshot";
import { InputReuseOmissions } from "./InputReuseOmissions";
import { reusableRunInput, runRevisionNotice, type RunInputReuseOmission } from "./runInputReuse";
import { SubgraphInvocationHistory } from "./SubgraphInvocationHistory";
import { stepInvocationIdentity, subgraphInvocations } from "./subgraphInvocations";
import { WorkflowOverview } from "./WorkflowOverview";
import { ModelStreamFeed } from "./ModelStreamFeed";
import { SessionHistoryWorkspace } from "./SessionHistoryWorkspace";
import { EnvironmentPanel } from "./EnvironmentPanel";
import { applyCapabilityBindings, connectionUpdates, unresolvedCapabilities } from "../../domain/v2/connectionReferences";
import { GRAPH_OUTPUT_NODE_ID, stateFieldConsumers, stateFieldProducers } from "../../domain/v2/dataFlow";
import { readOutputPointer } from "../../domain/v2/runData";
import { toolParamRows } from "../../domain/v2/toolParams";
import { NodeRunDataTab } from "./NodeRunDataTab";
import { useExtensions } from "./FunctionExecutionFields";
import { isRetiredNode } from "../../domain/v2/nodeVersions";
import { withRenamedNodeParams } from "../../domain/v2/promptAuthoring";
import { NodeDebugDialog } from "./NodeDebugDialog";
import { VariableEnvironmentSelect } from "./VariableEnvironmentSelect";
import { inputChromeWidth, measureInputTextWidth, workflowNameInputWidth } from "./workflowNameWidth";
import { historyRunBannerText, historyRunSelection } from "./historySelection";
import { handleWorkflowShortcut } from "./workflowShortcuts";
import { isFakeEndpointRef } from "../../resources/providerModel";
import { pruneOrphanStateFields, renameStateField, stateFieldInitial, withStateField, withStateFieldInitial, withStateFieldInput, withStateFieldSchema, withStateFieldWrite, withStateReducer, type StateFieldType } from "../../domain/v2/stateAuthoring";
import { nodeOutputItems, primaryToolOutput, stateTypeForOutput, structuredOutputFields } from "../../domain/v2/outputStructure";
import { laterProducerFields } from "../../domain/v2/nodeOrder";
import { removeModelStructuredField, renameModelStructuredField, renameModelStructuredWriteField, withModelStructuredField } from "../../domain/v2/structuredOutput";
import { ResourceCenterDialog } from "../../resources/ResourceCenterDialog";
import { ResourcePanel } from "../../resources/ResourcePanel";
import { ResourceEditor, type ResourceEditorTarget } from "../../resources/ResourceEditor";
import type { ResourceSection } from "../../resources/resourceTypes";
import { LlmAdvancedSettings, ProcessingFields, transformOperations } from "./ProcessingFields";
import { ExecutionDetails } from "./ExecutionDetails";
import { ExecutionBubbles } from "./ExecutionBubbles";
import { executionPolicySummary, latestNodeSteps, presentRunSteps, processingDescription } from "./executionPresentation";
import { formatRunDuration, relativeRunTime, runElapsed, runEnvironmentLabel, runInputSummary, runStatusTone } from "../../domain/v2/runSummary";
import { NodePanel, type NodePanelSection } from "./NodePanel";
import { ComponentLibrary } from "./ComponentLibrary";
import { EmptyCanvasStart } from "./EmptyCanvasStart";
import { createStartingTemplate, startingTemplateCards, type StartingTemplateKind } from "../../domain/v2/startingTemplates";
import { nodeIssueReason, runPreflight, type RunPreflightIssue } from "./runPreflight";
import { presentExecutionError, type ErrorActionHint } from "./errorPresentation";
import { ExecutionErrorCard } from "./ExecutionErrorCard";
import { addDeclaredParam, NodeParamsTable } from "./NodeParamsTable";
import { applyWorkbenchBinding, workbenchUseHint } from "./workbenchBinding";
import { NodeOutputsTable } from "./NodeOutputsTable";
import { StatePanel } from "./StatePanel";
import { nodeLabelIndex } from "./StateFields";
import { EdgeEditingContext, WorkflowEdge, WorkflowNode, type CanvasNode } from "./WorkflowGraph";
import { edgesWithMeasuredPorts } from "./portReadiness";
import { overviewFitOptions, viewportShowsBounds, type CanvasViewport } from "./viewport";
import { diagnosticTarget, diagnosticText, runFailureTarget } from "./diagnostics";
import { readableAnswer, StructuredValue, ReadableRunOutput, RunEffectNotice, RunToolActivity, ToolStepOutput } from "./RunOutput";
import { definitionHasExternalWriteTools, externalEffectNotice } from "./toolActivity";
import { additionPosition, removeCanvasElements } from "./graphEditing";
import "./workflowV2.css";

const runInputDraftId = "runtime-input";
const bindingMapSchema = z.record(z.string(), bindingSchema);
const validateForm = (schema: z.ZodType) => (value: unknown) => { const result = schema.safeParse(value); return result.success ? undefined : formatSchemaError(result.error); };
const canvasAria = { "controls.zoomIn.ariaLabel": "放大画布", "controls.zoomOut.ariaLabel": "缩小画布", "controls.fitView.ariaLabel": "适应画布", "controls.interactive.ariaLabel": "切换交互锁定", "minimap.ariaLabel": "流程小地图" };
const canvasTypes = { workflowV2: WorkflowNode }; const edgeTypes = { editable: WorkflowEdge };
const transformOperationLabels: Record<string, string> = { "core.identity": "原样传递", "core.add": "数字相加", "core.concat": "文本连接", "core.message": "构建用户消息" };
// React Flow queues fitView; keep this prop stable so a mode render cannot overwrite the requested fit.
const readableFitOptions = { minZoom: .9, maxZoom: 1 };
const statusLabel = runStatusLabels;
function toolRefs(node: WorkflowNodeV2): string[] { const value = node.config.allowedToolRefs; return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
const outlets = nodeOutlets;
function transitionLabel(node: WorkflowNodeV2 | undefined, outlet: string) { return outletDisplayName(node, outlet); }
function snapshotNodes(document: WorkflowDocumentV2): CanvasNode[] {
  return document.definition.nodes.map((node,index) => { const summary = nodeCardSummary(node); return { id: node.id, type: "workflowV2", position: document.editor.nodes[node.id] ?? { x: 80 + index * 240, y: 160 }, data: { label: node.label, type: node.type, summary: summary.text, summaryMono: summary.mono, active: false, outlets: outlets(node), outletLabels: Object.fromEntries(outlets(node).map(outlet => [outlet, outletDisplayName(node, outlet)])), sources: Object.fromEntries(document.definition.transitions.filter(edge=>edge.from===node.id&&document.editor.edges[edge.id]?.routing?.source).map(edge=>[edge.outlet,document.editor.edges[edge.id].routing!.source!])), targets: [...document.definition.transitions,...sendTargetRelations(document.definition)].filter(edge=>edge.to===node.id).map((edge,index,list)=>({id:edge.id,placement:document.editor.edges[edge.id]?.routing?.target??{side:"left",offset:(index+1)/(list.length+1)}})) } }; });
}
function SnapshotCanvas({ snapshot: rootSnapshot, focusedNode, focusedPath=[] }: { snapshot: WorkflowDocumentV2; focusedNode?: string | null; focusedPath?:string[] }) {
  const [path,setPath]=useState<string[]>(focusedPath);
  const definition=graphAtPath(rootSnapshot.definition,path);
  const snapshot=useMemo(()=>({definition,editor:editorAtPath(rootSnapshot.editor,path,definition)}),[rootSnapshot,definition,path]);
  const historyViews=useRef(new Map<string,{x:number;y:number;zoom:number}>());
  const pathKey=JSON.stringify(path);
  function navigateHistory(next:string[]){setPath(next);setSelectedNodeId("");setSizes({});positioned.current=false;}
  const graph = useRef<ReactFlowInstance<CanvasNode> | null>(null);
  const positioned = useRef(false);
  const [selectedNodeId, setSelectedNodeId] = useState(focusedNode ?? "");
  const [viewMode, setViewMode] = useState<"readable" | "overview" | "custom">("readable");
  const [zoom, setZoom] = useState(.9);
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const nodes = useMemo<CanvasNode[]>(() => snapshotNodes(snapshot).map(node => ({ ...node, selected: node.id === selectedNodeId, measured: sizes[node.id] })), [snapshot, selectedNodeId, sizes]);
  const edges = useMemo<Edge[]>(() => [...snapshot.definition.transitions,...sendTargetRelations(snapshot.definition)].map(edge => ({ id: edge.id,style:edge.id===sendTargetEdgeId(edge.from)?{strokeDasharray:"6 5"}:undefined, source: edge.from, target: edge.to, sourceHandle: edge.outlet, targetHandle: `target-${edge.id}`, label: transitionLabel(snapshot.definition.nodes.find(node => node.id === edge.from), edge.outlet), type: "editable", data: { routing: snapshot.editor.edges[edge.id]?.routing, sourceBounds: nodeBounds(snapshot.definition, snapshot.editor, edge.from, sizes), targetBounds: nodeBounds(snapshot.definition, snapshot.editor, edge.to, sizes) }, markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#566583" } })), [snapshot, sizes]);
  useEffect(() => {
    if (positioned.current || !graph.current || nodes.some(node => !sizes[node.id])) return;
    positioned.current = true;
    if (focusedNode) void graph.current.fitView({ nodes: [{ id: focusedNode }], minZoom: .9, maxZoom: 1 });
  }, [nodes, sizes, focusedNode]);
  function locateNode(id: string) {
    setSelectedNodeId(id); setViewMode("readable");
    if (id) void graph.current?.fitView({ nodes: [{ id }], minZoom: .9, maxZoom: 1 });
  }
  function measure(changes: NodeChange<CanvasNode>[]) {
    for (const change of changes) if (change.type === "dimensions" && change.dimensions) {
      const dimensions = change.dimensions;
      setSizes(current => current[change.id]?.width === dimensions.width && current[change.id]?.height === dimensions.height ? current : { ...current, [change.id]: dimensions });
    }
  }
  return <>
    <div className="wf-v2-snapshot-canvas" aria-label="历史定义画布"><ReactFlow key={pathKey} ariaLabelConfig={canvasAria} nodes={nodes} edges={edges} onInit={instance => { graph.current = instance;const saved=historyViews.current.get(pathKey);if(saved)void instance.setViewport(saved); }} onNodesChange={measure} onNodeClick={(_, node) => setSelectedNodeId(node.id)} onMoveEnd={(event, viewport) => { historyViews.current.set(pathKey,viewport);setZoom(viewport.zoom); if (event) setViewMode("custom"); }} edgeTypes={edgeTypes} nodeTypes={canvasTypes} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} minZoom={.02} fitView={!historyViews.current.has(pathKey)} fitViewOptions={readableFitOptions}><Background gap={24}/><MiniMap style={{width:120,height:80}} pannable zoomable nodeColor="#6476a5" maskColor="#d5dff380"/></ReactFlow></div>
    <nav className="wf-snapshot-tools" aria-label="历史画布导航">
      <div className="wf-graph-crumb"><button onClick={()=>navigateHistory([])}>历史主流程</button>{path.map((id,index)=><button key={index} onClick={()=>navigateHistory(path.slice(0,index+1))}>› {graphAtPath(rootSnapshot.definition,path.slice(0,index)).nodes.find(node=>node.id===id)?.label??id}</button>)}</div>
      {snapshot.definition.nodes.some(node=>node.id===selectedNodeId&&graphInNode(node))?<button onClick={()=>navigateHistory([...path,selectedNodeId])}>进入只读子图</button>:null}
    <p className="wf-snapshot-view-hint" role="status">{viewMode === "overview" ? "全图概览：标签可能缩小，请返回可读视图查看细节。" : "可拖动画布或点击小地图查看屏外节点，也可选择下方节点定位。"} 当前缩放 {Math.round(zoom * 100)}%。</p>
      <button type="button" onClick={() => { setViewMode("custom"); void graph.current?.zoomIn(); }}>放大历史画布</button>
      <button type="button" onClick={() => { setViewMode("custom"); void graph.current?.zoomOut(); }}>缩小历史画布</button>
      <button type="button" onClick={() => { setViewMode("readable"); void graph.current?.fitView({ minZoom: .9, maxZoom: 1 }); }}>返回历史可读视图</button>
      <button type="button" aria-pressed={viewMode === "overview"} onClick={() => { setViewMode("overview"); void graph.current?.fitView({ minZoom: .1, maxZoom: 1 }); }}>历史全图概览</button>
      <label>定位历史节点<select aria-label="定位历史节点" value={selectedNodeId} onChange={event => locateNode(event.target.value)}><option value="">请选择节点</option>{snapshot.definition.nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
    </nav>
    <details><summary>当前历史图定义（只读） · {snapshot.definition.name}</summary><pre>{JSON.stringify(snapshot.definition,null,2)}</pre></details>
  </>;
}
function nodeBounds(definition: WorkflowDefinitionV2, editor: EditorDocumentV2, id: string, sizes: Record<string, { width: number; height: number }>) {
  return { ...(editor.nodes[id] ?? { x: 80 + definition.nodes.findIndex(node => node.id === id) * 240, y: 160 }), width: sizes[id]?.width ?? 170, height: sizes[id]?.height ?? 150 };
}
function outputText(value: JsonValue | undefined): string {
  const answer=readableAnswer(value);if(answer!==undefined)return answer;
  if (value === undefined) return "尚无输出";
  if (value === null) return "结果为空值（null）";
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.final_answer === "string") return value.final_answer;
    if (typeof value.answer === "string") return value.answer;
    if (Array.isArray(value.messages)) { const message = [...value.messages].reverse().find(item => item && typeof item === "object" && !Array.isArray(item) && item.role === "assistant"); if (message && typeof message === "object" && !Array.isArray(message) && Array.isArray(message.content)) return message.content.map(block => block && typeof block === "object" && !Array.isArray(block) ? String(block.text ?? "") : "").join("\n") || "模型没有文本输出；请查看工具返回与技术详情。"; }
    return Object.entries(value).map(([name,content]) => `${name}：${typeof content === "object" ? JSON.stringify(content,null,2) : String(content)}`).join("\n");
  }
  return JSON.stringify(value,null,2);
}
export function LiveWorkflowEditor({ initial, ownerId, navigation, launchContext, onBack, onOpen }: { initial: WorkflowDocumentV2; ownerId: string; navigation: ReactNode; launchContext?: WorkflowLaunchContext; onBack: () => void; onOpen: (id: string) => void }) {
  const [sessionRecovery] = useState(() => peekWorkflowSessionRecovery(ownerId, initial.definition.workflowId));
  const rejectRecoverySubmission = useCallback((key: string) => rejectRecoveredWorkflowSubmission(ownerId, initial.definition.workflowId, key), [ownerId, initial.definition.workflowId]);
  const rootController = useWorkflowV2Controller(initial, launchContext, sessionRecovery?.controller, rejectRecoverySubmission);
  const callerInputKey = launchContext?.workflowInput === undefined ? "" : JSON.stringify(launchContext.workflowInput);
  const callerInputReadOnly = callerInputKey !== "";
  useEffect(() => { if (callerInputKey) rootController.replaceInput(JSON.parse(callerInputKey) as JsonValue); }, [callerInputKey]);
  const [viewingRun,setViewingRun] = useState(false);
  // A live run never replaces the editing draft. Only an explicit history selection is read-only.
  const executionView=viewingRun;
  const inspection = executionView ? rootController.runSnapshot : null;
  const workflowName = inspection?.definition.name ?? rootController.definition.name;
  const nameMeasureRef = useRef<HTMLSpanElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [workflowNameWidth, setWorkflowNameWidth] = useState(160);
  useLayoutEffect(() => {
    const measure = nameMeasureRef.current;
    const input = nameInputRef.current;
    if (!measure || !input) return;
    const update = () => setWorkflowNameWidth(workflowNameInputWidth(measureInputTextWidth(input, measure), inputChromeWidth(input)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(measure);
    let cancelled = false;
    void document.fonts?.ready.then(() => { if (!cancelled) update(); });
    return () => { cancelled = true; observer.disconnect(); };
  }, [workflowName]);
  const projectionRoot = inspection ? { ...rootController, ...inspection } : rootController;
  const [graphPath, setGraphPath] = useState<string[]>([]);
  const [selectedSubgraphInvocation, setSelectedSubgraphInvocation] = useState("");
  const [queuedDiagnostic,setQueuedDiagnostic]=useState<WorkflowDiagnostic|null>(null);
  const scopeViews = useRef(new Map<string, { x: number; y: number; zoom: number }>());
  let safePath = graphPath;
  try { graphAtPath(projectionRoot.definition, safePath); } catch { safePath = []; }
  const controller = scopedWorkflow(projectionRoot, safePath); const { definition, editor, run } = controller;
  const visibleDiagnostics = controller.diagnostics;
  const selectedInvocationGroup = selectedSubgraphInvocation ? subgraphInvocations(rootController.steps).find(group => group.key === selectedSubgraphInvocation) : undefined;
  const invocationScoped = Boolean(selectedInvocationGroup && JSON.stringify(selectedInvocationGroup.graphPath) === JSON.stringify(safePath));
  const graphScope = (path: readonly string[] | undefined) => JSON.stringify(Array.isArray(path) ? path : []);
  const baseVisibleSteps = presentRunSteps(controller.run,controller.steps).filter(step=>graphScope(step.graphPath??[])===graphScope(safePath));
  const visibleSteps = invocationScoped ? baseVisibleSteps.filter(step => stepInvocationIdentity(step)?.key === selectedInvocationGroup?.key) : baseVisibleSteps;
  const visibleEvents = controller.events;
  const [selection, setSelection] = useState<string | null>(null); const [edgeSelection, setEdgeSelection] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const [tab, setTab] = useState<"node" | "state" | "graph" | "run" | "environment" | "export">("node"); const [paletteOpen, setPaletteOpen] = useState(false); const [inspectorOpen, setInspectorOpen] = useState(false); const [minimapOpen, setMinimapOpen] = useState(false);
  const [historyOpen,setHistoryOpen] = useState(false), [bubblesOpen,setBubblesOpen] = useState(true);
  const historyDockRef=useRef<HTMLElement>(null); const [historyDockHeight,setHistoryDockHeight]=useState(0);
  useLayoutEffect(()=>{const element=historyDockRef.current;if(!element)return;const update=()=>setHistoryDockHeight(element.getBoundingClientRect().height);update();const observer=new ResizeObserver(update);observer.observe(element);return()=>observer.disconnect();},[]);
  const [debugOpen,setDebugOpen] = useState(false); const [debugFocus,setDebugFocus] = useState<"config"|"test">("config");
  const [variableConfiguration,setVariableConfiguration] = useState<WorkflowConfiguration | null>(null);
  const [variableEnvironmentId,setVariableEnvironmentId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const storageKey = `eduflow.workflow.variableEnvironment.${rootController.definition.workflowId}`;
    void workflowApiV2.configuration().then(value => {
      if (!active) return;
      setVariableConfiguration(value);
      const environments = value.environments ?? [];
      let stored: string | null = null;
      try { stored = window.localStorage.getItem(storageKey); } catch { stored = null; }
      const fallback = value.defaultEnvironmentId ?? environments[0]?.id ?? null;
      setVariableEnvironmentId(current => current ?? (stored && environments.some(environment => environment.id === stored) ? stored : fallback));
    }).catch(() => { /* the service notice already covers unavailable workflow services */ });
    return () => { active = false; };
  }, [rootController.definition.workflowId]);
  useEffect(() => { controller.setVariableEnvironment(variableEnvironmentId); }, [variableEnvironmentId]);
  const variableEnvironments = useMemo<VariableEnvironment[]>(() => variableConfiguration?.environments ?? [], [variableConfiguration]);
  const [resourceCenter,setResourceCenter] = useState<{ open: boolean; initialSection?: ResourceSection; intent?: { kind: "create"; section: ResourceSection; onCreated: (ref: string, version: number, content?: Record<string, JsonValue>) => void } } | null>(null);
  const [resourcePanelOpen,setResourcePanelOpen] = useState(false);
  const [resourceEditor,setResourceEditor] = useState<{ target: ResourceEditorTarget; onSaved?: (ref: string, version: number, content?: Record<string, JsonValue>) => void } | null>(null);
  const [nodeTab,setNodeTab] = useState<"config"|"execution">("config"), [selectedStepId,setSelectedStepId] = useState<string|null>(null);
  const [exportNotice,setExportNotice]=useState("");
  const [preflightIssues,setPreflightIssues]=useState<RunPreflightIssue[]>([]);
  const [runBlockedIssues,setRunBlockedIssues]=useState<RunPreflightIssue[]>([]);
  const [startCardsDismissed,setStartCardsDismissed]=useState(false);
  const [spotlightNodeId,setSpotlightNodeId]=useState<string|null>(null);
  // A resolved conflict or any other edit removes a stale run-blocked notice.
  useEffect(() => { setRunBlockedIssues([]); }, [definition]);
  const displayedDefinition = definition;
  const displayedEditor = editor;
  const canvasIdentity = `${definition.workflowId}:${definition.revision}:${JSON.stringify(safePath)}`;
  // Autosave bumps the revision without changing what the user is looking at.
  const canvasViewKey = `${definition.workflowId}:${JSON.stringify(safePath)}`;
  const readOnly = executionView || Boolean(initial.archived);
  const executionByNode = latestNodeSteps(visibleSteps);
  const [inputReuseOmissions, setInputReuseOmissions] = useState<RunInputReuseOmission[]>([]);
  const [reusedRunRevision, setReusedRunRevision] = useState<number | null>(null);
  const [dialog, setDialog] = useState<"leave" | "run" | "rerun" | "template" | "archive" | "versions" | "conflict" | "preflight" | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [resultCardOpen, setResultCardOpen] = useState(true); const [resultCardExpanded, setResultCardExpanded] = useState(false);
  useEffect(() => { if (run) setResultCardOpen(true); }, [run?.runId]);
  const [snapshot, setSnapshot] = useState<WorkflowDocumentV2 | null>(null); const [snapshotFocus, setSnapshotFocus] = useState<string | null>(null); const [revisions, setRevisions] = useState<WorkflowRevisionSummary[]>([]);
  const [responseDrafts,setResponseDrafts]=useState<Record<string,ResponseDraft>>({});
  const focusedResponse=useRef('');
  const [artifactContent, setArtifactContent] = useState<{ runId: string; value: JsonValue } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{ runId: string; failed: boolean; message: string } | null>(null);
  const [viewZoom, setViewZoom] = useState(1); const [measurements, setMeasurements] = useState<Record<string, { width: number; height: number }>>({}); const graphRef = useRef<ReactFlowInstance<CanvasNode> | null>(null); const editorRoot = useRef<HTMLElement>(null);
  const settledViews = useRef(new Set<string>()); const pendingInitialView = useRef<string | null>(null); const panelViewport = useRef<{ key: string; viewport: CanvasViewport } | null>(null); const previousInspector = useRef(false);
  const [hoveredEdgeId,setHoveredEdgeId]=useState<string|null>(null);
  const [outputAddNode,setOutputAddNode]=useState<string|null>(null);
  const [autoSaving,setAutoSaving]=useState(false); const [autoSaveFailed,setAutoSaveFailed]=useState(false); const autoSaveFailure=useRef<WorkflowDefinitionV2|null>(null);
  // Keep the narrow-screen inspector below the floating controls without touching React Flow.
  useLayoutEffect(()=>{const root=editorRoot.current,body=root?.querySelector<HTMLElement>(".wf-v2-body");if(!root||!body)return;const controls=[...root.querySelectorAll<HTMLElement>(".wf-floating-left,.wf-floating-tools")];const update=()=>{const top=body.getBoundingClientRect().top;const bottom=controls.reduce((value,element)=>Math.max(value,element.getBoundingClientRect().bottom),top);root.style.setProperty("--wf-floating-bottom",`${Math.max(0,Math.round(bottom-top))}px`);};update();const observer=new ResizeObserver(update);controls.forEach(element=>observer.observe(element));window.addEventListener("resize",update);return()=>{observer.disconnect();window.removeEventListener("resize",update);};},[]);
  const [readyPorts, setReadyPorts] = useState<Record<string, string>>({});
  const reportPortsReady = useCallback((id: string, signature: string) => setReadyPorts(current => current[id] === signature ? current : { ...current, [id]: signature }), []);
  const drafts = useRef<JsonDraftStore>(sessionRecovery?.drafts ?? new Map());
  const pendingIdsRef = useRef<string[]>(sessionRecovery?.pendingIds ?? []);
  const [pendingIds, setPendingFields] = useState<string[]>(pendingIdsRef.current);
  const recoveryCapture = useRef<(failure: ApiAuthenticationFailure) => void>(() => undefined);
  useLayoutEffect(() => {
    recoveryCapture.current = failure => retainWorkflowSessionRecovery(ownerId, initial.definition.workflowId, controller.captureSessionRecovery(failure), drafts.current, pendingIdsRef.current);
  });
  useEffect(() => subscribeApiAuthenticationFailure(failure => {
    if (failure.sessionUserId === ownerId) recoveryCapture.current(failure);
  }), [ownerId]);
  useEffect(() => { if (sessionRecovery) acknowledgeWorkflowSessionRecovery(sessionRecovery.ticket); }, [sessionRecovery]);
  const [inputFocusRequest, setInputFocusRequest] = useState(0);
  const [inputFocusPointer, setInputFocusPointer] = useState<string | null>(null);
  const pendingFields = pendingIds.filter(id => { const draft = drafts.current.get(id); if (draft?.ownerStateField && !Object.prototype.hasOwnProperty.call(definition.state.schema.properties ?? {}, draft.ownerStateField)) return false; if (!draft?.ownerNodeId) return true; const owner = definition.nodes.find(node => node.id === draft.ownerNodeId); return Boolean(owner && (!draft.ownerInputName || Object.prototype.hasOwnProperty.call(owner.inputs, draft.ownerInputName))); });
  const pending = useCallback((id: string, value: boolean) => {
    const current = pendingIdsRef.current;
    const next = value ? current.includes(id) ? current : [...current, id] : current.includes(id) ? current.filter(item => item !== id) : current;
    pendingIdsRef.current = next; setPendingFields(next);
  }, []);
  function replaceRunInput(value: JsonValue, clear = false) {
    drafts.current.delete(runInputDraftId); pending(runInputDraftId, false); if(clear)controller.clearInvocationInput();else controller.replaceInput(value);
  }
  const [pendingAction, setPendingAction] = useState<"save" | "run" | "validate" | null>(null);
  // Draft validity owns this feedback: correcting or discarding the last pending edit removes it.
  const pendingError = pendingFields.length && pendingAction ? pendingAction === "save" ? "高级配置还有未应用编辑，请先应用或放弃，再保存。" : pendingAction === "run" ? "高级配置还有未完成编辑，请先修正、应用或放弃，再运行。" : "请先修正、应用或放弃高级配置编辑，再校验。" : "";
  const visibleError = pendingError || controller.error;
  useBeforeUnload(useCallback((event: BeforeUnloadEvent) => {
    if(controller.dirty || controller.inputDirty || controller.inputInvalid || pendingFields.length) { event.preventDefault(); event.returnValue = ""; }
  }, [controller.dirty,controller.inputDirty,controller.inputInvalid,pendingFields.length]));
  const allowLeave = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !allowLeave.current && (controller.dirty || controller.inputDirty || pendingFields.length > 0) && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  const activeDialog = dialog ?? (blocker.state === "blocked" ? "leave" : null);
  function closeDialog() { setDialog(null); if(blocker.state === "blocked") blocker.reset(); }
  function finishLeave() { allowLeave.current = true; if(blocker.state === "blocked") blocker.proceed(); else onBack(); }
  const pendingThread=controller.currentThread;
  const observedState=executionObservation(run,pendingThread,controller.historyExpired,controller.observedRunId);
  const observationStatus=observedState.label;
  const [selectedInterruptId,setSelectedInterruptId]=useState<string|null>(null);
  const pendingInterrupt=observedState.phase==='waiting'
    ?pendingThread?.interrupts.find(item=>item.id===selectedInterruptId)
      ??pendingThread?.interrupts.find(item=>JSON.stringify(item.graphPath??[])===JSON.stringify(safePath)&&(!invocationScoped||item.namespace===selectedInvocationGroup?.namespace))
      ??(invocationScoped?undefined:pendingThread?.interrupts.find(item=>JSON.stringify(item.graphPath??[])===JSON.stringify(safePath)))
      ??(invocationScoped?undefined:pendingThread?.interrupts[0])
    :undefined;
  const responseKey=pendingInterrupt&&pendingThread?`${pendingThread.threadId}:${pendingInterrupt.id}`:'';
  const responseDraft=responseDrafts[responseKey]??{value:pendingInterrupt?initializeResponseDraft(pendingInterrupt.schema,{}):{}};
  const reviewFacts=pendingInterrupt&&pendingThread?reviewContextFacts(definition,pendingThread,pendingInterrupt,visibleSteps):null;
  const reviewBlocked=Boolean(reviewFacts?.missing&&!pendingInterrupt?.breakpoint);
  const batchReviewBlocked=pendingThread?pendingThread.interrupts.some(item=>!item.breakpoint&&reviewContextFacts(definition,pendingThread,item,visibleSteps).missing):false;
  function locateNodeOnCanvas(nodeId: string) {
    const bounds = nodeBounds(displayedDefinition, displayedEditor, nodeId, measurements);
    const zoom = graphRef.current?.getViewport().zoom ?? 1;
    const panelWidth = editorRoot.current?.querySelector(".wf-v2-inspector")?.clientWidth ?? 0;
    void graphRef.current?.setCenter(bounds.x + bounds.width / 2 + panelWidth / (2 * zoom), bounds.y + bounds.height / 2, { zoom, duration: 200 });
  }
  function locateResponse(nodeId:string,path?:string[],interruptId?:string){
    if(interruptId)setSelectedInterruptId(interruptId);
    if(path&&JSON.stringify(path)!==JSON.stringify(safePath)){focusedResponse.current='';navigateGraph(path);return;}
    setBubblesOpen(true);setInspectorOpen(false);setHistoryOpen(false);setSelection(nodeId);setEdgeSelection(null);
    const point=displayedEditor.nodes[nodeId];if(!point)return;
    // Let the history drawer close before React Flow measures the available height.
    requestAnimationFrame(()=>{void graphRef.current?.fitBounds({x:point.x-30,y:point.y-110,width:Math.max(measurements[nodeId]?.width??240,330)+60,height:(measurements[nodeId]?.height??150)+560},{padding:.08,duration:220});});
  }
  useEffect(()=>{
    const key=responseKey;
    if(!key||!inspection||focusedResponse.current===key)return;
    const nodeId=pendingInterrupt?.nodeId;if(!nodeId||!displayedEditor.nodes[nodeId])return;
    focusedResponse.current=key;
    const frame=requestAnimationFrame(()=>locateResponse(nodeId));return()=>cancelAnimationFrame(frame);
  },[responseKey,inspection,JSON.stringify(safePath)]);
  const nestedWaiting=observedState.phase==='waiting'?pendingThread?.interrupts.filter(item=>(item.graphPath?.length??0)>safePath.length&&safePath.every((id,index)=>item.graphPath?.[index]===id)):[];
  const waitingBubble=nestedWaiting?.length&&pendingThread&&JSON.stringify(pendingInterrupt?.graphPath??[])!==JSON.stringify(safePath)?{
    runId:pendingThread.currentRunId,nodeId:nestedWaiting[0].graphPath![safePath.length],content:<><strong>子图内部有 {nestedWaiting.length} 项等待回应</strong>{nestedWaiting.map(item=><button key={item.id} onClick={()=>locateResponse(item.nodeId,item.graphPath,item.id)}>进入回应：{item.title}</button>)}</>
  }:pendingInterrupt&&pendingThread&&inspection&&JSON.stringify(pendingInterrupt.graphPath??[])===JSON.stringify(safePath)?{
    runId:pendingThread.currentRunId,nodeId:pendingInterrupt.nodeId,
    content:<>{pendingThread.interrupts.length>1?<label>选择待回应任务<select aria-label="选择待回应任务" value={pendingInterrupt.id} onChange={e=>{const item=pendingThread.interrupts.find(i=>i.id===e.target.value);if(item)locateResponse(item.nodeId,item.graphPath,item.id);}}>{pendingThread.interrupts.map(item=><option key={item.id} value={item.id}>{item.graphPath?.length?"子图 / ":""}{item.title} · {item.taskId?.slice(0,8)??item.id.slice(0,8)}</option>)}</select></label>:null}<ReviewContext definition={definition} thread={pendingThread} interrupt={pendingInterrupt} steps={visibleSteps}/><NodeResponseForm key={responseKey} title={`${pendingInterrupt.title}${pendingThread.interrupts.length>1?` · 待回应 ${pendingThread.interrupts.length} 项`:""}`} schema={pendingInterrupt.schema} value={responseDraft.value} busy={controller.busy} breakpoint={pendingInterrupt.breakpoint} batchOnly={pendingThread.interrupts.length>1&&pendingThread.interrupts.some(item=>item.breakpoint)}
      onChange={value=>setResponseDrafts(current=>({...current,[responseKey]:{value}}))}
      onInvalid={invalid=>setResponseDrafts(current=>({...current,[responseKey]:{...(current[responseKey]??{value:responseDraft.value}),invalid}}))}
      onSubmit={async()=>{if(responseDraft.invalid)return false;const ok=await controller.resumeThread(pendingThread,{[pendingInterrupt.id]:responseDraft.value});if(ok){setViewingRun(true);showTab("run");}return ok;}} contextMissing={reviewBlocked} onCancel={()=>setPendingConfirm({title:"取消本次执行？",message:"已完成的步骤会保留，等待中的回应不会提交。",confirmLabel:"确认取消",danger:true,onConfirm:()=>void controller.cancel()})}/>{pendingThread.interrupts.length>1?<button disabled={controller.busy||batchReviewBlocked||pendingThread.interrupts.some(item=>{if(item.breakpoint)return false;const draft=responseDrafts[`${pendingThread.threadId}:${item.id}`];const value=draft?.value??initializeResponseDraft(item.schema,{});return Boolean(draft?.invalid)||!validateSchemaValue(item.schema,value).valid;})} onClick={()=>void controller.resumeThread(pendingThread,Object.fromEntries(pendingThread.interrupts.map(item=>[item.id,responseDrafts[`${pendingThread.threadId}:${item.id}`]?.value??(item.breakpoint?{}:initializeResponseDraft(item.schema,{}))])))}>提交全部已填写回应并继续</button>:null}</>
  }:undefined;
  const activeStep = [...visibleSteps].reverse().find(item => item.status === "running"); const failureTarget = run && run.status!=="cancelled" ? runFailureTarget(run, controller.steps, controller.runSnapshot?.definition) : undefined; const selectedNode = displayedDefinition.nodes.find(item => item.id === selection); const selectedEdge = displayedDefinition.transitions.find(item => item.id === edgeSelection); const inspectorVisible = inspectorOpen && (tab !== "node" || Boolean(selectedNode || selectedEdge));
  const presentedRunError = run?.error && run.status !== "cancelled" && run.error.code !== "WAIT_EXPIRED" ? presentExecutionError(run.error, { savedAt: run.createdAt }) : undefined;
  const emptyCanvas = safePath.length === 0 && !startCardsDismissed && !executionView && !readOnly && definition.nodes.length <= 2 && definition.nodes.every(node => node.type === "core.start" || node.type === "core.end");
  const environment = controller.environments.find(item => item.environmentRef === controller.environmentRef);
  const activeVariableValues = useMemo(() => {
    const values: Record<string, string | number | boolean> = { ...(environment?.variables ?? {}) };
    for (const variable of variableConfiguration?.variables ?? []) {
      values[variable.key] = variable.value;
      if (variableEnvironmentId && Object.prototype.hasOwnProperty.call(variable.overrides ?? {}, variableEnvironmentId)) values[variable.key] = (variable.overrides ?? {})[variableEnvironmentId];
    }
    return values;
  }, [environment, variableConfiguration, variableEnvironmentId]);
  const activeEnvironment = useMemo(() => environment ? { ...environment, providers: environment.providers.filter(provider => !isFakeEndpointRef(provider.ref)), variables: activeVariableValues } : undefined, [environment, activeVariableValues]);
  const nodePreflightIssues = useMemo(() => {
    if (readOnly) return new Map<string, RunPreflightIssue>();
    const issues = runPreflight({ definition, input: controller.input, environment: activeEnvironment, tools: controller.tools, variableValues: activeVariableValues });
    const byNode = new Map<string, RunPreflightIssue>();
    for (const issue of issues) {
      if (!issue.nodeId) continue;
      // Tool metadata is still arriving; do not mark every tool node meanwhile.
      if (controller.toolsLoading && issue.id.startsWith("tool:")) continue;
      if (!byNode.has(issue.nodeId)) byNode.set(issue.nodeId, issue);
    }
    return byNode;
  }, [definition, controller.input, controller.tools, controller.toolsLoading, activeEnvironment, activeVariableValues, readOnly]);
  const envAvailability = environmentAvailability({ status: controller.initialLoadStatus, environments: controller.environments, selectedRef: controller.environmentRef });
  const unresolved = unresolvedCapabilities(rootController.definition);
  const selectedTool = selectedNode?.type === "core.tool" ? controller.tools.find(tool => tool.ref === selectedNode.config.toolRef) : undefined;
  const nodes = useMemo<CanvasNode[]>(() => displayedDefinition.nodes.map((node,index) => {
    const provider = node.type === "core.llm" ? activeEnvironment?.providers.find(item => item.ref === node.config.providerRef) : undefined;
    const missingModel = node.type === "core.llm" && (!node.config.providerRef || !node.config.modelRef || !provider || !provider.modelRefs.includes(String(node.config.modelRef)));
    const tool = node.type === "core.tool" || node.type === "core.tool_dispatch" ? controller.tools.find(item => item.ref === node.config.toolRef) : undefined;
    const summary = nodeCardSummary(node, { toolName: tool?.name, modelName: String(node.config.modelRef ?? ""), outputCount: nodeOutputKeys(node).length });
    return { id: node.id, type: "workflowV2", measured: measurements[node.id], position: displayedEditor.nodes[node.id] ?? { x: 80 + index * 240, y: 160 }, selected: selection === node.id, data: { spotlight: spotlightNodeId === node.id, needsFix: nodeIssueReason(nodePreflightIssues.get(node.id)), onPortsReady: reportPortsReady, outletLabels: Object.fromEntries(outlets(node).map(outlet => [outlet, outletDisplayName(node, outlet)])), label: node.label, type: node.type, summary: summary.text, summaryMono: summary.mono, active: run?.revision === definition.revision && !controller.definitionDirty && activeStep?.nodeId === node.id, status: ((pendingInterrupt?.nodeId===node.id&&JSON.stringify(pendingInterrupt.graphPath??[])===JSON.stringify(safePath)||nestedWaiting?.some(item=>item.graphPath?.[safePath.length]===node.id))?"waiting":(executionView || run?.revision===definition.revision&&!controller.definitionDirty) ? executionByNode.get(node.id)?.status : undefined), onConfigure: () => { setSelection(node.id); setEdgeSelection(null); setNodeTab("config"); showTab("node"); }, onDelete: readOnly ? undefined : () => deleteNode(node.id), failed: run?.revision === definition.revision && !controller.definitionDirty && failureTarget?.nodeId === node.id, missingModel, onAddModel: missingModel && !readOnly ? () => openModelForNode(node.id) : undefined, outlets: outlets(node), sources: Object.fromEntries(displayedDefinition.transitions.filter(edge => edge.from === node.id && displayedEditor.edges[edge.id]?.routing?.source).map(edge => [edge.outlet, displayedEditor.edges[edge.id].routing!.source!])), targets: [...displayedDefinition.transitions,...sendTargetRelations(displayedDefinition)].filter(edge => edge.to === node.id).map((edge, index, list) => ({ id: edge.id, placement: displayedEditor.edges[edge.id]?.routing?.target ?? { side: "left", offset: (index + 1) / (list.length + 1) } })) } };
  }), [displayedDefinition.nodes, displayedDefinition.transitions, displayedEditor.nodes, displayedEditor.edges, selection, spotlightNodeId, activeStep?.nodeId, failureTarget?.nodeId, controller.definitionDirty, controller.tools, run?.revision, definition.revision, measurements, visibleSteps, readOnly, executionView, reportPortsReady,pendingInterrupt?.nodeId,pendingInterrupt?.graphPath,nestedWaiting?.length, activeEnvironment, nodePreflightIssues, controller.toolsLoading]);
  const edges = useMemo<Edge[]>(() => [...displayedDefinition.transitions,...sendTargetRelations(displayedDefinition)].map(edge => ({ id: edge.id, reconnectable: edge.id===sendTargetEdgeId(edge.from)?"target":true, source: edge.from, target: edge.to, sourceHandle: edge.outlet, targetHandle: `target-${edge.id}`, label: transitionLabel(displayedDefinition.nodes.find(node => node.id === edge.from), edge.outlet), type: "editable", markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#8e9cbb" }, style: edge.id===sendTargetEdgeId(edge.from)?{strokeDasharray:"6 5",stroke:"#8e9cbb"}:{stroke:"#8e9cbb"}, selected: edge.id === edgeSelection, animated: run?.revision === definition.revision && !controller.definitionDirty && activeStep?.nodeId === edge.from, data: { routing: displayedEditor.edges[edge.id]?.routing, zoom: viewZoom, hovered: hoveredEdgeId === edge.id, sourceBounds: nodeBounds(displayedDefinition, displayedEditor, edge.from, measurements), targetBounds: nodeBounds(displayedDefinition, displayedEditor, edge.to, measurements) }, className: edge.id === edgeSelection ? "wf-v2-diagnostic-edge" : undefined })), [displayedDefinition, displayedEditor, measurements, activeStep?.nodeId, edgeSelection, viewZoom, hoveredEdgeId, controller.definitionDirty, run?.revision]);
  // Opening a workflow restores the saved viewport only when every node still fits.
  useEffect(() => {
    const key = pendingInitialView.current;
    const instance = graphRef.current;
    const stage = editorRoot.current?.querySelector<HTMLElement>(".wf-v2-graph-stage");
    if (!key || key !== canvasViewKey || !instance || !stage || !nodes.length) return;
    if (nodes.some(node => !measurements[node.id])) return;
    pendingInitialView.current = null;
    settledViews.current.add(key);
    const frame = requestAnimationFrame(() => {
      const rect = stage.getBoundingClientRect();
      const bounds = instance.getNodesBounds(nodes);
      if (!viewportShowsBounds(instance.getViewport(), bounds, { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })) {
        void instance.fitView({ ...overviewFitOptions, duration: 220 });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [canvasViewKey, nodes, measurements]);
  // The panel pans aside only while it is open; closing it returns to the pre-panel viewport.
  useLayoutEffect(() => {
    const open = inspectorOpen && (tab !== "node" || Boolean(selectedNode || selectedEdge));
    if (open && !previousInspector.current && graphRef.current) panelViewport.current = { key: canvasViewKey, viewport: graphRef.current.getViewport() };
    else if (!open && previousInspector.current) {
      const saved = panelViewport.current;
      panelViewport.current = null;
      if (saved && saved.key === canvasViewKey) void graphRef.current?.setViewport(saved.viewport, { duration: 200 });
    }
    previousInspector.current = open;
  }, [inspectorOpen, tab, selectedNode, selectedEdge, canvasViewKey]);
  useEffect(() => {
    const runActive = Boolean(run && !["success","failed","cancelled","continued"].includes(run.status));
    if (readOnly || executionView || !controller.dirty || controller.busy || pendingFields.length || runActive) return;
    // One visible failure per document revision; a further edit or Cmd/Ctrl+S retries.
    if (autoSaveFailure.current === definition) return;
    if (autoSaveFailure.current) { autoSaveFailure.current = null; setAutoSaveFailed(false); }
    const timer = window.setTimeout(() => {
      setAutoSaving(true); setAutoSaveFailed(false);
      void controller.saveDocument({ silent: true }).then(saved => { if (!saved) { autoSaveFailure.current = definition; setAutoSaveFailed(true); } }).finally(() => setAutoSaving(false));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [readOnly, executionView, controller.dirty, controller.busy, controller.saveDocument, pendingFields.length, definition, editor, run]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      handleWorkflowShortcut(event, {
        readOnly,
        pendingFieldCount: pendingFields.length,
        activeElement: document.activeElement,
        save: () => {
          void controller.saveDocument().then(saved => { if (saved) { autoSaveFailure.current = null; setAutoSaveFailed(false); } });
        },
        reportPendingFields: () => controller.setError("高级配置还有未应用的编辑，请先应用或放弃，再保存。"),
        undo: controller.undo,
        redo: controller.redo,
      });
    }
    // Focus can fall back to body when a field row disappears, so the listener
    // must live on window rather than on the editor root.
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [controller, readOnly, pendingFields.length]);
  useEffect(() => { const body = document.body; body.classList.add("workflow-live-active"); return () => body.classList.remove("workflow-live-active"); }, []);
  useEffect(() => { const media = window.matchMedia("(max-width: 900px)"); const update = () => { setNarrow(media.matches); if (media.matches) setPaletteOpen(false); }; media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  function navigateGraph(path: string[]) {
    const view = graphRef.current?.getViewport(); if (view) scopeViews.current.set(canvasIdentity, view);
    setGraphPath(path); setSelection(null); setEdgeSelection(null); setInspectorOpen(false);
  }
  function toggleTab(next: typeof tab) { setResourcePanelOpen(false); if (inspectorOpen && tab === next) setInspectorOpen(false); else { clearSelection(); showTab(next); } }
  function showTab(next: typeof tab) { setResourcePanelOpen(false); setTab(next); setInspectorOpen(true); if(narrow) setPaletteOpen(false); }
  function openResourcePanel() { setResourcePanelOpen(true); setInspectorOpen(false); }
  function toggleResourcePanel() { if (resourcePanelOpen) setResourcePanelOpen(false); else openResourcePanel(); }
  function togglePalette() { const open = !paletteOpen; setPaletteOpen(open); if (open) setHistoryOpen(false); if(open && narrow) setInspectorOpen(false); setSelection(null);setEdgeSelection(null); }
  function clearSelection() { setSelection(null);setEdgeSelection(null); if(tab === "node")setInspectorOpen(false); }
  function openExecution(nodeId: string, stepId: string) { setSelection(nodeId);setEdgeSelection(null);setSelectedStepId(stepId);setNodeTab("execution");showTab("node"); }
  function exportDocument() { const exported = (executionView ? controller.runSnapshot : null) ?? {definition:rootController.definition,editor:rootController.editor}; const blob = new Blob([JSON.stringify(exported,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=`${displayedDefinition.name}.json`;document.body.append(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setExportNotice("已发起 JSON 文件下载，请查看浏览器下载列表。"); }
  useEffect(()=>{if(queuedDiagnostic&&JSON.stringify(queuedDiagnostic.graphPath??[])===JSON.stringify(safePath)){const item=queuedDiagnostic;setQueuedDiagnostic(null);locateDiagnostic({...item,graphPath:undefined});}},[queuedDiagnostic,JSON.stringify(safePath)]);
  function locateDiagnostic(item: WorkflowDiagnostic) {
    if(item.graphPath&&JSON.stringify(item.graphPath)!==JSON.stringify(safePath)){setQueuedDiagnostic(item);navigateGraph(item.graphPath);return;}
    const target = diagnosticTarget(item, definition);
    setSelection(target.nodeId ?? null); setEdgeSelection(target.transitionId ?? null);
    if (target.panel !== "problems") showTab(target.panel === "environment" ? "environment" : target.panel === "input" ? "run" : target.panel === "state-field" ? "state" : target.panel);
    // Global Definition fields live in the right advanced panel; the State shortcut normally closes it.
    setInspectorOpen(true);
    if (narrow && target.panel !== "state-field") setPaletteOpen(false);
    if (target.panel === "input") { setInputFocusPointer(item.pointer ?? null); setInputFocusRequest(current => current + 1); return; }
    requestAnimationFrame(() => {
      const elements = [...(editorRoot.current?.querySelectorAll<HTMLElement>("[data-config-field]") ?? [])];
      const fields = target.panel === "environment" ? [editorRoot.current?.querySelector<HTMLElement>('[data-config-field="resources"]')]
        : target.fields.map(name => elements.find(element => element.dataset.configField === name));
      const enabled = "input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)";
      const candidates = fields.filter((field): field is HTMLElement => Boolean(field)).map(field => {
        const stateControl = target.panel === "state-field" && field.dataset.configField === `state/${target.stateField}`;
        const focus = stateControl ? target.control === "reducer" ? field.querySelector<HTMLElement>("select:not(:disabled)")
          : field.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled)') ?? field.querySelector<HTMLElement>(".wf-form-body input:not(:disabled),.wf-form-body select:not(:disabled),.wf-form-body textarea:not(:disabled),.wf-form-body button:not(:disabled),.wf-schema-form>label textarea")
          : field.matches(`${enabled},[tabindex]`) ? field : field.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled)') ?? field.querySelector<HTMLElement>(enabled);
        return { field, focus };
      });
      // An empty/disabled authorization group cannot be focused; continue to its editable JSON fallback.
      const located = candidates.find(candidate => candidate.focus);
      if (located?.focus) {
        const { field, focus } = located;
        const reveal = () => {
          let parent: HTMLElement | null = focus;
          while (parent) { if (parent.tagName === "DETAILS") parent.setAttribute("open", ""); parent = parent.parentElement; }
          field.classList.add("wf-located"); focus!.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }); focus!.focus({ preventScroll: true });
          window.setTimeout(() => field.classList.remove("wf-located"), 3000);
        };
        if (target.panel === "state-field" && field.dataset.configField !== `state/${target.stateField}`) { setInspectorOpen(true); if (narrow) setPaletteOpen(false); requestAnimationFrame(reveal); }
        else reveal();
      }
      if (target.nodeId) void graphRef.current?.fitView({ nodes: [{ id: target.nodeId }], minZoom: .9, maxZoom: 1, duration: 250 });
    });
  }
  function locateFailure() {
    if (!failureTarget || !controller.runSnapshot) return;
    setSnapshotFocus(failureTarget.nodeId); setSnapshot(controller.runSnapshot);
  }
  function locateStateField(field: string) {
    setSnapshot(null); setDialog(null); setViewingRun(false);
    if (rootController.observedRunId) rootController.exitObservation();
    setSelection(null); setEdgeSelection(null); setInspectorOpen(true); showTab("state");
    requestAnimationFrame(() => {
      const details = editorRoot.current?.querySelector<HTMLElement>(`[data-config-field="state/${field}"]`);
      if (!details) return;
      details.setAttribute("open", "");
      details.scrollIntoView({ block: "center", behavior: "instant" });
      details.querySelector<HTMLElement>(`select[aria-label="${field} 字段类型"]`)?.focus({ preventScroll: true });
    });
  }
  function applyFieldTypeFix(field: string, type: StateFieldType) {
    controller.editDefinition(current => {
      let next = withStateFieldSchema(current, field, { type, ...(type === "array" ? { items: { type: "object" } } : {}) });
      const value = current.state.initial[field];
      const matches = type === "string" ? typeof value === "string" : type === "number" ? typeof value === "number" : type === "boolean" ? typeof value === "boolean" : type === "array" ? Array.isArray(value) : value !== null && typeof value === "object" && !Array.isArray(value);
      if (!matches) next = withStateFieldInitial(next, field, stateFieldInitial(type));
      return next;
    }, `state-field-type-${field}`);
  }
  function fixWriteFieldType(field: string, type: StateFieldType) {
    applyFieldTypeFix(field, type);
    locateStateField(field);
  }
  function handleErrorAction(hint: ErrorActionHint) {
    // Error-card reruns prefill from this Run's launch-input snapshot, exactly like
    // the "使用相同输入重新运行" action in the Run panel.
    if (hint === "run") { requestRun(panelRun ?? undefined); return; }
    if (hint === "model-settings") { if (failureTarget?.nodeId) setSelection(failureTarget.nodeId); openResourceCenter("providers"); return; }
    if (hint === "tool-settings") { if (failureTarget?.nodeId) setSelection(failureTarget.nodeId); openToolSettings(); return; }
    if (hint === "fix-field-type") {
      const error = run?.error;
      const type = error?.actualType as StateFieldType | undefined;
      if (!error?.field || !type || !["string", "number", "boolean", "array", "object"].includes(type)) return;
      setSnapshot(null); setDialog(null); setViewingRun(false);
      if (rootController.observedRunId) rootController.exitObservation();
      fixWriteFieldType(error.field, type);
      return;
    }
    if (hint === "field" && run?.error?.field) { locateStateField(run.error.field); return; }
    if (failureTarget) locateFailure();
    else if (selection) { setNodeTab("config"); showTab("node"); }
  }
  function editFailedInput() {
    if (!failureTarget || !run || run.revision !== definition.revision || controller.definitionDirty) return;
    setSnapshot(null); setDialog(null); rootController.exitObservation(); setViewingRun(false);
    locateDiagnostic({ code: run.error?.code ?? "INVALID_NODE_INPUT", severity: "error", scope: "run", message: "", nodeId: failureTarget.nodeId, pointer: failureTarget.pointer });
  }
  function updateNode(updates: Partial<WorkflowNodeV2>) { if (!selectedNode || readOnly) return; controller.editDocument(current => {
      const changed = { ...selectedNode, ...updates };
      let nextDefinition = current.definition;
      if (selectedNode.type === "core.tool" && updates.config && String(updates.config.toolRef ?? "") !== String(selectedNode.config.toolRef ?? "")) {
        const primary = primaryToolOutput(controller.tools.find(tool => tool.ref === updates.config!.toolRef));
        const currentWrites = changed.writes ?? {};
        const placeholder = !Object.keys(currentWrites).length || (Object.keys(currentWrites).length === 1 && currentWrites.result === "/result");
        if (primary && placeholder) {
          changed.writes = { [primary.name]: primary.pointer };
          nextDefinition = withStateField(nextDefinition, primary.name, stateTypeForOutput(primary.type) ?? "object", primary.name);
        }
      }
      const transitions = nextDefinition.transitions.filter(edge=>edge.from!==selectedNode.id || outlets(changed).includes(edge.outlet));
      return {definition:{...nextDefinition,nodes:nextDefinition.nodes.map(node=>node.id===selectedNode.id?changed:node),transitions},editor:{...current.editor,edges:Object.fromEntries(Object.entries(current.editor.edges).filter(([id])=>transitions.some(edge=>edge.id===id)))}};
    }, `node-${selectedNode.id}-${Object.keys(updates).join()}`); }
  function updateNodeById(id: string, updates: Partial<WorkflowNodeV2>) {
    if (readOnly) return;
    controller.editDocument(current => ({ ...current, definition: { ...current.definition, nodes: current.definition.nodes.map(node => node.id === id ? { ...node, ...updates } : node) } }), `node-${id}-resource`);
  }
  function openModelForNode(id: string) {
    if (readOnly) return;
    setSelection(id); setEdgeSelection(null); setNodeTab("config"); showTab("node");
    openResourceCenter("providers", { kind: "create", section: "providers", onCreated: (ref, version, content) => {
      const modelRefs = Array.isArray(content?.modelRefs) ? (content.modelRefs as JsonValue[]).map(String) : [];
      updateNodeById(id, { config: { ...(definition.nodes.find(node => node.id === id)?.config ?? {}), providerRef: `p4:${ownerId}:${ref}:${version}`, modelRef: modelRefs[0] ?? "" } });
    } });
  }
  function openToolSettings() { openResourceCenter("apis"); }
  function addNodeAt(type: string, position?: { x: number; y: number }) {
    if (readOnly) return;
    const id = crypto.randomUUID();
    const node = authoringNodeTypes.some(item => item.type === type) ? createAuthoringNode(type,id) : createNodeV2(type,id);
    controller.editDocument(current => { const point = position ?? additionPosition(current); return insertAuthoringNode(current,node,point.x,point.y); });
    setSelection(id); showTab("node");
    requestAnimationFrame(()=>{void graphRef.current?.fitView({nodes:[{id}],minZoom:.9,maxZoom:1,duration:200});});
  }
  function addNode(type: string) { addNodeAt(type); }
  async function applyStartingTemplate(kind: StartingTemplateKind) {
    if (readOnly) return;
    const provider = activeEnvironment?.providers[0];
    let hnTool = controller.tools.find(tool => tool.ref === "hn_search") ?? controller.tools.find(tool => /hacker news/i.test(tool.name));
    if (kind === "search" && !hnTool) {
      try { hnTool = (await workflowApiV2.tools(controller.environmentRef)).items.find(tool => tool.ref === "hn_search"); } catch { hnTool = undefined; }
    }
    const document = createStartingTemplate(kind, rootController.definition, { providerRef: provider?.ref, modelRef: provider?.modelRefs[0], hnTool });
    navigateGraph([]);
    controller.editDocument(() => document);
    replaceRunInput({}, true);
    setPaletteOpen(false); setInspectorOpen(false); setStartCardsDismissed(true); setDialog(null);
    // Highlight the model node that still needs a connection; never cover the generated flow
    // with an auto-opened inspector. The user opens it deliberately after seeing the graph.
    const firstId = kind === "triage" ? "classify" : "answer";
    setSelection(firstId); setSpotlightNodeId(firstId); setNodeTab("config"); setInspectorOpen(false);
    // Explicit user-created structure: one fitView is allowed here.
    requestAnimationFrame(() => requestAnimationFrame(() => { void graphRef.current?.fitView({ minZoom: .9, maxZoom: 1, duration: 250 }); }));
  }
  function deleteElements(nodeIds: string[], edgeIds: string[] = []) {
    if(readOnly)return;
    // The selected node/Inspector button will unmount. Keep shortcuts in this editor.
    editorRoot.current?.focus({ preventScroll: true });
    controller.editDocument(current => removeCanvasElements(current, nodeIds, edgeIds));
    setSelection(null); setEdgeSelection(null);
  }
  function deleteNode(id: string) { deleteElements([id]); }
  /** Copies configuration and bindings; connections stay with the original node. */
  function duplicateNode(id: string) {
    if (readOnly || !definition) return;
    const source = definition.nodes.find(node => node.id === id);
    if (!source) return;
    const copyId = crypto.randomUUID();
    const position = displayedEditor.nodes[id] ?? { x: 80, y: 160 };
    const copy: WorkflowNodeV2 = { ...source, id: copyId, label: `${source.label} 副本`, config: JSON.parse(JSON.stringify(source.config)) as Record<string, JsonValue>, inputs: { ...source.inputs }, writes: { ...source.writes } };
    controller.editDocument(current => ({ definition: { ...current.definition, nodes: [...current.definition.nodes, copy] }, editor: { ...current.editor, nodes: { ...current.editor.nodes, [copyId]: { x: position.x + 32, y: position.y + 32 } } } }), `duplicate-${id}`);
    setSelection(copyId); setEdgeSelection(null); showTab("node");
  }
  /**
   * On an explicit canvas click, pan just enough to keep the node clear of the floating
   * inspector. Zoom and node positions stay untouched; presentation never re-lays out.
   */
  function revealNodeBesidePanel(id: string) {
    const instance = graphRef.current;
    const root = editorRoot.current;
    if (!instance || !root) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const node = root.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
      const panel = root.querySelector<HTMLElement>(".wf-v2-inspector:not(.closed)");
      if (!node || !panel) return;
      const nodeRect = node.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const gap = 20;
      const overlap = nodeRect.right - (panelRect.left - gap);
      if (overlap <= 0) return;
      const viewport = instance.getViewport();
      void instance.setViewport({ ...viewport, x: viewport.x - overlap }, { duration: 200 });
    }));
  }
  function revealKeyboardNode(event: FocusEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(".react-flow__node:focus-visible")) return;
    const id = target.dataset.id;
    const instance = graphRef.current;
    if (!id || !instance) return;
    const node = target.getBoundingClientRect(), area = event.currentTarget.getBoundingClientRect();
    if (node.left >= area.left + 12 && node.right <= area.right - 12 && node.top >= area.top + 12 && node.bottom <= area.bottom - 12) return;
    // SDK focus panning accepts partially visible nodes; keyboard users need the full node.
    const zoom = instance.getViewport().zoom;
    void instance.fitView({ nodes: [{ id }], minZoom: zoom, maxZoom: zoom, duration: 150 });
  }
  function connect(connection: Connection, edgeId?: string) {
    if(readOnly)return;
    if (!connection.source || !connection.target || !connection.sourceHandle) { controller.setError("请选择完整的来源出口与目标入口。"); return; }
    const from = definition.nodes.find(node => node.id === connection.source);
    if(from?.type==="control.send"&&connection.sourceHandle==="item"){
      const target=definition.nodes.find(node=>node.id===connection.target);if(!target||target.id===from.id||["core.start","core.end"].includes(target.type)){controller.setError("请选择另一个执行节点作为逐项派发目标。");return;}
      controller.editDefinition(current=>({...current,nodes:current.nodes.map(node=>node.id===from.id?{...node,config:{...node.config,target:connection.target!}}:node)}));return;
    } const to = definition.nodes.find(node => node.id === connection.target);
    if (!from || !to || to.type === "core.start" || !outlets(from).includes(connection.sourceHandle)) { controller.setError("这个端口不能连接，请选择节点的输出与下游输入。"); return; }
    const existing = definition.transitions.find(edge => edge.from === from.id && edge.outlet === connection.sourceHandle && edge.id !== edgeId);
    const replacedId = existing && edgeId ? existing.id : undefined;
    const id = edgeId ?? existing?.id ?? crypto.randomUUID();
    controller.editDocument(current => ({ definition: { ...current.definition, transitions: [...current.definition.transitions.filter(edge => edge.id !== id && edge.id !== replacedId), { id, from: from.id, outlet: connection.sourceHandle!, to: to.id }] }, editor: { ...current.editor, edges: { ...Object.fromEntries(Object.entries(current.editor.edges).filter(([otherId]) => otherId !== replacedId)), [id]: { routing: { version: 1, mode: "auto" } } } } })); setEdgeSelection(id);
  }
  function onNodesChange(changes: NodeChange<CanvasNode>[]) {
    for (const change of changes) {
      if (change.type === "dimensions" && change.dimensions) setMeasurements(current => ({ ...current, [change.id]: change.dimensions! }));
      if (!readOnly && change.type === "position" && change.position) controller.editEditor(current => ({ ...current, nodes: { ...current.nodes, [change.id]: change.position! } }), `drag-${change.id}`);
    }
    const selected = [...changes].reverse().find(change => change.type === "select" && change.selected);
    if (selected?.type === "select") { setSelection(selected.id); setEdgeSelection(null); showTab("node"); }
    else if (changes.some(change => change.type === "select" && change.id === selection && !change.selected)) setSelection(null);
  }
  function removeEdge(id: string) { deleteElements([], [id]); }
  function onEdgesChange(changes: EdgeChange[]) {
    const selected = [...changes].reverse().find(change => change.type === "select" && change.selected);
    if (selected?.type === "select") { setEdgeSelection(selected.id); setSelection(null); showTab("node"); }
    else if (changes.some(change => change.type === "select" && change.id === edgeSelection && !change.selected)) setEdgeSelection(null);
  }
  function setRouting(id: string, routing: WorkflowRouting, group?: string) { if(readOnly)return; controller.editEditor(current => ({ ...current, edges: { ...current.edges, [id]: { ...current.edges[id], routing } } }),group); }
  function locateInputError() { setRunDialogOpen(true); showTab("run"); setInputFocusPointer(null); setInputFocusRequest(current => current + 1); }
  function locatePendingEdit() {
    const id = pendingFields[0]; const draft = drafts.current.get(id); if (!draft) return;
    if (draft.ownerNodeId) { setSelection(draft.ownerNodeId); setEdgeSelection(null); showTab("node"); }
    else { showTab("state"); if (!draft.ownerStateField) { setInspectorOpen(true); if (narrow) setPaletteOpen(false); } }
    requestAnimationFrame(() => {
      const field = [...(editorRoot.current?.querySelectorAll<HTMLElement>("[data-draft-id]") ?? [])].find(element => element.dataset.draftId === id);
      if (!field) return;
      let parent = field.parentElement;
      while (parent) { if (parent.tagName === "DETAILS") parent.setAttribute("open", ""); parent = parent.parentElement; }
      field.scrollIntoView({ block: "center" }); (field.querySelector<HTMLElement>('[aria-invalid="true"]') ?? field.querySelector<HTMLElement>("textarea,input,select") ?? field).focus();
    });
  }
  function blockPending(action: "save" | "run" | "validate") { setPendingAction(action); controller.setError(""); locatePendingEdit(); }
  async function copyReadableResult() {
    if (!run) return;
    const runId = run.runId;
    try {
      const missingOutput = !readableAnswer(run.output) && Object.keys(run.output && typeof run.output === "object" && !Array.isArray(run.output) ? run.output : {}).length === 0;
      const stepAnswer = missingOutput ? [...controller.steps].reverse().map(step => readableAnswer(step.output)).find(answer => answer !== undefined) : undefined;
      await navigator.clipboard.writeText(stepAnswer ?? outputText(run.output ?? run.finalState));
      setCopyFeedback({ runId, failed: false, message: "已复制可读结果。" });
    } catch {
      setCopyFeedback({ runId, failed: true, message: "浏览器未允许复制。请允许剪贴板访问，或选中结果手动复制。" });
    }
  }
  function localPreflight(input: JsonValue = rootController.input) {
    return runPreflight({ definition: rootController.definition, input, environment: activeEnvironment, tools: controller.tools, variableValues: activeVariableValues });
  }
  function reportBlockingIssues(issues: readonly RunPreflightIssue[]) {
    const blocking = issues.filter(issue => issue.tab !== "run");
    setRunBlockedIssues(blocking);
  }
  function locatePreflightIssue(issue: RunPreflightIssue) {
    setPreflightIssues([]);
    // Startup input lives in the same dialog; keep it open and focus the exact field.
    if (issue.tab === "run") { setInputFocusPointer(issue.pointer ?? null); setInputFocusRequest(current => current + 1); return; }
    setRunDialogOpen(false); setDialog(null);
    if (issue.nodeId) { setSelection(issue.nodeId); setEdgeSelection(null); }
    if (issue.tab === "state") { showTab("state"); setSelection(null); return; }
    if (issue.tab === "environment") { setSelection(issue.nodeId ?? null); showTab("environment"); return; }
    showTab("node"); setNodeTab("config");
  }
  function startRunFromDialog() {
    if (controller.busy || readOnly) return;
    const issues = localPreflight();
    if (issues.length) { reportBlockingIssues(issues); setPreflightIssues(issues.filter(item => item.tab !== "run")); controller.setError(""); return; }
    setRunBlockedIssues([]); setPreflightIssues([]); setRunDialogOpen(false); setDialog(null); setViewingRun(false); setHistoryOpen(false); setReusedRunRevision(null);
    void controller.startRun(controller.dirty);
  }
  /** Reuses the safe fields of a Run input snapshot; omitted fields stay visible in the dialog. */
  function applyRunInputReuse(target: WorkflowRunV2): JsonValue | undefined {
    const reuse = reusableRunInput(target);
    if (!reuse.available) return undefined;
    replaceRunInput(reuse.input);
    setInputReuseOmissions(reuse.omissions);
    setReusedRunRevision(target.revision);
    if (!reuse.complete) controller.setError("已复用安全字段；敏感或缺失字段需要重新填写。");
    return reuse.input;
  }
  function runNow(input: JsonValue = rootController.input) {
    if (readOnly) return;
    const issues = localPreflight(input);
    if (issues.length) {
      reportBlockingIssues(issues);
      if (callerInputReadOnly) { controller.setError(`未启动运行：${issues.map(issue => issue.summary ?? issue.title).join("；")}`); return; }
      setPreflightIssues(issues.filter(item => item.tab !== "run")); setRunDialogOpen(true); controller.setError(""); return;
    }
    setRunBlockedIssues([]); setPreflightIssues([]); setRunDialogOpen(false); setDialog(null); setViewingRun(false); setHistoryOpen(false); setReusedRunRevision(null);
    void controller.startRun(controller.dirty);
  }
  function replayOriginal() {
    if (readOnly || !run || !run.inputReuse?.complete || run.revision === definition.revision) return;
    const target = run;
    setPendingConfirm({ title: "新建一次运行？", message: `使用修订 ${target.revision} 和脱敏快照中的输入创建新运行？外部写工具可能再次执行。`, confirmLabel: "新建运行", danger: true, onConfirm: () => void replayOriginalWith(target) });
  }
  async function replayOriginalWith(target: WorkflowRunV2) {
    const input = reusableRunInput(target).input;
    await controller.operation(async () => {
      const created = await workflowApiV2.createRun(target.workflowId, target.revision, input, target.environmentRef, crypto.randomUUID(), target.launchContext ?? undefined);
      if (created.historyExpired) { controller.setError("请求已执行，但运行历史已清理；没有自动重试。"); return; }
      controller.selectRun(await workflowApiV2.run(created.runId));
      setViewingRun(true); showTab("run"); setHistoryOpen(true);
    });
  }
  /** `reuse` is set by the error card and history rerun actions to prefill this Run's input. */
  function requestRun(reuse?: WorkflowRunV2) {
    setViewingRun(false);
    const retired = rootController.definition.nodes.find(node => isRetiredNode(node));
    if(retired){controller.rejectRunPreparation(`此流程包含旧版本节点「${retired.label}」，请删除后重新添加。`);setSelection(retired.id);showTab("node");return;}
    if (controller.submitUnknown) { showTab("run"); controller.setError("上次提交状态待确认，请先确认原请求，避免重复执行。"); return; }
    if (pendingFields.length) { controller.rejectRunPreparation("未启动运行：请先完成当前配置编辑。"); blockPending("run"); return; }
    if (callerInputReadOnly) {
      if (controller.inputInvalid) { controller.rejectRunPreparation("调用方启动输入不符合当前图的启动输入要求。"); showTab("run"); return; }
      setReusedRunRevision(null); setInputReuseOmissions([]);
      runNow(); return;
    }
    const reusedInput = reuse ? applyRunInputReuse(reuse) : undefined;
    if (reusedInput === undefined) { setReusedRunRevision(null); setInputReuseOmissions([]); }
    const schema = rootController.definition.inputSchema;
    const fields = Object.keys(schema.properties ?? {}).length;
    const emptyValid = validateSchemaValue(schema, {}).valid;
    const issues = localPreflight(reusedInput);
    if (!reuse && !fields && emptyValid && !controller.inputInvalid && !issues.length) { runNow(reusedInput); return; }
    reportBlockingIssues(issues);
    setPreflightIssues(issues.filter(item => item.tab !== "run")); setRunDialogOpen(true);
  }
  async function openVersions() { navigateGraph([]); setSnapshotFocus(null); setDialog("versions"); await controller.operation(async () => setRevisions((await workflowApiV2.revisions(rootController.definition.workflowId)).items)); }
  async function restore() { if (!snapshot) return; const candidate = { definition: { ...snapshot.definition, revision: rootController.definition.revision }, editor: { ...snapshot.editor, editorRevision: rootController.editor.editorRevision, definitionRevision: rootController.definition.revision, edges: Object.fromEntries(snapshot.definition.transitions.map(edge => [edge.id, { ...snapshot.editor.edges[edge.id], routing: snapshot.editor.edges[edge.id]?.routing ?? {version:1,mode:"auto" as const} }])) } }; const saved = await controller.restoreDocument(candidate); if (saved) { setSnapshot(null); setDialog(null); } }
  const { data: extensionCatalog, refresh: refreshExtensions } = useExtensions(controller.environmentRef);
  const resourceUpdates = useMemo(() => extensionCatalog ? connectionUpdates({ definition: rootController.definition, connections: extensionCatalog.connections, tools: controller.tools }) : [], [extensionCatalog, rootController.definition, controller.tools]);
  const currentRunId = controller.observedRunId ?? controller.history[0]?.runId ?? null;
  const usesSessionFeatures = rootController.definition.nodes.some(node => node.type === "core.memory" || node.type === "core.subgraph" || Boolean(node.config.authoring))
    || Boolean(rootController.definition.policy.authoring)
    || Boolean(run && (run.operation === "next" || run.operation === "branch"));
  const showSessionTools = usesSessionFeatures || Boolean(controller.currentThread) || run?.status === "waiting";
  const hasSubgraphHistory = subgraphInvocations(controller.steps).length > 0;
  const currentRunRecord = controller.history.find(record => record.runId === currentRunId) ?? null;
  // The data panel shows the selected run, or the newest record before any run is opened.
  const panelRun = run ?? currentRunRecord ?? rootController.history[0] ?? null;
  const runSamples = useMemo<Record<string, JsonValue>>(() => {
    const samples: Record<string, JsonValue> = {};
    for (const step of controller.steps) {
      const node = definition.nodes.find(candidate => candidate.id === step.nodeId);
      if (!node) continue;
      for (const [field, pointer] of Object.entries(node.writes ?? {})) {
        if (typeof pointer !== "string" || field in samples) continue;
        const value = readOutputPointer(step.output, pointer);
        if (value !== undefined) samples[field] = value;
      }
    }
    return samples;
  }, [controller.steps, definition.nodes]);
  const selectedLastOutput = useMemo<JsonValue | undefined>(() => {
    if (!selectedNode) return undefined;
    const step = [...controller.steps].reverse().find(candidate => candidate.nodeId === selectedNode.id && candidate.output !== undefined);
    return step?.output;
  }, [controller.steps, selectedNode]);
  const workbenchTestInput = useMemo<JsonValue>(() => {
    if (run?.inputReuse?.fields?.length) return run.inputReuse.fields.reduce<JsonValue>((value, field) => putValue(value, field.pointer, field.value), {});
    const fromSteps: Record<string, JsonValue> = {};
    for (const node of rootController.definition.nodes) {
      for (const [parameter, binding] of Object.entries(node.inputs)) {
        if (binding.source !== "input" || typeof binding.pointer !== "string") continue;
        const step = [...controller.steps].reverse().find(candidate => candidate.nodeId === node.id && candidate.input && typeof candidate.input === "object" && !Array.isArray(candidate.input));
        const value = step && typeof step.input === "object" && !Array.isArray(step.input) ? (step.input as Record<string, JsonValue>)[parameter] : undefined;
        if (value !== undefined) fromSteps[binding.pointer.replace(/^\//, "").replace(/~1/g, "/").replace(/~0/g, "~")] = value;
      }
    }
    if (Object.keys(fromSteps).length) return fromSteps;
    const state = run?.finalState;
    const properties = rootController.definition.inputSchema.properties;
    if (state && typeof state === "object" && !Array.isArray(state) && properties && typeof properties === "object" && !Array.isArray(properties)) {
      const derived = Object.fromEntries(Object.keys(properties).filter(name => Object.prototype.hasOwnProperty.call(state, name)).map(name => [name, (state as Record<string, JsonValue>)[name]]));
      if (Object.keys(derived).length) return derived;
    }
    return controller.input;
  }, [run?.inputReuse, run?.finalState, controller.input, controller.steps, rootController.definition]);
  function openResourceCenter(section: ResourceSection = "providers", intent?: { kind: "create"; section: ResourceSection; onCreated: (ref: string, version: number, content?: Record<string, JsonValue>) => void }) {
    setResourceCenter({ open: true, initialSection: section, ...(intent ? { intent } : {}) });
  }
  function openResourceEditor(target: ResourceEditorTarget, onSaved?: (ref: string, version: number, content?: Record<string, JsonValue>) => void) { setResourcePanelOpen(false); setResourceEditor({ target, onSaved }); }
  async function bindCreatedResource(section: ResourceSection, logicalRef: string, version: number, content?: Record<string, JsonValue>) {
    const node = selectedNode;
    if (!node || readOnly) return;
    await controller.refreshEnvironmentResources();
    if (section === "providers") {
      const modelRefs = Array.isArray(content?.modelRefs) ? (content?.modelRefs as JsonValue[]).map(String) : [];
      updateNode({ config: { ...node.config, providerRef: `p4:${ownerId}:${logicalRef}:${version}`, modelRef: modelRefs[0] ?? "" } });
      return;
    }
    if (section === "apis" || section === "mcp") {
      let tool: WorkflowTool | undefined;
      try { const result = await workflowApiV2.tools(controller.environmentRef); tool = result.items.find(item => item.connectionRef === logicalRef && item.version === version) ?? result.items.find(item => item.connectionRef === logicalRef); } catch { tool = undefined; }
      updateNode({ config: { ...node.config, toolRef: tool?.ref ?? `p4:${ownerId}:${logicalRef}:${version}`, contractDigest: tool?.contractDigest ?? "" } });
    }
  }
  const providerValue = useMemo(() => drafts.current, []);
  const flowProducers = useMemo(() => stateFieldProducers(displayedDefinition), [displayedDefinition]);
  const flowConsumers = useMemo(() => stateFieldConsumers(displayedDefinition), [displayedDefinition]);
  const flowNodeLabels = useMemo(() => Object.fromEntries(nodeLabelIndex(displayedDefinition)), [displayedDefinition]);
  const inputInitializedFields = useMemo(() => new Set(Object.entries(displayedDefinition.state.inputBindings).filter(([, binding]) => binding.source === "input").map(([field]) => field)), [displayedDefinition.state.inputBindings]);
  const environmentSchema = useMemo<JsonSchema>(() => ({ type: "object", properties: { ...Object.fromEntries(Object.entries(environment?.variables ?? {}).map(([key, value]) => [key, { type: typeof value }])), ...Object.fromEntries((variableConfiguration?.variables ?? []).map(variable => [variable.key, { type: typeof variable.value }])) } }), [environment, variableConfiguration]);
  function applyNodeWrites(writes: Record<string, string>) {
    if (!selectedNode || readOnly) return;
    controller.editDocument(current => {
      const currentNode = current.definition.nodes.find(node => node.id === selectedNode.id);
      if (!currentNode) return current;
      const removed = Object.keys(currentNode.writes).filter(field => !Object.prototype.hasOwnProperty.call(writes, field));
      let definition: WorkflowDefinitionV2 = { ...current.definition, nodes: current.definition.nodes.map(node => node.id === selectedNode.id ? { ...node, writes } : node) };
      definition = pruneOrphanStateFields(definition, removed);
      return { ...current, definition };
    }, `node-${selectedNode.id}-writes`);
  }
  function commitStateFieldInput(node: WorkflowNodeV2, paramName: string, field: string, type: StateFieldType) {
    if (readOnly) return;
    controller.editDocument(current => ({ ...current, definition: withStateFieldInput(current.definition, node.id, paramName, field, type) }), `node-${node.id}-state-input-${field}`);
  }
  function commitStateFieldOutput(node: WorkflowNodeV2, field: string, type: StateFieldType, pointer: string, replaceField?: string) {
    if (readOnly) return;
    controller.editDocument(current => {
      let next = withStateFieldWrite(current.definition, node.id, field, type, pointer);
      const removed: string[] = [];
      if (replaceField && replaceField !== field) {
        next = { ...next, nodes: next.nodes.map(item => item.id === node.id ? { ...item, writes: Object.fromEntries(Object.entries(item.writes).filter(([name]) => name !== replaceField)) } : item) };
        removed.push(replaceField);
      }
      return { ...current, definition: pruneOrphanStateFields(next, removed) };
    }, `node-${node.id}-state-output-${field}`);
  }
  function addOutputRows(node: WorkflowNodeV2, rows: readonly { field: string; type: StateFieldType; pointer: string }[]) {
    if (readOnly || !rows.length) return;
    controller.editDocument(current => {
      let next = current.definition;
      for (const row of rows) next = withStateFieldWrite(next, node.id, row.field, row.type, row.pointer);
      return { ...current, definition: next };
    }, `node-${node.id}-outputs-add`);
  }
  function addStructuredOutputField(node: WorkflowNodeV2, field: { name: string; type: "string" | "number" | "boolean" | "array" | "object"; description?: string }) {
    if (readOnly) return;
    controller.editDefinition(current => withModelStructuredField(current, node.id, field), `node-${node.id}-structured-${field.name}`);
  }
  function removeStructuredOutputField(node: WorkflowNodeV2, name: string) {
    if (readOnly) return;
    controller.editDefinition(current => removeModelStructuredField(current, node.id, name), `node-${node.id}-structured-remove-${name}`);
  }
  function renameStructuredOutputField(node: WorkflowNodeV2, from: string, to: string) {
    if (readOnly) return;
    controller.editDefinition(current => renameModelStructuredField(current, node.id, from, to), `node-${node.id}-structured-rename-${from}-${to}`);
  }
  function renameOutputWriteField(node: WorkflowNodeV2, from: string, to: string) {
    if (readOnly) return;
    controller.editDefinition(current => node.type === "core.llm"
      ? renameModelStructuredWriteField(current, node.id, from, to)
      : renameStateField(current, from, to), `state-field-rename-${from}-${to}`);
  }
  function editToolResource(tool: WorkflowTool | undefined) {
    if (!tool || readOnly) return;
    if (tool.connectionRef) openResourceEditor({ kind: "api", mode: "edit", ref: tool.connectionRef });
    else openResourceEditor({ kind: "api", mode: "create", platformTool: tool });
  }
  function setOutputReducer(field: string, reducer: string) {
    if (readOnly) return;
    controller.editDefinition(current => withStateReducer(current, field, reducer), `state-reducer-${field}`);
  }
  function removeRouterOutlet(nodeId: string, outletId: string) {
    controller.editDocument(current => {
      const transitions = current.definition.transitions.filter(edge => edge.from !== nodeId || edge.outlet !== outletId);
      return { definition: { ...current.definition, nodes: current.definition.nodes.map(node => node.id === nodeId ? { ...node, config: { ...node.config, cases: (node.config.cases as { id: string }[]).filter(item => item.id !== outletId).map((item, index) => ({ ...item, priority: index + 1 })) } } : node), transitions }, editor: { ...current.editor, edges: Object.fromEntries(Object.entries(current.editor.edges).filter(([key]) => transitions.some(edge => edge.id === key))) } };
    });
  }
  function applyNodeParams(node: WorkflowNodeV2, inputs: Record<string, Binding>) {
    const next = withRenamedNodeParams(node, inputs);
    updateNode({ config: next.config, inputs: next.inputs });
  }
  function nodeOutputKeys(node: WorkflowNodeV2): string[] {
    if (node.type === "core.llm") return ["text", ...structuredOutputFields(node).map(field => field.name), "messages", "toolCalls"];
    if (node.type === "core.tool") { const tool = controller.tools.find(item => item.ref === node.config.toolRef); return nodeOutputItems(node, tool).map(item => item.key); }
    if (node.type === "core.tool_dispatch") return ["toolMessages"];
    if (node.type === "core.transform") return String(node.config.operationRef) === "core.message" ? ["messages"] : ["value"];
    if (node.type === "core.function") { const properties = (node.config.outputSchema as JsonSchema | undefined)?.properties; return properties && typeof properties === "object" && !Array.isArray(properties) ? Object.keys(properties) : ["value"]; }
    if (node.type === "core.memory") return ["value"];
    if (node.type === "core.progress") return ["message", "percent"];
    if (node.type === "core.subgraph") return ["result"];
    return [];
  }
  function nodeProcessing(node: WorkflowNodeV2) {
    if (authoringNodeTypes.some(item => item.type === node.type)) return <AuthoringProcessing environmentRef={environment?.environmentRef} node={node} graph={definition} onChange={updateNode} hideHeading onEditFunction={(ref, version) => openResourceEditor({ kind: "function", mode: "edit", ref, version })}/>;
    if (node.type === "core.router") return <RouterFields node={node} stateSchema={definition.state.schema} onChange={updateNode} onRemoveOutlet={id => removeRouterOutlet(node.id, id)} hideHeading/>;
    if (node.type === "core.start") return <StartInputFields definition={definition} onChange={controller.editDefinition}/>;
    return <ProcessingFields node={node} environment={activeEnvironment} tools={controller.tools} stateSchema={definition.state.schema} onChange={updateNode} onAddModel={() => openResourceEditor({ kind: "provider", mode: "create" }, (ref, version, content) => void bindCreatedResource("providers", ref, version, content))} hideHeading/>;
  }
  function nodeOutletsSection(node: WorkflowNodeV2) {
    return <div data-config-field="outlets" className="wf-nodepanel-outlets">
      {outlets(node).map(outlet => {
        const connected = definition.transitions.find(edge => edge.from === node.id && edge.outlet === outlet);
        const connectedTo = connected ? definition.nodes.find(candidate => candidate.id === connected.to) : undefined;
        const value = node.type === "control.send" && outlet === "item" ? String(node.config.target ?? "") : connected?.to ?? "";
        return <label key={outlet}>
          <span>{outletDisplayName(node, outlet) || "下一步"}</span>
          <select aria-label={`出口 ${outlet}`} disabled={readOnly} value={value} onChange={event => {
            if (event.target.value) connect({ source: node.id, target: event.target.value, sourceHandle: outlet, targetHandle: "input" }, connected?.id);
            else if (node.type === "control.send" && outlet === "item") updateNode({ config: { ...node.config, target: "" } });
            else if (connected) removeEdge(connected.id);
          }}>
            <option value="">未连接</option>
            {definition.nodes.filter(candidate => candidate.id !== node.id && candidate.type !== "core.start").map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
          </select>
          <small className={connectedTo ? "wf-outlet-connected" : "wf-outlet-unconnected"}>{connectedTo ? `已连接：${connectedTo.label}` : "未连接"}</small>
        </label>;
      })}
    </div>;
  }
  function nodeAdvancedSection(node: WorkflowNodeV2) {
    const writes = Object.keys(node.writes);
    const reducerOptions = { replace: "替换", append: "追加", messages: "合并消息" } as Record<string, string>;
    return <fieldset className="wf-node-form" disabled={readOnly}>
      {node.type === "core.llm" ? <LlmAdvancedSettings node={node} stateSchema={definition.state.schema} onChange={updateNode}/> : null}
      <details><summary>节点参数</summary><JsonField ownerNodeId={node.id} fieldId={`${node.id}-config`} label="节点参数" value={node.config} onChange={value => updateNode({ config: value })}/></details>
      {writes.length ? <div className="wf-write-reducers"><h4>输出写入方式</h4>{writes.map(field => {
        const current = definition.state.reducers[field]?.name ?? "replace";
        const custom = !Object.prototype.hasOwnProperty.call(reducerOptions, current);
        return <label key={field}>{field}<select aria-label={`${field} 更新方式`} value={current} onChange={event => setOutputReducer(field, event.target.value)}>{Object.entries(reducerOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}{custom ? <option value={current}>自定义</option> : null}</select></label>;
      })}<small>替换会覆盖旧值；追加会把新值加到列表末尾；合并消息按消息身份保留对话。</small></div> : null}
      <details><summary>原始绑定与写入</summary><JsonField ownerNodeId={node.id} fieldId={`${node.id}-bindings`} label="输入绑定" value={node.inputs} onChange={inputs => updateNode({ inputs })}/><JsonField ownerNodeId={node.id} fieldId={`${node.id}-writes`} label="写入映射" value={node.writes} onChange={writes => updateNode({ writes })}/></details>
      <NodeRuntimeFields environmentRef={environment?.environmentRef} persistent={environment?.capabilities.includes("interrupt")} key={`${node.id}-runtime`} node={node} graph={definition} onChange={updateNode}/>
    </fieldset>;
  }
  function nodeProcessingDescription(node: WorkflowNodeV2) {
    if (node.type === "core.tool") {
      const tool = controller.tools.find(item => item.ref === node.config.toolRef);
      return `调用 ${tool?.name ?? "工具"}`;
    }
    if (node.type === "core.llm") {
      const provider = activeEnvironment?.providers.find(item => item.ref === node.config.providerRef);
      const model = String(node.config.modelRef || "模型");
      return `调用 ${provider?.name ? `${provider.name} · ` : ""}${model} 生成回答`;
    }
    return processingDescription(node);
  }
  function nodeSections(node: WorkflowNodeV2, onDropBinding?: (target: string | null, binding: Binding) => void): NodePanelSection[] {
    const sections: NodePanelSection[] = [];
    const tableInputs = !node.type.startsWith("control.") && !["core.start", "core.end", "core.router"].includes(node.type);
    if (tableInputs) {
      const legacyTool = node.type === "core.tool" && node.typeVersion < 2;
      const tool = node.type === "core.tool" ? controller.tools.find(item => item.ref === node.config.toolRef) : undefined;
      const needsConnection = node.type === "core.tool" && Boolean(String(node.config.toolRef).startsWith("p4:") || tool?.connectionRef);
      sections.push({ id: "inputs", title: "输入", description: "这个节点要用到的数据", count: node.type === "core.tool" ? toolParamRows(tool?.inputSchema ?? { type: "object", properties: {} }, node.inputs).length : Object.keys(node.inputs).length, ...(node.type !== "core.tool" && !legacyTool && !readOnly ? { action: { label: "＋ 添加输入", onClick: () => applyNodeParams(node, addDeclaredParam(node.inputs).inputs) } } : {}), content: <>{legacyTool ? <p className="wf-field-note">此工具节点仍是旧版定义；请删除后重新添加。</p> : null}{needsConnection ? <button type="button" className="wf-text-button" onClick={() => openResourceEditor({ kind: "api", mode: "create" }, (ref, version, content) => void bindCreatedResource("apis", ref, version, content))}>新建工具连接</button> : null}<NodeParamsTable mode={node.type === "core.tool" ? "schema" : "declared"} readOnly={readOnly || legacyTool} inputs={node.type === "core.llm" ? Object.fromEntries(Object.entries(node.inputs).filter(([name]) => name !== "history")) : node.inputs} onChangeInputs={inputs => applyNodeParams(node, inputs)} paramSchema={nodeParamSchema(node)} startInputSchema={definition.inputSchema} stateSchema={definition.state.schema} environmentSchema={environmentSchema} environmentVariables={activeVariableValues} producers={flowProducers} laterProducerFields={laterProducerFields(definition, node.id, flowProducers)} nodeLabels={flowNodeLabels} samples={runSamples} inputInitializedFields={inputInitializedFields} onCreateStateField={(field, type, paramName) => commitStateFieldInput(node, paramName, field, type)} showAdd={false} tool={tool} onEditTool={() => editToolResource(tool)} {...(onDropBinding ? { onDropBinding } : {})}/></> });
    }
    sections.push({ id: "processing", title: "处理", description: nodeProcessingDescription(node), content: <fieldset className="wf-node-form" disabled={readOnly}>{nodeProcessing(node)}</fieldset> });
    if (isRetiredNode(node)) sections.push({ id: "retired", title: "旧版本节点", content: <p role="alert" className="wf-field-note">此节点是旧版本，请删除后重新添加。旧版定义不再执行，也不会自动转换。</p> });
    const outputKeys = nodeOutputKeys(node);
    if (outputKeys.length || Object.keys(node.writes).length) {
      const addOpen = outputAddNode === node.id;
      const structured = node.type === "core.llm" && structuredOutputFields(node).length > 0;
      const tool = node.type === "core.tool" ? controller.tools.find(item => item.ref === node.config.toolRef) : undefined;
      sections.push({
        id: "outputs",
        title: "输出",
        description: structured ? "模型将按这些字段返回结果" : "把结果写入流程数据",
        count: Object.keys(node.writes).length,
        ...(!readOnly ? { action: { label: "＋ 添加输出", expanded: addOpen, onClick: () => setOutputAddNode(current => current === node.id ? null : node.id) } } : {}),
        content: <NodeOutputsTable
          node={node}
          writes={node.writes}
          onChangeWrites={applyNodeWrites}
          stateSchema={definition.state.schema}
          tool={tool}
          lastOutput={selectedLastOutput}
          consumers={flowConsumers}
          nodeLabels={flowNodeLabels}
          addOpen={addOpen}
          onCloseAdd={() => setOutputAddNode(null)}
          onCreateStateField={(field, type, pointer, replaceField) => commitStateFieldOutput(node, field, type, pointer, replaceField)}
          onAddOutputs={rows => addOutputRows(node, rows as { field: string; type: StateFieldType; pointer: string }[])}
          onAddStructuredField={field => addStructuredOutputField(node, field)}
          onRemoveStructuredField={name => removeStructuredOutputField(node, name)}
          onRenameStructuredField={(from, to) => renameStructuredOutputField(node, from, to)}
          onRenameWriteField={(from, to) => renameOutputWriteField(node, from, to)}
          producers={flowProducers}
          onChangeFieldType={applyFieldTypeFix}
          readOnly={readOnly}
        />,
      });
    }
    if (!node.type.startsWith("control.") && node.type !== "core.end") sections.push({ id: "outlets", title: "出口连接", description: "这个节点之后执行的节点", count: outlets(node).length, content: nodeOutletsSection(node) });
    const advancedDescription = node.type === "core.llm" ? "对话历史 · 温度 · 更新方式 · 重试" : "更新方式 · 重试 · 超时";
    sections.push({ id: "advanced", title: "高级", description: advancedDescription, defaultCollapsed: true, content: nodeAdvancedSection(node) });
    sections.push({ id: "test", title: "测试", description: "真实调用模型或工具，并检查本次结果", content: nodeFooter(node) });
    return sections;
  }
  function toolInputSchema(node: WorkflowNodeV2): JsonSchema {
    if (node.type !== "core.tool") return { type: "object", properties: {} };
    return controller.tools.find(item => item.ref === node.config.toolRef)?.inputSchema ?? { type: "object", properties: {} };
  }
  function functionInputSchema(node: WorkflowNodeV2): JsonSchema {
    const declared = node.type === "core.function" ? node.config.inputSchema : undefined;
    return declared && typeof declared === "object" && !Array.isArray(declared) ? declared as JsonSchema : { type: "object", properties: {} };
  }
  /** Parameter definition structure for this node; never the workflow startup input structure. */
  function nodeParamSchema(node: WorkflowNodeV2): JsonSchema {
    if (node.type === "core.tool") return toolInputSchema(node);
    if (node.type === "core.function") return functionInputSchema(node);
    return { type: "object", properties: {} };
  }
  function dropWorkbenchBinding(target: string | null, binding: Binding): string | undefined {
    if (!selectedNode || readOnly) return;
    const result = applyWorkbenchBinding(selectedNode.inputs, {
      mode: selectedNode.type === "core.tool" ? "schema" : "declared",
      inputSchema: nodeParamSchema(selectedNode),
      target,
      binding,
      nodeLabel: selectedNode.label,
    });
    if (result.applied) applyNodeParams(selectedNode, result.inputs);
    return result.message;
  }
  function workbenchBindingHint(node: WorkflowNodeV2): string {
    return node.type === "core.tool" ? workbenchUseHint("schema", toolInputSchema(node), node.inputs) : "";
  }
  function openNodeWorkbench(focus: "config" | "test") {
    if (!rootController.observedRunId && rootController.history[0]) rootController.selectRun(rootController.history[0]);
    setDebugFocus(focus); setDebugOpen(true);
  }
  function nodeFooter(node: WorkflowNodeV2) {
    if (readOnly) return <p className="wf-field-note">正在查看运行记录；返回流程编辑后可配置和测试节点。</p>;
    const features = frontendCapabilities({ ...definition, nodes: [node] }, environment?.capabilities ?? []);
    if (features.length) return <p className="wf-field-note">当前执行环境缺少以下能力：{features.join("、")}。配置会保存；请检查环境后再运行。</p>;
    if (nodeAuthoring(node).interrupt) return <p className="wf-field-note">此节点使用真实中断与检查点恢复。请运行完整工作流，在该节点的气泡中回应后继续；单独节点测试不处理等待回应。</p>;
    const reason = nodeIssueReason(nodePreflightIssues.get(node.id));
    if (reason) return <div className="wf-test-block"><button type="button" className="primary" disabled title={reason}>测试</button><small role="status">先修复本节点：{reason}</small></div>;
    return <button type="button" className="primary" onClick={() => openNodeWorkbench("test")}>测试</button>;
  }
  return <JsonDraftProvider drafts={providerValue} onPending={pending}><main ref={editorRoot} className={`wf-v2-workspace wf-unified ${readOnly ? "read-only" : ""}`} style={{ "--wf-inspector-width": tab === "state" ? "640px" : "500px", "--wf-history-height": `${historyDockHeight}px`, "--wf-result-left": historyOpen ? "580px" : "16px", "--wf-result-right": resourcePanelOpen ? "484px" : inspectorVisible ? "calc(var(--wf-inspector-width) + 24px)" : "16px" } as CSSProperties} tabIndex={-1} onBlur={controller.endEditGroup} onPointerUp={controller.endEditGroup}>{navigation}
    <header className="wf-v2-topbar"><button className="wf-topbar-back" aria-label="返回工作流库" onClick={() => controller.dirty || controller.inputDirty || pendingFields.length ? setDialog("leave") : onBack()}><ArrowLeft size={18}/></button><div className="wf-name"><small>工作流</small><div className="wf-name-line"><span ref={nameMeasureRef} className="wf-name-measure" aria-hidden="true">{workflowName || " "}</span><input ref={nameInputRef} aria-label="工作流名称" title={workflowName} style={{ width: workflowNameWidth }} value={workflowName} readOnly={readOnly} onChange={event => rootController.editDefinition(current => ({...current,name:event.target.value}),"name")} /><span className="wf-revision-badge">版本 {inspection?.definition.revision ?? rootController.definition.revision}</span></div></div><div className="wf-v2-topbar-actions"><VariableEnvironmentSelect environments={variableEnvironments} value={variableEnvironmentId} disabled={readOnly} resourceUpdates={resourceUpdates.length} resourcesOpen={resourcePanelOpen} onToggleResources={toggleResourcePanel} onChange={id=>{setVariableEnvironmentId(id);controller.setVariableEnvironment(id);try{window.localStorage.setItem(`eduflow.workflow.variableEnvironment.${rootController.definition.workflowId}`,id);}catch{/* presentation preference only */}}}/><button title="撤销 Ctrl/Cmd+Z" aria-label="撤销" disabled={readOnly||!controller.canUndo} onClick={controller.undo}><Undo2 size={17}/></button><button title="重做 Ctrl+Y / Shift+Cmd+Z" aria-label="重做" disabled={readOnly||!controller.canRedo} onClick={controller.redo}><Redo2 size={17}/></button><button aria-label="运行历史" title="运行历史" onClick={() => setHistoryOpen(true)}><History size={17}/></button>{executionView ? <span className="wf-save-state ready" role="status">{observationStatus}</span> : readOnly ? <span className="wf-save-state ready" role="status">只读 · {observationStatus}</span> : <span className={`wf-save-state ${autoSaveFailed ? "failed" : autoSaving || (controller.busy && controller.dirty) ? "saving" : controller.dirty ? "dirty" : "ready"}`} role="status" aria-live="polite"><i aria-hidden="true" />{autoSaveFailed ? "保存失败" : autoSaving || (controller.busy && controller.dirty) ? "保存中…" : controller.dirty ? "有未保存修改" : "已保存"}</span>}{controller.notice === runSubmittedNotice ? <span className="wf-run-submitted-hint" role="status">运行已提交 · 编辑只影响下次运行</span> : null}<button className="primary" disabled={controller.busy || !environment || readOnly} onClick={() => requestRun()}><Play size={17}/>运行</button>{run && !["success","failed","cancelled","continued"].includes(run.status) ? <button disabled={controller.busy || controller.cancelPending} aria-busy={controller.cancelPending} onClick={() => void controller.cancel()}><Square size={16}/>{controller.cancelPending ? "正在提交取消…" : "取消"}</button> : null}</div></header>
    {visibleError ? <div className="wf-v2-alert" role="alert"><AlertTriangle size={18}/><span>{visibleError}</span>{controller.inputInvalid ? <button onClick={locateInputError}>定位外部调用数据</button> : pendingFields.length ? <button onClick={locatePendingEdit}>定位未完成编辑</button> : null}{controller.saveConflict ? <button onClick={() => setDialog("conflict")}>查看保存冲突</button> : null}<button onClick={() => { setPendingAction(null); controller.setError(""); }}>关闭</button></div> : null}{controller.notice && controller.notice !== runSubmittedNotice ? <div className={`wf-v2-notice ${controller.notice.includes("未通过") ? "warning" : ""}`} role="status">{controller.notice}</div> : null}
    {runBlockedIssues.length ? <div className="wf-v2-run-blocked" role="alert"><AlertTriangle size={17}/><div className="wf-v2-run-blocked-copy"><strong>运行前发现 {runBlockedIssues.length} 处问题</strong><span>{runBlockedIssues[0].summary ?? `${runBlockedIssues[0].title}：${runBlockedIssues[0].detail}`}</span></div><button type="button" onClick={() => locatePreflightIssue(runBlockedIssues[0])}>定位</button><button type="button" className="wf-v2-run-blocked-close" aria-label="关闭运行前提示" onClick={() => setRunBlockedIssues([])}>×</button></div> : null}
{envAvailability === "error" || envAvailability === "unavailable" ? <div className="wf-v2-notice wf-v2-env-notice warning" role="alert"><span>{envAvailability === "error" ? `工作流服务暂时不可用，暂时无法校验和运行${controller.environmentError ? `：${controller.environmentError}` : "。"}` : "工作流服务暂时不可用，暂时无法校验和运行。"}</span><button type="button" disabled={controller.busy} onClick={() => void controller.refreshEnvironments()}>重试连接</button></div> : null}
    {unresolved.length ? <div className="wf-v2-notice" role="status"><span>该流程有 {unresolved.length} 项执行能力未绑定。</span><button type="button" onClick={()=>showTab("environment")}>去绑定</button></div> : null}
    {visibleDiagnostics.length ? <section className="wf-problems" aria-label="问题摘要"><strong data-config-field="问题摘要" tabIndex={-1}>{visibleDiagnostics.length} 个问题</strong>{visibleDiagnostics.map((item,index) => { const text = diagnosticText(item,definition); return <button key={`${item.code}-${index}`} onClick={() => locateDiagnostic(item)}>{text.location}：{text.title}</button>; })}</section> : null}
    <ReactFlowProvider>
    <div className="wf-v2-body">
    <div className="wf-floating-left"><button aria-label="添加组件" aria-pressed={paletteOpen} onClick={togglePalette}><Plus size={18}/>添加组件</button>{(safePath.length > 0 || projectionRoot.definition.nodes.some(node => node.type === "core.subgraph")) ? <nav className="wf-graph-crumb" aria-label="子图路径"><button onClick={()=>navigateGraph([])}>主流程</button>{safePath.map((id,index)=><button key={id} onClick={()=>navigateGraph(safePath.slice(0,index+1))}>› {graphAtPath(projectionRoot.definition,safePath.slice(0,index)).nodes.find(node=>node.id===id)?.label}</button>)}</nav> : null}</div>
    <nav className="wf-floating-tools" aria-label="工作区工具">
      {resourceUpdates.length ? <button type="button" className="wf-resource-updates" onClick={()=>showTab("environment")} title="打开本流程资源，逐个升级">已有 {resourceUpdates.length} 个资源新版本</button> : null}
      <button aria-label="打开数据面板" aria-pressed={inspectorOpen&&tab==="state"} onClick={()=>toggleTab("state")}><Braces size={16}/>数据</button>
      <details className="wf-canvas-more"><summary aria-label="更多画布操作" title="更多：导出、流程说明、画布设置"><MoreHorizontal size={16}/></summary><div className="wf-canvas-more-menu" role="menu"><button type="button" role="menuitem" onClick={event=>{event.currentTarget.closest("details")?.removeAttribute("open");exportDocument();}}><Download size={14}/>导出</button><button type="button" role="menuitem" onClick={event=>{event.currentTarget.closest("details")?.removeAttribute("open");showTab("graph");}}>流程说明</button><button type="button" role="menuitem" onClick={event=>{event.currentTarget.closest("details")?.removeAttribute("open");showTab("graph");}}><Settings2 size={14}/>画布设置</button><button type="button" role="menuitem" onClick={event=>{event.currentTarget.closest("details")?.removeAttribute("open");void openVersions();}}><History size={14}/>版本与恢复</button></div></details>
    </nav>
    {paletteOpen ? <ComponentLibrary readOnly={readOnly} onAdd={addNode} onClose={()=>setPaletteOpen(false)} footer={<details><summary>工作流操作</summary><button disabled={controller.dirty||readOnly} onClick={()=>void controller.operation(async()=>{const result=await workflowApiV2.copy(rootController.definition.workflowId,rootController.definition.revision);onOpen(result.workflowId);})}><Copy size={16}/>复制已保存版本</button><button disabled={readOnly} onClick={()=>setDialog("archive")}><Trash2 size={16}/>归档工作流</button></details>}/> : null}
    <section className={`wf-v2-canvas ${executionView&&!inspection?"loading-snapshot":""}`} aria-label="工作流画布">{executionView&&!inspection?<div className="wf-snapshot-loading" role="status">正在加载所选运行的只读快照…</div>:null}<EdgeEditingContext.Provider value={(id,point,index,phase) => { const current = editor.edges[id]?.routing; const points = [...(current?.points ?? [])]; points[index] = point; setRouting(id,{...current,version:1,mode:"manual",points},`route-${id}`); if (phase === "end") controller.endEditGroup(); }}><div className="wf-v2-graph-stage" onFocusCapture={revealKeyboardNode} onDragOver={event=>{if(event.dataTransfer.types.includes("application/x-eduflow-node"))event.preventDefault();}} onDrop={event=>{const type=event.dataTransfer.getData("application/x-eduflow-node");if(!type)return;event.preventDefault();const position=graphRef.current?.screenToFlowPosition({x:event.clientX,y:event.clientY});addNodeAt(type,position);}}><ReactFlow key={canvasIdentity} autoPanOnNodeFocus={false} ariaLabelConfig={canvasAria} nodes={emptyCanvas ? [] : nodes} edges={emptyCanvas ? [] : edgesWithMeasuredPorts(edges,nodes,readyPorts)} nodeTypes={canvasTypes} edgeTypes={edgeTypes} onInit={instance => { graphRef.current = instance; if (!settledViews.current.has(canvasViewKey)) pendingInitialView.current = canvasViewKey; const saved = scopeViews.current.get(canvasIdentity) ?? scopeViews.current.get(canvasViewKey) ?? editor.viewport; const initialView = saved ? instance.setViewport(saved) : instance.fitView({ ...overviewFitOptions }); void initialView.then(()=>{if(graphRef.current===instance&&pendingInterrupt&&JSON.stringify(pendingInterrupt.graphPath??[])===JSON.stringify(safePath))locateResponse(pendingInterrupt.nodeId);}); }} onConnect={connect} onReconnect={(edge,connection) => connect(connection,edge.id)} edgesReconnectable reconnectRadius={18} onBeforeDelete={async ({nodes:removedNodes,edges:removedEdges}) => { if(removedNodes.length || removedEdges.length) deleteElements(removedNodes.map(node=>node.id),removedEdges.map(edge=>edge.id)); return false; }} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_,node) => {setSpotlightNodeId(null);setSelection(node.id);setEdgeSelection(null);setNodeTab("config");showTab("node");revealNodeBesidePanel(node.id);}} onEdgeClick={(_,edge) => {if(edge.id===sendTargetEdgeId(edge.source)){setSelection(edge.source);setEdgeSelection(null);}else{setEdgeSelection(edge.id);setSelection(null);}showTab("node");}} onEdgeMouseEnter={(_,edge)=>setHoveredEdgeId(edge.id)} onEdgeMouseLeave={()=>setHoveredEdgeId(null)} onPaneClick={()=>{setSpotlightNodeId(null);clearSelection();}} nodesDraggable={!readOnly} nodesConnectable={!readOnly} onMoveEnd={(_,viewport) => { scopeViews.current.set(canvasIdentity,viewport); scopeViews.current.set(canvasViewKey,viewport); setViewZoom(viewport.zoom); }} minZoom={.02} maxZoom={1.7} deleteKeyCode={readOnly?null:["Backspace","Delete"]}><Background gap={20} color="#dde3ee"/>{(waitingBubble || bubblesOpen && (run && (executionView || run.revision===definition.revision&&!controller.definitionDirty))) ? <ExecutionBubbles definition={displayedDefinition} editor={displayedEditor} steps={visibleSteps} events={visibleEvents} sizes={measurements} onOpen={openExecution} waiting={waitingBubble} showCompleted={bubblesOpen}/> : null}{minimapOpen?<MiniMap style={{width:150,height:96}} pannable zoomable nodeColor="#9aa8c4" maskColor="#e8eef880"/>:null}</ReactFlow></div></EdgeEditingContext.Provider>{launchContext ? <WorkflowOverview definition={displayedDefinition} launchContext={launchContext}/> : null}<div className="wf-canvas-tools-bottom"><div className="wf-canvas-toolbar" role="toolbar" aria-label="画布视图"><button type="button" aria-label="缩小" title="缩小" onClick={()=>void graphRef.current?.zoomOut({duration:150})}><ZoomOut size={14}/></button><button type="button" className="wf-zoom-value" aria-label={`缩放比例 ${Math.round(viewZoom*100)}%，点击重置为 100%`} title="重置为 100%" onClick={()=>void graphRef.current?.zoomTo(1,{duration:180})}>{Math.round(viewZoom*100)}%</button><button type="button" aria-label="放大" title="放大" onClick={()=>void graphRef.current?.zoomIn({duration:150})}><ZoomIn size={14}/></button><span className="wf-canvas-toolbar-divider" aria-hidden="true"/><button type="button" aria-label="适应画布" title="适应画布" onClick={()=>void graphRef.current?.fitView({minZoom:.15,maxZoom:1,duration:220})}><Maximize size={14}/></button><button type="button" aria-label="小地图" title="小地图" aria-pressed={minimapOpen} onClick={()=>setMinimapOpen(!minimapOpen)}><MapIcon size={14}/></button><span className="wf-canvas-toolbar-divider" aria-hidden="true"/><button type="button" aria-label="运行结果气泡" title="运行结果气泡" aria-pressed={bubblesOpen} onClick={()=>setBubblesOpen(!bubblesOpen)}><MessageSquareText size={14}/></button></div><button type="button" className="wf-history-button" aria-label={`打开运行历史，${controller.history.length} 次`} title="运行历史" aria-pressed={historyOpen} onClick={()=>setHistoryOpen(!historyOpen)}><History size={14}/><span>{controller.history.length}</span></button></div>{emptyCanvas ? <EmptyCanvasStart hasModel={Boolean(activeEnvironment?.providers.length)} onPick={applyStartingTemplate} onBlank={()=>setStartCardsDismissed(true)}/> : null}{executionView?<div className="wf-history-banner"><span>{historyRunBannerText(run, observationStatus, value => relativeRunTime(value) || new Date(value).toLocaleString("zh-CN"))}</span><button onClick={()=>{setViewingRun(false);controller.exitObservation();clearSelection();}}>回到编辑</button></div>:null}{run && resultCardOpen && !executionView && ["success","failed","cancelled","continued"].includes(run.status) ? <aside className={`wf-run-result-card${resultCardExpanded ? "" : " collapsed"}`} aria-label="运行结果"><header><strong>{observationStatus}</strong><span className="wf-run-result-summary">{presentedRunError ? presentedRunError.title : (readableAnswer(run.output ?? run.finalState) ?? "已完成，展开查看结果").replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim().slice(0, 90)}</span><button type="button" className="wf-run-result-toggle" aria-expanded={resultCardExpanded} aria-label={resultCardExpanded ? "收起运行结果" : "展开运行结果"} onClick={() => setResultCardExpanded(!resultCardExpanded)}>{resultCardExpanded ? "收起" : "展开"}</button><button type="button" aria-label="关闭运行结果" onClick={()=>{setResultCardOpen(false);setResultCardExpanded(false);}}><X size={15}/></button></header>{resultCardExpanded ? <>{presentedRunError ? <><p className="wf-run-result-title">{presentedRunError.title}</p><p className="wf-run-result-message">{presentedRunError.message}</p></> : <div className="wf-run-result-answer"><ReadableRunOutput value={run.output ?? run.finalState} text={outputText(run.output ?? run.finalState)}/></div>}<footer><button type="button" onClick={()=>{setHistoryOpen(false);showTab("run");}}>查看详情</button><button type="button" onClick={()=>setResultCardExpanded(false)}>折叠</button></footer></> : null}</aside> : null}</section>
    <aside className={`wf-v2-inspector ${inspectorOpen && (tab !== "node" || selectedNode || selectedEdge) ? "" : "closed"}`} data-tab={tab} aria-label="工作流详情">
    {tab === "node" && selectedNode ? null : tab === "state" ? <header className="wf-panel-heading wf-data-heading"><span className="wf-data-icon" aria-hidden="true">{"{ }"}</span><div className="wf-data-heading-copy"><h2>数据</h2><p>流程中各节点共享的数据字段，节点里也可以直接添加</p></div><small>{Object.keys(displayedDefinition.state.schema.properties ?? {}).length} 个字段</small><button aria-label="关闭详情面板" onClick={()=>setInspectorOpen(false)}><X size={16}/></button></header> : <header className="wf-panel-heading"><h2>{({node:selectedEdge?"连线设置":"节点",graph:"流程说明",run:"运行",environment:"资源",export:"导出"})[tab]}</h2>{selectedNode?<button aria-label="定位选中节点" onClick={()=>locateNodeOnCanvas(selectedNode.id)}>定位</button>:null}<button aria-label="关闭详情面板" onClick={()=>setInspectorOpen(false)}><X size={16}/></button></header>}
<div className={`wf-v2-inspector-scroll${tab === "node" && selectedNode ? " wf-node-scroll" : ""}`}>
    <div hidden={tab !== "environment"}><EnvironmentPanel definition={rootController.definition} environment={activeEnvironment} tools={controller.tools} locked={readOnly||Boolean(run&&!["success","failed","cancelled","continued"].includes(run.status))} onApplyBindings={bindings=>rootController.editDefinition(current=>applyCapabilityBindings(current,bindings))} onOpenResourceCenter={()=>openResourceCenter("apis")}/></div>
    <div hidden={tab !== "export"}><p>导出当前工作流定义、节点处理配置、流程数据与布局。</p><button onClick={exportDocument}><Download size={16}/>导出工作流 JSON</button>{exportNotice?<p role="status">{exportNotice}</p>:null}<p className="wf-field-note">文件不包含连接凭据。运行需要对应的 EduFlow 执行服务与授权环境。</p></div>
    <div hidden={tab !== "graph"}><p>当前图：{definition.name}。图的输入来自调用方；人工回应由运行中的具体节点请求。</p><button onClick={()=>setRunDialogOpen(true)} disabled={readOnly || !environment || callerInputReadOnly} title={callerInputReadOnly?"启动输入由课程实训提供，运行时只读":undefined}>{callerInputReadOnly?"调用方输入只读":"填写本次运行输入"}</button><fieldset className="wf-node-form" disabled={readOnly}><label>图说明<textarea value={definition.description} onChange={e=>controller.editDefinition(current=>({...current,description:e.target.value}))}/></label><GraphInterfaceFields definition={definition} onChange={controller.editDefinition}/><GraphRuntimeFields persistent={environment?.capabilities.includes("checkpoint")} definition={definition} onChange={controller.editDefinition}/><details><summary>高级接口定义</summary><JsonField<JsonSchema> label="启动输入 Schema" value={definition.inputSchema} onChange={inputSchema=>controller.editDefinition(current=>({...current,inputSchema}))}/><JsonField<JsonSchema> label="图输出 Schema" value={definition.outputSchema} onChange={outputSchema=>controller.editDefinition(current=>({...current,outputSchema}))}/><JsonField<Record<string,Binding>> label="图输出映射" value={definition.outputBindings} validate={validateForm(bindingMapSchema)} onChange={outputBindings=>controller.editDefinition(current=>({...current,outputBindings}))}/></details><JsonField label="运行限制" value={definition.policy} validate={validateForm(executionPolicySchema)} onChange={policy=>rootController.editDefinition(current=>({...current,policy}))}/>{environment?.connectors.map(connector=><button className="wf-text-button" key={connector.ref} onClick={()=>void controller.discover(connector.ref)}>发现 {connector.name} 工具</button>)}</fieldset></div>
    <div hidden={tab !== "node"}>{selectedNode ? <>{selectedNode.type==="core.subgraph"?<button type="button" className="wf-text-button" onClick={()=>navigateGraph([...safePath,selectedNode.id])}>进入子图{readOnly?"查看":"编辑"}</button>:null}<NodePanel node={selectedNode} readOnly={readOnly} activeTab={nodeTab==="execution"?"runData":"config"} onTabChange={next=>setNodeTab(next==="runData"?"execution":"config")} showRunData={Boolean(currentRunId)} sections={nodeSections(selectedNode)} onRename={label=>updateNode({label})} onClose={()=>setInspectorOpen(false)} onLocate={()=>locateNodeOnCanvas(selectedNode.id)} onExpandDebug={()=>openNodeWorkbench("config")} onDuplicate={()=>duplicateNode(selectedNode.id)} onDelete={()=>deleteNode(selectedNode.id)} runData={<NodeRunDataTab definition={displayedDefinition} nodeId={selectedNode.id} graphPath={safePath} runId={currentRunId} runStatus={currentRunRecord?.status ?? controller.run?.status} runCreatedAt={currentRunRecord?.createdAt ?? controller.run?.createdAt} runError={failureTarget?.nodeId===selectedNode.id ? run?.error : undefined} runEnvironment={currentRunRecord?.variableEnvironment ?? controller.run?.variableEnvironment} steps={controller.observedRunId ? controller.steps : undefined} onErrorAction={handleErrorAction}/>}/></>: selectedEdge ? <><h2>连线编辑</h2><p>调整连接会改变执行路径；显示布局只整理线条。</p><label>来源节点<select aria-label="连线来源" value={selectedEdge.from} onChange={event=>{const node=definition.nodes.find(node=>node.id===event.target.value);if(node)connect({source:node.id,sourceHandle:outlets(node)[0],target:selectedEdge.to,targetHandle:"input"},selectedEdge.id);}}>{definition.nodes.filter(node=>outlets(node).length).map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></label><label>来源出口<select aria-label="连线出口" value={selectedEdge.outlet} onChange={event=>connect({source:selectedEdge.from,sourceHandle:event.target.value,target:selectedEdge.to,targetHandle:"input"},selectedEdge.id)}>{outlets(definition.nodes.find(node=>node.id===selectedEdge.from)!).map(outlet=><option key={outlet} value={outlet}>{outletDisplayName(definition.nodes.find(node=>node.id===selectedEdge.from), outlet)}</option>)}</select></label><label>目标节点<select aria-label="连线目标" value={selectedEdge.to} onChange={event=>connect({source:selectedEdge.from,sourceHandle:selectedEdge.outlet,target:event.target.value,targetHandle:"input"},selectedEdge.id)}>{definition.nodes.filter(node=>node.type!=="core.start").map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></label><h3>显示布局（不改变执行）</h3><small>控制点或线段进入相连节点时，画面会回退为自动走线并标明；可调整控制点或恢复自动走线。</small>{(['source','target'] as const).map(end=><fieldset key={end}><legend>{end==='source'?'来源显示端口':'目标显示端口'}</legend><label>节点侧边<select aria-label={`${end} 端口侧边`} value={editor.edges[selectedEdge.id]?.routing?.[end]?.side??(end==='source'?'right':'left')} onChange={event=>setRouting(selectedEdge.id,{...editor.edges[selectedEdge.id]?.routing,version:1,mode:'manual',[end]:{offset:editor.edges[selectedEdge.id]?.routing?.[end]?.offset??.5,side:event.target.value}} as WorkflowRouting)}>{['left','right','top','bottom'].map(side=><option key={side} value={side}>{({left:'左',right:'右',top:'上',bottom:'下'})[side]}</option>)}</select></label><label>端口位置<input aria-label={`${end} 端口位置`} type="range" min={.1} max={.9} step={.05} value={editor.edges[selectedEdge.id]?.routing?.[end]?.offset??.5} onChange={event=>setRouting(selectedEdge.id,{...editor.edges[selectedEdge.id]?.routing,version:1,mode:'manual',[end]:{side:editor.edges[selectedEdge.id]?.routing?.[end]?.side??(end==='source'?'right':'left'),offset:Number(event.target.value)}},`port-${selectedEdge.id}-${end}`)}/></label></fieldset>)}<button onClick={()=>setRouting(selectedEdge.id,{version:1,mode:'auto'})}>恢复自动走线</button><button onClick={()=>removeEdge(selectedEdge.id)}>删除此连线</button></> : <p>选择画布中的节点或连线查看配置。</p>}</div>
    <div hidden={tab !== "state"}><StatePanel definition={displayedDefinition} onChange={controller.editDefinition} readOnly={readOnly} latestValues={safePath.length===0?(panelRun?.finalState ?? panelRun?.output):undefined} runStatus={panelRun?.status} runCreatedAt={panelRun?.createdAt} runStartedAt={panelRun?.startedAt} runFinishedAt={panelRun?.finishedAt} runEnvironment={panelRun?.variableEnvironment} onLocateNode={id => { setSelection(id); setEdgeSelection(null); showTab("node"); void graphRef.current?.fitView({ nodes: [{ id }], minZoom: .9, maxZoom: 1, duration: 250 }); }}/></div>
    <div hidden={tab !== "run"}>{presentedRunError ? <ExecutionErrorCard error={presentedRunError} onAction={handleErrorAction}/> : null}<section aria-label="启动输入摘要"><h3>启动输入</h3><InputReuseOmissions fields={inputReuseOmissions} onClose={()=>setInputReuseOmissions([])}/><p className="wf-field-note">{callerInputReadOnly?"启动输入由课程实训提供，运行时只读；当前页面不会改写调用方输入。继续已有会话请使用下方“下一轮输入”。":"启动输入在运行时填写，不随工作流定义保存。点击顶部“运行”打开运行对话框；继续已有会话请使用下方“下一轮输入”。"}</p>{callerInputReadOnly?null:<button type="button" onClick={()=>setRunDialogOpen(true)} disabled={readOnly || !environment}>查看/编辑启动输入</button>}<details><summary>{callerInputReadOnly?"查看调用方启动输入":"查看当前启动输入"}</summary><pre>{JSON.stringify(controller.input,null,2)}</pre></details></section><ModelStreamFeed definition={controller.runSnapshot?.definition??rootController.definition} events={controller.events} steps={controller.steps}/>{showSessionTools ? <SessionHistoryWorkspace definition={rootController.definition} environmentRef={controller.environmentRef} run={controller.run} input={controller.input} focusedNamespace={invocationScoped?selectedInvocationGroup?.namespace:undefined} onObserve={record=>{controller.selectRun(record);setViewingRun(true);}}/> : null}{hasSubgraphHistory ? <SubgraphInvocationHistory definition={rootController.definition} steps={rootController.steps} onSelect={group=>{setSelectedSubgraphInvocation(group.key);setSelectedInterruptId(null);if(group.graphPath.length){navigateGraph(group.graphPath);setViewingRun(true);}}}/> : null}{showSessionTools ? <ThreadRecoveryPanel run={run} thread={controller.currentThread} historyExpired={controller.historyExpired} error={controller.threadsError} onLocate={locateResponse} onRecover={()=>{if(controller.currentThread)void controller.resumeThread(controller.currentThread,{});}}/> : null}<div>{controller.submitUnknown?<><p>确认会沿用原请求的修订、输入、环境和实训上下文；当前页面的新输入或实训不会替换原提交。</p><button disabled={controller.busy} onClick={()=>void controller.confirmSubmission()}>确认原提交状态</button></>:null}{run?<><div className="wf-run-summary" role="status"><div className="wf-run-status-line"><strong>{observationStatus}</strong><span>{controller.runOrigin === "history" ? "所选历史记录" : "本次执行"} · 流程版本 {run.revision}{run.variableEnvironment ? ` · 变量环境 ${run.variableEnvironment}` : ""}</span></div>{run.continuationRunId?<button onClick={()=>void controller.operation(async()=>controller.selectRun(await workflowApiV2.run(run.continuationRunId!)))}>查看继续后的运行</button>:null}<RunEffectNotice run={run} events={controller.events} complete={controller.observationComplete}/>{run.inputReuse?<RunInputSnapshot run={run} currentRevision={definition.revision} readOnly={callerInputReadOnly}/>:null}{failureTarget ? <button onClick={locateFailure}>{failureTarget.beforeExecution ? "定位输入准备错误" : "定位失败步骤"}：{failureTarget.label} · 执行序号 {failureTarget.invocation}</button> : null}{copyFeedback?.runId===run.runId?<p role={copyFeedback.failed?"alert":"status"} className="wf-copy-feedback">{copyFeedback.message}</p>:null}</div>{run.status==="failed" || run.status==="cancelled" ? <RunToolActivity run={run} events={controller.events} complete={controller.observationComplete} steps={controller.steps} revealResults/> : null}{run.error&&run.status==="cancelled"?<section role="status"><strong>运行已由用户取消</strong><p>后续节点已停止调度；未正常完成的步骤会标记为已取消。</p><details><summary>取消详情</summary>{run.error.code} · {run.error.message}</details></section>:null}{run.status==="failed"&&run.error?.code==="WAIT_EXPIRED"?<section className="wf-wait-expired" role="status"><strong>等待已到期</strong><p>超过回应截止时间仍未收到回应，本次运行已结束，不能继续此等待。可返回流程编辑后重新运行；此前完成的步骤不会因到期撤回。</p><details><summary>到期技术详情</summary><code>WAIT_EXPIRED</code></details></section>:null}{run.error?.effect&&run.error.effect!=='none'?<p className="wf-external-effect">外部操作可能已发生，请核对后再运行。</p>:null}<h3>{run.status==="failed"&&run.error?.code==="WAIT_EXPIRED"?"到期时流程数据":run.status==="success"?"最终输出":run.status==="waiting"?"暂停时流程数据":run.status==="continued"?"移交时流程数据":run.status==="failed"||run.status==="cancelled"?"停止时流程数据":"当前流程数据"}</h3>{run.status==="success"&&!readableAnswer(run.output)&&Object.keys((run.output&&typeof run.output==="object"&&!Array.isArray(run.output)?run.output:{})??{}).length===0&&controller.steps.some(step=>readableAnswer(step.output))?<section><p className="wf-field-note">图尚未配置最终输出。以下是模型步骤回复，可在图设置中配置返回字段。</p><div className="wf-readable-output">{readableAnswer([...controller.steps].reverse().find(step=>readableAnswer(step.output))?.output)}</div><button onClick={()=>showTab("graph")}>配置图输出</button></section>:null}<div className="wf-readable-output"><ReadableRunOutput value={run.output??run.finalState} text={outputText(run.output??run.finalState)}/></div><button onClick={()=>void copyReadableResult()}>复制可读结果</button><details><summary>{run.status==="success"?"原始输出 JSON":"技术详情（原始流程数据）"}</summary><pre>{JSON.stringify(run.output??run.finalState??null,null,2)}</pre></details>{run.outputRef?<button onClick={()=>void controller.operation(async()=>{const result=await workflowApiV2.artifact(run.outputRef!);setArtifactContent({runId:run.runId,value:result.content??result.url??null});})}>读取输出产物</button>:null}{artifactContent?.runId===run.runId?<pre>{JSON.stringify(artifactContent.value,null,2)}</pre>:null}{callerInputReadOnly?<button disabled={controller.busy} title="调用方输入由课程实训提供；重新运行直接使用当前权威输入" onClick={()=>runNow()}>使用调用方输入重新运行</button>:<button title={run.revision!==definition.revision?`原运行修订 ${run.revision}；将创建当前修订 ${definition.revision} 的新运行`:undefined} disabled={!run.inputReuse?.available} onClick={()=>requestRun(run)}>{run.revision!==definition.revision?"用当前修订和相同输入重跑":run.inputReuse?.complete?"使用相同输入重新运行":"补齐缺失输入后重新运行"}</button>}{!readOnly&&!callerInputReadOnly&&run.revision!==definition.revision&&run.inputReuse?.complete?<button onClick={()=>void replayOriginal()}>使用原修订重跑</button>:null}<details className="wf-run-identity"><summary>执行环境、评价与运行身份</summary><small>环境：{run.environmentRef}。运行成功表示执行完成；业务评价{run.verification==='unverified'?'尚未验证':run.verification}。</small></details><button onClick={()=>{setSnapshotFocus(null);void controller.operation(async()=>setSnapshot(await workflowApiV2.get(run.workflowId,run.revision)));}}>查看执行修订的定义与布局</button>{run.status!=="failed" && run.status!=="cancelled" ? <RunToolActivity run={run} events={controller.events} complete={controller.observationComplete} steps={controller.steps}/> : null}<section aria-label="执行策略摘要">{visibleSteps.filter(step=>executionPolicySummary(controller.events,step.stepId)).map(step=><p key={step.stepId}>{definition.nodes.find(node=>node.id===step.nodeId)?.label??step.nodeId}：{executionPolicySummary(controller.events,step.stepId)}</p>)}</section><h3>执行步骤</h3>{visibleSteps.map(step=><details key={`${step.stepId}-${step.attempt}`}><summary>{controller.runSnapshot?.definition.nodes.find(node=>node.id===step.nodeId)?.label??step.nodeId} · 执行序号 {step.invocation} · {statusLabel[step.status]??(step.status==='completed'?'完成':step.status)}</summary><ToolStepOutput step={step}/><details><summary>步骤技术详情</summary><pre>{JSON.stringify(step,null,2)}</pre></details></details>)}<details><summary>事件轨迹（{controller.events.length}）</summary><ol className="wf-v2-events">{controller.events.map(event=><li key={event.eventId}>#{event.seq} {event.type} {event.nodeId}<details><summary>查看数据</summary><pre>{JSON.stringify(event.payload,null,2)}</pre></details></li>)}</ol></details></>:controller.historyExpired?(controller.currentThread?null:<p>所选运行的早期日志已清理；此执行已继续，请从运行历史选择当前执行。</p>):<p>{controller.submitUnknown ? "原请求可能已被接受，当前状态待确认；请确认原提交，不要重复运行。" : controller.runPreparationStage === "preflight" ? "正在校验本次提交，运行尚未创建。" : controller.runPreparationStage === "save" ? "正在保存本次提交，保存成功后才会启动运行。" : controller.runPreparationStage === "submit" ? "正在提交运行，请等待结果，避免重复执行。" : controller.awaitingRunRecord ? "运行已提交，正在读取实际状态。" : controller.runPreparationFailure === "preflight" ? "上次运行未启动：预检未通过，请查看上方具体原因。输入草稿已保留。" : controller.runPreparationFailure === "save" ? "上次运行未启动：工作流未能保存，请处理上方错误后重试。编辑与输入草稿已保留。" : controller.runPreparationFailure === "submit" ? "上次运行未启动：提交已被拒绝，请处理上方提示后重试。输入草稿已保留。" : "点击顶部“运行”填写启动输入并开始执行。"}</p>}</div>
    </div>{visibleDiagnostics.length?<section className="wf-v2-diagnostics"><h3>需要修正的问题</h3>{visibleDiagnostics.map((item,index)=>{const text=diagnosticText(item,definition);return <div key={`${item.code}-${index}`}><button onClick={()=>locateDiagnostic(item)}><strong>{text.location}：{text.title}</strong><span>{text.advice}</span></button><details><summary>技术详情</summary><code>{item.code}</code><p>{item.message}</p><small>{item.pointer} · {item.requestId}</small></details></div>;})}</section>:null}</div></aside></div><section ref={historyDockRef} className={`wf-history-dock ${historyOpen?"open":""}`} aria-label="运行历史"><header><button aria-expanded={historyOpen} onClick={()=>{setHistoryOpen(!historyOpen); if(!historyOpen)setPaletteOpen(false);}}><History size={15}/>运行历史 · {controller.history.length}<span>{historyOpen?"⌄":"⌃"}</span></button><small>最近 20 次</small>{historyOpen?<button type="button" className="wf-history-collapse" aria-label="收起运行历史" title="收起" onClick={()=>setHistoryOpen(false)}><ChevronLeft size={13}/></button>:null}</header>{historyOpen?<div className="wf-history-list">{controller.history.length ? controller.history.map(record=>{const tone=runStatusTone(record.status);const duration=formatRunDuration(runElapsed(record));return <button className="wf-history-row" key={record.runId} title={`保存版本 ${record.revision}`} aria-pressed={executionView&&run?.runId===record.runId} onClick={()=>{controller.selectRun(record);const action=historyRunSelection(Boolean(selection));if(action.resetGraph)setGraphPath([]);setViewingRun(true);if(action.clearSelection){setSelection(null);setEdgeSelection(null);}if(action.nodeTab)setNodeTab(action.nodeTab);showTab(action.tab);}}><span className={`wf-history-status ${tone}`} aria-hidden="true">{tone==="failed"?<XCircle size={15}/>:tone==="running"?<Loader2 size={15}/>:<CheckCircle2 size={15}/>}</span><span className="wf-history-title" title={runInputSummary(record, 60)}>{runInputSummary(record)}</span><span className="wf-history-duration">{duration||"—"}</span><span className="wf-history-relative">{relativeRunTime(record.createdAt)||"时间未知"}</span><span className="wf-run-env-tag">{runEnvironmentLabel(record)}</span></button>;}):<p>还没有运行记录。完成运行后可在这里查看结果与快照。</p>}</div>:null}</section></ReactFlowProvider>
    {debugOpen&&selectedNode?<NodeDebugDialog open definition={displayedDefinition} node={selectedNode} graphPath={safePath} environmentRef={controller.environmentRef} environmentSchema={environmentSchema} producers={flowProducers} sections={nodeSections(selectedNode, dropWorkbenchBinding)} readOnly={readOnly} initialFocus={debugFocus} runId={currentRunId} runStatus={currentRunRecord?.status ?? controller.run?.status} runCreatedAt={currentRunRecord?.createdAt ?? controller.run?.createdAt} steps={controller.observedRunId?controller.steps:undefined} runInput={workbenchTestInput} runState={run?.finalState} history={controller.history} onSelectRun={record=>{controller.selectRun(record);setViewingRun(true);}} onUseBinding={binding=>dropWorkbenchBinding(null,binding)} useBindingHint={workbenchBindingHint(selectedNode)} testBlockReason={nodeIssueReason(nodePreflightIssues.get(selectedNode.id))} onClose={()=>setDebugOpen(false)}/>:null}
    {resourcePanelOpen?<ResourcePanel definition={rootController.definition} environment={activeEnvironment} tools={controller.tools} variableConfiguration={variableConfiguration} variableValues={activeVariableValues} locked={readOnly} onClose={()=>setResourcePanelOpen(false)} onExpand={next=>{setResourcePanelOpen(false);openResourceCenter(next);}} onEdit={target=>openResourceEditor(target)}/>:null}
    {resourceEditor?<ResourceEditor environmentRef={controller.environmentRef} target={resourceEditor.target} onClose={()=>setResourceEditor(null)} onSaved={(ref,version,content)=>{resourceEditor.onSaved?.(ref,version,content);setResourceEditor(null);}}/>:null}
    {resourceCenter?.open?<ResourceCenterDialog open environmentRef={controller.environmentRef} initialSection={resourceCenter.initialSection} intent={resourceCenter.intent} onClose={()=>setResourceCenter(null)} onResourcesChanged={()=>{void controller.refreshEnvironmentResources();refreshExtensions();}} onOpenReference={row=>{setResourceCenter(null);if(row.workflowId!==rootController.definition.workflowId){onOpen(row.workflowId);return;}setGraphPath(row.graphPath??[]);if(row.nodeId===GRAPH_OUTPUT_NODE_ID){setSelection(null);setEdgeSelection(null);showTab("graph");return;}setSelection(row.nodeId);setEdgeSelection(null);showTab("node");}}/>:null}
    {activeDialog?<WorkflowDialog title={activeDialog==='versions'?'版本与恢复':activeDialog==='rerun'?'新建一次运行':activeDialog==='run'?'保存并运行':activeDialog==='leave'?'离开前保存':activeDialog==='template'?'选择起步流程':activeDialog==='preflight'?'运行前检查':activeDialog==='conflict'?'保存冲突':'归档工作流'} error={controller.error} onClose={closeDialog}>{activeDialog==='rerun'?<><p>将使用当前工作流和当前输入创建新的运行，重新执行全部节点。历史输入不会自动带入，也不会续跑所选记录。</p>{run ? <p role="alert">{externalEffectNotice(run,controller.events,controller.observationComplete) || (definitionHasExternalWriteTools(rootController.definition, controller.tools) ? "这个流程会向外部服务发送数据，重新运行会再次发送。" : "请确认当前输入；这是一次独立的新运行。")}</p> : null}{controller.dirty ? <p>当前修改会先保存；保存失败不会启动运行。</p> : null}<button disabled={controller.busy} onClick={()=>{setDialog(null);void controller.startRun(true);}}>{controller.dirty ? "保存当前修改并新建运行" : "确认新建运行"}</button></>:activeDialog==='run'?<><p>当前有未保存修改。保存成功后运行本次输入；取消会保留草稿。</p><button onClick={()=>{setDialog(null);void controller.startRun(true);}}>保存并运行当前修改</button></>:activeDialog==='leave'?<><p>工作流修改尚未完成。外部调用数据仅在本页，离开会丢弃，保存工作流也不包含外部调用数据。</p><button onClick={()=>void controller.saveDocument().then(result=>{if(result)finishLeave();})}>保存工作流并离开</button><button onClick={()=>{controller.discard();finishLeave();}}>放弃修改并离开</button><button onClick={closeDialog}>继续编辑</button></>:activeDialog==='template'?<><p>选择一个起步流程，节点、流程数据、参数绑定和提示词会自动放好；可先修改再运行。</p><div className="wf-dialog-start-list">{startingTemplateCards.map(card=><button key={card.kind} onClick={()=>applyStartingTemplate(card.kind)}><strong>{card.title}</strong><small>{card.chain} · {card.description}</small></button>)}</div></>:activeDialog==='preflight'?<><p>{preflightIssues.length} 项需要在运行前处理。每一项都可以直接定位到对应节点或字段。</p><div className="wf-preflight-list">{preflightIssues.map(issue=><button key={issue.id} onClick={()=>locatePreflightIssue(issue)}><strong>{issue.title}</strong><small>{issue.detail}</small></button>)}</div></>:activeDialog==='versions'?<><p>旧定义只读预览。恢复会创建新修订，保留所有已有运行记录。</p>{revisions.map(revision=><button key={revision.revision} onClick={()=>void controller.operation(async()=>setSnapshot(await workflowApiV2.get(definition.workflowId,revision.revision)))}>修订 {revision.revision} · {revision.name} · {new Date(revision.createdAt).toLocaleString()}</button>)}</>:activeDialog==='conflict'?<><p>服务器版本已变化，本地草稿完整保留。可查看服务器版本比较；重新加载前请确认放弃本地修改。</p><button onClick={()=>void controller.operation(async()=>setSnapshot(await workflowApiV2.get(definition.workflowId)))}>查看服务器版本</button><button onClick={()=>{setDialog(null);setPendingConfirm({title:"重新加载？",message:"重新加载将放弃本地草稿和临时输入，是否继续？",confirmLabel:"重新加载",danger:true,onConfirm:()=>location.reload()});}}>重新加载</button></>:<><p>归档后不能再运行，已有定义和历史会保留。</p><button onClick={()=>void controller.operation(async()=>{await workflowApiV2.archive(rootController.definition.workflowId,rootController.definition.revision);onBack();})}>确认归档</button></>}<button onClick={closeDialog}>取消</button></WorkflowDialog>:null}
    {pendingConfirm ? <ConfirmDialog title={pendingConfirm.title} confirmLabel={pendingConfirm.confirmLabel} danger={pendingConfirm.danger} onCancel={() => setPendingConfirm(null)} onConfirm={() => { const action = pendingConfirm.onConfirm; setPendingConfirm(null); action(); }}>
      <p>{pendingConfirm.message}</p>
    </ConfirmDialog> : null}
    {runDialogOpen && !readOnly && !callerInputReadOnly && !activeDialog && !snapshot ? <RunPreparationDialog key={controller.inputResetVersion} draftId={runInputDraftId} schema={rootController.definition.inputSchema} value={controller.input} onChange={controller.setInput} onInvalid={controller.setInputInvalid} busy={controller.busy} dirty={controller.dirty} inputInvalid={controller.inputInvalid} issues={preflightIssues} reuseNotice={reusedRunRevision === null ? undefined : runRevisionNotice(reusedRunRevision, definition.revision)} omissions={reusedRunRevision === null ? undefined : inputReuseOmissions} warning={run && ["success","failed","cancelled","continued"].includes(run.status) && definitionHasExternalWriteTools(rootController.definition, controller.tools) ? "这个流程会向外部服务发送数据，重新运行会再次发送。" : undefined} focusErrorRequest={inputFocusRequest} focusPointer={inputFocusPointer} onCancel={()=>{setRunDialogOpen(false);setPreflightIssues([]);setReusedRunRevision(null);}} onRun={startRunFromDialog} onIssue={locatePreflightIssue}/> : null}
    {snapshot?<WorkflowDialog title={`修订 ${snapshot.definition.revision} 只读预览`} error={controller.error} onClose={()=>setSnapshot(null)}><h2>{snapshot.definition.name} · 修订 {snapshot.definition.revision}</h2><p>当前草稿不会被此预览替换。节点 {snapshot.definition.nodes.length} / 连线 {snapshot.definition.transitions.length}</p><SnapshotCanvas key={`${snapshot.definition.workflowId}:${snapshot.definition.revision}`} snapshot={snapshot} focusedNode={snapshotFocus} focusedPath={snapshotFocus?run?.error?.graphPath:undefined}/>{failureTarget && snapshotFocus === failureTarget.nodeId && snapshot.definition.workflowId === run?.workflowId && snapshot.definition.revision === run.revision ? <section aria-label="执行错误位置"><h3>{failureTarget.label} · 执行序号 {failureTarget.invocation}</h3><p>{failureTarget.beforeExecution ? "此节点在读取或校验输入时停止，尚未执行；没有创建该节点的执行步骤。" : "此处展示失败步骤对应的执行修订。"}</p>{failureTarget.pointer ? <p>需检查的配置：{failureTarget.pointer.split("/").slice(3).map(token => token.replace(/~1/g,"/").replace(/~0/g,"~")).map(token => token === "inputs" ? "输入绑定" : token === "arguments" ? "工具参数" : token).join(" / ")}</p> : null}{run.revision === definition.revision && !controller.definitionDirty ? <button onClick={editFailedInput}>编辑当前节点输入</button> : <p>当前工作流已修改，请返回编辑后核对；此快照保持只读。</p>}</section> : null}<details><summary>定义差异与结构详情</summary><p>当前名称：{definition.name}；预览名称：{snapshot.definition.name}</p><p>当前节点：{definition.nodes.map(node=>node.label).join('、')}</p><p>预览节点：{snapshot.definition.nodes.map(node=>node.label).join('、')}</p><pre>{JSON.stringify(snapshot.definition,null,2)}</pre></details>{dialog==='versions'?<button onClick={()=>void restore()}>恢复此版本为新修订</button>:null}<button onClick={()=>{setSnapshot(null);setDialog(null);}}>返回当前工作流</button></WorkflowDialog>:null}
  </main></JsonDraftProvider>;
}
