import { useState, type ReactNode } from "react";
import { Check, Code2, Database, KeyRound, Play, Plus, Server, Sparkles, Trash2, X } from "lucide-react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { ConnectionTestResult, JsonSchema, JsonValue, WorkflowTool } from "../domain/v2/types";
import { useExtensions, type Extensions, type FunctionVersion } from "../editor/v2/FunctionExecutionFields";
import { groupCatalogByRef, type CatalogConnection } from "./resourceModel";
import { latestVisibleProviders, providerAddress, providerBaseUrlIssue, providerDisplayName, providerModelRefs, providerPublishContent, providerTypeLabel, probeConnectionContent, probeConnectionRef } from "./providerModel";
import { findProviderPreset, providerRefFromPreset, uniqueProviderRef, visibleProviderPresets, DEEPSEEK_BASE_URL, credentialRequiredFor, normalizeBaseUrl } from "./providerPresets";
import {
  API_AUTH_TYPES, API_BODY_MODES, API_DEFAULT_URL_HINT, API_METHODS, API_PARAM_SOURCES, apiContentFromDraft, apiDisplayUrl, apiDraftFromContent, apiDraftIssue,
  apiTestArguments, emptyApiDraft, platformToolDraft, requestHeadersForDisplay, uniqueConnectionRef,
  type ApiAuthType, type ApiBodyMode, type ApiDraft, type ApiOutputField, type ApiParam,
} from "./apiResourceModel";
import "./resourceEditor.css";

export type ResourceEditorTarget =
  | { kind: "provider"; mode: "create"; presetId?: string }
  | { kind: "provider"; mode: "edit"; ref: string }
  | { kind: "api"; mode: "create"; platformTool?: WorkflowTool }
  | { kind: "api"; mode: "edit"; ref: string }
  | { kind: "function"; mode: "create"; name?: string; initial?: FunctionDraft }
  | { kind: "function"; mode: "edit"; ref: string; version?: number }
  | { kind: "mcp"; mode: "create" }
  | { kind: "mcp"; mode: "edit"; ref: string };

export type FunctionDraft = { name: string; language: "python" | "javascript"; description: string; code: string; inputSchema: JsonSchema; outputSchema: JsonSchema };

export type ResourceEditorProps = {
  environmentRef: string;
  target: ResourceEditorTarget;
  onClose: () => void;
  onSaved?: (ref: string, version: number, content?: Record<string, JsonValue>) => void;
};

type EditorTone = "model" | "api" | "fn" | "mcp";
type Feedback = { ok: boolean; text: string } | null;

function EditorFrame({ tone, icon, title, subtitle, banner, children, test, footerNote, feedback, busy, saveDisabled, onClose, onSave, saveLabel = "保存", saveSummary }: {
  tone: EditorTone;
  icon: ReactNode;
  title: string;
  subtitle: string;
  banner?: string;
  children: ReactNode;
  test: ReactNode;
  footerNote?: string;
  feedback?: Feedback;
  busy?: boolean;
  saveDisabled?: boolean;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  saveSummary?: string;
}) {
  return <>
    <div className="wf-editor-backdrop" aria-hidden="true" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} />
    <section className="wf-editor" role="dialog" aria-modal="true" aria-labelledby="wf-editor-title" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <header className="wf-editor-header">
        <div className={`wf-editor-icon is-${tone}`} aria-hidden="true">{icon}</div>
        <div className="wf-editor-title"><h2 id="wf-editor-title">{title}</h2><p>{subtitle}</p></div>
        <button type="button" className="wf-editor-iconbtn" aria-label="关闭资源编辑器" title="关闭" onClick={onClose}><X size={17}/></button>
      </header>
      {banner ? <div className="wf-editor-banner" role="status"><Server size={14} color="#3d56b8"/><span>{banner}</span></div> : null}
      <div className="wf-editor-main">
        <div className="wf-editor-form">{children}{feedback ? <p className={feedback.ok ? "wf-editor-feedback" : "wf-editor-feedback is-error"} role={feedback.ok ? "status" : "alert"}>{feedback.text}</p> : null}</div>
        <aside className="wf-editor-test" aria-label="测试">{test}</aside>
      </div>
      <footer className="wf-editor-footer">
        <small>{footerNote ?? "保存后生成新版本，正在使用旧版本的节点可在节点中升级"}{saveSummary ? ` · ${saveSummary}` : ""}</small>
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" className="primary" disabled={busy || saveDisabled} onClick={onSave}>{busy ? "正在保存…" : saveLabel}</button>
      </footer>
    </section>
  </>;
}

function Section({ title, hint, extra, children }: { title: string; hint?: string; extra?: ReactNode; children?: ReactNode }) {
  return <section className="wf-editor-section">
    <div className="wf-editor-section-head"><span className="wf-editor-accent" aria-hidden="true"/><div><h3>{title}</h3>{hint ? <p>{hint}</p> : null}</div>{extra ? <div className="wf-editor-section-extra">{extra}</div> : null}</div>
    {children ? <div className="wf-editor-section-body">{children}</div> : null}
  </section>;
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <div className="wf-editor-field"><label>{label}</label>{children}</div>;
}

/** Pick the docs link of the matching preset; existing custom gateways have no docs page. */
function providerDocsUrl(type: string, baseUrl: string): string {
  if (type === "deepseek") return findProviderPreset("deepseek")?.docsUrl ?? "";
  const address = normalizeBaseUrl(baseUrl);
  if (!address) return "";
  return visibleProviderPresets(true).find(preset => preset.docsUrl && preset.baseUrl && normalizeBaseUrl(preset.baseUrl) === address)?.docsUrl ?? "";
}

function TestStatus({ result }: { result: ConnectionTestResult }) {
  return <div className={`wf-editor-test-status${result.ok ? "" : " is-error"}`}><span className={`wf-editor-test-dot${result.ok ? "" : " is-error"}`} aria-hidden="true"/><strong>{result.ok ? "成功" : "失败"}{typeof result.elapsedMs === "number" ? ` · ${result.elapsedMs}ms` : ""}</strong></div>;
}

