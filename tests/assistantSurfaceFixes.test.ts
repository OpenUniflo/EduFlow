import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Assistant surface isolation and layout", () => {
  it("lets a page declare the Assistant capability it owns", () => {
    expect(read("src/features/archive/pages/ArchivePage.tsx")).toContain('ownedCapabilities={ARCHIVE_OWNED_CAPABILITIES}');
    expect(read("src/features/assistant/components/EduFlowAssistant.tsx")).toContain("ownedCapabilities");
    expect(read("src/features/assistant/components/AssistantConversation.tsx")).toContain('ownedCapabilities.includes("goal-planning")');
    expect(read("src/features/assistant/components/AssistantConversation.tsx")).toContain("aria-pressed={goalMode}");
  });

  it("uses a separate conversation source per contextual surface", () => {
    const runtime = read("src/features/assistant/AssistantRuntimeContext.tsx");
    expect(runtime).toContain("sourceRef");
    expect(runtime).toContain("source: sourceRef.current");
    expect(read("src/features/assistant/AssistantSurfaceContext.tsx")).toContain("assistantSessionScopeForPath");
    expect(read("src/features/archive/pages/ArchivePage.tsx")).toContain("ASSISTANT_ARCHIVE_PANEL_SOURCE");
    expect(read("src/features/home/ConversationHistory.tsx")).toContain("assistantSessionSourceLabel");
  });

  it("binds the Archive panel to its request and hides map hits when collapsed", () => {
    const page = read("src/features/archive/pages/ArchivePage.tsx");
    expect(page).toContain("const visibleAssistant = assistantOpen ? assistant : EMPTY_PRESENTATION");
    expect(page).toContain("planningMessageId");
    expect(page).not.toContain("A new assistant result reopens the assistant");
    expect(read("src/features/archive/components/ArchiveAssistantPanel.tsx")).toContain("onReplan();");
  });

  it("keeps floating panel content inside its 360px panel and marks the goal mode", () => {
    const css = read("src/features/assistant/assistantSurface.css");
    expect(css).toContain("overflow-x: clip");
    expect(css).toContain('.conversation-composer-actions button[aria-pressed="true"]');
    expect(css).toContain("width: min(360px");
  });
});
