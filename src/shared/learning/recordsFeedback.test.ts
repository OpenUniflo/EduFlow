import { describe, expect, it } from "vitest";
import {
  RECORD_FEEDBACK_GENERIC,
  formatRecordScore,
  isSystemFeedbackMessage,
  normalizeRecordScore,
  recordFeedbackCodeLabel,
  recordFeedbackComment,
  recordFeedbackItemLabel,
  recordFeedbackItemText,
  recordFeedbackSummary
} from "./recordsFeedback";

describe("records feedback localization", () => {
  it("maps known result and reason codes to Chinese explanations", () => {
    expect(recordFeedbackCodeLabel("teacher_accepted")).toBe("老师验收通过");
    expect(recordFeedbackCodeLabel("manual_review_required")).toBe("等待老师验收");
    expect(recordFeedbackCodeLabel("needs_revision")).toBe("需修改，请根据评语调整后重新提交");
    expect(recordFeedbackCodeLabel("trace_root_cause_missed")).toBe("需修改：未定位到最早失败步骤");
    expect(recordFeedbackCodeLabel("response_kind_mismatch")).toBe("需修改：提交类型与验收要求不符");
    expect(recordFeedbackSummary(undefined, "passed")).toBe("老师验收通过");
    expect(recordFeedbackSummary(undefined, "failed")).toBe("需修改，请根据评语调整后重新提交");
  });

  it("shows a generic Chinese explanation for unknown codes and never the code itself", () => {
    expect(recordFeedbackCodeLabel("some_future_code")).toBeUndefined();
    const summary = recordFeedbackSummary("some_future_code", "passed");
    expect(summary).toBe(RECORD_FEEDBACK_GENERIC);
    expect(summary).not.toContain("some_future_code");
  });

  it("removes backend system messages but keeps teacher comments verbatim", () => {
    expect(isSystemFeedbackMessage("Teacher accepted the submitted evidence.")).toBe(true);
    expect(isSystemFeedbackMessage("The response is recorded and requires teacher review.")).toBe(true);
    expect(recordFeedbackComment("Teacher accepted the submitted evidence.", "teacher_accepted")).toBeUndefined();
    expect(recordFeedbackComment("完成得很好，步骤清晰。", "teacher_accepted")).toBe("完成得很好，步骤清晰。");
    expect(recordFeedbackComment("Good work", "teacher_accepted")).toBe("Good work");
    expect(recordFeedbackComment("raw english reason", "unknown_code")).toBeUndefined();
    expect(recordFeedbackComment("raw english reason", "unknown_code", true)).toBe("raw english reason");
    expect(recordFeedbackComment("老师说明原因", "unknown_code")).toBe("老师说明原因");
  });

  it("localizes rubric labels and rejects raw English values", () => {
    expect(recordFeedbackItemLabel("Function")).toBe("功能");
    expect(recordFeedbackItemLabel("error-handling")).toBe("错误处理");
    expect(recordFeedbackItemLabel("criterion_code_1")).toBe("评价项");
    expect(recordFeedbackItemLabel("功能")).toBe("功能");
    expect(recordFeedbackItemText("passed")).toBe("已通过");
    expect(recordFeedbackItemText("需要补充证据")).toBe("需要补充证据");
    expect(recordFeedbackItemText("raw english detail")).toBeUndefined();
    expect(recordFeedbackItemText("The earliest failing step was identified.")).toBeUndefined();
  });
});

describe("records score display", () => {
  it("converts a bare 0..1 ratio to a labelled percentage", () => {
    expect(normalizeRecordScore(1, undefined)).toEqual({ earned: 100, max: 100, convertedFromRatio: true });
    expect(normalizeRecordScore(0.94, undefined)).toEqual({ earned: 94, max: 100, convertedFromRatio: true });
    expect(normalizeRecordScore(0, undefined)).toEqual({ earned: 0, max: 100, convertedFromRatio: true });
    expect(formatRecordScore({ earned: 100, max: 100, convertedFromRatio: true })).toBe("100 / 100（按比例换算）");
  });

  it("shows a known maximum, and hides an absolute partial score without one", () => {
    expect(normalizeRecordScore(94, 100)).toEqual({ earned: 94, max: 100, convertedFromRatio: false });
    expect(normalizeRecordScore(20, 40)).toEqual({ earned: 20, max: 40, convertedFromRatio: false });
    expect(normalizeRecordScore(94, undefined)).toBeUndefined();
    expect(normalizeRecordScore(20, undefined)).toBeUndefined();
    expect(normalizeRecordScore(undefined, 100)).toBeUndefined();
    expect(formatRecordScore({ earned: 94, max: 100, convertedFromRatio: false })).toBe("94 / 100");
  });
});
