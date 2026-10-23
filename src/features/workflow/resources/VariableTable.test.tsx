import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { VariableEnvironment, WorkflowConfiguration } from "../domain/v2/types";
import { VariableTable, VariableTableEditor, type VariableTableEditorProps } from "./VariableTable";

const configuration: WorkflowConfiguration = {
  revision: 3,
  variables: [
    { key: "API_BASE", value: "https://example.com", overrides: {}, description: "接口地址" },
    { key: "RETRY_COUNT", value: 2, overrides: {} },
    { key: "FEATURE_ON", value: true, overrides: {} },
  ],
};

const environments: VariableEnvironment[] = [
  { id: "dev", name: "开发", description: "本地调试", order: 0 },
  { id: "prod", name: "正式", description: "线上", order: 1 },
];

const environmentConfiguration: WorkflowConfiguration = {
  revision: 4,
  variables: [
    { key: "API_BASE", value: "https://example.com", overrides: { dev: "https://dev.example.com" }, description: "接口地址" },
    { key: "RETRY_COUNT", value: 2, overrides: { prod: 5 } },
  ],
  environments,
  defaultEnvironmentId: "dev",
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
  activeTab: "default",
  editingEnvironmentId: null,
  pendingDeleteEnvironmentId: null,
  onSelectTab: () => undefined,
  onOpenEnvironment: () => undefined,
  onCloseEnvironment: () => undefined,
  onCreateEnvironment: () => undefined,
  onRenameEnvironment: () => undefined,
  onChangeEnvironmentDescription: () => undefined,
  onMoveEnvironment: () => undefined,
  onSetDefaultEnvironment: () => undefined,
  onRequestDeleteEnvironment: () => undefined,
  onConfirmDeleteEnvironment: () => undefined,
  onCancelDeleteEnvironment: () => undefined,
  onSetEnvironmentValue: () => undefined,
  onClearEnvironmentValue: () => undefined,
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
  it("renders the six columns, both variable tabs and editable default values", () => {
    const html = renderToStaticMarkup(createElement(VariableTable, { configuration }));
    expect(html).toContain("默认值");
    expect(html).toContain("变量环境");
    for (const heading of ["名称", "类型", "默认值", "说明", "引用", "删除"]) expect(html).toContain(`<th>${heading}</th>`);
    expect(html).toContain("API_BASE");
    expect(html).toContain("接口地址");
    expect(html).toContain("RETRY_COUNT");
    expect(html).toContain("FEATURE_ON");
    expect(html).toContain("maxLength=\"300\"");
    expect(html).toContain("保存变量");
  });

  it("uses only the user-visible variable-environment concept", () => {
    const html = renderToStaticMarkup(createElement(VariableTable, { configuration: environmentConfiguration }));
    expect(html).not.toContain("运行环境");
    expect(html).toContain("变量环境");
    expect(html).toContain("默认值");
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
    expect(dirty).toContain("默认值、变量环境与覆盖值会一次保存");
    const busy = renderToStaticMarkup(createElement(VariableTableEditor, editorProps({ busy: true })));
    expect(busy).toContain("正在保存…");
  });

  it("reserves the variable creation form and shows the node-intent hint", () => {
    const html = renderToStaticMarkup(createElement(VariableTableEditor, editorProps({ create: true })));
    expect(html).toContain("新增变量");
    expect(html).toContain("正在为节点新增变量");
  });

  it("manages variable environments with rename, description, order, default and delete controls", () => {
    const html = renderToStaticMarkup(createElement(VariableTableEditor, editorProps({ configuration: environmentConfiguration, activeTab: "environments" })));
    expect(html).toContain("变量环境（2）");
    expect(html).toContain('data-environment-id="dev"');
    expect(html).toContain('data-environment-field="name"');
    expect(html).toContain("开发");
    expect(html).toContain("本地调试");
    expect(html).toContain("覆盖 1 个变量");
    expect(html).toContain("编辑取值");
    expect(html).toContain("设为默认变量环境 开发");
    expect(html).toContain("上移变量环境 开发");
    expect(html).toContain("不使用默认环境");
    expect(html).toContain("新建变量环境");
    expect(html).toContain("+ 新建环境");
  });

  it("edits one environment's values and offers inheritance recovery", () => {
    const html = renderToStaticMarkup(createElement(VariableTableEditor, editorProps({
      configuration: environmentConfiguration,
      activeTab: "environments",
      editingEnvironmentId: "dev",
    })));
    for (const heading of ["名称", "类型", "该环境值", "继承默认值"]) expect(html).toContain(`<th>${heading}</th>`);
    expect(html).toContain("返回环境列表");
    expect(html).toContain("默认变量环境");
    expect(html).toContain("https://dev.example.com");
    expect(html).toContain("恢复继承");
    expect(html).toContain("继承默认值（2）");
    expect(html).toContain("是 · 默认值 2");
    expect(html).toContain('data-environment-value="RETRY_COUNT"');
  });

  it("shows the delete confirmation with the override count", () => {
    const html = renderToStaticMarkup(createElement(VariableTableEditor, editorProps({ configuration: environmentConfiguration, activeTab: "environments", pendingDeleteEnvironmentId: "dev" })));
    expect(html).toContain("删除变量环境「开发」");
    expect(html).toContain("1 个覆盖值");
    expect(html).toContain("默认环境会改为剩余第一个");
    expect(html).toContain("确认删除");
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
