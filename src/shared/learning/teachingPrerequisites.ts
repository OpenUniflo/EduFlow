/** Instructional readiness only; this is never evidence of mastery. */
export function satisfiesTeachingPrerequisite(status: string | undefined): boolean {
  return status === "learned" || status === "practicing" || status === "mastered";
}

/** Shared readiness predicate for existing Micro execution and action availability. */
export function hasUnmetHardPrerequisite(nodeId: string, acquiredIds: ReadonlySet<string>, edges: readonly { source: string; target: string; strength: string }[]): boolean {
  return !acquiredIds.has(nodeId) && edges.some(edge => edge.strength === 'hard' && edge.target === nodeId && !acquiredIds.has(edge.source));
}
