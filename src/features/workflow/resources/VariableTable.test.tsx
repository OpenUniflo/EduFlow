import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowConfiguration } from "../domain/v2/types";
import { VariableTable, VariableTableEditor, type VariableTableEditorProps } from "./VariableTable";

const configuration: WorkflowConfiguration = {
  revision: 3,
  variables: [
    { key: "API_BASE", value: "https://example.com", overrides: {}, description: "接口地址" },
    { key: "RETRY_COUNT", value: 2, overrides: {} },
    { key: "FEATURE_ON", value: true, overrides: {} },
  ],
};

const editorProps = (patch: Partial<VariableTableEditorProps> = {}): VariableTableEditorProps => ({
  configuration,
  baseline: configuration,
  loading: false,
  loadError: "",
  busy: false,
  conflict: "",
  error: "",
  notice: "",
  referenceRows: [],
  referencesLoading: false,
  referenceError: "",
  openReferenceKey: null,
  onAdd: () => undefined,
  onChange: () => undefined,
  onRemove: () => undefined,
  onSave: () => undefined,
  onReload: () => undefined,
  onToggleReferences: () => undefined,
  ...patch,
});

describe("VariableTable", () => {
  it("renders the six columns, the single default-value tab and editable values", () => {
    const html = renderToStaticMarkup(createElement(VariableTable, { configuration }));
    expect(html).toContain("默认值");
    for (const heading of ["名称", "类型", "默认值", "说明", "引用", "删除"]) expect(html).toContain(`<th>${heading}</th>`);
    expect(html).toContain("API_BASE");
    expect(html).toContain("接口地址");
    expect(html).toContain("RETRY_COUNT");
    expect(html).toContain("FEATURE_ON");
    expect(html).toContain("maxLength=\"300\"");
    expect(html).toContain("保存变量");
  });

  it("does not offer per-run-environment overrides", () => {
    const html = renderToStaticMarkup(createElement(VariableTable, { configuration }));
    expect(html).not.toContain("运行环境");
    expect(html).not.toContain("覆盖");
    expect(html).toContain("变量环境切换将在后续版本提供");
  });

  it("shows the empty state and load errors", () => {
    const empty = renderToStaticMarkup(createElement(VariableTable, { configuration: { revision: 0, variables: [] } }));
    expect(empty).toContain("还没有变量");
    const failed = renderToStaticMarkup(createElement(VariableTable, { configuration: null, loadError: "变量服务不可用" }));
    expect(failed).toContain("变量服务不可用");
  });

  it("shows the loading state before the configuration arrives", () => {
    const html = renderToStaticMarkup(createElement(VariableTable, { configuration: null, loading: true }));
    expect(html).toContain("正在读取变量");
  });
});

describe("VariableTableEditor", () => {
  it("renders the revision-conflict notice with an explicit refresh action", () => {
    const html = renderToStaticMarkup(createElement(VariableTableEditor, editorProps({ conflict: "保存冲突：服务器上的变量已更新。请刷新后重新编辑；当前表格内容已保留。" })));
    expect(html).toContain("保存冲突");
    expect(html).toContain("刷新服务器版本");
    expect(html).toContain("当前表格内容已保留");
  });

  it("renders the saved revision notice", () => {
    const html = renderToStaticMarkup(createElement(VariableTableEditor, editorProps({ notice: "变量已保存为修订 v4；后续运行使用新配置，已有运行保留启动时的值。" })));
    expect(html).toContain("修订 v4");
    expect(html).toContain("启动时的值");
  });

  it("marks dirty tables and shows the busy label", () => {
    const dirty = renderToStaticMarkup(createElement(VariableTableEditor, editorProps({
      configuration: { ...configuration, variables: [...configuration.variables, { key: "NEW_KEY", value: "", overrides: {} }] },
    })));
    expect(dirty).toContain("有未保存的修改");
    const busy = renderToStaticMarkup(createElement(VariableTableEditor, editorProps({ busy: true })));
    expect(busy).toContain("正在保存…");
  });

  it("reserves the variable creation form and shows the node-intent hint", () => {
    const html = renderToStaticMarkup(createElement(VariableTableEditor, editorProps({ create: true })));
    expect(html).toContain("新增变量");
    expect(html).toContain("正在为节点新增变量");
  });

  it("renders reference counts and opens a reference list", () => {
    const onToggleReferences = vi.fn();
    const html = renderToStaticMarkup(createElement(VariableTableEditor, editorProps({
      referenceRows: [{ workflowId: "wf", workflowName: "客服分流", revision: 2, graphPath: [], nodeId: "request", nodeLabel: "请求", variableKey: "API_BASE" }],
      openReferenceKey: "API_BASE",
      onToggleReferences,
    })));
    expect(html).toContain("1 处");
    expect(html).toContain("引用位置 · API_BASE");
    expect(html).toContain("客服分流");
  });
});
