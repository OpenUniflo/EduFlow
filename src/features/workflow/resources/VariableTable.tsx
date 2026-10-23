import { useEffect, useState } from "react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { ResourceReferenceRow, WorkflowConfiguration, WorkflowVariable } from "../domain/v2/types";
import { ResourceReferences } from "./ResourceReferences";
import type { ResourceCreated } from "./resourceTypes";
import {
  clearEnvironmentVariableValue, configurationForSave, configurationSaveFailure, configurationSaveNotice,
  createVariableEnvironment, deleteVariableEnvironment, environmentOverrideCount, environmentVariableValue,
  hasEnvironmentOverride, mergeSavedVariableConfiguration, moveVariableEnvironment, newVariable, normalizeVariableConfiguration,
  renameVariableEnvironment, setDefaultVariableEnvironment, setEnvironmentVariableValue, setVariableEnvironmentDescription,
  setVariableDescription, setVariableType, setVariableValue, variableConfigurationIssue, variableDescriptionIssue,
  variableEnvironmentById, variableEnvironmentDescriptionIssue, variableEnvironmentNameIssue, variableKeyIssue,
  variableTableDirty, variableTypeOf, VARIABLE_DESCRIPTION_LIMIT, VARIABLE_ENVIRONMENT_DESCRIPTION_LIMIT,
  VARIABLE_ENVIRONMENT_LIMIT, VARIABLE_TABS,
  type VariableTab, type VariableType,
} from "./variableModel";

export type VariableTableProps = {
  configuration: WorkflowConfiguration | null;
  loading?: boolean;
  loadError?: string;
  onReloadConfiguration?: () => void;
  create?: boolean;
  onCreated?: ResourceCreated;
  onResourcesChanged?: () => void;
  onOpenReference?: (row: ResourceReferenceRow) => void;
  onConfigurationSaved?: (configuration: WorkflowConfiguration) => void;
};

const EMPTY_CONFIGURATION = normalizeVariableConfiguration({ revision: 0, variables: [] });
const TYPE_LABELS: Record<VariableType, string> = { string: "文本", number: "数字", boolean: "是或否" };

export type VariableTableEditorProps = {
  configuration: WorkflowConfiguration;
  baseline: WorkflowConfiguration;
  loading: boolean;
  loadError: string;
  busy: boolean;
  conflict: string;
  error: string;
  notice: string;
  create?: boolean;
  activeTab: VariableTab;
  editingEnvironmentId: string | null;
  pendingDeleteEnvironmentId: string | null;
  referenceRows: readonly ResourceReferenceRow[];
  referencesLoading: boolean;
  referenceError: string;
  openReferenceKey: string | null;
  onSelectTab: (tab: VariableTab) => void;
  onOpenEnvironment: (id: string) => void;
  onCloseEnvironment: () => void;
  onAdd: (key: string, type: VariableType) => void;
  onChange: (index: number, variable: WorkflowVariable) => void;
  onRemove: (index: number) => void;
  onCreateEnvironment: (name: string) => void;
  onRenameEnvironment: (id: string, name: string) => void;
  onChangeEnvironmentDescription: (id: string, description: string) => void;
  onMoveEnvironment: (id: string, direction: "up" | "down") => void;
  onSetDefaultEnvironment: (id: string | null) => void;
  onRequestDeleteEnvironment: (id: string) => void;
  onConfirmDeleteEnvironment: () => void;
  onCancelDeleteEnvironment: () => void;
  onSetEnvironmentValue: (index: number, environmentId: string, raw: string | number | boolean) => void;
  onClearEnvironmentValue: (index: number, environmentId: string) => void;
  onSave: () => void;
  onReload: () => void;
  onToggleReferences: (key: string) => void;
  onOpenReference?: (row: ResourceReferenceRow) => void;
};

function AddVariableForm({ existingKeys, onAdd }: { existingKeys: readonly string[]; onAdd: (key: string, type: VariableType) => void }) {
  const [key, setKey] = useState("");
  const [type, setType] = useState<VariableType>("string");
  const issue = variableKeyIssue(key, existingKeys);
  return <fieldset className="wf-resource-form wf-resource-add-variable">
    <legend>新增变量</legend>
    <label>变量名称<input aria-label="新增变量名称" value={key} placeholder="例如 API_BASE_URL" onChange={event => setKey(event.target.value)} /></label>
    <label>类型<select aria-label="新增变量类型" value={type} onChange={event => setType(event.target.value as VariableType)}>
      <option value="string">文本</option><option value="number">数字</option><option value="boolean">是或否</option>
    </select></label>
    <button type="button" disabled={Boolean(issue)} title={issue || undefined} onClick={() => { onAdd(key, type); setKey(""); }}>添加变量</button>
    {key ? <small role={issue ? "status" : undefined}>{issue || "名称可用。"}</small> : <small>使用大写字母、数字和下划线，以字母开头。</small>}
  </fieldset>;
}

