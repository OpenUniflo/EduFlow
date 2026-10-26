import { describe, expect, it } from "vitest";
import { historyRunBannerText, historyRunSelection } from "./historySelection";

describe("historyRunSelection", () => {
  it("keeps a selected node panel and opens its run-data tab", () => {
    expect(historyRunSelection(true)).toEqual({ keepNodePanel: true, tab: "node", nodeTab: "execution", clearSelection: false, resetGraph: false });
  });

  it("falls back to the run panel when no node is selected", () => {
    expect(historyRunSelection(false)).toEqual({ keepNodePanel: false, tab: "run", clearSelection: true, resetGraph: true });
  });
});

describe("historyRunBannerText", () => {
  it("includes time, status and frozen variable environment name", () => {
    expect(historyRunBannerText({ createdAt: "2026-01-02T03:04:05.000Z", variableEnvironment: "开发" }, "运行成功", () => "2026/1/2 11:04:05"))
      .toBe("正在查看历史运行 · 2026/1/2 11:04:05 · 运行成功 · 开发");
  });

  it("omits the environment segment when the run has no variable environment", () => {
    expect(historyRunBannerText({ createdAt: "2026-01-02T03:04:05.000Z", variableEnvironment: null }, "运行成功", () => "时间"))
      .toBe("正在查看历史运行 · 时间 · 运行成功");
  });
});
