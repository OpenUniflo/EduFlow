import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assistantCardDisplaySchema } from "@/features/assistant/componentCatalog";
import { assignmentStatusPresentation } from "@/shared/learning/assignmentPresentation";
import { knowledgeScopeLabelFor, knowledgeStateLabelFor } from "@/shared/learning/knowledgePresentation";
import { decodePracticeLink, encodePracticeLink } from "@/shared/learning/practiceLink";
import { buildKnowledgeNeighborhood } from "@/features/assistant/knowledgeMiniMap";
import { knowledgeCardDisplay, microCardDisplay, practiceCardDisplay, routeCardDisplay } from "@/features/assistant/cardDisplay";
import type { KnowledgeGraph } from "@/features/knowledge/types";

const read = (path: string) => readFileSync(path, "utf8");

describe("batch 2: one floating object host", () => {
  it("opens the object on the current page instead of navigating Home", () => {
    const conversation = read("src/features/assistant/components/AssistantConversation.tsx");
    expect(conversation).toContain('new CustomEvent("eduflow:open-object"');
    expect(conversation).not.toContain('navigate("/")');
    expect(conversation).not.toContain("eduflow:open-object\", JSON.stringify");
    expect(read("src/features/assistant/GlobalObjectHost.tsx")).toContain('addEventListener("eduflow:open-object"');
    expect(read("src/app/integrations/CapabilityEvidenceBoundary.tsx")).toContain("<GlobalObjectHost");
  });

  it("reuses the Home panels rather than page-specific copies", () => {
    const host = read("src/features/assistant/GlobalObjectHost.tsx");
    expect(host).toContain('from "@/features/home/ObjectPanelSwitch"');
    expect(host).toContain("<ObjectPanelSwitch");
    const shared = read("src/features/home/ObjectPanelSwitch.tsx");
    for (const component of ["KnowledgePanel", "MaterialPanel", "RecordsPanel", "CourseBriefPanel", "HomeRoutePanel", "PracticeObject"]) {
      expect(shared).toContain(`<${component}`);
    }
  });
});

describe("batch 2: one label source", () => {
  it("maps Knowledge state and scope in one shared module", () => {
    expect(knowledgeStateLabelFor("explore")).toBe("未开始");
    expect(knowledgeStateLabelFor("practicing")).toBe("动手任务中");
    expect(knowledgeScopeLabelFor("global")).toBe("公开可见");
    expect(knowledgeScopeLabelFor("tenant")).toBe("组织可见");
    expect(knowledgeScopeLabelFor("user")).toBe("仅自己可见");
    for (const file of [
      "src/features/archive/components/ArchiveChrome.tsx",
      "src/features/archive/components/ArchiveSearchPanel.tsx",
      "src/features/archive/components/ArchiveCoursePanel.tsx",
      "src/features/archive/components/ArchivePeoplePanels.tsx",
      "src/features/profile/pages/ProfileKnowledgePage.tsx",
      "src/features/home/MyPanel.tsx",
      "src/features/home/panelModel.ts"
    ]) {
      expect(read(file)).toContain("knowledgeState");
    }
  });

  it("maps Assignment lifecycle in one shared module", () => {
    expect(assignmentStatusPresentation("submitted", { evaluator: "ai" }).label).toBe("待评价");
    expect(assignmentStatusPresentation("submitted", { evaluator: "teacher" }).label).toBe("待老师评价");
    expect(assignmentStatusPresentation("needs_revision").label).toBe("需要修改");
    expect(read("src/features/assistant/cards/AssistantCardView.tsx")).not.toContain('if (status === "learned") return');
    expect(read("api/_lib/assistantDisplayTool.ts")).not.toContain("const statusLabels");
  });

  it("builds cards through one shared display projection", () => {
    const server = read("api/_lib/assistantDisplayTool.ts");
    const client = read("src/features/assistant/cards/AssistantCardView.tsx");
    for (const builder of ["microCardDisplay", "routeCardDisplay", "practiceCardDisplay", "knowledgeCardDisplay", "courseMatchCardDisplay", "progressCardDisplay"]) {
      expect(server).toContain(builder);
      expect(client).toContain(builder);
    }
    expect(knowledgeCardDisplay({ title: "ReAct", scope: "global", status: "explore" }).meta).toEqual(["公开可见"]);
    expect(knowledgeCardDisplay({ title: "ReAct", scope: "global", status: "explore" }).status?.label).toBe("未开始");
    expect(practiceCardDisplay("practice", { title: "任务", knowledgeCount: 2, status: "submitted" }).status?.label).toBe("待评价");
  });

  it("keeps the card button text aligned with the panel it opens", () => {
    expect(read("src/features/assistant/cards/AssistantCardView.tsx")).toContain("查看课程简介");
    expect(read("src/features/assistant/cards/AssistantCardView.tsx")).toContain('"查看知识点"');
    expect(read("src/features/assistant/components/AssistantTimeline.tsx")).not.toContain("进入课程创建");
  });
});

