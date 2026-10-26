import type { ResourceReferenceRow } from "../domain/v2/types";

/** Read-only "who uses this resource" list shared by the model, API, MCP, function and variable sections. */
export function ResourceReferences({
  rows,
  loading = false,
  error = "",
  emptyText = "暂无工作流引用此资源。",
  onOpen,
}: {
  rows?: readonly ResourceReferenceRow[] | null;
  loading?: boolean;
  error?: string;
  emptyText?: string;
  onOpen?: (row: ResourceReferenceRow) => void;
}) {
  if (loading) return <p className="wf-resource-reference-empty" role="status">正在读取引用…</p>;
  if (error) return <p className="wf-resource-reference-empty" role="alert">{error}</p>;
  if (!rows || !rows.length) return <p className="wf-resource-reference-empty">{emptyText}</p>;
  return <ul className="wf-resource-reference-list" aria-label="资源引用">
    {rows.map((row, index) => {
      const detail = row.modelRef ? `模型 ${row.modelRef}` : row.variableKey ? `变量 ${row.variableKey}` : typeof row.version === "number" ? `版本 v${row.version}` : "";
      return <li key={`${row.workflowId}:${row.nodeId}:${row.graphPath.join("/")}:${row.modelRef ?? ""}:${row.variableKey ?? ""}:${index}`}>
        <div className="wf-resource-reference-main">
          <strong>{row.workflowName || "未命名工作流"}</strong>
          <small>修订 v{row.revision}{detail ? ` · ${detail}` : ""}</small>
        </div>
        <div className="wf-resource-reference-node">
          <span>{row.nodeLabel || "未命名节点"}</span>
          {row.graphPath.length ? <small>子图：{row.graphPath.join(" / ")}</small> : null}
        </div>
        {onOpen ? <button type="button" onClick={() => onOpen(row)}>定位节点</button> : null}
      </li>;
    })}
  </ul>;
}
