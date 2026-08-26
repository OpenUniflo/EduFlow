import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Global Assistant architecture", () => {
  it("uses AI SDK Core for streaming and bounded multi-step tools", () => {
    const source = read("api/assistant.ts");
    expect(source).toContain("streamText");
    expect(source).toContain("stepCountIs(4)");
    expect(source).toContain("result.consumeStream()");
    expect(source).toContain("createAssistantTools");
    expect(source).not.toMatch(/while\s*\(|for\s*\([^)]*tool/);
  });

  it("authenticates server-side and persists user-owned sessions with RLS", () => {
    const source = read("api/assistant.ts");
    const migration = read("supabase/migrations/20260826160000_global_assistant.sql");
    expect(source).toContain("createUserSupabase(request)");
    expect(source).not.toContain("body.userId");
    expect(migration).toContain("assistant_sessions_own_all");
    expect(migration).toContain("assistant_messages_own_all");
    expect(migration).toContain("auth.uid()");
  });

  it("keeps Next Action authority outside the LLM", () => {
    expect(read("api/assistant.ts")).toContain("There is no authoritative Navigation Engine");
  });

  it("uses one physical Assistant entrypoint and the shared full-chat route", () => {
    expect(read("src/app/App.tsx")).toContain('path="/messages/*"');
    expect(read("build/local-api-vite-plugin.ts")).toContain('["/api/assistant", assistantHandler]');
  });

  it("records the active session as soon as streaming response headers arrive", () => {
    expect(read("src/features/assistant/assistantClient.ts")).toContain("onSession?.(sessionId)");
    expect(read("src/features/assistant/AssistantRuntimeContext.tsx")).toContain("window.localStorage.setItem(storageKey, sessionId)");
  });
});
