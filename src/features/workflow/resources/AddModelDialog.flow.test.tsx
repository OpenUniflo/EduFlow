import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const api = vi.hoisted(() => ({ extension: vi.fn(), testExtension: vi.fn() }));

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

import { AddModelDialog, type AddModelDialogProps } from "./AddModelDialog";

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
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!node || typeof node !== "object") return "";
  return textOf((node as Element).props?.children);
}

const props = (overrides: Partial<AddModelDialogProps> = {}): AddModelDialogProps => ({
  environmentRef: "local", providers: [], localEnvironment: true, initialPresetId: "custom-openai",
  onClose: vi.fn(), onCreated: vi.fn(), ...overrides,
});

function render(value: AddModelDialogProps): Element {
  host.cursor = 0;
  const tree = AddModelDialog(value);
  host.effects.splice(0).forEach(effect => effect());
  return tree as Element;
}

async function flush() { for (let index = 0; index < 20; index += 1) await Promise.resolve(); }

beforeEach(() => {
  host.slots = []; host.cursor = 0; host.effects = [];
  api.extension.mockReset().mockResolvedValue({ ok: true });
  api.testExtension.mockReset().mockResolvedValue({ ok: true, elapsedMs: 12, models: ["fake-openai-chat", "fake-openai-reasoner"] });
});

describe("AddModelDialog new-provider flow", () => {
  it("tests a new provider through a hidden probe, then publishes v1 with the checked models", async () => {
    const value = props();
    let tree = render(value);
    const baseUrl = find(tree, element => element.props["aria-label"] === "模型 Base URL")!;
    (baseUrl.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "http://127.0.0.1:18080/v1" } });
    tree = render(value);
    (find(tree, element => element.props["data-action"] === "test")!.props.onClick as () => void)();
    await flush();
    tree = render(value);
    expect(api.extension.mock.calls[0][1]).toMatchObject({ action: "publish", kind: "connection", version: 1, content: { type: "openai-compatible", modelRefs: ["probe"] } });
    const probe = api.extension.mock.calls[0][1].ref as string;
    expect(probe.startsWith("probe__")).toBe(true);
    expect(api.testExtension).toHaveBeenCalledWith("local", { ref: probe, version: 1 });
    expect(api.extension.mock.calls[1][1]).toMatchObject({ action: "disable", kind: "connection", ref: probe, version: 1 });
    expect(textOf(tree)).toContain("fake-openai-chat");

    for (const model of ["fake-openai-chat", "fake-openai-reasoner"]) {
      const checkbox = find(tree, element => element.props["aria-label"] === `启用模型 ${model}`)!;
      (checkbox.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
      tree = render(value);
    }
    expect(textOf(tree)).toContain("保存后会出现在节点的模型下拉里");
    const save = find(tree, element => element.props["data-action"] === "save")!;
    expect(save.props.disabled).toBe(false);
    (save.props.onClick as () => void)();
    await flush();
    expect(api.extension.mock.calls[2][1]).toMatchObject({
      action: "publish", kind: "connection", ref: "custom_openai", version: 1, credential: "",
      content: { type: "openai-compatible", name: "OpenAI 兼容自定义", baseUrl: "http://127.0.0.1:18080/v1", modelRefs: ["fake-openai-chat", "fake-openai-reasoner"] },
    });
    expect(value.onCreated).toHaveBeenCalledWith("custom_openai", 1, expect.objectContaining({ type: "openai-compatible", modelRefs: ["fake-openai-chat", "fake-openai-reasoner"] }));
    expect(value.onClose).toHaveBeenCalled();
  });

  it("keeps the dialog open with a server error and does not call onCreated", async () => {
    const value = props({ initialPresetId: "deepseek" });
    let tree = render(value);
    const key = find(tree, element => element.props["aria-label"] === "模型 API Key")!;
    (key.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "sk-test" } });
    tree = render(value);
    (find(tree, element => element.props["aria-label"] === "手动添加模型")!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "deepseek-chat" } });
    tree = render(value);
    (find(tree, element => element.props.children === "添加")!.props.onClick as () => void)();
    tree = render(value);
    api.extension.mockRejectedValueOnce(new Error("offline"));
    (find(tree, element => element.props["data-action"] === "save")!.props.onClick as () => void)();
    await flush();
    tree = render(value);
    expect(textOf(tree)).toContain("offline");
    expect(value.onCreated).not.toHaveBeenCalled();
  });
});
