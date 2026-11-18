import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NotFoundPage } from "./PlaceholderPages";

describe("404 page (N50)", () => {
  it("renders the 404 explanation with real Home/Archive actions", () => {
    const html = renderToStaticMarkup(<NotFoundPage onHome={vi.fn()} onArchive={vi.fn()} />);
    expect(html).toContain("404");
    expect(html).toContain("找不到这个页面");
    expect(html).toContain("回到首页");
    expect(html).toContain("打开档案");
    expect(html).toContain("搜索课程、知识点或页面");
    expect(html).toContain("⌘K");
  });
});
