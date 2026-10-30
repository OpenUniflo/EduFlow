import { describe, expect, it } from "vitest";
import type { CourseAssignment } from "@/features/course/types";
import { buildPracticeResponse, canSubmitPractice, evaluatorOptions, practiceAttemptKicker, practiceChecklist, practiceChecklistCounts, practiceCompatibility, practiceOutcomeView, practiceResultActions, practiceSubmissionText, practiceViewState } from "./practiceModel";

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
    expect(evaluatorOptions.find((option) => option.id === "teacher")?.preview).toBe(false);
    expect(evaluatorOptions.find((option) => option.id === "ai")?.preview).toBe(true);
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

  it("keeps the legacy code response kind so a server result is never faked by the client", () => {
    const response = buildPracticeResponse("legacy-trace", { note: "运行记录", link: "", attachmentIds: [], attachmentNames: [] });
    expect(response).toMatchObject({ kind: "code", code: "运行记录" });
  });

  it("rejects an empty draft and the retired answer type", () => {
    expect(buildPracticeResponse("unified", { note: " ", link: "", attachmentIds: [], attachmentNames: [] })).toBeNull();
    expect(buildPracticeResponse("legacy-answer", { note: "x", link: "", attachmentIds: [], attachmentNames: [] })).toBeNull();
  });

  it("separates real teacher results from preview AI results", () => {
    expect(practiceOutcomeView({ outcome: "passed", accepted: true, preview: false, feedback: "ok" }).tone).toBe("accepted");
    expect(practiceOutcomeView({ outcome: "failed", preview: false }).tone).toBe("revision");
    expect(practiceOutcomeView({ outcome: "pending", preview: false }).tone).toBe("pending");
    const preview = practiceOutcomeView({ preview: true });
    expect(preview.tone).toBe("preview");
    expect(preview.detail).toContain("不会保存");
    expect(practiceSubmissionText({ note: "n", link: "l" })).toContain("n");
  });
});

describe("practice attempt and result actions", () => {
  it("labels the header with the attempt number instead of implementation details", () => {
    expect(practiceAttemptKicker(2)).toBe("实践 · 第 2 次尝试");
    expect(practiceAttemptKicker(0)).toBe("实践 · 第 1 次尝试");
  });

  it("keeps accepted work read-only and offers another attempt only after revision", () => {
    expect(practiceResultActions("accepted", false)).toEqual({ showViewSubmission: true, showPracticeAgain: false });
    expect(practiceResultActions("revision", false)).toEqual({ showViewSubmission: true, showPracticeAgain: true });
    expect(practiceResultActions("pending", false)).toEqual({ showViewSubmission: true, showPracticeAgain: false });
    expect(practiceResultActions("preview", true)).toEqual({ showViewSubmission: true, showPracticeAgain: true });
  });
});

describe("practice checklist", () => {
  it("counts only required deliverables and reflects real draft state", () => {
    const empty = practiceChecklist({ note: "", link: "", attachmentIds: [], attachmentNames: [] });
    expect(practiceChecklistCounts(empty)).toEqual({ attached: 0, total: 3 });
    const filled = practiceChecklist({
      note: "复现命令", link: "https://example.test", linkedWorkName: "ReAct", linkedWorkVersion: "v3",
      attachmentIds: ["a"], attachmentNames: ["run.md"]
    });
    expect(practiceChecklistCounts(filled)).toEqual({ attached: 3, total: 3 });
    expect(filled.find((item) => item.id === "link")?.required).toBe(false);
  });
});
