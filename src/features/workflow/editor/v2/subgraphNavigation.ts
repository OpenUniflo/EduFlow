import type { CanvasViewport } from "./viewport";

/**
 * Presentation memory for one embedded workflow graph scope (main flow or a
 * nested subgraph). It is local to the editor session: no provider, store or
 * durable state. Navigation only reads and writes this memory; it never edits
 * the definition or the editor layout.
 */

export type WorkflowScopeTab = "node" | "state" | "graph" | "run" | "evaluation" | "environment" | "export";
export type WorkflowScopeContext = "edit" | "history";

export type WorkflowScopeUi = {
  selection: string | null;
  edgeSelection: string | null;
  inspectorOpen: boolean;
  tab: WorkflowScopeTab;
  nodeTab: "config" | "execution";
  selectedStepId: string | null;
  viewport?: CanvasViewport;
};

export type WorkflowScopeUiMemory = Pick<WorkflowScopeUi, "tab" | "nodeTab">;

export type WorkflowScopeGraphIndex = {
  nodeIds: ReadonlySet<string>;
  transitionIds: ReadonlySet<string>;
};

export type WorkflowScopeMemoryStore = {
  save: (key: string, ui: WorkflowScopeUi) => void;
  read: (key: string) => WorkflowScopeUi | undefined;
  clear: () => void;
};

/**
 * A history scope must not overwrite the editing scope that shares its path,
 * and two Runs must not swap a node panel that belonged to another snapshot.
 */
export function scopeMemoryKey(workflowId: string, path: readonly string[], context: WorkflowScopeContext, runId?: string | null): string {
  const run = context === "history" ? runId ?? "" : "";
  return `${workflowId}|${context}|${run}|${JSON.stringify(path)}`;
}

/** Bounded session map; the least recently saved scope is dropped first. */
export function createScopeMemoryStore(limit = 48): WorkflowScopeMemoryStore {
  const entries = new Map<string, WorkflowScopeUi>();
  return {
    save(key, ui) {
      entries.delete(key);
      entries.set(key, ui);
      while (entries.size > limit) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    read(key) { return entries.get(key); },
    clear() { entries.clear(); },
  };
}

/** Whether the panel is actually visible for a remembered tab/selection pair. */
export function scopeUiHasVisiblePanel(ui: Pick<WorkflowScopeUi, "selection" | "edgeSelection" | "inspectorOpen" | "tab">): boolean {
  return ui.inspectorOpen && (ui.tab !== "node" || Boolean(ui.selection || ui.edgeSelection));
}

/**
 * The next scope UI after a graph navigation. Returning to a remembered scope
 * restores its selection, panel and tab against the target graph; entering a
 * new scope keeps the current panel tab but starts without a stale selection.
 * An explicit caller fallback wins so "返回调用节点" always selects the node
 * that was just left, even when the remembered scope had no selection.
 * Selections that no longer exist in the target scope are dropped.
 */
export function navigationScopeUi(
  memory: WorkflowScopeUi | undefined,
  current: WorkflowScopeUiMemory,
  graph: WorkflowScopeGraphIndex,
  fallbackSelection?: string | null,
): WorkflowScopeUi {
  const remembered = memory?.selection && graph.nodeIds.has(memory.selection) ? memory.selection : null;
  const fallback = fallbackSelection && graph.nodeIds.has(fallbackSelection) ? fallbackSelection : null;
  const selection = fallback ?? remembered;
  if (!memory) {
    return {
      selection,
      edgeSelection: null,
      inspectorOpen: false,
      tab: current.tab,
      nodeTab: current.nodeTab,
      selectedStepId: null,
    };
  }
  const edgeSelection = memory.edgeSelection && graph.transitionIds.has(memory.edgeSelection) ? memory.edgeSelection : null;
  return {
    ...memory,
    selection,
    edgeSelection,
    inspectorOpen: scopeUiHasVisiblePanel({ ...memory, selection, edgeSelection }),
  };
}
