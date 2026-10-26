// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import { renameModelStructuredWriteField, withModelStructuredField } from "../../domain/v2/structuredOutput";
import { withStateField } from "../../domain/v2/stateAuthoring";
import { NodeOutputsTable } from "./NodeOutputsTable";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(input: HTMLInputElement, key: string) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

const host = () => { const element = document.createElement("div"); document.body.append(element); return element; };
afterEach(() => { document.body.innerHTML = ""; });

it("renames a structured field once through the output row and calls the domain callback", () => {
  const base = createWorkflowV2();
  base.nodes.push(createNodeV2("core.llm", "model"));
  const definition = withModelStructuredField(base, "model", { name: "type", type: "string" });
  const node = definition.nodes.find(item => item.id === "model")!;
  const calls: [string, string][] = [];
  const container = host();
  const root = createRoot(container);
  act(() => { root.render(<NodeOutputsTable node={node} writes={node.writes} onChangeWrites={vi.fn()} stateSchema={definition.state.schema} producers={new Map([["type", ["model"]]])} onRenameStructuredField={(from, to) => calls.push([from, to])} onRenameWriteField={vi.fn()}/>); });
  act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="重命名字段 type"]')!.click(); });
  const input = container.querySelector<HTMLInputElement>('input[aria-label="结构化字段名 type"]')!;
  setInputValue(input, "kind");
  press(input, "Enter");
  expect(calls).toEqual([["type", "kind"]]);
  act(() => { root.unmount(); });
});

it("creates a custom write field name and renames the single-writer field once", () => {
  const node = createNodeV2("core.tool", "search");
  node.writes = { hits: "/result/hits" };
  const stateSchema = withStateField(createWorkflowV2(), "hits", "array").state.schema;
  const calls: [string, string][] = [];
  const container = host();
  const root = createRoot(container);
  act(() => { root.render(<NodeOutputsTable node={node} writes={node.writes} onChangeWrites={vi.fn()} stateSchema={stateSchema} producers={new Map([["hits", ["search"]]])} onRenameStructuredField={vi.fn()} onRenameWriteField={(from, to) => calls.push([from, to])}/>); });
  act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="hits 写入到"]')!.click(); });
  act(() => { [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("新建字段…"))!.click(); });
  const input = container.querySelector<HTMLInputElement>('input[aria-label="新写入字段名"]')!;
  setInputValue(input, "hn_hits");
  act(() => { [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "创建字段")!.click(); });
  expect(calls).toEqual([["hits", "hn_hits"]]);
  act(() => { root.unmount(); });
});

it("creates a new structured write destination without renaming the model key", () => {
  const base = createWorkflowV2();
  base.nodes.push(createNodeV2("core.llm", "model"));
  const definition = withModelStructuredField(base, "model", { name: "kw_en", type: "string" });
  const node = definition.nodes.find(item => item.id === "model")!;
  const writeCalls: [string, string][] = [];
  const structuredCalls: [string, string][] = [];
  const onChangeWrites = vi.fn();
  const container = host();
  const root = createRoot(container);
  act(() => { root.render(<NodeOutputsTable node={node} writes={node.writes} onChangeWrites={onChangeWrites} stateSchema={definition.state.schema} producers={new Map([["kw_en", ["model"]]])} onRenameStructuredField={(from, to) => structuredCalls.push([from, to])} onRenameWriteField={(from, to) => writeCalls.push([from, to])}/>); });
  act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="kw_en 写入到"]')!.click(); });
  act(() => { [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("新建字段…"))!.click(); });
  const input = container.querySelector<HTMLInputElement>('input[aria-label="新写入字段名"]')!;
  setInputValue(input, "terms_en");
  act(() => { [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "创建字段")!.click(); });
  expect(writeCalls).toEqual([["kw_en", "terms_en"]]);
  expect(structuredCalls).toEqual([]);
  expect(onChangeWrites).not.toHaveBeenCalled();
  act(() => { root.unmount(); });
});

it("renames only the write destination from the write-field button", () => {
  const base = createWorkflowV2();
  base.nodes.push(createNodeV2("core.llm", "model"));
  const definition = withModelStructuredField(base, "model", { name: "kw_en", type: "string" });
  const node = definition.nodes.find(item => item.id === "model")!;
  const writeCalls: [string, string][] = [];
  const structuredCalls: [string, string][] = [];
  const container = host();
  const root = createRoot(container);
  act(() => { root.render(<NodeOutputsTable node={node} writes={node.writes} onChangeWrites={vi.fn()} stateSchema={definition.state.schema} producers={new Map([["kw_en", ["model"]]])} onRenameStructuredField={(from, to) => structuredCalls.push([from, to])} onRenameWriteField={(from, to) => writeCalls.push([from, to])}/>); });
  act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="重命名写入字段 kw_en"]')!.click(); });
  const input = container.querySelector<HTMLInputElement>('input[aria-label="写入字段名 kw_en"]')!;
  setInputValue(input, "terms_en");
  press(input, "Enter");
  expect(writeCalls).toEqual([["kw_en", "terms_en"]]);
  expect(structuredCalls).toEqual([]);
  act(() => { root.unmount(); });
});

it("renames the structured key after the write destination was separated", () => {
  const base = createWorkflowV2();
  base.nodes.push(createNodeV2("core.llm", "model"));
  const added = withModelStructuredField(base, "model", { name: "kw_en", type: "string" });
  const definition = renameModelStructuredWriteField(added, "model", "kw_en", "terms_en");
  const node = definition.nodes.find(item => item.id === "model")!;
  const writeCalls: [string, string][] = [];
  const structuredCalls: [string, string][] = [];
  const container = host();
  const root = createRoot(container);
  act(() => { root.render(<NodeOutputsTable node={node} writes={node.writes} onChangeWrites={vi.fn()} stateSchema={definition.state.schema} producers={new Map([["terms_en", ["model"]]])} onRenameStructuredField={(from, to) => structuredCalls.push([from, to])} onRenameWriteField={(from, to) => writeCalls.push([from, to])}/>); });
  act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="重命名字段 terms_en"]')!.click(); });
  const input = container.querySelector<HTMLInputElement>('input[aria-label="结构化字段名 kw_en"]')!;
  setInputValue(input, "keywords_en");
  press(input, "Enter");
  expect(structuredCalls).toEqual([["kw_en", "keywords_en"]]);
  expect(writeCalls).toEqual([]);
  act(() => { root.unmount(); });
});
