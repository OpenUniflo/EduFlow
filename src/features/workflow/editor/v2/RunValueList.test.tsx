import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RunValueList } from "./RunValueList";

it("shows a compact list summary and collapses deep nested payloads instead of narrowing keys", () => {
  const value = { hits: [{ _highlightResult: { title: { value: "Bun", exhaustiveNbHits: true } } }] };
  const html = renderToStaticMarkup(createElement(RunValueList, { value }));
  expect(html).toContain(">hits<");
  expect(html).toContain("列表");
  expect(html).toContain("1 条");
  expect(html).toContain('<dt title="_highlightResult">_highlightResult</dt>');
  expect(html).toContain("展开详细数据");
  expect(html).toContain("exhaustiveNbHits");
});
