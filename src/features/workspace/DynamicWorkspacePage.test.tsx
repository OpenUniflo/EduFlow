import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { DynamicWorkspacePage } from "./DynamicWorkspacePage";
import type { MockSession } from "@/features/auth/types";

vi.mock("@/features/assistant/components/EduFlowAssistant", () => ({ EduFlowAssistant: () => null }));
vi.mock("@/app/services/applicationServices", () => ({
  applicationServices: {
    courseRepository: { listCourseRuntimes: () => [{
      course: { id: "agentic-ai", title: "智能体系统设计与实践", description: "真实课程", lifecycle: "published" },
      chapters: [{ id: "foundations", title: "概念与问题建模", order: 1 }],
      lessons: [{ id: "lesson", chapterId: "foundations" }],
      curriculumCoverages: [{ lessonId: "lesson", nodeId: "task-env" }],
      assignments: [],
    }] },
    knowledgeRepository: { getVisibleGraph: () => ({ nodes: [{ id: "task-env", title: "任务环境" }], edges: [] }) },
    userKnowledgeRepository: { getUserKnowledge: () => [{ nodeId: "task-env", status: "learned" }], subscribe: () => () => undefined },
    learningProgressRepository: { getCourseState: () => ({ isActive: true, assignmentStates: {}, materialStates: {}, updatedAt: "" }), subscribe: () => () => undefined },
    domainGovernanceRepository: { load: () => ({ domains: [{ id: "agent", name: "智能体", status: "active" }], assignments: [{ nodeId: "task-env", domainId: "agent" }], candidates: [], proposals: [], revision: 1 }) },
  },
}));

const session: MockSession = { userId: "student", name: "student", email: "student@example.com", role: "student", capabilities: [], createdAt: "2026-01-01" };

it("renders the published course instead of the static prototype", () => {
  const html = renderToStaticMarkup(<MemoryRouter><DynamicWorkspacePage session={session} /></MemoryRouter>);
  expect(html).toContain("智能体系统设计与实践");
  expect(html).toContain("概念与问题建模");
  expect(html).toContain("资源中心");
  expect(html).not.toContain("prototype.html");
  expect(html).not.toContain("127.0.0.1:8765");
});