function ProviderEditor({ environmentRef, target, onClose, onSaved, data, refresh }: ResourceEditorProps & { target: Extract<ResourceEditorTarget, { kind: "provider" }>; data: Extensions; refresh: () => void }) {
  const providers = latestVisibleProviders(data.connections);
  const existing = target.mode === "edit" ? providers.find(provider => provider.ref === target.ref) : undefined;
  const preset = findProviderPreset(target.mode === "create" ? target.presetId ?? "deepseek" : "") ?? findProviderPreset("deepseek")!;
  const existingRefs = [...new Set((data?.connections ?? []).map(connection => connection.ref))];
  const [presetId, setPresetId] = useState(existing ? "existing" : preset.id);
  const [type, setType] = useState(existing ? String(existing.content.type ?? "deepseek") : preset.type);
  const [name, setName] = useState(existing ? providerDisplayName(existing) : preset.label);
  const [baseUrl, setBaseUrl] = useState(existing ? providerAddress(existing) : preset.baseUrl);
  const [models, setModels] = useState<string[]>(existing ? providerModelRefs(existing) : preset.id === "deepseek" ? ["deepseek-flash", "deepseek-reasoner"] : []);
  const [manualModel, setManualModel] = useState("");
  const [credential, setCredential] = useState("");
  const [testModel, setTestModel] = useState(existing ? providerModelRefs(existing)[0] ?? "" : preset.id === "deepseek" ? "deepseek-flash" : "");
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [discovered, setDiscovered] = useState<string[]>([]);

  const ref = existing?.ref ?? uniqueProviderRef(providerRefFromPreset(presetId === "existing" ? "deepseek" : presetId), existingRefs);
  const targetVersion = existing ? existing.version + 1 : 1;
  const candidates = [...new Set([...models, ...discovered])];
  const credentialNeeded = credentialRequiredFor(type, baseUrl);
  const docsUrl = providerDocsUrl(type, baseUrl);
  // Worker: DeepSeek only accepts the official base URL, while OpenAI-compatible gateways need one.
  const addressIssue = type === "deepseek" ? "" : providerBaseUrlIssue(type, baseUrl, import.meta.env.DEV);
  const testIssue = addressIssue || (!testModel ? "请先选择或添加一个模型。" : credentialNeeded && !credential.trim() && !existing ? "请先填写 API Key。" : "");
  const saveIssue = addressIssue || (!name.trim() ? "请填写名称。" : !models.length ? "请至少启用一个模型。" : credentialNeeded && !credential.trim() ? "保存新版本需要重新填写 API Key（只写不读）。" : "");

  function choosePreset(id: string) {
    const next = findProviderPreset(id);
    if (!next) return;
    setPresetId(id); setType(next.type); setName(next.label); setBaseUrl(next.baseUrl);
    setModels(next.id === "deepseek" ? ["deepseek-flash", "deepseek-reasoner"] : []);
    setTestModel(next.id === "deepseek" ? "deepseek-flash" : ""); setTestResult(null); setDiscovered([]); setFeedback(null);
  }

  function addManualModel() {
    const value = manualModel.trim();
    if (!value) return;
    setModels(current => current.includes(value) ? current : [...current, value]);
    setTestModel(current => current || value);
    setManualModel("");
  }

  async function test() {
    if (testIssue) { setFeedback({ ok: false, text: testIssue }); return; }
    setBusy(true); setFeedback(null); setTestResult(null);
    const probe = existing ? "" : probeConnectionRef();
    try {
      if (existing) {
        setTestResult(await workflowApiV2.testExtension(environmentRef, { ref: existing.ref, version: existing.version, testModel, testMessage: "请用一句话确认连接可用。" }));
      } else {
        const content = probeConnectionContent({ type, baseUrl });
        content.modelRefs = [...new Set([...models, testModel])];
        await workflowApiV2.extension(environmentRef, { action: "publish", kind: "connection", ref: probe, version: 1, content, credential });
        setTestResult(await workflowApiV2.testExtension(environmentRef, { ref: probe, version: 1, testModel, testMessage: "请用一句话确认连接可用。" }));
      }
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally {
      if (probe) { try { await workflowApiV2.extension(environmentRef, { action: "disable", kind: "connection", ref: probe, version: 1 }); } catch { /* probe is hidden even if cleanup fails */ } }
      setBusy(false);
    }
  }

  async function save() {
    if (saveIssue) { setFeedback({ ok: false, text: saveIssue }); return; }
    setBusy(true); setFeedback(null);
    const content: Record<string, JsonValue> = existing
      ? providerPublishContent(existing, models, {
          type,
          name: name.trim(),
          baseUrl: type === "deepseek" ? DEEPSEEK_BASE_URL : normalizeBaseUrl(baseUrl),
        })
      : type === "deepseek"
        ? { type: "deepseek", name: name.trim(), baseUrl: DEEPSEEK_BASE_URL, modelRefs: [...models] }
        : { type: "openai-compatible", name: name.trim(), baseUrl: normalizeBaseUrl(baseUrl), modelRefs: [...models] };
    try {
      await workflowApiV2.extension(environmentRef, { action: "publish", kind: "connection", ref, version: targetVersion, content, credential });
      refresh(); onSaved?.(ref, targetVersion, content); onClose();
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusy(false); }
  }

  return <EditorFrame tone="model" icon={<Sparkles size={17}/>} title={existing ? "编辑模型供应商" : "添加模型供应商"} subtitle={`${name || "未命名供应商"} · ${existing ? "已有供应商" : "从资源中心添加"}`} footerNote="保存后生成新版本，正在使用旧版本的节点可在节点中升级" test={<TestPane title="测试" hint="选一个模型发一条测试消息，不会保存。">
      <div>
        <label htmlFor="wf-provider-test-model">测试模型</label>
        <select id="wf-provider-test-model" aria-label="测试模型" value={testModel} onChange={event => setTestModel(event.target.value)}><option value="">选择模型</option>{candidates.map(model => <option key={model} value={model}>{model}</option>)}</select>
      </div>
      <button type="button" className="wf-editor-test-primary" disabled={busy || Boolean(testIssue)} title={testIssue || undefined} onClick={() => void test()}><Play size={12}/>{busy ? "正在测试…" : "发送测试消息"}</button>
      {testResult ? <div className="wf-editor-test-result">
        <TestStatus result={testResult}/>
        {testResult.reply ? <><div className="wf-editor-test-block"><h4>回复首句</h4><div className="wf-editor-test-line"><span>{testResult.reply}</span></div></div><div className="wf-editor-test-foot">只显示首句，完整回复不会保存</div></> : null}
        {!testResult.ok && testResult.error ? <div className="wf-editor-test-block"><h4>错误</h4><div className="wf-editor-test-line"><span>{testResult.error.message}</span></div></div> : null}
      </div> : null}
    </TestPane>} feedback={feedback} busy={busy} saveDisabled={Boolean(saveIssue)} onClose={onClose} onSave={() => void save()}>
    <Section title="供应商" hint="选择一家，保存后就是一个独立的模型供应商">
      <div className="wf-editor-provider-grid" role="group" aria-label="选择模型供应商">
        {existing ? <button type="button" className="wf-editor-provider" aria-pressed={presetId === "existing"} onClick={() => setPresetId("existing")}><span className="wf-editor-provider-mark">{name.slice(0, 1)}</span><span>{name}</span><Check size={14}/></button> : null}
        {visibleProviderPresets(true).map(item => <button type="button" key={item.id} className="wf-editor-provider" aria-pressed={!existing && presetId === item.id} onClick={() => choosePreset(item.id)}><span className="wf-editor-provider-mark">{item.label.slice(0, 1)}</span><span>{item.id === "custom-openai" ? "OpenAI 兼容" : item.label}</span>{!existing && presetId === item.id ? <Check size={14}/> : null}</button>)}
      </div>
    </Section>
    <Section title="连接" hint="API 地址和 Key 只保存在这个供应商里，不会写进节点" extra={<span className="wf-editor-hint">{credentialNeeded ? "需要凭据" : "本地地址无需凭据"}</span>}>
      <Field label="API 地址">
        <input
          aria-label="模型 Base URL"
          aria-invalid={Boolean(addressIssue)}
          aria-readonly={type === "deepseek" ? "true" : undefined}
          value={type === "deepseek" ? DEEPSEEK_BASE_URL : baseUrl}
          readOnly={type === "deepseek"}
          onChange={event => setBaseUrl(event.target.value)}
          placeholder="https://api.example.com/v1"
        />
        {addressIssue ? <span className="wf-editor-field-error" role="alert">{addressIssue}</span> : null}
      </Field>
      {type === "deepseek" ? <p className="wf-editor-hint">DeepSeek 固定使用官方地址。使用代理或其他地址请选择「OpenAI 兼容」。</p> : null}
      <Field label={<>{name || "供应商"} API Key{docsUrl ? <> <a className="wf-editor-docs-link" href={docsUrl} target="_blank" rel="noreferrer">去哪里获取</a></> : null}</>}><input aria-label="模型 API Key" type="password" autoComplete="new-password" value={credential} onChange={event => setCredential(event.target.value)} placeholder={existing ? "重新输入 Key 才能保存新版本" : `粘贴 ${name || "供应商"} API Key`}/></Field>
      <p className="wf-editor-hint">密钥只用于调用这个供应商，页面上不会再次显示完整内容。</p>
    </Section>
    <Section title="可用模型" hint={`勾选要出现在节点里的模型，已选 ${models.length} 个`}>
      <div className="wf-editor-model-list">
        {candidates.length ? candidates.map(model => <label key={model} className="wf-editor-model-row"><input type="checkbox" aria-label={`启用模型 ${model}`} checked={models.includes(model)} onChange={event => setModels(current => event.target.checked ? (current.includes(model) ? current : [...current, model]) : current.filter(item => item !== model))}/><span><code>{model}</code><small>{discovered.includes(model) ? "从供应商获取" : "已启用"}</small></span></label>) : <div className="wf-editor-model-row"><span><small>测试连接后会列出可用模型；也可以手动填写模型名。</small></span></div>}
        <div className="wf-editor-model-add"><input aria-label="手动添加模型" value={manualModel} onChange={event => setManualModel(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addManualModel(); } }} placeholder="列表里没有？输入模型名"/><button type="button" onClick={addManualModel}>添加</button></div>
      </div>
    </Section>
  </EditorFrame>;
}

