import { AlertTriangle, ArrowUpRight } from "lucide-react";
import type { WorkflowEditorFocus, WorkflowReferenceBlock } from "../../domain/v2/types";

function pathLabel(graphPath: readonly string[]): string {
  return graphPath.length ? `内嵌路径 ${graphPath.join(" / ")}` : "根图";
}

/**
 * Blocking fixed-reference chains shared by delete and archive dialogs. The
 * backend remains the authority; this only renders the preview rows and can
 * open the exact source Workflow at its call node.
 */
export function WorkflowDependencyList({ blocks, totalCount, onOpenWorkflow }: {
  blocks: readonly WorkflowReferenceBlock[];
  totalCount?: number;
  onOpenWorkflow?: (workflowId: string, focus?: WorkflowEditorFocus) => void;
}) {
  if (!blocks.length) return null;
  return <div className="wf-dependency-list" aria-label="阻止删除或归档的引用">
    <p className="wf-dependency-list-summary" role="alert"><AlertTriangle size={15} aria-hidden="true"/><span>当前仍被 {Math.max(totalCount ?? 0, blocks.length)} 条可达引用阻止。{totalCount && totalCount > blocks.length ? ` 下方显示前 ${blocks.length} 条。` : ""}</span></p>
    <ul>
      {blocks.map((block, index) => {
        const indirect = block.indirect === true || block.sourceWorkflowId !== block.rootWorkflowId || block.chain.length > 2;
        const sourceOutdated = block.sourceCurrent === false;
        const sourceName = block.sourceName?.trim() || block.sourceWorkflowId;
        const rootName = block.rootName?.trim() || block.rootWorkflowId;
        const directFocus = sourceOutdated ? undefined : { nodeId: block.nodeId, graphPath: block.graphPath };
        return <li key={`${block.rootWorkflowId}:${block.rootRevision}:${block.sourceWorkflowId}:${block.sourceRevision}:${block.nodeId}:${block.targetRevision}:${index}`} className="wf-dependency-item">
          <header>
            <strong>{sourceName}</strong>
            <span className={`wf-reference-tag ${indirect ? "neutral" : "danger"}`}>{indirect ? "间接依赖" : sourceOutdated ? "直接引用" : "当前直接引用"}</span>
            {sourceOutdated ? <span className="wf-reference-tag outdated">最后来源修订 {block.sourceRevision} 已不是当前版本</span> : null}
          </header>
          <p className="wf-dependency-chain">{block.chainNames.length ? block.chainNames.join(" → ") : block.chain.join(" → ")}</p>
          <dl className="wf-dependency-facts">
            <div><dt>引用方</dt><dd>{sourceName} · 修订 {block.sourceRevision}{sourceOutdated ? "（最后来源修订，已不是当前版本）" : block.sourceCurrent === true ? "（当前版本）" : ""}</dd></div>
            <div><dt>调用节点</dt><dd>{block.nodeLabel ?? block.nodeId} · {pathLabel(block.graphPath)}</dd></div>
            <div><dt>固定版本</dt><dd>固定本作品版本 {block.targetRevision}{block.environmentRef ? ` · 运行环境 ${block.environmentRef}` : ""}</dd></div>
            {block.rootWorkflowId !== block.sourceWorkflowId ? <div><dt>根作品</dt><dd>{rootName} · 修订 {block.rootRevision}</dd></div> : null}
          </dl>
          {onOpenWorkflow ? <div className="wf-dependency-actions">
            <button type="button" onClick={() => onOpenWorkflow(block.sourceWorkflowId, directFocus)}><ArrowUpRight size={13} aria-hidden="true"/>打开引用方作品</button>
            {block.rootWorkflowId !== block.sourceWorkflowId ? <button type="button" onClick={() => onOpenWorkflow(block.rootWorkflowId)}><ArrowUpRight size={13} aria-hidden="true"/>打开根作品</button> : null}
          </div> : null}
        </li>;
      })}
    </ul>
  </div>;
}
