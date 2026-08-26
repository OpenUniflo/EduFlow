import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Anonymous Viewer architecture", () => {
  it("hydrates public catalog data before requesting user-owned progress", () => {
    const services = read("src/app/services/applicationServices.ts");
    const app = read("src/app/App.tsx");
    expect(services).toContain("hydratePublicApplicationServices");
    expect(services).toContain("Public catalog hydration never creates a learner identity");
    expect(app).toContain("await hydratePublicApplicationServices()");
    expect(app).toContain('session ? <LearningPage');
    expect(app).toContain('<PublicHomePage />');
  });

  it("keeps personal, progress, draft, and Assistant tables unavailable to anon", () => {
    const migration = read("supabase/migrations/20260826190000_anonymous_public_learning.sql");
    expect(migration).toContain("knowledge_nodes_anon_public_read");
    expect(migration).toContain("courses_anon_public_read");
    expect(migration).toContain("micro_learning_paths_anon_public_read");
    for (const table of ["profiles", "user_knowledge_states", "user_course_states", "user_assignment_states", "user_material_states", "assistant_sessions", "assistant_messages", "course_authoring_drafts"]) {
      expect(migration).not.toMatch(new RegExp(`grant\\s+[^;]*${table}[^;]*\\s+to\\s+anon`, "i"));
    }
  });

  it("allows anonymous target metadata only through the parent Course visibility boundary", () => {
    const migration = read("supabase/migrations/20260827090000_goal_courses_and_personal_visibility.sql");
    expect(migration).toContain("course_target_knowledge_anon_public_read");
    expect(migration).toMatch(/course_target_knowledge_anon_public_read[\s\S]*?using \(public\.can_read_course\(course_id\)\)/);
    expect(migration).toMatch(/course\.course_type = 'personal' and course\.owner_user_id = \(select auth\.uid\(\)\)/);
    expect(migration).toMatch(/courses_teacher_update[\s\S]*?using \(course_type = 'standard'/);
    expect(migration).toMatch(/revoke all on function public\.create_personal_course[\s\S]*from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.create_personal_course[\s\S]*to service_role/);
  });

  it("does not introduce a fake guest learner identity", () => {
    const sources = ["src/app/App.tsx", "src/app/services/applicationServices.ts", "src/app/pages/PublicHomePage.tsx", "src/features/learning/micro/ApiMicroLearningRepository.ts"].map(read).join("\n");
    expect(sources).not.toMatch(/userId\s*[:=]\s*["']guest["']/);
    expect(sources).not.toMatch(/fake guest/i);
  });

  it("locks Guest Assistant UI without mounting the conversation runtime", () => {
    const assistant = read("src/features/assistant/components/EduFlowAssistant.tsx");
    expect(assistant).toContain("locked ?");
    expect(assistant).toContain("AssistantConversation");
    expect(assistant).toContain("登录后使用 EduFlow Assistant");
  });
});
