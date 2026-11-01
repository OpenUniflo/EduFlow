/**
 * Learner-facing translation for persisted evaluation feedback.
 *
 * PerformanceResult feedback is stored for machine use: codes such as
 * `teacher_accepted` and English system messages are not learner-facing copy.
 * This module is the single shared mapping between those internal values and
 * Chinese explanations. Teacher-authored comments are user content and are
 * kept verbatim after known system messages are removed.
 *
 * Scores are deliberately conservative. A score is only shown when its full
 * mark is known, or when it is a 0..1 ratio that can honestly be converted to
 * a percentage. An absolute partial score without a maximum is hidden.
 */

export const RECORD_FEEDBACK_GENERIC = "评价已返回，请打开实践查看完整结果";

export const RECORD_FEEDBACK_CODE_LABELS: Readonly<Record<string, string>> = {
  passed: "老师验收通过",
  accepted: "老师验收通过",
  teacher_accepted: "老师验收通过",
  failed: "需修改，请根据评语调整后重新提交",
  needs_revision: "需修改，请根据评语调整后重新提交",
  teacher_rejected: "未通过，请根据评语调整后重新提交",
  teacher_requested_changes: "需修改，请根据评语调整后重新提交",
  revision_requested: "需修改，请根据评语调整后重新提交",
  pending: "等待老师验收",
  manual_review_required: "等待老师验收",
  trace_root_cause_found: "老师验收通过：已定位到最早失败步骤",
  trace_root_cause_missed: "需修改：未定位到最早失败步骤",
  trace_response_invalid: "需修改：提交内容与验收要求不符",
  response_kind_mismatch: "需修改：提交类型与验收要求不符",
  evidence_insufficient: "需修改：提交依据不足，请补充后重新提交",
  insufficient_evidence: "需修改：提交依据不足，请补充后重新提交"
};

const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  passed: "老师验收通过",
  failed: "需修改，请根据评语调整后重新提交",
  pending: "等待老师验收"
};

const ITEM_TEXT_LABELS: Readonly<Record<string, string>> = {
  passed: "已通过",
  accepted: "已通过",
  failed: "需修改",
  needs_revision: "需修改",
  pending: "审核中",
  manual_review_required: "等待老师验收",
  trace_root_cause_found: "已定位最早失败步骤",
  trace_root_cause_missed: "未定位最早失败步骤",
  trace_response_invalid: "提交内容与验收要求不符",
  response_kind_mismatch: "提交类型与验收要求不符",
  evidence_insufficient: "提交依据不足",
  insufficient_evidence: "提交依据不足"
};

const ITEM_LABEL_LABELS: Readonly<Record<string, string>> = {
  function: "功能",
  functionality: "功能",
  features: "功能",
  feature: "功能",
  clarity: "清晰度",
  depth: "深度",
  correctness: "正确性",
  accuracy: "准确性",
  completeness: "完整性",
  error_handling: "错误处理",
  errorhandling: "错误处理",
  code_quality: "代码质量",
  quality: "质量",
  observability: "可观测性",
  maintainability: "可维护性",
  performance: "性能",
  security: "安全性",
  usability: "易用性",
  testing: "测试",
  documentation: "文档",
  design: "设计",
  logic: "逻辑",
  structure: "结构"
};

const SYSTEM_MESSAGES = new Set([
  "teacher accepted the submitted evidence",
  "teacher accepted the submitted evidence.",
  "the response is recorded and requires teacher review",
  "the response is recorded and requires teacher review.",
  "the file/link response is recorded and requires teacher review",
  "the file/link response is recorded and requires teacher review.",
  "the earliest failing step was identified",
  "the earliest failing step was identified.",
  "review the trace and locate the earliest failing step",
  "review the trace and locate the earliest failing step.",
  "trace response does not match the published validator",
  "trace response does not match the published validator.",
  "the response does not match this assignment experience",
  "the response does not match this assignment experience.",
  "accepted",
  "waiting",
  "saved manual result",
  "saved review"
]);

