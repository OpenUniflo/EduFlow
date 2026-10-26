import { useState } from "react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { ConnectionTestResult, JsonValue } from "../domain/v2/types";
import type { CatalogConnection } from "./resourceModel";
import {
  latestVisibleProviders, probeConnectionContent, probeConnectionRef, visibleProviderConnections,
  providerAddress, providerDisplayName, providerDraftIssue, providerModelRefs, providerPublishContent, providerTestIssue,
  providerTypeLabel, providerVersions,
} from "./providerModel";
import {
  DEEPSEEK_BASE_URL, credentialRequiredFor, findProviderPreset, modelRefIssue, normalizeBaseUrl, providerRefFromPreset,
  uniqueProviderRef, visibleProviderPresets, type ProviderPreset,
} from "./providerPresets";
import { ResourceTestPanel } from "./ResourceTestPanel";
import type { ResourceCreated } from "./resourceTypes";

export type AddModelDialogProps = {
  environmentRef: string;
  providers: readonly CatalogConnection[];
  initialMode?: "create" | "existing";
  initialProviderRef?: string;
  initialPresetId?: string;
  localEnvironment?: boolean;
  onClose: () => void;
  onCreated: ResourceCreated;
};

type Feedback = { ok: boolean; text: string };

function normalizeModelList(models: readonly string[]): string[] {
  const seen: string[] = [];
  for (const model of models) {
    const value = model.trim();
    if (value && !seen.includes(value)) seen.push(value);
  }
  return seen;
}