function EnvironmentValueEditor({
  environmentId, environmentName, variables, onSetEnvironmentValue, onClearEnvironmentValue,
}: {
  environmentId: string;
  environmentName: string;
  variables: readonly WorkflowVariable[];
  onSetEnvironmentValue: (index: number, environmentId: string, raw: string | number | boolean) => void;
  onClearEnvironmentValue: (index: number, environmentId: string) => void;
}) {
  return <table className="wf-resource-table wf-resource-environment-value-table">
    <thead><tr><th>名称</th><th>类型</th><th>该环境值</th><th>继承默认值</th></tr></thead>
    <tbody>{variables.map((variable, index) => {
      const type = variableTypeOf(variable.value);
      const overridden = hasEnvironmentOverride(variable, environmentId);
      const value = environmentVariableValue(variable, environmentId);
      const label = `变量 ${variable.key} 在 ${environmentName || environmentId} 的值`;
      return <tr key={variable.key} data-variable-key={variable.key}>
        <td><strong>{variable.key}</strong></td>
        <td>{TYPE_LABELS[type]}</td>
        <td>{type === "boolean"
          ? <select aria-label={label} data-environment-value={variable.key} value={overridden ? String(value) : ""} onChange={event => event.target.value === "" ? onClearEnvironmentValue(index, environmentId) : onSetEnvironmentValue(index, environmentId, event.target.value)}>
            <option value="">继承默认值</option><option value="true">是</option><option value="false">否</option>
          </select>
          : <input aria-label={label} data-environment-value={variable.key} type={type === "number" ? "number" : "text"} value={overridden ? String(value) : ""} placeholder={overridden ? "" : `继承默认值（${String(variable.value)}）`} onChange={event => onSetEnvironmentValue(index, environmentId, event.target.value)} />}</td>
        <td>{overridden
          ? <div className="wf-resource-inherited"><small>否（已覆盖） · 默认值 {String(variable.value)}</small><button type="button" data-environment-action="clear-override" data-variable-key={variable.key} onClick={() => onClearEnvironmentValue(index, environmentId)}>恢复继承</button></div>
          : <small>是 · 默认值 {String(variable.value)}</small>}</td>
      </tr>;
    })}</tbody>
  </table>;
}

