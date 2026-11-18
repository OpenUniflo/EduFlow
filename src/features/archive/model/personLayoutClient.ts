import { computePersonLayout, personLayoutKey, type PersonLayout, type PersonLayoutEdge } from "./personLayout";
import type { PersonLayoutWorkerRequest, PersonLayoutWorkerResponse } from "./personLayout.worker";
import type { Vec3 } from "./atlas3dLayout";

const clientCache = new Map<string, PersonLayout>();

export type PersonLayoutInput = {
  structureKey: string;
  defaultPositions: Record<string, Vec3>;
  nodes: readonly { id: string }[];
  edges: readonly PersonLayoutEdge[];
  memberIds: ReadonlySet<string> | readonly string[];
};

/**
 * Small graphs compute synchronously; larger ones are moved to a worker so a
 * first person-centred layout cannot block the main thread. The layout module
 * is pure, so the worker and the synchronous path share one implementation.
 */
export function requestPersonLayout(input: PersonLayoutInput): { promise: Promise<PersonLayout>; usedWorker: boolean } {
  const members = Array.from(new Set(input.memberIds)).sort();
  const key = personLayoutKey(input.structureKey, members);
  const cached = clientCache.get(key);
  if (cached) return { promise: Promise.resolve(cached), usedWorker: false };
  const canUseWorker = typeof Worker !== "undefined" && input.nodes.length >= 450;
  if (!canUseWorker) {
    const layout = computePersonLayout({ ...input, nodes: input.nodes.slice(), edges: input.edges.slice(), memberIds: members });
    clientCache.set(key, layout);
    return { promise: Promise.resolve(layout), usedWorker: false };
  }
  const request: PersonLayoutWorkerRequest = {
    structureKey: input.structureKey,
    defaultPositions: input.defaultPositions,
    nodes: input.nodes.map((node) => ({ id: node.id })),
    edges: input.edges.slice(),
    memberIds: members
  };
  const worker = new Worker(new URL("./personLayout.worker.ts", import.meta.url), { type: "module" });
  const promise = new Promise<PersonLayout>((resolve, reject) => {
    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<PersonLayoutWorkerResponse>) => {
      finish();
      if (event.data.ok) { clientCache.set(key, event.data.layout); resolve(event.data.layout); }
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "person layout worker failed"));
    };
    worker.postMessage(request);
  });
  return { promise, usedWorker: true };
}

export function personLayoutCacheKey(input: PersonLayoutInput) {
  return personLayoutKey(input.structureKey, input.memberIds);
}
