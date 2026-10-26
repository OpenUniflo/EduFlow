import { useMemo } from "react";
import type { JsonValue, WorkflowDefinitionV2, WorkflowEnvironment, WorkflowTool } from "../../domain/v2/types";
import { connectionUpdates, type CapabilityBinding } from "../../domain/v2/connectionReferences";
import { definitionScopes, variableReferences } from "../../domain/v2/dataFlow";
import { CapabilityBindingPanel } from "./CapabilityBindingPanel";
import { useExtensions } from "./FunctionExecutionFields";
import { nodeLabelIndex } from "./StateFields";

type ResourceStatus = "available" | "update" | "disabled" | "missing";

const statusLabels: Record<ResourceStatus, string> = { available: "可用", update: "有新版本", disabled: "已停用", missing: "已不可用" };

type ConnectionLabelSource = { connectionKey: string; ref: string; version: number; content: Record<string, JsonValue> };

/** User-facing connection identity: catalog name + version, never the owner-scoped internal ref. */
export function connectionDisplayName(ref: string, connections: readonly ConnectionLabelSource[]): string {
  const current = connections.find(item => item.connectionKey === ref);
  if (current) {
    const configured = typeof current.content.name === "string" ? current.content.name.trim() : "";
    return `${configured || current.ref} · v${current.version}`;
  }
  if (ref.startsWith("p4:")) {
    const parts = ref.split(":");
    const version = parts.pop() ?? "";
    const name = parts.slice(2).join(":") || "连接";
    return `${name} · v${version}`;
  }
  return ref;
}

/**
 * “本流程资源” panel: only what this workflow references, derived from the definition.
 * Resources are created and edited in the resource center, never here (R13 keeps the
 * platform runtime environment invisible to users).
 */
