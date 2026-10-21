import type { JsonSchema, JsonValue } from "../../domain/v2/types";
import { validateSchemaValue } from "../../domain/v2/validation";
import { SchemaForm } from "./SchemaForm";
import { WorkflowDialog } from "./WorkflowDialog";

export function RunPreparationDialog({ draftId, schema, value, onChange, onInvalid, busy, dirty, inputInvalid, warning, consumers = [], focusErrorRequest = 0, focusPointer = null, onCancel, onRun, onRunEmpty }: {
  draftId: string;
  schema: JsonSchema;
  value: JsonValue;
  onChange: (value: JsonValue) => void;
  onInvalid: (message: string) => void;
  busy: boolean;
  dirty: boolean;
  inputInvalid: string;
  warning?: string;
  consumers?: string[];
  focusErrorRequest?: number;
  focusPointer?: string | null;
  onCancel: () => void;
  onRun: () => void;
  onRunEmpty: () => void;
}) {
  const validation = validateSchemaValue(schema, value);
  const emptyValid = validateSchemaValue(schema, {}).valid;
  const valid = validation.valid && !inputInvalid;
  return <WorkflowDialog title="运行准备" error={inputInvalid || undefined} onClose={onCancel}>
    <p className="wf-dialog-intro">填写本次启动输入。校验通过后才会创建 Run；取消不会创建运行。启动输入不随工作流定义保存。</p>
    {dirty ? <p className="wf-field-note">当前有未保存修改；运行前会先保存。</p> : null}
    {warning ? <p role="alert">{warning}</p> : null}
    {consumers.length ? <details className="wf-run-consumers"><summary>谁在使用启动输入</summary><ul className="wf-data-list">{consumers.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null}
    <SchemaForm draftId={draftId} draftKind="run-input" label="启动输入" schema={schema} value={value} onChange={onChange} onInvalid={onInvalid} focusErrorRequest={focusErrorRequest} focusPointer={focusPointer} />
    {!valid && !inputInvalid ? <p role="alert">请先补齐或修正启动输入；当前不会创建 Run。</p> : null}
    <div className="wf-dialog-actions">
      <button type="button" onClick={onCancel}>取消</button>
      {emptyValid ? <button type="button" disabled={busy} onClick={onRunEmpty}>使用空对象运行</button> : null}
      <button type="button" className="primary" disabled={!valid || busy} onClick={onRun}>{busy ? "正在运行…" : dirty ? "保存并运行" : "运行"}</button>
    </div>
  </WorkflowDialog>;
}
