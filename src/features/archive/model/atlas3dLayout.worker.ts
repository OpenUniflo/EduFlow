import { computeAtlas3DLayout, type Atlas3DLayout } from "./atlas3dLayout";
import type { ArchiveEdge } from "./atlasModel";

export type Atlas3DLayoutWorkerRequest = {
  nodes: Array<{ id: string; domainId?: string }>;
  edges: Array<Pick<ArchiveEdge, "id" | "source" | "target" | "relation" | "strength">>;
};

export type Atlas3DLayoutWorkerResponse =
  | { ok: true; layout: Atlas3DLayout }
  | { ok: false; error: string };

self.onmessage = (event: MessageEvent<Atlas3DLayoutWorkerRequest>) => {
  try {
    const layout = computeAtlas3DLayout(event.data.nodes, event.data.edges);
    self.postMessage({ ok: true, layout } satisfies Atlas3DLayoutWorkerResponse);
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : "atlas layout worker failed" } satisfies Atlas3DLayoutWorkerResponse);
  }
};
