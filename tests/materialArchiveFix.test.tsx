import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({ getDocument: vi.fn(), GlobalWorkerOptions: { workerSrc: "" } }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "" }));
import type { Material } from "@/features/course/types";
import { MaterialPageView } from "@/features/material/reader/MaterialPageView";
import { coursePlaneScale } from "@/features/archive/model/courseFit";
import { selectCurrentChapterId } from "@/features/archive/model/courseCurrentChapter";

const read = (path: string) => readFileSync(path, "utf8");

const article: Material = {
  id: "article", courseId: "course", order: 1, title: "并行执行与结果汇合", type: "article",
  segments: [
    { id: "s1", order: 1, title: "Research Agent 的等待瓶颈", section: "Problem / Scenario", content: { lead: "同时查询多个来源。", bullets: ["Research Agent", "Search Tool"] } },
    { id: "s2", order: 2, title: "并行汇合结构", section: "Diagram / Flow", content: { code: "Planner -> Merge" } }
  ]
};

describe("material panel reuses the reader renderer", () => {
  it("renders the same article slide component as the reader", () => {
    const html = renderToStaticMarkup(<MaterialPageView material={article} segment={article.segments[0]} />);
    expect(html).toContain("atlas-lesson-slide");
    expect(html).toContain("Research Agent 的等待瓶颈");
    expect(html).toContain("同时查询多个来源。");
    expect(html).toContain("Research Agent");
  });

  it("does not keep a second content renderer in the panel", () => {
    const panel = read("src/features/home/MaterialPanel.tsx");
    expect(panel).not.toContain("content.lead");
    expect(panel).not.toContain("content.paragraphs");
    expect(panel).not.toContain("SegmentView");
    expect(panel.match(/MaterialPageView/g)?.length).toBeGreaterThanOrEqual(3);
    const shared = read("src/features/material/reader/MaterialPageView.tsx");
    expect(shared).toContain("MaterialRenderer");
    expect(shared).toContain("segments: [segment]");
  });
});

describe("archive course plane readable default", () => {
  it("keeps the smallest body token readable in the default mode", () => {
    expect(coursePlaneScale({ mode: "readable", fitScale: 0.51, minReadablePx: 12, cardWorldFontPx: 16 })).toBe(0.75);
    expect(coursePlaneScale({ mode: "readable", fitScale: 0.9, minReadablePx: 12, cardWorldFontPx: 16 })).toBe(0.9);
    expect(coursePlaneScale({ mode: "readable", fitScale: 1.4, minReadablePx: 12, cardWorldFontPx: 16 })).toBe(1);
  });

  it("fits every chapter only in the explicit all mode", () => {
    expect(coursePlaneScale({ mode: "all", fitScale: 0.51, minReadablePx: 12, cardWorldFontPx: 16 })).toBe(0.51);
    expect(coursePlaneScale({ mode: "all", fitScale: 0.9, minReadablePx: 12, cardWorldFontPx: 16 })).toBe(0.9);
  });

  it("opens on the learning chapter, then the first unfinished chapter, then the last chapter", () => {
    const chapters = [{ id: "c1", order: 1 }, { id: "c2", order: 2 }];
    expect(selectCurrentChapterId({ chapters, nodes: [
      { id: "n1", chapterId: "c1", lesson: 1, status: "completed" },
      { id: "n2", chapterId: "c2", lesson: 1, status: "learning" }
    ] })).toBe("c2");
    expect(selectCurrentChapterId({ chapters, nodes: [
      { id: "n1", chapterId: "c1", lesson: 1, status: "completed" },
      { id: "n2", chapterId: "c2", lesson: 1, status: "available" }
    ] })).toBe("c2");
    expect(selectCurrentChapterId({ chapters, nodes: [
      { id: "n1", chapterId: "c1", lesson: 1, status: "completed" },
      { id: "n2", chapterId: "c2", lesson: 1, status: "completed" }
    ] })).toBe("c2");
  });

  it("wires readable default, current chapter anchor and explicit fit-all", () => {
    const page = read("src/features/archive/pages/ArchivePage.tsx");
    const scene = read("src/features/archive/components/ArchiveAtlasScene.tsx");
    const chrome = read("src/features/archive/components/ArchiveChrome.tsx");
    expect(page).toContain("selectCurrentChapterId");
    expect(page).toContain('mode: "all"');
    expect(page).toContain("anchorChapterId: currentChapterId");
    expect(scene).toContain("coursePlaneScale");
    expect(scene).toContain('cssVarValue("--fs-12"');
    expect(scene).toContain('cssVarValue("--fs-16"');
    expect(chrome).toContain("右键平移");
    expect(chrome).toContain("适配全图看全部");
  });
});