function TestPane({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return <><div><h3>{title}</h3><p>{hint}</p></div>{children}<div className="wf-editor-test-note">测试请求只读，不会生成运行记录。</div></>;
}

function ApiEditor({ environmentRef, target, onClose, onSaved, data, refresh }: ResourceEditorProps & { target: Extract<ResourceEditorTarget, { kind: "api" }>; data: Extensions; refresh: () => void }) {
  const connections = data.connections;
  const existing = target.mode === "edit" ? data?.connections.filter(connection => connection.ref === target.ref && !connection.disabled).sort((left, right) => right.version - left.version)[0] : undefined;
  const platformTool = target.mode === "create" ? target.platformTool : undefined;
  const initial = platformTool ? platformToolDraft(platformTool) : existing ? apiDraftFromContent(existing.content) : emptyApiDraft();
  const [draft, setDraft] = useState<ApiDraft>(initial);
  const [tab, setTab] = useState<"params" | "headers" | "body" | "auth" | "settings">("params");
  const [testValues, setTestValues] = useState<Record<string, string>>(() => Object.fromEntries(initial.params.filter(param => param.source === "node").map(param => [param.name, param.name === "query" ? "AI agents" : ""])));
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testPane, setTestPane] = useState<"response" | "headers">("response");
  const [confirmEffect, setConfirmEffect] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const existingRefs = [...new Set(connections.map(connection => connection.ref))];
  const ref = existing?.ref ?? (platformTool ? uniqueConnectionRef(platformTool.ref || "hn_search", existingRefs) : uniqueConnectionRef(draft.name || "api_connection", existingRefs));
  const version = existing ? existing.version + 1 : 1;
  const issue = apiDraftIssue(draft);
  const credentialNeeded = draft.auth.type !== "none";
  const saveIssue = issue || (credentialNeeded && !draft.credential.trim() ? "保存新版本需要重新填写凭据（只写不读）。" : "");
  const content = apiContentFromDraft(draft);
  const requestHeaders = requestHeadersForDisplay(content, credentialNeeded);
  const testIssue = issue || (draft.method !== "GET" && !confirmEffect ? "写入请求测试前，请勾选允许修改外部数据。" : "");

  function update(patch: Partial<ApiDraft>) { setDraft(current => ({ ...current, ...patch })); setFeedback(null); }
  function updateParam(index: number, patch: Partial<ApiParam>) { setDraft(current => ({ ...current, params: current.params.map((param, at) => at === index ? { ...param, ...patch } : param) })); }
  function updateOutput(index: number, patch: Partial<ApiOutputField>) { setDraft(current => ({ ...current, outputMap: current.outputMap.map((field, at) => at === index ? { ...field, ...patch } : field) })); }
  function addParam() { const index = draft.params.length + 1; update({ params: [...draft.params, { name: `param${index}`, source: "node", value: "", required: true, description: "" }] }); }

  async function test() {
    if (testIssue) { setFeedback({ ok: false, text: testIssue }); return; }
    setBusy(true); setFeedback(null); setTestResult(null);
    const probe = probeConnectionRef();
    try {
      const baseSettings = content.settings && typeof content.settings === "object" && !Array.isArray(content.settings) ? content.settings : {};
      const probeContent = { ...content, name: `连接测试 ${draft.name || ""}`.trim(), auth: draft.auth, settings: { ...baseSettings, timeoutMs: 15000 } };
      await workflowApiV2.extension(environmentRef, { action: "publish", kind: "connection", ref: probe, version: 1, content: probeContent, credential: draft.credential });
      setTestResult(await workflowApiV2.testExtension(environmentRef, { ref: probe, version: 1, arguments: apiTestArguments(draft, testValues), confirmExternalEffect: confirmEffect }));
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally {
      try { await workflowApiV2.extension(environmentRef, { action: "disable", kind: "connection", ref: probe, version: 1 }); } catch { /* hidden probe */ }
      setBusy(false);
    }
  }

  async function save() {
    if (saveIssue) { setFeedback({ ok: false, text: saveIssue }); return; }
    setBusy(true); setFeedback(null);
    try {
      await workflowApiV2.extension(environmentRef, { action: "publish", kind: "connection", ref, version, content, credential: draft.credential });
      refresh(); onSaved?.(ref, version, content); onClose();
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusy(false); }
  }

  const parsed = parsePreview(testResult?.preview);
  const hitTitles = extractHitTitles(parsed) ?? extractPreviewTitles(testResult?.preview);
  return <EditorFrame tone="api" icon={<Server size={17}/>} title={existing || platformTool ? "编辑 API 连接" : "新建 API 连接"} subtitle={`${draft.name || "未命名连接"} · ${platformTool ? "平台提供的连接" : existing ? "编辑后发布新版本" : "从资源中心新建"}`} banner={platformTool ? "这是平台提供的连接，保存后会成为你自己的副本。" : undefined} test={<TestPane title="测试" hint="用真实请求验证这个连接，不会保存。">
      {draft.params.filter(param => param.source === "node").map(param => <div key={param.name}><label htmlFor={`wf-api-test-${param.name}`}>测试参数 · <code>{param.name}</code></label><input id={`wf-api-test-${param.name}`} aria-label={`测试参数 ${param.name}`} value={testValues[param.name] ?? ""} onChange={event => setTestValues(current => ({ ...current, [param.name]: event.target.value }))}/></div>)}
      {draft.method !== "GET" ? <label className="wf-editor-hint"><input type="checkbox" checked={confirmEffect} onChange={event => setConfirmEffect(event.target.checked)}/> 允许本次测试修改外部数据</label> : null}
      <button type="button" className="wf-editor-test-primary" disabled={busy || Boolean(testIssue)} title={testIssue || undefined} onClick={() => void test()}><Play size={12}/>{busy ? "正在发送…" : "发送测试请求"}</button>
      {testResult ? <div className="wf-editor-test-result">
        <div className={`wf-editor-test-status${testResult.ok ? "" : " is-error"}`}><span className={`wf-editor-test-dot${testResult.ok ? "" : " is-error"}`} aria-hidden="true"/><strong>{testResult.status ?? (testResult.ok ? 200 : "失败")} {testResult.ok ? "OK" : ""}</strong>{typeof testResult.elapsedMs === "number" ? <small>· {testResult.elapsedMs}ms</small> : null}{hitTitles ? <small>· {hitTitles.length} 条</small> : null}</div>
        <div className="wf-editor-test-url">{draft.method} {draft.url}</div>
        <div className="wf-editor-test-switch"><div role="group" aria-label="测试结果视图"><button type="button" aria-pressed={testPane === "response"} onClick={() => setTestPane("response")}>响应</button><button type="button" aria-pressed={testPane === "headers"} onClick={() => setTestPane("headers")}>请求头</button></div><span style={{ flex: 1 }}/><span style={{ fontSize: 9.5, color: "#596a83" }}>已脱敏</span></div>
        {testPane === "response" ? <div className="wf-editor-test-block">
          {hitTitles ? <><h4>前 {Math.min(3, hitTitles.length)} 条标题</h4>{hitTitles.slice(0, 3).map((title, index) => <div className="wf-editor-test-line" key={index}><span className="is-rank">{index + 1}</span><span>{title}</span></div>)}<div className="wf-editor-test-foot">已隐藏作者、链接和原始响应</div></> : <><h4>响应预览</h4><div className="wf-editor-test-line"><span>{testResult.preview || "响应没有可显示内容"}</span></div></>}
        </div> : <div className="wf-editor-test-block"><h4>请求头 · {requestHeaders.length}</h4>{requestHeaders.map(header => <div className="wf-editor-test-line" key={`${header.name}-${header.value}`}><code>{header.name}</code><span>{header.value}</span></div>)}<div className="wf-editor-test-foot">认证凭据只保存在连接里</div></div>}
      </div> : null}
    </TestPane>} feedback={feedback} busy={busy} saveDisabled={Boolean(saveIssue)} onClose={onClose} onSave={() => void save()}>
    <Section title="基础信息" hint="名称和说明会显示在资源面板与节点里">
      <div className="wf-editor-grid-2">
        <Field label="名称"><input aria-label="连接名称" value={draft.name} onChange={event => update({ name: event.target.value })}/></Field>
        <Field label="说明"><input aria-label="连接说明" value={draft.description} onChange={event => update({ description: event.target.value })}/></Field>
      </div>
    </Section>
    <Section title="请求" hint={API_DEFAULT_URL_HINT}>
      <div className="wf-editor-request-row">
        <select aria-label="请求方法" value={draft.method} onChange={event => update({ method: event.target.value, ...(event.target.value === "GET" && draft.body.mode !== "none" ? { body: { ...draft.body, mode: "none" as ApiBodyMode } } : {}) })}>{API_METHODS.map(method => <option key={method}>{method}</option>)}</select>
        <input aria-label="请求 URL" value={draft.url} onChange={event => update({ url: event.target.value })} placeholder="https://api.example.com/v1/search"/>
      </div>
      <div role="tablist" aria-label="请求配置" className="wf-editor-tabs">
        <TabButton active={tab === "params"} onClick={() => setTab("params")} label="Params" count={draft.params.length}/>
        <TabButton active={tab === "headers"} onClick={() => setTab("headers")} label="Headers" count={draft.headers.length} muted/>
        <TabButton active={tab === "body"} onClick={() => setTab("body")} label="Body"/>
        <TabButton active={tab === "auth"} onClick={() => setTab("auth")} label="认证"/>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} label="设置"/>
      </div>
      {tab === "params" ? <>
        <div className="wf-editor-param-head"><span className="wf-editor-col-name">参数名</span><span className="wf-editor-col-source">值来源</span><span className="wf-editor-col-value">值</span><span className="wf-editor-col-required">必填</span><span className="wf-editor-col-desc">说明</span><span className="wf-editor-col-action" aria-hidden="true"/></div>
        {draft.params.map((param, index) => <div className="wf-editor-param-row" key={`${param.name}-${index}`}>
          <input className="wf-editor-col-name" aria-label={`参数名 ${index + 1}`} title={param.name || undefined} value={param.name} onChange={event => updateParam(index, { name: event.target.value })}/>
          <span className="wf-editor-col-source"><select aria-label={`${param.name || "参数"} 的值来源`} value={param.source} onChange={event => updateParam(index, { source: event.target.value as ApiParam["source"] })}>{API_PARAM_SOURCES.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select></span>
          <span className="wf-editor-col-value"><input aria-label={`${param.name || "参数"} 的值`} value={param.source === "node" ? "" : param.value} readOnly={param.source === "node"} placeholder={param.source === "node" ? "由节点传入" : ""} onChange={event => updateParam(index, { value: event.target.value })}/></span>
          <span className="wf-editor-col-required"><input type="checkbox" aria-label={`${param.name || "参数"} 必填`} checked={param.required} onChange={event => updateParam(index, { required: event.target.checked })}/></span>
          <span className="wf-editor-col-desc"><input aria-label={`${param.name || "参数"} 说明`} value={param.description} onChange={event => updateParam(index, { description: event.target.value })}/></span>
          <button type="button" className="wf-editor-remove" aria-label={`删除参数 ${param.name}`} onClick={() => update({ params: draft.params.filter((_, at) => at !== index) })}><Trash2 size={13}/></button>
        </div>)}
        <div className="wf-editor-actions"><button type="button" className="wf-editor-addrow" onClick={addParam}><Plus size={11}/>添加参数</button></div>
      </> : null}
      {tab === "headers" ? <>
        <div className="wf-editor-param-head"><span className="wf-editor-col-name">名称</span><span className="wf-editor-col-value">值</span><span className="wf-editor-col-action" aria-hidden="true"/></div>
        {draft.headers.map((header, index) => <div className="wf-editor-param-row" key={index}>
          <input className="wf-editor-col-name" aria-label={`请求头名称 ${index + 1}`} value={header.name} onChange={event => update({ headers: draft.headers.map((row, at) => at === index ? { ...row, name: event.target.value } : row) })}/>
          <span className="wf-editor-col-value"><input aria-label={`请求头值 ${index + 1}`} value={header.value} onChange={event => update({ headers: draft.headers.map((row, at) => at === index ? { ...row, value: event.target.value } : row) })}/></span>
          <button type="button" className="wf-editor-remove" aria-label={`删除请求头 ${header.name}`} onClick={() => update({ headers: draft.headers.filter((_, at) => at !== index) })}><Trash2 size={13}/></button>
        </div>)}
        <div className="wf-editor-actions"><button type="button" className="wf-editor-addrow" onClick={() => update({ headers: [...draft.headers, { name: "", value: "" }] })}><Plus size={11}/>添加请求头</button></div>
      </> : null}
      {tab === "body" ? <div className="wf-editor-grid-2">
        <Field label="Body 类型"><select aria-label="Body 类型" value={draft.body.mode} onChange={event => update({ body: { ...draft.body, mode: event.target.value as ApiBodyMode } })}>{API_BODY_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></Field>
        <div className="wf-editor-field"><label>Body 内容</label><textarea aria-label="Body 内容" rows={4} disabled={draft.body.mode === "none"} value={draft.body.text} onChange={event => update({ body: { ...draft.body, text: event.target.value } })} placeholder={draft.body.mode === "json" ? '{"query": "{{query}}"}' : "name=value（每行一个）"}/></div>
      </div> : null}
      {tab === "auth" ? <div className="wf-editor-grid-2">
        <Field label="认证方式"><select aria-label="认证方式" value={draft.auth.type} onChange={event => update({ auth: { ...draft.auth, type: event.target.value as ApiAuthType } })}>{API_AUTH_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></Field>
        {(draft.auth.type === "api-key-header" || draft.auth.type === "api-key-query") ? <Field label="凭据名称"><input aria-label="凭据名称" value={draft.auth.name} onChange={event => update({ auth: { ...draft.auth, name: event.target.value } })} placeholder={draft.auth.type === "api-key-header" ? "X-API-Key" : "api_key"}/></Field> : null}
        {draft.auth.type !== "none" ? <Field label="凭据"><input aria-label="连接凭据" type="password" autoComplete="new-password" value={draft.credential} onChange={event => update({ credential: event.target.value })} placeholder={existing?.hasCredential ? "重新输入凭据才能保存新版本" : "只保存在服务端，不回显"}/></Field> : null}
        <p className="wf-editor-hint">认证凭据只保存在连接里；测试请求和节点输出都不会包含完整凭据。</p>
      </div> : null}
      {tab === "settings" ? <div className="wf-editor-grid-3">
        <Field label="超时（秒）"><input aria-label="超时秒数" type="number" min={1} max={120} value={Math.round(draft.settings.timeoutMs / 1000)} onChange={event => update({ settings: { ...draft.settings, timeoutMs: Math.max(1, Number(event.target.value)) * 1000 } })}/></Field>
        <Field label="重试"><input aria-label="重试次数" type="number" min={0} max={3} value={draft.settings.retries} onChange={event => update({ settings: { ...draft.settings, retries: Math.max(0, Math.min(3, Number(event.target.value))) } })}/></Field>
        <Field label="结果取值路径"><input aria-label="结果取值路径" value={draft.settings.resultPath} onChange={event => update({ settings: { ...draft.settings, resultPath: event.target.value } })} placeholder="留空表示整个响应"/></Field>
        <p className="wf-editor-hint">超时按节点本次执行的上限截断；只有读取连接会自动重试。</p>
      </div> : null}
    </Section>
    <Section title="响应" hint="节点输出字段，留空则把整个响应作为输出" extra={<span className="wf-editor-hint">返回内容类型 · JSON 自动识别</span>}>
      <div className="wf-editor-table-head wf-editor-cols-output"><span>字段名</span><span>取值位置</span><span>类型</span></div>
      {draft.outputMap.map((field, index) => <div className="wf-editor-table-row wf-editor-cols-output" key={index}>
        <input aria-label={`输出字段名 ${index + 1}`} value={field.name} onChange={event => updateOutput(index, { name: event.target.value })}/>
        <input aria-label={`输出字段取值位置 ${index + 1}`} value={field.path} onChange={event => updateOutput(index, { path: event.target.value })} placeholder="例如 hits 或 data.items"/>
        <select aria-label={`输出字段类型 ${index + 1}`} value={field.type} onChange={event => updateOutput(index, { type: event.target.value })}><option value="text">文本</option><option value="number">数字</option><option value="array">数组</option><option value="boolean">布尔</option><option value="object">对象</option></select>
      </div>)}
      <div className="wf-editor-actions"><button type="button" className="wf-editor-addrow" onClick={() => update({ outputMap: [...draft.outputMap, { name: "", path: "", type: "text" }] })}><Plus size={11}/>添加字段</button></div>
    </Section>
  </EditorFrame>;
}

function TabButton({ active, onClick, label, count, muted }: { active: boolean; onClick: () => void; label: string; count?: number; muted?: boolean }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick}>{label}{typeof count === "number" ? <span className={`wf-editor-count${muted ? " is-muted" : ""}`}>{count}</span> : null}</button>;
}

function parsePreview(preview: string | undefined): JsonValue | undefined {
  if (!preview) return undefined;
  try { return JSON.parse(preview) as JsonValue; } catch { return undefined; }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
}

/** Truncated 4KB JSON is still enough to show the first few search titles without echoing authors or links. */
function extractPreviewTitles(preview: string | undefined): string[] | undefined {
  if (!preview) return undefined;
  const titles: string[] = [];
  for (const match of preview.matchAll(/"title":\{[^}]*?"value":"((?:[^"\\]|\\.)*)"/g)) {
    try { titles.push(stripHtml(String(JSON.parse(`"${match[1]}"`)))); } catch { titles.push(stripHtml(match[1])); }
  }
  if (!titles.length) for (const match of preview.matchAll(/"title":"((?:[^"\\]|\\.)*)"/g)) {
    try { titles.push(stripHtml(String(JSON.parse(`"${match[1]}"`)))); } catch { titles.push(stripHtml(match[1])); }
  }
  return titles.length ? titles : undefined;
}

