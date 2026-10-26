import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
const api = vi.hoisted(() => ({ extension: vi.fn() }));
const catalog = vi.hoisted(() => ({
  data: {
    connections: [
      {
        connectionKey: "p4:owner:team_gateway:1", ref: "team_gateway", version: 1, disabled: false, hasCredential: true,
        content: { type: "openai-compatible", name: "团队网关", baseUrl: "https://old.example.com/v1", modelRefs: ["team-model"] },
      },
    ],
    functions: [],
    reducers: [],
    runtime: { available: {}, limits: {} },
  },
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
  };
});
vi.mock("../application/v2/useWorkflowV2Controller", () => ({ workflowApiV2: api }));
vi.mock("../editor/v2/FunctionExecutionFields", () => ({ useExtensions: () => catalog }));

import { ResourceEditor, type ResourceEditorTarget } from "./ResourceEditor";

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

/** Tests render without a React host, so expand the function-component boundary before walking. */
function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== "object") return node;
  const element = node as Element;
  if (!("type" in element) || !element.props || typeof element.props !== "object") return node;
  if (typeof element.type === "function") return expand((element.type as (props: Record<string, unknown>) => unknown)(element.props));
  return { ...element, props: Object.fromEntries(Object.entries(element.props).map(([key, value]) => [key, expand(value)])) };
}

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (!node || typeof node !== "object") return "";
  return textOf((node as Element).props?.children);
}

function render(target: ResourceEditorTarget, onSaved = vi.fn(), onClose = vi.fn()) {
  host.cursor = 0;
  return { tree: expand(ResourceEditor({ environmentRef: "local", target, onClose, onSaved })) as Element, onSaved, onClose };
}

function input(tree: Element, label: string): Element {
  const element = find(tree, item => item.props["aria-label"] === label);
  if (!element) throw new Error(`missing input ${label}`);
  return element;
}

function saveButton(tree: Element): Element {
  const element = find(tree, item => item.type === "button" && item.props.className === "primary" && textOf(item) === "保存");
  if (!element) throw new Error("missing save button");
  return element;
}

async function flush() { for (let index = 0; index < 20; index += 1) await Promise.resolve(); }

beforeEach(() => {
  host.slots = []; host.cursor = 0;
  api.extension.mockReset().mockResolvedValue({ ok: true });
});

describe("provider editor", () => {
  it("keeps the API address in the main form and blocks an empty custom address", () => {
    const { tree } = render({ kind: "provider", mode: "create", presetId: "custom-openai" });
    const address = input(tree, "模型 Base URL");
    expect(address.props.value).toBe("");
    expect(address.props["aria-invalid"]).toBe(true);
    expect(textOf(tree)).toContain("请填写 API 地址。");
    expect(textOf(tree)).not.toContain("高级");
    expect(textOf(tree)).not.toContain("去哪里获取");
    expect(find(tree, item => item.props.className === "wf-editor-test-primary")!.props.disabled).toBe(true);
    expect(saveButton(tree).props.disabled).toBe(true);
  });

  it("prefills a read-only official DeepSeek address and links to its API keys page", () => {
    const { tree } = render({ kind: "provider", mode: "create", presetId: "deepseek" });
    const address = input(tree, "模型 Base URL");
    expect(address.props.value).toBe("https://api.deepseek.com");
    expect(address.props.readOnly).toBe(true);
    expect(textOf(tree)).toContain("使用代理或其他地址请选择「OpenAI 兼容」");
    const link = find(tree, item => item.type === "a" && textOf(item) === "去哪里获取")!;
    expect(link.props.href).toBe("https://platform.deepseek.com/api_keys");
    expect(link.props.target).toBe("_blank");
    expect(link.props.rel).toBe("noreferrer");
    expect(textOf(tree).match(/测试模型/g)).toHaveLength(1);
  });

  it("writes an edited existing address into the next version", async () => {
    const { tree: initial, onSaved, onClose } = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    expect(input(initial, "模型 Base URL").props.value).toBe("https://old.example.com/v1");

    (input(initial, "模型 Base URL").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "https://new.example.com/v1" } });
    const afterAddress = render({ kind: "provider", mode: "edit", ref: "team_gateway" }, onSaved, onClose);
    expect(input(afterAddress.tree, "模型 Base URL").props.value).toBe("https://new.example.com/v1");

    const key = input(afterAddress.tree, "模型 API Key");
    (key.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "sk-local-test" } });
    const afterKey = render({ kind: "provider", mode: "edit", ref: "team_gateway" }, onSaved, onClose);
    const save = saveButton(afterKey.tree);
    expect(save.props.disabled).toBe(false);
    (save.props.onClick as () => void)();
    await flush();

    expect(api.extension).toHaveBeenCalledWith("local", {
      action: "publish", kind: "connection", ref: "team_gateway", version: 2,
      content: { type: "openai-compatible", name: "团队网关", baseUrl: "https://new.example.com/v1", modelRefs: ["team-model"] },
      credential: "sk-local-test",
    });
    expect(onSaved).toHaveBeenCalledWith("team_gateway", 2, expect.objectContaining({ baseUrl: "https://new.example.com/v1" }));
    expect(onClose).toHaveBeenCalled();
  });
});