/** Add a model supplier or add models to an existing supplier. Overlays the resource center. */
export function AddModelDialog({ environmentRef, providers, initialMode = "create", initialProviderRef, initialPresetId, localEnvironment = true, onClose, onCreated }: AddModelDialogProps) {
  const latest = latestVisibleProviders(providers).filter(entry => !entry.disabled);
  const initialProvider = latest.find(entry => entry.ref === initialProviderRef) ?? (initialMode === "existing" ? latest[0] : undefined);
  const initialPreset = findProviderPreset(initialPresetId ?? "");
  const defaultPreset = initialPreset ?? findProviderPreset("deepseek")!;
  const existingRefs = [...new Set(visibleProviderConnections(providers).map(entry => entry.ref))];

  const [mode, setMode] = useState<"create" | "existing">(initialMode === "existing" && initialProvider ? "existing" : "create");
  const [presetId, setPresetId] = useState(defaultPreset.id);
  const [type, setType] = useState<string>(defaultPreset.type);
  const [name, setName] = useState(defaultPreset.label);
  const [ref, setRef] = useState(uniqueProviderRef(providerRefFromPreset(defaultPreset.id), existingRefs));
  const [baseUrl, setBaseUrl] = useState(defaultPreset.baseUrl);
  const [selectedRef, setSelectedRef] = useState(initialProvider?.ref ?? "");
  const [credential, setCredential] = useState("");
  const [enabledModels, setEnabledModels] = useState<string[]>(initialProvider ? providerModelRefs(initialProvider) : []);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedProvider = mode === "existing" ? latest.find(entry => entry.ref === selectedRef) ?? latest[0] : undefined;
  const effectiveType = selectedProvider ? String(selectedProvider.content.type ?? "") : type;
  const effectiveName = selectedProvider ? providerDisplayName(selectedProvider) : name.trim();
  const effectiveRef = selectedProvider ? selectedProvider.ref : ref.trim();
  const effectiveBaseUrl = selectedProvider ? providerAddress(selectedProvider) : baseUrl;
  const currentModels = selectedProvider ? providerModelRefs(selectedProvider) : [];
  const testModels = testResult?.ok ? testResult.models ?? [] : [];
  const candidates = normalizeModelList([...currentModels, ...discoveredModels, ...enabledModels]).filter(model => !modelSearch.trim() || model.toLowerCase().includes(modelSearch.trim().toLowerCase()));
  const targetVersion = selectedProvider ? selectedProvider.version + 1 : 1;
  const addedCount = enabledModels.filter(model => !currentModels.includes(model)).length;
  const draftInput = {
    mode, type: effectiveType, name: effectiveName, ref: effectiveRef, baseUrl: effectiveBaseUrl, credential,
    models: enabledModels, existingRefs, localEnvironment,
  };
  const credentialRequired = credentialRequiredFor(effectiveType, effectiveBaseUrl) || Boolean(selectedProvider?.hasCredential);
  const credentialInput = { ...draftInput, credentialRequired };
  const saveIssue = providerDraftIssue(credentialInput);
  const testIssue = providerTestIssue(credentialInput);
  const summary = mode === "create" ? "保存后会出现在节点的模型下拉里" : addedCount ? `新增 ${addedCount} 个模型` : "更新这个供应商的模型列表";
  const canSave = !saving && !testing && !saveIssue;
  const versions = selectedProvider ? providerVersions(providers, selectedProvider.ref) : [];

  function resetTest() {
    setTestResult(null); setDiscoveredModels([]);
  }

  function choosePreset(preset: ProviderPreset) {
    setMode("create"); setSelectedRef(""); setPresetId(preset.id); setType(preset.type); setName(preset.label);
    setRef(uniqueProviderRef(providerRefFromPreset(preset.id), existingRefs));
    setBaseUrl(preset.baseUrl); setEnabledModels([]); setFeedback(null); setModelSearch(""); resetTest();
  }

  function chooseProvider(providerRef: string) {
    setMode("existing");
    const provider = latest.find(entry => entry.ref === providerRef);
    setSelectedRef(providerRef);
    setEnabledModels(provider ? providerModelRefs(provider) : []);
    setFeedback(null); resetTest();
  }

  function toggleModel(model: string, enabled: boolean) {
    setEnabledModels(current => enabled ? (current.includes(model) ? current : [...current, model]) : current.filter(item => item !== model));
    setFeedback(null);
  }

  function addManualModel() {
    const issue = modelRefIssue(manualModel);
    if (issue) { setFeedback({ ok: false, text: issue }); return; }
    const model = manualModel.trim();
    setEnabledModels(current => current.includes(model) ? current : [...current, model]);
    setManualModel(""); setFeedback(null);
  }

  function applyTestResult(result: ConnectionTestResult) {
    setTestResult(result);
    if (result.ok) {
      const models = result.models ?? [];
      setDiscoveredModels(current => normalizeModelList([...current, ...models]));
      setEnabledModels(current => normalizeModelList([...current, ...models]));
    }
  }

  async function runTest() {
    if (testIssue) { setFeedback({ ok: false, text: testIssue }); return; }
    setTesting(true); setFeedback(null); setTestResult(null);
    if (selectedProvider) {
      try {
        applyTestResult(await workflowApiV2.testExtension(environmentRef, { ref: selectedProvider.ref, version: selectedProvider.version }));
      } catch (reason) {
        setFeedback({ ok: false, text: workflowErrorMessage(reason) });
      } finally { setTesting(false); }
      return;
    }
    const probeRef = probeConnectionRef();
    try {
      await workflowApiV2.extension(environmentRef, {
        action: "publish", kind: "connection", ref: probeRef, version: 1,
        content: probeConnectionContent({ type: effectiveType, baseUrl: effectiveBaseUrl }), credential,
      });
      applyTestResult(await workflowApiV2.testExtension(environmentRef, { ref: probeRef, version: 1 }));
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally {
      // Probe rows are hidden from every resource-center list and are never selectable by a node.
      try { await workflowApiV2.extension(environmentRef, { action: "disable", kind: "connection", ref: probeRef, version: 1 }); } catch { /* The probe stays hidden even if cleanup fails. */ }
      setTesting(false);
    }
  }

  async function save() {
    if (saveIssue) { setFeedback({ ok: false, text: saveIssue }); return; }
    setSaving(true); setFeedback(null);
    let content: Record<string, JsonValue>;
    if (selectedProvider) {
      content = providerPublishContent(selectedProvider, enabledModels);
    } else if (effectiveType === "deepseek") {
      content = { type: "deepseek", name: effectiveName, baseUrl: DEEPSEEK_BASE_URL, modelRefs: [...enabledModels] };
    } else {
      content = { type: "openai-compatible", name: effectiveName, baseUrl: normalizeBaseUrl(effectiveBaseUrl), modelRefs: [...enabledModels] };
    }
    try {
      await workflowApiV2.extension(environmentRef, {
        action: "publish", kind: "connection", ref: effectiveRef, version: targetVersion, content, credential,
      });
      onCreated(effectiveRef, targetVersion, content);
      onClose();
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setSaving(false); }
  }

  const shownPreset = findProviderPreset(presetId);
  const docsUrl = selectedProvider ? "" : shownPreset?.docsUrl ?? "";
  const canTest = !testing && !saving && !testIssue;
  return <>
    <div className="wf-resource-modal-backdrop" aria-hidden="true" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} />
    <section className="wf-resource-modal wf-add-model" role="dialog" aria-modal="true" aria-labelledby="wf-add-model-title" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <header className="wf-resource-modal-header">
        <div><h3 id="wf-add-model-title">添加模型</h3><p>选一个供应商，填入 API Key，测试连接后勾选要启用的模型。</p></div>
        <button type="button" className="wf-resource-close" aria-label="关闭添加模型" onClick={onClose}>关闭</button>
      </header>
      <div className="wf-add-model-body">
        <nav className="wf-add-model-nav" aria-label="选择供应商">
          {latest.length ? <><div className="wf-add-model-nav-title">已连接</div>{latest.map(provider => <button key={provider.ref} type="button" aria-pressed={mode === "existing" && selectedRef === provider.ref} onClick={() => chooseProvider(provider.ref)}>
            <span className="wf-add-model-avatar">{providerDisplayName(provider).slice(0, 1)}</span>
            <span className="wf-add-model-nav-copy"><strong>{providerDisplayName(provider)}</strong><small>{providerModelRefs(provider).length} 个模型</small></span>
          </button>)}</> : null}
          <div className="wf-add-model-nav-title">添加供应商</div>
          {visibleProviderPresets(localEnvironment).map(preset => <button key={preset.id} type="button" data-preset-id={preset.id} aria-pressed={mode === "create" && presetId === preset.id} onClick={() => choosePreset(preset)}>
            <span className="wf-add-model-avatar">{preset.label.slice(0, 1)}</span>
            <span className="wf-add-model-nav-copy"><strong>{preset.label}</strong><small>{preset.baseUrl ? preset.baseUrl.replace(/^https?:\/\//, "") : "填写服务地址"}</small></span>
          </button>)}
        </nav>
        <div className="wf-add-model-form">
          {mode === "create" && !presetId ? <p className="wf-resource-empty">先选择一个供应商。</p> : null}
          {(mode === "existing" && selectedProvider) || (mode === "create" && shownPreset) ? <>
            <div className="wf-add-model-title"><h4>{effectiveName}</h4>{mode === "existing" ? <small>已连接</small> : <small>{shownPreset?.hint}</small>}</div>
            <label className="wf-add-model-key"><span>API Key {docsUrl ? <a href={docsUrl} target="_blank" rel="noreferrer">去哪里获取</a> : null}</span><input aria-label="模型 API Key" type="password" autoComplete="new-password" value={credential} onChange={event => setCredential(event.target.value)} placeholder={mode === "existing" ? "重新输入 Key 才能保存新版本" : `粘贴 ${effectiveName} API Key`} /></label>
            <div className="wf-add-model-test-row">
              <button type="button" data-action="test" disabled={!canTest} onClick={() => void runTest()}>{testing ? "正在测试…" : "测试连接"}</button>
              {testResult?.ok ? <span className="wf-add-model-ok"><i aria-hidden="true" />连接成功，已获取 {testModels.length || discoveredModels.length} 个模型</span> : testResult && !testResult.ok ? <span className="wf-add-model-fail">连接失败，请检查 Key 和地址</span> : null}
            </div>
            <details className="wf-add-model-advanced"><summary>高级 <small>API 地址 · {effectiveBaseUrl || "未填写"}</small></summary>
              {effectiveType === "deepseek" ? <p className="wf-field-note">固定使用官方地址 {DEEPSEEK_BASE_URL}。</p> : <label>API 地址<input aria-label="模型 Base URL" value={selectedProvider ? providerAddress(selectedProvider) : baseUrl} disabled={Boolean(selectedProvider)} onChange={event => setBaseUrl(event.target.value)} placeholder="https://example.com/v1" /></label>}
            </details>
            <div className="wf-add-model-models">
              <div className="wf-add-model-models-head"><strong>选择要启用的模型</strong><small>已选 {enabledModels.length} 个</small></div>
              {candidates.length ? <ul className="wf-resource-model-checklist">{candidates.map(model => <li key={model}>
                <label className="wf-resource-checkbox"><input type="checkbox" aria-label={`启用模型 ${model}`} checked={enabledModels.includes(model)} onChange={event => toggleModel(model, event.target.checked)} />{model}</label>
                {testModels.includes(model) ? <small>从供应商获取</small> : currentModels.includes(model) ? <small>已启用</small> : null}
              </li>)}</ul> : <p className="wf-resource-empty">测试连接后会列出可用模型；也可以手动填写模型名。</p>}
              <div className="wf-resource-model-tools">
                <input aria-label="手动添加模型" value={manualModel} onChange={event => setManualModel(event.target.value)} placeholder="列表里没有？输入模型名" />
                <button type="button" onClick={addManualModel}>添加</button>
              </div>
              {testResult?.ok ? <p className="wf-field-note">连接成功。如果供应商不提供模型列表，请手动填写模型名。</p> : null}
            </div>
          </> : null}
          {feedback ? <p className={feedback.ok ? "wf-resource-feedback" : "wf-resource-feedback is-error"} role={feedback.ok ? "status" : "alert"}>{feedback.text}</p> : null}
        </div>
      </div>
      <footer className="wf-resource-modal-footer">
        <span>{summary}</span>
        <div className="wf-resource-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary" data-action="save" disabled={!canSave} title={saveIssue || undefined} onClick={() => void save()}>{saving ? "正在保存…" : "保存"}</button>
        </div>
      </footer>
    </section>
  </>;
}
