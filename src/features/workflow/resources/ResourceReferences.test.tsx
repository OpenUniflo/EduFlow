import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ResourceReferenceRow } from "../domain/v2/types";
import { ResourceReferences } from "./ResourceReferences";

const row: ResourceReferenceRow = {
  workflowId: "wf-1", workflowName: "社区问题分流", revision: 3, graphPath: [], nodeId: "classify", nodeLabel: "分类", modelRef: "deepseek-chat", version: 2,
};

describe("ResourceReferences", () => {
  it("shows loading, error and empty states", () => {
    expect(renderToStaticMarkup(createElement(ResourceReferences, { rows: null, loading: true }))).toContain("正在读取引用");
    expect(renderToStaticMarkup(createElement(ResourceReferences, { rows: null, error: "网络错误" }))).toContain("网络错误");
    expect(renderToStaticMarkup(createElement(ResourceReferences, { rows: [] }))).toContain("暂无工作流引用此资源");
    expect(renderToStaticMarkup(createElement(ResourceReferences, { rows: [], emptyText: "变量未被读取。" }))).toContain("变量未被读取");
  });

  it("shows the workflow, revision, node and model detail with a locate action", () => {
    const html = renderToStaticMarkup(createElement(ResourceReferences, { rows: [row], onOpen: () => undefined }));
    expect(html).toContain("社区问题分流");
    expect(html).toContain("修订 v3");
    expect(html).toContain("分类");
    expect(html).toContain("模型 deepseek-chat");
    expect(html).toContain("定位节点");
  });

  it("shows variable references and subgraph paths", () => {
    const html = renderToStaticMarkup(createElement(ResourceReferences, {
      rows: [{ ...row, modelRef: undefined, variableKey: "API_BASE", graphPath: ["sub", "inner"], nodeLabel: "请求" }],
    }));
    expect(html).toContain("变量 API_BASE");
    expect(html).toContain("子图：sub / inner");
    expect(html).not.toContain("定位节点");
  });
});
