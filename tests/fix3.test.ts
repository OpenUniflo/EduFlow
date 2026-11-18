import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("fix 3: one panel dispatch", () => {
  it("keeps target conversion and panel rendering in one module", () => {
    const switchSource = read("src/features/home/ObjectPanelSwitch.tsx");
    const targetSource = read("src/features/home/panelForTarget.ts");
    expect(targetSource).toContain("export function panelForTarget");
    expect(switchSource).toContain("export function ObjectPanelSwitch");
    for (const file of ["src/features/learning/pages/LearningPage.tsx", "src/features/assistant/GlobalObjectHost.tsx"]) {
      const source = read(file);
      expect(source).toContain('from "@/features/home/ObjectPanelSwitch"');
      expect(source).toContain('from "@/features/home/panelForTarget"');
    }
    for (const component of ["HomeRoutePanel", "KnowledgePanel", "MaterialPanel", "RecordsPanel", "CourseBriefPanel", "PracticeObject"]) {
      expect(switchSource).toContain(`<${component}`);
    }
  });
});

describe("fix 3: floating Assistant footprint", () => {
  it("declares one shared safe area and uses it for page controls", () => {
    const frame = read("src/shared/styles/page-frame.css");
    expect(frame).toContain("--ef-assistant-trigger-size");
    expect(frame).toContain("--ef-assistant-safe-right");
    expect(read("src/features/course/immersive/immersive.css")).toContain("right: var(--ef-assistant-safe-right)");
    expect(read("src/features/archive/pages/archive3d.css")).toContain("right: var(--ef-assistant-safe-right)");
    expect(read("src/shared/styles/product.css")).toContain("var(--ef-floating-avoid-right");
  });

  it("marks every right panel that the trigger must move outside", () => {
    for (const file of [
      "src/features/archive/components/ArchiveChrome.tsx",
      "src/features/material/reader/MaterialKnowledgeContext.tsx"
    ]) {
      expect(read(file)).toContain("data-floating-panel");
    }
    expect(read("src/features/assistant/GlobalObjectHost.tsx")).toContain("dataFloatingPanel: true");
    expect(read("src/shared/ui/ObjectShell.tsx")).toContain('data-floating-panel={dataFloatingPanel ? "true" : undefined}');
    expect(read("src/features/course/immersive/CourseImmersivePage.tsx")).toContain("dataFloatingPanel");
    expect(read("src/features/assistant/components/EduFlowAssistant.tsx")).toContain('"[data-floating-panel]"');
  });
});

describe("fix 3: Course Creator empty state", () => {
  it("uses the product Assistant name and a direct next step", () => {
    const page = read("src/features/course/pages/CourseCreationWorkspacePage.tsx");
    expect(page).toContain("EduFlow Assistant");
    expect(page).toContain("还没有课程创建简报。");
    expect(page).toContain("打开 EduFlow Assistant 整理简报");
    expect(page).not.toContain("打开 Assistant 整理简报");
    expect(page).not.toContain("请从 Assistant 的课程创建简报");
  });

  it("uses the token glass panel instead of a plain white box", () => {
    const page = read("src/features/course/pages/CourseCreationWorkspacePage.tsx");
    expect(page).toContain("creator-error ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24");
    expect(page).not.toContain("creator-error glass-v2");
    const css = read("src/shared/styles/product.css");
    expect(css).toContain(".creator-error-head");
    expect(css).toContain("var(--sp-32)");
    expect(css).toContain("var(--r-12)");
    expect(css).toContain("var(--sh-2)");
  });
});
