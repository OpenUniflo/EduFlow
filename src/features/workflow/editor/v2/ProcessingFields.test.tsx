// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { Binding, WorkflowNodeV2, WorkflowTool } from "../../domain/v2/types";
import { createNodeV2 } from "../../domain/v2/factory";
import { ProcessingFields } from "./ProcessingFields";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stateBinding = (pointer: string): Binding => ({ source: "state", pointer, onMissing: { mode: "error" } });

const tool: WorkflowTool = {
  ref: "hn_search",
  name: "Hacker News 搜索",
  description: "搜索 Hacker News",
  contractDigest: "5ff7",
  inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["limit"] },
  available: true,
};

function Harness({ base, tools, commits }: { base: WorkflowNodeV2; tools: WorkflowTool[]; commits: Partial<WorkflowNodeV2>[] }) {
  const [node, setNode] = useState(base);
  return <ProcessingFields node={node} tools={tools} onChange={updates => {
    commits.push(updates);
    setNode(current => ({ ...current, ...updates }));
  }} />;
}

function mount(node: WorkflowNodeV2, tools: WorkflowTool[], commits: Partial<WorkflowNodeV2>[]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Harness base={node} tools={tools} commits={commits} />));
  return host;
}

function refreshButton(host: HTMLElement): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find(button => button.textContent === "刷新工具配置");
}

afterEach(() => {
  document.body.innerHTML = "";
});

it("offers a refresh when the digest differs and keeps same-named bindings", () => {
  const node = createNodeV2("core.tool", "search");
  node.config = { toolRef: "hn_search", contractDigest: "old" };
  node.inputs = { query: stateBinding("/keywords"), stale: { source: "literal", value: "x" } };
  const commits: Partial<WorkflowNodeV2>[] = [];
  const host = mount(node, [tool], commits);

  expect(host.textContent).toContain("工具定义已更新");
  const button = refreshButton(host);
  expect(button).toBeDefined();
  act(() => button?.click());

  expect(commits).toEqual([{
    config: { toolRef: "hn_search", contractDigest: "5ff7" },
    inputs: { query: stateBinding("/keywords") },
  }]);
  expect(host.textContent).toContain("已移除参数：stale");
  expect(host.textContent).toContain("需补充的必填参数：limit");
});

it("does not offer a refresh when the digest already matches", () => {
  const node = createNodeV2("core.tool", "search");
  node.config = { toolRef: "hn_search", contractDigest: "5ff7" };
  const host = mount(node, [tool], []);
  expect(host.textContent).not.toContain("工具定义已更新");
  expect(refreshButton(host)).toBeUndefined();
});

it("does not offer a refresh for an unavailable tool", () => {
  const node = createNodeV2("core.tool", "search");
  node.config = { toolRef: "hn_search", contractDigest: "old" };
  const host = mount(node, [{ ...tool, available: false }], []);
  expect(refreshButton(host)).toBeUndefined();
});
