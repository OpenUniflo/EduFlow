import { streamTextForStep } from "./streamingPresentation";
import { useState, type ReactNode } from "react";
import { ViewportPortal, useStore } from "@xyflow/react";
import type { EditorDocumentV2, WorkflowDefinitionV2, WorkflowEventV2, WorkflowStepV2 } from "../../domain/v2/types";
import { formatRunDuration, runStatusTone, runStepDuration, summarizeNodeRun } from "../../domain/v2/runSummary";
import { latestNodeSteps } from "./executionPresentation";
import { presentExecutionError } from "./errorPresentation";
import { RunValueList } from "./RunValueList";

type WaitingBubble = { runId: string; nodeId: string; content: ReactNode };

export function WaitingResponseBubble({ waiting, label, x, y }: {
  waiting: WaitingBubble; label: string; x: number; y: number;
}) {
  const [offsetX, offsetY, zoom] = useStore(state => state.transform);
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  const gutter = 12;
  const bottom = 56;
  const bubbleWidth = Math.min(360, Math.max(0, width - 2 * gutter));
  const anchorX = x * zoom + offsetX;
  const anchorY = y * zoom + offsetY;
  const docked = anchorY < gutter || height - bottom - anchorY < 280
    || anchorX + bubbleWidth < gutter || anchorX > width - gutter;
  const top = docked ? gutter : anchorY;
  const left = docked ? width - bubbleWidth - gutter
    : Math.min(Math.max(gutter, anchorX), width - bubbleWidth - gutter);

  return <article
    data-bubble-node={waiting.nodeId}
    data-run-id={waiting.runId}
    className="wf-execution-bubble wf-response-bubble expanded waiting nodrag nopan nowheel"
    style={{ left, top, width: bubbleWidth, maxHeight: Math.max(0, height - top - bottom) }}
  >
    <div className="wf-bubble-handle"><small>{label} · 等待回应</small></div>
    {waiting.content}
  </article>;
}

/**
 * The compact result bubble under a node. Collapsed it is one line: status dot,
 * elapsed time and one sentence. Clicking opens a small input/output card (three
 * rows each) whose “查看全部” opens the node's run-data tab.
 */
export function ExecutionBubbles({ definition, editor, steps, events, sizes, onOpen, waiting, showCompleted = true }: { definition: WorkflowDefinitionV2; editor: EditorDocumentV2; steps: WorkflowStepV2[]; events: WorkflowEventV2[]; sizes: Record<string,{width:number;height:number}>; onOpen: (nodeId: string, stepId: string) => void; waiting?:WaitingBubble;showCompleted?:boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const latest = latestNodeSteps(steps);
  return <ViewportPortal>{definition.nodes.map(node => {
    const step = latest.get(node.id);
    const point = editor.nodes[node.id];
    if (!step || !point || waiting?.nodeId === node.id || !showCompleted
      || ["core.start", "core.end"].includes(node.type) || node.type.startsWith("control.")) return null;
    const id = `${step.runId}:${node.id}`;
    const measuredWidth = sizes[node.id]?.width ?? (node.type === "core.router" ? 72 : 200);
    const nodeWidth = node.type === "core.router" ? Math.max(measuredWidth, 200) : measuredWidth;
    const top = point.y + (sizes[node.id]?.height ?? (node.type === "core.router" ? 72 : 140)) + 20;
    const isOpen = expanded === id;
    const tone = runStatusTone(step!.status);
    const duration = formatRunDuration(runStepDuration(step));
    const presentedError = step?.error ? presentExecutionError(step.error) : undefined;
    const summary = summarizeNodeRun(node, step, { errorMessage: presentedError?.title });
    const streamed = streamTextForStep(events, step.stepId);
    const left = isOpen ? point.x + measuredWidth / 2 - 170 : point.x + (measuredWidth - nodeWidth) / 2;

    return <article key={id} data-bubble-node={node.id} data-run-id={step!.runId} className={`wf-execution-bubble nodrag nopan nowheel ${isOpen ? "expanded" : "collapsed"} ${tone}`} style={{ left, top, width: isOpen ? 340 : nodeWidth }}>
      {isOpen ? <>
        <div className="wf-run-bubble-head">
          <span className={`wf-run-status ${tone}`}><i aria-hidden="true" />{summary.text}</span>
          {duration ? <span className="wf-run-bubble-duration">{duration}</span> : null}
          <span className="wf-run-data-meta-spacer" />
          <button type="button" className="wf-run-bubble-collapse" aria-label={`收起${node.label}的运行结果`} title="收起" onClick={() => setExpanded(null)}>⌃</button>
        </div>
        <div className="wf-run-bubble-section">
          <h4>输入</h4>
          <RunValueList value={step!.input} scalarName="输入" layout="stacked" limit={3} emptyText="此步骤没有输入记录。"/>
        </div>
        <div className="wf-run-bubble-section">
          <h4>输出</h4>
          <RunValueList value={step!.output} scalarName="输出" layout="stacked" limit={3} emptyText={streamed ? streamed : "此步骤没有输出记录。"}/>
        </div>
        {summary.tone === "failed" && presentedError ? <p className="wf-run-bubble-failure">{presentedError.message}</p> : null}
        <footer className="wf-run-bubble-footer">
          <button type="button" onClick={() => onOpen(node.id, step!.stepId)}>查看全部</button>
        </footer>
      </> : <button type="button" className={`wf-run-bubble-line ${tone}`} aria-label={`展开${node.label}的运行结果`} aria-expanded={false} onClick={() => setExpanded(id)}>
        <span className="wf-run-dot" aria-hidden="true" />
        {duration ? <span className="wf-run-bubble-duration">{duration}</span> : null}
        <span className="wf-run-bubble-text" title={summary.text}>{summary.text}</span>
        <span className="wf-run-bubble-chevron" aria-hidden="true">⌄</span>
      </button>}
    </article>;
  })}</ViewportPortal>;
}
