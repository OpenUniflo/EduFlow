import { describe, expect, it } from "vitest";
import { activeObjectKey, cardMatchesActiveObject } from "./activeObject";

describe("active assistant object identity", () => {
  it("matches only the same practice, route or micro", () => {
    const practice = { kind: "practice" as const, courseId: "c1", assignmentId: "a1", title: "任务" };
    expect(cardMatchesActiveObject(practice, { kind: "practice", courseId: "c1", assignmentId: "a1" })).toBe(true);
    expect(cardMatchesActiveObject(practice, { kind: "practice", courseId: "c1", assignmentId: "a2" })).toBe(false);
    expect(cardMatchesActiveObject({ kind: "route", courseId: "c1", title: "路线" }, { kind: "route", courseId: "c1" })).toBe(true);
    expect(cardMatchesActiveObject({ kind: "micro", pathId: "p1", knowledgeId: "k1", title: "练习" }, { kind: "micro", pathId: "p1" })).toBe(true);
    expect(cardMatchesActiveObject(practice, { kind: "route", courseId: "c1" })).toBe(false);
    expect(cardMatchesActiveObject({ kind: "material", courseId: "c1", materialId: "m1", title: "资料" }, { kind: "material", courseId: "c1", materialId: "m1" })).toBe(true);
    expect(cardMatchesActiveObject({ kind: "material", courseId: "c1", materialId: "m1", title: "资料" }, { kind: "material", courseId: "c1", materialId: "m2" })).toBe(false);
    expect(cardMatchesActiveObject({ kind: "brief", messageId: "b1", title: "简报" }, { kind: "brief", messageId: "b1" })).toBe(true);
  });

  it("keys each object so a switch clears a dismissed tag", () => {
    expect(activeObjectKey({ kind: "practice", courseId: "c1", assignmentId: "a1", title: "任务" })).toBe("practice:c1:a1");
    expect(activeObjectKey({ kind: "route", courseId: "c1", title: "路线" })).toBe("route:c1");
    expect(activeObjectKey({ kind: "micro", pathId: "p1", knowledgeId: "k1", title: "练习" })).toBe("micro:p1");
    expect(activeObjectKey({ kind: "material", courseId: "c1", materialId: "m1", title: "资料" })).toBe("material:c1:m1");
    expect(activeObjectKey({ kind: "records", title: "记录" })).toBe("records");
    expect(activeObjectKey({ kind: "brief", messageId: "b1", title: "简报" })).toBe("brief:b1");
    expect(activeObjectKey(null)).toBeNull();
  });
});
