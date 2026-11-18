import { describe, expect, it } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createDisplayCardTool, type AssistantDisplayCardState } from "./assistantDisplayTool";
import { readableCourse } from "./assistantTools";

function courseClient(course: Record<string, unknown>, role = "student") {
  return {
    from(table: string) {
      const query: any = {
        select() { return query; },
        eq() { return query; },
        maybeSingle: async () => ({
          data: table === "courses" ? course : table === "profiles" ? { role } : null,
          error: null
        })
      };
      return query;
    }
  } as unknown as SupabaseClient;
}

const user = { id: "u1" } as User;
const state: AssistantDisplayCardState = { accepted: 0 };

describe("assistant display card permissions", () => {
  it("hides a draft Course from a learner but allows a teacher", async () => {
    const draft = { id: "course-1", title: "草稿课程", lifecycle: "draft" };
    expect(await readableCourse(courseClient(draft, "student"), user, "course-1")).toBeNull();
    expect(await readableCourse(courseClient(draft, "teacher"), user, "course-1")).toEqual(draft);
  });

  it("accepts a published Course for a learner", async () => {
    const published = { id: "course-1", title: "公开课程", lifecycle: "published" };
    expect(await readableCourse(courseClient(published, "student"), user, "course-1")).toEqual(published);
  });

  it("does not cap the number of cards by count", async () => {
    const tool = createDisplayCardTool({} as SupabaseClient, user, { workspace: "learning", experienceMode: "learn" }, { accepted: 3 });
    const result = await tool.execute?.({ cardType: "knowledge", nodeId: "node-1" }, { toolCallId: "call-1", messages: [] } as never);
    expect(result).not.toEqual({ skipped: "card_limit_reached" });
    expect(result).toEqual({ skipped: "card_lookup_failed" });
  });

  it("skips an invalid or unavailable nomination without failing the answer", async () => {
    const tool = createDisplayCardTool(courseClient({ id: "course-1", title: "公开课程", lifecycle: "published" }), user, { workspace: "learning", experienceMode: "learn" }, state);
    // The fake client has no Knowledge row, so the nomination is skipped.
    const result = await tool.execute?.({ cardType: "knowledge", nodeId: "missing" }, { toolCallId: "call-2", messages: [] } as never);
    expect(result).toEqual({ skipped: "card_not_available" });
  });
});
