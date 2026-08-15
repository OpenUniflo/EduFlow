import { useEffect, useState, type ReactNode } from "react";
import type { WorkflowController } from "../application/useWorkflowController";
import type { BottomTab, ConfigTarget, Selection, StateTab } from "../editor/types";
import { Canvas } from "../editor/WorkflowCanvas";
import { CodeModal, Topbar } from "../editor/Topbar";
import { ConfigPopover } from "../editor/ConfigPopover";
import { Inspector, RunHistoryDetail } from "../editor/Inspector";
import { RunPanel } from "../runtime/RunPanel";

export function WorkflowEditorPage({
  controller,
  navigation,
  onBack,
  onWorkflowGenerated,
  showAcceptance
}: {
  controller: WorkflowController;
  navigation: ReactNode;
  onBack: () => void;
  onWorkflowGenerated: (templateId: string) => void;
  showAcceptance: boolean;
}) {
  const [selection, setSelection] = useState<Selection>({ type: "state" });
  const [configTarget, setConfigTarget] = useState<ConfigTarget | null>(null);
  const [stateTab, setStateTab] = useState<StateTab>("Schema");
  const [bottomOpen, setBottomOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomTab>("运行结果");
  const [layoutPulse, setLayoutPulse] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [draggingPaletteNode, setDraggingPaletteNode] = useState<Parameters<typeof Canvas>[0]["draggingPaletteNode"]>(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [selectedRunHistoryId, setSelectedRunHistoryId] = useState<string | null>(null);
  const { activeTemplate } = controller;
  const selectedRunHistory = controller.activeRunHistory.find((item) => item.id === selectedRunHistoryId) ?? null;
  const configNode = configTarget?.type === "node" ? activeTemplate.nodes.find((item) => item.id === configTarget.id) : undefined;
  const configEdge = configTarget?.type === "edge" ? activeTemplate.edges.find((item) => item.id === configTarget.id) : undefined;

  useEffect(() => {
    if (!draggingPaletteNode) return;
    const clear = () => window.setTimeout(() => setDraggingPaletteNode(null), 0);
    window.addEventListener("mouseup", clear);
    return () => window.removeEventListener("mouseup", clear);
  }, [draggingPaletteNode]);

  function runWithSavedSchema(action: () => boolean) {
    if (action()) {
      prepareRuntimePanel();
      return;
    }
    setSelection({ type: "state" });
    setStateTab("Schema");
    setRightCollapsed(false);
  }

  function prepareRuntimePanel() {
    setBottomOpen(true);
    setActiveTab("执行轨迹");
    setStateTab("Schema");
    setRightCollapsed(false);
  }

  function triggerLayout() {
    setLayoutPulse(true);
    window.setTimeout(() => setLayoutPulse(false), 720);
  }

  return (
    <main className="app-shell atlas-canvas-shell">
      <div className="workspace-glow" aria-hidden="true" />
      {navigation}
      <Canvas
        template={activeTemplate}
        workflowDescription={controller.workflowDescription}
        activeRunItem={controller.activeRunItem}
        selection={selection}
        configTarget={configTarget}
        schemaSaved={controller.schemaSaved}
        layoutPulse={layoutPulse}
        nodePositions={controller.nodePositions}
        onNodePositions={controller.setNodePositions}
        onSelect={setSelection}
        onOpenConfig={setConfigTarget}
        onCloseConfig={() => setConfigTarget(null)}
        onWorkflowDescription={controller.setWorkflowDescription}
        onGenerateWorkflow={(description) => { const templateId = controller.generateWorkflowFromDescription(description); onWorkflowGenerated(templateId); setSelection({ type: "workflow" }); setConfigTarget(null); setSelectedRunHistoryId(null); setBottomOpen(false); triggerLayout(); }}
        onCreateNode={(payload) => { const node = controller.createCanvasNode(payload); setDraggingPaletteNode(null); setSelection({ type: "node", id: node.id }); setConfigTarget(null); }}
        onCreateEdge={(connection) => { const edge = controller.createCanvasEdge(connection); if (edge) setSelection({ type: "edge", id: edge.id }); setConfigTarget(null); }}
        onReconnectEdge={(edgeId, connection) => { controller.reconnectCanvasEdge(edgeId, connection); setSelection({ type: "edge", id: edgeId }); }}
        onQuickAddNode={(sourceId, side, payload) => { const node = controller.quickAddCanvasNode(sourceId, side, payload); if (node) { setSelection({ type: "node", id: node.id }); setConfigTarget({ type: "node", id: node.id }); } }}
        onUpdateNode={controller.updateCanvasNode}
        draggingPaletteNode={draggingPaletteNode}
        onFinishNodeDrag={() => setDraggingPaletteNode(null)}
        onDeleteNode={(nodeId) => { controller.deleteCanvasNode(nodeId); setSelection({ type: "workflow" }); setConfigTarget(null); }}
        onDeleteEdge={(edgeId) => { controller.deleteCanvasEdge(edgeId); setSelection({ type: "workflow" }); setConfigTarget(null); }}
      />
      <Topbar
        template={activeTemplate}
        codeExporter={controller.codeExporter}
        workflowName={activeTemplate.name}
        schemaSaved={controller.schemaSaved}
        isRunning={controller.isRunning}
        onBack={onBack}
        onRenameWorkflow={controller.renameWorkflow}
        onRun={() => runWithSavedSchema(controller.runFlow)}
        onStep={() => runWithSavedSchema(controller.stepFlow)}
        onShowCode={() => setCodeModalOpen(true)}
        nodePositions={controller.nodePositions}
        environments={controller.environments}
        activeEnvironmentId={controller.activeEnvironmentId}
        onSelectEnvironment={controller.setActiveEnvironmentId}
        onSaveEnvironments={controller.saveEnvironments}
      />
      <Inspector
        collapsed={rightCollapsed}
        onCollapsed={setRightCollapsed}
        activeTab={stateTab}
        onTab={setStateTab}
        schemaSaved={controller.schemaSaved}
        template={activeTemplate}
        runIndex={controller.runIndex}
        activeRunItem={controller.activeRunItem}
        stateValues={controller.visibleStateValues}
        updatedStateFields={controller.updatedStateFields}
        runHistory={controller.activeRunHistory}
        selectedRunHistoryId={selectedRunHistoryId}
        onOpenRunHistory={(run) => setSelectedRunHistoryId(run.id)}
        onStateFieldChange={controller.updateStateField}
        onSaveSchema={() => controller.setSchemaSaved(true)}
      />
      {selectedRunHistory ? <RunHistoryDetail key={selectedRunHistory.id} run={selectedRunHistory} onClose={() => setSelectedRunHistoryId(null)} /> : null}
      <ConfigPopover
        target={configTarget}
        node={configNode}
        edge={configEdge}
        activeRunItem={controller.activeRunItem}
        onDeleteNode={(nodeId) => { controller.deleteCanvasNode(nodeId); setSelection({ type: "workflow" }); setConfigTarget(null); }}
        onDeleteEdge={(edgeId) => { controller.deleteCanvasEdge(edgeId); setSelection({ type: "workflow" }); setConfigTarget(null); }}
        onRenameNode={(nodeId, name) => { const result = controller.renameCanvasNode(nodeId, name); if (result.ok) { setSelection({ type: "node", id: result.name! }); setConfigTarget({ type: "node", id: result.name! }); } return result; }}
        onUpdateEdge={controller.updateCanvasEdge}
        onUpdateNode={controller.updateCanvasNode}
        onAddControlBranch={(nodeId) => { const edge = controller.addControlBranch(nodeId); if (edge) setSelection({ type: "edge", id: edge.id }); }}
        onUpdateControlBranch={controller.updateControlBranch}
        onDeleteControlBranch={controller.deleteControlBranch}
        template={activeTemplate}
        activeEnvironment={controller.environments.find((item) => item.id === controller.activeEnvironmentId) ?? controller.environments[0]}
        onClose={() => setConfigTarget(null)}
      />
      <CodeModal open={codeModalOpen} template={activeTemplate} codeExporter={controller.codeExporter} onClose={() => setCodeModalOpen(false)} />
      <RunPanel open={bottomOpen} activeTab={activeTab} template={activeTemplate} runIndex={controller.runIndex} onToggle={() => setBottomOpen((value) => !value)} onTab={setActiveTab} />
      {activeTemplate.inheritedAssets?.length ? <aside className="workflow-inherited-assets glass-v2"><strong>已继承往期成果</strong><div>{activeTemplate.inheritedAssets.map((item) => <span key={item}>✓ {item}</span>)}</div>{activeTemplate.reliabilityNotes?.map((item) => <small key={item}>{item}</small>)}</aside> : null}
      {showAcceptance && controller.activeRunHistory.length ? (
        <aside className="atlas-canvas-acceptance glass-v2">
          <div><strong>AI 验收 · 86 / 100 · 需要修改</strong><span>✓ Agent Team　✓ Context Isolation　✓ Parallel Execution　✓ Message Protocol</span></div>
          <div><span>⚠ Result Verification</span><span>⚠ Failure Recovery / Termination</span><span>建议巩固：WF03 · E13 · RT14</span></div>
          <p>Candidate 不能直接 Cancel Others。应先经过 Verifier → Verified Success → Atomic Settle，再取消剩余 Worker。该反馈不会自动把 Knowledge 标为 mastered。</p>
        </aside>
      ) : null}
    </main>
  );
}
