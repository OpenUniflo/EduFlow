import { useEffect, useState } from "react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { ResourceReferenceRow, WorkflowConfiguration, WorkflowVariable } from "../domain/v2/types";
import { ResourceReferences } from "./ResourceReferences";
import type { ResourceCreated } from "./resourceTypes";
import {
  configurationSaveFailure, configurationSaveNotice, newVariable, setVariableDescription, setVariableType,
  setVariableValue, variableDescriptionIssue, variableKeyIssue, variableTableDirty, variableTypeOf,
  VARIABLE_DESCRIPTION_LIMIT, VARIABLE_TABS, type VariableType,
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

const EMPTY_CONFIGURATION: WorkflowConfiguration = { revision: 0, variables: [] };

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
  referenceRows: readonly ResourceReferenceRow[];
  referencesLoading: boolean;
  referenceError: string;
  openReferenceKey: string | null;
  onAdd: (key: string, type: VariableType) => void;
  onChange: (index: number, variable: WorkflowVariable) => void;
  onRemove: (index: number) => void;
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

/** Presentational variable table; exported so the save/conflict presentation is testable without a browser DOM. */
export function VariableTableEditor(props: VariableTableEditorProps) {
  const {
    configuration, baseline, loading, loadError, busy, conflict, error, notice, create = false,
    referenceRows, referencesLoading, referenceError, openReferenceKey,
    onAdd, onChange, onRemove, onSave, onReload, onToggleReferences, onOpenReference,
  } = props;
  if (loading && !configuration.variables.length) return <p role="status">正在读取变量…</p>;
  const dirty = variableTableDirty(configuration, baseline);
  const existingKeys = configuration.variables.map(variable => variable.key);
  const openRows = openReferenceKey ? referenceRows.filter(row => row.variableKey === openReferenceKey) : [];
  return <section className="wf-resource-section" aria-label="工作流变量">
    <div className="wf-resource-tabs" role="tablist" aria-label="变量取值">
      {VARIABLE_TABS.map(tab => <button type="button" role="tab" key={tab.id} aria-selected={tab.id === "default"} aria-controls="wf-resource-variable-panel" id={`wf-resource-variable-tab-${tab.id}`}>{tab.label}</button>)}
    </div>
    <p className="wf-field-note">本阶段只维护变量默认值；变量环境切换将在后续版本提供。</p>
    {create ? <p className="wf-resource-intent">正在为节点新增变量：整表保存后，本次新增的变量会回填到当前节点。</p> : null}
    <div id="wf-resource-variable-panel" role="tabpanel" aria-labelledby="wf-resource-variable-tab-default">
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
    </div>
    <AddVariableForm existingKeys={existingKeys} onAdd={onAdd} />
    {loadError ? <p role="alert">{loadError}<button type="button" onClick={onReload}>重试</button></p> : null}
    {conflict ? <div className="wf-resource-conflict" role="alert"><p>{conflict}</p><button type="button" onClick={onReload}>刷新服务器版本</button></div> : null}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p className="wf-resource-feedback" role="status">{notice}</p> : null}
    <div className="wf-resource-actions">
      <button type="button" className="primary" disabled={busy || !dirty} onClick={() => onSave()}>{busy ? "正在保存…" : "保存变量"}</button>
      {dirty ? <small>有未保存的修改。</small> : null}
    </div>
  </section>;
}

/** Whole-table variable editor: one save with the workspace configuration revision as the optimistic lock. */
export function VariableTable({ configuration, loading = false, loadError = "", onReloadConfiguration, create = false, onCreated, onResourcesChanged, onOpenReference, onConfigurationSaved }: VariableTableProps) {
  const [draft, setDraft] = useState<WorkflowConfiguration>(configuration ?? EMPTY_CONFIGURATION);
  const [baseline, setBaseline] = useState<WorkflowConfiguration>(configuration ?? EMPTY_CONFIGURATION);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [referenceRows, setReferenceRows] = useState<ResourceReferenceRow[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [referenceError, setReferenceError] = useState("");
  const [openReferenceKey, setOpenReferenceKey] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!configuration) return;
    setDraft(configuration);
    setBaseline(configuration);
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

  async function save() {
    setBusy(true); setError(""); setConflict(""); setNotice("");
    try {
      const saved = await workflowApiV2.saveConfiguration(draft);
      setDraft(saved); setBaseline(saved);
      setNotice(configurationSaveNotice(saved));
      onConfigurationSaved?.(saved);
      const created = addedKeys;
      setAddedKeys([]);
      for (const key of created) {
        const variable = saved.variables.find(item => item.key === key);
        if (variable) onCreated?.(key, saved.revision, { key, value: variable.value });
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
    referenceRows={referenceRows}
    referencesLoading={referencesLoading}
    referenceError={referenceError}
    openReferenceKey={openReferenceKey}
    onAdd={addVariable}
    onChange={changeVariable}
    onRemove={removeVariable}
    onSave={() => void save()}
    onReload={reload}
    onToggleReferences={key => setOpenReferenceKey(current => current === key ? null : key)}
    onOpenReference={onOpenReference}
  />;
}
