import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonValue } from "../domain/v2/types";
import type { CatalogConnection } from "./resourceModel";

const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const api = vi.hoisted(() => ({ extensionReferences: vi.fn(), testExtension: vi.fn(), extension: vi.fn() }));

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

import { ProviderOverview, type ProviderOverviewProps } from "./ProviderOverview";

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

function findAll(node: unknown, predicate: (element: Element) => boolean): Element[] {
  const found: Element[] = [];
  walk(node, element => { if (predicate(element)) found.push(element); });
  return found;
}

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!node || typeof node !== "object") return "";
  return textOf((node as Element).props?.children);
}

const connection = (ref: string, version: number, content: Record<string, JsonValue>, extra: Partial<CatalogConnection> = {}): CatalogConnection => ({
  connectionKey: `p4:owner:${ref}:${version}`, ref, version, disabled: false, hasCredential: false, content, ...extra,
});

const localProvider = connection("local_openai", 1, { type: "openai-compatible", name: "本地网关", baseUrl: "http://127.0.0.1:18080/v1", modelRefs: ["fake-openai-chat", "fake-openai-reasoner"] });
const remoteProvider = connection("remote_gateway", 2, { type: "openai-compatible", name: "远程网关", baseUrl: "https://models.example/v1", modelRefs: ["gateway-a", "gateway-b"] }, { hasCredential: true });

function baseProps(connections: readonly CatalogConnection[]): ProviderOverviewProps {
  return {
    environmentRef: "local", connections, platformProviders: [],
    onRequestAdd: vi.fn(), onRequestEdit: vi.fn(), onResourcesChanged: vi.fn(), onOpenReference: vi.fn(),
  };
}

function render(props: ProviderOverviewProps): Element {
  host.cursor = 0;
  const tree = ProviderOverview(props);
  host.effects.splice(0).forEach(effect => effect());
  return tree as Element;
}

async function flush() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }

function modelSwitch(tree: Element, model: string): Element | undefined {
  return find(tree, element => element.props["data-model-ref"] === model && element.props.type === "checkbox");
}

beforeEach(() => {
  host.slots = []; host.cursor = 0; host.effects = [];
  api.extensionReferences.mockReset().mockResolvedValue({ items: [] });
  api.testExtension.mockReset();
  api.extension.mockReset().mockResolvedValue({ ok: true });
});

describe("ProviderOverview staging and save", () => {
  it("stages a model switch and publishes a new immutable version", async () => {
    const props = baseProps([localProvider]);
    render(props); await flush();
    let tree = render(props);
    (modelSwitch(tree, "fake-openai-reasoner")!.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: false } });
    tree = render(props);
    const confirm = find(tree, element => "data-provider-confirm" in element.props)!;
    expect(textOf(confirm)).toContain("将发布 v2");
    expect(textOf(confirm)).toContain("正在使用 v1 的节点不受影响");
    expect(textOf(confirm)).toContain("保存为 v2");
    const save = find(tree, element => element.props["data-provider-action"] === "save")!;
    expect(save.props.disabled).toBe(false);
    (save.props.onClick as () => void)();
    await flush();
    expect(api.extension).toHaveBeenCalledWith("local", expect.objectContaining({
      action: "publish", kind: "connection", ref: "local_openai", version: 2, credential: "",
      content: expect.objectContaining({ type: "openai-compatible", baseUrl: "http://127.0.0.1:18080/v1", modelRefs: ["fake-openai-chat"] }),
    }));
    expect(props.onResourcesChanged).toHaveBeenCalled();
  });

  it("refuses to stage an empty model list", async () => {
    const props = baseProps([localProvider]);
    render(props); await flush();
    let tree = render(props);
    (modelSwitch(tree, "fake-openai-chat")!.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: false } });
    tree = render(props);
    (modelSwitch(tree, "fake-openai-reasoner")!.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: false } });
    tree = render(props);
    const confirm = find(tree, element => "data-provider-confirm" in element.props)!;
    expect(textOf(confirm)).toContain("至少保留一个模型才能保存");
    expect(find(tree, element => element.props["data-provider-action"] === "save")!.props.disabled).toBe(true);
    expect(api.extension).not.toHaveBeenCalled();
  });

  it("requires a fresh API key for remote providers before publishing", async () => {
    const props = baseProps([remoteProvider]);
    render(props); await flush();
    let tree = render(props);
    (modelSwitch(tree, "gateway-b")!.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: false } });
    tree = render(props);
    const credentialInput = find(tree, element => typeof element.props["aria-label"] === "string" && element.props["aria-label"].startsWith("发布新版本 API Key"))!;
    expect(find(tree, element => element.props["data-provider-action"] === "save")!.props.disabled).toBe(true);
    expect(textOf(find(tree, element => "data-provider-confirm" in element.props))).toContain("重新输入 API Key");
    (credentialInput.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "test-key-local" } });
    tree = render(props);
    const save = find(tree, element => element.props["data-provider-action"] === "save")!;
    expect(save.props.disabled).toBe(false);
    (save.props.onClick as () => void)();
    await flush();
    expect(api.extension).toHaveBeenCalledWith("local", expect.objectContaining({ version: 3, credential: "test-key-local" }));
  });

  it("requires a fresh key when a local provider already stores a credential", async () => {
    const localWithSecret = connection("local_secure", 1, { type: "openai-compatible", name: "本地安全网关", baseUrl: "http://127.0.0.1:18080/v1", modelRefs: ["a-model", "b-model"] }, { hasCredential: true });
    const props = baseProps([localWithSecret]);
    render(props); await flush();
    let tree = render(props);
    (modelSwitch(tree, "b-model")!.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: false } });
    tree = render(props);
    expect(find(tree, element => typeof element.props["aria-label"] === "string" && element.props["aria-label"].startsWith("发布新版本 API Key"))).toBeTruthy();
    expect(find(tree, element => element.props["data-provider-action"] === "save")!.props.disabled).toBe(true);
  });

  it("filters provider cards through the search box", async () => {
    const props = baseProps([localProvider, remoteProvider]);
    render(props); await flush();
    let tree = render(props);
    const search = find(tree, element => element.props["aria-label"] === "搜索模型供应商")!;
    (search.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "fake-openai-reasoner" } });
    tree = render(props);
    expect(findAll(tree, element => "data-provider-ref" in element.props)).toHaveLength(1);
    expect(textOf(tree)).not.toContain("远程网关");
  });

  it("shows workflow usage and model node counts from the reference scan", async () => {
    api.extensionReferences.mockResolvedValue({ items: [
      { workflowId: "wf-1", workflowName: "客服", revision: 1, graphPath: [], nodeId: "model", nodeLabel: "模型", modelRef: "fake-openai-chat" },
      { workflowId: "wf-1", workflowName: "客服", revision: 1, graphPath: [], nodeId: "model-2", nodeLabel: "模型 2", modelRef: "fake-openai-chat" },
      { workflowId: "wf-2", workflowName: "分流", revision: 1, graphPath: [], nodeId: "model", nodeLabel: "模型", modelRef: "fake-openai-reasoner" },
    ] });
    render(baseProps([localProvider]));
    await flush();
    const tree = render(baseProps([localProvider]));
    const text = textOf(tree);
    expect(text).toContain("被 2 个工作流使用");
    expect(text).toContain("2 个节点");
    expect(text).toContain("1 个节点");
  });
});
