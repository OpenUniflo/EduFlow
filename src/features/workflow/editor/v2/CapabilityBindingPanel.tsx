import { useState } from "react";
import type { WorkflowDefinitionV2, WorkflowEnvironment, WorkflowTool } from "../../domain/v2/types";
import { unresolvedCapabilities, type CapabilityBinding } from "../../domain/v2/connectionReferences";

export function CapabilityBindingPanel({ definition, environment, tools, onApply, onConfigure }: {
  definition: WorkflowDefinitionV2;
  environment?: WorkflowEnvironment;
  tools: WorkflowTool[];
  onApply: (bindings: CapabilityBinding[]) => void;
  onConfigure: () => void;
}) {
  const unresolved = unresolvedCapabilities(definition);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  if (!unresolved.length) return null;
  const key = (nodeId: string, graphPath: string[]) => `${graphPath.join("/")}:${nodeId}`;
  const apply = () => {
    const bindings: CapabilityBinding[] = [];
    for (const item of unresolved) {
      const reference = selected[key(item.nodeId, item.graphPath)];
      if (!reference) continue;
      if (item.kind === "provider") {
        const provider = environment?.providers.find(candidate => candidate.ref === reference);
        if (provider) bindings.push({ ...item, reference, ...(provider.modelRefs[0] ? { modelRef: provider.modelRefs[0] } : {}) });
      } else {
        const tool = tools.find(candidate => candidate.ref === reference && candidate.available !== false);
        if (tool) bindings.push({ ...item, reference, contractDigest: tool.contractDigest });
      }
    }
    if (!bindings.length) { setStatus("请至少选择一个执行能力。"); return; }
    onApply(bindings);
    setStatus(`已写入草稿 ${bindings.length} 项；请保存生成新修订。`);
    setSelected({});
  };
  return <section className="wf-config-section">
    <h3>未绑定执行能力</h3>
    <p>模板只声明需要的能力；绑定写入你的副本，不会修改模板或其他账号。</p>
    {!environment ? <p role="alert">需配置执行能力：当前没有可用运行环境。</p> : unresolved.map(item => {
      const options = item.kind === "provider" ? environment.providers : tools.filter(tool => tool.available !== false);
      return <label key={key(item.nodeId, item.graphPath)} data-config-field={`${item.field}/${item.nodeId}`}>
        {item.kind === "provider" ? "模型" : "工具"} · {item.label}
        <select aria-label={`为 ${item.label} 绑定执行能力`} value={selected[key(item.nodeId, item.graphPath)] ?? ""} onChange={event => setSelected(current => ({ ...current, [key(item.nodeId, item.graphPath)]: event.target.value }))}>
          <option value="">选择{options.length ? "" : "（暂无可选项）"}</option>
          {options.map(option => <option key={option.ref} value={option.ref}>{option.name}{"version" in option && option.version ? ` · v${option.version}` : ""}</option>)}
        </select>
        {!options.length ? <small>当前账号没有可用{item.kind === "provider" ? "模型连接" : "工具连接"}；请先在“连接”面板创建。</small> : null}
      </label>;
    })}
    <div className="wf-dialog-actions">
      <button type="button" disabled={!environment} onClick={apply}>绑定到当前草稿</button>
      <button type="button" onClick={onConfigure}>查看连接配置</button>
    </div>
    <p role="status">{status}</p>
  </section>;
}
