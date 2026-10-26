import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

it("renders a product confirm dialog with a danger action and affected downstream", () => {
  const html = renderToStaticMarkup(createElement(ConfirmDialog, {
    title: "删除这条输出？",
    confirmLabel: "仍要删除",
    danger: true,
    onConfirm: () => undefined,
    onCancel: () => undefined,
    children: createElement("div", null, "删除「answer」后，以下下游会受到影响：", createElement("ul", null, createElement("li", null, "整理社区问题"), createElement("li", null, "工作流输出"))),
  }));
  expect(html).toContain("删除这条输出？");
  expect(html).toContain("整理社区问题");
  expect(html).toContain("工作流输出");
  expect(html).toContain("取消");
  expect(html).toContain("仍要删除");
  expect(html).toContain('class="danger"');
  expect(html).toContain("<dialog");
});
