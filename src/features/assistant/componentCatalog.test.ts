import { describe, expect, it } from "vitest";
import { assistantCardDisplaySchema, assistantComponentCatalog, assistantComponentRefSchemas, catalogComponentFor } from "./componentCatalog";

describe("assistant component catalog", () => {
  it("contains the task, submission form, evaluation and progress components", () => {
    expect(assistantComponentCatalog.map((component) => component.id)).toEqual(expect.arrayContaining(["assignment", "submission_form", "evaluation", "progress"]));
    expect(catalogComponentFor("practice")).toMatchObject({ panel: "assignment" });
    expect(catalogComponentFor("submission")).toMatchObject({ id: "submission_form", panel: "assignment" });
    expect(catalogComponentFor("evaluation")).toMatchObject({ panel: "assignment" });
    expect(catalogComponentFor("progress")).toMatchObject({ panel: "records" });
  });

  it("accepts only server-shaped object references", () => {
    expect(assistantComponentRefSchemas.practice.parse({ cardType: "practice", courseId: "course", assignmentId: "task" })).toEqual({ cardType: "practice", courseId: "course", assignmentId: "task" });
    expect(() => assistantComponentRefSchemas.submission.parse({ cardType: "submission", courseId: "course" })).toThrow();
    expect(() => assistantComponentRefSchemas.progress.parse({ cardType: "progress", courseIds: [] })).toThrow();
  });

  it("validates display props and rejects invented fields", () => {
    expect(assistantCardDisplaySchema.parse({ title: "任务", status: { label: "待评价", tone: "warn" }, meta: ["约 15 分钟"] }))
      .toMatchObject({ title: "任务" });
    expect(() => assistantCardDisplaySchema.parse({ title: "任务", html: "<script>" })).toThrow();
    expect(assistantCardDisplaySchema.parse({ title: "任务", items: Array.from({ length: 9 }, (_, index) => ({ id: String(index), title: "x" })) }).items).toHaveLength(9);
    expect(() => assistantCardDisplaySchema.parse({ title: "任务", items: Array.from({ length: 51 }, (_, index) => ({ id: String(index), title: "x" })) })).toThrow();
  });
});
