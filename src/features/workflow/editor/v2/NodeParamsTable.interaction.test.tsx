// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { Binding, JsonValue, WorkflowNodeV2 } from "../../domain/v2/types";
import { createNodeV2 } from "../../domain/v2/factory";
import { withRenamedNodeParams } from "../../domain/v2/promptAuthoring";
import { NodeParamsTable } from "./NodeParamsTable";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const literal = (value: string): Binding => ({ source: "literal", value });

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

function Harness({ base, commits, prompts }: { base: WorkflowNodeV2; commits: Record<string, Binding>[]; prompts: string[][] }) {
  const [node, setNode] = useState(base);
  return <NodeParamsTable
    mode="declared"
    inputs={node.inputs}
    onChangeInputs={inputs => {
      commits.push(inputs);
      const next = withRenamedNodeParams(node, inputs);
      const prompt = next.config.prompt as { messages?: { content: { type: string; name?: string }[] }[] } | undefined;
      prompts.push((prompt?.messages ?? []).flatMap(message => message.content.filter(part => part.type === "param").map(part => part.name ?? "")));
      setNode(next);
    }}
    paramSchema={{}}
    startInputSchema={{ type: "object", properties: {} }}
    stateSchema={{ type: "object", properties: {} }}
  />;
}

const container = () => {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
};

afterEach(() => {
  document.body.innerHTML = "";
});

const cases: { type: string; prompt?: boolean }[] = [
  { type: "core.llm", prompt: true },
  { type: "core.function" },
  { type: "core.transform" },
];

it.each(cases)("keeps focus while typing multiple characters on a $type node and commits once", ({ type, prompt }) => {
  const base = createNodeV2(type, "node");
  base.inputs = { query: literal("x") };
  if (prompt) base.config = { ...base.config, prompt: { system: [], messages: [{ role: "user", content: [{ type: "text", text: "问题" }, { type: "param", name: "query" }] }] } } as unknown as Record<string, JsonValue>;
  const commits: Record<string, Binding>[] = [];
  const prompts: string[][] = [];
  const host = container();
  const root = createRoot(host);
  act(() => { root.render(<Harness base={base} commits={commits} prompts={prompts}/>); });
  const input = host.querySelector<HTMLInputElement>('input[aria-label="参数名 query"]');
  expect(input).not.toBeNull();
  input!.focus();
  expect(document.activeElement).toBe(input);
  for (const value of ["q", "qu", "que", "quer", "query_new"]) {
    setInputValue(input!, value);
    expect(document.activeElement).toBe(input);
    expect(input!.isConnected).toBe(true);
    expect(commits).toHaveLength(0);
  }
  press(input!, "Enter");
  expect(commits).toHaveLength(1);
  expect(Object.keys(commits[0])).toEqual(["query_new"]);
  if (prompt) expect(prompts[0]).toEqual(["query_new"]);
  act(() => { root.unmount(); });
});

it("restores the original name and reports a Chinese error when the draft is invalid or duplicated", () => {
  const base = createNodeV2("core.function", "node");
  base.inputs = { query: literal("x"), other: literal("y") };
  const commits: Record<string, Binding>[] = [];
  const host = container();
  const root = createRoot(host);
  act(() => { root.render(<Harness base={base} commits={commits} prompts={[]}/>); });
  const input = host.querySelector<HTMLInputElement>('input[aria-label="参数名 query"]')!;
  input.focus();
  setInputValue(input, "other");
  expect(host.textContent).toContain("已被此节点的另一个参数使用");
  act(() => { input.blur(); });
  expect(commits).toHaveLength(0);
  expect(host.textContent).toContain("已被此节点的另一个参数使用");
  expect(host.querySelector<HTMLInputElement>('input[aria-label="参数名 query"]')!.value).toBe("query");
  act(() => { root.unmount(); });
});