const SYSTEM_MESSAGE_PATTERNS = [
  /\brequires? (teacher|manual|human) review\b/,
  /\bsubmitted evidence\b/,
  /\bthe response is recorded\b/,
  /\bdoes not match (this assignment|the published validator)\b/,
  /\bearliest failing step\b/,
  /\bpublished validator\b/
];

export type RecordScoreValue = {
  earned: number;
  max: number;
  /** True when the persisted value was a 0..1 ratio converted to 0..100. */
  convertedFromRatio: boolean;
};

export function hasCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function normalizedMessage(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Known backend-only system messages must never reach learner-visible copy. */
export function isSystemFeedbackMessage(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = normalizedMessage(value);
  if (!normalized) return false;
  if (SYSTEM_MESSAGES.has(normalized)) return true;
  return SYSTEM_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function recordFeedbackCodeLabel(code: string | null | undefined): string | undefined {
  const normalized = code?.trim().toLowerCase();
  return normalized ? RECORD_FEEDBACK_CODE_LABELS[normalized] : undefined;
}

export function recordFeedbackSummary(code: string | null | undefined, outcome: string | null | undefined): string | undefined {
  const normalizedCode = code?.trim().toLowerCase();
  if (normalizedCode) return RECORD_FEEDBACK_CODE_LABELS[normalizedCode] ?? RECORD_FEEDBACK_GENERIC;
  const normalizedOutcome = outcome?.trim().toLowerCase();
  return normalizedOutcome ? OUTCOME_LABELS[normalizedOutcome] : undefined;
}

/**
 * Keeps teacher comments verbatim. Known system messages are dropped, and for
 * an unknown code an ASCII-only message is treated as another system string
 * rather than exposed as a raw backend value.
 */
export function recordFeedbackComment(message: string | null | undefined, code: string | null | undefined, trustedUserContent = false): string | undefined {
  const value = message?.trim();
  if (!value || isSystemFeedbackMessage(value)) return undefined;
  const normalizedCode = code?.trim().toLowerCase();
  if (normalizedCode && value.toLowerCase() === normalizedCode) return undefined;
  if (normalizedCode && !RECORD_FEEDBACK_CODE_LABELS[normalizedCode] && !hasCjk(value) && !trustedUserContent) return undefined;
  return value;
}

export function recordFeedbackItemLabel(value: string | null | undefined): string {
  const label = value?.trim() ?? "";
  if (!label) return "评价项";
  if (hasCjk(label)) return label;
  const key = label.toLowerCase().replace(/[\s-]+/g, "_");
  return ITEM_LABEL_LABELS[key] ?? "评价项";
}

/** Text values are kept only when Chinese or a known result code. */
export function recordFeedbackItemText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  if (!text || isSystemFeedbackMessage(text)) return undefined;
  const labeled = ITEM_TEXT_LABELS[text.toLowerCase()];
  if (labeled) return labeled;
  return hasCjk(text) ? text : undefined;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function numberText(value: number): string {
  return String(rounded(value));
}

/** Returns only an honest, displayable score. */
export function normalizeRecordScore(score: number | null | undefined, max: number | null | undefined): RecordScoreValue | undefined {
  if (score == null || !Number.isFinite(score) || score < 0) return undefined;
  if (max != null && Number.isFinite(max) && max > 0) {
    if (max === 1 && score <= 1) return { earned: rounded(score * 100), max: 100, convertedFromRatio: true };
    return { earned: rounded(score), max: rounded(max), convertedFromRatio: false };
  }
  // A bare 0..1 value is the rule evaluator's ratio (1 = full marks), so it
  // can be converted to a percentage and labelled as such.
  if (score <= 1) return { earned: rounded(score * 100), max: 100, convertedFromRatio: true };
  return undefined;
}

export function formatRecordScore(value: RecordScoreValue): string {
  return `${numberText(value.earned)} / ${numberText(value.max)}${value.convertedFromRatio ? "（按比例换算）" : ""}`;
}