describe("batch 2: no hard-coded tool or count rules", () => {
  it("declares progress copy in each plugin and renders only the data", () => {
    expect(read("api/_lib/plugins/micro.ts")).toContain('searchMicro: "查找小练习"');
    expect(read("api/_lib/plugins/assignment.ts")).toContain('submitAssignment: "提交动手任务"');
    expect(read("api/_lib/toolProgress.ts")).toContain("assistantPlugins.map((plugin) => plugin.progress)");
    const timeline = read("src/features/assistant/components/AssistantTimeline.tsx");
    expect(timeline).not.toContain("const toolLabel");
    expect(timeline).not.toContain("正在查看课程");
    expect(timeline).not.toContain("toolLabel[toolName]");
  });

  it("does not truncate mentions by type or total", () => {
    const source = read("api/assistant.ts");
    expect(source).not.toContain(".slice(0, 6)");
    expect(source).not.toContain(".slice(0, 4)");
    expect(source).not.toContain("...tasks, ...courseItems");
    expect(source).toContain("total");
    expect(source).toContain("nextCursor");
    expect(read("src/shared/ui/HomeComposer.tsx")).toContain("加载更多");
  });

  it("does not slice the route, Micro steps, recent learning or course matches", () => {
    expect(read("api/_lib/assistantDisplayTool.ts")).not.toContain("slice(start, start + 4)");
    expect(read("api/_lib/assistantDisplayTool.ts")).not.toContain("steps: stepRows.slice(0, 12)");
    expect(read("src/features/assistant/cards/AssistantCardView.tsx")).not.toContain(".slice(0, 12)");
    expect(read("src/features/home/MyPanel.tsx")).not.toContain(".slice(0, 3)");
    expect(read("api/_lib/assistantDisplayTool.ts")).not.toContain("allMatches.slice(0, 3)");
    expect(assistantCardDisplaySchema.parse({ title: "x", steps: Array.from({ length: 13 }, (_, index) => ({ id: String(index), title: "s", state: "quiet" as const })) }).steps).toHaveLength(13);
  });

  it("shares one attachment limit and validator", () => {
    const policy = read("src/shared/assistant/attachments.ts");
    expect(policy).toContain("ATTACHMENT_LIMIT = 4");
    for (const file of ["src/features/home/HomeConversation.tsx", "src/features/learning/pages/LearningPage.tsx"]) {
      expect(read(file)).toContain("@/shared/assistant/attachments");
    }
    expect(read("api/_lib/assistantAttachments.ts")).toContain("ATTACHMENT_LIMIT");
    expect(read("api/_handlers/evidence.ts")).toContain("ATTACHMENT_MAX_BYTES");
  });
});

describe("batch 2: cleanup", () => {
  it("removed unused duplicate components and legacy views", () => {
    for (const file of ["src/features/home/CoursePreviewCard.tsx", "src/features/home/ConversationMicroCard.tsx", "src/features/home/TodayOverview.tsx"]) {
      expect(() => read(file)).toThrow();
    }
    const timeline = read("src/features/assistant/components/AssistantTimeline.tsx");
    expect(timeline).not.toContain("function LegacyCourseSearch(");
    expect(timeline).not.toContain("function LegacyBrief(");
  });

  it("uses click-only Assistant opening", () => {
    const source = read("src/features/assistant/components/EduFlowAssistant.tsx");
    expect(source).not.toContain("hoverSuppressed");
    expect(source).not.toContain("onMouseEnter");
    expect(source).toContain("onClick={toggle}");
  });

  it("has no card-type whitelist and uses a reversible practice link", () => {
    const page = read("src/features/learning/pages/LearningPage.tsx");
    expect(page).not.toContain('hasCardType(presence.pathId, "micro")');
    expect(page).not.toContain('practiceParam.split(":")');
    expect(page).toContain("decodePracticeLink");
    const link = encodePracticeLink("course", "course-cc34:assignment:1");
    expect(decodePracticeLink(link)).toEqual({ courseId: "course", assignmentId: "course-cc34:assignment:1" });
    expect(decodePracticeLink("course:course-cc34:assignment:1")).toEqual({ courseId: "course", assignmentId: "course-cc34:assignment:1" });
  });
});

