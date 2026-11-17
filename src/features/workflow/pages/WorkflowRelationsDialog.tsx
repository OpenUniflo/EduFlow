import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, GitBranch, RefreshCw } from "lucide-react";
import { Pill } from "@/shared/ui";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import type { WorkflowEditorFocus, WorkflowReferenceBlock, WorkflowReferenceItem, WorkflowSummaryV2 } from "../domain/v2/types";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import { WorkflowDialog } from "../editor/v2/WorkflowDialog";
import { directCallerGroups, groupReferenceItems, indirectReferenceBlocks, referencePathLabel, referenceTargetStatus, referencedByCounts, targetDisplayName } from "./workflowRelations";

type LoadState<T> = { status: "loading" | "ready" | "error"; items: T[]; error: string };

function loadingState<T>(): LoadState<T> { return { status: "loading", items: [], error: "" }; }

/**
 * Read-only relation detail for one Works card. It loads only when opened and
 * reuses the existing owner-scoped reference APIs. Counts on the card come from
 * the library page projection, so no card sends its own request.
 */
export function WorkflowRelationsDialog({ item, onClose, onOpenWorkflow }: {
  item: WorkflowSummaryV2;
  onClose: () => void;
  onOpenWorkflow: (workflowId: string, focus?: WorkflowEditorFocus) => void;
}) {
  const [outgoing, setOutgoing] = useState<LoadState<WorkflowReferenceItem>>(loadingState);
  const [incoming, setIncoming] = useState<LoadState<WorkflowReferenceBlock>>(loadingState);
  const [outgoingRetry, setOutgoingRetry] = useState(0);
  const [incomingRetry, setIncomingRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setOutgoing(loadingState());
    void workflowApiV2.references(item.workflowId, item.revision).then(result => {
      if (active) setOutgoing({ status: "ready", items: result.items, error: "" });
    }).catch(reason => {
      if (active) setOutgoing({ status: "error", items: [], error: workflowErrorMessage(reason) });
    });
    return () => { active = false; };
  }, [item.workflowId, item.revision, outgoingRetry]);

  useEffect(() => {
    let active = true;
    setIncoming(loadingState());
    void workflowApiV2.referencedBy(item.workflowId).then(result => {
      if (active) setIncoming({ status: "ready", items: result.items, error: "" });
    }).catch(reason => {
      if (active) setIncoming({ status: "error", items: [], error: workflowErrorMessage(reason) });
    });
    return () => { active = false; };
  }, [item.workflowId, incomingRetry]);

  const outgoingGroups = groupReferenceItems(outgoing.items);
  const outgoingWorkflows = new Set(outgoing.items.map(reference => reference.target.workflowId)).size;
  const directGroups = directCallerGroups(incoming.items);
  const indirect = indirectReferenceBlocks(incoming.items);
  const counts = referencedByCounts(incoming.items);
  const busy = outgoing.status === "loading" || incoming.status === "loading";

  function open(workflowId: string, focus?: WorkflowEditorFocus) {
    onClose();
    onOpenWorkflow(workflowId, focus);
  }

  return <WorkflowDialog title={`引用关系 · ${item.name}`} className="wf-relations-dialog" onClose={onClose} showClose={false}>
    <div className="wf-relations-body">
      <p className="wf-relations-intro">
        <GitBranch size={15} aria-hidden="true" />
        <span>当前版本 {item.revision} 的关系。按不同工作流计数；同一工作流的多个调用节点不重复计数。</span>
      </p>

      <section className="wf-relations-section" aria-labelledby="wf-relations-outgoing">
        <header>
          <div>
            <h2 id="wf-relations-outgoing">此作品引用</h2>
            <p>{outgoing.status === "ready" ? `${outgoingWorkflows} 个工作流 · ${outgoing.items.length} 个调用处` : "正在读取固定版本引用"}</p>
          </div>
          <Pill tone="brand">{outgoing.status === "ready" ? `${outgoingWorkflows} 个工作流` : "…"}</Pill>
        </header>
        <p className="wf-relations-note">调用方固定具体版本；目标保存新版本不会自动改变引用。升级前请在调用方工作流中检查接口变化和现有映射。</p>
        {outgoing.status === "loading" ? <p className="wf-relations-state" role="status">正在读取引用关系…</p> : null}
        {outgoing.status === "error" ? <div className="wf-relations-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /><p>{outgoing.error}</p><button type="button" onClick={() => setOutgoingRetry(value => value + 1)}><RefreshCw size={13} aria-hidden="true" />重试</button></div> : null}
        {outgoing.status === "ready" && !outgoingGroups.length ? <p className="wf-relations-state">当前版本没有引用其他工作流。</p> : null}
        {outgoingGroups.length ? <ul className="wf-relations-list">
          {outgoingGroups.map(group => {
            const target = group.items[0].target;
            const status = referenceTargetStatus(target);
            return <li key={`${target.workflowId}:${target.revision}`} className="wf-relations-target">
              <div className="wf-relations-target-head">
                <button type="button" className="wf-relations-link" disabled={!status.openable} onClick={() => open(target.workflowId)} title={status.openable ? `独立打开 ${targetDisplayName(target)}` : status.label}>
                  {targetDisplayName(target)}<ArrowUpRight size={13} aria-hidden="true" />
                </button>
                <Pill tone={status.tone}>{status.label}</Pill>
              </div>
              <ul className="wf-relations-nodes">
                {group.items.map(reference => <li key={`${reference.nodeId}:${reference.graphPath.join("/")}`}>
                  <span className="wf-relations-node-label">{reference.nodeLabel}</span>
                  <span className="wf-relations-path">{referencePathLabel(reference.graphPath)}</span>
                  <span className="wf-relations-meta">运行环境 {reference.target.environmentRef}</span>
                </li>)}
              </ul>
            </li>;
          })}
        </ul> : null}
      </section>

      <section className="wf-relations-section" aria-labelledby="wf-relations-incoming">
        <header>
          <div>
            <h2 id="wf-relations-incoming">引用此作品</h2>
            <p>{incoming.status === "ready" ? `${counts.directWorkflows} 个工作流直接引用 · ${counts.directCallSites} 个调用处${counts.indirectRoots ? ` · 另有 ${counts.indirectRoots} 个作品存在间接依赖` : ""}` : "正在读取当前引用与间接依赖"}</p>
          </div>
          <Pill tone="acquired">{incoming.status === "ready" ? `${counts.directWorkflows} 个工作流` : "…"}</Pill>
        </header>
        <p className="wf-relations-note">这里分开列出当前版本的直接引用和经其他工作流到达的间接依赖；间接关系不计入“被引用工作流”数。</p>
        {incoming.status === "loading" ? <p className="wf-relations-state" role="status">正在读取引用关系…</p> : null}
        {incoming.status === "error" ? <div className="wf-relations-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /><p>{incoming.error}</p><button type="button" onClick={() => setIncomingRetry(value => value + 1)}><RefreshCw size={13} aria-hidden="true" />重试</button></div> : null}
        {incoming.status === "ready" && !directGroups.length ? <p className="wf-relations-state">没有被当前版本直接引用。</p> : null}
        {directGroups.length ? <ul className="wf-relations-list">
          {directGroups.map(group => <li key={`${group.sourceWorkflowId}:${group.sourceRevision}`} className="wf-relations-target">
            <div className="wf-relations-target-head">
              <button type="button" className="wf-relations-link" onClick={() => open(group.sourceWorkflowId, group.items[0] ? { nodeId: group.items[0].nodeId, graphPath: group.items[0].graphPath } : undefined)}>
                {group.sourceName}<ArrowUpRight size={13} aria-hidden="true" />
              </button>
              <Pill tone="ok">当前版本 {group.sourceRevision}</Pill>
            </div>
            <ul className="wf-relations-nodes">
              {group.items.map(block => <li key={`${block.nodeId}:${block.graphPath.join("/")}:${block.targetRevision}`}>
                <button type="button" className="wf-relations-node-link" onClick={() => open(group.sourceWorkflowId, { nodeId: block.nodeId, graphPath: block.graphPath })}>
                  <span className="wf-relations-node-label">{block.nodeLabel ?? block.nodeId}</span>
                  <span className="wf-relations-path">{referencePathLabel(block.graphPath)}</span>
                  <span className="wf-relations-meta">固定此作品版本 {block.targetRevision}</span>
                </button>
              </li>)}
            </ul>
          </li>)}
        </ul> : null}

        {indirect.length ? <div className="wf-relations-indirect">
          <h3>经其他工作流的间接依赖</h3>
          <p>这些关系经过一个或多个中间工作流到达此作品，不是当前版本的直接调用；每条记录展示固定版本与实际调用路径。</p>
          <ul className="wf-relations-list">
            {indirect.map(block => <li key={`${block.rootWorkflowId}:${block.rootRevision}:${block.sourceWorkflowId}:${block.sourceRevision}:${block.nodeId}:${block.targetRevision}`} className="wf-relations-target">
              <div className="wf-relations-target-head">
                <button type="button" className="wf-relations-link" onClick={() => open(block.rootWorkflowId)}>
                  {block.rootName?.trim() || "根作品不可用"}<ArrowUpRight size={13} aria-hidden="true" />
                </button>
                <Pill tone="warn">间接依赖</Pill>
              </div>
              <p className="wf-relations-chain">{block.chainNames.length ? block.chainNames.join(" → ") : block.chain.join(" → ")}</p>
              <p className="wf-relations-meta">调用节点 {block.nodeLabel ?? block.nodeId}</p>
              <p className="wf-relations-path">{referencePathLabel(block.graphPath)} · 固定此作品版本 {block.targetRevision}{block.sourceCurrent === false ? ` · 最后来源修订 ${block.sourceRevision} 已不是当前版本` : ""}</p>
              {block.sourceWorkflowId !== block.rootWorkflowId ? <button type="button" className="wf-relations-source-link" onClick={() => open(block.sourceWorkflowId)}>打开直接来源 <ArrowUpRight size={12} aria-hidden="true" /></button> : null}
            </li>)}
          </ul>
        </div> : null}
        {incoming.status === "ready" && !directGroups.length && !indirect.length ? <p className="wf-relations-state">还没有工作流引用它，也没有间接依赖。</p> : null}
        {incoming.status === "ready" && (counts.directWorkflows || counts.indirectRoots) ? <p className="wf-relations-note">这些关系会阻止删除或归档。需要先在引用方移除引用并保存。</p> : null}
      </section>
    </div>
    <div className="wf-dialog-actions"><button type="button" onClick={onClose} autoFocus>{busy ? "关闭" : "关闭"}</button></div>
  </WorkflowDialog>;
}
