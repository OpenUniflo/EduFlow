import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Course-scoped learner action membership", () => {
  it("keeps Standalone startKnowledge mutation-free from Course membership and validates Course-scoped starts", () => {
    const learning = source("api/_handlers/learning.ts");
    expect(learning).toContain("if (body.courseId)");
    expect(learning).toContain("requireCourseKnowledge(client, body.courseId, body.nodeId)");
    expect(learning).toContain("activateCourse(client, user.id, body.courseId)");
  });
  it("activates Course Micro including a Global fallback used in explicit Course context", () => {
    const micro = source("api/_handlers/micro.ts");
    expect(micro).toContain("if (body.contextCourseId)");
    expect(micro).toContain("requireCourseKnowledge(client, body.contextCourseId, text(path, \"knowledge_id\"))");
    expect(micro).toContain("activateCourse(client, user.id, body.contextCourseId)");
    expect(micro).toContain("if (pathCourseId && pathCourseId !== body.contextCourseId)");
  });
  it("activates Course Material progress and Assignment start while deactivation remains non-destructive", () => {
    const progress = source("api/_handlers/progress.ts");
    const learning = source("api/_handlers/learning.ts");
    expect(progress).toContain("is_active: true, recent_lesson_id");
    expect(progress).toContain("update({ is_active: false");
    expect(progress).not.toMatch(/deactivate-course[\s\S]{0,500}\.delete\(/);
    expect(learning).toContain("is_active: true, updated_at: now");
  });
});
