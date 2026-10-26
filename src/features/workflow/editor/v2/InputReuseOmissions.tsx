import { pointerLabel, reuseReasonLabel, type RunInputReuseOmission } from "./runInputReuse";

/** Fields that were intentionally not prefilled from a Run input snapshot. */
export function InputReuseOmissions({ fields, onClose }: { fields: RunInputReuseOmission[]; onClose?: () => void }) {
  if (!fields.length) return null;
  return <section role="status" className="wf-input-reuse-omissions">
    <strong>复用时没有填入以下字段</strong>
    <ul>{fields.map((field, index) => <li key={`${field.pointer}-${index}`}>{pointerLabel(field.pointer, "全部外部调用数据")}：{reuseReasonLabel(field.reason)}</li>)}</ul>
    <p>如本次运行需要这些字段，请在表单中重新填写。</p>
    {onClose ? <button type="button" onClick={onClose}>收起复用说明</button> : null}
  </section>;
}
