import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Material } from "@/features/course/types";
import { MaterialOutline } from "./MaterialOutline";

const material: Material = {
  id: "m1",
  courseId: "c1",
  order: 1,
  title: "深入理解 AI Agent（完整原书）",
  type: "pdf",
  source: { kind: "pdf", pageCount: 307 },
  segments: Array.from({ length: 307 }, (_, index) => ({ id: `s${index + 1}`, order: index + 1, page: index + 1 }))
};

describe("MaterialOutline", () => {
  it("renders one chapter header and only the visible window, never all 307 rows", () => {
    const html = renderToStaticMarkup(<MaterialOutline material={material} activeSegmentId="s300" collapsed={false} onToggle={vi.fn()} onSelect={vi.fn()} />);
    expect(html).toContain("共 307 页");
    expect(html).toContain("全书");
    expect((html.match(/atlas-outline-row/g) ?? []).length).toBeLessThan(307);
    expect((html.match(/atlas-outline-row/g) ?? []).length).toBeGreaterThan(0);
  });
});
