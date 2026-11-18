import {
  cacheAtlas3DLayout,
  computeAtlas3DLayout,
  readAtlas3DLayoutCache,
  type Atlas3DLayout,
  type Atlas3DLayoutNode
} from "./atlas3dLayout";
import type { ArchiveEdge } from "./atlasModel";
import type { Atlas3DLayoutWorkerRequest, Atlas3DLayoutWorkerResponse } from "./atlas3dLayout.worker";

export type Atlas3DLayoutRequest = {
  promise: Promise<Atlas3DLayout>;
  usedWorker: boolean;
  cached: boolean;
};

/**
 * The default relation-driven force layout is off the main thread. A structural
 * cache hit (memory or sessionStorage) resolves synchronously, so returning to
 * the Archive the second time never recomputes or shows a loading state.
 */
export function requestAtlas3DLayout(
  nodes: readonly Atlas3DLayoutNode[],
  edges: readonly Pick<ArchiveEdge, "id" | "source" | "target" | "relation" | "strength">[]
): Atlas3DLayoutRequest {
  const cached = readAtlas3DLayoutCache(nodes, edges);
  if (cached) return { promise: Promise.resolve(cached), usedWorker: false, cached: true };
  const canUseWorker = typeof Worker !== "undefined" && nodes.length >= 120;
  if (!canUseWorker) {
    const layout = computeAtlas3DLayout(nodes, edges);
    cacheAtlas3DLayout(layout);
    return { promise: Promise.resolve(layout), usedWorker: false, cached: false };
  }
  const request: Atlas3DLayoutWorkerRequest = {
    nodes: nodes.map((node) => ({ id: node.id, domainId: node.domainId })),
    edges: edges.map((edge) => ({ ...edge }))
  };
  const worker = new Worker(new URL("./atlas3dLayout.worker.ts", import.meta.url), { type: "module" });
  const promise = new Promise<Atlas3DLayout>((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; worker.terminate(); } };
    const fallback = () => {
      if (settled) return;
      finish();
      const layout = computeAtlas3DLayout(nodes, edges);
      cacheAtlas3DLayout(layout);
      resolve(layout);
    };
    worker.onmessage = (event: MessageEvent<Atlas3DLayoutWorkerResponse>) => {
      if (settled) return;
      if (event.data.ok) {
        finish();
        cacheAtlas3DLayout(event.data.layout);
        resolve(event.data.layout);
      } else {
        fallback();
      }
    };
    worker.onerror = fallback;
    worker.postMessage(request);
  });
  return { promise, usedWorker: true, cached: false };
}
