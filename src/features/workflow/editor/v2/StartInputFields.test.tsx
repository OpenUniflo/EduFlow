import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import { StartInputFields } from "./StartInputFields";

it("shows the startup contract, State initializers and direct/indirect consumers", () => {
  const definition = createWorkflowV2("订单");
  definition.inputSchema = { type: "object", properties: { orderId: { type: "string", title: "订单号" }, question: { type: "string", title: "客户诉求" } }, required: ["orderId", "question"], additionalProperties: false };
  definition.state.schema = { type: "object", properties: { query: { type: "string" } }, additionalProperties: false };
  definition.state.inputBindings = { query: { source: "input", pointer: "/question", onMissing: { mode: "error" } } };
  definition.nodes.push({
    ...createNodeV2("core.transform", "prepare"),
    label: "准备对话",
    inputs: { question: { source: "input", pointer: "/question", onMissing: { mode: "error" } }, query: { source: "state", pointer: "/query", onMissing: { mode: "error" } } },
  });
  const html = renderToStaticMarkup(createElement(StartInputFields, { definition, onChange: () => undefined }));
  expect(html).toContain("启动输入契约");
  expect(html).toContain("订单号");
  expect(html).toContain("State · query");
  expect(html).toContain("准备对话 · question ← /question");
  expect(html).toContain("State.query ← /question");
  expect(html).toContain("通过 State 间接读取的节点：准备对话");
});