function extractHitTitles(value: JsonValue | undefined): string[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const hits = (value as Record<string, JsonValue>).hits;
  if (!Array.isArray(hits)) return undefined;
  return hits.map(hit => stripHtml(hit && typeof hit === "object" && !Array.isArray(hit) ? String((hit as Record<string, JsonValue>).title ?? (hit as Record<string, JsonValue>).story_title ?? "未命名结果") : String(hit)));
}

type FunctionCatalogEntry = FunctionVersion & { code?: string; inputSchema?: JsonSchema; outputSchema?: JsonSchema; description?: string };

function schemaFields(schema: JsonSchema | undefined): { name: string; type: string; description: string }[] {
  const properties = schema && typeof schema === "object" && schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? schema.properties : {};
  return Object.entries(properties).map(([name, property]) => {
    const value = property && typeof property === "object" && !Array.isArray(property) ? property as Record<string, JsonValue> : {};
    const type = String(value.type ?? "text");
    return { name, type: type === "array" ? "列表" : type === "number" || type === "integer" ? "数字" : type === "boolean" ? "布尔" : "文本", description: String(value.description ?? "") };
  });
}

function fieldsToSchema(fields: { name: string; type: string; description: string }[], kind: "input" | "output"): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const field of fields) {
    if (!field.name.trim()) continue;
    properties[field.name.trim()] = {
      type: field.type === "列表" ? "array" : field.type === "数字" ? "number" : field.type === "布尔" ? "boolean" : "string",
      ...(field.type === "列表" ? { items: {} } : {}),
      ...(field.description.trim() ? { description: field.description.trim() } : {}),
    };
  }
  return { type: "object", properties, ...(kind === "input" ? { required: Object.keys(properties) } : {}) };
}

