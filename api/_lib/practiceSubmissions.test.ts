import { describe, expect, it } from "vitest";
import { chapterNumbersByAssignment, latestAttemptNumbers, practiceSubmissionContent, practiceSubmissionStatus } from "./practiceSubmissions";

describe("practice submission read model", () => {
  it("maps persisted Assignment states to learner-facing practice statuses", () => {
    expect(practiceSubmissionStatus("started")).toBe("draft");
    expect(practiceSubmissionStatus("submitted")).toBe("submitted");
    expect(practiceSubmissionStatus("needs_revision")).toBe("needs_revision");
    expect(practiceSubmissionStatus("accepted")).toBe("accepted");
    expect(practiceSubmissionStatus("not_started")).toBeNull();
  });

  it("keeps the latest real attempt number per Course and Assignment", () => {
    const latest = latestAttemptNumbers([
      { course_id: "c", assignment_id: "a", attempt_number: 1 },
      { course_id: "c", assignment_id: "a", attempt_number: 3 },
      { course_id: "c", assignment_id: "b", attempt_number: 2 },
      { course_id: "c", assignment_id: "a", attempt_number: "not-a-number" },
    ]);
    expect([...latest.entries()]).toEqual([["c:a", 3], ["c:b", 2]]);
  });
});

describe("practice submission card data", () => {
  it("summarises only real Attempt fields, including a link domain and attachment count", () => {
    expect(practiceSubmissionContent({ kind: "answer", text: "复现命令见 https://www.github.com/example/run\n第二行", attachmentSourceIds: ["a", "b"] })).toEqual({
      kind: "answer",
      attachmentCount: 2,
      linkDomain: "github.com",
      text: "复现命令见 https://www.github.com/example/run",
    });
    expect(practiceSubmissionContent({ kind: "code", fileName: "run.log" })).toEqual({
      kind: "code",
      attachmentCount: 0,
      fileName: "run.log",
    });
    expect(practiceSubmissionContent({ kind: "answer", text: "" })).toEqual({ kind: "answer", attachmentCount: 0 });
    expect(practiceSubmissionContent(null)).toBeUndefined();
  });

  it("uses the first meaningful JSON field instead of the raw payload", () => {
    const task = "在已登录学习者的 Course 上解释真实 Knowledge 与学习目标";
    expect(practiceSubmissionContent({
      kind: "answer",
      text: JSON.stringify({ project: "EduFlow Global Assistant", title: "   ", task: `${task}\n第二行` }),
    })).toEqual({ kind: "answer", attachmentCount: 0, text: task });
    expect(practiceSubmissionContent({
      kind: "answer",
      text: JSON.stringify({ task: "task 字段", answer: "answer 字段" }),
    })?.text).toBe("task 字段");
    const longTask = "长".repeat(100);
    expect(practiceSubmissionContent({ kind: "answer", text: JSON.stringify({ task: longTask }) })?.text).toBe(longTask.slice(0, 80));
  });

  it("omits text when JSON has no usable top-level string field", () => {
    expect(practiceSubmissionContent({
      kind: "answer",
      text: JSON.stringify({ project: "EduFlow Global Assistant", count: 3, nested: { task: "不是顶层" } }),
    })).toEqual({ kind: "answer", attachmentCount: 0 });
  });

  it("omits text for JSON arrays", () => {
    expect(practiceSubmissionContent({
      kind: "answer",
      text: JSON.stringify([{ task: "数组元素不算字段" }]),
    })).toEqual({ kind: "answer", attachmentCount: 0 });
  });

  it("keeps plain text and unparsable JSON-looking text unchanged", () => {
    expect(practiceSubmissionContent({
      kind: "answer",
      text: "普通作答\n第二行",
    })).toEqual({ kind: "answer", attachmentCount: 0, text: "普通作答" });
    const broken = '{ "task": "未闭合"';
    expect(practiceSubmissionContent({ kind: "answer", text: broken })).toEqual({
      kind: "answer",
      attachmentCount: 0,
      text: broken,
    });
  });

  it("resolves the 1-based chapter from the primary covered Knowledge", () => {
    const chapters = chapterNumbersByAssignment(
      [{ course_id: "c", assignment_id: "a", node_id: "later" }, { course_id: "c", assignment_id: "a", node_id: "primary" }],
      [
        { course_id: "c", id: "coverage-later", node_id: "later", lesson_id: "lesson-2", role: "introduce", display_order: 0 },
        { course_id: "c", id: "coverage-primary", node_id: "primary", lesson_id: "lesson-1", role: "introduce", display_order: 0 },
        { course_id: "c", id: "coverage-primary-2", node_id: "primary", lesson_id: "lesson-1", role: "reinforce", display_order: 1 },
      ],
      [
        { course_id: "c", id: "lesson-1", chapter_id: "chapter-1", display_order: 0 },
        { course_id: "c", id: "lesson-2", chapter_id: "chapter-2", display_order: 1 },
      ],
      [
        { course_id: "c", id: "chapter-1", display_order: 0 },
        { course_id: "c", id: "chapter-2", display_order: 1 },
      ]
    );
    expect(chapters.get("c:a")).toBe(1);
    const sparse = chapterNumbersByAssignment(
      [{ course_id: "c", assignment_id: "a", node_id: "primary" }],
      [{ course_id: "c", id: "coverage-primary", node_id: "primary", lesson_id: "lesson-1", role: "introduce", display_order: 0 }],
      [{ course_id: "c", id: "lesson-1", chapter_id: "chapter-1", display_order: 0 }],
      [
        { course_id: "c", id: "chapter-1", display_order: 10 },
        { course_id: "c", id: "chapter-2", display_order: 20 },
        { course_id: "c", id: "chapter-3", display_order: 40 },
      ]
    );
    expect(sparse.get("c:a")).toBe(1);
    expect(chapterNumbersByAssignment([], [], [], []).size).toBe(0);
  });
});
