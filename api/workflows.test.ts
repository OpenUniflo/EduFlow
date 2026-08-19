import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("workflow hydration route", () => {
  it("reads authenticated built-in templates through the server client while keeping user state user-scoped", () => {
    const source = readFileSync(join(process.cwd(), "api/workflows.ts"), "utf8");
    expect(source).toContain('import { createServerSupabase, createUserSupabase } from "./_lib/supabase.js"');
    expect(source).toContain('createServerSupabase().from("workflow_templates").select("definition").order("id")');
    expect(source).toContain('client.from("user_workflow_definitions").select("definition").eq("owner_user_id", user.id)');
  });
});
