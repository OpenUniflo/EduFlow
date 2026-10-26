import type { JsonValue, WorkflowRunV2 } from "../../domain/v2/types";
import { putValue } from "./SchemaForm";

export type RunInputReuseOmission = { pointer: string; reason: string };

export type ReusableRunInput = {
  available: boolean;
  complete: boolean;
  input: JsonValue;
  omissions: RunInputReuseOmission[];
};

/**
 * Rebuilds the run dialog input from the launch-input snapshot of a previous Run.
 * Sensitive, redacted or missing fields never come from the snapshot; they stay in
 * `omissions` so the dialog can ask the user to fill them again.
 */
export function reusableRunInput(run: WorkflowRunV2 | null | undefined): ReusableRunInput {
  const reuse = run?.inputReuse;
  if (!reuse?.available) return { available: false, complete: false, input: {}, omissions: [] };
  let input: JsonValue = {};
  for (const field of reuse.fields ?? []) input = putValue(input, field.pointer, field.value);
  return { available: true, complete: Boolean(reuse.complete), input, omissions: reuse.removedFields ?? [] };
}

export function pointerLabel(pointer: string, fallback = "全部启动输入"): string {
  const parts = pointer.split("/").slice(1).map(token => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  return parts.length ? parts.join(" / ") : fallback;
}

export function reuseReasonLabel(reason: string): string {
  return ({ sensitive: "敏感字段，需要重新填写", redacted: "历史值已脱敏，需要重新填写", missing: "历史记录中缺少完整值" })[reason] ?? "此字段不可从历史复用";
}

/** The existing revision-mismatch wording, shared by the snapshot panel and the Run dialog. */
export function runRevisionNotice(runRevision: number, currentRevision: number): string | undefined {
  if (runRevision === currentRevision) return undefined;
  return `此运行使用的是保存版本 ${runRevision}；当前编辑为保存版本 ${currentRevision}。复用输入会创建当前版本的新运行，不会重放原版本；可先用“查看执行版本的定义与布局”核对。`;
}
