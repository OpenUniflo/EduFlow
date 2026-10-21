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
  onRunEmpty: () => undefined,
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

it("offers an empty-object run for an all-optional schema and labels dirty runs", () => {
  const html = renderToStaticMarkup(createElement(RunPreparationDialog, {
    ...base,
    dirty: true,
    schema: { type: "object", properties: { comment: { type: "string" } }, additionalProperties: false },
    value: {},
  }));
  expect(html).toContain("使用空对象运行");
  expect(html).toContain("保存并运行");
});

it("shows which nodes consume the startup input", () => {
  const html = renderToStaticMarkup(createElement(RunPreparationDialog, {
    ...base,
    schema: { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false },
    value: { question: "ok" },
    consumers: ["准备对话 · question ← /question", "State.question ← /question"],
  }));
  expect(html).toContain("谁在使用启动输入");
  expect(html).toContain("准备对话 · question ← /question");
  expect(html).toContain("State.question ← /question");
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
