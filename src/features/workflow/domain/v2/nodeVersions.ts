import type { WorkflowNodeV2 } from "./types";

/**
 * Executor type versions registered by the current Worker. `core.llm` and `core.tool` moved to
 * typeVersion 2 with the parameter-style prompt / tool contracts (plan 3.3 and 3.5). Every other
 * node type is still version 1. Frontend validation only reports retired nodes: it never rebuilds,
 * converts or silently upgrades persisted definitions.
 */
export const CURRENT_TYPE_VERSIONS: Readonly<Record<string, number>> = Object.freeze({ "core.llm": 2, "core.tool": 2 });

/** The retired typeVersion still present in definitions and importable JSON (R3). */
export const RETIRED_TYPE_VERSION = 1;

export function currentNodeTypeVersion(type: string): number {
  return Object.prototype.hasOwnProperty.call(CURRENT_TYPE_VERSIONS, type) ? CURRENT_TYPE_VERSIONS[type] : 1;
}

/** True only for a known retiring node type whose persisted typeVersion is below the current one. */
export function isRetiredNode(node: Pick<WorkflowNodeV2, "type" | "typeVersion"> | null | undefined): boolean {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return false;
  if (!Object.prototype.hasOwnProperty.call(CURRENT_TYPE_VERSIONS, node.type)) return false;
  const version = node.typeVersion;
  if (typeof version !== "number" || !Number.isFinite(version)) return false;
  return version < CURRENT_TYPE_VERSIONS[node.type];
}
