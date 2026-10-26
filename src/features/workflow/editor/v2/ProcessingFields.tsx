import type { JsonSchema, JsonValue, LlmConfigV2, WorkflowEnvironment, WorkflowNodeV2, WorkflowTool } from "../../domain/v2/types";
import { SchemaForm } from "./SchemaForm";
import { PromptEditor } from "./PromptEditor";
import { reconcileToolInputs } from "../../domain/v2/toolParams";
import { useExtensions } from "./FunctionExecutionFields";
import { CURRENT_TYPE_VERSIONS, isRetiredNode } from "../../domain/v2/nodeVersions";
import { isFakeEndpointRef } from "../../resources/providerModel";

function modelSelectValue(config: Record<string, JsonValue>): string {
  const provider = String(config.providerRef ?? "");
  const model = String(config.modelRef ?? "");
  return provider || model ? `${provider}\u0000${model}` : "";
}
function matchModelProvider(providers: WorkflowEnvironment["providers"], ref: string) {
  return providers.find(provider => provider.ref === ref);
}
export const transformOperations: Record<string, { label: string; schema: JsonSchema; inputs: Record<string, JsonValue> }> = {
  "core.identity": { label: "原样传递", schema: { type: "object", properties: { value: {} } }, inputs: { value: "" } },
  "core.add": { label: "数字相加", schema: { type: "object", properties: { left: { type: "number" }, right: { type: "number" } } }, inputs: { left: 0, right: 0 } },
  "core.concat": { label: "文本连接", schema: { type: "object", properties: { values: { type: "array", items: { type: "string" } }, separator: { type: "string" } } }, inputs: { values: [], separator: "" } },
  "core.message": { label: "构建对话消息", schema: { type: "object", properties: { text: { type: "string" }, role: { enum: ["system", "user"], type: "string" } } }, inputs: { text: "", role: "user" } }
};
export function ProcessingFields({ node, environment, tools, stateSchema, onChange, onAddModel, hideHeading = false }: { node: WorkflowNodeV2; environment?: WorkflowEnvironment; tools: WorkflowTool[]; stateSchema?: JsonSchema; onChange: (updates: Partial<WorkflowNodeV2>) => void; onAddModel?: () => void; hideHeading?: boolean }) {
  const config = node.config;
  const update = (patch: Record<string, JsonValue>) => onChange({ config: { ...config, ...patch } });
  const refs = Array.isArray(config.allowedToolRefs) ? config.allowedToolRefs as string[] : [];
  const providerRef = node.type === "core.llm" ? String(config.providerRef ?? "") : "";
  const visibleProviders = (environment?.providers ?? []).filter(item => !isFakeEndpointRef(item.ref));
  const selectedProvider = visibleProviders.find(item => item.ref === providerRef);
  const toolRef = node.type === "core.tool" ? String(config.toolRef ?? "") : "";
  const selectedTool = tools.find(item => item.ref === toolRef);
  const { data: extensions } = useExtensions(environment?.environmentRef);
  const llmConfig = config as unknown as LlmConfigV2;
  const retired = isRetiredNode(node);
  function upgradeCandidate(kind: "provider" | "tool") {
    const ref = kind === "provider" ? providerRef : toolRef;
    if (!ref.startsWith("p4:") || !extensions) return null;
    const current = extensions.connections.find(item => item.connectionKey === ref);
    if (!current) return null;
    const next = extensions.connections.filter(item => item.ref === current.ref && !item.disabled && item.version > current.version).sort((left, right) => right.version - left.version)[0];
    if (!next) return null;
    const models = Array.isArray(next.content.modelRefs) ? next.content.modelRefs.map(String) : [];
    const modelMissing = kind === "provider" && Boolean(config.modelRef) && !models.includes(String(config.modelRef));
    return { current, next, models, modelMissing };
  }
  function applyUpgrade(kind: "provider" | "tool", candidate: NonNullable<ReturnType<typeof upgradeCandidate>>) {
    if (kind === "provider") update({ providerRef: candidate.next.connectionKey, modelRef: candidate.modelMissing ? (candidate.models[0] ?? "") : String(config.modelRef ?? "") });
    else update({ toolRef: candidate.next.connectionKey, contractDigest: tools.find(tool => tool.connectionRef === candidate.current.ref && tool.version === candidate.next.version)?.contractDigest ?? "" });
  }
  return <section className="wf-config-section">{hideHeading ? null : <h3><span>2</span>处理</h3>}
    {node.type === "core.start" ? <p>图的开始标记；根据启动输入映射建立初始流程数据。</p> : node.type === "core.end" ? <p>结束当前分支；所有待执行任务结束后，整图才按输出绑定返回最终结果。</p> : null}
    {node.type === "core.llm" ? <>
      <div className="wf-model-field" data-config-field="config/modelRef">
        <div className="wf-model-label">模型{matchModelProvider(visibleProviders, String(config.providerRef ?? "")) ? <small>● {matchModelProvider(visibleProviders, String(config.providerRef ?? ""))?.name} 已连接</small> : null}</div>
        <div className="wf-model-select">
          <select aria-label="模型" value={modelSelectValue(config)} onChange={event => {
            const [nextProvider, ...modelParts] = event.target.value.split("\u0000");
            update({ providerRef: nextProvider, modelRef: modelParts.join("\u0000") });
          }}>
            <option value="">选择供应商和模型</option>
            {config.providerRef && !selectedProvider ? <option value={String(config.providerRef)} disabled>原连接不可用，请重新选择</option> : null}
            {(() => { const seen = new Set<string>(); return visibleProviders.map(provider => {
              const models = provider.modelRefs.filter((model, index) => provider.modelRefs.indexOf(model) === index && (!seen.has(model) || provider.ref === config.providerRef && model === config.modelRef));
              models.forEach(model => seen.add(model));
              return models.length ? <optgroup key={provider.ref} label={provider.name}>{models.map(model => <option key={`${provider.ref}\u0000${model}`} value={`${provider.ref}\u0000${model}`}>{model}</option>)}</optgroup> : null;
            }); })()}
          </select>
          {onAddModel ? <button type="button" className="wf-model-add" onClick={onAddModel}>＋ 添加模型</button> : null}
        </div>
      </div>
      {providerRef.startsWith("p4:") && !selectedProvider ? <p role="alert">原连接不可用，请重新选择模型。</p> : null}
      {(() => { const candidate = upgradeCandidate("provider"); return candidate ? <div className="wf-upgrade-hint" role="status"><span>已有更新版本，本节点仍使用当前连接{candidate.modelMissing ? " · 新版本未包含当前模型" : ""}</span><button type="button" onClick={() => applyUpgrade("provider", candidate)}>使用新版本</button></div> : null; })()}
      {retired ? <p role="alert">此节点是旧版本，请删除后重新添加。</p> : node.typeVersion >= (CURRENT_TYPE_VERSIONS["core.llm"] ?? 1) ? <>
        <PromptEditor prompt={llmConfig.prompt ?? { system: [], messages: [{ role: "user", content: [] }] }} inputs={node.inputs} onChange={prompt => update({ prompt: prompt as unknown as JsonValue })}/>
      </> : <p className="wf-field-note">旧版模型节点只保留定义；请删除后重新添加新版节点。</p>}
    </> : null}
    {node.type === "core.tool" ? <>{(() => { const candidate = upgradeCandidate("tool"); return candidate ? <div className="wf-upgrade-hint" role="status"><span>已有 v{candidate.next.version}，本节点使用 v{candidate.current.version}；升级会按新参数 Schema 保留同名参数</span><button type="button" onClick={() => { const nextTool = tools.find(tool => tool.connectionRef === candidate.current.ref && tool.version === candidate.next.version); const previousSchema = selectedTool?.inputSchema ?? { type: "object", properties: {} }; const nextSchema = nextTool?.inputSchema ?? previousSchema; const reconciled = reconcileToolInputs(previousSchema, nextSchema, node.inputs); onChange({ config: { ...node.config, toolRef: candidate.next.connectionKey, contractDigest: nextTool?.contractDigest ?? "" }, inputs: reconciled.inputs }); }}>升级</button></div> : null; })()}<label data-config-field="config/toolRef">工具<select aria-label="执行工具" value={String(config.toolRef ?? "")} onChange={e => { const tool = tools.find(t => t.ref === e.target.value); if (node.typeVersion >= 2) { const previousSchema = selectedTool?.inputSchema ?? { type: "object", properties: {} }; const nextSchema = tool?.inputSchema ?? { type: "object", properties: {} }; const reconciled = reconcileToolInputs(previousSchema, nextSchema, node.inputs); onChange({ config: { ...node.config, toolRef: tool?.ref ?? "", contractDigest: tool?.contractDigest ?? "" }, inputs: reconciled.inputs }); return; } onChange({ config: { ...node.config, toolRef: tool?.ref ?? "", contractDigest: tool?.contractDigest ?? "" }, inputs: { arguments: { source: "literal", value: {} } } }); }}><option value="">选择已注册工具</option>{tools.map(tool => <option key={tool.ref} value={tool.ref} disabled={tool.available === false}>{tool.name}{tool.origin === "user" ? " · 我的连接" : ""}{tool.available === false ? "（不可用）" : ""}</option>)}</select></label>{toolRef.startsWith("p4:") && !selectedTool ? <p role="alert">原工具连接不可用，请重新选择工具。</p> : null}<p>{selectedTool?.description ?? "选择当前环境授权的工具。HTTP 与 MCP 服务通过注册连接调用。"}</p></> : null}
    {node.type === "core.transform" ? <label data-config-field="config/operationRef">处理函数<select aria-label="转换操作" value={String(config.operationRef ?? "")} onChange={e => { const operation = transformOperations[e.target.value]; onChange({ config: { ...node.config, operationRef: e.target.value, operationVersion: 1 }, inputs: Object.fromEntries(Object.entries(operation.inputs).map(([key,value]) => [key, node.inputs[key] ?? { source: "literal" as const, value }])) }); }}><option value="" disabled>选择处理函数</option>{Object.entries(transformOperations).map(([ref,item]) => <option key={ref} value={ref}>{item.label}</option>)}</select></label> : null}
    {["core.llm", "core.tool_dispatch"].includes(node.type) ? <details data-config-field="工具授权"><summary>允许调用的工具 · {refs.length}</summary><small>模型决定调用，工具节点执行；两处授权分别生效。</small>{tools.map(tool => <label className="wf-v2-checkbox" key={tool.ref}><input type="checkbox" checked={refs.includes(tool.ref)} disabled={tool.available === false} onChange={e => update({ allowedToolRefs: e.target.checked ? [...refs, tool.ref] : refs.filter(ref => ref !== tool.ref) })}/><span>{tool.name}<small>{tool.description}</small></span></label>)}{refs.filter(ref => !tools.some(tool => tool.ref === ref && tool.available !== false)).map(ref => <p role="alert" key={ref}>工具 {ref} 当前不可用，请重新授权。</p>)}</details> : null}
  </section>;
}

