import { useState } from "react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { ConnectionTestResult, JsonValue } from "../domain/v2/types";
import type { CatalogConnection } from "./resourceModel";
import {
  addModelSummary, latestVisibleProviders, probeConnectionContent, probeConnectionRef, visibleProviderConnections,
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
  const existingRefs = [...new Set(visibleProviderConnections(providers).map(entry => entry.ref))];

  const [mode, setMode] = useState<"create" | "existing">(initialMode === "existing" && initialProvider ? "existing" : "create");
  const [presetId, setPresetId] = useState(initialPreset?.id ?? "");
  const [type, setType] = useState<string>(initialPreset?.type ?? "openai-compatible");
  const [name, setName] = useState(initialPreset?.label ?? "");
  const [ref, setRef] = useState(initialPreset ? uniqueProviderRef(providerRefFromPreset(initialPreset.id), existingRefs) : "");
  const [baseUrl, setBaseUrl] = useState(initialPreset?.baseUrl ?? "");
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
  const summary = addModelSummary({ mode, name: effectiveName, version: selectedProvider?.version ?? 0, enabledCount: enabledModels.length, addedCount });
  const canSave = !saving && !testing && !saveIssue;
  const versions = selectedProvider ? providerVersions(providers, selectedProvider.ref) : [];

  function resetTest() {
    setTestResult(null); setDiscoveredModels([]);
  }

  function choosePreset(preset: ProviderPreset) {
    setPresetId(preset.id); setType(preset.type); setName(preset.label);
    setRef(uniqueProviderRef(providerRefFromPreset(preset.id), existingRefs));
    setBaseUrl(preset.baseUrl); setEnabledModels([]); setFeedback(null); setModelSearch(""); resetTest();
  }

  function chooseMode(next: "create" | "existing") {
    setMode(next); setFeedback(null); setModelSearch(""); resetTest();
    if (next === "existing") {
      const provider = latest.find(entry => entry.ref === selectedRef) ?? latest[0];
      setSelectedRef(provider?.ref ?? "");
      setEnabledModels(provider ? providerModelRefs(provider) : []);
    } else {
      setEnabledModels([]);
    }
  }

  function chooseProvider(providerRef: string) {
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

  return <>
    <div className="wf-resource-modal-backdrop" aria-hidden="true" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} />
    <section className="wf-resource-modal" role="dialog" aria-modal="true" aria-labelledby="wf-add-model-title" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <header className="wf-resource-modal-header">
        <div>
          <h3 id="wf-add-model-title">添加模型</h3>
          <p>一个供应商一份凭据，可启用多个模型；保存后发布为固定版本，正在运行的节点不受影响。</p>
        </div>
        <button type="button" className="wf-resource-close" aria-label="关闭添加模型" onClick={onClose}>关闭</button>
      </header>
      <div className="wf-resource-modal-body">
        <nav className="wf-resource-mode-tabs" aria-label="添加方式">
          <button type="button" aria-pressed={mode === "create"} onClick={() => chooseMode("create")}>新供应商</button>
          <button type="button" aria-pressed={mode === "existing"} onClick={() => chooseMode("existing")} disabled={!latest.length}>添加到已有供应商</button>
        </nav>
        {feedback ? <p className={feedback.ok ? "wf-resource-feedback" : "wf-resource-feedback is-error"} role={feedback.ok ? "status" : "alert"}>{feedback.text}</p> : null}

        {mode === "create" ? <>
          <h4>选择预设</h4>
          <div className="wf-resource-preset-grid" aria-label="供应商预设">
            {visibleProviderPresets(localEnvironment).map(preset => <button key={preset.id} type="button" data-preset-id={preset.id} aria-pressed={presetId === preset.id} onClick={() => choosePreset(preset)}>
              <strong>{preset.label}</strong>
              <small>{preset.baseUrl || "填写自定义地址"}</small>
            </button>)}
          </div>
          {presetId ? <>
            <p className="wf-field-note">{findProviderPreset(presetId)?.hint}</p>
            <label>名称<input aria-label="供应商名称" value={name} onChange={event => setName(event.target.value)} maxLength={120} /></label>
            <label>标识<input aria-label="供应商标识" value={ref} onChange={event => setRef(event.target.value)} placeholder="例如 my_openai" /></label>
            {effectiveType === "deepseek"
              ? <p className="wf-field-note">固定使用官方地址 {DEEPSEEK_BASE_URL}。Base URL 不可修改。</p>
              : <label>Base URL<input aria-label="模型 Base URL" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://example.com/v1" /></label>}
          </> : <p className="wf-resource-empty">先选择一个预设，或选择「自定义 OpenAI 兼容」填写自己的地址。</p>}
        </> : latest.length ? <>
          {latest.length > 1 ? <label>已有供应商<select aria-label="添加到已有供应商" value={selectedRef} onChange={event => chooseProvider(event.target.value)}>
            {latest.map(provider => <option key={provider.ref} value={provider.ref}>{providerDisplayName(provider)} · {providerTypeLabel(provider)}</option>)}
          </select></label> : null}
          {selectedProvider ? <div className="wf-resource-existing-provider" data-provider-ref={selectedProvider.ref}>
            <strong>{providerDisplayName(selectedProvider)}</strong>
            <small>{providerTypeLabel(selectedProvider)} · v{selectedProvider.version} · {providerAddress(selectedProvider)}</small>
            <small>已有 {versions.length} 个版本；保存后发布 v{selectedProvider.version + 1}。</small>
          </div> : null}
        </> : <p className="wf-resource-empty">还没有可添加的模型供应商，请先创建。</p>}

        {(mode === "create" ? Boolean(presetId) : Boolean(selectedProvider)) ? <>
          <label>API Key<input aria-label="模型 API Key" type="password" autoComplete="new-password" value={credential} onChange={event => setCredential(event.target.value)} /></label>
          <small>{credentialRequired ? "API Key 只写不读；发布新版本需要重新输入。" : "本地 HTTP 供应商可以留空；凭据只写不读。"}</small>
          <div className="wf-resource-actions">
            <button type="button" data-action="test" disabled={testing || saving} onClick={() => void runTest()}>{testing ? "正在测试…" : "测试连接"}</button>
            {mode === "create" ? <small>首次测试会发布一个隐藏的临时版本并立即停用，用于拉取模型列表；保存时创建正式 v1。</small> : null}
          </div>
          {testResult ? <ResourceTestPanel result={testResult} /> : null}

          <h4>启用的模型</h4>
          <div className="wf-resource-model-tools">
            <label>搜索模型<input aria-label="搜索模型" value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder="按模型名过滤" /></label>
            <label>手动添加模型<input aria-label="手动添加模型" value={manualModel} onChange={event => setManualModel(event.target.value)} placeholder="例如 gpt-4o-mini" /></label>
            <button type="button" onClick={addManualModel}>添加</button>
          </div>
          {testResult?.ok ? <p className="wf-field-note">测试拉取到 {testModels.length} 个模型；勾选要启用的模型，也可以手动添加列表之外的模型。</p> : null}
          {candidates.length ? <ul className="wf-resource-model-checklist">{candidates.map(model => <li key={model}>
            <label className="wf-resource-checkbox"><input type="checkbox" aria-label={`启用模型 ${model}`} checked={enabledModels.includes(model)} onChange={event => toggleModel(model, event.target.checked)} />{model}</label>
            {testModels.includes(model) ? <small>从 /models 拉取</small> : null}
            {!testModels.includes(model) && currentModels.includes(model) ? <small>已启用</small> : null}
          </li>)}</ul> : <p className="wf-resource-empty">测试连接后会列出可用模型；也可以手动填写模型名。</p>}
          {enabledModels.length ? <p className="wf-resource-models">已启用：{enabledModels.join(" · ")}</p> : <p className="wf-field-note" role="status">至少启用一个模型才能保存。</p>}
        </> : null}
      </div>
      <footer className="wf-resource-modal-footer">
        <span>{summary}</span>
        <div className="wf-resource-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary" data-action="save" disabled={!canSave} title={saveIssue || undefined} onClick={() => void save()}>{saving ? "正在保存…" : mode === "create" ? "保存供应商" : `保存为 v${targetVersion}`}</button>
        </div>
      </footer>
    </section>
  </>;
}
