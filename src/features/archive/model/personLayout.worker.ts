import { computePersonLayout, type PersonLayout, type PersonLayoutEdge } from "./personLayout";
import type { Vec3 } from "./atlas3dLayout";

export type PersonLayoutWorkerRequest = {
  structureKey: string;
  defaultPositions: Record<string, Vec3>;
  nodes: { id: string }[];
  edges: PersonLayoutEdge[];
  memberIds: string[];
};

export type PersonLayoutWorkerResponse = { ok: true; layout: PersonLayout } | { ok: false; error: string };

self.onmessage = (event: MessageEvent<PersonLayoutWorkerRequest>) => {
  try {
    const layout = computePersonLayout(event.data);
    (self as unknown as { postMessage: (message: PersonLayoutWorkerResponse) => void }).postMessage({ ok: true, layout });
  } catch (error) {
    (self as unknown as { postMessage: (message: PersonLayoutWorkerResponse) => void }).postMessage({ ok: false, error: error instanceof Error ? error.message : "person layout failed" });
  }
};
