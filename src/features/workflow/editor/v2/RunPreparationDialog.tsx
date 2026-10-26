import { useState } from "react";
import type { JsonSchema, JsonValue } from "../../domain/v2/types";
import { validateSchemaValue } from "../../domain/v2/validation";
import { InputReuseOmissions } from "./InputReuseOmissions";
import type { RunInputReuseOmission } from "./runInputReuse";
import type { RunPreflightIssue } from "./runPreflight";
import { SchemaForm } from "./SchemaForm";
import { WorkflowDialog } from "./WorkflowDialog";

/**
 * The single run entry. Required startup input, inline startup checks and one Run button;
 * no separate preflight/rerun dialogs. The caller auto-saves dirty definitions on Run.
 */
export function RunPreparationDialog({ draftId, schema, value, onChange, onInvalid, busy, dirty, inputInvalid, warning, reuseNotice, omissions, issues = [], focusErrorRequest = 0, focusPointer = null, onCancel, onRun, onIssue }: {
  draftId: string;
  schema: JsonSchema;
  value: JsonValue;
  onChange: (value: JsonValue) => void;
  onInvalid: (message: string) => void;
  busy: boolean;
  dirty: boolean;
  inputInvalid: string;
  warning?: string;
  /** Revision-mismatch hint when the input came from an older Run snapshot. */
  reuseNotice?: string;
  /** Snapshot fields that were not prefilled and still need a value. */
  omissions?: RunInputReuseOmission[];
  issues?: RunPreflightIssue[];
  focusErrorRequest?: number;
  focusPointer?: string | null;
  onCancel: () => void;
  onRun: () => void;
  onIssue?: (issue: RunPreflightIssue) => void;
}) {
  const [touched, setTouched] = useState(false);
  const validation = validateSchemaValue(schema, value);
  const valid = validation.valid && !inputInvalid;
  const hasDraft = Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
  const showIssue = !valid && !inputInvalid && (touched || focusErrorRequest > 0 || hasDraft);
  const fields = Object.keys(schema.properties ?? {}).length;
  return <WorkflowDialog title="运行" error={inputInvalid || undefined} className="wf-run-dialog" onClose={onCancel}>
    {issues.length ? <section className="wf-run-check" aria-label="运行前检查"><strong>运行前还需要处理 {issues.length} 项</strong><ul>{issues.map(issue => <li key={issue.id}><button type="button" onClick={() => onIssue?.(issue)}><span>{issue.title}</span><small>{issue.detail}</small></button></li>)}</ul></section> : null}
    {reuseNotice ? <p role="status">{reuseNotice}</p> : null}
    {omissions?.length ? <InputReuseOmissions fields={omissions}/> : null}
    {fields ? <SchemaForm draftId={draftId} draftKind="run-input" label="启动输入" modeToggle="link" schema={schema} value={value} onChange={next => { setTouched(true); onChange(next); }} onInvalid={onInvalid} showValidation={touched || focusErrorRequest > 0 || hasDraft} focusErrorRequest={focusErrorRequest} focusPointer={focusPointer} /> : <p className="wf-dialog-intro">这次运行不需要填写启动输入。</p>}
    {showIssue ? <p role="alert">请先补齐或修正启动输入；当前不会创建运行。</p> : null}
    {dirty ? <p className="wf-field-note">当前修改会在运行前自动保存；保存失败不会启动运行。</p> : null}
    {warning ? <p role="alert">{warning}</p> : null}
    <div className="wf-dialog-actions">
      <button type="button" onClick={onCancel}>取消</button>
      <button type="button" className="primary" disabled={!valid || busy} onClick={onRun}>{busy ? "正在运行…" : "运行"}</button>
    </div>
  </WorkflowDialog>;
}