export function EnvironmentPanel({ definition, environment, tools, locked, onApplyBindings, onOpenResourceCenter }: {
  definition: WorkflowDefinitionV2;
  environment?: WorkflowEnvironment;
  tools: WorkflowTool[];
  locked: boolean;
  onApplyBindings: (bindings: CapabilityBinding[]) => void;
  onOpenResourceCenter: () => void;
}) {
  const { data, error } = useExtensions(environment?.environmentRef);
  const labels = useMemo(() => nodeLabelIndex(definition), [definition]);
  // Every declared provider/tool reference; only user connections are shown as available.
  const references = useMemo(() => {
    const found: { ref: string; kind: "provider" | "tool"; nodeId: string; modelRef?: string }[] = [];
    for (const scope of definitionScopes(definition)) for (const node of scope.definition.nodes) {
      const config = node?.config as Record<string, unknown> | undefined;
      if (!config) continue;
      if (node.type === "core.llm" && typeof config.providerRef === "string" && config.providerRef.trim()) found.push({ ref: config.providerRef, kind: "provider", nodeId: node.id, ...(typeof config.modelRef === "string" && config.modelRef ? { modelRef: config.modelRef } : {}) });
      if (node.type === "core.tool" && typeof config.toolRef === "string" && config.toolRef.trim()) found.push({ ref: config.toolRef, kind: "tool", nodeId: node.id });
      if ((node.type === "core.llm" || node.type === "core.tool_dispatch") && Array.isArray(config.allowedToolRefs)) for (const value of config.allowedToolRefs) if (typeof value === "string" && value.trim()) found.push({ ref: value, kind: "tool", nodeId: node.id });
    }
    return found;
  }, [definition]);
  const updates = useMemo(() => data ? connectionUpdates({ definition, connections: data.connections, tools }) : [], [data, definition, tools]);
  const variables = useMemo(() => {
    const seen = new Map<string, string[]>();
    for (const reference of variableReferences(definition)) {
      const owners = seen.get(reference.key);
      if (!owners) seen.set(reference.key, [reference.nodeId]);
      else if (!owners.includes(reference.nodeId)) owners.push(reference.nodeId);
    }
    return [...seen.entries()];
  }, [definition]);
  const latest = useMemo(() => {
    const byRef = new Map<string, NonNullable<typeof data>["connections"][number]>();
    for (const connection of data?.connections ?? []) {
      const current = byRef.get(connection.connectionKey);
      if (!current || connection.version > current.version) byRef.set(connection.connectionKey, connection);
    }
    return byRef;
  }, [data]);
  const grouped = useMemo(() => {
    const byRef = new Map<string, { ref: string; kind: "provider" | "tool"; nodes: string[]; modelRefs: Set<string> }>();
    for (const reference of references) {
      const entry = byRef.get(reference.ref) ?? { ref: reference.ref, kind: reference.kind, nodes: [], modelRefs: new Set<string>() };
      if (!entry.nodes.includes(reference.nodeId)) entry.nodes.push(reference.nodeId);
      if (reference.modelRef) entry.modelRefs.add(reference.modelRef);
      byRef.set(reference.ref, entry);
    }
    return [...byRef.values()];
  }, [references]);
  function statusOf(ref: string): ResourceStatus {
    if (!ref.startsWith("p4:")) return "missing";
    const connection = latest.get(ref);
    if (!connection) return "missing";
    if (connection.disabled) return "disabled";
    if (updates.some(update => update.oldRef === ref)) return "update";
    return "available";
  }

  return <section className="wf-config-section wf-flow-resources" aria-label="本流程资源" data-config-field="resources">
    <header className="wf-flow-resources-head"><div><h3>本流程资源</h3><p>只显示这个流程引用的模型、工具和变量；资源的创建与编辑在资源中心完成。</p></div><button type="button" className="primary" onClick={onOpenResourceCenter} disabled={locked}>打开资源中心</button></header>
    {error ? <p role="alert">{error}</p> : null}
    <CapabilityBindingPanel definition={definition} environment={environment} tools={tools} onApply={onApplyBindings} onConfigure={onOpenResourceCenter}/>
    <section className="wf-flow-resource-group" aria-label="引用的连接">
      <h4>模型与工具 · {grouped.length}</h4>
      {grouped.length ? grouped.map(item => <article className="wf-connection-card" key={`${item.kind}:${item.ref}`}>
        <strong>{connectionDisplayName(item.ref, data?.connections ?? [])}</strong>
        <small>{item.kind === "provider" ? "模型连接" : "工具连接"}{item.modelRefs.size ? ` · ${[...item.modelRefs].join(" · ")}` : ""}</small>
        <span className={`wf-resource-status ${statusOf(item.ref)}`}>{statusLabels[statusOf(item.ref)]}</span>
        <small>被引用节点：{item.nodes.map(id => labels.get(id) ?? id).join("、")}</small>
      </article>) : <p className="wf-field-note">这个流程还没有引用模型或工具连接。打开资源中心创建后，在节点中选择即可。</p>}
    </section>
    <section className="wf-flow-resource-group" aria-label="引用的变量">
      <h4>变量 · {variables.length}</h4>
      {variables.length ? <table className="wf-flow-variable-table"><thead><tr><th>名称</th><th>当前值</th><th>引用节点</th></tr></thead><tbody>{variables.map(([key, nodeIds]) => <tr key={key}><td><code>{key}</code></td><td>{environment?.variables && Object.prototype.hasOwnProperty.call(environment.variables, key) ? String(environment.variables[key]) : <span className="wf-state-muted">未提供</span>}</td><td>{nodeIds.map(id => labels.get(id) ?? id).join("、")}</td></tr>)}</tbody></table> : <p className="wf-field-note">这个流程还没有引用变量。变量在资源中心的「变量」中维护。</p>}
    </section>
    <p className="wf-field-note">连接版本不可变：编辑会发布新版本，正在使用旧版本的节点不受影响；可在节点中单独升级。</p>
  </section>;
}
