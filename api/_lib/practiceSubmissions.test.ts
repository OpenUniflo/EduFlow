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
    expect(chapterNumbersByAssignment([], [], [], []).size).toBe(0);
  });
});
