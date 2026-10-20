import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { BindingFields } from "./BindingFields";
import { createNodeV2 } from "../../domain/v2/factory";
import type { JsonSchema, JsonValue } from "../../domain/v2/types";

const inputSchema: JsonSchema = { type: "object", properties: { orderId: { type: "string", title: "订单号" }, payload: { $ref: "#/$defs/args", title: "完整参数" } }, $defs: { args: { type: "object", properties: { orderId: { type: "string" } } } } };
function render(pointer: string, fallback?: JsonValue) {
  const node = createNodeV2("core.tool", "tool");
  node.inputs = { arguments: { source: "input", pointer, onMissing: fallback === undefined ? { mode: "error" } : { mode: "default", value: fallback } } };
  const onChange = vi.fn();
  const html = renderToStaticMarkup(createElement(BindingFields, { node, inputSchema, stateSchema: { type: "object" }, literalSchemas: { arguments: { type: "object", properties: { orderId: { type: "string" } } } }, onChange }));
  return { html, node, onChange };
}
it("makes the whole input object a named choice instead of an empty field placeholder", () => {
  const { html } = render("");
  expect(html).toContain("全部图调用数据（对象）");
  expect(html).toContain("工具参数（整个对象）");
  expect(html).not.toContain("请选择字段");
});
it("prevents choosing a scalar field for an entire tool arguments object and keeps compatible local refs usable", () => {
  const { html } = render("");
  expect(html).toMatch(/<option[^>]*value="\/orderId"[^>]*disabled=""[^>]*>订单号（文本，与对象不兼容）<\/option>/);
  expect(html).toContain('<option value="/payload">完整参数（对象）</option>');
});
it("preserves an existing incompatible binding and explains its repair without silently changing the definition", () => {
  const { html, node, onChange } = render("/orderId");
  expect(html).toContain('value="/orderId"');
  expect(html).toContain("当前读取的字段类型不兼容");
  expect(html).toContain("不会自动包装");
  expect(node.inputs.arguments).toMatchObject({ source: "input", pointer: "/orderId" });
  expect(onChange).not.toHaveBeenCalled();
});
it("does not disable an existing binding whose explicit missing-value object can satisfy the target", () => {
  const { html, node, onChange } = render("/orderId", { orderId: "A1001" });
  expect(html).toContain('<option value="/orderId" selected="">订单号（文本）</option>');
  expect(html).not.toContain("当前读取的字段类型不兼容");
  expect(node.inputs.arguments).toMatchObject({ onMissing: { mode: "default", value: { orderId: "A1001" } } });
  expect(onChange).not.toHaveBeenCalled();
});