/** Presentational variable table; exported so save/conflict and environment management are testable without a browser DOM. */
export function VariableTableEditor(props: VariableTableEditorProps) {
  const {
    configuration, baseline, loading, loadError, busy, conflict, error, notice, create = false,
    activeTab, editingEnvironmentId, pendingDeleteEnvironmentId, referenceRows, referencesLoading, referenceError, openReferenceKey,
    onSelectTab, onOpenEnvironment, onCloseEnvironment, onAdd, onChange, onRemove,
    onCreateEnvironment, onRenameEnvironment, onChangeEnvironmentDescription, onMoveEnvironment,
    onSetDefaultEnvironment, onRequestDeleteEnvironment, onConfirmDeleteEnvironment, onCancelDeleteEnvironment,
    onSetEnvironmentValue, onClearEnvironmentValue,
    onSave, onReload, onToggleReferences, onOpenReference,
  } = props;
  const [newEnvironmentName, setNewEnvironmentName] = useState("");
  if (loading && !configuration.variables.length && !(configuration.environments ?? []).length) return <p role="status">正在读取变量…</p>;
  const dirty = variableTableDirty(configuration, baseline);
  const existingKeys = configuration.variables.map(variable => variable.key);
  const openRows = openReferenceKey ? referenceRows.filter(row => row.variableKey === openReferenceKey) : [];
  const environments = configuration.environments ?? [];
  const editingEnvironment = variableEnvironmentById(configuration, editingEnvironmentId);
  const pendingEnvironment = variableEnvironmentById(configuration, pendingDeleteEnvironmentId);
  const newNameIssue = variableEnvironmentNameIssue(newEnvironmentName, environments);
  const configurationIssue = variableConfigurationIssue(configuration);

  return <section className="wf-resource-section" aria-label="工作流变量">
    <div className="wf-resource-tabs" role="tablist" aria-label="变量视图">
      {VARIABLE_TABS.map(tab => <button type="button" role="tab" key={tab.id} aria-selected={activeTab === tab.id} aria-controls="wf-resource-variable-panel" id={`wf-resource-variable-tab-${tab.id}`} onClick={() => onSelectTab(tab.id)}>{tab.label}</button>)}
    </div>
    {create ? <p className="wf-resource-intent">正在为节点新增变量：整表保存后，本次新增的变量会回填到当前节点。</p> : null}
    <div id="wf-resource-variable-panel" role="tabpanel" aria-labelledby={`wf-resource-variable-tab-${activeTab}`}>

      {activeTab === "default" ? <>
        <p className="wf-field-note">默认值在变量未被环境覆盖时使用；变量的名称、类型和说明对所有环境共享。整份配置一次保存。</p>
        <table className="wf-resource-table wf-resource-variable-table">
          <thead><tr><th>名称</th><th>类型</th><th>默认值</th><th>说明</th><th>引用</th><th>删除</th></tr></thead>
          <tbody>{configuration.variables.map((variable, index) => {
            const type = variableTypeOf(variable.value);
            const count = referenceRows.filter(row => row.variableKey === variable.key).length;
            return <tr key={variable.key} data-variable-key={variable.key}>
              <td><strong>{variable.key}</strong></td>
              <td><select aria-label={`变量 ${variable.key} 类型`} value={type} onChange={event => onChange(index, setVariableType(variable, event.target.value as VariableType))}>
                <option value="string">文本</option><option value="number">数字</option><option value="boolean">是或否</option>
              </select></td>
              <td>{type === "boolean"
                ? <select aria-label={`变量 ${variable.key} 默认值`} value={String(variable.value)} onChange={event => onChange(index, setVariableValue(variable, type, event.target.value))}>
                  <option value="true">是</option><option value="false">否</option>
                </select>
                : <input aria-label={`变量 ${variable.key} 默认值`} type={type === "number" ? "number" : "text"} value={String(variable.value)} onChange={event => onChange(index, setVariableValue(variable, type, event.target.value))} />}</td>
              <td><input aria-label={`变量 ${variable.key} 说明`} maxLength={VARIABLE_DESCRIPTION_LIMIT} placeholder="可选，最多 300 字" value={variable.description ?? ""} onChange={event => onChange(index, setVariableDescription(variable, event.target.value))} />
                {variableDescriptionIssue(variable.description ?? "") ? <small role="alert">{variableDescriptionIssue(variable.description ?? "")}</small> : null}</td>
              <td>{referencesLoading ? <small>读取中…</small>
                : referenceError ? <small title={referenceError}>读取失败</small>
                : <button type="button" className="wf-resource-text-button" aria-expanded={openReferenceKey === variable.key} onClick={() => onToggleReferences(variable.key)}>{count} 处</button>}</td>
              <td><button type="button" onClick={() => onRemove(index)}>删除</button></td>
            </tr>;
          })}</tbody>
        </table>
        {!configuration.variables.length ? <p className="wf-resource-empty">还没有变量。可在下方新增。</p> : null}
        {openReferenceKey ? <div className="wf-resource-inline-references"><h4>引用位置 · {openReferenceKey}</h4><ResourceReferences rows={openRows} onOpen={onOpenReference} emptyText="暂无工作流读取此变量。" /></div> : null}
        <AddVariableForm existingKeys={existingKeys} onAdd={onAdd} />
      </> : editingEnvironment ? <>
        <div className="wf-resource-environment-toolbar">
          <button type="button" data-environment-action="back" onClick={onCloseEnvironment}>返回环境列表</button>
          <div>
            <strong>{editingEnvironment.name || "未命名环境"}</strong>
            <small>{editingEnvironment.description || "无说明"} · {configuration.defaultEnvironmentId === editingEnvironment.id ? "默认变量环境" : "非默认"} · 覆盖 {environmentOverrideCount(configuration, editingEnvironment.id)} 个变量</small>
          </div>
        </div>
        <EnvironmentValueEditor environmentId={editingEnvironment.id} environmentName={editingEnvironment.name} variables={configuration.variables} onSetEnvironmentValue={onSetEnvironmentValue} onClearEnvironmentValue={onClearEnvironmentValue} />
        {!configuration.variables.length ? <p className="wf-resource-empty">还没有变量；先在「默认值」中新增变量，再设置该环境的值。</p> : null}
      </> : <>
        <p className="wf-field-note">变量环境用于保存同一组变量的多套取值；它不影响模型连接与凭据。默认环境在创建运行且未指定环境时使用。</p>
        <div className="wf-resource-environment-head">
          <strong>变量环境（{environments.length}）</strong>
          {configuration.defaultEnvironmentId ? <button type="button" data-environment-action="clear-default" onClick={() => onSetDefaultEnvironment(null)}>不使用默认环境</button> : null}
        </div>
        {environments.length ? <table className="wf-resource-table wf-resource-environment-table">
          <thead><tr><th>名称</th><th>说明</th><th>排序</th><th>默认</th><th>覆盖 / 操作</th></tr></thead>
          <tbody>{environments.map((environment, index) => <tr key={environment.id} data-environment-id={environment.id} onClick={event => { if ((event.target as HTMLElement).closest("button,input,select,textarea,label")) return; onOpenEnvironment(environment.id); }}>
            <td><input aria-label={`变量环境名称 ${environment.id}`} data-environment-field="name" maxLength={40} value={environment.name} placeholder="环境名称" onChange={event => onRenameEnvironment(environment.id, event.target.value)} /></td>
            <td><input aria-label={`变量环境说明 ${environment.id}`} data-environment-field="description" maxLength={VARIABLE_ENVIRONMENT_DESCRIPTION_LIMIT} value={environment.description ?? ""} placeholder="可选，最多 300 字" onChange={event => onChangeEnvironmentDescription(environment.id, event.target.value)} />
              {variableEnvironmentDescriptionIssue(environment.description ?? "") ? <small role="alert">{variableEnvironmentDescriptionIssue(environment.description ?? "")}</small> : null}</td>
            <td><div className="wf-resource-row-actions">
              <button type="button" data-environment-action="up" data-environment-id={environment.id} aria-label={`上移变量环境 ${environment.name || environment.id}`} disabled={index === 0} onClick={() => onMoveEnvironment(environment.id, "up")}>↑</button>
              <button type="button" data-environment-action="down" data-environment-id={environment.id} aria-label={`下移变量环境 ${environment.name || environment.id}`} disabled={index === environments.length - 1} onClick={() => onMoveEnvironment(environment.id, "down")}>↓</button>
            </div></td>
            <td><input type="radio" data-environment-field="default" data-environment-id={environment.id} aria-label={`设为默认变量环境 ${environment.name || environment.id}`} name="wf-variable-default-environment" checked={configuration.defaultEnvironmentId === environment.id} onChange={() => onSetDefaultEnvironment(environment.id)} /></td>
            <td><div className="wf-resource-row-actions">
              <small>覆盖 {environmentOverrideCount(configuration, environment.id)} 个变量</small>
              <button type="button" data-environment-action="open" data-environment-id={environment.id} onClick={() => onOpenEnvironment(environment.id)}>编辑取值</button>
              <button type="button" data-environment-action="delete" data-environment-id={environment.id} onClick={() => onRequestDeleteEnvironment(environment.id)}>删除</button>
            </div></td>
          </tr>)}</tbody>
        </table> : <p className="wf-resource-empty">还没有变量环境。新建后可以为同一变量设置不同取值。</p>}
        {pendingEnvironment ? <div className="wf-resource-conflict" role="alert" data-environment-confirm={pendingEnvironment.id}>
          <p>删除变量环境「{pendingEnvironment.name || "未命名环境"}」？会同时删除它的 {environmentOverrideCount(configuration, pendingEnvironment.id)} 个覆盖值。{configuration.defaultEnvironmentId === pendingEnvironment.id ? "它是默认变量环境，删除后默认环境会改为剩余第一个。" : ""}</p>
          <button type="button" data-environment-action="confirm-delete" onClick={onConfirmDeleteEnvironment}>确认删除</button>
          <button type="button" data-environment-action="cancel-delete" onClick={onCancelDeleteEnvironment}>取消</button>
        </div> : null}
        <fieldset className="wf-resource-form wf-resource-add-environment">
          <legend>新建变量环境</legend>
          <label>名称<input aria-label="新建变量环境名称" maxLength={40} value={newEnvironmentName} placeholder="例如 开发" onChange={event => setNewEnvironmentName(event.target.value)} /></label>
          <button type="button" data-environment-action="create" disabled={!newEnvironmentName.trim() || Boolean(newNameIssue) || environments.length >= VARIABLE_ENVIRONMENT_LIMIT} onClick={() => { onCreateEnvironment(newEnvironmentName.trim()); setNewEnvironmentName(""); }}>+ 新建环境</button>
          {newEnvironmentName ? <small role={newNameIssue ? "status" : undefined}>{newNameIssue || "名称可用。"}</small> : <small>名称 1–40 字，最多 {VARIABLE_ENVIRONMENT_LIMIT} 个环境。</small>}
        </fieldset>
      </>}
    </div>

    {loadError ? <p role="alert">{loadError}<button type="button" onClick={onReload}>重试</button></p> : null}
    {conflict ? <div className="wf-resource-conflict" role="alert"><p>{conflict}</p><button type="button" onClick={onReload}>刷新服务器版本</button></div> : null}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p className="wf-resource-feedback" role="status">{notice}</p> : null}
    {configurationIssue ? <p className="wf-resource-feedback is-error" role="status">{configurationIssue}</p> : null}
    <div className="wf-resource-actions">
      <button type="button" className="primary" disabled={busy || !dirty || Boolean(configurationIssue)} onClick={() => onSave()}>{busy ? "正在保存…" : "保存变量"}</button>
      {dirty ? <small>默认值、变量环境与覆盖值会一次保存。</small> : null}
    </div>
  </section>;
}

