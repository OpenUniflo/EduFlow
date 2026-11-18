import { describe, expect, it } from "vitest";
import { buildArchiveSummary, buildPanelPeople, buildRecentLearning, buildTeacherReminders, panelSectionSource } from "./panelModel";
import { homeBoundaryMessage, resolveHomeBoundary } from "./homeBoundary";
import { microImmersiveHref, microSurfaceForPath } from "@/features/learning/micro/microSurface";

const people = [
  { id: "p1", displayName: "示例 · 阿青", handle: "@a", accent: "cyan" as const, visibility: "public" as const, sharedKnowledgeCount: 12, activityLabel: "示例", sample: true },
  { id: "p2", displayName: "示例 · 许澄", handle: "@x", accent: "rose" as const, visibility: "private" as const, sharedKnowledgeCount: 4, activityLabel: "示例", sample: true }
];

describe("My panel real / preview boundary", () => {
  it("marks only the followed-people section as preview", () => {
    expect(panelSectionSource("people")).toBe("preview");
    for (const section of ["courses", "recent", "practices", "archive", "teacher"] as const) expect(panelSectionSource(section)).toBe("real");
  });

  it("renders a public preview person, a private unshared person and a real empty state", () => {
    expect(buildPanelPeople({ people, selectedPersonId: "p1" })).toMatchObject({ state: "visible", marker: "预览 · 示例数据" });
    expect(buildPanelPeople({ people, selectedPersonId: "p2" }).state).toBe("private");
    expect(buildPanelPeople({ people: [], selectedPersonId: null })).toMatchObject({ state: "empty", marker: "真实空态" });
  });

  it("derives recent learning, archive counts and teacher reminders from real records", () => {
    const records = [
      { nodeId: "n1", status: "learning" as const, updatedAt: "2026-01-02" },
      { nodeId: "n2", status: "learned" as const, updatedAt: "2026-01-01" },
      { nodeId: "n3", status: "mastered" as const }
    ];
    const titles = new Map([["n1", "工具调用"], ["n2", "谓词逻辑"]]);
    expect(buildRecentLearning(records, titles)[0]).toMatchObject({ id: "n1", title: "工具调用" });
    expect(buildArchiveSummary(records, titles)).toMatchObject({ learned: 1, learning: 1, mastered: 1, recentTitle: "工具调用" });
    expect(buildTeacherReminders([{ status: "submitted", learnerName: "A" }, { status: "accepted", learnerName: "B" }])[0]).toMatchObject({ count: 1, source: "real" });
  });
});

describe("Home boundary state", () => {
  it("is driven by real loading, error and new-user inputs", () => {
    expect(resolveHomeBoundary({ loading: true, activeKnowledgeCount: 3, activeCourseCount: 1, hasAnyLearningRecord: true })).toBe("loading");
    expect(resolveHomeBoundary({ loading: false, error: "network", activeKnowledgeCount: 3, activeCourseCount: 1, hasAnyLearningRecord: true })).toBe("ready");
    expect(resolveHomeBoundary({ loading: false, activeKnowledgeCount: 0, activeCourseCount: 0, hasAnyLearningRecord: false })).toBe("new-user");
    expect(resolveHomeBoundary({ loading: false, activeKnowledgeCount: 1, activeCourseCount: 0, hasAnyLearningRecord: true })).toBe("ready");
    expect(homeBoundaryMessage("error")).toContain("重试");
  });
});

describe("Micro surface switching", () => {
  const step = { id: "s", kind: "summary" as const, title: "s", body: "b" };
  it("keeps one-unit micro in the card and opens multi-unit micro in the workspace", () => {
    expect(microSurfaceForPath({ units: [{ id: "u", pathId: "p", title: "u", position: 0, estimatedMinutes: 1, required: true, steps: [step] }] })).toBe("inline");
    expect(microSurfaceForPath({ units: [{ id: "u", pathId: "p", title: "u", position: 0, estimatedMinutes: 1, required: true, steps: [step] }, { id: "v", pathId: "p", title: "v", position: 1, estimatedMinutes: 1, required: true, steps: [step] }] })).toBe("panel");
  });

  it("keeps the immersive route as the object-shell expansion target", () => {
    expect(microImmersiveHref("k 1", { courseId: "c", pathId: "p", returnTo: "/" })).toEqual({
      to: "/learn/micro/k%201?courseId=c&pathId=p",
      state: { returnTo: "/" }
    });
  });
});
