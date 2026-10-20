import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReadableRunOutput } from "./RunOutput";
import type { JsonValue } from "../../domain/v2/types";

it("shows nested direct-tool results as fields while preserving typed falsy values and safe text", () => {
  const value = { data: { total: 0, active: false, note: null, text: "<script>unsafe()</script>" } };
  const before = JSON.stringify(value);
  const html = renderToStaticMarkup(createElement(ReadableRunOutput, { value, text: before }));
  expect(html).toContain('<dl class="wf-data-fields">');
  expect(html).toContain("<dt>total</dt>"); expect(html).toContain(">0</span>");
  expect(html).toContain("否"); expect(html).toContain("空值");
  expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  expect(html).not.toContain('"total":'); expect(JSON.stringify(value)).toBe(before);
});
it("retains ordinary answer text, assistant messages and null explanations instead of expanding their technical envelopes", () => {
  const values: JsonValue[] = [{ answer: "可读答案" }, { messages: [{ role: "assistant", content: [{ text: "可读答案" }] }] }, null];
  for (const value of values) {
    const text = value === null ? "结果为空值（null）" : "可读答案";
    const html = renderToStaticMarkup(createElement(ReadableRunOutput, { value, text }));
    expect(html).toBe(value === null ? text : `<div class="wf-answer-text">${text}</div>`); expect(html).not.toContain("wf-data-fields");
  }
});
