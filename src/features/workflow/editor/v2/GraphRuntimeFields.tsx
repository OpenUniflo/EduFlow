import type { WorkflowDefinitionV2 } from "../../domain/v2/types";

/** Native budgets stay separate from future persistence/interrupt settings. */
export function GraphRuntimeFields({ definition, onChange, persistent = false }: { definition: WorkflowDefinitionV2; onChange: (definition: WorkflowDefinitionV2) => void; persistent?:boolean }) {
  const policy = definition.policy;
  const future = policy.authoring;
  const update = (patch: Partial<typeof policy>) => onChange({ ...definition, policy: { ...policy, ...patch } });
  return <section className="wf-config-section"><h3>图运行设置</h3>
    <label>计算时间预算（秒）<input aria-label="图计算时间预算" type="number" min={1} value={policy.timeoutMs / 1000} onChange={e => update({ timeoutMs: Math.max(1000, Number(e.target.value) * 1000) })}/></label>
    <label>节点执行次数上限<input aria-label="图节点执行次数上限" type="number" min={1} value={policy.maxNodeExecutions} onChange={e => update({ maxNodeExecutions: Math.max(1, Math.floor(Number(e.target.value))) })}/></label>
    <label>图条件入口<select aria-label="图条件入口" value={future?.entryRouter??""} onChange={e=>{const next={recursionLimit:50,waitTimeoutMs:86400000,checkpoint:"superstep" as const,...future};if(e.target.value)next.entryRouter=e.target.value;else delete next.entryRouter;update({authoring:next});}}><option value="">按开始节点连线执行</option>{definition.nodes.filter(node=>node.type==="core.router").map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></label><p className="wf-field-note">条件入口直接按所选路由分发，不执行开始与路由标记。开始节点须只连接此路由。</p>
    <details><summary>调试断点</summary><p>在节点前或后暂停，不要求业务回应。继续时沿用当前检查点。</p>{(["interruptBefore","interruptAfter"] as const).map(key=><fieldset key={key}><legend>{key==="interruptBefore"?"节点执行前":"节点执行后"}</legend>{definition.nodes.map(node=><label className="wf-v2-checkbox" key={node.id}><input type="checkbox" checked={Boolean(future?.[key]?.includes(node.id))} onChange={e=>update({authoring:{recursionLimit:50,waitTimeoutMs:86400000,checkpoint:"superstep",...future,[key]:e.target.checked?[...(future?.[key]??[]),node.id]:(future?.[key]??[]).filter(id=>id!==node.id)}})}/>{node.label}</label>)}</fieldset>)}</details>
    <p className="wf-field-note">计算预算限制实际计算时间；等待用户回应的有效期单独配置。服务端仍会校验当前环境允许的上限。</p>
    <label className="wf-v2-checkbox"><input type="checkbox" checked={Boolean(future)} onChange={e => { const next = { ...policy }; if (e.target.checked) next.authoring = { recursionLimit: 50, waitTimeoutMs: 86400000, checkpoint: "superstep" }; else delete next.authoring; onChange({ ...definition, policy: next }); }}/>配置中断等待与检查点{persistent?"":"（待执行接入）"}</label>
    {future ? <div className="wf-connection-card"><p className="wf-capability-note">{persistent?"真实执行会在每个超步保存检查点。等待回应另计有效期；中断恢复沿用原流程版本。":"以下设置可编辑、保存和导出；保存不会创建检查点，运行前请确认执行环境支持持久化。"}</p>
      <label>递归限制<input aria-label="图递归限制" type="number" min={1} max={500} value={future.recursionLimit} onChange={e => update({ authoring: { ...future, recursionLimit: Math.max(1, Math.min(500, Math.floor(Number(e.target.value)))) } })}/></label>
      <label>等待回应有效期<select aria-label="等待回应有效期" value={future.waitTimeoutMs} onChange={e => update({ authoring: { ...future, waitTimeoutMs: Number(e.target.value) } })}><option value={86400000}>24 小时</option><option value={604800000}>7 天</option>{![86400000, 604800000].includes(future.waitTimeoutMs) ? <option value={future.waitTimeoutMs}>{future.waitTimeoutMs / 3600000} 小时（自定义）</option> : null}</select></label>
      <label>检查点策略<select aria-label="检查点策略" value={future.checkpoint} onChange={e => update({ authoring: { ...future, checkpoint: e.target.value as "superstep" } })}><option value="superstep">每个 super-step 持久化</option></select></label>
    </div> : null}
  </section>;
}