function FunctionEditor({ environmentRef, target, onClose, onSaved, data, refresh }: ResourceEditorProps & { target: Extract<ResourceEditorTarget, { kind: "function" }>; data: Extensions; refresh: () => void }) {
  const functions = (data.functions ?? []) as FunctionCatalogEntry[];
  const existing = target.mode === "edit" ? functions.filter(fn => fn.ref === target.ref && (!target.version || fn.version === target.version)).sort((left, right) => right.version - left.version)[0] : undefined;
  const initial: FunctionDraft = target.mode === "create"
    ? target.initial ?? { name: target.name ?? "", language: "python", description: "", code: 'def process(input, context):\n    return {"value": input.get("value", 0)}', inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] }, outputSchema: { type: "object", properties: { value: { type: "string" } } } }
    : {
      name: String(existing?.name ?? existing?.ref ?? ""),
      language: existing?.language === "javascript" ? "javascript" : "python",
      description: String(existing?.description ?? ""),
      code: String(existing?.code ?? ""),
      inputSchema: existing?.inputSchema ?? { type: "object", properties: {} },
      outputSchema: existing?.outputSchema ?? { type: "object", properties: {} },
    };
  const [name, setName] = useState(initial.name);
  const [language, setLanguage] = useState<"python" | "javascript">(initial.language);
  const [description, setDescription] = useState(initial.description);
  const [code, setCode] = useState(initial.code);
  const [inputs, setInputs] = useState(() => schemaFields(initial.inputSchema));
  const [outputs, setOutputs] = useState(() => schemaFields(initial.outputSchema));
  const [testJson, setTestJson] = useState("{\n  \"value\": \"example\"\n}");
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const existingRefs = [...new Set((data?.functions ?? []).map(fn => fn.ref))];
  const ref = existing?.ref ?? uniqueConnectionRef(name || "function", existingRefs, "function");
  const version = existing ? existing.version + 1 : 1;
  const saveIssue = !name.trim() ? "请填写函数名称。" : !code.trim() ? "请填写函数代码。" : "";

  function draftContent(): Record<string, JsonValue> {
    return { purpose: "node", name: name.trim(), language, description: description.trim(), code, inputSchema: fieldsToSchema(inputs, "input"), outputSchema: fieldsToSchema(outputs, "output") };
  }

  async function test() {
    let args: JsonValue;
    try { args = JSON.parse(testJson) as JsonValue; } catch { setFeedback({ ok: false, text: "输入不是有效的 JSON。" }); return; }
    setBusy(true); setFeedback(null); setTestResult(null);
    try {
      setTestResult(await workflowApiV2.testExtension(environmentRef, { ref, version: existing?.version ?? 1, kind: "function", arguments: args && typeof args === "object" && !Array.isArray(args) ? args as Record<string, JsonValue> : { value: args as JsonValue }, content: draftContent() }));
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusy(false); }
  }

  async function save() {
    if (saveIssue) { setFeedback({ ok: false, text: saveIssue }); return; }
    setBusy(true); setFeedback(null);
    try {
      const content = draftContent();
      await workflowApiV2.extension(environmentRef, { action: "publish", kind: "function", ref, version, content });
      refresh(); onSaved?.(ref, version, content); onClose();
    } catch (reason) {
      setFeedback({ ok: false, text: workflowErrorMessage(reason) });
    } finally { setBusy(false); }
  }

  return <EditorFrame tone="fn" icon={<Code2 size={17}/>} title={existing ? "编辑函数" : "新建函数"} subtitle={`${name || "未命名函数"} · ${existing ? "本流程函数" : "从资源中心新建"}`} test={<TestPane title="测试" hint="用一组输入运行函数，不会保存。">
      <div><label htmlFor="wf-function-test-json">输入 JSON</label><textarea id="wf-function-test-json" aria-label="测试输入 JSON" rows={5} value={testJson} onChange={event => setTestJson(event.target.value)}/></div>
      <button type="button" className="wf-editor-test-primary" disabled={busy} onClick={() => void test()}><Play size={12}/>{busy ? "正在运行…" : "运行函数"}</button>
      {testResult ? <div className="wf-editor-test-result"><TestStatus result={testResult}/>{testResult.output !== undefined ? <div className="wf-editor-test-block"><h4>输出</h4><div className="wf-editor-test-line"><span>{JSON.stringify(testResult.output)}</span></div></div> : null}{testResult.error ? <div className="wf-editor-test-block"><h4>错误</h4><div className="wf-editor-test-line"><span>{testResult.error.message}</span></div></div> : null}<div className="wf-editor-test-foot">只显示字段名和摘要，完整返回值不会保存</div></div> : null}
    </TestPane>} feedback={feedback} busy={busy} saveDisabled={Boolean(saveIssue)} onClose={onClose} onSave={() => void save()}>
    <Section title="基础信息" hint="名称和说明会显示在节点里">
      <div className="wf-editor-grid-3">
        <Field label="名称"><input aria-label="函数名称" value={name} onChange={event => setName(event.target.value)}/></Field>
        <Field label="语言"><select aria-label="函数语言" value={language} onChange={event => setLanguage(event.target.value as "python" | "javascript")}><option value="python">Python</option><option value="javascript">JavaScript</option></select></Field>
        <Field label="说明"><input aria-label="函数说明" value={description} onChange={event => setDescription(event.target.value)}/></Field>
      </div>
    </Section>
    <Section title="代码" hint={`可用 ${inputs.map(field => field.name).filter(Boolean).join("、") || "输入"} 输入`} extra={<span className="wf-editor-hint">保存时校验语法</span>}>
      <div className="wf-editor-code"><div className="wf-editor-code-head"><strong>{language === "python" ? "Python" : "JavaScript"}</strong><span>实现 process(input, context)</span><span style={{ flex: 1 }}/><span>写入时返回对象字段</span></div><textarea aria-label="函数代码" spellCheck={false} value={code} onChange={event => setCode(event.target.value)}/></div>
    </Section>
    <Section title="输入参数" hint="这些字段作为函数输入，由节点传入" extra={<button type="button" className="wf-editor-addrow" onClick={() => setInputs([...inputs, { name: "", type: "文本", description: "" }])}><Plus size={11}/>添加参数</button>}>
      <div className="wf-editor-table-head wf-editor-cols-3"><span>参数名</span><span>类型</span><span>说明</span></div>
      {inputs.map((field, index) => <div className="wf-editor-table-row wf-editor-cols-3" key={index}><input aria-label={`输入参数名 ${index + 1}`} value={field.name} onChange={event => setInputs(inputs.map((row, at) => at === index ? { ...row, name: event.target.value } : row))}/><select aria-label={`输入参数类型 ${index + 1}`} value={field.type} onChange={event => setInputs(inputs.map((row, at) => at === index ? { ...row, type: event.target.value } : row))}><option>文本</option><option>数字</option><option>布尔</option><option>列表</option></select><input aria-label={`输入参数说明 ${index + 1}`} value={field.description} onChange={event => setInputs(inputs.map((row, at) => at === index ? { ...row, description: event.target.value } : row))}/></div>)}
      {!inputs.length ? <p className="wf-editor-hint">没有输入参数。</p> : null}
    </Section>
    <Section title="输出字段" hint="函数返回的对象字段" extra={<button type="button" className="wf-editor-addrow" onClick={() => setOutputs([...outputs, { name: "", type: "文本", description: "" }])}><Plus size={11}/>添加字段</button>}>
      <div className="wf-editor-table-head wf-editor-cols-3"><span>字段名</span><span>类型</span><span>说明</span></div>
      {outputs.map((field, index) => <div className="wf-editor-table-row wf-editor-cols-3" key={index}><input aria-label={`输出字段名 ${index + 1}`} value={field.name} onChange={event => setOutputs(outputs.map((row, at) => at === index ? { ...row, name: event.target.value } : row))}/><select aria-label={`输出字段类型 ${index + 1}`} value={field.type} onChange={event => setOutputs(outputs.map((row, at) => at === index ? { ...row, type: event.target.value } : row))}><option>文本</option><option>数字</option><option>布尔</option><option>列表</option></select><input aria-label={`输出字段说明 ${index + 1}`} value={field.description} onChange={event => setOutputs(outputs.map((row, at) => at === index ? { ...row, description: event.target.value } : row))}/></div>)}
    </Section>
  </EditorFrame>;
}

