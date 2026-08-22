import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { activateCourse, requireCourseKnowledge, requirePublishedCourse } from "./courseMembership";

function client(input: { lifecycle?: string; covered?: boolean } = {}) {
  const upsert = vi.fn(async () => ({ data: null, error: null }));
  const fake = {
    from(table: string) {
      if (table === "user_course_states") return { upsert };
      const row = table === "courses" ? (input.lifecycle ? { id: "course", lifecycle: input.lifecycle } : null) : (input.covered ? { id: "coverage" } : null);
      const chain = { eq: () => chain, limit: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
      return { select: () => chain };
    }
  } as unknown as SupabaseClient;
  return { fake, upsert };
}

describe("Course membership server boundary", () => {
  it("accepts only published learner Courses", async () => {
    await expect(requirePublishedCourse(client({ lifecycle: "published" }).fake, "course")).resolves.toMatchObject({ id: "course" });
    await expect(requirePublishedCourse(client({ lifecycle: "draft" }).fake, "course")).rejects.toMatchObject({ status: 404 });
  });
  it("requires factual Course coverage before accepting a Knowledge context", async () => {
    await expect(requireCourseKnowledge(client({ lifecycle: "published", covered: true }).fake, "course", "knowledge")).resolves.toBeUndefined();
    await expect(requireCourseKnowledge(client({ lifecycle: "published", covered: false }).fake, "course", "knowledge")).rejects.toMatchObject({ status: 400 });
  });
  it("activates membership without deleting any progress row", async () => {
    const { fake, upsert } = client({ lifecycle: "published" });
    await activateCourse(fake, "user", "course");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user", course_id: "course", is_active: true }));
  });
});
