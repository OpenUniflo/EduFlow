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

type Element = { type: unknown; props: Record<string, any> };

function render(overrides: Partial<VariableTableProps> = {}): Element {
  host.cursor = 0;
  const tree = VariableTable({ configuration, ...overrides });
  host.effects.splice(0).forEach(effect => effect());
  return tree as Element;
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
    expect(api.saveConfiguration).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, variables: expect.arrayContaining([expect.objectContaining({ key: "NEW_KEY", value: 0 })]) }));
    expect(editor.props.notice).toContain("修订 v3");
    expect(onConfigurationSaved).toHaveBeenCalledWith(saved);
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
