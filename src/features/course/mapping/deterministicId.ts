function fnv1a(value: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Browser-safe deterministic identity from stable business semantics. */
export function deterministicMappingId(prefix: string, ...parts: string[]) {
  const value = parts.join("\0");
  return `${prefix}-${fnv1a(value, 2166136261)}${fnv1a(value, 3339675911)}`;
}

export function normalizeMappingSemanticKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
