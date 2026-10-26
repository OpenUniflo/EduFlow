import { expect, it } from "vitest";
import { bindingOptionReason, startInputOptions } from "./BindingSelect";

it("disables an incompatible input source and names the field type", () => {
  expect(bindingOptionReason({ type: "string" }, { type: "array", items: { type: "object" } })).toBe("列表，类型不符");
  expect(bindingOptionReason({ type: "array" }, { type: "string" })).toBe("文本，类型不符");
  expect(bindingOptionReason({ type: "string" }, { type: "string" })).toBeUndefined();
  expect(bindingOptionReason({}, { type: "array" })).toBeUndefined();
});

it("lists only real workflow startup inputs, never tool parameter names", () => {
  const startInputSchema = { type: "object", properties: { question: { type: "string", title: "问题" } } };
  const names = startInputOptions(startInputSchema).map(([name]) => name);
  expect(names).toEqual(["question"]);
  expect(names).not.toContain("query");
});

it("checks a tool parameter against the startup input type, not the tool Schema", () => {
  const question = startInputOptions({ type: "object", properties: { question: { type: "string" } } })[0][1];
  expect(bindingOptionReason({ type: "number" }, question)).toBe("文本，类型不符");
  expect(bindingOptionReason({ type: "string" }, question)).toBeUndefined();
});

it("marks a field written only by later nodes without hiding a usable field", () => {
  expect(bindingOptionReason({ type: "string" }, { type: "string" }, true)).toBe("后续节点才会写入");
  expect(bindingOptionReason({ type: "string" }, { type: "string" }, false)).toBeUndefined();
});
