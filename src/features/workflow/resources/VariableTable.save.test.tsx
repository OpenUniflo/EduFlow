import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/shared/api/apiClient";
import type { WorkflowConfiguration } from "../domain/v2/types";

const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const api = vi.hoisted(() => ({ configuration: vi.fn(), saveConfiguration: vi.fn(), variableReferences: vi.fn() }));

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

import { VariableTable, type VariableTableProps } from "./VariableTable";

const configuration: WorkflowConfiguration = { revision: 2, variables: [{ key: "API_BASE", value: "https://x", overrides: {}, description: "接口" }] };

const environmentConfiguration: WorkflowConfiguration = {
  revision: 5,
  variables: [{ key: "API_BASE", value: "https://x", overrides: { dev: "https://dev", prod: "https://prod" }, description: "接口" }],
  environments: [
    { id: "dev", name: "开发", description: "本地", order: 0 },
    { id: "prod", name: "正式", description: "线上", order: 1 },
  ],
  defaultEnvironmentId: "dev",
};

type Element = { type: unknown; props: Record<string, any> };

function renderWith(value: WorkflowConfiguration, overrides: Partial<VariableTableProps> = {}): Element {
  host.cursor = 0;
  const tree = VariableTable({ configuration: value, ...overrides });
  host.effects.splice(0).forEach(effect => effect());
  return tree as Element;
}

function render(overrides: Partial<VariableTableProps> = {}): Element {
  return renderWith(configuration, overrides);
}

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

async function flush() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }

beforeEach(() => {
  host.slots = []; host.cursor = 0; host.effects = [];
  api.configuration.mockReset();
  api.saveConfiguration.mockReset();
  api.variableReferences.mockReset().mockResolvedValue({ items: [] });
});

