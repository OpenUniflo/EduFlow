import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import { NodeTestResult, NodeTestRunner } from "./NodeTestPanel";

it("disables the node test with its own reason and shows it next to the button", () => {
  const definition = createWorkflowV2();
  const node = createNodeV2("core.tool", "search");
  const html = renderToStaticMarkup(createElement(NodeTestRunner, {
    definition,
    node,
    environmentRef: "local",
    input: {},
    blockedReason: "搜索 的 hits 输出是列表，但字段 hits 是文本",
  }));
  expect(html).toMatch(/class="primary wf-test-run" disabled=""/);
  expect(html).toContain("先修复本节点：搜索 的 hits 输出是列表，但字段 hits 是文本");
});

it("leads with the run-data style write summary and keeps the raw return collapsed", () => {
  const definition = createWorkflowV2();
  const node = createNodeV2("core.tool", "search");
  const html = renderToStaticMarkup(createElement(NodeTestResult, {
    node,
    elapsed: 1234,
    result: {
      mode: "test",
      input: { query: "react" },
      output: { hits: Array.from({ length: 5 }, (_, index) => ({ title: `story ${index}`, _highlightResult: { title: { value: "x" } }, exhaustiveNbHits: true })), nbHits: 5 },
      writes: { hits: Array.from({ length: 5 }, (_, index) => ({ title: `story ${index}` })) },
      stateBefore: {},
      stateAfter: { hits: [{ title: "story" }] },
    },
  }));
  expect(html).toContain("写入的数据");
  expect(html).toContain("这条测试写入流程数据的字段 · 1 项");
  expect(html).toContain(">hits<");
  expect(html).toContain("列表");
  expect(html).toContain("5 条");
  expect(html).toContain("耗时 1.2s");
  expect(html).toContain("<summary>完整返回</summary>");
  expect(html).not.toMatch(/<details class="wf-test-raw" open/);
  expect(html).toContain("_highlightResult");
  expect(html).toContain("exhaustiveNbHits");
});

it("never renders an unstructured raw return as the first test result", () => {
  const definition = createWorkflowV2();
  const node = createNodeV2("core.tool", "search");
  const html = renderToStaticMarkup(createElement(NodeTestResult, {
    node,
    elapsed: null,
    result: { mode: "test", input: {}, output: { hits: [], _highlightResult: { title: "secret" } }, writes: {}, stateBefore: {}, stateAfter: {} },
  }));
  expect(html).toContain("这条测试没有写入流程数据");
  expect(html.indexOf("完整返回")).toBeLessThan(html.indexOf("_highlightResult"));
});