function McpEditor({ environmentRef, target, onClose, onSaved, data, refresh }: ResourceEditorProps & { target: Extract<ResourceEditorTarget, { kind: "mcp" }>; data: Extensions; refresh: () => void }) {
  const existing = target.mode === "edit" ? data.connections.filter(connection => connection.ref === target.ref && !connection.disabled).sort((left, right) => right.version - left.version)[0] : undefined;
  const [name, setName] = useState(existing ? String(existing.content.name ?? existing.ref) : "");
  const [url, setUrl] = useState(existing ? String(existing.content.url ?? "") : "");
  const [toolsText, setToolsText] = useState(existing ? (Array.isArray(existing.content.allowedToolNames) ? existing.content.allowedToolNames.join(", ") : "") : "");
  const [credential, setCredential] = useState("");
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const ref = existing?.ref ?? uniqueConnectionRef(name || "mcp_service", [...new Set((data?.connections ?? []).map(connection => connection.ref))]);
  const version = existing ? existing.version + 1 : 1;
  const saveIssue = !name.trim() ? "请填写名称。" : !url.trim() ? "请填写 MCP 服务地址。" : "";

  async function test() {
    if (!existing) { setFeedback({ ok: false, text: "先保存连接后才能测试发现工具。" }); return; }
    setBusy(true); setFeedback(null);
    try { setTestResult(await workflowApiV2.testExtension(environmentRef, { ref: existing.ref, version: existing.version })); }
    catch (reason) { setFeedback({ ok: false, text: workflowErrorMessage(reason) }); }
    finally { setBusy(false); }
  }

  async function save() {
    if (saveIssue) { setFeedback({ ok: false, text: saveIssue }); return; }
    setBusy(true); setFeedback(null);
    const content: Record<string, JsonValue> = { type: "mcp-http", name: name.trim(), url: url.trim(), allowedToolNames: toolsText.split(",").map(item => item.trim()).filter(Boolean) };
    try { await workflowApiV2.extension(environmentRef, { action: "publish", kind: "connection", ref, version, content, credential }); refresh(); onSaved?.(ref, version, content); onClose(); }
    catch (reason) { setFeedback({ ok: false, text: workflowErrorMessage(reason) }); }
    finally { setBusy(false); }
  }

  return <EditorFrame tone="mcp" icon={<Database size={17}/>} title={existing ? "编辑 MCP 服务" : "新建 MCP 服务"} subtitle={`${name || "未命名服务"} · MCP HTTP`} test={<TestPane title="测试" hint="测试会按当前连接发现可用工具。">
      <button type="button" className="wf-editor-test-primary" disabled={busy || !existing} onClick={() => void test()}><Play size={12}/>{busy ? "正在发现…" : "测试连接"}</button>
      {testResult ? <div className="wf-editor-test-result"><TestStatus result={testResult}/>{testResult.tools?.length ? <div className="wf-editor-test-block"><h4>可发现的工具 · {testResult.tools.length}</h4>{testResult.tools.map(tool => <div className="wf-editor-test-line" key={tool.name}><code>{tool.name}</code><span>{tool.description}</span></div>)}</div> : null}{testResult.error ? <div className="wf-editor-test-block"><h4>错误</h4><div className="wf-editor-test-line"><span>{testResult.error.message}</span></div></div> : null}</div> : null}
    </TestPane>} feedback={feedback} busy={busy} saveDisabled={Boolean(saveIssue)} onClose={onClose} onSave={() => void save()}>
    <Section title="基础信息" hint="MCP 服务由当前账号持有">
      <div className="wf-editor-grid-2"><Field label="名称"><input aria-label="MCP 名称" value={name} onChange={event => setName(event.target.value)}/></Field><Field label="服务地址"><input aria-label="MCP 服务地址" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/mcp"/></Field></div>
    </Section>
    <Section title="凭据与工具" hint="只允许调用列出的工具名称">
      <Field label="凭据（可选，Authorization）"><input aria-label="MCP 连接凭据" type="password" autoComplete="new-password" value={credential} onChange={event => setCredential(event.target.value)}/></Field>
      <Field label="允许的工具名称（逗号分隔）"><input aria-label="MCP 允许工具" value={toolsText} onChange={event => setToolsText(event.target.value)}/></Field>
    </Section>
  </EditorFrame>;
}