describe("VariableTable save flow", () => {
  it("loads reference rows into the table", async () => {
    api.variableReferences.mockResolvedValue({ items: [{ workflowId: "wf", workflowName: "客服分流", revision: 2, graphPath: [], nodeId: "request", nodeLabel: "请求", variableKey: "API_BASE" }] });
    render();
    await flush();
    const editor = render();
    expect(api.variableReferences).toHaveBeenCalledTimes(1);
    expect(editor.props.referenceRows).toHaveLength(1);
  });

  it("saves the whole table with the loaded revision and reports the new revision", async () => {
    const saved: WorkflowConfiguration = { revision: 3, variables: [...configuration.variables, { key: "NEW_KEY", value: 0, overrides: {} }] };
    api.saveConfiguration.mockResolvedValue(saved);
    const onConfigurationSaved = vi.fn();
    const onCreated = vi.fn();
    render({ onConfigurationSaved, onCreated });
    await flush();
    let editor = render({ onConfigurationSaved, onCreated });
    (editor.props.onAdd as (key: string, type: string) => void)("NEW_KEY", "number");
    editor = render({ onConfigurationSaved, onCreated });
    (editor.props.onSave as () => void)();
    await flush();
    editor = render({ onConfigurationSaved, onCreated });
    expect(api.saveConfiguration).toHaveBeenCalledWith(expect.objectContaining({
      revision: 2, environments: [], defaultEnvironmentId: null,
      variables: expect.arrayContaining([expect.objectContaining({ key: "NEW_KEY", value: 0 })]),
    }));
    expect(editor.props.notice).toContain("修订 v3");
    expect(onConfigurationSaved).toHaveBeenCalledWith(expect.objectContaining({ revision: 3, environments: [], defaultEnvironmentId: null }));
    expect(onCreated).toHaveBeenCalledWith("NEW_KEY", 3, { key: "NEW_KEY", value: 0 });
  });

  it("keeps the draft and asks for a refresh when the save hits a revision conflict", async () => {
    api.saveConfiguration.mockRejectedValue(new ApiRequestError("REVISION_CONFLICT", "Configuration revision changed", 409));
    render();
    await flush();
    let editor = render();
    (editor.props.onSave as () => void)();
    await flush();
    editor = render();
    expect(editor.props.conflict).toContain("保存冲突");
    expect(editor.props.conflict).toContain("刷新");
    expect(editor.props.error).toBe("");
    expect(editor.props.configuration.variables).toHaveLength(1);
  });

  it("creates an environment, sets it as default, overrides a value and saves one payload", async () => {
    const saved: WorkflowConfiguration = { revision: 6, variables: [{ key: "API_BASE", value: "https://x", overrides: {}, description: "接口" }] };
    api.saveConfiguration.mockResolvedValue(saved);
    const onConfigurationSaved = vi.fn();
    renderWith(configuration, { onConfigurationSaved });
    await flush();
    let editor = renderWith(configuration, { onConfigurationSaved });
    (editor.props.onCreateEnvironment as (name: string) => void)("开发");
    editor = renderWith(configuration, { onConfigurationSaved });
    const environmentId = editor.props.configuration.environments[0].id as string;
    (editor.props.onSetDefaultEnvironment as (id: string) => void)(environmentId);
    editor = renderWith(configuration, { onConfigurationSaved });
    (editor.props.onSetEnvironmentValue as (index: number, id: string, raw: string) => void)(0, environmentId, "dev-value");
    editor = renderWith(configuration, { onConfigurationSaved });
    (editor.props.onSave as () => void)();
    await flush();
    editor = renderWith(configuration, { onConfigurationSaved });
    expect(api.saveConfiguration).toHaveBeenCalledWith(expect.objectContaining({
      revision: 2,
      defaultEnvironmentId: environmentId,
      environments: [expect.objectContaining({ id: environmentId, name: "开发", description: "", order: 0 })],
      variables: [expect.objectContaining({ key: "API_BASE", overrides: { [environmentId]: "dev-value" } })],
    }));
    expect(onConfigurationSaved).toHaveBeenCalledWith(expect.objectContaining({ defaultEnvironmentId: environmentId }));
    expect(editor.props.configuration.environments).toHaveLength(1);
  });

  it("confirms deletion, clears that environment's overrides and falls back from a deleted default", async () => {
    renderWith(environmentConfiguration);
    await flush();
    let editor = renderWith(environmentConfiguration);
    (editor.props.onSelectTab as (tab: string) => void)("environments");
    editor = renderWith(environmentConfiguration);
    (editor.props.onRequestDeleteEnvironment as (id: string) => void)("dev");
    editor = renderWith(environmentConfiguration);
    expect(editor.props.pendingDeleteEnvironmentId).toBe("dev");
    (editor.props.onConfirmDeleteEnvironment as () => void)();
    editor = renderWith(environmentConfiguration);
    expect(editor.props.configuration.environments.map((environment: { id: string }) => environment.id)).toEqual(["prod"]);
    expect(editor.props.configuration.defaultEnvironmentId).toBe("prod");
    expect(editor.props.configuration.variables[0].overrides).toEqual({ prod: "https://prod" });
  });

  it("recovers inheritance by deleting one environment override", async () => {
    renderWith(environmentConfiguration);
    await flush();
    let editor = renderWith(environmentConfiguration);
    (editor.props.onSelectTab as (tab: string) => void)("environments");
    editor = renderWith(environmentConfiguration);
    (editor.props.onOpenEnvironment as (id: string) => void)("dev");
    editor = renderWith(environmentConfiguration);
    (editor.props.onClearEnvironmentValue as (index: number, id: string) => void)(0, "dev");
    editor = renderWith(environmentConfiguration);
    expect(editor.props.configuration.variables[0].overrides).toEqual({ prod: "https://prod" });
    expect(editor.props.editingEnvironmentId).toBe("dev");
  });

  it("keeps environment edits in the draft when the save conflicts", async () => {
    api.saveConfiguration.mockRejectedValue(new ApiRequestError("REVISION_CONFLICT", "Configuration revision changed", 409));
    renderWith(environmentConfiguration);
    await flush();
    let editor = renderWith(environmentConfiguration);
    (editor.props.onRenameEnvironment as (id: string, name: string) => void)("dev", "开发环境");
    editor = renderWith(environmentConfiguration);
    (editor.props.onSave as () => void)();
    await flush();
    editor = renderWith(environmentConfiguration);
    expect(editor.props.conflict).toContain("保存冲突");
    expect(editor.props.configuration.environments[0].name).toBe("开发环境");
  });

  it("reports ordinary save failures without a conflict banner", async () => {
    api.saveConfiguration.mockRejectedValue(new ApiRequestError("INVALID_CONFIGURATION", "Invalid configuration", 400));
    render();
    await flush();
    let editor = render();
    (editor.props.onSave as () => void)();
    await flush();
    editor = render();
    expect(editor.props.conflict).toBe("");
    expect(editor.props.error).toContain("变量配置无效");
  });
});
