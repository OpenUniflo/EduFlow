import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceCenterProps } from "./resourceTypes";

const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const api = vi.hoisted(() => ({ configuration: vi.fn() }));
const catalog = vi.hoisted(() => ({ data: null, error: "", refresh: () => undefined }));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState(initial: unknown) {
      const index = host.cursor++;
      if (!Object.prototype.hasOwnProperty.call(host.slots, index)) host.slots[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [host.slots[index], (next: unknown) => { host.slots[index] = typeof next === "function" ? (next as (current: unknown) => unknown)(host.slots[index]) : next; }];
    },
    useEffect(effect: () => void, deps?: readonly unknown[]) {
      const index = host.cursor++;
      const previous = host.slots[index] as { deps: readonly unknown[] } | undefined;
      const shouldRun = !previous || !deps || deps.some((value, position) => value !== previous.deps[position]);
      host.slots[index] = { deps: deps ?? [] };
      if (shouldRun) host.effects.push(effect);
    },
    useRef(initial: unknown) {
      const index = host.cursor++;
      if (!host.slots[index]) host.slots[index] = { current: initial };
      return host.slots[index];
    },
    useMemo(factory: () => unknown) { return factory(); },
    useCallback(callback: unknown) { return callback; },
  };
});
vi.mock("../application/v2/useWorkflowV2Controller", () => ({ workflowApiV2: api }));
vi.mock("../editor/v2/FunctionExecutionFields", () => ({ useExtensions: () => catalog }));

import { ResourceCenterDialog } from "./ResourceCenterDialog";
import { ApiResource } from "./ApiResource";
import { McpResource } from "./McpResource";
import { VariableTable } from "./VariableTable";

type Element = { type: unknown; props: Record<string, any> };

function walk(node: unknown, visit: (element: Element) => void) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach(child => walk(child, visit)); return; }
  const element = node as Element;
  if (!("props" in element) || !element.props || typeof element.props !== "object") return;
  visit(element);
  walk(element.props.children, visit);
}

function find(node: unknown, predicate: (element: Element) => boolean): Element | undefined {
  let found: Element | undefined;
  walk(node, element => { if (!found && predicate(element)) found = element; });
  return found;
}

function hasType(node: unknown, type: unknown): boolean {
  return Boolean(find(node, element => element.type === type));
}

const base: ResourceCenterProps = { open: true, environmentRef: "local", initialSection: "providers", onClose: () => undefined };

function render(props: ResourceCenterProps) {
  host.cursor = 0;
  const tree = ResourceCenterDialog(props);
  host.effects.splice(0).forEach(effect => effect());
  return tree;
}

async function flush() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }

beforeEach(() => {
  host.slots = []; host.cursor = 0; host.effects = [];
  api.configuration.mockReset().mockResolvedValue({ revision: 1, variables: [{ key: "API_BASE", value: "https://x", overrides: {} }] });
});

describe("ResourceCenterDialog interactions", () => {
  it("switches category content through the left navigation", () => {
    expect(hasType(render(base), ApiResource)).toBe(false);
    const providers = render(base);
    const apis = find(providers, element => element.props["data-resource-section"] === "apis")!;
    (apis.props.onClick as () => void)();
    const afterApis = render(base);
    expect(hasType(afterApis, ApiResource)).toBe(true);
    const variables = find(afterApis, element => element.props["data-resource-section"] === "variables")!;
    (variables.props.onClick as () => void)();
    const afterVariables = render(base);
    expect(hasType(afterVariables, VariableTable)).toBe(true);
    expect(hasType(afterVariables, ApiResource)).toBe(false);
  });

  it("closes through the close button and the Escape key", () => {
    const onClose = vi.fn();
    const tree = render({ ...base, onClose });
    const close = find(tree, element => element.props["aria-label"] === "关闭资源中心")!;
    (close.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
    const dialog = find(tree, element => element.props.role === "dialog")!;
    (dialog.props.onKeyDown as (event: { key: string; stopPropagation: () => void }) => void)({ key: "Escape", stopPropagation: vi.fn() });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("opens the intent section and keeps the create form visible", () => {
    const onCreated = vi.fn();
    const tree = render({ ...base, initialSection: undefined, intent: { kind: "create", section: "mcp", onCreated } });
    expect(hasType(tree, McpResource)).toBe(true);
    expect(find(tree, element => element.props.className === "wf-resource-intent")).toBeTruthy();
  });

  it("shows the variable count after the workspace configuration loads", async () => {
    const tree = render(base);
    await flush();
    const next = render(base);
    const variables = find(next, element => element.props["data-resource-section"] === "variables")!;
    expect(variables.props["data-resource-count"]).toBe(1);
    expect(tree).toBeTruthy();
  });
});
