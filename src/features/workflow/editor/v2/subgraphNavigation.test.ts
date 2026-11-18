import { describe, expect, it } from "vitest";
import { createScopeMemoryStore, navigationScopeUi, scopeMemoryKey, scopeUiHasVisiblePanel, type WorkflowScopeUi } from "./subgraphNavigation";

const graph = {
  nodeIds: new Set(["caller", "child", "start"]),
  transitionIds: new Set(["edge-a"]),
};

function remembered(overrides: Partial<WorkflowScopeUi> = {}): WorkflowScopeUi {
  return {
    selection: "caller",
    edgeSelection: null,
    inspectorOpen: true,
    tab: "node",
    nodeTab: "config",
    selectedStepId: null,
    viewport: { x: 120, y: 64, zoom: 0.72 },
    ...overrides,
  };
}

describe("workflow scope memory keys", () => {
  it("isolates sibling and nested paths", () => {
    const root = scopeMemoryKey("workflow", [], "edit");
    expect(root).not.toBe(scopeMemoryKey("workflow", ["skills"], "edit"));
    expect(scopeMemoryKey("workflow", ["skills"], "edit")).not.toBe(scopeMemoryKey("workflow", ["skills", "nested"], "edit"));
  });

  it("isolates history from editing and one Run from another", () => {
    const editing = scopeMemoryKey("workflow", ["skills"], "edit", "run-a");
    const historyA = scopeMemoryKey("workflow", ["skills"], "history", "run-a");
    const historyB = scopeMemoryKey("workflow", ["skills"], "history", "run-b");
    expect(editing).not.toBe(historyA);
    expect(historyA).not.toBe(historyB);
    expect(scopeMemoryKey("workflow", ["skills"], "edit", "run-b")).toBe(editing);
  });
});

describe("workflow scope memory store", () => {
  it("returns the latest state for a scope and drops the least recently saved", () => {
    const store = createScopeMemoryStore(2);
    store.save("a", remembered({ selection: "caller" }));
    store.save("b", remembered({ selection: "child" }));
    store.save("a", remembered({ selection: "start" }));
    expect(store.read("a")?.selection).toBe("start");
    store.save("c", remembered({ selection: "child" }));
    expect(store.read("b")).toBeUndefined();
    expect(store.read("a")?.selection).toBe("start");
    expect(store.read("c")?.selection).toBe("child");
    store.clear();
    expect(store.read("a")).toBeUndefined();
  });
});

describe("scope navigation restore", () => {
  it("restores the caller selection, panel, tab and viewport", () => {
    const next = navigationScopeUi(remembered({ tab: "run" }), { tab: "node", nodeTab: "config" }, graph);
    expect(next).toMatchObject({ selection: "caller", edgeSelection: null, inspectorOpen: true, tab: "run", viewport: { x: 120, y: 64, zoom: 0.72 } });
  });

  it("restores an edge selection and its panel", () => {
    const next = navigationScopeUi(remembered({ selection: null, edgeSelection: "edge-a" }), { tab: "node", nodeTab: "config" }, graph);
    expect(next.selection).toBeNull();
    expect(next.edgeSelection).toBe("edge-a");
    expect(next.inspectorOpen).toBe(true);
  });

  it("opens a fresh scope without carrying the previous selection or panel", () => {
    const next = navigationScopeUi(undefined, { tab: "run", nodeTab: "execution" }, graph);
    expect(next).toEqual({ selection: null, edgeSelection: null, inspectorOpen: false, tab: "run", nodeTab: "execution", selectedStepId: null });
  });

  it("drops a remembered node or edge that is gone from the target graph", () => {
    const next = navigationScopeUi(remembered({ selection: "deleted", edgeSelection: "deleted-edge" }), { tab: "node", nodeTab: "config" }, graph);
    expect(next.selection).toBeNull();
    expect(next.edgeSelection).toBeNull();
    expect(next.inspectorOpen).toBe(false);
    expect(next.viewport).toEqual({ x: 120, y: 64, zoom: 0.72 });
  });

  it("does not report a node panel as visible when no selection was remembered", () => {
    expect(scopeUiHasVisiblePanel({ selection: null, edgeSelection: null, inspectorOpen: true, tab: "node" })).toBe(false);
    expect(scopeUiHasVisiblePanel({ selection: null, edgeSelection: null, inspectorOpen: true, tab: "run" })).toBe(true);
  });

  it("uses the caller fallback when the remembered parent run panel had no selection", () => {
    const next = navigationScopeUi(
      remembered({ selection: null, tab: "run" }),
      { tab: "node", nodeTab: "execution" },
      graph,
      "caller",
    );
    expect(next).toMatchObject({
      selection: "caller",
      edgeSelection: null,
      inspectorOpen: true,
      tab: "run",
      viewport: { x: 120, y: 64, zoom: 0.72 },
    });
  });

  it("lets the explicit caller fallback win over a different remembered node", () => {
    const next = navigationScopeUi(remembered({ selection: "child" }), { tab: "node", nodeTab: "config" }, graph, "caller");
    expect(next.selection).toBe("caller");
  });

  it("drops a caller fallback that is not part of the target graph", () => {
    const next = navigationScopeUi(remembered({ selection: null }), { tab: "run", nodeTab: "config" }, graph, "missing");
    expect(next.selection).toBeNull();
  });
});
