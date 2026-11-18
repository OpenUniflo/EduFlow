import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/shared/api/apiClient";

const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const api = vi.hoisted(() => ({ extension: vi.fn(), extensionReferences: vi.fn() }));

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
  };
});
vi.mock("../application/v2/useWorkflowV2Controller", () => ({ workflowApiV2: api }));

import { ResourceDeleteDialog, type ResourceDeleteTarget } from "./ResourceDeleteDialog";
import { ResourceReferences } from "./ResourceReferences";

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

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (!node || typeof node !== "object") return "";
  return textOf((node as Element).props?.children);
}

const target = (overrides: Partial<ResourceDeleteTarget> = {}): ResourceDeleteTarget => ({
  kind: "function", ref: "cleanup", version: 3, name: "清理函数", noun: "函数", versions: 3, ...overrides,
});

function render(value: ResourceDeleteTarget, onDeleted = vi.fn(), onClose = vi.fn()) {
  host.cursor = 0;
  const tree = ResourceDeleteDialog({ environmentRef: "local", target: value, onClose, onDeleted });
  host.effects.splice(0).forEach(effect => effect());
  return { tree: tree as Element, onDeleted, onClose };
}

async function flush() { for (let index = 0; index < 10; index += 1) await Promise.resolve(); }

function confirmButton(tree: Element) {
  return find(tree, element => element.props["data-resource-delete"] === "confirm")!;
}

beforeEach(() => {
  host.slots = []; host.cursor = 0; host.effects = [];
  api.extension.mockReset().mockResolvedValue({ ref: "cleanup", deleted: 3, version: 3 });
  api.extensionReferences.mockReset().mockResolvedValue({ items: [] });
});

describe("ResourceDeleteDialog", () => {
  it("scans with the function kind and blocks confirmation while references exist", async () => {
    api.extensionReferences.mockResolvedValue({ items: [{ workflowId: "wf-1", workflowName: "客服分流", revision: 2, graphPath: [], nodeId: "fn", nodeLabel: "清理", version: 3 }] });
    const { tree: initial } = render(target());
    await flush();
    const tree = render(target()).tree;
    expect(api.extensionReferences).toHaveBeenCalledWith("cleanup", "local", "function");
    expect(initial).toBeTruthy();
    expect(textOf(tree)).toContain("不能删除：仍被引用");
    expect(textOf(tree)).toContain("1 个工作流中的 1 个节点");
    expect(find(tree, element => element.type === ResourceReferences)!.props.rows).toHaveLength(1);
    expect(confirmButton(tree).props.disabled).toBe(true);
    expect(api.extension).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation and deletes all versions through the server", async () => {
    const { tree: initial, onDeleted } = render(target());
    await flush();
    let tree = render(target(), onDeleted).tree;
    expect(textOf(initial)).toContain("正在检查工作流引用");
    expect(textOf(tree)).toContain("未发现当前工作流引用");
    expect(confirmButton(tree).props.disabled).toBe(true);
    const checkbox = find(tree, element => element.type === "input" && element.props.type === "checkbox")!;
    (checkbox.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    tree = render(target(), onDeleted).tree;
    expect(confirmButton(tree).props.disabled).toBe(false);
    (confirmButton(tree).props.onClick as () => void)();
    await flush();
    expect(api.extension).toHaveBeenCalledWith("local", { action: "delete", kind: "function", ref: "cleanup", version: 3 });
    expect(onDeleted).toHaveBeenCalledWith(expect.stringContaining("清理函数"));
    expect(onDeleted).toHaveBeenCalledWith(expect.stringContaining("3 个版本"));
  });

  it("keeps the owner on the dialog and refreshes references after a server rejection", async () => {
    api.extension.mockRejectedValueOnce(new ApiRequestError("FUNCTION_IN_USE", "referenced", 409));
    api.extensionReferences
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [{ workflowId: "wf-2", workflowName: "并发保存", revision: 1, graphPath: [], nodeId: "fn", nodeLabel: "函数", version: 3 }] });
    let tree = render(target()).tree;
    await flush();
    tree = render(target()).tree;
    const checkbox = find(tree, element => element.type === "input" && element.props.type === "checkbox")!;
    (checkbox.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    tree = render(target()).tree;
    (confirmButton(tree).props.onClick as () => void)();
    await flush();
    tree = render(target()).tree;
    expect(textOf(tree)).toContain("不能删除：仍被引用");
    expect(find(tree, element => element.type === ResourceReferences)!.props.rows[0].workflowName).toBe("并发保存");
    expect(confirmButton(tree).props.disabled).toBe(true);
  });

  it("marks the provider confirm attribute for existing safe-delete callers", async () => {
    const { tree: initial } = render(target({ kind: "connection", noun: "模型供应商", hasCredential: true, className: "wf-provider-delete", actionAttribute: "data-provider-action" }));
    await flush();
    const tree = render(target({ kind: "connection", noun: "模型供应商", hasCredential: true, className: "wf-provider-delete", actionAttribute: "data-provider-action" })).tree;
    expect(initial).toBeTruthy();
    expect(find(tree, element => element.props["data-provider-action"] === "confirm-delete")).toBeTruthy();
    expect(find(tree, element => element.props["data-resource-delete"] === "confirm")).toBeTruthy();
    expect(textOf(tree)).toContain("将删除托管凭据");
  });
});
