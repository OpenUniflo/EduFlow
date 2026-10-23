import { expect, it } from "vitest";
import { compatible, options, schemaOptions, typeLabel, types } from "./bindingTypes";

it("resolves local Schema refs and keeps every declared type", () => {
  const root = { $defs: { text: { type: "string" } }, properties: { note: { $ref: "#/$defs/text" }, maybe: { type: ["integer", "null"] } } };
  expect(types(root.properties.note, root)).toEqual(["string"]);
  expect(types(root.properties.maybe, root)).toEqual(["integer", "null"]);
  expect(types({})).toEqual([]);
});

it("treats integer and number as compatible both ways and never blocks an undeclared side", () => {
  expect(compatible(["integer"], ["number"])).toBe(true);
  expect(compatible(["number"], ["integer"])).toBe(true);
  expect(compatible(["string"], ["number"])).toBe(false);
  expect(compatible([], ["number"])).toBe(true);
  expect(compatible(["string"], [])).toBe(true);
});

it("labels declared types in Chinese and falls back to an explicit undeclared label", () => {
  expect(typeLabel(["string", "null"])).toBe("文本或空值");
  expect(typeLabel(["integer"])).toBe("整数");
  expect(typeLabel([])).toBe("类型未声明");
});

it("lists top-level Schema properties with escaped pointers and title labels", () => {
  const list = schemaOptions({ type: "object", properties: { "a/b~c": { type: "string", title: "斜杠字段" }, plain: { type: "number" } } });
  expect(list).toEqual([
    { pointer: "/a~1b~0c", label: "斜杠字段", types: ["string"] },
    { pointer: "/plain", label: "plain", types: ["number"] },
  ]);
  expect(options).toBe(schemaOptions);
});
