import { describe, expect, it } from "vitest";
import type { CourseAssignment } from "@/features/course/types";
import { aiEvaluationAvailable, buildPracticeResponse, canSubmitPractice, draftFromPracticeResult, evaluatorOptions, isLearnerFacingExpectedOutput, learnerAcceptanceCriteria, practiceAttemptKicker, practiceChecklist, practiceChecklistCounts, practiceCompatibility, practiceFeedbackText, practiceOutcomeView, practiceResultActions, practiceSubmissionText, practiceViewState, shouldStartPracticeOnInput } from "./practiceModel";

const unified: CourseAssignment = {
  id: "a", courseId: "c", order: 0, title: "实践", description: "d", requirements: [], expectedOutput: "o",
  acceptanceCriteria: [], mode: "instruction"
};

describe("unified practice compatibility", () => {
  it("maps the retired answer type to a read-only state and keeps code/trace submit-capable", () => {
    expect(practiceCompatibility({ mode: "instruction", experience: { type: "answer" } })).toBe("legacy-answer");
    expect(practiceCompatibility({ mode: "instruction", experience: { type: "code" } })).toBe("legacy-code");
    expect(practiceCompatibility({ mode: "instruction", experience: { type: "trace" } })).toBe("legacy-trace");
    expect(practiceCompatibility(unified)).toBe("unified");
    expect(canSubmitPractice("legacy-answer")).toBe(false);
    expect(canSubmitPractice("legacy-code")).toBe(true);
    expect(canSubmitPractice("legacy-trace")).toBe(true);
    expect(evaluatorOptions.map((option) => option.id)).toEqual(["teacher", "ai"]);
    expect(aiEvaluationAvailable("unified", ["有证据"])).toBe(true);
    expect(aiEvaluationAvailable("unified", [])).toBe(false);
    expect(aiEvaluationAvailable("workflow", ["有证据"])).toBe(false);
    expect(aiEvaluationAvailable("legacy-answer", ["有证据"])).toBe(false);
  });

  it("walks draft -> confirm -> result and never offers an answer editor", () => {
    expect(practiceViewState({ compatibility: "unified", hasResult: false, confirming: false })).toBe("draft");
    expect(practiceViewState({ compatibility: "unified", hasResult: false, confirming: true })).toBe("confirm");
    expect(practiceViewState({ compatibility: "unified", hasResult: true, confirming: false })).toBe("result");
    expect(practiceViewState({ compatibility: "legacy-answer", hasResult: false, confirming: true })).toBe("disabled");
    expect(practiceViewState({ compatibility: "workflow", hasResult: false, confirming: false })).toBe("workflow");
  });
});

describe("practice submission payload", () => {
  it("uses the unified answer payload for new practices and note + link + attachments", () => {
    const response = buildPracticeResponse("unified", {
      note: "复现命令已记录", link: "https://example.test/run", linkedWorkName: "ReAct 工作流", linkedWorkVersion: "预览 v3",
      attachmentIds: ["a", "b", "a"], attachmentNames: ["run.md", "readme.md"]
    });
    expect(response).toMatchObject({ kind: "answer", attachmentSourceIds: ["a", "b"] });
    expect(response && "text" in response ? response.text : "").toContain("链接：https://example.test/run");
    expect(response && "text" in response ? response.text : "").toContain("预览 v3");
  });

  it("rebuilds a revision draft from the previous immutable Attempt", () => {
    const draft = draftFromPracticeResult({ kind: "answer", text: "第一次说明\n链接：https://example.test/a", attachmentSourceIds: ["id-1"] }, [{ id: "id-1", title: "run.md" }]);
    expect(draft.note).toBe("第一次说明");
    expect(draft.link).toBe("https://example.test/a");
    expect(draft.attachmentNames).toEqual(["run.md"]);
  });

  it("keeps the legacy code response kind so a server result is never faked by the client", () => {
    const response = buildPracticeResponse("legacy-trace", { note: "运行记录", link: "", attachmentIds: [], attachmentNames: [] });
    expect(response).toMatchObject({ kind: "code", code: "运行记录" });
  });

  it("rejects an empty draft and the retired answer type", () => {
    expect(buildPracticeResponse("unified", { note: " ", link: "", attachmentIds: [], attachmentNames: [] })).toBeNull();
    expect(buildPracticeResponse("legacy-answer", { note: "x", link: "", attachmentIds: [], attachmentNames: [] })).toBeNull();
  });

  it("derives real teacher and AI results without a preview path", () => {
    expect(practiceOutcomeView({ outcome: "passed", accepted: true, feedbackCode: "trace_root_cause_found", evaluator: "teacher" }).tone).toBe("accepted");
    expect(practiceOutcomeView({ outcome: "failed", evaluator: "ai", feedbackCode: "ai_evaluation_needs_revision" })).toMatchObject({ tone: "revision", label: "需要修改" });
    expect(practiceOutcomeView({ outcome: "pending", feedbackCode: "manual_review_required" }).tone).toBe("pending");
    expect(practiceOutcomeView({ outcome: "pending", evaluator: "ai", evaluationStatus: "failed" }).tone).toBe("unavailable");
    expect(practiceOutcomeView({ outcome: "pending", evaluator: "ai", evaluationStatus: "handed_off" }).tone).toBe("handed_off");
    expect(practiceOutcomeView({ outcome: "pending", evaluator: "ai" })).toMatchObject({ tone: "evaluating", label: "评价中" });
    expect(practiceSubmissionText({ note: "n", link: "l" })).toContain("n");
  });

  it("renders feedback by code and never falls back to evaluator prose", () => {
    expect(practiceFeedbackText("manual_review_required")).toBe("提交内容已记录，等待老师验收。");
    expect(practiceFeedbackText("trace_root_cause_missed")).toContain("最早出错");
    expect(practiceFeedbackText(undefined, "failed")).toContain("未通过");
    expect(practiceFeedbackText("legacy_english_code")).toBe("提交已记录，等待评估者验收。");
    expect(practiceFeedbackText("legacy_english_code")).not.toContain("The response");
  });
});

