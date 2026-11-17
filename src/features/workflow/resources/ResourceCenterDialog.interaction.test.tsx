import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceCenterProps } from "./resourceTypes";

const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const api = vi.hoisted(() => ({ configuration: vi.fn(), extension: vi.fn(), extensionReferences: vi.fn(), testExtension: vi.fn() }));
const catalog = vi.hoisted(() => ({
  data: null as null | { connections: unknown[]; functions: unknown[]; reducers: unknown[]; runtime: { available: unknown; limits: unknown } },
  error: "",
  refresh: () => undefined,
}));

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
import { ResourceDeleteDialog } from "./ResourceDeleteDialog";
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

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!node || typeof node !== "object") return "";
  return textOf((node as Element).props?.children);
}

function textOfDelete(node: unknown): string {
  const modal = find(node, element => element.props.role === "dialog" && String(element.props.className).includes("wf-provider-delete"));
  return textOf(modal);
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
  api.extension.mockReset().mockResolvedValue({ ok: true });
  api.extensionReferences.mockReset().mockResolvedValue({ items: [] });
  api.testExtension.mockReset();
  catalog.data = null;
});

describe("ResourceCenterDialog interactions", () => {
  it("switches category content through the left navigation", () => {
    const providers = render(base);
    expect(find(providers, element => element.props.className === "wf-resource-center-list")).toBeTruthy();
    const apis = find(providers, element => element.props["data-resource-section"] === "apis")!;
    (apis.props.onClick as () => void)();
    const afterApis = render(base);
    expect(find(afterApis, element => element.props["data-resource-section"] === "apis")!.props["aria-pressed"]).toBe(true);
    const variables = find(afterApis, element => element.props["data-resource-section"] === "variables")!;
    (variables.props.onClick as () => void)();
    const afterVariables = render(base);
    expect(hasType(afterVariables, VariableTable)).toBe(true);
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
    expect(find(tree, element => element.props.className === "wf-resource-intent")).toBeTruthy();
    expect(find(tree, element => element.props.className === "wf-resource-center-list")).toBeTruthy();
  });

  it("blocks deletion when references exist and shows the affected workflows", async () => {
    catalog.data = {
      connections: [{ connectionKey: "p4:o:team:2", ref: "team", version: 2, disabled: false, hasCredential: true, content: { type: "deepseek", name: "团队模型", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-chat"] } }],
      functions: [], reducers: [], runtime: { available: {}, limits: {} },
    };
    api.extensionReferences.mockResolvedValue({ items: [{ workflowId: "wf-1", workflowName: "客服分流", revision: 3, graphPath: [], nodeId: "model", nodeLabel: "分类模型", modelRef: "deepseek-chat" }] });
    render(base);
    let tree = render(base);
    const open = find(tree, element => element.props["data-provider-action"] === "delete")!;
    (open.props.onClick as () => void)();
    await flush();
    tree = render(base);
    expect(textOfDelete(tree)).toContain("不能删除：仍被引用");
    expect(find(tree, element => Array.isArray(element.props.rows) && element.props.rows[0]?.workflowName === "客服分流")).toBeTruthy();
    expect(find(tree, element => element.props["data-provider-action"] === "confirm-delete")!.props.disabled).toBe(true);
    expect(api.extension).not.toHaveBeenCalled();
  });

  it("restores a disabled provider with a new version and enables deletion confirmation when unused", async () => {
    catalog.data = {
      connections: [{ connectionKey: "p4:o:team:2", ref: "team", version: 2, disabled: true, hasCredential: true, content: { type: "deepseek", name: "团队模型", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-chat"] } }],
      functions: [], reducers: [], runtime: { available: {}, limits: {} },
    };
    render(base);
    let tree = render(base);
    expect(textOf(tree)).toContain("连接已停用");
    const restore = find(tree, element => element.props["data-provider-action"] === "restore")!;
    (restore.props.onClick as () => void)();
    await flush();
    expect(api.extension).toHaveBeenCalledWith("local", { action: "restore", kind: "connection", ref: "team", version: 3 });

    tree = render(base);
    const open = find(tree, element => element.props["data-provider-action"] === "delete")!;
    (open.props.onClick as () => void)();
    await flush();
    tree = render(base);
    expect(textOfDelete(tree)).toContain("未发现当前工作流引用");
    expect(find(tree, element => element.props["data-provider-action"] === "confirm-delete")!.props.disabled).toBe(true);
    const confirm = find(tree, element => element.props.type === "checkbox" && element.props.onChange)!;
    (confirm.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    tree = render(base);
    expect(find(tree, element => element.props["data-provider-action"] === "confirm-delete")!.props.disabled).toBe(false);
  });

  it("opens the shared safe-delete target for a self-built API", () => {
    catalog.data = {
      connections: [{ connectionKey: "p4:o:price:1", ref: "price", version: 1, disabled: false, hasCredential: true, content: { type: "http", name: "价格服务", baseUrl: "https://api.example.com", path: "/price", method: "GET", sideEffect: "read" } }],
      functions: [], reducers: [], runtime: { available: {}, limits: {} },
    };
    let tree = render({ ...base, initialSection: "apis" });
    const apiDelete = find(tree, element => element.props["data-resource-action"] === "delete")!;
    (apiDelete.props.onClick as () => void)();
    tree = render({ ...base, initialSection: "apis" });
    const dialog = find(tree, element => element.type === ResourceDeleteDialog)!;
    expect(dialog.props.target).toMatchObject({ kind: "connection", ref: "price", version: 1, noun: "API 连接", versions: 1 });
  });

  it("opens the shared safe-delete target for a function", () => {
    catalog.data = {
      connections: [],
      functions: [{ ref: "cleanup", version: 3, name: "清理函数", language: "python", disabled: false, purpose: "node" }],
      reducers: [], runtime: { available: {}, limits: {} },
    };
    let tree = render({ ...base, initialSection: "functions" });
    const functionDelete = find(tree, element => element.props["data-resource-action"] === "delete")!;
    (functionDelete.props.onClick as () => void)();
    tree = render({ ...base, initialSection: "functions" });
    const dialog = find(tree, element => element.type === ResourceDeleteDialog)!;
    expect(dialog.props.target).toMatchObject({ kind: "function", ref: "cleanup", version: 3, noun: "函数", versions: 1 });
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
