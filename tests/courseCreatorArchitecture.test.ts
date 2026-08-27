import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Course Creator persistence and authority boundaries", () => {
  it("allows owner-private Personal Drafts without changing existing Published Personal Courses", () => {
    const migration = read("supabase/migrations/20260827210000_personal_course_creator_drafts.sql");
    expect(migration).toMatch(/course_type = 'personal' and owner_user_id is not null/);
    expect(migration).not.toMatch(/course_type = 'personal'[^\n]*lifecycle = 'published'/);
    expect(migration).toMatch(/'draft','personal',p_owner_user_id/);
    expect(migration).not.toContain("insert into public.user_course_states");
  });

  it("keeps Draft creation transactional and service-role-only", () => {
    const migration = read("supabase/migrations/20260827230000_personal_course_brief_idempotency.sql");
    expect(migration).toContain("create or replace function public.create_personal_course_draft_for_brief");
    expect(migration).toContain("courses_personal_creation_brief_unique");
    expect(migration).toContain("add column sequence bigint generated always as identity");
    expect(read("api/assistant.ts")).toContain('.order("sequence"');
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("if existing_course.lifecycle <> 'draft'");
    expect(migration).toContain("delete from public.curriculum_coverages");
    expect(migration).toMatch(/revoke all on function public\.create_personal_course_draft_for_brief[\s\S]*from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.create_personal_course_draft_for_brief[\s\S]*to service_role/);
  });

  it("keeps AI outside Course mutation and Publish authority", () => {
    const assistant = read("api/assistant.ts");
    expect(assistant).toContain('body.action === "course-creator-proposal"');
    expect(assistant).not.toContain("create_personal_course_draft");
    expect(assistant).not.toMatch(/course-creator-proposal[\s\S]*\.from\("courses"\)\.update/);
  });

  it("adds zero physical Vercel Function entrypoints", () => {
    const entries = readdirSync(resolve(process.cwd(), "api"), { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".ts"));
    expect(entries).toHaveLength(12);
    expect(entries.map((entry) => entry.name)).not.toContain("course-creator.ts");
  });
});
