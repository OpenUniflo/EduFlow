// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { WorkflowDefinitionV2 } from "../../domain/v2/types";
import { createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import { withStateField } from "../../domain/v2/stateAuthoring";
import { StateFields } from "./StateFields";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function press(input: HTMLInputElement, key: string) {
  act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
}

const host = () => { const element = document.createElement("div"); document.body.append(element); return element; };
afterEach(() => { document.body.innerHTML = ""; });

it("renames a data-panel field once and hands the renamed definition to onChange", () => {
  const base = withStateField(createWorkflowV2(), "hits", "array");
  const writer = { ...createNodeV2("core.tool", "search"), writes: { hits: "/result/hits" } };
  const definition = { ...base, nodes: [...base.nodes, writer] };
  const changes: WorkflowDefinitionV2[] = [];
  const container = host();
  const root = createRoot(container);
  act(() => { root.render(<StateFields definition={definition} onChange={next => changes.push(next)}/>); });
  const input = container.querySelector<HTMLInputElement>('input[aria-label="hits 字段名"]')!;
  setInputValue(input, "hn_hits");
  press(input, "Enter");
  expect(changes).toHaveLength(1);
  expect((changes[0].state.schema.properties as Record<string, unknown>).hits).toBeUndefined();
  expect((changes[0].state.schema.properties as Record<string, unknown>).hn_hits).toMatchObject({ type: "array" });
  expect(changes[0].nodes.find(node => node.id === "search")!.writes).toEqual({ hn_hits: "/result/hits" });
  act(() => { root.unmount(); });
});
