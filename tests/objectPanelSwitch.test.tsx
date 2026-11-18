import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { panelForTarget } from "@/features/home/panelForTarget";
import { initialRightPanelState, reduceRightPanel, type RightPanel } from "@/features/home/rightPanel";

const read = (path: string) => readFileSync(path, "utf8");

describe("one Object Shell dispatch for every host", () => {
  it("uses the same conversion and render switch in Home and the global host", () => {
    for (const file of ["src/features/learning/pages/LearningPage.tsx", "src/features/assistant/GlobalObjectHost.tsx"]) {
      const source = read(file);
      expect(source).toContain('from "@/features/home/ObjectPanelSwitch"');
      expect(source).toContain('from "@/features/home/panelForTarget"');
      expect(source).toContain("panelForTarget");
      expect(source).toContain("<ObjectPanelSwitch");
      for (const component of ["HomeRoutePanel", "KnowledgePanel", "MaterialPanel", "RecordsPanel", "CourseBriefPanel", "PracticeObject"]) {
        expect(source).not.toContain(`<${component}`);
      }
    }
    const shared = read("src/features/home/ObjectPanelSwitch.tsx");
    for (const component of ["HomeRoutePanel", "KnowledgePanel", "MaterialPanel", "RecordsPanel", "CourseBriefPanel", "PracticeObject"]) {
      expect(shared).toContain(`<${component}`);
    }
  });

  it("converts every target identity in one place", () => {
    expect(panelForTarget({ kind: "route", courseId: "course", chapterId: "chapter", nodeId: "node" })).toEqual({ kind: "route", courseId: "course", chapterId: "chapter", nodeId: "node" });
    expect(panelForTarget({ kind: "knowledge", nodeId: "node" })).toEqual({ kind: "knowledge", nodeId: "node" });
    expect(panelForTarget({ kind: "material", courseId: "course", materialId: "material", segmentId: "segment" })).toEqual({ kind: "material", courseId: "course", materialId: "material", segmentId: "segment" });
    expect(panelForTarget({ kind: "records" })).toEqual({ kind: "records" });
    expect(panelForTarget({ kind: "brief", messageId: "message" })).toEqual({ kind: "brief", messageId: "message" });
    expect(panelForTarget({ kind: "practice", courseId: "course", assignmentId: "task", attemptId: "attempt" })).toMatchObject({ kind: "practice", courseId: "course", assignmentId: "task", attemptId: "attempt" });
  });

  it("accepts the shared panel action in the right-panel reducer", () => {
    const panel: RightPanel = { kind: "material", courseId: "course", materialId: "material" };
    expect(reduceRightPanel(initialRightPanelState(), { type: "open-panel", panel }).current).toEqual(panel);
  });
});
