import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createNodeV2, createWorkflowV2, stateBinding } from "../../domain/v2/factory";
import { withStateField } from "../../domain/v2/stateAuthoring";
import { StateFields } from "./StateFields";

it("marks fields without a writer in grey and offers deletion for an unread orphan", () => {
  const definition = withStateField(withStateField(createWorkflowV2(), "sentiment", "string"), "tone", "string");
  const html = renderToStaticMarkup(createElement(StateFields, { definition, onChange: () => undefined }));
  expect(html).toContain("没有节点写入");
  expect(html).toContain("wf-state-no-writer");
  expect(html).toContain('aria-label="删除字段 sentiment"');
  expect(html).toContain('aria-label="删除字段 tone"');
});

it("does not offer quick deletion while a downstream node still reads the field", () => {
  const base = withStateField(createWorkflowV2(), "sentiment", "string");
  const reader = { ...createNodeV2("core.function", "reader"), inputs: { input: stateBinding("/sentiment") } };
  const definition = { ...base, nodes: [...base.nodes, reader] };
  const html = renderToStaticMarkup(createElement(StateFields, { definition, onChange: () => undefined }));
  expect(html).toContain("没有节点写入");
  expect(html).toContain("但仍被下游读取");
  expect(html).not.toContain('aria-label="删除字段 sentiment"');
});

it("offers a drafted field-name input and blocks it for a shared field", () => {
  const base = withStateField(createWorkflowV2(), "type", "string");
  const writer = createNodeV2("core.llm", "model");
  writer.writes = { type: "/type" };
  const shared = renderToStaticMarkup(createElement(StateFields, {
    definition: { ...base, nodes: [...base.nodes, writer, { ...createNodeV2("core.function", "second"), writes: { type: "/type" } }] },
    onChange: () => undefined,
  }));
  expect(shared).toContain('aria-label="type 字段名"');
  expect(shared).toContain("有 2 个节点写入此字段，不能直接改名");
  const single = renderToStaticMarkup(createElement(StateFields, {
    definition: { ...base, nodes: [...base.nodes, writer] },
    onChange: () => undefined,
  }));
  expect(single).toContain('aria-label="type 字段名"');
  expect(single).not.toContain("有 2 个节点写入此字段");
});