/** Whole-configuration variable editor: one save with the workspace configuration revision as the optimistic lock. */
export function VariableTable({ configuration, loading = false, loadError = "", onReloadConfiguration, create = false, onCreated, onResourcesChanged, onOpenReference, onConfigurationSaved }: VariableTableProps) {
  const initial = normalizeVariableConfiguration(configuration ?? EMPTY_CONFIGURATION);
  const [draft, setDraft] = useState<WorkflowConfiguration>(initial);
  const [baseline, setBaseline] = useState<WorkflowConfiguration>(initial);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [referenceRows, setReferenceRows] = useState<ResourceReferenceRow[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [referenceError, setReferenceError] = useState("");
  const [openReferenceKey, setOpenReferenceKey] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<VariableTab>("default");
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [pendingDeleteEnvironmentId, setPendingDeleteEnvironmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!configuration) return;
    const normalized = normalizeVariableConfiguration(configuration);
    setDraft(normalized);
    setBaseline(normalized);
    setConflict("");
  }, [configuration]);

  useEffect(() => {
    let active = true;
    setReferencesLoading(true);
    workflowApiV2.variableReferences()
      .then(result => { if (active) { setReferenceRows(result.items); setReferenceError(""); } })
      .catch(reason => { if (active) setReferenceError(workflowErrorMessage(reason)); })
      .finally(() => { if (active) setReferencesLoading(false); });
    return () => { active = false; };
  }, []);

  function selectTab(tab: VariableTab) {
    setActiveTab(tab);
    if (tab === "default") setEditingEnvironmentId(null);
    setNotice("");
  }

  function addVariable(key: string, type: VariableType) {
    const next = newVariable(key, type);
    setDraft(current => ({ ...current, variables: [...current.variables, next] }));
    setAddedKeys(current => [...current, next.key]);
    setNotice(""); setError(""); setConflict("");
  }

  function changeVariable(index: number, variable: WorkflowVariable) {
    setDraft(current => ({ ...current, variables: current.variables.map((item, position) => position === index ? variable : item) }));
    setNotice("");
  }

  function removeVariable(index: number) {
    const removedKey = draft.variables[index]?.key;
    setDraft(current => ({ ...current, variables: current.variables.filter((_, position) => position !== index) }));
    if (removedKey) {
      setAddedKeys(current => current.filter(key => key !== removedKey));
      if (openReferenceKey === removedKey) setOpenReferenceKey(null);
    }
    setNotice("");
  }

  function createEnvironment(name: string) {
    if (variableEnvironmentNameIssue(name, draft.environments ?? []) || (draft.environments ?? []).length >= VARIABLE_ENVIRONMENT_LIMIT) return;
    const environment = createVariableEnvironment(name, draft.environments ?? []);
    setDraft(current => normalizeVariableConfiguration({ ...current, environments: [...(current.environments ?? []), environment] }));
    setEditingEnvironmentId(environment.id);
    setNotice(""); setError(""); setConflict("");
  }

  function renameEnvironment(id: string, name: string) {
    setDraft(current => ({ ...current, environments: renameVariableEnvironment(current.environments ?? [], id, name) }));
    setNotice("");
  }

  function changeEnvironmentDescription(id: string, description: string) {
    setDraft(current => ({ ...current, environments: setVariableEnvironmentDescription(current.environments ?? [], id, description) }));
    setNotice("");
  }

  function moveEnvironment(id: string, direction: "up" | "down") {
    setDraft(current => ({ ...current, environments: moveVariableEnvironment(current.environments ?? [], id, direction) }));
    setNotice("");
  }

  function setDefaultEnvironment(id: string | null) {
    setDraft(current => setDefaultVariableEnvironment(current, id));
    setNotice("");
  }

  function requestDeleteEnvironment(id: string) {
    setPendingDeleteEnvironmentId(id);
  }

  function confirmDeleteEnvironment() {
    if (!pendingDeleteEnvironmentId) return;
    const id = pendingDeleteEnvironmentId;
    setDraft(current => deleteVariableEnvironment(current, id));
    if (editingEnvironmentId === id) setEditingEnvironmentId(null);
    setPendingDeleteEnvironmentId(null);
    setNotice("");
  }

  function cancelDeleteEnvironment() {
    setPendingDeleteEnvironmentId(null);
  }

  function setEnvironmentValue(index: number, environmentId: string, raw: string | number | boolean) {
    setDraft(current => ({ ...current, variables: current.variables.map((variable, position) => position === index ? setEnvironmentVariableValue(variable, environmentId, raw) : variable) }));
    setNotice("");
  }

  function clearEnvironmentValue(index: number, environmentId: string) {
    setDraft(current => ({ ...current, variables: current.variables.map((variable, position) => position === index ? clearEnvironmentVariableValue(variable, environmentId) : variable) }));
    setNotice("");
  }

  async function save() {
    setError(""); setConflict(""); setNotice("");
    const issue = variableConfigurationIssue(draft);
    if (issue) { setError(issue); return; }
    setBusy(true);
    const payload = configurationForSave(draft);
    try {
      const saved = await workflowApiV2.saveConfiguration(payload);
      const merged = mergeSavedVariableConfiguration(payload, saved);
      setDraft(merged); setBaseline(merged);
      setNotice(configurationSaveNotice(merged));
      onConfigurationSaved?.(merged);
      const created = addedKeys;
      setAddedKeys([]);
      for (const key of created) {
        const variable = merged.variables.find(item => item.key === key);
        if (variable) onCreated?.(key, merged.revision, { key, value: variable.value });
      }
      onResourcesChanged?.();
    } catch (reason) {
      const failure = configurationSaveFailure(reason);
      if (failure.conflict) setConflict(failure.message);
      else setError(failure.message);
    } finally { setBusy(false); }
  }

  function reload() {
    setConflict(""); setError(""); setNotice("");
    onReloadConfiguration?.();
  }

  return <VariableTableEditor
    configuration={draft}
    baseline={baseline}
    loading={loading}
    loadError={loadError}
    busy={busy}
    conflict={conflict}
    error={error}
    notice={notice}
    create={create}
    activeTab={activeTab}
    editingEnvironmentId={editingEnvironmentId}
    pendingDeleteEnvironmentId={pendingDeleteEnvironmentId}
    referenceRows={referenceRows}
    referencesLoading={referencesLoading}
    referenceError={referenceError}
    openReferenceKey={openReferenceKey}
    onSelectTab={selectTab}
    onOpenEnvironment={id => { setEditingEnvironmentId(id); setActiveTab("environments"); }}
    onCloseEnvironment={() => setEditingEnvironmentId(null)}
    onAdd={addVariable}
    onChange={changeVariable}
    onRemove={removeVariable}
    onCreateEnvironment={createEnvironment}
    onRenameEnvironment={renameEnvironment}
    onChangeEnvironmentDescription={changeEnvironmentDescription}
    onMoveEnvironment={moveEnvironment}
    onSetDefaultEnvironment={setDefaultEnvironment}
    onRequestDeleteEnvironment={requestDeleteEnvironment}
    onConfirmDeleteEnvironment={confirmDeleteEnvironment}
    onCancelDeleteEnvironment={cancelDeleteEnvironment}
    onSetEnvironmentValue={setEnvironmentValue}
    onClearEnvironmentValue={clearEnvironmentValue}
    onSave={() => void save()}
    onReload={reload}
    onToggleReferences={key => setOpenReferenceKey(current => current === key ? null : key)}
    onOpenReference={onOpenReference}
  />;
}
