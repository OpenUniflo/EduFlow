import type { JsonSchema, JsonValue, WorkflowEnvironment, WorkflowNodeV2, WorkflowTool } from "../../domain/v2/types";
import { JsonField } from "./JsonField";
import { SchemaForm } from "./SchemaForm";

export const transformOperations: Record<string, { label: string; schema: JsonSchema; inputs: Record<string, JsonValue> }> = {
  "core.identity": { label: "原样传递", schema: { type: "object", properties: { value: {} } }, inputs: { value: "" } },
  "core.add": { label: "数字相加", schema: { type: "object", properties: { left: { type: "number" }, right: { type: "number" } } }, inputs: { left: 0, right: 0 } },
  "core.concat": { label: "文本连接", schema: { type: "object", properties: { values: { type: "array", items: { type: "string" } }, separator: { type: "string" } } }, inputs: { values: [], separator: "" } },
  "core.message": { label: "构建对话消息", schema: { type: "object", properties: { text: { type: "string" }, role: { enum: ["system", "user"], type: "string" } } }, inputs: { text: "", role: "user" } }
};
export function ProcessingFields({ node, environment, tools, onChange, onEnvironment }: { node: WorkflowNodeV2; environment?: WorkflowEnvironment; tools: WorkflowTool[]; onChange: (updates: Partial<WorkflowNodeV2>) => void; onEnvironment: () => void }) {
  const config = node.config;
  const update = (patch: Record<string, JsonValue>) => onChange({ config: { ...config, ...patch } });
  const refs = Array.isArray(config.allowedToolRefs) ? config.allowedToolRefs as string[] : [];
  const providerRef = node.type === "core.llm" ? String(config.providerRef ?? "") : "";
  const selectedProvider = environment?.providers.find(item => item.ref === providerRef);
  const toolRef = node.type === "core.tool" ? String(config.toolRef ?? "") : "";
  const selectedTool = tools.find(item => item.ref === toolRef);
  return <section className="wf-config-section"><h3><span>2</span>处理</h3>
    {node.type === "core.start" ? <p>图的开始标记；根据启动输入映射建立初始 State。</p> : node.type === "core.end" ? <p>结束当前分支；所有待执行任务结束后，整图才按输出绑定返回最终结果。</p> : null}
    {node.type === "core.llm" ? <>
      <label data-config-field="config/providerRef">模型连接<select aria-label="模型连接" value={String(config.providerRef ?? "")} onChange={e => update({ providerRef: e.target.value, modelRef: "" })}><option value="">选择模型连接</option>{config.providerRef && !environment?.providers.some(p => p.ref === config.providerRef) ? <option value={String(config.providerRef)} disabled>原连接不可用</option> : null}{environment?.providers.map(p => <option key={p.ref} value={p.ref}>{p.name}</option>)}</select></label>
      {providerRef.startsWith("p4:") && !selectedProvider ? <p role="alert">原连接不可用，请重新选择模型连接。</p> : null}
      <label data-config-field="config/modelRef">模型<select aria-label="模型" value={String(config.modelRef ?? "")} onChange={e => update({ modelRef: e.target.value })}><option value="">选择模型</option>{environment?.providers.find(p => p.ref === config.providerRef)?.modelRefs.map(ref => <option key={ref}>{ref}</option>)}</select></label>
      <button type="button" className="wf-text-button" onClick={onEnvironment}>管理环境与连接</button>
      <p className="wf-field-note">指令和问题通过「读取」中的对话消息传入。可用“构建对话消息”节点生成消息，也可在固定值中编写系统指令。</p>
      <label>温度<input aria-label="模型温度" type="number" min="0" max="2" step="0.1" value={String((config.modelParameters as Record<string, JsonValue>)?.temperature ?? "")} placeholder="使用模型默认值" onChange={e => { const params = { ...(config.modelParameters as Record<string, JsonValue> ?? {}) }; if(e.target.value === "") delete params.temperature; else params.temperature = Number(e.target.value); update({ modelParameters: params }); }}/></label>
    </> : null}
    {node.type === "core.tool" ? <><label data-config-field="config/toolRef">工具 / 函数<select aria-label="执行工具" value={String(config.toolRef ?? "")} onChange={e => { const tool = tools.find(t => t.ref === e.target.value); onChange({ config: { ...node.config, toolRef: tool?.ref ?? "", contractDigest: tool?.contractDigest ?? "" }, inputs: { arguments: { source: "literal", value: {} } } }); }}><option value="">选择已注册工具</option>{tools.map(tool => <option key={tool.ref} value={tool.ref} disabled={tool.available === false}>{tool.name}{tool.available === false ? "（不可用）" : ""}</option>)}</select></label>{toolRef.startsWith("p4:") && !selectedTool ? <p role="alert">原工具连接不可用，请重新选择工具。</p> : null}<p>{selectedTool?.description ?? "选择当前环境授权的工具。HTTP 与 MCP 服务通过注册连接调用。"}</p></> : null}
    {node.type === "core.transform" ? <label data-config-field="config/operationRef">处理函数<select aria-label="转换操作" value={String(config.operationRef ?? "")} onChange={e => { const operation = transformOperations[e.target.value]; onChange({ config: { ...node.config, operationRef: e.target.value, operationVersion: 1 }, inputs: Object.fromEntries(Object.entries(operation.inputs).map(([key,value]) => [key, node.inputs[key] ?? { source: "literal" as const, value }])) }); }}><option value="" disabled>选择处理函数</option>{Object.entries(transformOperations).map(([ref,item]) => <option key={ref} value={ref}>{item.label}</option>)}</select></label> : null}
    {["core.llm", "core.tool_dispatch"].includes(node.type) ? <details data-config-field="工具授权"><summary>允许调用的工具 · {refs.length}</summary><small>模型决定调用，工具节点执行；两处授权分别生效。</small>{tools.map(tool => <label className="wf-v2-checkbox" key={tool.ref}><input type="checkbox" checked={refs.includes(tool.ref)} disabled={tool.available === false} onChange={e => update({ allowedToolRefs: e.target.checked ? [...refs, tool.ref] : refs.filter(ref => ref !== tool.ref) })}/><span>{tool.name}<small>{tool.description}</small></span></label>)}{refs.filter(ref => !tools.some(tool => tool.ref === ref && tool.available !== false)).map(ref => <p role="alert" key={ref}>工具 {ref} 当前不可用，请重新授权。</p>)}</details> : null}
    <details><summary>高级处理参数</summary><JsonField ownerNodeId={node.id} fieldId={`${node.id}-config`} label="节点参数" value={config} onChange={value => onChange({ config: value })}/></details>
  </section>;
}
