import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { createNodeV2 } from "../../domain/v2/factory";
import { NodePanel } from "./NodePanel";

const node = createNodeV2("core.llm", "node-llm");
node.label = "生成回答";

function render(overrides: Partial<Parameters<typeof NodePanel>[0]> = {}) {
  return renderToStaticMarkup(createElement(NodePanel, {
    node,
    readOnly: false,
    activeTab: "config",
    onTabChange: vi.fn(),
    showRunData: false,
    sections: [
      { id: "inputs", title: "输入", count: 2, content: createElement("p", null, "输入段内容") },
      { id: "advanced", title: "高级", content: createElement("p", null, "高级段内容") },
    ],
    onRename: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }));
}

it("hides the tab strip until run data exists and keeps only the advanced section collapsible", () => {
  const html = render();
  expect(html).not.toContain("运行数据");
  expect(html).toContain("生成回答");
  expect(html).toContain("输入段内容");
  expect(html).toContain("2 项");
  expect(html).not.toContain("高级段内容");
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("模型");
  expect(html).toContain("节点信息");
  expect(html).not.toContain('aria-controls="wf-nodepanel-section-inputs"');
});

it("switches to the run-data tab only when it is available", () => {
  const config = render({ showRunData: true, activeTab: "config", runData: createElement("p", null, "运行数据内容") });
  expect(config).toContain("运行数据");
  expect(config).toContain("输入段内容");
  expect(config).not.toContain("运行数据内容");

  const runData = render({ showRunData: true, activeTab: "runData", runData: createElement("p", null, "运行数据内容") });
  expect(runData).toContain("运行数据内容");
  expect(runData).not.toContain("输入段内容");

  const hidden = render({ showRunData: false, activeTab: "runData", runData: createElement("p", null, "运行数据内容") });
  expect(hidden).not.toContain("运行数据");
  expect(hidden).toContain("输入段内容");
});

it("lets the caller keep a section open and makes the title read-only when configured", () => {
  const html = render({ readOnly: true, sections: [{ id: "advanced", title: "高级", defaultCollapsed: false, content: createElement("p", null, "高级段内容") }] });
  expect(html).toContain("高级段内容");
  expect(html).toContain('aria-label="节点名称"');
  expect(html).toContain('readOnly=""');
});

it("renders expand, duplicate, delete and close actions from props", () => {
  const html = render({ onExpandDebug: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() });
  expect(html).toContain("展开为大窗口");
  expect(html).toContain("更多操作");
  expect(html).toContain("复制节点");
  expect(html).toContain("删除节点");
  expect(html).toContain("关闭节点面板");
  expect(render()).not.toContain("展开为大窗口");
});

it("offers the subgraph canvas as a labelled panel action below the header", () => {
  const html = render({ subgraphNav: { label: "进入子图编辑", description: "打开子图独立画布；返回时恢复此节点、面板与视图", onClick: vi.fn() } });
  const headerEnd = html.indexOf("wf-nodepanel-header");
  const action = html.indexOf("wf-nodepanel-subgraph-enter");
  expect(headerEnd).toBeGreaterThan(-1);
  expect(action).toBeGreaterThan(headerEnd);
  expect(html).toContain("进入子图编辑");
  expect(html).toContain("返回时恢复此节点、面板与视图");
  expect(html).toContain("wf-nodepanel-subgraph-icon");
  expect(render()).not.toContain("wf-nodepanel-subgraph-enter");
});

it("labels a fixed call as 调用工作流 and keeps embedded graphs as 子图", () => {
  const call = createNodeV2("core.subgraph", "node-call");
  call.label = "调用客服";
  call.config = { workflowRef: { workflowId: "target", revision: 2 }, environmentRef: "local", stateMode: "independent", persistence: "per-invocation" };
  const html = renderToStaticMarkup(createElement(NodePanel, {
    node: call,
    readOnly: false,
    activeTab: "config",
    onTabChange: vi.fn(),
    showRunData: false,
    sections: [],
    onRename: vi.fn(),
    onClose: vi.fn(),
    subgraphNav: { label: "打开目标工作流", description: "固定版本 2", onClick: vi.fn() },
  }));
  expect(html).toContain("调用工作流");
  expect(html).not.toContain(">子图<");
  expect(html).toContain("打开目标工作流");
});
