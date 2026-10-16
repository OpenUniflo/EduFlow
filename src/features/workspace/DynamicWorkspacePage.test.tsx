import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { DynamicWorkspacePage } from "./DynamicWorkspacePage";
import { graphFrameSrc } from "./graphFrame";
import type { MockSession } from "@/features/auth/types";

const session: MockSession = { userId: "student", name: "student", email: "student@example.com", role: "student", capabilities: [], createdAt: "2026-01-01" };

it("maps the three workspace entries onto one white graph", () => {
  expect(graphFrameSrc("ability")).toBe("/dynamic-workspace/graph/index.html?embed=1&bare=1&view=ability");
  expect(graphFrameSrc("world")).toContain("view=world");
  expect(graphFrameSrc("lane")).toContain("view=lane");
  const html = renderToStaticMarkup(<MemoryRouter><DynamicWorkspacePage session={session} onLogout={() => undefined} /></MemoryRouter>);
  expect(html).toContain("/dynamic-workspace/graph/index.html?embed=1&amp;bare=1&amp;view=ability");
  expect(html).toContain("课程技能树");
  expect(html).toContain("能力模型");
  expect(html).toContain("课程路线");
  expect(html).toContain("不会另起一个模型");
  expect(html).not.toContain("127.0.0.1:8765");
});
