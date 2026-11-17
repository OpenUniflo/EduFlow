import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { ApiRequestError } from "@/shared/api/apiClient";
import { workflowErrorMessage } from "../../repository/v2/WorkflowApiV2";
import { workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import type { WorkflowDocumentV2 } from "../../domain/v2/types";
import { LiveWorkflowEditor } from "./LiveWorkflowEditor";
import { referenceOverlayKey, type ReferenceOpenRequest, type ReferenceEditorContext } from "./referenceNavigation";

type LoadState =
  | { status: "loading" }
  | { status: "failed"; message: string; missing: boolean }
  | { status: "ready"; latest: WorkflowDocumentV2; pinned: WorkflowDocumentV2 };

/** The bar shown while the exact target revision is loading or cannot be opened. */
function ReferenceOverlayBar({ request, status, onClose }: { request: ReferenceOpenRequest; status: string; onClose: () => void }) {
  return <div className="wf-reference-overlay-bar">
    <button type="button" className="wf-reference-back" aria-label={`返回调用节点：${request.caller.nodeLabel}`} onClick={onClose}>
      <ArrowLeft size={15} />返回调用节点
    </button>
    <div className="wf-reference-breadcrumb" aria-label="调用路径">
      {request.ancestors.map(ancestor => <span key={`${ancestor.workflowId}:${ancestor.revision}`} className="wf-reference-crumb">
        <strong>{ancestor.workflowName}</strong><small>版本 {ancestor.revision}</small>
        {ancestor.viaNodeLabel ? <em>{ancestor.viaNodeLabel}</em> : null}
      </span>)}
      <span className="wf-reference-crumb current"><strong>调用目标</strong><small>固定引用版本 {request.revision}</small></span>
    </div>
    <span className="wf-reference-status" role="status">{status}</span>
  </div>;
}

/** Presentation-only overlay loader for one exact fixed-revision target. */
export function WorkflowReferenceTarget({ request, ownerId, assistantProposal, onDirtyChange, onClose }: {
  request: ReferenceOpenRequest;
  ownerId: string;
  assistantProposal?: Parameters<typeof LiveWorkflowEditor>[0]["assistantProposal"];
  onDirtyChange?: (dirty: boolean) => void;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const [viewRevision, setViewRevision] = useState<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoad({ status: "loading" });
    setViewRevision(null);
    void Promise.all([
      workflowApiV2.get(request.workflowId),
      workflowApiV2.get(request.workflowId, request.revision),
    ]).then(([latest, pinned]) => {
      if (!active) return;
      const latestRevision = latest.definition.revision;
      const pinnedDocument = pinned;
      if (pinnedDocument.definition.revision !== request.revision) {
        setLoad({ status: "failed", message: `目标没有修订 ${request.revision}。`, missing: true });
        return;
      }
      setLoad({ status: "ready", latest, pinned: pinnedDocument });
      setViewRevision(request.revision);
    }).catch(reason => {
      if (!active) return;
      const missing = reason instanceof ApiRequestError && reason.status === 404;
      setLoad({ status: "failed", message: missing ? "目标工作流或固定版本不存在、已删除，或当前账号无权访问。" : workflowErrorMessage(reason), missing });
    });
    return () => { active = false; };
  }, [request.workflowId, request.revision, retry]);

  const close = useCallback(() => onClose(), [onClose]);
  // The overlay is portaled outside the inert parent editor. Remember where
  // focus came from so closing a nested target returns it to this level, not
  // to whichever editor mounted last.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      window.setTimeout(() => { if (previous?.isConnected) previous.focus({ preventScroll: true }); }, 0);
    };
  }, []);
  useEffect(() => { overlayRef.current?.focus({ preventScroll: true }); }, [load.status, viewRevision]);

  if (load.status !== "ready") {
    const body = load.status === "loading"
      ? <div className="wf-reference-overlay-state"><Loader2 size={20} className="spin" aria-hidden="true"/><strong>正在打开固定版本 {request.revision}</strong><p>读取目标工作流修订与接口定义…</p></div>
      : <div className="wf-reference-overlay-state error"><AlertTriangle size={20} aria-hidden="true"/><strong>无法打开调用目标</strong><p role="alert">{load.message}</p><p className="wf-field-note">未回退到当前父流程或其他版本。你可以返回调用节点并检查引用配置。</p><div className="wf-reference-state-actions"><button type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14}/>重新加载</button><button type="button" onClick={close}>返回调用节点</button></div></div>;
    if (typeof document === "undefined") return null;
    const state = createPortal(<div ref={overlayRef} tabIndex={-1} className="wf-reference-overlay" role="dialog" aria-modal="true" aria-label="调用工作流目标">
      <ReferenceOverlayBar request={request} status={load.status === "loading" ? "正在加载" : "打开失败"} onClose={close} />
      {body}
    </div>, document.body);
    return state;
  }

  const latestRevision = load.latest.definition.revision;
  const requestedDocument = viewRevision === latestRevision ? load.latest : load.pinned;
  const pinnedReadOnly = requestedDocument.definition.revision < latestRevision || Boolean(requestedDocument.archived);
  const context: ReferenceEditorContext = {
    ancestors: request.ancestors,
    caller: request.caller,
    pinnedRevision: request.revision,
    latestRevision,
    pinnedReadOnly,
    archived: Boolean(requestedDocument.archived),
    ...(requestedDocument.definition.revision < latestRevision && !requestedDocument.archived ? { onEditLatest: () => setViewRevision(latestRevision) } : {}),
  };
  if (typeof document === "undefined") return null;
  const overlay = <div ref={overlayRef} tabIndex={-1} className="wf-reference-overlay" role="dialog" aria-modal="true" aria-label="调用工作流目标">
    <LiveWorkflowEditor
      key={`${request.workflowId}:${requestedDocument.definition.revision}:${referenceOverlayIdentity(request)}`}
      ownerId={ownerId}
      initial={requestedDocument}
      navigation={null}
      assistantProposal={assistantProposal}
      onBack={close}
      onOpen={(id) => { window.location.assign(`/works/${id}`); }}
      reference={context}
      initialEnvironmentRef={request.environmentRef}
      forceReadOnly={pinnedReadOnly}
      onDirtyChange={onDirtyChange}
      historyKey={referenceOverlayKey(request)}
    />
  </div>;
  return createPortal(overlay, document.body);
}

function referenceOverlayIdentity(request: ReferenceOpenRequest): string {
  return `${request.caller.workflowId}@${request.caller.revision}|${request.caller.graphPath.join("/")}|${request.caller.nodeId}|${request.environmentRef}`;
}
