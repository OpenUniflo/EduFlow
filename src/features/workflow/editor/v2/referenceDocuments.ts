import type { WorkflowDocumentV2 } from "../../domain/v2/types";

/**
 * Cache for the exact definitions behind fixed-reference nodes. It is scoped to
 * one mounted editor, never persisted, and deliberately survives closing the
 * node panel: a definition read is not tied to which node happens to be
 * selected. A visible loading entry therefore always has a request that will
 * settle it, including after the caller deselects and selects the same target
 * again.
 */
export type ReferenceDocumentState =
  | { status: "loading" }
  | { status: "ready"; document: WorkflowDocumentV2; latestRevision: number }
  | { status: "error"; message: string; missing: boolean };

export type ReferenceDocumentLoadResult =
  | { ok: true; document: WorkflowDocumentV2; latestRevision: number }
  | { ok: false; message: string; missing: boolean };

export type ReferenceDocumentLoader = () => Promise<ReferenceDocumentLoadResult>;

export function referenceDocumentKey(workflowId: string, revision: number): string {
  return `${workflowId}@${revision}`;
}

export class ReferenceDocumentStore {
  private states: Record<string, ReferenceDocumentState> = {};
  private pending = new Set<string>();
  private generations = new Map<string, number>();
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): Record<string, ReferenceDocumentState> => this.states;

  private publish(next: Record<string, ReferenceDocumentState>) {
    this.states = next;
    for (const listener of this.listeners) listener();
  }

  private current(key: string, generation: number) {
    return this.generations.get(key) === generation;
  }

  /** Starts the one request for this key unless a cached result or request already exists. */
  ensure(key: string, load: ReferenceDocumentLoader): void {
    const state = this.states[key];
    if (state?.status === "ready" || state?.status === "error") return;
    if (this.pending.has(key)) return;
    this.start(key, load);
  }

  /** Records a definition the picker already fetched, cancelling any older request. */
  remember(key: string, document: WorkflowDocumentV2, latestRevision: number): void {
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    this.pending.delete(key);
    this.publish({ ...this.states, [key]: { status: "ready", document, latestRevision } });
  }

  /** Drops a settled or in-flight result and starts a fresh read. */
  retry(key: string, load: ReferenceDocumentLoader): void {
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);
    this.pending.delete(key);
    const next = { ...this.states };
    delete next[key];
    this.publish(next);
    this.start(key, load, generation);
  }

  /** Drops a key without starting a request (the next ensure starts it). */
  invalidate(key: string): void {
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    this.pending.delete(key);
    if (!(key in this.states)) return;
    const next = { ...this.states };
    delete next[key];
    this.publish(next);
  }

  private start(key: string, load: ReferenceDocumentLoader, generation = (this.generations.get(key) ?? 0) + 1) {
    this.generations.set(key, generation);
    this.pending.add(key);
    this.publish({ ...this.states, [key]: { status: "loading" } });
    void load().then(result => {
      if (!this.current(key, generation)) return;
      this.publish({
        ...this.states,
        [key]: result.ok
          ? { status: "ready", document: result.document, latestRevision: result.latestRevision }
          : { status: "error", message: result.message, missing: result.missing },
      });
    }).catch(() => {
      if (!this.current(key, generation)) return;
      this.publish({ ...this.states, [key]: { status: "error", message: "目标工作流读取未完成，请检查连接后重试。", missing: false } });
    }).finally(() => {
      if (this.current(key, generation)) this.pending.delete(key);
    });
  }
}
