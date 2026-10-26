import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RunPreparationDialog } from "./RunPreparationDialog";

const base = {
  draftId: "runtime-input",
  onChange: () => undefined,
  onInvalid: () => undefined,
  busy: false,
  dirty: false,
  inputInvalid: "",
  onCancel: () => undefined,
  onRun: () => undefined,
};

it("allows an explicit empty required text value and enables Run", () => {
  const html = renderToStaticMarkup(createElement(RunPreparationDialog, {
    ...base,
    schema: { type: "object", properties: { finalNote: { type: "string", title: "最终记录" } }, required: ["finalNote"], additionalProperties: false },
    value: { finalNote: "" },
  }));
  expect(html).toContain("最终记录");
  expect(html).not.toContain("请填写此必填字段");
  expect(html).toContain(">运行</button>");
  expect(html).toContain("用 JSON 填写");
  expect(html).not.toContain(">高级 JSON</button>");
  expect(html).not.toMatch(/class="primary" disabled/);
});

it("keeps Run disabled without showing a required-field error before interaction", () => {
  const html = renderToStaticMarkup(createElement(RunPreparationDialog, {
    ...base,
    schema: { type: "object", properties: { finalNote: { type: "string", title: "最终记录" } }, required: ["finalNote"], additionalProperties: false },
    value: {},
  }));
  expect(html).not.toContain("请填写此必填字段");
  expect(html).not.toContain("请先补齐或修正启动输入");
  expect(html).toMatch(/class="primary" disabled/);
});

it("reveals required-field validation when locating an input error", () => {
  const html = renderToStaticMarkup(createElement(RunPreparationDialog, {
    ...base,
    schema: { type: "object", properties: { finalNote: { type: "string", title: "最终记录" } }, required: ["finalNote"], additionalProperties: false },
    value: {},
    focusErrorRequest: 1,
  }));
  expect(html).toContain("请填写此必填字段");
  expect(html).toContain("请先补齐或修正启动输入");
});

it("always uses the single Run action and auto-save note", () => {
  const html = renderToStaticMarkup(createElement(RunPreparationDialog, {
    ...base,
    dirty: true,
    schema: { type: "object", properties: { comment: { type: "string" } }, additionalProperties: false },
    value: {},
  }));
  expect(html).toContain("运行前自动保存");
  expect(html).not.toContain("使用空对象运行");
  expect(html).not.toContain("保存并运行");
});

it("lists preflight issues inline and makes each one actionable", () => {
  const html = renderToStaticMarkup(createElement(RunPreparationDialog, {
    ...base,
    schema: { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false },
    value: { question: "ok" },
    issues: [{ id: "model:answer", title: "为「归纳搜索结果」选择模型", detail: "这个模型节点还没有连接模型。", tab: "node", nodeId: "answer" }],
  }));
  expect(html).toContain("运行前还需要处理 1 项");
  expect(html).toContain("为「归纳搜索结果」选择模型");
});

it("shows an invalid JSON error and blocks Run", () => {
  const html = renderToStaticMarkup(createElement(RunPreparationDialog, {
    ...base,
    inputInvalid: "启动输入 JSON 格式有误",
    schema: { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false },
    value: { question: "ok" },
  }));
  expect(html).toContain("启动输入 JSON 格式有误");
  expect(html).toMatch(/class="primary" disabled/);
});

it("shows the reused-run revision notice and the fields that still need input", () => {
  const html = renderToStaticMarkup(createElement(RunPreparationDialog, {
    ...base,
    schema: { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false },
    value: { question: "HN 上怎么评价 htmx？" },
    reuseNotice: "此运行使用的是保存版本 2；当前编辑为保存版本 3。复用输入会创建当前版本的新运行，不会重放原版本；可先用“查看执行版本的定义与布局”核对。",
    omissions: [{ pointer: "/token", reason: "sensitive" }],
  }));
  expect(html).toContain("当前编辑为保存版本 3");
  expect(html).toContain("复用时没有填入以下字段");
  expect(html).toContain("token");
  expect(html).toContain("敏感字段，需要重新填写");
  expect(html).toContain("HN 上怎么评价 htmx？");
});
