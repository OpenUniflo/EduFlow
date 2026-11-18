import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AssistantCardView, type AssistantCardActions } from "@/features/assistant/cards/AssistantCardView";
import { AssistantTimeline } from "@/features/assistant/components/AssistantTimeline";
import type { AssistantUIMessage } from "@/features/assistant/AssistantRuntimeContext";
import type { MockSession } from "@/features/auth/types";

const session = { userId: "user", name: "测试", email: "test@example.test", role: "student" } as MockSession;
const actions: AssistantCardActions = {
  openCourse: () => undefined,
  openPractice: () => undefined,
  openBrief: () => undefined,
  openMaterial: () => undefined,
  openKnowledgePanel: () => undefined
};

const knowledgeDisplay = { title: "工作流", kicker: "知识点", status: { label: "已学", tone: "ok" as const }, actionLabel: "查看知识点" };
const knowledgePart = (id: string) => ({
  type: "tool-displayCard" as const,
  toolCallId: id,
  state: "output-available" as const,
  input: { cardType: "knowledge" as const, nodeId: "K1" },
  output: { card: { cardType: "knowledge" as const, nodeId: "K1" }, display: knowledgeDisplay }
});

describe("answer cards are stable", () => {
  it("keeps every card in its own message even when they reference the same object", () => {
    const messages: AssistantUIMessage[] = [
      { id: "m1", role: "assistant", parts: [knowledgePart("call-1")], metadata: { createdAt: "2026-11-08T00:00:00Z" } },
      { id: "m2", role: "assistant", parts: [knowledgePart("call-2")], metadata: { createdAt: "2026-11-08T00:01:00Z" } }
    ];
    const html = renderToStaticMarkup(<MemoryRouter><AssistantTimeline messages={messages} session={session} actions={actions} sending={false} /></MemoryRouter>);
    expect(html.match(/data-card-type="knowledge"/g)).toHaveLength(2);
    expect(html).not.toContain("data-answer-correction");
  });

  it("renders a knowledge card without any Micro entry or practice start", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AssistantCardView output={knowledgePart("call-1").output} session={session} actions={actions} cardKey="call-1" /></MemoryRouter>);
    expect(html).toContain("知识点档案");
    expect(html).toContain("查看知识点");
    expect(html).not.toContain("data-micro-action");
    expect(html).not.toContain("开始这道小练习");
  });
});
