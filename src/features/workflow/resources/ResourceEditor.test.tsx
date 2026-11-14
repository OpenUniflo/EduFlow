import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
const api = vi.hoisted(() => ({ extension: vi.fn(), testExtension: vi.fn() }));
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
  api.testExtension.mockReset();
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

  it("shows the current provider as a read-only identity instead of the preset grid", () => {
    const { tree } = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    expect(find(tree, item => item.props["aria-label"] === "选择模型供应商")).toBeUndefined();
    expect(find(tree, item => item.props["aria-label"] === "当前模型供应商")).toBeDefined();
    expect(textOf(tree)).toContain("要换一家请新建模型供应商");
  });

  it("reuses the saved key when only the enabled models change", async () => {
    const { tree } = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    (input(tree, "手动添加模型").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "team-model-2" } });
    const afterModel = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    const add = find(afterModel.tree, item => item.type === "button" && textOf(item) === "添加");
    expect(add).toBeDefined();
    (add!.props.onClick as () => void)();
    const afterAdd = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    const save = saveButton(afterAdd.tree);
    expect(save.props.disabled).toBe(false);
    (save.props.onClick as () => void)();
    await flush();
    expect(api.extension).toHaveBeenCalledWith("local", {
      action: "publish", kind: "connection", ref: "team_gateway", version: 2,
      content: { type: "openai-compatible", name: "团队网关", baseUrl: "https://old.example.com/v1", modelRefs: ["team-model", "team-model-2"] },
      credential: "",
    });
  });

  it("edits only the display name while keeping the stable ref and saved key", async () => {
    const { tree: initial } = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    expect(input(initial, "供应商显示名称").props.value).toBe("团队网关");
    (input(initial, "供应商显示名称").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "团队网关（生产）" } });
    const afterName = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    expect(textOf(afterName.tree)).toContain("team_gateway");
    const save = saveButton(afterName.tree);
    expect(save.props.disabled).toBe(false);
    (save.props.onClick as () => void)();
    await flush();
    expect(api.extension).toHaveBeenCalledWith("local", expect.objectContaining({
      action: "publish", kind: "connection", ref: "team_gateway", version: 2, credential: "",
      content: expect.objectContaining({ name: "团队网关（生产）", modelRefs: ["team-model"] }),
    }));
  });

  it("lets a new provider set its display name without changing the preset ref", async () => {
    const { tree: initial, onSaved, onClose } = render({ kind: "provider", mode: "create", presetId: "deepseek" });
    expect(input(initial, "供应商显示名称").props.value).toBe("DeepSeek");
    expect(textOf(initial)).toContain("deepseek");

    (input(initial, "供应商显示名称").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "  团队 DeepSeek  " } });
    (input(initial, "模型 API Key").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "sk-create" } });
    const after = render({ kind: "provider", mode: "create", presetId: "deepseek" }, onSaved, onClose);
    expect(input(after.tree, "供应商显示名称").props.value).toBe("  团队 DeepSeek  ");
    const save = saveButton(after.tree);
    expect(save.props.disabled).toBe(false);
    (save.props.onClick as () => void)();
    await flush();
    expect(api.extension).toHaveBeenCalledWith("local", expect.objectContaining({
      action: "publish", kind: "connection", ref: "deepseek", version: 1, credential: "sk-create",
      content: expect.objectContaining({ name: "团队 DeepSeek", type: "deepseek", modelRefs: ["deepseek-flash", "deepseek-reasoner"] }),
    }));
    expect(onSaved).toHaveBeenCalledWith("deepseek", 1, expect.objectContaining({ name: "团队 DeepSeek" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("blocks a blank name on a new provider too", () => {
    const { tree: initial } = render({ kind: "provider", mode: "create", presetId: "deepseek" });
    (input(initial, "供应商显示名称").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "   " } });
    const blank = render({ kind: "provider", mode: "create", presetId: "deepseek" });
    expect(textOf(blank.tree)).toContain("请填写显示名称");
    expect(saveButton(blank.tree).props.disabled).toBe(true);
  });

  it("blocks an empty or over-long display name", () => {
    const { tree: initial } = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    (input(initial, "供应商显示名称").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: " " } });
    const empty = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    expect(textOf(empty.tree)).toContain("请填写显示名称");
    expect(saveButton(empty.tree).props.disabled).toBe(true);

    (input(empty.tree, "供应商显示名称").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "x".repeat(121) } });
    const tooLong = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    expect(textOf(tooLong.tree)).toContain("显示名称应为 1–120 个字符");
    expect(saveButton(tooLong.tree).props.disabled).toBe(true);
  });

  it("writes an edited existing address into the next version", async () => {
    const { tree: initial, onSaved, onClose } = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    expect(input(initial, "模型 Base URL").props.value).toBe("https://old.example.com/v1");

    (input(initial, "模型 Base URL").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "https://new.example.com/v1" } });
    const afterAddress = render({ kind: "provider", mode: "edit", ref: "team_gateway" }, onSaved, onClose);
    expect(input(afterAddress.tree, "模型 Base URL").props.value).toBe("https://new.example.com/v1");
    expect(saveButton(afterAddress.tree).props.disabled).toBe(true);

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

describe("provider editor model history", () => {
  it("keeps a model removed from the latest version as an unchecked row", () => {
    const original = catalog.data.connections;
    catalog.data.connections = [
      {
        connectionKey: "p4:owner:team_gateway:1", ref: "team_gateway", version: 1, disabled: false, hasCredential: true,
        content: { type: "openai-compatible", name: "团队网关", baseUrl: "https://old.example.com/v1", modelRefs: ["team-model", "retired-model"] },
      },
      {
        connectionKey: "p4:owner:team_gateway:2", ref: "team_gateway", version: 2, disabled: false, hasCredential: true,
        content: { type: "openai-compatible", name: "团队网关", baseUrl: "https://old.example.com/v1", modelRefs: ["team-model"] },
      },
    ] as typeof original;
    try {
      const { tree } = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
      expect(textOf(tree)).toContain("retired-model");
      expect(input(tree, "启用模型 retired-model").props.checked).toBe(false);
      expect(textOf(tree)).toContain("曾启用");
    } finally {
      catalog.data.connections = original;
    }
  });

  it("lists test models and warns when an enabled model is missing from the test result", async () => {
    api.testExtension.mockResolvedValue({ ok: true, models: ["listed-model"] });
    const { tree } = render({ kind: "provider", mode: "edit", ref: "team_gateway" });
    const testButton = find(tree, item => item.type === "button" && textOf(item) === "发送测试消息")!;
    (testButton.props.onClick as () => void)();
    await flush();
    const after = render({ kind: "provider", mode: "edit", ref: "team_gateway" }).tree;
    expect(textOf(after)).toContain("listed-model");
    expect(textOf(after)).toContain("上次测试未在供应商返回的模型列表中找到");
  });
});
