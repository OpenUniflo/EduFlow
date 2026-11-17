import { useEffect, useState } from "react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { ResourceReferenceRow } from "../domain/v2/types";
import { ResourceReferences } from "./ResourceReferences";

/** A destructive resource action always re-reads references before enabling confirmation. */
export type ResourceDeleteTarget = {
  /** Managed connections and registered functions are deleted by different server transactions. */
  kind: "connection" | "function";
  ref: string;
  version: number;
  name: string;
  /** User-facing noun, for example 模型供应商 / API 连接 / MCP 连接 / 函数. */
  noun: string;
  versions: number;
  hasCredential?: boolean;
  /** Extra class names keep existing provider delete tests and styling stable. */
  className?: string;
  /** Existing provider cards expose data-provider-action; new sections use data-resource-delete. */
  actionAttribute?: string;
  /** Optional extra warning, for example the active-run rule for connections. */
  note?: string;
};

type Props = {
  environmentRef: string;
  target: ResourceDeleteTarget;
  onClose: () => void;
  onDeleted: (message: string) => void;
  onOpenReference?: (row: ResourceReferenceRow) => void;
};

/**
 * Shared safe-delete dialog for managed resources. The browser scan is never
 * authority: it only gives the owner a concrete way forward. The API and the
 * deleting database transaction recheck every current Workflow in one scope.
 */
export function ResourceDeleteDialog({ environmentRef, target, onClose, onDeleted, onOpenReference }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [references, setReferences] = useState<ResourceReferenceRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setReferences([]);
    setConfirmed(false);
    workflowApiV2.extensionReferences(target.ref, environmentRef, target.kind)
      .then(result => { if (active) { setReferences(result.items); setLoading(false); } })
      .catch(reason => { if (active) { setError(workflowErrorMessage(reason)); setLoading(false); } });
    return () => { active = false; };
  }, [environmentRef, target.ref, target.kind, generation]);

  async function retryScan() {
    setGeneration(current => current + 1);
  }

  async function remove() {
    if (loading || error || references.length || !confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      await workflowApiV2.extension(environmentRef, {
        action: "delete", kind: target.kind, ref: target.ref, version: target.version,
      });
      const credentials = target.kind === "connection" && target.hasCredential ? "和托管凭据" : "";
      onDeleted(`已删除${target.kind === "function" ? "函数" : ""}「${target.name}」及其全部 ${target.versions} 个版本${credentials}；稳定标识 ${target.ref} 不再可用。`);
    } catch (reason) {
      setError(workflowErrorMessage(reason));
      // A concurrent Workflow save may have added a reference after the first
      // scan. Refresh the impact list so the owner gets an actionable path.
      try {
        const result = await workflowApiV2.extensionReferences(target.ref, environmentRef, target.kind);
        setReferences(result.items);
        // A reference conflict is actionable through the refreshed list; a
        // transport failure without references keeps the server error.
        if (result.items.length) setError("");
      } catch { /* keep the server error; deletion stays disabled */ }
    } finally {
      setBusy(false);
    }
  }

  const workflowCount = new Set(references.map(row => row.workflowId)).size;
  const blocked = loading || Boolean(error) || references.length > 0 || !confirmed;
  const actionAttributes = target.actionAttribute ? { [target.actionAttribute]: "confirm-delete" } : {};
  const note = target.note ?? "仍有排队、运行中或等待回应的运行使用此资源时，删除会被拒绝；请先等待结束或取消运行。";
  return <>
    <div className="wf-resource-modal-backdrop" aria-hidden="true" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }} />
    <section
      className={`wf-resource-modal wf-resource-delete ${target.className ?? ""}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wf-resource-delete-title"
      aria-describedby="wf-resource-delete-desc"
      onKeyDown={event => { if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); } }}
    >
      <header className="wf-resource-modal-header">
        <div><h3 id="wf-resource-delete-title">删除{target.noun}</h3><p id="wf-resource-delete-desc">先核对引用；有引用的{target.noun}不会被删除，也不会破坏现有工作流。</p></div>
        <button type="button" className="wf-resource-close" aria-label="关闭删除确认" disabled={busy} onClick={onClose}>关闭</button>
      </header>
      <div className="wf-resource-modal-body">
        <dl className="wf-provider-delete-facts">
          <div><dt>显示名称</dt><dd>{target.name}</dd></div>
          <div><dt>稳定标识</dt><dd><code>{target.ref}</code></dd></div>
          <div><dt>版本</dt><dd>{target.versions} 个（删除 v{target.version} 时清理全部版本）</dd></div>
          {target.kind === "connection" ? <div><dt>凭据</dt><dd>{target.hasCredential ? "将删除托管凭据" : "无托管凭据"}</dd></div> : null}
        </dl>
        {loading ? <p role="status">正在检查工作流引用…</p> : null}
        {error ? <div className="wf-resource-conflict" role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={() => void retryScan()}>重新检查引用</button></div> : null}
        <p className="wf-field-note">{note}</p>
        {!loading && !error && references.length ? <div className="wf-resource-conflict" role="alert">
          <p><strong>不能删除：仍被引用。</strong>这个{target.noun}被 {workflowCount} 个工作流中的 {references.length} 个节点引用。请先在这些工作流中替换或移除{target.noun}，然后重新检查。</p>
          <ResourceReferences rows={references} onOpen={onOpenReference} />
        </div> : null}
        {!loading && !error && !references.length ? <div className="wf-provider-delete-clear" role="status">
          <strong>未发现当前工作流引用。</strong>
          <p>删除会移除全部 {target.versions} 个版本{target.kind === "connection" && target.hasCredential ? "及托管凭据" : ""}，且无法撤销。稳定标识 <code>{target.ref}</code> 不再可用。</p>
          <label className="wf-resource-checkbox"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />我确认删除该{target.noun}及其全部版本，并理解引用会失效。</label>
        </div> : null}
      </div>
      <footer className="wf-resource-modal-footer">
        <span>{blocked && !loading ? (references.length ? "引用检查未通过，删除按钮保持禁用。" : "请先确认删除范围。") : "服务端会在删除前再次检查引用和版本。"}</span>
        <div className="wf-resource-actions">
          <button type="button" disabled={busy} onClick={onClose}>取消</button>
          <button type="button" className="danger" {...actionAttributes} data-resource-delete="confirm" disabled={blocked || busy} onClick={() => void remove()}>{busy ? "正在删除…" : "永久删除"}</button>
        </div>
      </footer>
    </section>
  </>;
}
