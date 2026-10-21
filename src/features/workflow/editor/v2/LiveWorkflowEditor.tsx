import { validateSchemaValue } from "../../domain/v2/validation";
import { executionObservation, runStatusLabels } from "./executionObservation";
import { NodeResponseForm, type ResponseDraft } from './NodeResponseForm';
import { initializeResponseDraft } from './responseDraft';
import { ReviewContext, reviewContextFacts } from './ReviewContext';
import { StartInputFields } from './StartInputFields';
import { ThreadRecoveryPanel } from './ThreadRecoveryPanel';
import { sendTargetEdgeId, sendTargetRelations } from "./sendProjection";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { subscribeApiAuthenticationFailure, type ApiAuthenticationFailure } from "@/shared/api/apiClient";
import { acknowledgeWorkflowSessionRecovery, peekWorkflowSessionRecovery, rejectRecoveredWorkflowSubmission, retainWorkflowSessionRecovery } from "./workflowSessionRecovery";
import { useBlocker, useBeforeUnload } from "react-router-dom";
import { Background, Controls, MiniMap, MarkerType, ReactFlow, ReactFlowProvider, type Connection, type Edge, type EdgeChange, type NodeChange, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, CheckCircle2, Copy, Play, Plus, Save, Square, Trash2, Undo2, Redo2, X, ChevronLeft, Braces, AlertTriangle, History, Settings2, Layers3, Plug, Download, Maximize2, Minimize2 } from "lucide-react";
import { useWorkflowV2Controller, workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { AuthoringProcessing, NodeRuntimeFields } from "./AuthoringFields";
import { insertAuthoringNode, messageAuthoringIssue } from "../../domain/v2/messageAuthoring";
import { authoringExample, liveQuestionExample } from "../../domain/v2/authoringExamples";
import { RouterFields } from "./RouterFields";
import { GraphRuntimeFields } from "./GraphRuntimeFields";
import { GraphInterfaceFields } from "./GraphInterfaceFields";
import { FrontendPreviewPanel, PreviewResponse } from "./FrontendPreviewPanel";
import { useFrontendPreview } from "../../application/v2/useFrontendPreview";
import { frontendPreviewEvents, previewActiveNodes, previewScope } from "../../application/v2/frontendPreview";
import { scopedWorkflow } from "../../application/v2/scopedWorkflow";
import { authoringNodeTypes, authoringDiagnostics, createAuthoringNode, frontendCapabilities, graphAtPath, graphInNode, editorAtPath, nodeOutlets, nodeAuthoring } from "../../domain/v2/authoring";
import { createNodeV2, nodeTypesV2, stateBinding } from "../../domain/v2/factory";
import type { Binding, EditorDocumentV2, JsonSchema, JsonValue, WorkflowDefinitionV2, WorkflowDiagnostic, WorkflowDocumentV2, WorkflowLaunchContext, WorkflowNodeV2, WorkflowRevisionSummary, WorkflowRouting } from "../../domain/v2/types";
import { bindingSchema, executionPolicySchema, formatSchemaError, stateSchemaV2 } from "../../domain/v2/schema";
import { z } from "zod";
import { WorkflowDialog } from "./WorkflowDialog";
import { JsonField, JsonDraftProvider, type JsonDraftStore } from "./JsonField";
import { putValue } from "./SchemaForm";
import { RunPreparationDialog } from "./RunPreparationDialog";
import { RunInputSnapshot } from "./RunInputSnapshot";
import { SubgraphInvocationHistory } from "./SubgraphInvocationHistory";
import { WorkflowOverview } from "./WorkflowOverview";
import { NodeTestPanel } from "./NodeTestPanel";
import { ModelStreamFeed } from "./ModelStreamFeed";
import { SessionHistoryWorkspace } from "./SessionHistoryWorkspace";
import { EnvironmentPanel } from "./EnvironmentPanel";
import { ProcessingFields, transformOperations } from "./ProcessingFields";
import { ExecutionDetails } from "./ExecutionDetails";
import { ExecutionBubbles } from "./ExecutionBubbles";
import { executionPolicySummary, latestNodeSteps, presentRunSteps, processingDescription } from "./executionPresentation";
import { BindingFields } from "./BindingFields";
import { StateFields } from "./StateFields";
import { EdgeEditingContext, WorkflowEdge, WorkflowNode, type CanvasNode } from "./WorkflowGraph";
import { edgesWithMeasuredPorts } from "./portReadiness";
import { diagnosticTarget, diagnosticText, runFailureTarget } from "./diagnostics";
import { readableAnswer, StructuredValue, ReadableRunOutput, RunEffectNotice, RunToolActivity, ToolStepOutput } from "./RunOutput";
import { externalEffectNotice } from "./toolActivity";
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
const errorCategoryLabel: Record<string,string> = {validation:"数据或配置不符合要求",auth:"授权不可用",rate_limit:"请求过于频繁",timeout:"执行超时",provider:"模型服务异常",tool:"工具执行异常",policy:"运行限制已达到",infrastructure:"执行服务异常"};
const statusLabel = runStatusLabels;
function toolRefs(node: WorkflowNodeV2): string[] { const value = node.config.allowedToolRefs; return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
const outlets = nodeOutlets;
function transitionLabel(outlet: string) { return outlet === "item" ? "逐项派发" : outlet === "next" ? "" : outlet === "default" ? "否则" : outlet === "has_calls" ? "有工具调用" : /^branch_\d+$/.test(outlet) ? `分支 ${outlet.slice(7)}` : outlet; }
function snapshotNodes(document: WorkflowDocumentV2): CanvasNode[] {
  return document.definition.nodes.map((node,index) => ({ id: node.id, type: "workflowV2", position: document.editor.nodes[node.id] ?? { x: 80 + index * 240, y: 160 }, data: { label: node.label, type: node.type, active: false, outlets: outlets(node), sources: Object.fromEntries(document.definition.transitions.filter(edge=>edge.from===node.id&&document.editor.edges[edge.id]?.routing?.source).map(edge=>[edge.outlet,document.editor.edges[edge.id].routing!.source!])), targets: [...document.definition.transitions,...sendTargetRelations(document.definition)].filter(edge=>edge.to===node.id).map((edge,index,list)=>({id:edge.id,placement:document.editor.edges[edge.id]?.routing?.target??{side:"left",offset:(index+1)/(list.length+1)}})) } }));
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
  const edges = useMemo<Edge[]>(() => [...snapshot.definition.transitions,...sendTargetRelations(snapshot.definition)].map(edge => ({ id: edge.id,style:edge.id===sendTargetEdgeId(edge.from)?{strokeDasharray:"6 5"}:undefined, source: edge.from, target: edge.to, sourceHandle: edge.outlet, targetHandle: `target-${edge.id}`, label: transitionLabel(edge.outlet), type: "editable", data: { routing: snapshot.editor.edges[edge.id]?.routing, sourceBounds: nodeBounds(snapshot.definition, snapshot.editor, edge.from, sizes), targetBounds: nodeBounds(snapshot.definition, snapshot.editor, edge.to, sizes) }, markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#566583" } })), [snapshot, sizes]);
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
function InputReuseOmissions({ fields, onClose }: { fields: {pointer:string;reason:string}[]; onClose:()=>void }) {
  if (!fields.length) return null;
  const reasons: Record<string,string> = { sensitive: "敏感字段，需要重新填写", redacted: "历史值已脱敏，需要重新填写", missing: "历史记录中缺少完整值" };
  return <section role="status" className="wf-input-reuse-omissions"><strong>复用时没有填入以下字段</strong><ul>{fields.map((field,index)=><li key={index}>{field.pointer ? field.pointer.split("/").slice(1).map(token=>token.replace(/~1/g,"/").replace(/~0/g,"~")).join(" / ") : "全部外部调用数据"}：{reasons[field.reason]??"此字段不可从历史复用"}</li>)}</ul><p>如本次运行需要这些字段，请在表单中重新填写。</p><button type="button" onClick={onClose}>收起复用说明</button></section>;
}
export function LiveWorkflowEditor({ initial, ownerId, navigation, launchContext, onBack, onOpen }: { initial: WorkflowDocumentV2; ownerId: string; navigation: ReactNode; launchContext?: WorkflowLaunchContext; onBack: () => void; onOpen: (id: string) => void }) {
  const [sessionRecovery] = useState(() => peekWorkflowSessionRecovery(ownerId, initial.definition.workflowId));
  const rejectRecoverySubmission = useCallback((key: string) => rejectRecoveredWorkflowSubmission(ownerId, initial.definition.workflowId, key), [ownerId, initial.definition.workflowId]);
  const rootController = useWorkflowV2Controller(initial, launchContext, sessionRecovery?.controller, rejectRecoverySubmission);
  const [viewingRun,setViewingRun] = useState(false);
  const preview = useFrontendPreview();
  const executionView=viewingRun||Boolean(rootController.observedRunId);
  const inspection = preview.session?.snapshot ?? (executionView ? rootController.runSnapshot : null);
  const projectionRoot = inspection ? { ...rootController, ...inspection } : rootController;
  const [graphPath, setGraphPath] = useState<string[]>([]);
  const [queuedDiagnostic,setQueuedDiagnostic]=useState<WorkflowDiagnostic|null>(null);
  const scopeViews = useRef(new Map<string, { x: number; y: number; zoom: number }>());
  let safePath = graphPath;
  try { graphAtPath(projectionRoot.definition, safePath); } catch { safePath = []; }
  const controller = scopedWorkflow(projectionRoot, safePath); const { definition, editor, run } = controller;
  const futureFeatures = frontendCapabilities(rootController.definition,controller.environments.find(item=>item.environmentRef===controller.environmentRef)?.capabilities);
  const displayedFutureFeatures = frontendCapabilities(projectionRoot.definition,controller.environments.find(item=>item.environmentRef===controller.environmentRef)?.capabilities);
  const visibleDiagnostics = futureFeatures.length ? [] : controller.diagnostics;
  const executionReadinessDiagnostics = futureFeatures.length ? controller.diagnostics : [];
  const [runMode, setRunMode] = useState<"live" | "preview">("live");
  const [previewScenario, setPreviewScenario] = useState<"normal" | "retry" | "failure">("normal");
  const effectiveRunMode = futureFeatures.length ? "preview" : runMode;
  const visibleSteps = preview.session ? presentRunSteps(preview.session,preview.session.steps).filter(step => previewScope(step.path) === previewScope(safePath)) : presentRunSteps(controller.run,controller.steps).filter(step=>previewScope(step.graphPath??[])===previewScope(safePath));
  const previewActive = preview.session ? previewActiveNodes(preview.session,safePath) : new Set<string>();
  const visibleEvents = preview.session ? frontendPreviewEvents(preview.session) : controller.events;
  const [selection, setSelection] = useState<string | null>(null); const [edgeSelection, setEdgeSelection] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const [tab, setTab] = useState<"node" | "state" | "graph" | "run" | "environment" | "export">("node"); const [paletteOpen, setPaletteOpen] = useState(() => initial.definition.nodes.length <= 2 && !window.matchMedia("(max-width: 900px)").matches); const [inspectorOpen, setInspectorOpen] = useState(false); const [minimapOpen, setMinimapOpen] = useState(false);
  const [panelWide, setPanelWide] = useState(false), [historyOpen,setHistoryOpen] = useState(false), [bubblesOpen,setBubblesOpen] = useState(true);
  const [nodeTab,setNodeTab] = useState<"config"|"execution">("config"), [selectedStepId,setSelectedStepId] = useState<string|null>(null);
  const [exportNotice,setExportNotice]=useState("");
  const [frontendCheck,setFrontendCheck]=useState<{definition:WorkflowDefinitionV2;message:string}|null>(null);
  const displayedDefinition = definition;
  const displayedEditor = editor;
  const canvasIdentity = `${definition.workflowId}:${definition.revision}:${JSON.stringify(safePath)}`;
  const readOnly = executionView || Boolean(initial.archived) || Boolean(preview.session);
  const executionByNode = latestNodeSteps(visibleSteps);
  const [inputReuseOmissions, setInputReuseOmissions] = useState<{pointer:string;reason:string}[]>([]);
  const [dialog, setDialog] = useState<"leave" | "run" | "rerun" | "template" | "archive" | "versions" | "conflict" | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<WorkflowDocumentV2 | null>(null); const [snapshotFocus, setSnapshotFocus] = useState<string | null>(null); const [revisions, setRevisions] = useState<WorkflowRevisionSummary[]>([]);
  const [responseDrafts,setResponseDrafts]=useState<Record<string,ResponseDraft>>({});
  const focusedResponse=useRef('');
  const [artifactContent, setArtifactContent] = useState<{ runId: string; value: JsonValue } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{ runId: string; failed: boolean; message: string } | null>(null);
  const [viewZoom, setViewZoom] = useState(1); const [canvasViewMode, setCanvasViewMode] = useState<"readable" | "overview" | "custom">("readable"); const [measurements, setMeasurements] = useState<Record<string, { width: number; height: number }>>({}); const graphRef = useRef<ReactFlowInstance<CanvasNode> | null>(null); const editorRoot = useRef<HTMLElement>(null);
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
  const pendingThread=preview.session?null:controller.currentThread;
  const observedState=executionObservation(run,pendingThread,controller.historyExpired,controller.observedRunId);
  const observationStatus=observedState.label;
  const [selectedInterruptId,setSelectedInterruptId]=useState<string|null>(null);
  const pendingInterrupt=observedState.phase==='waiting'?pendingThread?.interrupts.find(item=>item.id===selectedInterruptId)??pendingThread?.interrupts.find(item=>JSON.stringify(item.graphPath??[])===JSON.stringify(safePath))??pendingThread?.interrupts[0]:undefined;
  const responseKey=pendingInterrupt&&pendingThread?`${pendingThread.threadId}:${pendingInterrupt.id}`:'';
  const responseDraft=responseDrafts[responseKey]??{value:pendingInterrupt?initializeResponseDraft(pendingInterrupt.schema,{}):{}};
  const reviewFacts=pendingInterrupt&&pendingThread?reviewContextFacts(definition,pendingThread,pendingInterrupt,visibleSteps):null;
  const reviewBlocked=Boolean(reviewFacts?.missing&&!pendingInterrupt?.breakpoint);
  const batchReviewBlocked=pendingThread?pendingThread.interrupts.some(item=>!item.breakpoint&&reviewContextFacts(definition,pendingThread,item,visibleSteps).missing):false;
  const previewTask=preview.session?.tasks[preview.session.cursor];
  const previewWaiting=preview.session?.status==='waiting'&&!preview.historical&&previewTask&&JSON.stringify(previewTask.path)===JSON.stringify(safePath)?previewTask:undefined;
  function locateResponse(nodeId:string,path?:string[],interruptId?:string){
    if(interruptId)setSelectedInterruptId(interruptId);
    if(path&&JSON.stringify(path)!==JSON.stringify(safePath)){focusedResponse.current='';navigateGraph(path);return;}
    setBubblesOpen(true);setInspectorOpen(false);setHistoryOpen(false);setSelection(nodeId);setEdgeSelection(null);
    const point=displayedEditor.nodes[nodeId];if(!point)return;
    // Let the history drawer close before React Flow measures the available height.
    requestAnimationFrame(()=>{void graphRef.current?.fitBounds({x:point.x-30,y:point.y-110,width:Math.max(measurements[nodeId]?.width??240,330)+60,height:(measurements[nodeId]?.height??150)+560},{padding:.08,duration:220});});
  }
  useEffect(()=>{
    const key=responseKey||(previewWaiting?`${preview.session!.id}:${previewWaiting.id}`:'');
    if(!key||!inspection||focusedResponse.current===key)return;
    const nodeId=pendingInterrupt?.nodeId??previewWaiting?.nodeId;if(!nodeId||!displayedEditor.nodes[nodeId])return;
    focusedResponse.current=key;
    const frame=requestAnimationFrame(()=>locateResponse(nodeId));return()=>cancelAnimationFrame(frame);
  },[responseKey,previewWaiting?.id,inspection,JSON.stringify(safePath)]);
  const nestedWaiting=observedState.phase==='waiting'?pendingThread?.interrupts.filter(item=>(item.graphPath?.length??0)>safePath.length&&safePath.every((id,index)=>item.graphPath?.[index]===id)):[];
  const waitingBubble=nestedWaiting?.length&&pendingThread&&JSON.stringify(pendingInterrupt?.graphPath??[])!==JSON.stringify(safePath)?{
    runId:pendingThread.currentRunId,nodeId:nestedWaiting[0].graphPath![safePath.length],content:<><strong>子图内部有 {nestedWaiting.length} 项等待回应</strong>{nestedWaiting.map(item=><button key={item.id} onClick={()=>locateResponse(item.nodeId,item.graphPath,item.id)}>进入回应：{item.title}</button>)}</>
  }:pendingInterrupt&&pendingThread&&inspection&&JSON.stringify(pendingInterrupt.graphPath??[])===JSON.stringify(safePath)?{
    runId:pendingThread.currentRunId,nodeId:pendingInterrupt.nodeId,
    content:<>{pendingThread.interrupts.length>1?<label>选择待回应任务<select aria-label="选择待回应任务" value={pendingInterrupt.id} onChange={e=>{const item=pendingThread.interrupts.find(i=>i.id===e.target.value);if(item)locateResponse(item.nodeId,item.graphPath,item.id);}}>{pendingThread.interrupts.map(item=><option key={item.id} value={item.id}>{item.graphPath?.length?"子图 / ":""}{item.title} · {item.taskId?.slice(0,8)??item.id.slice(0,8)}</option>)}</select></label>:null}<ReviewContext definition={definition} thread={pendingThread} interrupt={pendingInterrupt} steps={visibleSteps}/><NodeResponseForm key={responseKey} title={`${pendingInterrupt.title}${pendingThread.interrupts.length>1?` · 待回应 ${pendingThread.interrupts.length} 项`:""}`} schema={pendingInterrupt.schema} value={responseDraft.value} busy={controller.busy} breakpoint={pendingInterrupt.breakpoint} batchOnly={pendingThread.interrupts.length>1&&pendingThread.interrupts.some(item=>item.breakpoint)}
      onChange={value=>setResponseDrafts(current=>({...current,[responseKey]:{value}}))}
      onInvalid={invalid=>setResponseDrafts(current=>({...current,[responseKey]:{...(current[responseKey]??{value:responseDraft.value}),invalid}}))}
      onSubmit={()=>responseDraft.invalid?false:controller.resumeThread(pendingThread,{[pendingInterrupt.id]:responseDraft.value})} contextMissing={reviewBlocked} onCancel={()=>{if(window.confirm("取消本次执行？已完成的步骤会保留，等待中的回应不会提交。"))void controller.cancel();}}/>{pendingThread.interrupts.length>1?<button disabled={controller.busy||batchReviewBlocked||pendingThread.interrupts.some(item=>{if(item.breakpoint)return false;const draft=responseDrafts[`${pendingThread.threadId}:${item.id}`];const value=draft?.value??initializeResponseDraft(item.schema,{});return Boolean(draft?.invalid)||!validateSchemaValue(item.schema,value).valid;})} onClick={()=>void controller.resumeThread(pendingThread,Object.fromEntries(pendingThread.interrupts.map(item=>[item.id,responseDrafts[`${pendingThread.threadId}:${item.id}`]?.value??(item.breakpoint?{}:initializeResponseDraft(item.schema,{}))])))}>提交全部已填写回应并继续</button>:null}</>
  }:previewWaiting&&preview.session?{runId:preview.session.id,nodeId:previewWaiting.nodeId,content:<PreviewResponse key={`${preview.session.id}:${previewWaiting.id}`} session={preview.session} onRespond={preview.respond}/ >}:undefined;
  const activeStep = preview.session ? preview.session.tasks[preview.session.cursor] : [...visibleSteps].reverse().find(item => item.status === "running"); const failureTarget = run && run.status!=="cancelled" ? runFailureTarget(run, controller.steps, controller.runSnapshot?.definition) : undefined; const selectedNode = displayedDefinition.nodes.find(item => item.id === selection); const selectedEdge = displayedDefinition.transitions.find(item => item.id === edgeSelection);
  const environment = controller.environments.find(item => item.environmentRef === controller.environmentRef);
  const selectedNodeRuntimeFeatures=selectedNode?frontendCapabilities({...definition,nodes:[selectedNode]},environment?.capabilities??[]):[];
  const selectedTool = selectedNode?.type === "core.tool" ? controller.tools.find(tool => tool.ref === selectedNode.config.toolRef) : undefined;
  const nodes = useMemo<CanvasNode[]>(() => displayedDefinition.nodes.map((node,index) => ({ id: node.id, type: "workflowV2", measured: measurements[node.id], position: displayedEditor.nodes[node.id] ?? { x: 80 + index * 240, y: 160 }, selected: selection === node.id, data: { onPortsReady: reportPortsReady, label: node.label, type: node.type, active: preview.session ? previewActive.has(node.id) : run?.revision === definition.revision && !controller.definitionDirty && activeStep?.nodeId === node.id, status: ((pendingInterrupt?.nodeId===node.id&&JSON.stringify(pendingInterrupt.graphPath??[])===JSON.stringify(safePath)||nestedWaiting?.some(item=>item.graphPath?.[safePath.length]===node.id))?"waiting":(preview.session || executionView || run?.revision===definition.revision&&!controller.definitionDirty) ? executionByNode.get(node.id)?.status : undefined), onConfigure: () => { setSelection(node.id); setEdgeSelection(null); setNodeTab("config"); showTab("node"); }, onDelete: readOnly ? undefined : () => deleteNode(node.id), failed: preview.session ? executionByNode.get(node.id)?.status === "failed" : run?.revision === definition.revision && !controller.definitionDirty && failureTarget?.nodeId === node.id, outlets: outlets(node), sources: Object.fromEntries(displayedDefinition.transitions.filter(edge => edge.from === node.id && displayedEditor.edges[edge.id]?.routing?.source).map(edge => [edge.outlet, displayedEditor.edges[edge.id].routing!.source!])), targets: [...displayedDefinition.transitions,...sendTargetRelations(displayedDefinition)].filter(edge => edge.to === node.id).map((edge, index, list) => ({ id: edge.id, placement: displayedEditor.edges[edge.id]?.routing?.target ?? { side: "left", offset: (index + 1) / (list.length + 1) } })) } })), [displayedDefinition.nodes, displayedDefinition.transitions, displayedEditor.nodes, displayedEditor.edges, selection, activeStep?.nodeId, failureTarget?.nodeId, controller.definitionDirty, run?.revision, definition.revision, measurements, visibleSteps, preview.session, readOnly, executionView, reportPortsReady,pendingInterrupt?.nodeId,pendingInterrupt?.graphPath,nestedWaiting?.length]);
  const edges = useMemo<Edge[]>(() => [...displayedDefinition.transitions,...sendTargetRelations(displayedDefinition)].map(edge => ({ id: edge.id, reconnectable: edge.id===sendTargetEdgeId(edge.from)?"target":true, source: edge.from, target: edge.to, sourceHandle: edge.outlet, targetHandle: `target-${edge.id}`, label: transitionLabel(edge.outlet), type: "editable", markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#566583" }, style: edge.id===sendTargetEdgeId(edge.from)?{strokeDasharray:"6 5"}:undefined, selected: edge.id === edgeSelection, animated: run?.revision === definition.revision && !controller.definitionDirty && activeStep?.nodeId === edge.from, data: { routing: displayedEditor.edges[edge.id]?.routing, zoom: viewZoom, sourceBounds: nodeBounds(displayedDefinition, displayedEditor, edge.from, measurements), targetBounds: nodeBounds(displayedDefinition, displayedEditor, edge.to, measurements) }, className: edge.id === edgeSelection ? "wf-v2-diagnostic-edge" : undefined })), [displayedDefinition, displayedEditor, measurements, activeStep?.nodeId, edgeSelection, viewZoom, controller.definitionDirty, run?.revision]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) { if(readOnly)return; const target = event.target as HTMLElement; if (target.closest("input,textarea,select,[contenteditable=true],dialog,.nokey")) return; if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) controller.redo(); else controller.undo(); } else if (event.ctrlKey && event.key.toLowerCase() === "y") { event.preventDefault(); controller.redo(); } }
    const root = editorRoot.current; root?.addEventListener("keydown", shortcut); return () => root?.removeEventListener("keydown", shortcut);
  }, [controller,readOnly]);
  useEffect(() => { const body = document.body; body.classList.add("workflow-live-active"); return () => body.classList.remove("workflow-live-active"); }, []);
  useEffect(() => { const media = window.matchMedia("(max-width: 900px)"); const update = () => { setNarrow(media.matches); if (media.matches) setPaletteOpen(false); }; media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  function navigateGraph(path: string[]) {
    const view = graphRef.current?.getViewport(); if (view) scopeViews.current.set(canvasIdentity, view);
    setGraphPath(path); setSelection(null); setEdgeSelection(null); setInspectorOpen(false);
  }
  function toggleTab(next: typeof tab) { if (inspectorOpen && tab === next) setInspectorOpen(false); else { clearSelection(); showTab(next); } }
  function showTab(next: typeof tab) { setTab(next); setInspectorOpen(true); if(narrow) setPaletteOpen(false); }
  function togglePalette() { const open = !paletteOpen; setPaletteOpen(open); if(open && narrow) setInspectorOpen(false); setSelection(null);setEdgeSelection(null); }
  function clearSelection() { setSelection(null);setEdgeSelection(null); if(tab === "node")setInspectorOpen(false); }
  function openExecution(nodeId: string, stepId: string) { setSelection(nodeId);setEdgeSelection(null);setSelectedStepId(stepId);setNodeTab("execution");showTab("node"); }
  function exportDocument() { const exported = preview.session?.snapshot ?? (executionView ? controller.runSnapshot : null) ?? {definition:rootController.definition,editor:rootController.editor}; const blob = new Blob([JSON.stringify(exported,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=`${displayedDefinition.name}.json`;document.body.append(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setExportNotice("已发起 JSON 文件下载，请查看浏览器下载列表。"); }
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
      const fields = target.panel === "environment" ? [editorRoot.current?.querySelector<HTMLElement>('[aria-label="运行环境"]')]
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
  function editFailedInput() {
    if (!failureTarget || !run || run.revision !== definition.revision || controller.definitionDirty) return;
    setSnapshot(null); setDialog(null); rootController.exitObservation(); setViewingRun(false); preview.close();
    locateDiagnostic({ code: run.error?.code ?? "INVALID_NODE_INPUT", severity: "error", scope: "run", message: "", nodeId: failureTarget.nodeId, pointer: failureTarget.pointer });
  }
  function updateNode(updates: Partial<WorkflowNodeV2>) { if (!selectedNode || readOnly) return; controller.editDocument(current => {
      const changed = { ...selectedNode, ...updates };
      const transitions = current.definition.transitions.filter(edge=>edge.from!==selectedNode.id || outlets(changed).includes(edge.outlet));
      return {definition:{...current.definition,nodes:current.definition.nodes.map(node=>node.id===selectedNode.id?changed:node),transitions},editor:{...current.editor,edges:Object.fromEntries(Object.entries(current.editor.edges).filter(([id])=>transitions.some(edge=>edge.id===id)))}};
    }, `node-${selectedNode.id}-${Object.keys(updates).join()}`); }
  function addNode(type: string) { if(readOnly)return; const id = crypto.randomUUID(); const node = authoringNodeTypes.some(item => item.type === type) ? createAuthoringNode(type,id) : createNodeV2(type,id); controller.editDocument(current => { const point = additionPosition(current); return insertAuthoringNode(current,node,point.x,point.y); }); setSelection(id); showTab("node"); requestAnimationFrame(()=>{void graphRef.current?.fitView({nodes:[{id}],minZoom:.9,maxZoom:1,duration:200});}); }
  function deleteElements(nodeIds: string[], edgeIds: string[] = []) {
    if(readOnly)return;
    // The selected node/Inspector button will unmount. Keep shortcuts in this editor.
    editorRoot.current?.focus({ preventScroll: true });
    controller.editDocument(current => removeCanvasElements(current, nodeIds, edgeIds));
    setSelection(null); setEdgeSelection(null);
  }
  function deleteNode(id: string) { deleteElements([id]); }
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
  function configureExample(kind: "parallel" | "batch") {
    const example=authoringExample(kind,definition);controller.editDocument(()=>example); replaceRunInput({},true);setPaletteOpen(false);setSelection(null);setInspectorOpen(false);setDialog(null);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{void graphRef.current?.fitView({nodes:example.definition.nodes.slice(0,3).map(node=>({id:node.id})),minZoom:.9,maxZoom:1,duration:200});}));
  }
  function configureToolLoop(basic = false) {
    const ids = ["start","prepare","model","router","tools","end"]; const loopNodes = ids.map((id,index) => createNodeV2(["core.start","core.transform","core.llm","core.router","core.tool_dispatch","core.end"][index],id));
    loopNodes[1] = { ...createAuthoringNode("core.function","prepare"), label: "准备对话", config: { implementation:"registered", functionRef:"normalize_messages", authoring:{interrupt:{title:"你希望了解什么？",schema:{type:"object",properties:{question:{type:"string",title:"你的问题",minLength:1}},required:["question"],additionalProperties:false},resumeWrites:{question:"question"}}}}, inputs: {}, writes: {} };
    loopNodes[2].config = { providerRef: environment?.providers[0]?.ref ?? "", modelRef: environment?.providers[0]?.modelRefs[0] ?? "", modelParameters: {}, allowedToolRefs: [], authoring: {previewOutput:{messages:[{role:"assistant",content:[{type:"text",text:"这是一段前端演示回复。接入执行引擎后，将显示模型的真实输出。"}]}]}} };
    const next: WorkflowDefinitionV2 = { ...definition, nodes: basic ? loopNodes.filter(node => ["start","prepare","model","end"].includes(node.id)) : loopNodes, entryNodeId: "start", transitions: [{ id: "start-prepare",from:"start",outlet:"next",to:"prepare" },{id:"prepare-model",from:"prepare",outlet:"next",to:"model"},...(basic ? [{id:"model-end",from:"model",outlet:"next",to:"end"}] : [{id:"model-router",from:"model",outlet:"next",to:"router"},{id:"router-tools",from:"router",outlet:"has_calls",to:"tools"},{id:"router-end",from:"router",outlet:"default",to:"end"},{id:"tools-model",from:"tools",outlet:"next",to:"model"}])], inputSchema: {type:"object",properties:{},additionalProperties:false}, state:{schema:{type:"object",properties:{question:{type:"string",title:"问题"},messages:{type:"array",title:"对话消息",items:{type:"object"}},pendingCalls:{type:"array",title:"待执行工具",items:{type:"object"}}},required:["messages","pendingCalls"],additionalProperties:false},initial:{question:"",messages:[],pendingCalls:[]},inputBindings:{},reducers:{messages:{name:"messages",version:1},pendingCalls:{name:"replace",version:1}}}, outputSchema:{type:"object",properties:{messages:{type:"array",items:{type:"object"}}},required:["messages"],additionalProperties:false},outputBindings:{messages:stateBinding("/messages")} };
    controller.editDocument(current => ({ definition: next, editor: { ...current.editor, nodes: Object.fromEntries(Object.entries({start:{x:40,y:160},prepare:{x:260,y:160},model:{x:480,y:160},router:{x:700,y:160},tools:{x:700,y:400},end:{x:basic ? 700 : 920,y:160}}).filter(([id])=>next.nodes.some(node=>node.id===id))),edges:Object.fromEntries(next.transitions.map(edge => [edge.id,{routing:{version:1,mode:"auto" as const}}])) } })); replaceRunInput({},true); setPaletteOpen(false); setSelection("model"); showTab("node"); setDialog(null); // Choosing a new structure is an explicit camera action.
    requestAnimationFrame(() => requestAnimationFrame(() => { void graphRef.current?.fitView({ minZoom: .9, maxZoom: 1, duration:250 }); }));
  }
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
  function requestSave() { if (pendingFields.length) { blockPending("save"); return; } void controller.saveDocument(); }
  function runNow(empty = false) {
    if (readOnly) return;
    if (empty) controller.replaceInput({});
    setRunDialogOpen(false);
    showTab("run"); setHistoryOpen(true);
    if (controller.dirty) { setDialog("run"); return; }
    void controller.startRun();
  }
  async function replayOriginal() {
    if (readOnly || !run || !run.inputReuse?.complete || run.revision === definition.revision) return;
    if (!window.confirm(`使用修订 ${run.revision} 和脱敏快照中的输入创建新运行？外部写工具可能再次执行。`)) return;
    let input: JsonValue = {};
    for (const field of run.inputReuse.fields ?? []) input = putValue(input, field.pointer, field.value);
    await controller.operation(async () => {
      const created = await workflowApiV2.createRun(run.workflowId, run.revision, input, run.environmentRef, crypto.randomUUID(), run.launchContext ?? undefined);
      if (created.historyExpired) { controller.setError("请求已执行，但运行历史已清理；没有自动重试。"); return; }
      controller.selectRun(await workflowApiV2.run(created.runId));
      setViewingRun(true); showTab("run"); setHistoryOpen(true);
    });
  }
  function requestRun() {
    setViewingRun(false);
    if (effectiveRunMode === "preview") {
      if (pendingFields.length) { blockPending("run"); return; }
      const issues = authoringDiagnostics(rootController.definition);
      if (issues.length) { controller.setError(issues.join("；")); return; }
      controller.setError(""); setGraphPath([]); preview.start({definition: rootController.definition, editor: rootController.editor}, previewScenario, rootController.input); showTab("run"); return;
    }
    const missingMessage = rootController.definition.nodes.find(node=>messageAuthoringIssue(node));
    if(missingMessage){controller.rejectRunPreparation(messageAuthoringIssue(missingMessage)!);setSelection(missingMessage.id);showTab("node");return;}
    if (controller.submitUnknown) { showTab("run"); controller.setError("上次提交状态待确认，请先确认原请求，避免重复执行。"); return; }
    if (pendingFields.length) { controller.rejectRunPreparation("未启动运行：请先完成当前配置编辑。"); blockPending("run"); return; }
    const schema = rootController.definition.inputSchema;
    const fields = Object.keys(schema.properties ?? {}).length;
    const emptyValid = validateSchemaValue(schema, {}).valid;
    if (!fields && emptyValid && !controller.inputInvalid) {
      if (run && ["success", "failed", "cancelled", "continued"].includes(run.status)) { setDialog("rerun"); return; }
      runNow(); return;
    }
    setRunDialogOpen(true);
  }
  async function openVersions() { navigateGraph([]); setSnapshotFocus(null); setDialog("versions"); await controller.operation(async () => setRevisions((await workflowApiV2.revisions(rootController.definition.workflowId)).items)); }
  async function restore() { if (!snapshot) return; const candidate = { definition: { ...snapshot.definition, revision: rootController.definition.revision }, editor: { ...snapshot.editor, editorRevision: rootController.editor.editorRevision, definitionRevision: rootController.definition.revision, edges: Object.fromEntries(snapshot.definition.transitions.map(edge => [edge.id, { ...snapshot.editor.edges[edge.id], routing: snapshot.editor.edges[edge.id]?.routing ?? {version:1,mode:"auto" as const} }])) } }; const saved = await controller.restoreDocument(candidate); if (saved) { setSnapshot(null); setDialog(null); } }
  const runInputConsumers = [
    ...rootController.definition.nodes.flatMap(node => Object.entries(node.inputs).flatMap(([name, binding]) => binding.source === "input" ? [`${node.label} · ${name} ← ${binding.pointer}`] : [])),
    ...Object.entries(rootController.definition.state.inputBindings).flatMap(([field, binding]) => binding.source === "input" ? [`State.${field} ← ${binding.pointer}`] : []),
  ];
  const providerValue = useMemo(() => drafts.current, []);
  return <JsonDraftProvider drafts={providerValue} onPending={pending}><main ref={editorRoot} className={`wf-v2-workspace wf-unified ${panelWide ? "panel-wide" : ""} ${readOnly ? "read-only" : ""}`} tabIndex={-1} onBlur={controller.endEditGroup} onPointerUp={controller.endEditGroup}>{navigation}
    <header className="wf-v2-topbar"><button aria-label="返回工作流库" onClick={() => controller.dirty || controller.inputDirty || pendingFields.length ? setDialog("leave") : onBack()}><ArrowLeft size={18}/></button><div className="wf-name"><small>WORKFLOW</small><input aria-label="工作流名称" value={inspection?.definition.name ?? rootController.definition.name} readOnly={readOnly} onChange={event => rootController.editDefinition(current => ({...current,name:event.target.value}),"name")} /></div><small>流程版本 {inspection?.definition.revision ?? rootController.definition.revision}{executionView ? ` · ${observationStatus}` : controller.dirty ? " · 未保存" : " · 已保存"}</small><div className="wf-v2-topbar-actions"><select aria-label="执行方式" value={effectiveRunMode} disabled={readOnly} onChange={e=>setRunMode(e.target.value as "live"|"preview")}><option value="live" disabled={futureFeatures.length>0}>真实执行</option><option value="preview">前端预览</option></select><select aria-label="运行环境" disabled={readOnly || Boolean(run && !["success","failed","cancelled","continued"].includes(run.status))} value={controller.environmentRef} onChange={event=>controller.setEnvironmentRef(event.target.value)}><option value="">选择环境</option>{controller.environments.map(item=><option key={item.environmentRef} value={item.environmentRef}>{item.name}</option>)}</select><button title="撤销 Ctrl/Cmd+Z" aria-label="撤销" disabled={readOnly||!controller.canUndo} onClick={controller.undo}><Undo2 size={17}/></button><button title="重做 Ctrl+Y / Shift+Cmd+Z" aria-label="重做" disabled={readOnly||!controller.canRedo} onClick={controller.redo}><Redo2 size={17}/></button><button aria-label="版本与恢复" onClick={() => void openVersions()}><History size={17}/></button><button disabled={controller.busy || readOnly} onClick={requestSave}><Save size={17}/>保存</button><button disabled={controller.busy || (effectiveRunMode==="live"&&!environment) || readOnly} onClick={() => { if (pendingFields.length) blockPending("validate"); else if(effectiveRunMode==="preview") { const issues=authoringDiagnostics(rootController.definition); controller.setError(issues.length?issues.join("；"):""); setFrontendCheck(issues.length?null:{definition:rootController.definition,message:"前端结构检查通过。真实执行仍需后端能力与环境校验。"}); } else {const invalid=rootController.definition.nodes.find(node=>messageAuthoringIssue(node));if(invalid){controller.setError(messageAuthoringIssue(invalid)!);setSelection(invalid.id);showTab("node");}else void controller.validate();} }}><CheckCircle2 size={17}/>校验</button><button className="primary" disabled={controller.busy || (effectiveRunMode==="live"&&!environment) || readOnly} onClick={requestRun}><Play size={17}/>{effectiveRunMode==="preview"?"运行预览":"运行"}</button>{run && !["success","failed","cancelled","continued"].includes(run.status) ? <button disabled={controller.busy || controller.cancelPending} aria-busy={controller.cancelPending} onClick={() => void controller.cancel()}><Square size={16}/>{controller.cancelPending ? "正在提交取消…" : "取消"}</button> : null}</div></header>
    {visibleError ? <div className="wf-v2-alert" role="alert"><AlertTriangle size={18}/><span>{visibleError}</span>{controller.inputInvalid ? <button onClick={locateInputError}>定位外部调用数据</button> : pendingFields.length ? <button onClick={locatePendingEdit}>定位未完成编辑</button> : null}{controller.saveConflict ? <button onClick={() => setDialog("conflict")}>查看保存冲突</button> : null}<button onClick={() => { setPendingAction(null); controller.setError(""); }}>关闭</button></div> : null}{controller.notice ? <div className={`wf-v2-notice ${controller.notice.includes("未通过") ? "warning" : ""}`} role="status">{controller.notice}</div> : null}
    {frontendCheck?.definition===rootController.definition?<div className="wf-v2-notice" role="status">{frontendCheck.message}<button onClick={()=>setFrontendCheck(null)}>关闭</button></div>:null}{visibleDiagnostics.length ? <section className="wf-problems" aria-label="问题摘要"><strong data-config-field="问题摘要" tabIndex={-1}>{visibleDiagnostics.length} 个问题</strong>{visibleDiagnostics.map((item,index) => { const text = diagnosticText(item,definition); return <button key={`${item.code}-${index}`} onClick={() => locateDiagnostic(item)}>{text.location}：{text.title}</button>; })}</section> : null}
    <ReactFlowProvider>
    <div className="wf-v2-body">
    <div className="wf-floating-left"><button aria-label="添加组件" aria-pressed={paletteOpen} onClick={togglePalette}><Plus size={18}/>添加组件</button><nav className="wf-graph-crumb" aria-label="子图路径"><button onClick={()=>navigateGraph([])}>主流程</button>{safePath.map((id,index)=><button key={id} onClick={()=>navigateGraph(safePath.slice(0,index+1))}>› {graphAtPath(projectionRoot.definition,safePath.slice(0,index)).nodes.find(node=>node.id===id)?.label}</button>)}<button aria-label="图设置" aria-pressed={inspectorOpen&&tab==="graph"} onClick={()=>toggleTab("graph")}><Settings2 size={16}/></button></nav></div>
    <nav className="wf-floating-tools" aria-label="工作区工具">
      <button aria-label="State" aria-pressed={inspectorOpen&&tab==="state"} onClick={()=>toggleTab("state")}><Braces size={17}/>State</button>
      <button aria-label="环境与连接" aria-pressed={inspectorOpen&&tab==="environment"} onClick={()=>toggleTab("environment")}><Plug size={17}/>连接</button>
      <button aria-label="执行" aria-pressed={inspectorOpen&&tab==="run"} onClick={()=>toggleTab("run")}><Play size={17}/>执行</button>
      <button aria-label="导出" aria-pressed={inspectorOpen&&tab==="export"} onClick={()=>toggleTab("export")}><Download size={17}/>导出</button>
    </nav>
    {paletteOpen ? <aside className="wf-v2-palette"><div className="wf-panel-heading"><h2>组件库</h2><button aria-label="关闭组件库" onClick={()=>setPaletteOpen(false)}><X size={16}/></button></div><p>选择组件添加到画布，再配置读取、处理和写入。</p><div className="wf-component-list">{[...nodeTypesV2.filter(item=>item.type!=="core.start"),...authoringNodeTypes].map(item=><button disabled={readOnly} key={item.type} onClick={()=>addNode(item.type)}><Plus size={16}/>{item.label}{authoringNodeTypes.some(kind=>kind.type===item.type)?<small>{"真实运行"}</small>:null}</button>)}</div><h3>起步流程</h3><button disabled={readOnly} onClick={()=>setDialog("template")}>选择起步流程</button><p className="wf-field-note">示例使用演示数据，可继续编辑；真实执行能力需单独校验。</p><details><summary>工作流操作</summary><button disabled={controller.dirty||readOnly} onClick={()=>void controller.operation(async()=>{const result=await workflowApiV2.copy(rootController.definition.workflowId,rootController.definition.revision);onOpen(result.workflowId);})}><Copy size={16}/>复制已保存版本</button><button disabled={readOnly} onClick={()=>setDialog("archive")}><Trash2 size={16}/>归档工作流</button></details></aside> : null}
    <section className={`wf-v2-canvas ${executionView&&!inspection?"loading-snapshot":""}`} aria-label="工作流画布">{executionView&&!inspection?<div className="wf-snapshot-loading" role="status">正在加载所选运行的只读快照…</div>:null}<EdgeEditingContext.Provider value={(id,point,index,phase) => { const current = editor.edges[id]?.routing; const points = [...(current?.points ?? [])]; points[index] = point; setRouting(id,{...current,version:1,mode:"manual",points},`route-${id}`); if (phase === "end") controller.endEditGroup(); }}><div className="wf-v2-graph-stage" onFocusCapture={revealKeyboardNode}><ReactFlow key={canvasIdentity} autoPanOnNodeFocus={false} ariaLabelConfig={canvasAria} nodes={nodes} edges={edgesWithMeasuredPorts(edges,nodes,readyPorts)} nodeTypes={canvasTypes} edgeTypes={edgeTypes} onInit={instance => { graphRef.current = instance; const saved = scopeViews.current.get(canvasIdentity) ?? editor.viewport; const initialView=saved ? instance.setViewport(saved) : instance.fitView({nodes:displayedDefinition.nodes.length>6?displayedDefinition.nodes.slice(0,3).map(node=>({id:node.id})):undefined,minZoom:.9,maxZoom:1}); void initialView.then(()=>{if(graphRef.current===instance&&pendingInterrupt&&JSON.stringify(pendingInterrupt.graphPath??[])===JSON.stringify(safePath))locateResponse(pendingInterrupt.nodeId);}); }} onConnect={connect} onReconnect={(edge,connection) => connect(connection,edge.id)} edgesReconnectable reconnectRadius={18} onBeforeDelete={async ({nodes:removedNodes,edges:removedEdges}) => { if(removedNodes.length || removedEdges.length) deleteElements(removedNodes.map(node=>node.id),removedEdges.map(edge=>edge.id)); return false; }} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_,node) => {setSelection(node.id);setEdgeSelection(null);setNodeTab("config");showTab("node");}} onEdgeClick={(_,edge) => {if(edge.id===sendTargetEdgeId(edge.source)){setSelection(edge.source);setEdgeSelection(null);}else{setEdgeSelection(edge.id);setSelection(null);}showTab("node");}} onPaneClick={clearSelection} nodesDraggable={!readOnly} nodesConnectable={!readOnly} onMoveEnd={(event,viewport) => { scopeViews.current.set(canvasIdentity,viewport); setViewZoom(viewport.zoom); if(event) setCanvasViewMode("custom"); }} minZoom={.02} maxZoom={1.7} deleteKeyCode={readOnly?null:["Backspace","Delete"]}><Background gap={24} color="#dce2eb"/>{(waitingBubble || bubblesOpen && (preview.session || run && (executionView || run.revision===definition.revision&&!controller.definitionDirty))) ? <ExecutionBubbles definition={displayedDefinition} editor={displayedEditor} steps={visibleSteps} events={visibleEvents} sizes={measurements} onOpen={openExecution} waiting={waitingBubble} showCompleted={bubblesOpen}/> : null}<Controls aria-label="画布导航" fitViewOptions={readableFitOptions}/>{minimapOpen?<MiniMap style={{width:130,height:85}} pannable zoomable/>:null}</ReactFlow></div></EdgeEditingContext.Provider><WorkflowOverview definition={displayedDefinition} launchContext={launchContext}/><div className="wf-canvas-local-tools"><button onClick={()=>{void graphRef.current?.fitView({minZoom:.2,maxZoom:1,duration:200});setCanvasViewMode("overview");}}>适应画布</button><button onClick={()=>{setCanvasViewMode("readable");void graphRef.current?.fitView({nodes:displayedDefinition.nodes.slice(0,3).map(node=>({id:node.id})),minZoom:.9,maxZoom:1,duration:200});}}>可读视图</button><small>{Math.round(viewZoom*100)}%{canvasViewMode==="overview"?" · 全图概览":""}</small><button aria-pressed={minimapOpen} onClick={()=>setMinimapOpen(!minimapOpen)}>小地图</button><button aria-pressed={bubblesOpen} onClick={()=>setBubblesOpen(!bubblesOpen)}>执行气泡</button></div>{preview.session?<div className="wf-preview-banner"><strong>前端预览 · 演示数据</strong><span>{preview.historical?"只读历史":"不执行真实请求"}</span>{["running","waiting"].includes(preview.session.status)&&!preview.historical?<button onClick={preview.cancel}>停止预览</button>:<button onClick={()=>{preview.close();setGraphPath([]);clearSelection();}}>返回流程编辑</button>}</div>:null}{executionView?<div className="wf-history-banner"><span>{observedState.banner}</span><button onClick={()=>{setViewingRun(false);controller.exitObservation();clearSelection();}}>返回流程编辑</button></div>:null}{!environment?<div className="wf-canvas-notice">{controller.initialLoadStatus==="loading"?"正在加载运行环境…":"没有可用环境，请检查环境与连接。"}</div>:null}</section>
    <aside className={`wf-v2-inspector ${inspectorOpen ? "" : "closed"}`} aria-label="工作流详情"><header className="wf-panel-heading"><h2>{({node:selectedNode?.label??(selectedEdge?"连线设置":"节点"),state:"State",graph:"图设置",run:"执行",environment:"环境与连接",export:"导出"})[tab]}</h2>{selectedNode?<button aria-label="定位选中节点" onClick={()=>{const bounds=nodeBounds(displayedDefinition,displayedEditor,selectedNode.id,measurements);const zoom=graphRef.current?.getViewport().zoom??1;const panelWidth=editorRoot.current?.querySelector(".wf-v2-inspector")?.clientWidth??0;void graphRef.current?.setCenter(bounds.x+bounds.width/2+panelWidth/(2*zoom),bounds.y+bounds.height/2,{zoom,duration:200});}}>定位</button>:null}<button aria-label={panelWide?"缩小面板":"扩大面板"} onClick={()=>setPanelWide(!panelWide)}>{panelWide?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button><button aria-label="关闭详情面板" onClick={()=>setInspectorOpen(false)}><X size={16}/></button></header><div className="wf-v2-inspector-scroll">
    <div hidden={tab !== "environment"}><EnvironmentPanel environments={controller.environments} selected={environment} tools={controller.tools} onSelect={controller.setEnvironmentRef} onSaved={()=>void controller.refreshEnvironments()} onDiscover={ref=>void controller.discover(ref)} locked={readOnly||Boolean(run&&!["success","failed","cancelled","continued"].includes(run.status))}/></div>
    <div hidden={tab !== "export"}><p>导出当前工作流定义、节点处理配置、State 与布局。</p><button onClick={exportDocument}><Download size={16}/>导出工作流 JSON</button>{exportNotice?<p role="status">{exportNotice}</p>:null}<p className="wf-field-note">文件不包含连接凭据。运行需要对应的 EduFlow 执行服务与授权环境。</p></div>
    <div hidden={tab !== "graph"}><label>前端预览情境<select value={previewScenario} disabled={Boolean(preview.session)} onChange={e=>setPreviewScenario(e.target.value as typeof previewScenario)}><option value="normal">正常流程</option><option value="retry">演示失败后重试</option><option value="failure">演示失败停止</option></select></label><p>当前图：{definition.name}。图的输入来自调用方；人工回应由运行中的具体节点请求。</p><button onClick={()=>setRunDialogOpen(true)} disabled={readOnly || !environment}>填写本次运行输入</button><fieldset className="wf-node-form" disabled={readOnly}><label>图说明<textarea value={definition.description} onChange={e=>controller.editDefinition(current=>({...current,description:e.target.value}))}/></label><GraphInterfaceFields definition={definition} onChange={controller.editDefinition}/><GraphRuntimeFields persistent={environment?.capabilities.includes("checkpoint")} definition={definition} onChange={controller.editDefinition}/><details><summary>高级接口定义</summary><JsonField<JsonSchema> label="启动输入 Schema" value={definition.inputSchema} onChange={inputSchema=>controller.editDefinition(current=>({...current,inputSchema}))}/><JsonField<JsonSchema> label="图输出 Schema" value={definition.outputSchema} onChange={outputSchema=>controller.editDefinition(current=>({...current,outputSchema}))}/><JsonField<Record<string,Binding>> label="图输出映射" value={definition.outputBindings} validate={validateForm(bindingMapSchema)} onChange={outputBindings=>controller.editDefinition(current=>({...current,outputBindings}))}/></details></fieldset></div>
    <div hidden={tab !== "node"}>{selectedNode ? <>{selectedNode.type==="core.subgraph"?<button onClick={()=>navigateGraph([...safePath,selectedNode.id])}>进入子图{readOnly?"查看":"编辑"}</button>:null}<nav className="wf-detail-tabs"><button aria-pressed={nodeTab==="config"} onClick={()=>setNodeTab("config")}>配置</button><button aria-pressed={nodeTab==="execution"} onClick={()=>setNodeTab("execution")}>执行详情</button></nav>{nodeTab==="execution" ? <ExecutionDetails node={preview.session?selectedNode:controller.runSnapshot?.definition.nodes.find(node=>node.id===selectedNode.id)??selectedNode} steps={visibleSteps} events={visibleEvents} stepId={selectedStepId} onSelect={setSelectedStepId}/> : <fieldset className="wf-node-form" disabled={readOnly}><label>节点名称<input aria-label="节点名称" value={selectedNode.label} onChange={event=>updateNode({label:event.target.value})}/></label>{selectedNode.type === "core.start" ? <StartInputFields definition={definition} onChange={controller.editDefinition}/> : null}{!selectedNode.type.startsWith("control.")&&!["core.start","core.end","core.router"].includes(selectedNode.type)?<BindingFields key={`${selectedNode.id}-read`} section="read" node={selectedNode} inputSchema={definition.inputSchema} stateSchema={definition.state.schema} environmentSchema={{type:"object",properties:Object.fromEntries(Object.entries(environment?.variables??{}).map(([key,value])=>[key,{type:typeof value}]))}} literalSchemas={selectedTool?{arguments:selectedTool.inputSchema}:selectedNode.type==="core.transform"?(transformOperations[String(selectedNode.config.operationRef)]?.schema.properties as Record<string,JsonSchema>):undefined} onChange={updateNode}/>:null}{authoringNodeTypes.some(item=>item.type===selectedNode.type)?<AuthoringProcessing environmentRef={environment?.environmentRef} node={selectedNode} graph={definition} onChange={updateNode}/> :selectedNode.type==="core.router"?<RouterFields node={selectedNode} stateSchema={definition.state.schema} onChange={updateNode} onRemoveOutlet={id=>controller.editDocument(current=>{const transitions=current.definition.transitions.filter(edge=>edge.from!==selectedNode.id||edge.outlet!==id);return {definition:{...current.definition,nodes:current.definition.nodes.map(node=>node.id===selectedNode.id?{...node,config:{...node.config,cases:(node.config.cases as {id:string}[]).filter(item=>item.id!==id).map((item,index)=>({...item,priority:index+1}))}}:node),transitions},editor:{...current.editor,edges:Object.fromEntries(Object.entries(current.editor.edges).filter(([key])=>transitions.some(edge=>edge.id===key)))}};})}/>:<ProcessingFields node={selectedNode} environment={environment} tools={controller.tools} onChange={updateNode} onEnvironment={()=>showTab("environment")}/>}<NodeRuntimeFields environmentRef={environment?.environmentRef} persistent={environment?.capabilities.includes("interrupt")} key={`${selectedNode.id}-runtime`} node={selectedNode} graph={definition} onChange={updateNode}/>{!selectedNode.type.startsWith("control.")&&!["core.start","core.end","core.router"].includes(selectedNode.type)?<BindingFields key={`${selectedNode.id}-write`} section="write" node={selectedNode} inputSchema={definition.inputSchema} stateSchema={definition.state.schema} onChange={updateNode}/>:null}
{readOnly?<p className="wf-field-note">正在查看运行记录；返回流程编辑后可配置和测试节点。</p>:selectedNodeRuntimeFeatures.length?<p className="wf-field-note">以下配置尚未接入真实执行：{selectedNodeRuntimeFeatures.join("、")}。可使用前端预览检查交互。</p>:nodeAuthoring(selectedNode).interrupt?<p className="wf-field-note">此节点使用真实中断与检查点恢复。请运行完整工作流，在该节点的气泡中回应后继续；单独节点测试不处理等待回应。</p>:<NodeTestPanel key={`${selectedNode.id}:${controller.environmentRef}`} definition={{...definition,workflowId:rootController.definition.workflowId,revision:rootController.definition.revision}} node={selectedNode} environmentRef={controller.environmentRef} input={controller.input} blocked={pendingFields.length>0||readOnly}/>}<section data-config-field="outlets"><h3>出口连接</h3>{outlets(selectedNode).map(outlet=><label key={outlet}>{transitionLabel(outlet)||"下一步"}<select aria-label={`出口 ${outlet}`} value={selectedNode.type==="control.send"&&outlet==="item"?String(selectedNode.config.target??""):definition.transitions.find(edge=>edge.from===selectedNode.id&&edge.outlet===outlet)?.to??""} onChange={event=>{const existing=definition.transitions.find(edge=>edge.from===selectedNode.id&&edge.outlet===outlet);if(event.target.value)connect({source:selectedNode.id,target:event.target.value,sourceHandle:outlet,targetHandle:"input"},existing?.id);else if(selectedNode.type==="control.send"&&outlet==="item")updateNode({config:{...selectedNode.config,target:""}});else if(existing)removeEdge(existing.id);}}><option value="">未连接</option>{definition.nodes.filter(node=>node.type!=="core.start").map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></label>)}<button onClick={()=>deleteNode(selectedNode.id)}>删除此节点</button></section></fieldset>}</> : selectedEdge ? <><h2>连线编辑</h2><p>调整连接会改变执行路径；显示布局只整理线条。</p><label>来源节点<select aria-label="连线来源" value={selectedEdge.from} onChange={event=>{const node=definition.nodes.find(node=>node.id===event.target.value);if(node)connect({source:node.id,sourceHandle:outlets(node)[0],target:selectedEdge.to,targetHandle:"input"},selectedEdge.id);}}>{definition.nodes.filter(node=>outlets(node).length).map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></label><label>来源出口<select aria-label="连线出口" value={selectedEdge.outlet} onChange={event=>connect({source:selectedEdge.from,sourceHandle:event.target.value,target:selectedEdge.to,targetHandle:"input"},selectedEdge.id)}>{outlets(definition.nodes.find(node=>node.id===selectedEdge.from)!).map(outlet=><option key={outlet}>{outlet}</option>)}</select></label><label>目标节点<select aria-label="连线目标" value={selectedEdge.to} onChange={event=>connect({source:selectedEdge.from,sourceHandle:selectedEdge.outlet,target:event.target.value,targetHandle:"input"},selectedEdge.id)}>{definition.nodes.filter(node=>node.type!=="core.start").map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></label><h3>显示布局（不改变执行）</h3><small>控制点或线段进入相连节点时，画面会回退为自动走线并标明；可调整控制点或恢复自动走线。</small>{(['source','target'] as const).map(end=><fieldset key={end}><legend>{end==='source'?'来源显示端口':'目标显示端口'}</legend><label>节点侧边<select aria-label={`${end} 端口侧边`} value={editor.edges[selectedEdge.id]?.routing?.[end]?.side??(end==='source'?'right':'left')} onChange={event=>setRouting(selectedEdge.id,{...editor.edges[selectedEdge.id]?.routing,version:1,mode:'manual',[end]:{offset:editor.edges[selectedEdge.id]?.routing?.[end]?.offset??.5,side:event.target.value}} as WorkflowRouting)}>{['left','right','top','bottom'].map(side=><option key={side} value={side}>{({left:'左',right:'右',top:'上',bottom:'下'})[side]}</option>)}</select></label><label>端口位置<input aria-label={`${end} 端口位置`} type="range" min={.1} max={.9} step={.05} value={editor.edges[selectedEdge.id]?.routing?.[end]?.offset??.5} onChange={event=>setRouting(selectedEdge.id,{...editor.edges[selectedEdge.id]?.routing,version:1,mode:'manual',[end]:{side:editor.edges[selectedEdge.id]?.routing?.[end]?.side??(end==='source'?'right':'left'),offset:Number(event.target.value)}},`port-${selectedEdge.id}-${end}`)}/></label></fieldset>)}<button onClick={()=>setRouting(selectedEdge.id,{version:1,mode:'auto'})}>恢复自动走线</button><button onClick={()=>removeEdge(selectedEdge.id)}>删除此连线</button></> : <p>选择画布中的节点或连线查看配置。</p>}<details><summary>连接列表</summary>{definition.transitions.map(edge=><button className="wf-connection-row" key={edge.id} onClick={()=>{setEdgeSelection(edge.id);setSelection(null);}}>{definition.nodes.find(node=>node.id===edge.from)?.label??edge.from} → {definition.nodes.find(node=>node.id===edge.to)?.label??edge.to} {transitionLabel(edge.outlet)}</button>)}</details></div>
    <div hidden={tab !== "state"}>{preview.session?<section><h3>本次预览的共享数据</h3><StructuredValue value={preview.session.states[previewScope(safePath)]??{}}/></section>:run?.finalState&&safePath.length===0?<section><h3>所选运行的最终共享数据</h3><StructuredValue value={run.finalState}/></section>:null}<fieldset className="wf-node-form" disabled={readOnly}><StateFields definition={displayedDefinition} onChange={controller.editDefinition} readOnly={readOnly}/><h2 data-config-field="工作流配置" tabIndex={-1}>高级状态配置</h2><p>字段与初始值用于流程配置，运行值来自实际执行记录。</p><label>工作流说明<textarea aria-label="工作流说明" value={definition.description} onChange={event=>controller.editDefinition(current=>({...current,description:event.target.value}),"description")}/></label><details><summary>高级结构与运行限制</summary>{(["inputSchema","outputSchema"] as const).map(key=><JsonField<JsonSchema> key={key} label={key==="inputSchema"?"输入 Schema":"输出 Schema"} value={definition[key]} onChange={value=>controller.editDefinition(current=>({...current,[key]:value}))}/>)}<JsonField label="Graph State" value={definition.state} validate={validateForm(stateSchemaV2)} onChange={state=>controller.editDefinition(current=>({...current,state}))}/><JsonField<Record<string,Binding>> label="最终输出绑定" value={definition.outputBindings} validate={validateForm(bindingMapSchema)} onChange={outputBindings=>controller.editDefinition(current=>({...current,outputBindings}))}/><JsonField label="运行限制" value={definition.policy} validate={validateForm(executionPolicySchema)} onChange={policy=>controller.editDefinition(current=>({...current,policy}))}/></details>{environment?.connectors.map(connector=><button key={connector.ref} onClick={()=>void controller.discover(connector.ref)}>发现 {connector.name} 工具</button>)}</fieldset></div>
    <div hidden={tab !== "run"}><section aria-label="启动输入摘要"><h3>启动输入</h3><InputReuseOmissions fields={inputReuseOmissions} onClose={()=>setInputReuseOmissions([])}/><p className="wf-field-note">启动输入在运行时填写，不随工作流定义保存。点击顶部“运行”打开运行准备对话框；继续已有会话请使用下方“下一轮输入”。</p><button type="button" onClick={()=>setRunDialogOpen(true)} disabled={readOnly || !environment}>查看/编辑启动输入</button><details><summary>查看当前启动输入</summary><pre>{JSON.stringify(controller.input,null,2)}</pre></details></section><ModelStreamFeed definition={controller.runSnapshot?.definition??rootController.definition} events={controller.events} steps={controller.steps}/><SessionHistoryWorkspace definition={rootController.definition} environmentRef={controller.environmentRef} run={controller.run} input={controller.input} onObserve={record=>{preview.close();controller.selectRun(record);setViewingRun(true);}}/><SubgraphInvocationHistory definition={rootController.definition} steps={rootController.steps}/><ThreadRecoveryPanel run={run} thread={preview.session?null:controller.currentThread} historyExpired={controller.historyExpired} error={preview.session?"":controller.threadsError} onLocate={locateResponse} onRecover={()=>{if(controller.currentThread)void controller.resumeThread(controller.currentThread,{});}}/>{executionReadinessDiagnostics.length?<details><summary>执行引擎的能力检查结果（{executionReadinessDiagnostics.length}）</summary><p>这些结果来自当前执行引擎，不表示前端演示不能使用。</p>{executionReadinessDiagnostics.map((item,index)=><p key={index}>{item.message}</p>)}</details>:null}{preview.session?<FrontendPreviewPanel session={preview.session} historical={preview.historical} onRespond={preview.respond} onCancel={preview.cancel} onFork={preview.fork} onClose={()=>{preview.close();setGraphPath([]);clearSelection();}} onLocate={step=>{navigateGraph(step.path);openExecution(step.nodeId,step.stepId);}}/>:null}<div hidden={Boolean(preview.session)}>{displayedFutureFeatures.length?<p className="wf-capability-note">已支持配置与保存：{displayedFutureFeatures.join("、")}。真实执行待底层接入。</p>:null}{controller.submitUnknown?<><p>确认会沿用原请求的修订、输入、环境和实训上下文；当前页面的新输入或实训不会替换原提交。</p><button disabled={controller.busy} onClick={()=>void controller.confirmSubmission()}>确认原提交状态</button></>:null}{run?<><div className="wf-run-summary" role="status"><div className="wf-run-status-line"><strong>{observationStatus}</strong><span>{controller.runOrigin === "history" ? "所选历史记录" : "本次执行"} · 流程版本 {run.revision}</span></div>{run.continuationRunId?<button onClick={()=>void controller.operation(async()=>controller.selectRun(await workflowApiV2.run(run.continuationRunId!)))}>查看继续后的运行</button>:null}<RunEffectNotice run={run} events={controller.events} complete={controller.observationComplete}/>{run.inputReuse?<RunInputSnapshot run={run} currentRevision={definition.revision}/>:null}{failureTarget ? <button onClick={locateFailure}>{failureTarget.beforeExecution ? "定位输入准备错误" : "定位失败步骤"}：{failureTarget.label} · 执行序号 {failureTarget.invocation}</button> : null}{copyFeedback?.runId===run.runId?<p role={copyFeedback.failed?"alert":"status"} className="wf-copy-feedback">{copyFeedback.message}</p>:null}</div>{run.status==="failed" || run.status==="cancelled" ? <RunToolActivity run={run} events={controller.events} complete={controller.observationComplete} revealResults/> : null}{run.error&&run.status==="cancelled"?<section role="status"><strong>运行已由用户取消</strong><p>后续节点已停止调度；未正常完成的步骤会标记为已取消。</p><details><summary>取消详情</summary>{run.error.code} · {run.error.message}</details></section>:null}{run.status==="failed"&&run.error?.code==="WAIT_EXPIRED"?<section className="wf-wait-expired" role="status"><strong>等待已到期</strong><p>超过回应截止时间仍未收到回应，本次运行已结束，不能继续此等待。可返回流程编辑后重新运行；此前完成的步骤不会因到期撤回。</p><details><summary>到期技术详情</summary><code>WAIT_EXPIRED</code></details></section>:null}{run.error&&run.status!=="cancelled"&&run.error.code!=="WAIT_EXPIRED"?<div role="alert" className="wf-v2-run-error"><strong>运行失败：{errorCategoryLabel[run.error.category??""]??"请检查执行步骤"}</strong><p>{run.error.externalStatus?`外部工具返回 HTTP ${run.error.externalStatus}。`:"已停止后续执行。"}</p>{failureTarget ? <><p>失败位置：{failureTarget.label} · 执行序号 {failureTarget.invocation}</p>{failureTarget.beforeExecution ? <p>节点输入准备失败，尚未执行该节点。请检查数据来源、读取范围和字段类型。</p> : null}<button onClick={locateFailure}>定位执行错误（只读快照）</button></> : <p>运行准备或系统阶段失败，当前记录没有节点位置，请查看技术详情与环境配置。</p>}{run.error.effect&&run.error.effect!=='none'?<p>外部操作可能已发生，请核对后再运行。</p>:null}<details><summary>错误技术详情</summary>{run.error.code} · {run.error.externalStatus}<p>{run.error.message}</p></details></div>:null}<h3>{run.status==="failed"&&run.error?.code==="WAIT_EXPIRED"?"到期时 State":run.status==="success"?"最终输出":run.status==="waiting"?"暂停时 State":run.status==="continued"?"移交时 State":run.status==="failed"||run.status==="cancelled"?"停止时 State":"当前 State"}</h3>{run.status==="success"&&!readableAnswer(run.output)&&Object.keys((run.output&&typeof run.output==="object"&&!Array.isArray(run.output)?run.output:{})??{}).length===0&&controller.steps.some(step=>readableAnswer(step.output))?<section><p className="wf-field-note">图尚未配置最终输出。以下是模型步骤回复，可在图设置中配置返回字段。</p><div className="wf-readable-output">{readableAnswer([...controller.steps].reverse().find(step=>readableAnswer(step.output))?.output)}</div><button onClick={()=>showTab("graph")}>配置图输出</button></section>:null}<div className="wf-readable-output"><ReadableRunOutput value={run.output??run.finalState} text={outputText(run.output??run.finalState)}/></div><button onClick={()=>void copyReadableResult()}>复制可读结果</button><details><summary>{run.status==="success"?"原始输出 JSON":"State JSON"}</summary><pre>{JSON.stringify(run.output??run.finalState??null,null,2)}</pre></details>{run.outputRef?<button onClick={()=>void controller.operation(async()=>{const result=await workflowApiV2.artifact(run.outputRef!);setArtifactContent({runId:run.runId,value:result.content??result.url??null});})}>读取输出产物</button>:null}{artifactContent?.runId===run.runId?<pre>{JSON.stringify(artifactContent.value,null,2)}</pre>:null}<button title={run.revision!==definition.revision?`原运行修订 ${run.revision}；将创建当前修订 ${definition.revision} 的新运行`:undefined} disabled={!run.inputReuse?.available} onClick={()=>{let input:JsonValue={};for(const field of run.inputReuse?.fields??[])input=putValue(input,field.pointer,field.value);replaceRunInput(input);setInputReuseOmissions(run.inputReuse?.removedFields??[]);setRunDialogOpen(true);if(!run.inputReuse?.complete)controller.setError('已复用安全字段；敏感或缺失字段需要重新填写。');}}>{run.revision!==definition.revision?"用当前修订和相同输入重跑":run.inputReuse?.complete?"使用相同输入重新运行":"补齐缺失输入后重新运行"}</button>{!readOnly&&run.revision!==definition.revision&&run.inputReuse?.complete?<button onClick={()=>void replayOriginal()}>使用原修订重跑</button>:null}<details className="wf-run-identity"><summary>执行环境、评价与运行身份</summary><small>环境：{run.environmentRef}。运行成功表示执行完成；业务评价{run.verification==='unverified'?'尚未验证':run.verification}。Run {run.runId}</small></details><button onClick={()=>{setSnapshotFocus(null);void controller.operation(async()=>setSnapshot(await workflowApiV2.get(run.workflowId,run.revision)));}}>查看执行修订的定义与布局</button>{run.status!=="failed" && run.status!=="cancelled" ? <RunToolActivity run={run} events={controller.events} complete={controller.observationComplete}/> : null}<section aria-label="执行策略摘要">{visibleSteps.filter(step=>executionPolicySummary(controller.events,step.stepId)).map(step=><p key={step.stepId}>{definition.nodes.find(node=>node.id===step.nodeId)?.label??step.nodeId}：{executionPolicySummary(controller.events,step.stepId)}</p>)}</section><h3>执行步骤</h3>{visibleSteps.map(step=><details key={`${step.stepId}-${step.attempt}`}><summary>{controller.runSnapshot?.definition.nodes.find(node=>node.id===step.nodeId)?.label??step.nodeId} · 执行序号 {step.invocation} · {statusLabel[step.status]??(step.status==='completed'?'完成':step.status)}</summary><ToolStepOutput step={step}/><details><summary>步骤技术详情</summary><pre>{JSON.stringify(step,null,2)}</pre></details></details>)}<details><summary>事件轨迹（{controller.events.length}）</summary><ol className="wf-v2-events">{controller.events.map(event=><li key={event.eventId}>#{event.seq} {event.type} {event.nodeId}<details><summary>查看数据</summary><pre>{JSON.stringify(event.payload,null,2)}</pre></details></li>)}</ol></details></>:controller.historyExpired?(controller.currentThread?null:<p>所选运行的早期日志已清理；此执行已继续，请从运行历史选择当前执行。</p>):<p>{controller.submitUnknown ? "原请求可能已被接受，当前状态待确认；请确认原提交，不要重复运行。" : controller.runPreparationStage === "preflight" ? "正在校验本次提交，运行尚未创建。" : controller.runPreparationStage === "save" ? "正在保存本次提交，保存成功后才会启动运行。" : controller.runPreparationStage === "submit" ? "正在提交运行，请等待结果，避免重复执行。" : controller.awaitingRunRecord ? "运行已提交，正在读取实际状态。" : controller.runPreparationFailure === "preflight" ? "上次运行未启动：预检未通过，请查看上方具体原因。输入草稿已保留。" : controller.runPreparationFailure === "save" ? "上次运行未启动：工作流未能保存，请处理上方错误后重试。编辑与输入草稿已保留。" : controller.runPreparationFailure === "submit" ? "上次运行未启动：提交已被拒绝，请处理上方提示后重试。输入草稿已保留。" : "点击顶部“运行”填写启动输入并开始执行。"}</p>}</div>
    </div>{visibleDiagnostics.length?<section className="wf-v2-diagnostics"><h3>需要修正的问题</h3>{visibleDiagnostics.map((item,index)=>{const text=diagnosticText(item,definition);return <div key={`${item.code}-${index}`}><button onClick={()=>locateDiagnostic(item)}><strong>{text.location}：{text.title}</strong><span>{text.advice}</span></button><details><summary>技术详情</summary><code>{item.code}</code><p>{item.message}</p><small>{item.pointer} · {item.requestId}</small></details></div>;})}</section>:null}</div></aside></div><section className={`wf-history-dock ${historyOpen?"open":""}`} aria-label="运行历史"><header><button aria-expanded={historyOpen} onClick={()=>setHistoryOpen(!historyOpen)}><History size={16}/>运行历史 · {controller.history.length} / 预览 {preview.history.length}<span>{historyOpen?"⌄":"⌃"}</span></button><small>{preview.session?`前端预览 · ${statusLabel[preview.session.status]??preview.session.status}`:`${observationStatus}${run||pendingThread?` · 修订 ${run?.revision??pendingThread?.revision}`:""}`}</small></header>{historyOpen?<div className="wf-history-list">{preview.history.map(record=><button key={record.id} onClick={()=>{setGraphPath([]);setViewingRun(false);preview.select(record);showTab("run");}}><strong>前端预览 · 演示</strong><span>{record.status==="success"?"完成":record.status==="failed"?"失败":"已停止"} · 修订 {record.snapshot.definition.revision}</span><small>当前页面内保留</small></button>)}{controller.threads.map(thread=><button key={`thread-${thread.threadId}`} aria-pressed={controller.observedRunId===thread.currentRunId} onClick={()=>{preview.close();controller.selectThread(thread);setGraphPath([]);setViewingRun(true);clearSelection();}}><strong>{thread.status==='waiting'?'等待节点回应':'执行失败 · 查看检查点'}</strong><span>修订 {thread.revision} · {thread.interrupts[0]?.title??thread.lastError?.code}</span><small>切换至此执行</small></button>)}{controller.history.length ? controller.history.map(record=><button key={record.runId} disabled={Boolean(preview.session&&!preview.historical&&["running","waiting"].includes(preview.session.status))} aria-pressed={executionView&&run?.runId===record.runId} onClick={()=>{preview.close();controller.selectRun(record);setGraphPath([]);setViewingRun(true);setSelection(null);setEdgeSelection(null);showTab("run");}}><strong>{executionObservation(record,null).label}</strong><span>修订 {record.revision} · {new Date(record.createdAt).toLocaleString()}</span><small>{record.operation==="branch"?"历史分支":record.operation==="next"?"同会话下一轮":record.launchContext?`课程实训 · ${record.launchContext.assignmentId}`:"新会话"} · 会话 {record.threadId?.slice(0,8)}</small></button>):<p>还没有运行记录。完成运行后可在这里查看结果与快照。</p>}</div>:null}</section></ReactFlowProvider>
    {activeDialog?<WorkflowDialog title={activeDialog==='versions'?'版本与恢复':activeDialog==='rerun'?'新建一次运行':activeDialog==='run'?'保存并运行':activeDialog==='leave'?'离开前保存':activeDialog==='template'?'选择起步流程':activeDialog==='conflict'?'保存冲突':'归档工作流'} error={controller.error} onClose={closeDialog}>{activeDialog==='rerun'?<><p>将使用当前工作流和当前输入创建新的运行，重新执行全部节点。历史输入不会自动带入，也不会续跑所选记录。</p>{run ? <p role="alert">{externalEffectNotice(run,controller.events,controller.observationComplete) || "请确认当前输入；这是一次独立的新运行。"}</p> : null}{controller.dirty ? <p>当前修改会先保存；保存失败不会启动运行。</p> : null}<button disabled={controller.busy} onClick={()=>{setDialog(null);void controller.startRun(true);}}>{controller.dirty ? "保存当前修改并新建运行" : "确认新建运行"}</button></>:activeDialog==='run'?<><p>当前有未保存修改。保存成功后运行本次输入；取消会保留草稿。</p><button onClick={()=>{setDialog(null);void controller.startRun(true);}}>保存并运行当前修改</button></>:activeDialog==='leave'?<><p>工作流修改尚未完成。外部调用数据仅在本页，离开会丢弃，保存工作流也不包含外部调用数据。</p><button onClick={()=>void controller.saveDocument().then(result=>{if(result)finishLeave();})}>保存工作流并离开</button><button onClick={()=>{controller.discard();finishLeave();}}>放弃修改并离开</button><button onClick={closeDialog}>继续编辑</button></>:activeDialog==='template'?<><p>将替换当前节点、连线和状态配置；可撤销。真实问答在节点气泡中提问，并调用已配置模型；其余示例使用演示数据。并行、子图和 Send 仍为前端演示。</p><button onClick={()=>{controller.editDocument(()=>liveQuestionExample(definition,environment?.providers[0]?.ref??"",environment?.providers[0]?.modelRefs[0]??""));setPaletteOpen(false);setSelection("model");showTab("node");setDialog(null);}}>使用真实模型问答（节点提问）</button><button onClick={()=>configureToolLoop(true)}>使用问答中断演示</button><button onClick={()=>configureToolLoop()}>使用模型与工具循环演示</button><button onClick={()=>configureExample("parallel")}>使用订单并行与子图示例</button><button onClick={()=>configureExample("batch")}>使用批量摘要与 Send 示例</button></>:activeDialog==='versions'?<><p>旧定义只读预览。恢复会创建新修订，保留所有已有运行记录。</p>{revisions.map(revision=><button key={revision.revision} onClick={()=>void controller.operation(async()=>setSnapshot(await workflowApiV2.get(definition.workflowId,revision.revision)))}>修订 {revision.revision} · {revision.name} · {new Date(revision.createdAt).toLocaleString()}</button>)}</>:activeDialog==='conflict'?<><p>服务器版本已变化，本地草稿完整保留。可查看服务器版本比较；重新加载前请确认放弃本地修改。</p><button onClick={()=>void controller.operation(async()=>setSnapshot(await workflowApiV2.get(definition.workflowId)))}>查看服务器版本</button><button onClick={()=>{if(window.confirm('重新加载将放弃本地草稿和临时输入，是否继续？'))location.reload();}}>重新加载</button></>:<><p>归档后不能再运行，已有定义和历史会保留。</p><button onClick={()=>void controller.operation(async()=>{await workflowApiV2.archive(rootController.definition.workflowId,rootController.definition.revision);onBack();})}>确认归档</button></>}<button onClick={closeDialog}>取消</button></WorkflowDialog>:null}
    {runDialogOpen && !readOnly && !activeDialog && !snapshot ? <RunPreparationDialog key={controller.inputResetVersion} draftId={runInputDraftId} schema={rootController.definition.inputSchema} value={controller.input} onChange={controller.setInput} onInvalid={controller.setInputInvalid} busy={controller.busy} dirty={controller.dirty} inputInvalid={controller.inputInvalid} warning={run && ["success","failed","cancelled","continued"].includes(run.status) ? "这是独立的新运行；外部写工具可能再次执行。" : undefined} consumers={runInputConsumers} focusErrorRequest={inputFocusRequest} focusPointer={inputFocusPointer} onCancel={()=>setRunDialogOpen(false)} onRun={()=>runNow()} onRunEmpty={()=>runNow(true)}/> : null}
    {snapshot?<WorkflowDialog title={`修订 ${snapshot.definition.revision} 只读预览`} error={controller.error} onClose={()=>setSnapshot(null)}><h2>{snapshot.definition.name} · 修订 {snapshot.definition.revision}</h2><p>当前草稿不会被此预览替换。节点 {snapshot.definition.nodes.length} / 连线 {snapshot.definition.transitions.length}</p><SnapshotCanvas key={`${snapshot.definition.workflowId}:${snapshot.definition.revision}`} snapshot={snapshot} focusedNode={snapshotFocus} focusedPath={snapshotFocus?run?.error?.graphPath:undefined}/>{failureTarget && snapshotFocus === failureTarget.nodeId && snapshot.definition.workflowId === run?.workflowId && snapshot.definition.revision === run.revision ? <section aria-label="执行错误位置"><h3>{failureTarget.label} · 执行序号 {failureTarget.invocation}</h3><p>{failureTarget.beforeExecution ? "此节点在读取或校验输入时停止，尚未执行；没有创建该节点的执行步骤。" : "此处展示失败步骤对应的执行修订。"}</p>{failureTarget.pointer ? <p>需检查的配置：{failureTarget.pointer.split("/").slice(3).map(token => token.replace(/~1/g,"/").replace(/~0/g,"~")).map(token => token === "inputs" ? "输入绑定" : token === "arguments" ? "工具参数" : token).join(" / ")}</p> : null}{run.revision === definition.revision && !controller.definitionDirty ? <button onClick={editFailedInput}>编辑当前节点输入</button> : <p>当前工作流已修改，请返回编辑后核对；此快照保持只读。</p>}</section> : null}<details><summary>定义差异与结构详情</summary><p>当前名称：{definition.name}；预览名称：{snapshot.definition.name}</p><p>当前节点：{definition.nodes.map(node=>node.label).join('、')}</p><p>预览节点：{snapshot.definition.nodes.map(node=>node.label).join('、')}</p><pre>{JSON.stringify(snapshot.definition,null,2)}</pre></details>{dialog==='versions'?<button onClick={()=>void restore()}>恢复此版本为新修订</button>:null}<button onClick={()=>{setSnapshot(null);setDialog(null);}}>返回当前工作流</button></WorkflowDialog>:null}
  </main></JsonDraftProvider>;
}
