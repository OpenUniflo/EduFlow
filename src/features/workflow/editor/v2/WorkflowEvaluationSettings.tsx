import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, Loader2, Save, Sparkles } from "lucide-react";
import { workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../../repository/v2/WorkflowApiV2";
import type { WorkflowEnvironment, WorkflowEvaluationConfig } from "../../domain/v2/types";

function linesToCriteria(value: string) {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function emptyConfig(workflowId: string): WorkflowEvaluationConfig {
  return { workflowId, version: 0, enabled: true, goal: "", criteria: [], providerRef: null, modelRef: null, environmentRef: null, updatedAt: null };
}

export function WorkflowEvaluationSettings({ workflowId, environments, readOnly, onOpenProviders }: {
  workflowId: string;
  environments: WorkflowEnvironment[];
  readOnly?: boolean;
  onOpenProviders?: () => void;
}) {
  const [config, setConfig] = useState<WorkflowEvaluationConfig>(() => emptyConfig(workflowId));
  const [goal, setGoal] = useState("");
  const [criteriaText, setCriteriaText] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [modelValue, setModelValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const models = useMemo(() => environments.flatMap(environment => environment.providers.flatMap(provider => provider.modelRefs.map(model => ({
    value: `${environment.environmentRef}|${provider.ref}|${model}`,
    label: `${environment.name} · ${provider.name} · ${model}`,
    environmentRef: environment.environmentRef,
    providerRef: provider.ref,
    modelRef: model,
  })))), [environments]);

  function applyConfig(next: WorkflowEvaluationConfig) {
    setConfig(next);
    setGoal(next.goal);
    setCriteriaText(next.criteria.join("\n"));
    setEnabled(next.enabled);
    setModelValue(next.providerRef && next.modelRef && next.environmentRef ? `${next.environmentRef}|${next.providerRef}|${next.modelRef}` : "");
  }

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setNotice("");
    void workflowApiV2.evaluationConfig(workflowId).then(result => {
      if (!active) return;
      applyConfig(result.config);
    }).catch(reason => {
      if (active) setError(workflowErrorMessage(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [workflowId]);

  const selectedModel = models.find(model => model.value === modelValue);
  const storedUnavailable = Boolean(config.providerRef && config.modelRef && !models.some(model => model.value === modelValue));
  const dirty = goal !== config.goal || criteriaText !== config.criteria.join("\n") || enabled !== config.enabled || modelValue !== (config.providerRef && config.modelRef && config.environmentRef ? `${config.environmentRef}|${config.providerRef}|${config.modelRef}` : "");
  const criteria = linesToCriteria(criteriaText);

  async function save() {
    if (readOnly) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await workflowApiV2.saveEvaluationConfig({
        workflowId,
        version: config.version,
        enabled,
        goal: goal.trim(),
        criteria,
        providerRef: selectedModel?.providerRef ?? null,
        modelRef: selectedModel?.modelRef ?? null,
        environmentRef: selectedModel?.environmentRef ?? null,
        updatedAt: config.updatedAt,
      });
      applyConfig(result.config);
      setNotice(result.config.version > 0 ? `已保存评价设置 · 标准版本 ${result.config.version}。新运行会冻结此版本。` : "已保存评价设置。");
    } catch (reason) {
      setError(workflowErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="wf-eval-settings" aria-label="完成评价设置"><p className="wf-field-note" role="status"><Loader2 size={14} className="spin" aria-hidden="true" /> 正在读取评价设置…</p></section>;

  return <section className="wf-eval-settings" aria-label="完成评价设置">
    <header className="wf-eval-settings-heading">
      <span className="wf-eval-eyebrow"><ClipboardCheck size={14} aria-hidden="true" /> 完成评价</span>
      <h3>运行结束后，自动说明完成得怎么样</h3>
      <p>基础检查始终执行：运行状态、最终输出与 Schema、实际步骤和错误、工具执行记录。只有填写目标、评分标准并选择模型后，才会增加目标完成和输出质量评价。</p>
    </header>
    <div className="wf-eval-settings-version"><span>标准版本 <strong>{config.version || "未设置"}</strong></span><span>{config.updatedAt ? `上次保存 ${new Date(config.updatedAt).toLocaleString("zh-CN")}` : "尚未设置"}</span></div>
    <label className="wf-eval-switch">
      <input type="checkbox" checked={enabled} disabled={readOnly} onChange={event => { setEnabled(event.target.checked); setNotice(""); }} />
      <span><strong>自动进行语义评价</strong><small>关闭后仍会完成基础检查，并在报告中说明语义评价未执行。</small></span>
    </label>
    <label>这次工作流要完成什么
      <textarea value={goal} maxLength={4000} disabled={readOnly} placeholder="例如：根据用户问题查询订单，并给出订单状态和下一步建议。只写目标，不要写密钥。" onChange={event => { setGoal(event.target.value); setNotice(""); }} />
    </label>
    <label>评分标准（每行一条）
      <textarea value={criteriaText} disabled={readOnly} placeholder={"例如：\n给出真实订单号\n回答包含订单状态\n没有编造未查询到的信息"} onChange={event => { setCriteriaText(event.target.value); setNotice(""); }} />
      <small>{criteria.length} 条标准 · 最多 20 条，每行一条；标准会和版本号一起冻结在每次运行里。</small>
    </label>
    <label>评估模型
      <select value={modelValue} disabled={readOnly || !models.length} onChange={event => { setModelValue(event.target.value); setNotice(""); }}>
        <option value="">{models.length ? "仅做基础检查（不调用模型）" : "暂无可用模型连接"}</option>
        {models.map(model => <option key={model.value} value={model.value}>{model.label}</option>)}
      </select>
      <small>使用现有模型连接和凭据；不会新建第三方评测账号，也不会把运行记录上传到评测平台。评价模型不能执行工具或修改学习进度。</small>
    </label>
    {storedUnavailable ? <p className="wf-eval-settings-warning" role="status"><AlertTriangle size={14} aria-hidden="true" />当前保存的评估模型连接不可用。可以重新选择模型，或继续保留设置；新运行会显示「语义评价未执行」。</p> : null}
    {!models.length ? <div className="wf-eval-settings-action"><span>还没有可用的模型连接。基础检查不需要模型；要做目标评价，请先连接模型。</span>{onOpenProviders ? <button type="button" onClick={onOpenProviders}>去连接模型</button> : null}</div> : null}
    {error ? <p className="wf-eval-settings-error" role="alert"><AlertTriangle size={14} aria-hidden="true" />{error}</p> : null}
    {notice ? <p className="wf-eval-settings-notice" role="status"><Sparkles size={14} aria-hidden="true" />{notice}</p> : null}
    <footer className="wf-eval-settings-actions">
      <button type="button" className="primary" onClick={() => void save()} disabled={readOnly || saving || !dirty}><Save size={14} aria-hidden="true" />{saving ? "正在保存…" : dirty ? "保存评价设置" : "已保存"}</button>
      {dirty ? <button type="button" onClick={() => applyConfig(config)} disabled={saving}>撤销未保存修改</button> : null}
    </footer>
  </section>;
}
