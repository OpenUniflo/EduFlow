/** Read-only quality signals, never a connectivity optimization or edge writer. */
export type ProjectStructureEdge = { source: string; target: string; relation: 'prerequisite' | 'enables' | 'related' };
export function auditProjectStructure(targetIds: readonly string[], edges: readonly ProjectStructureEdge[], visibleIds: readonly string[] = targetIds) {
  const members = new Set(visibleIds);
  const targets = [...new Set(targetIds)].filter(id => members.has(id)).sort();
  const internal = edges.filter(edge => members.has(edge.source) && members.has(edge.target));
  const adjacency = new Map([...members].map(id => [id, new Set<string>()]));
  for (const edge of internal) if (edge.relation !== 'related') {
    adjacency.get(edge.source)!.add(edge.target); adjacency.get(edge.target)!.add(edge.source);
  }
  const unseen = new Set(members); const componentSizes: number[] = [];
  for (const id of members) if (unseen.delete(id)) {
    const queue = [id];
    for (let i = 0; i < queue.length; i++) for (const next of adjacency.get(queue[i])!) if (unseen.delete(next)) queue.push(next);
    componentSizes.push(queue.length);
  }
  return {
    projectTargetCount: targets.length,
    prerequisiteEdgeCount: internal.filter(edge => edge.relation === 'prerequisite').length,
    enablesEdgeCount: internal.filter(edge => edge.relation === 'enables').length,
    relatedEdgeCount: internal.filter(edge => edge.relation === 'related').length,
    isolatedTargetIds: targets.filter(id => adjacency.get(id)!.size === 0),
    degreeOneTargetIds: targets.filter(id => adjacency.get(id)!.size === 1),
    componentCount: componentSizes.length, componentSizes: componentSizes.sort((a, b) => b - a),
  };
}
