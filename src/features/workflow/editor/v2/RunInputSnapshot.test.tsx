import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { WorkflowRunV2 } from "../../domain/v2/types";
import { RunInputSnapshot } from "./RunInputSnapshot";

const base: WorkflowRunV2 = {
  runId: "run", workflowId: "workflow", revision: 2, mode: "live", verification: "unverified", status: "success",
  definitionHash: "definition", semanticHash: "semantic", compileFingerprint: "fingerprint", environmentRef: "local", environmentRevision: "1", policyVersion: "1",
  createdAt: "2026-10-21T00:00:00Z", lastSeq: 1,
  inputReuse: { available: true, complete: false, fields: [{ pointer: "/orderId", value: "A1001" }, { pointer: "/question", value: "何时发货？" }], removedFields: [{ pointer: "/token", reason: "sensitive" }] },
};

it("shows the safe input snapshot, omissions and a revision mismatch warning", () => {
  const html = renderToStaticMarkup(createElement(RunInputSnapshot, { run: base, currentRevision: 3 }));
  expect(html).toContain("启动输入快照");
  expect(html).toContain("修订 2");
  expect(html).toContain("部分脱敏");
  expect(html).toContain("orderId");
  expect(html).toContain("A1001");
  expect(html).toContain("未包含的输入字段");
  expect(html).toContain("token");
  expect(html).toContain("敏感字段");
  expect(html).toContain("当前编辑为修订 3");
});

it("marks a complete snapshot and does not warn on the same revision", () => {
  const complete: WorkflowRunV2 = { ...base, inputReuse: { available: true, complete: true, fields: [{ pointer: "/orderId", value: "A1001" }] } };
  const html = renderToStaticMarkup(createElement(RunInputSnapshot, { run: complete, currentRevision: 2 }));
  expect(html).toContain("完整");
  expect(html).not.toContain("当前编辑为修订");
});

it("explains when no reusable snapshot exists", () => {
  const empty: WorkflowRunV2 = { ...base, inputReuse: undefined };
  const html = renderToStaticMarkup(createElement(RunInputSnapshot, { run: empty, currentRevision: 2 }));
  expect(html).toContain("没有可展示的输入快照");
});

it("explains that caller-provided input is read-only and is not reused from a redacted snapshot", () => {
  const html = renderToStaticMarkup(createElement(RunInputSnapshot, { run: base, currentRevision: 3, readOnly: true }));
  expect(html).toContain("调用方输入");
  expect(html).toContain("不会复用脱敏字段");
});