/** One shared shell for every resource type. The caller owns which resource is being edited. */
export function ResourceEditor({ environmentRef, target, onClose, onSaved }: ResourceEditorProps) {
  const { data, error, refresh } = useExtensions(environmentRef);
  if (!environmentRef) return <EditorFrame tone="api" icon={<KeyRound size={17}/>} title="资源编辑器" subtitle="工作流服务暂时不可用" onClose={onClose} onSave={() => undefined} test={<p>请先连接工作流服务。</p>}><p className="wf-editor-empty">工作流服务暂时不可用，无法读取资源。</p></EditorFrame>;
  if (!data) return <EditorFrame tone="api" icon={<KeyRound size={17}/>} title="正在读取资源" subtitle={error || "请稍候"} onClose={onClose} onSave={() => undefined} test={<p>正在读取连接配置…</p>}><p className="wf-editor-empty">{error || "正在读取资源…"}</p></EditorFrame>;
  switch (target.kind) {
    case "provider": return <ProviderEditor environmentRef={environmentRef} target={target} onClose={onClose} onSaved={onSaved} data={data} refresh={refresh}/>;
    case "api": return <ApiEditor environmentRef={environmentRef} target={target} onClose={onClose} onSaved={onSaved} data={data} refresh={refresh}/>;
    case "function": return <FunctionEditor environmentRef={environmentRef} target={target} onClose={onClose} onSaved={onSaved} data={data} refresh={refresh}/>;
    case "mcp": return <McpEditor environmentRef={environmentRef} target={target} onClose={onClose} onSaved={onSaved} data={data} refresh={refresh}/>;
  }
}

/** Small helper used by resource lists to render the same compact URL line. */
export function resourceUrlLine(entry: CatalogConnection): string {
  return apiDisplayUrl(entry.content);
}

/** Function list labels keep language and published version out of internal refs. */
export function resourceFunctionList(data: { functions?: FunctionVersion[] } | null | undefined): { ref: string; latest: FunctionVersion; versions: FunctionVersion[] }[] {
  return groupCatalogByRef((data?.functions ?? []) as FunctionVersion[]);
}

export function connectionProviderLabel(entry: CatalogConnection): string {
  return `${providerTypeLabel(entry)} · v${entry.version}`;
}
