import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { createNodeV2 } from "../../domain/v2/factory";
import { currentNodeTypeVersion } from "../../domain/v2/nodeVersions";
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

it("hides the tab strip until run data exists and renders numbered collapsible sections", () => {
  const html = render();
  expect(html).not.toContain("运行数据");
  expect(html).toContain("生成回答");
  expect(html).toContain("输入段内容");
  expect(html).toContain(">2<");
  expect(html).not.toContain("高级段内容");
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("模型");
  expect(html).toContain(`core.llm · v${currentNodeTypeVersion("core.llm")}`);
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

it("renders expand-debug, more, close and footer actions from props", () => {
  const html = render({ onExpandDebug: vi.fn(), footer: createElement("span", null, "运行到此节点") });
  expect(html).toContain("展开调试");
  expect(html).toContain("更多操作");
  expect(html).toContain("关闭节点面板");
  expect(html).toContain("运行到此节点");
  expect(render()).not.toContain("展开调试");
});
