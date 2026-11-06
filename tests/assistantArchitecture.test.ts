import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Global Assistant architecture", () => {
  it("streams AI SDK UI message parts from one bounded answer loop", () => {
    const source = read("api/assistant.ts");
    expect(source).toContain("streamText");
    expect(source).toContain("stepCountIs(TOOL_LOOP_MAX_STEPS)");
    expect(source).toContain("toUIMessageStream");
    expect(source).toContain("pipeUIMessageStreamToResponse");
    expect(source).toContain("createDisplayCardTool");
    expect(source).toContain("createProtocolGuardTransform");
    expect(source).toContain("createAssistantTools");
    expect(source).not.toContain("pipeTextStreamToResponse");
    expect(source).not.toContain('toolChoice: "none"');
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

  it("persists ordered parts and forward-migrates legacy structured content", () => {
    const migration = read("supabase/migrations/20261107120000_assistant_timeline_parts.sql");
    const source = read("api/assistant.ts");
    expect(migration).toContain("add column if not exists parts jsonb");
    expect(migration).toContain("add column if not exists dedupe_key text");
    expect(migration).toContain("assistant_session_id");
    expect(source).toContain("timelineParts(row)");
    expect(source).toContain("persistedParts(");
    expect(source).toContain("planningMessageId");
    expect(source).toContain('body.action === "refine-goal"');
    expect(source).toContain('body.action === "prepare-course-brief"');
    expect(source).not.toContain('body.action === "create-personal-course"');
  });

  it("guards protocol text while streaming and never persists it", () => {
    const source = read("api/assistant.ts");
    const guard = read("api/_lib/streamProtocolGuard.ts");
    expect(guard).toContain("createProtocolGuardTransform");
    expect(guard).toContain("protocolLeakInProgress");
    expect(source).toContain("hasAssistantProtocolLeak(text)");
    expect(source).toContain("persistedParts");
    expect(read("supabase/migrations/20261105233000_assistant_message_invalid_reason.sql")).toContain("invalid_reason");
  });

  it("keeps Next Action authority outside the LLM while exposing the deterministic decision", () => {
    const source = read("api/assistant.ts");
    expect(source).toContain("EduFlow has an authoritative deterministic Navigation Engine");
    expect(source).not.toContain("There is no authoritative Navigation Engine");
    expect(read("api/_lib/assistantTools.ts")).toContain("getNavigationDecision");
    expect(read("api/_lib/assistantTools.ts")).toContain("readNavigationDecision(client, user.id, resolvedCourseId)");
    expect(read("api/_handlers/navigation.ts")).toContain("readNavigationDecision(client, user.id, courseId)");
  });

  it("requires learner-facing Chinese display names without internal identifiers", () => {
    const source = read("api/assistant.ts");
    expect(source).toContain("Learner-facing prose must be natural Simplified Chinese");
    expect(source).toContain("Never print tool or function names");
    expect(source).toContain("Micro = 小练习");
    expect(source).toContain("Cards are part of the answer, never page state");
    expect(source).toContain("at most 3 cards");
    expect(source).toContain("Answer first");
    expect(source).toContain("Do not interrogate");
    expect(source).toContain("Do not persist");
    expect(source).toContain("Always leave an exit");
  });

  it("uses @ai-sdk/react useChat and message.parts, with no hand-written stream reader", () => {
    const runtime = read("src/features/assistant/AssistantRuntimeContext.tsx");
    const client = read("src/features/assistant/assistantClient.ts");
    expect(runtime).toContain("useChat");
    expect(runtime).toContain("chatMessages");
    expect(runtime).toContain("DefaultChatTransport");
    expect(client).not.toContain("getReader()");
    expect(client).not.toContain("TextDecoder");
    expect(read("src/features/assistant/components/AssistantTimeline.tsx")).toContain("message.parts");
  });

  it("renders Markdown without raw HTML", () => {
    const markdown = read("src/features/assistant/cards/AssistantMarkdown.tsx");
    expect(markdown).toContain("react-markdown");
    expect(markdown).toContain("remark-gfm");
    expect(markdown).toContain("skipHtml");
    expect(markdown).not.toContain('from "rehype-raw"');
  });

  it("uses one physical Assistant entrypoint and the shared full-chat route", () => {
    expect(read("src/app/App.tsx")).toContain('path="/messages/*"');
    expect(read("build/local-api-vite-plugin.ts")).toContain('["/api/assistant", assistantHandler]');
  });

  it("records the active session from the response header without a manual stream parser", () => {
    expect(read("src/features/assistant/AssistantRuntimeContext.tsx")).toContain("X-Assistant-Session-Id");
    expect(read("src/features/assistant/AssistantRuntimeContext.tsx")).toContain("window.localStorage.setItem(storageKey, sessionId)");
  });

  it("keeps button actions outside the model and evaluation results server-written", () => {
    const source = read("api/assistant.ts");
    const timeline = read("api/_lib/assistantTimeline.ts");
    const evaluation = read("api/_lib/assignmentAiEvaluation.ts");
    expect(source).toContain('body.action === "record-action"');
    expect(timeline).toContain("recordButtonAction");
    expect(timeline).toContain("dedupe_key");
    expect(evaluation).toContain("recordEvaluationTimeline");
  });
});
