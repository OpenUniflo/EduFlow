import { useMemo, useState } from "react";
import type { WorkflowDefinitionV2, WorkflowTool } from "../../domain/v2/types";
import { useExtensions } from "./FunctionExecutionFields";
import { connectionUpdates, type ConnectionUpdate } from "../../domain/v2/connectionReferences";

export function ConnectionVersionPanel({ definition, environmentRef, tools, onApply, onRefresh }: {
  definition: WorkflowDefinitionV2;
  environmentRef?: string;
  tools: WorkflowTool[];
  onApply: (updates: ConnectionUpdate[]) => void;
  onRefresh: () => void;
}) {
  const { data, error, refresh } = useExtensions(environmentRef);
  const [status, setStatus] = useState("");
  const proposals = useMemo(() => data ? connectionUpdates({ definition, connections: data.connections, tools }) : [], [data, definition, tools]);
  const safe = proposals.filter(update => !update.requiresConfirmation);
  const manual = proposals.filter(update => update.requiresConfirmation);
  return <section className="wf-config-section">
    <h3>连接版本</h3>
    <p>旧版本在停用前仍可用；更新只写入当前草稿，保存后生成新修订，不改历史 Run。</p>
    {error ? <p role="alert">{error}</p> : null}
    {!environmentRef ? <p>工作流服务暂时不可用。</p> : !data ? <p>正在读取连接版本…</p> : <>
      <p>{safe.length} 项可自动更新 · {manual.length} 项需人工确认</p>
      {safe.length ? <button type="button" onClick={() => { onApply(safe); setStatus(`已写入草稿 ${safe.length} 项；请保存生成新修订。`); }}>更新可自动绑定的连接</button> : null}
      {proposals.map(update => <article className="wf-connection-card" key={`${update.graphPath.join("/")}:${update.nodeId}:${update.field}:${update.index ?? ""}`}>
        <strong>{update.connectionRef} · v{update.version}</strong>
        <small>{update.graphPath.length ? `子图 ${update.graphPath.join(" / ")} · ` : ""}{update.nodeId} · {update.field === "allowedToolRefs" ? `白名单 ${(update.index ?? 0) + 1}` : update.field}</small>
        <p>{update.oldRef} → {update.newRef}</p>
        {update.requiresConfirmation ? <em role="status">需人工确认：{update.reason}</em> : null}
      </article>)}
      {!proposals.length ? <p>没有发现可更新的连接引用。旧版本停用且未更新时，运行会在预检阶段报出节点。</p> : null}
    </>}
    <p role="status">{status}</p>
    <button type="button" onClick={() => { refresh(); onRefresh(); }}>重新读取连接版本</button>
  </section>;
}
