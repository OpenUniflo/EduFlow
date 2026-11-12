import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

const runtime = vi.hoisted(() => ({
  loading: false,
  sending: false,
  replying: false,
  error: "",
  chatMessages: [],
  session: { userId: "viewer", name: "Viewer", role: "student", capabilities: [] },
  stop: vi.fn(),
  send: vi.fn(),
  planGoal: vi.fn(),
  useExistingCourse: vi.fn(),
  refineGoal: vi.fn(),
  prepareCourseBrief: vi.fn()
}));
vi.mock("../AssistantRuntimeContext", () => ({ useAssistantRuntime: () => runtime }));

import { AssistantConversation } from "./AssistantConversation";

const context = { workspace: "explore" as const, experienceMode: "learn" as const, userRole: "student" as const, capabilities: [] };

function render(ownedCapabilities?: readonly ("goal-planning")[]) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={["/archive"]}><AssistantConversation context={context} ownedCapabilities={ownedCapabilities} /></MemoryRouter>);
}

describe("floating Assistant capability ownership", () => {
  it("shows the goal-planning entry when no page owns it", () => {
    expect(render()).toContain("规划学习目标");
  });

  it("hides only the goal-planning entry when a page declares it owns that ability", () => {
    const html = render(["goal-planning"]);
    expect(html).not.toContain("规划学习目标");
    expect(html).toContain("询问 EduFlow…");
  });
});
