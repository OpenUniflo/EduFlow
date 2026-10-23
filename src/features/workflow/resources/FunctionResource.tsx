import { useState } from "react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import { useExtensions, type FunctionVersion } from "../editor/v2/FunctionExecutionFields";
import type { ResourceReferenceRow } from "../domain/v2/types";
import { groupCatalogByRef } from "./resourceModel";
import { ResourceReferences } from "./ResourceReferences";
import type { ResourceSectionProps } from "./resourceTypes";

type Feedback = { ok: boolean; text: string };
type ReferenceView = { ref: string; loading: boolean; error: string; rows: ResourceReferenceRow[] };

function languageLabel(language: string): string {
  return language === "python" ? "Python" : language === "javascript" ? "JavaScript" : language || "未知";
}

function purposeLabel(purpose: string | undefined): string {
  return purpose === "handler" ? "错误处理函数" : "普通节点函数";
}

/** Browsing, references and disable for published functions. Function code is authored in the node panel. */
export function FunctionResource({ environmentRef, onResourcesChanged, onOpenReference }: Pick<ResourceSectionProps, "environmentRef" | "onResourcesChanged" | "onOpenReference">) {
  const { data, error, refresh } = useExtensions(environmentRef);
  const [busyKey, setBusyKey] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [references, setReferences] = useState<ReferenceView | null>(null);

  if (!environmentRef) return <p role="alert">工作流服务暂时不可用，暂时无法读取资源。</p>;
  if (!data) return <p role={error ? "alert" : "status"}>{error || "正在读取函数…"}{error ? <button type="button" onClick={refresh}>重试</button> : null}</p>;

  const groups = groupCatalogByRef(data.functions);

  async function disableFunction(entry: FunctionVersion) {
    const key = `${entry.ref}@${entry.version}`;
    setBusyKey(key); setFeedback(null);
    try {
      await workflowApiV2.extension(environmentRef, { action: "disable", kind: "function", ref: entry.ref, version: entry.version });
      setFeedback({ ok: true, text: `已停用函数「${entry.name ?? entry.ref}」v${entry.version}；仍引用它的节点会提示版本不可用。` });
      refresh(); onResourcesChanged?.();
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusyKey(""); }
  }

  async function toggleReferences(ref: string) {
    if (references?.ref === ref) { setReferences(null); return; }
    setReferences({ ref, loading: true, error: "", rows: [] });
    try {
      const result = await workflowApiV2.extensionReferences(ref, environmentRef);
      setReferences({ ref, loading: false, error: "", rows: result.items });
    } catch (reason) {
      setReferences({ ref, loading: false, error: workflowErrorMessage(reason), rows: [] });
    }
  }

  return <section className="wf-resource-section" aria-label="函数">
    <p className="wf-field-note">函数在节点中编写并发布为固定版本。资源中心负责浏览、查看引用和停用；停用不会删除历史版本代码。</p>
    <p className="wf-field-note">统一引用查询当前覆盖模型、API 与 MCP 连接；函数引用为空时请以节点中的固定版本选择为准。</p>
    {feedback ? <p className={feedback.ok ? "wf-resource-feedback" : "wf-resource-feedback is-error"} role={feedback.ok ? "status" : "alert"}>{feedback.text}</p> : null}
    {groups.length ? <table className="wf-resource-table">
      <thead><tr><th>名称</th><th>语言</th><th>用途</th><th>版本</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>{groups.flatMap(group => group.versions.map(entry => {
        const key = `${entry.ref}@${entry.version}`;
        return <tr key={key}>
          <td><strong>{entry.name ?? entry.ref}</strong><small>{entry.ref}</small></td>
          <td>{languageLabel(entry.language)}</td>
          <td>{purposeLabel(entry.purpose)}</td>
          <td>v{entry.version}</td>
          <td>{entry.disabled ? <span className="wf-resource-state is-disabled">已停用</span> : <span className="wf-resource-state">可用</span>}</td>
          <td><div className="wf-resource-row-actions">
            <button type="button" aria-expanded={references?.ref === entry.ref} onClick={() => void toggleReferences(entry.ref)}>引用</button>
            <button type="button" disabled={busyKey === key || entry.disabled} onClick={() => void disableFunction(entry)}>停用</button>
          </div></td>
        </tr>;
      }))}</tbody>
    </table> : <p className="wf-resource-empty">还没有已发布的函数。可在函数节点中编写并发布。</p>}
    {references ? <div className="wf-resource-inline-references"><h4>引用位置 · {references.ref}</h4><ResourceReferences rows={references.rows} loading={references.loading} error={references.error} onOpen={onOpenReference} emptyText="暂无工作流引用此函数。" /></div> : null}
  </section>;
}