describe("batch 2: page details", () => {
  it("resolves a direct Micro link without a course and offers a choice when ambiguous", () => {
    const page = read("src/features/learning/micro/MicroLearningExperience.tsx");
    expect(page).toContain("listPathsForKnowledge");
    expect(page).toContain("选择一个小练习");
    expect(read("src/features/learning/micro/ApiMicroLearningRepository.ts")).toContain("listPathsForKnowledge");
  });

  it("gives /courses/create a real next step", () => {
    const page = read("src/features/course/pages/CourseCreationWorkspacePage.tsx");
    expect(page).toContain("打开 EduFlow Assistant 整理简报");
    expect(page).toContain('navigate("/archive")');
    expect(page).toContain('navigate("/")');
  });

  it("does not wrap or clip the course-tree action row and does not repeat 推荐路线", () => {
    const css = read("src/features/course/immersive/immersive.css");
    const actions = css.slice(css.indexOf(".ef-imm-actions {"), css.indexOf("}", css.indexOf(".ef-imm-actions {")) + 1);
    expect(actions).not.toContain("flex-wrap: wrap");
    expect(actions).toContain("white-space: nowrap");
    const page = read("src/features/course/immersive/CourseImmersivePage.tsx");
    expect(page).toContain('routeOn ? "隐藏路线" : "显示路线"');
    expect(page).toContain("currentMarkerCount");
  });

  it("distinguishes the Micro and Assignment on a route step", () => {
    const panel = read("src/features/course/path/CourseRoutePanel.tsx");
    expect(panel).toContain("之后有动手任务");
    expect(panel).not.toContain('"小练习 · 动手任务"');
  });

  it("draws a deterministic mini map with names, a legend and full width", () => {
    const graph = {
      nodes: [
        { id: "center", title: "Center", description: "", scope: "global", status: "active", nodeType: "concept", masteryCriteria: [], tags: [], createdAt: "", updatedAt: "" },
        { id: "b", title: "Beta", description: "", scope: "global", status: "active", nodeType: "concept", masteryCriteria: [], tags: [], createdAt: "", updatedAt: "" }
      ],
      edges: [{ id: "edge-1", source: "center", target: "b", relation: "related", strength: "soft", reason: "", lifecycleStatus: "active", createdAt: "", updatedAt: "" }],
      knowledgeStates: []
    } as unknown as KnowledgeGraph;
    const layout = buildKnowledgeNeighborhood(graph, "center");
    expect(layout.width).toBe(640);
    expect(layout.nodes.every((node) => node.lines.length > 0)).toBe(true);
    expect(layout.nodes.map((node) => [node.id, node.x, node.y])).toEqual(buildKnowledgeNeighborhood(graph, "center").nodes.map((node) => [node.id, node.x, node.y]));
    const card = read("src/features/assistant/cards/AssistantCardView.tsx");
    expect(card).toContain("ef-assistant-map-legend");
    expect(read("src/features/assistant/cards/assistantCards.css")).toContain("width: 100%");
  });

  it("removes the retired learner vocabulary from UI code", () => {
    const files = [
      "src/features/assistant/components/AssistantTimeline.tsx",
      "src/features/assistant/cards/AssistantCardView.tsx",
      "src/features/course/path/CourseRoutePanel.tsx",
      "src/features/course/immersive/CourseImmersivePage.tsx",
      "src/features/profile/pages/ProfileKnowledgePage.tsx",
      "src/features/archive/components/ArchiveChrome.tsx",
      "src/shared/ui/HomeComposer.tsx"
    ];
    for (const file of files) {
      const source = read(file);
      for (const term of ["微学习", "互动微学习", "实训", "实践任务", "快速学习"]) expect(source).not.toContain(term);
    }
  });
});
