import { describe, expect, it, vi } from "vitest";
import type { WorkflowDocumentV2 } from "../../domain/v2/types";
import { ReferenceDocumentStore, referenceDocumentKey, type ReferenceDocumentLoadResult } from "./referenceDocuments";

const key = referenceDocumentKey("target", 1);
const document = { definition: { workflowId: "target", revision: 1, name: "目标" } } as unknown as WorkflowDocumentV2;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("fixed-reference definition cache", () => {
  it("keeps a deselected definition read alive and exposes it when the same target is selected again", async () => {
    const store = new ReferenceDocumentStore();
    const request = deferred<ReferenceDocumentLoadResult>();
    const load = vi.fn(() => request.promise);
    store.ensure(key, load);
    expect(store.getSnapshot()[key]).toEqual({ status: "loading" });

    // Closing the node panel removes the selection; selecting the same caller
    // again must not start a second request or discard the first response.
    store.ensure(key, load);
    expect(load).toHaveBeenCalledTimes(1);
    request.resolve({ ok: true, document, latestRevision: 2 });
    await flush();

    expect(store.getSnapshot()[key]).toEqual({ status: "ready", document, latestRevision: 2 });
    store.ensure(key, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("replaces a failed loading entry with a visible error and retries as a new request", async () => {
    const store = new ReferenceDocumentStore();
    const first = vi.fn(async () => ({ ok: false as const, message: "目标不存在", missing: true }));
    store.ensure(key, first);
    await flush();
    expect(store.getSnapshot()[key]).toEqual({ status: "error", message: "目标不存在", missing: true });

    const requested = deferred<ReferenceDocumentLoadResult>();
    const second = vi.fn(() => requested.promise);
    store.retry(key, second);
    expect(store.getSnapshot()[key]).toEqual({ status: "loading" });
    requested.resolve({ ok: true, document, latestRevision: 1 });
    await flush();
    expect(store.getSnapshot()[key]).toEqual({ status: "ready", document, latestRevision: 1 });
  });

  it("ignores the previous request when a retry has already started", async () => {
    const store = new ReferenceDocumentStore();
    const stale = deferred<ReferenceDocumentLoadResult>();
    const fresh = deferred<ReferenceDocumentLoadResult>();
    store.ensure(key, () => stale.promise);
    store.retry(key, () => fresh.promise);

    stale.resolve({ ok: true, document, latestRevision: 9 });
    await flush();
    expect(store.getSnapshot()[key]).toEqual({ status: "loading" });

    fresh.resolve({ ok: false, message: "读取失败", missing: false });
    await flush();
    expect(store.getSnapshot()[key]).toEqual({ status: "error", message: "读取失败", missing: false });
  });

  it("seeds the exact definition chosen in the picker and can be invalidated for an explicit reload", () => {
    const store = new ReferenceDocumentStore();
    store.remember(key, document, 3);
    expect(store.getSnapshot()[key]).toEqual({ status: "ready", document, latestRevision: 3 });
    store.invalidate(key);
    expect(store.getSnapshot()[key]).toBeUndefined();
  });
});
