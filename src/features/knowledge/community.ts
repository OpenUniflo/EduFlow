import { getKnowledgeEdgeLayoutWeight } from "./graphLayout";
import type { KnowledgeEdge } from "./types";

export type GraphCommunity = {
  id: string;
  nodeIds: string[];
};

export function detectWeightedCommunities(
  nodeIds: Iterable<string>,
  edges: KnowledgeEdge[],
  options: { resolution?: number; minSize?: number; maxPasses?: number } = {}
): GraphCommunity[] {
  const ids = Array.from(new Set(nodeIds)).sort();
  const allowed = new Set(ids);
  const activeEdges = edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target));
  const resolution = options.resolution ?? 0.24;
  const maxPasses = options.maxPasses ?? 30;
  const adjacency = new Map(ids.map((id) => [id, new Map<string, number>()]));
  activeEdges.forEach((edge) => {
    const weight = getKnowledgeEdgeLayoutWeight(edge);
    adjacency.get(edge.source)?.set(edge.target, (adjacency.get(edge.source)?.get(edge.target) ?? 0) + weight);
    adjacency.get(edge.target)?.set(edge.source, (adjacency.get(edge.target)?.get(edge.source) ?? 0) + weight);
  });
  const degrees = new Map(ids.map((id) => [id, Array.from(adjacency.get(id)?.values() ?? []).reduce((sum, weight) => sum + weight, 0)]));
  const totalDegree = Math.max(0.001, Array.from(degrees.values()).reduce((sum, degree) => sum + degree, 0));
  const membership = new Map(ids.map((id) => [id, id]));
  const totals = new Map(ids.map((id) => [id, degrees.get(id) ?? 0]));

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let moved = false;
    ids.forEach((id) => {
      const currentCommunity = membership.get(id) as string;
      const degree = degrees.get(id) ?? 0;
      const weightsByCommunity = new Map<string, number>();
      adjacency.get(id)?.forEach((weight, neighbor) => {
        const community = membership.get(neighbor) as string;
        weightsByCommunity.set(community, (weightsByCommunity.get(community) ?? 0) + weight);
      });
      totals.set(currentCommunity, (totals.get(currentCommunity) ?? 0) - degree);
      weightsByCommunity.set(currentCommunity, weightsByCommunity.get(currentCommunity) ?? 0);
      let bestCommunity = currentCommunity;
      let bestGain = Number.NEGATIVE_INFINITY;
      Array.from(weightsByCommunity.keys()).sort().forEach((community) => {
        const gain = (weightsByCommunity.get(community) ?? 0) - resolution * ((totals.get(community) ?? 0) * degree) / totalDegree;
        if (gain > bestGain + 1e-9 || (Math.abs(gain - bestGain) <= 1e-9 && community < bestCommunity)) {
          bestGain = gain;
          bestCommunity = community;
        }
      });
      membership.set(id, bestCommunity);
      totals.set(bestCommunity, (totals.get(bestCommunity) ?? 0) + degree);
      if (bestCommunity !== currentCommunity) moved = true;
    });
    if (!moved) break;
  }

  const grouped = () => {
    const result = new Map<string, string[]>();
    ids.forEach((id) => {
      const community = membership.get(id) as string;
      result.set(community, [...(result.get(community) ?? []), id]);
    });
    return result;
  };

  // minSize is intentionally not used to merge small communities. A small, dense
  // community is valid and a sparse bridge must not force it into a larger island.
  const communities = grouped();

  return Array.from(communities.values())
    .map((members) => members.sort())
    .sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]))
    .map((members, index) => ({ id: `community-${index + 1}`, nodeIds: members }));
}
