import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Course-scoped learner action membership", () => {
  it("allows Knowledge state mutation only through a validated real Material action", () => {
    const learning = source("api/_handlers/learning.ts");
    expect(learning).not.toContain('body.action === "start-knowledge"');
    expect(learning).toContain('body.action === "start-material"');
    expect(learning).toContain("requireCourseKnowledge(client, body.courseId, body.nodeId)");
    expect(learning).toContain('from("material_knowledge_coverages")');
    expect(learning).toContain("activateCourse(client, user.id, body.courseId)");
  });
  it("activates Course Micro including a Global fallback used in explicit Course context", () => {
    const micro = source("api/_handlers/micro.ts");
    expect(micro).toContain("if (body.contextCourseId)");
    expect(micro).toContain("requireCourseKnowledge(client, body.contextCourseId, text(path, \"knowledge_id\"))");
    expect(micro).toContain('rpc("start_micro_for_route_v2"');
    const migration = source("supabase/migrations/20261002061940_personal_course_route_versions_v2.sql");
    expect(migration).toContain("insert into user_course_states(user_id,course_id,is_active,updated_at)");
    expect(migration).toContain("assert_personal_route_micro_v2(p_user_id,effective_course,p.knowledge_id,p_expected_version_id,p_route_node_ids)");
    expect(micro).toContain("if (pathCourseId && pathCourseId !== body.contextCourseId)");
  });
  it("activates Course Material progress and Assignment start while deactivation remains non-destructive", () => {
    const progress = source("api/_handlers/progress.ts");
    const learning = source("api/_handlers/learning.ts");
    expect(progress).toContain("is_active: true, recent_lesson_id");
    expect(progress).toContain("update({ is_active: false");
    expect(progress).not.toMatch(/deactivate-course[\s\S]{0,500}\.delete\(/);
    expect(learning).toContain("await activateCourse(client, user.id, body.courseId)");
  });
});