describe("practice attempt and result actions", () => {
  it("labels the header with the attempt number instead of implementation details", () => {
    expect(practiceAttemptKicker(2)).toBe("动手任务 · 第 2 次尝试");
    expect(practiceAttemptKicker(0)).toBe("动手任务 · 第 1 次尝试");
  });

  it("keeps accepted work read-only and offers another attempt only after revision", () => {
    expect(practiceResultActions("accepted")).toEqual({ showViewSubmission: true, showPracticeAgain: false });
    expect(practiceResultActions("revision")).toEqual({ showViewSubmission: true, showPracticeAgain: true });
    expect(practiceResultActions("pending")).toEqual({ showViewSubmission: true, showPracticeAgain: false });
    expect(practiceResultActions("evaluating")).toEqual({ showViewSubmission: true, showPracticeAgain: false });
    expect(practiceResultActions("unavailable")).toEqual({ showViewSubmission: true, showPracticeAgain: false });
  });
});

describe("practice checklist", () => {
  it("requires at least one submission input and never marks optional inputs as mandatory", () => {
    const empty = practiceChecklist({ note: "", link: "", attachmentIds: [], attachmentNames: [] });
    expect(practiceChecklistCounts(empty)).toEqual({ attached: 0, total: 1 });
    expect(empty.filter((item) => item.required).map((item) => item.id)).toEqual(["content"]);
    const noteOnly = practiceChecklist({ note: "复现命令", link: "", attachmentIds: [], attachmentNames: [] });
    expect(practiceChecklistCounts(noteOnly)).toEqual({ attached: 1, total: 1 });
    const filled = practiceChecklist({
      note: "复现命令", link: "https://example.test", linkedWorkName: "ReAct", linkedWorkVersion: "v3",
      attachmentIds: ["a"], attachmentNames: ["run.md"]
    });
    expect(filled.every((item) => item.done)).toBe(true);
    expect(filled.find((item) => item.id === "link")?.required).toBe(false);
  });

  it("hides internal expected-output codes but keeps natural language", () => {
    expect(isLearnerFacingExpectedOutput("CH01.R10.REACT_TRACE")).toBe(false);
    expect(isLearnerFacingExpectedOutput("architecture-review.pdf")).toBe(false);
    expect(isLearnerFacingExpectedOutput("一份可复核的评审报告")).toBe(true);
    expect(isLearnerFacingExpectedOutput("PDF 报告")).toBe(true);
  });
});

describe("practice start on first input", () => {
  it("only starts once for an eligible untouched or revising practice", () => {
    expect(shouldStartPracticeOnInput({ canStart: true, alreadyRequested: false })).toBe(true);
    expect(shouldStartPracticeOnInput({ status: "needs_revision", canStart: true, alreadyRequested: false })).toBe(true);
    expect(shouldStartPracticeOnInput({ status: "started", canStart: true, alreadyRequested: true })).toBe(false);
  });

  it("does not start from an ineligible, submitted, accepted or completed practice", () => {
    expect(shouldStartPracticeOnInput({ status: "not_started", canStart: false, alreadyRequested: false })).toBe(false);
    for (const status of ["submitted", "accepted", "completed"]) {
      expect(shouldStartPracticeOnInput({ status, canStart: true, alreadyRequested: false })).toBe(false);
    }
  });
});

describe("learner-facing acceptance criteria", () => {
  it("expands a mastery field reference into the real Chinese standards without showing field names", () => {
    const criteria = learnerAcceptanceCriteria(
      ["轨迹包含关键证据。", "满足对应 KnowledgeNode 的 mastery_criteria。"],
      [{ id: "R10", masteryCriteria: ["能解释 Reason、Act、Observation 三阶段的职责", "能从执行轨迹识别一次完整 ReAct 循环"] }]
    );
    expect(criteria).toEqual([
      "轨迹包含关键证据。",
      "能解释 Reason、Act、Observation 三阶段的职责",
      "能从执行轨迹识别一次完整 ReAct 循环"
    ]);
    expect(criteria.join(" ")).not.toMatch(/KnowledgeNode|mastery_criteria/);
  });

  it("uses a learner-facing fallback when no standard can be read", () => {
    const criteria = learnerAcceptanceCriteria(["满足 mastery_criteria。"], [{ id: "R10", masteryCriteria: [] }]);
    expect(criteria).toEqual(["掌握标准暂不可用，请改交老师验收。"]);
    expect(criteria.join(" ")).not.toMatch(/KnowledgeNode|mastery_criteria/);
  });
});
