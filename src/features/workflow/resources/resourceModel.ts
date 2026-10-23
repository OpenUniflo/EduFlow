import type { JsonValue } from "../domain/v2/types";
import type { Extensions, FunctionVersion } from "../editor/v2/FunctionExecutionFields";

/** One managed connection returned by the Workflow extensions catalog. */
export type CatalogConnection = Extensions["connections"][number];

/** Versions of one catalog reference, newest first. */
export type CatalogGroup<T extends { ref: string; version: number }> = {
  ref: string;
  versions: T[];
  latest: T;
  latestVersion: number;
};

function compareRefs(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Stable text ordering so discovery lists do not change order between renders. */
export function compareModelNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Groups every version of each catalog reference; versions are newest first and groups are name-sorted. */
export function groupCatalogByRef<T extends { ref: string; version: number }>(entries: readonly T[]): CatalogGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const versions = groups.get(entry.ref);
    if (versions) versions.push(entry);
    else groups.set(entry.ref, [entry]);
  }
  return [...groups.entries()]
    .map(([ref, versions]) => {
      versions.sort((left, right) => right.version - left.version);
      return { ref, versions, latest: versions[0], latestVersion: versions[0].version };
    })
    .sort((left, right) => compareRefs(left.ref, right.ref));
}

/** Highest version overall, or the highest version of one reference when `ref` is provided. */
export function latestVersion(entries: readonly { ref: string; version: number }[], ref?: string): number {
  let latest = 0;
  for (const entry of entries) {
    if (ref !== undefined && entry.ref !== ref) continue;
    if (entry.version > latest) latest = entry.version;
  }
  return latest;
}

/** One entry per reference: its newest version. */
export function latestEntries<T extends { ref: string; version: number }>(entries: readonly T[]): T[] {
  return groupCatalogByRef(entries).map(group => group.latest);
}

export function connectionTypeOf(entry: { content: Record<string, JsonValue> }): string {
  return typeof entry.content.type === "string" ? entry.content.type : "";
}

export function isProviderConnection(entry: { content: Record<string, JsonValue> }): boolean {
  const type = connectionTypeOf(entry);
  return type === "deepseek" || type === "openai-compatible";
}

/** Newest version of every connection in one resource-center category. */
export function latestConnectionsOfType(
  connections: readonly CatalogConnection[],
  category: "http" | "mcp-http" | "provider",
): CatalogConnection[] {
  return latestEntries(connections).filter(entry => category === "provider" ? isProviderConnection(entry) : connectionTypeOf(entry) === category);
}

/**
 * Models returned by a connection test that are not enabled yet.
 * Discovery is session state only: deduplicated, trimmed, blank-free and sorted.
 */
export function mergeDiscoveredModels(enabled: readonly string[], discovered: readonly string[]): string[] {
  const active = new Set(enabled.map(model => model.trim()).filter(Boolean));
  const fresh = discovered
    .map(model => model.trim())
    .filter(Boolean)
    .filter(model => !active.has(model));
  return [...new Set(fresh)].sort(compareModelNames);
}

/** Parses the manual "enabled models" input, preserving the user's order while removing duplicates. */
export function parseModelList(text: string): string[] {
  const models = text.split(/[,\n]/).map(model => model.trim()).filter(Boolean);
  return [...new Set(models)];
}

export function connectionTypeLabel(type: string): string {
  return ({
    http: "API 连接",
    deepseek: "DeepSeek API",
    "mcp-http": "MCP HTTP",
    "openai-compatible": "OpenAI 兼容",
  } as Record<string, string>)[type] ?? (type || "未分类连接");
}

export function connectionAccessLabel(content: Record<string, JsonValue>): string {
  return String(content.sideEffect) === "write" ? "可能写入外部数据" : "只读或计算";
}

export function credentialLabel(entry: { hasCredential?: boolean; disabled?: boolean }): string {
  if (entry.disabled) return "已停用";
  return entry.hasCredential ? "已配置加密凭据" : "无凭据";
}

export function modelRefsOf(content: Record<string, JsonValue>): string[] {
  return Array.isArray(content.modelRefs) ? content.modelRefs.filter((model): model is string => typeof model === "string") : [];
}

export type ResourceCounts = {
  /** Every count is `undefined` until that part of the catalog has loaded; badges stay empty instead of faking zero. */
  providers?: number;
  apis?: number;
  mcp?: number;
  functions?: number;
  variables?: number;
};

/** Navigation counts for the resource center. Null data renders as an empty badge, not a fake zero. */
export function resourceCounts(input: {
  connections?: readonly CatalogConnection[] | null;
  functions?: readonly FunctionVersion[] | null;
  variables?: readonly { key: string }[] | null;
}): ResourceCounts {
  const connections = input.connections ?? null;
  return {
    providers: connections ? latestConnectionsOfType(connections, "provider").length : undefined,
    apis: connections ? latestConnectionsOfType(connections, "http").length : undefined,
    mcp: connections ? latestConnectionsOfType(connections, "mcp-http").length : undefined,
    functions: input.functions ? groupCatalogByRef(input.functions).length : undefined,
    variables: input.variables ? input.variables.length : undefined,
  };
}
