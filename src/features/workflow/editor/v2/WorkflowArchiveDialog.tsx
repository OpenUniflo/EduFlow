import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiRequestError } from "@/shared/api/apiClient";
import { workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../../repository/v2/WorkflowApiV2";
import type { WorkflowDeleteImpact, WorkflowEditorFocus } from "../../domain/v2/types";
import { WorkflowDependencyList } from "./WorkflowDependencyList";
import { WorkflowDialog } from "./WorkflowDialog";

/**
 * Archive confirmation with the same current-closure protection as delete.
 * The database still rechecks inside the archive transaction; a stale preview
 * refreshes its dependency rows instead of showing only a generic error.
 */
export function WorkflowArchiveDialog({ workflowId, workflowName, revision, onClose, onArchived, onOpenWorkflow }: {
  workflowId: string;
  workflowName: string;
  revision: number;
  onClose: () => void;
  onArchived: () => void;
  onOpenWorkflow: (workflowId: string, focus?: WorkflowEditorFocus) => void;
}) {
  const [impact, setImpact] = useState<WorkflowDeleteImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [staleNotice, setStaleNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setImpact(null);
    void workflowApiV2.deleteImpact(workflowId).then(value => {
      if (active) { setImpact(value); setError(""); }
    }).catch(reason => {
      if (active) setError(workflowErrorMessage(reason));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workflowId, retry]);

  async function submit() {
    if (!impact || busy || impact.referenceCount || impact.activeRuns) return;
    setBusy(true); setError("");
    try {
      await workflowApiV2.archive(workflowId, impact.revision);
      onArchived();
    } catch (reason) {
      if (reason instanceof ApiRequestError && reason.code === "WORKFLOW_REFERENCED") {
        setError("");
        setStaleNotice("归档被服务器阻止：预览之后新增了固定版本引用。引用关系已刷新，请先打开引用方移除引用并保存，再确认归档。");
        setLoading(true); setImpact(null); setRetry(value => value + 1);
      } else setError(workflowErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return <WorkflowDialog title="归档工作流" className="wf-library-dialog wf-action-dialog wf-archive-dialog" error={error} onClose={() => { if (!busy) onClose(); }}>
    <p>归档“{workflowName}”后不能再启动新的运行；已有定义、运行历史与快照会保留。当前固定版本引用仍会阻止归档。</p>
    {loading ? <p role="status">正在检查归档范围与当前引用…</p> : impact ? <>
      <p>当前修订 {Math.max(impact.revision, revision)} · {impact.revisions} 个版本 · {impact.runs} 条运行记录。</p>
      {impact.referenceCount ? <div className="wf-delete-reference-block">
        {staleNotice ? <p role="alert" className="wf-delete-stale">{staleNotice}</p> : null}
        <p>此作品仍被当前可到达的固定版本引用，不能归档。当前由 {impact.referencedBy ?? 0} 个根作品经固定版本引用。</p>
        <WorkflowDependencyList blocks={impact.blockingReferences ?? []} totalCount={impact.referenceCount} onOpenWorkflow={onOpenWorkflow}/>
        <p>请打开引用方作品，移除对应调用节点或更换目标，保存后再归档。历史修订中的旧引用不会永久阻止归档。</p>
        <button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)}><RefreshCw size={13} aria-hidden="true"/>刷新引用关系</button>
      </div> : <p className="wf-reference-ready" role="status">当前没有可达的固定版本引用阻止归档。</p>}
      {impact.activeRuns ? <p role="alert"><AlertTriangle size={14} aria-hidden="true"/> 当前有 {impact.activeRuns} 条运行尚未结束，请结束后再归档。</p> : null}
    </> : !error ? <p role="status">尚未读取归档范围。</p> : <button type="button" onClick={() => setRetry(value => value + 1)}>重新检查</button>}
    <footer className="wf-dialog-actions">
      <button type="button" disabled={busy} onClick={onClose}>取消</button>
      <button type="button" className="danger" disabled={busy || loading || !impact || Boolean(impact.referenceCount) || Boolean(impact.activeRuns)} onClick={() => void submit()}>{busy ? "正在归档…" : "确认归档"}</button>
    </footer>
  </WorkflowDialog>;
}
