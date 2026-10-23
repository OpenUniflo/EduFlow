import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { JsonSchema, JsonValue } from "../../domain/v2/types";
import { buildPickerGroups, filterPickerGroups, firstEnabledIndex, nextPickerIndex, pickerKeyAction, visiblePickerEntries, VariablePicker } from "./VariablePicker";

const inputSchema: JsonSchema = { type: "object", properties: { question: { type: "string", title: "问题" }, attachments: { type: "array", items: { type: "string" } } } };
const stateSchema: JsonSchema = {
  type: "object",
  properties: {
    summary: { type: "object", title: "摘要", properties: { topics: { type: "array", items: { type: "string" }, title: "主题" }, conclusion: { type: "string" } } },
    messages: { type: "array", items: { type: "object" } },
  },
};
const producers = new Map([["summary", ["n1"]], ["messages", ["n1"]]]);
const nodeLabels = { n1: "整理社区问题" };
const environmentSchema: JsonSchema = { type: "object", properties: { COURSE_NAME: { type: "string", title: "课程名" } } };
const environmentVariables = { COURSE_NAME: "AI 导论", OTHER: 3 };
const samples: Record<string, JsonValue> = { hint: "样例文本" };

function groups(targetSchema?: JsonSchema) {
  return buildPickerGroups({ inputSchema, stateSchema, environmentSchema, environmentVariables, producers, nodeLabels, samples, ...(targetSchema ? { targetSchema } : {}) });
}

it("groups inputs, node outputs, shared State, environment variables and the literal action", () => {
  const list = groups();
  expect(list.map(group => group.label)).toEqual(["启动输入", "整理社区问题 的输出", "共享 State", "环境变量", "固定值"]);
  const nodeGroup = list.find(group => group.id === "node:n1")!;
  expect(nodeGroup.entries.map(entry => entry.pointer)).toEqual(["/summary", "/messages"]);
  expect(nodeGroup.entries[0].children?.map(entry => entry.pointer)).toEqual(["/summary/topics", "/summary/conclusion"]);
  const shared = list.find(group => group.id === "state")!;
  expect(shared.entries).toHaveLength(1);
  expect(shared.entries[0]).toMatchObject({ label: "hint", inferred: true });
  expect(shared.entries[0].inferred).toBe(true);
  const environment = list.find(group => group.id === "environment")!;
  expect(environment.entries.map(entry => entry.pointer)).toEqual(["/COURSE_NAME", "/OTHER"]);
  expect(environment.entries[1].meta).toContain("当前值类型");
  expect(list[list.length - 1].entries[0].action).toBe("literal");
});

it("greys out incompatible entries and states why, while keeping integer/number bridges selectable", () => {
  const list = groups({ type: "object" });
  const inputGroup = list.find(group => group.id === "input")!;
  expect(inputGroup.entries[0].disabledReason).toBeUndefined();
  expect(inputGroup.entries[0].children?.[0].disabledReason).toBe("与对象不兼容");
  const nodeGroup = list.find(group => group.id === "node:n1")!;
  expect(nodeGroup.entries[0].disabledReason).toBeUndefined();
  expect(nodeGroup.entries[1].disabledReason).toBe("与对象不兼容");
  const literal = list[list.length - 1].entries[0];
  expect(literal.disabledReason).toBeUndefined();
});

it("searches labels, pointers and types while preserving tree shape", () => {
  const filtered = filterPickerGroups(groups(), "主题");
  expect(filtered).toHaveLength(1);
  expect(filtered[0].id).toBe("node:n1");
  expect(filtered[0].entries[0].label).toBe("摘要");
  expect(filtered[0].entries[0].children?.map(entry => entry.label)).toEqual(["主题"]);
  expect(filterPickerGroups(groups(), "COURSE").map(group => group.id)).toEqual(["environment"]);
  expect(filterPickerGroups(groups(), "不存在的变量")).toEqual([]);
});

it("expands nested declared properties on demand", () => {
  const list = groups();
  const collapsed = visiblePickerEntries(list, new Set());
  expect(collapsed.map(entry => entry.key)).not.toContain("state:/summary/topics");
  const expanded = visiblePickerEntries(list, new Set(["state:/summary"]));
  expect(expanded.map(entry => entry.pointer)).toContain("/summary/topics");
  expect(expanded.find(entry => entry.pointer === "/summary/topics")).toMatchObject({ depth: 1, label: "主题" });
});

it("supports Up/Down over enabled rows, Enter to pick and Escape to close", () => {
  const rows = visiblePickerEntries(groups({ type: "object" }), new Set(["input:/"]));
  expect(firstEnabledIndex(rows)).toBe(0);
  expect(nextPickerIndex(rows, -1, 1)).toBe(0);
  // The input's scalar/array children and the array/integer State+environment fields are skipped.
  const objectFieldIndex = rows.findIndex(entry => entry.pointer === "/summary" && entry.depth === 0);
  expect(nextPickerIndex(rows, 0, 1)).toBe(objectFieldIndex);
  expect(pickerKeyAction(rows, -1, "ArrowDown")).toEqual({ type: "move", index: 0 });
  expect(pickerKeyAction(rows, objectFieldIndex, "ArrowUp")).toEqual({ type: "move", index: 0 });
  expect(pickerKeyAction(rows, objectFieldIndex, "Enter")).toEqual({ type: "pick", index: objectFieldIndex });
  const disabledIndex = rows.findIndex(entry => Boolean(entry.disabledReason));
  expect(disabledIndex).toBeGreaterThan(0);
  expect(pickerKeyAction(rows, disabledIndex, "Enter")).toEqual({ type: "none" });
  expect(pickerKeyAction(rows, objectFieldIndex, "Escape")).toEqual({ type: "close" });
});

it("renders groups, the inferred sample badge and State-only mode", () => {
  const onPick = vi.fn();
  const html = renderToStaticMarkup(createElement(VariablePicker, { inputSchema, stateSchema, environmentSchema, environmentVariables, producers, nodeLabels, samples, onPick, onPickLiteral: vi.fn(), onClose: vi.fn() }));
  expect(html).toContain("启动输入");
  expect(html).toContain("整理社区问题 的输出");
  expect(html).toContain("共享 State");
  expect(html).toContain("环境变量");
  expect(html).toContain("固定值…");
  expect(html).toContain("样例推断，未声明类型");
  expect(html).toContain("搜索变量");
  expect(html).toContain("↑↓ 选择 · 回车确认 · Esc 关闭");

  const stateOnly = renderToStaticMarkup(createElement(VariablePicker, { mode: "state", inputSchema, stateSchema, producers, nodeLabels, onPick, onClose: vi.fn() }));
  expect(stateOnly).toContain("选择 State 字段");
  expect(stateOnly).not.toContain("启动输入");
  expect(stateOnly).not.toContain("环境变量");
  expect(stateOnly).not.toContain("固定值…");
});