/**
 * Model options that used to live in a nested collapsible. The unified panel exposes
 * them only inside its single final "高级" section.
 */
export function LlmAdvancedSettings({ node, stateSchema, onChange }: { node: WorkflowNodeV2; stateSchema: JsonSchema; onChange: (updates: Partial<WorkflowNodeV2>) => void }) {
  if (node.type !== "core.llm" || node.typeVersion < (CURRENT_TYPE_VERSIONS["core.llm"] ?? 1)) return null;
  const config = node.config;
  const update = (patch: Record<string, JsonValue>) => onChange({ config: { ...config, ...patch } });
  const stateFields = stateSchema.properties && typeof stateSchema.properties === "object" && !Array.isArray(stateSchema.properties) ? Object.entries(stateSchema.properties).map(([name, schema]) => ({ name, type: String((schema && typeof schema === "object" && !Array.isArray(schema) ? schema.type : "") ?? "") })) : [];
  const historyBinding = node.inputs.history;
  const modelParameters = config.modelParameters as Record<string, JsonValue> | undefined;
  return <fieldset className="wf-node-form" disabled={false}>
    <label data-config-field="inputs/history">对话历史<select aria-label="对话历史" value={historyBinding && historyBinding.source === "state" ? historyBinding.pointer : ""} onChange={event => { const next = { ...node.inputs }; if (event.target.value) next.history = { source: "state", pointer: event.target.value, onMissing: { mode: "error" } }; else delete next.history; onChange({ inputs: next }); }}><option value="">不传入</option>{stateFields.filter(field => field.type === "array" || field.type === "object" || field.type === "").map(field => <option key={field.name} value={`/${field.name}`}>流程数据 · {field.name}</option>)}</select></label>
    <div className="wf-model-parameters"><label>温度<input aria-label="模型温度" type="number" min="0" max="2" step="0.1" value={String(modelParameters?.temperature ?? "")} placeholder="模型默认" onChange={e => { const params = { ...(modelParameters ?? {}) }; if (e.target.value === "") delete params.temperature; else params.temperature = Number(e.target.value); update({ modelParameters: params }); }}/></label><label>top_p<input aria-label="模型 top_p" type="number" min="0" max="1" step="0.05" value={String(modelParameters?.top_p ?? "")} placeholder="模型默认" onChange={e => { const params = { ...(modelParameters ?? {}) }; if (e.target.value === "") delete params.top_p; else params.top_p = Number(e.target.value); update({ modelParameters: params }); }}/></label><label>思考模式<select aria-label="模型思考模式" value={String((modelParameters?.thinking as Record<string, JsonValue> | undefined)?.type ?? "")} onChange={e => { const params = { ...(modelParameters ?? {}) }; if (!e.target.value) delete params.thinking; else params.thinking = { type: e.target.value }; update({ modelParameters: params }); }}><option value="">模型默认</option><option value="enabled">开启</option><option value="disabled">关闭</option></select></label></div>
  </fieldset>;
}
