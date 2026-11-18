import type { ArchiveEdge } from "./atlasModel";

/**
 * Deterministic topic grouping for the Archive's middle map level.
 *
 * Communities are derived from factual edges inside a single Domain. They are a
 * presentation-only grouping: never persisted, never KnowledgeNodes, and never
 * used as a layout anchor. The label is the group member with the highest
 * internal degree (ties by smaller node id).
 */

export type CommunityNode = { id: string; title: string; domainId?: string };
export type AtlasCommunity = {
  id: string;
  domainId: string;
  name: string;
  nodeIds: string[];
  size: number;
};

type CommunityEdge = Pick<ArchiveEdge, "source" | "target" | "relation" | "strength">;

const UNCLASSIFIED = "__unclassified";
/** Groups below this size are folded into their strongest factual neighbour. */
const MIN_TOPIC_SIZE = 6;
/** Above this many groups the smallest group is folded until the cap is met. */
const MAX_TOPICS = 14;
/** Tiny graphs keep their exact partition; merging only applies to real maps. */
const MERGE_FROM_NODES = 24;

function edgeWeight(edge: CommunityEdge) {
  if (edge.relation === "related") return 0.5;
  return edge.strength === "hard" ? 1 : 0.8;
}

function internalDegree(nodeIds: ReadonlySet<string>, edges: readonly CommunityEdge[]) {
  const degree = new Map<string, number>();
  nodeIds.forEach((id) => degree.set(id, 0));
  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  });
  return degree;
}

function detectLabelPropagation(nodeIds: readonly string[], edges: readonly CommunityEdge[]) {
  const memberIds = new Set(nodeIds);
  const internal = edges.filter((edge) => memberIds.has(edge.source) && memberIds.has(edge.target) && edge.source !== edge.target);
  const neighbours = new Map<string, CommunityEdge[]>();
  nodeIds.forEach((id) => neighbours.set(id, []));
  internal.forEach((edge) => {
    neighbours.get(edge.source)!.push(edge);
    neighbours.get(edge.target)!.push(edge);
  });
  let labels = new Map(nodeIds.map((id) => [id, id] as const));
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const next = new Map(labels);
    nodeIds.forEach((id) => {
      const scores = new Map<string, number>();
      // A small self preference prevents a dense bridge from dissolving every
      // local group into one giant topic.
      scores.set(labels.get(id)!, 0.9);
      (neighbours.get(id) ?? []).forEach((edge) => {
        const other = edge.source === id ? edge.target : edge.source;
        const label = labels.get(other)!;
        scores.set(label, (scores.get(label) ?? 0) + edgeWeight(edge));
      });
      let bestLabel = labels.get(id)!;
      let bestScore = -1;
      scores.forEach((score, label) => {
        if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) < 1e-9 && label < bestLabel)) {
          bestLabel = label;
          bestScore = score;
        }
      });
      next.set(id, bestLabel);
    });
    const stable = nodeIds.every((id) => next.get(id) === labels.get(id));
    labels = next;
    if (stable) break;
  }
  return labels;
}

function mergeSingletons(groups: Map<string, string[]>, nodeIds: readonly string[], edges: readonly CommunityEdge[]) {
  const memberGroup = new Map<string, string>();
  groups.forEach((members, label) => members.forEach((id) => memberGroup.set(id, label)));
  nodeIds
    .filter((id) => (groups.get(memberGroup.get(id)!) ?? []).length === 1)
    .sort()
    .forEach((id) => {
      const ownLabel = memberGroup.get(id)!;
      if ((groups.get(ownLabel) ?? []).length > 1) return;
      const scores = new Map<string, number>();
      edges.forEach((edge) => {
        if (edge.source !== id && edge.target !== id) return;
        const other = edge.source === id ? edge.target : edge.source;
        if (!memberGroup.has(other)) return;
        const label = memberGroup.get(other)!;
        if (label === ownLabel) return;
        scores.set(label, (scores.get(label) ?? 0) + edgeWeight(edge));
      });
      let targetLabel = "";
      let targetScore = -1;
      scores.forEach((score, label) => {
        if (score > targetScore + 1e-9 || (Math.abs(score - targetScore) < 1e-9 && label < targetLabel)) {
          targetLabel = label;
          targetScore = score;
        }
      });
      if (!targetLabel) return;
      groups.get(ownLabel)!.splice(0, 1);
      groups.get(targetLabel)!.push(id);
      memberGroup.set(id, targetLabel);
    });
  groups.forEach((members, label) => { if (!members.length) groups.delete(label); });
}

function groupLinkScores(
  groups: ReadonlyMap<string, readonly string[]>,
  edges: readonly CommunityEdge[]
) {
  const groupOf = new Map<string, string>();
  groups.forEach((members, label) => members.forEach((id) => groupOf.set(id, label)));
  const scores = new Map<string, Map<string, number>>();
  groups.forEach((_, label) => scores.set(label, new Map()));
  edges.forEach((edge) => {
    const source = groupOf.get(edge.source);
    const target = groupOf.get(edge.target);
    if (!source || !target || source === target) return;
    const weight = edgeWeight(edge);
    scores.get(source)!.set(target, (scores.get(source)!.get(target) ?? 0) + weight);
    scores.get(target)!.set(source, (scores.get(target)!.get(source) ?? 0) + weight);
  });
  return scores;
}

function strongestNeighbour(
  label: string,
  groups: ReadonlyMap<string, readonly string[]>,
  scores: ReadonlyMap<string, ReadonlyMap<string, number>>
) {
  let target = "";
  let best = -1;
  scores.get(label)?.forEach((score, candidate) => {
    if (!groups.has(candidate)) return;
    if (score > best + 1e-9 || (Math.abs(score - best) < 1e-9 && (target === "" || candidate < target))) {
      target = candidate;
      best = score;
    }
  });
  if (target) return target;
  // Disconnected groups still need a home: fold into the largest peer.
  return Array.from(groups.entries())
    .filter(([candidate]) => candidate !== label)
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))[0]?.[0] ?? "";
}

function mergeGroup(groups: Map<string, string[]>, from: string, to: string) {
  if (from === to) return;
  const source = groups.get(from);
  const target = groups.get(to);
  if (!source || !target) return;
  target.push(...source);
  groups.delete(from);
}

/**
 * Fold undersized groups into their strongest factual neighbour, then keep the
 * total map reading within a readable range. Tiny fixtures keep their exact
 * partition because a six-node minimum only makes sense on a real map.
 */
function mergeSmallGroups(
  groups: Map<string, string[]>,
  edges: readonly CommunityEdge[],
  nodeCount: number
) {
  if (nodeCount < MERGE_FROM_NODES) return;
  let guard = 0;
  while (groups.size > 1 && guard++ < 400) {
    const small = Array.from(groups.entries())
      .filter(([, members]) => members.length < MIN_TOPIC_SIZE)
      .sort((left, right) => left[1].length - right[1].length || left[0].localeCompare(right[0]))[0];
    if (!small) break;
    const scores = groupLinkScores(groups, edges);
    const target = strongestNeighbour(small[0], groups, scores);
    if (!target) break;
    mergeGroup(groups, small[0], target);
  }
  guard = 0;
  while (groups.size > MAX_TOPICS && guard++ < 400) {
    const smallest = Array.from(groups.entries())
      .sort((left, right) => left[1].length - right[1].length || left[0].localeCompare(right[0]))[0];
    if (!smallest) break;
    const scores = groupLinkScores(groups, edges);
    const target = strongestNeighbour(smallest[0], groups, scores);
    if (!target) break;
    mergeGroup(groups, smallest[0], target);
  }
}

function nameOfCommunity(members: readonly string[], edges: readonly CommunityEdge[], nodeById: ReadonlyMap<string, CommunityNode>) {
  const memberSet = new Set(members);
  const degree = internalDegree(memberSet, edges);
  const nameId = members
    .slice()
    .sort((left, right) => (degree.get(right) ?? 0) - (degree.get(left) ?? 0) || left.localeCompare(right))[0];
  return nodeById.get(nameId)?.title ?? nameId;
}

function capTotalCommunities(
  communities: AtlasCommunity[],
  edges: readonly CommunityEdge[],
  nodeById: ReadonlyMap<string, CommunityNode>
) {
  let guard = 0;
  while (communities.length > MAX_TOPICS && guard++ < 100) {
    const smallest = communities
      .slice()
      .sort((left, right) => left.size - right.size || left.id.localeCompare(right.id))[0];
    const candidates = communities.filter((community) => community.id !== smallest.id && community.domainId === smallest.domainId);
    if (!candidates.length) break;
    const memberSet = new Set(smallest.nodeIds);
    const scored = candidates.map((candidate) => {
      const candidateSet = new Set(candidate.nodeIds);
      let weight = 0;
      edges.forEach((edge) => {
        const sourceIn = memberSet.has(edge.source);
        const targetIn = memberSet.has(edge.target);
        if ((sourceIn && candidateSet.has(edge.target)) || (targetIn && candidateSet.has(edge.source))) weight += edgeWeight(edge);
      });
      return { candidate, weight };
    }).sort((left, right) => right.weight - left.weight || right.candidate.size - left.candidate.size || left.candidate.id.localeCompare(right.candidate.id));
    const target = scored[0]?.candidate;
    if (!target) break;
    const nodeIds = Array.from(new Set([...target.nodeIds, ...smallest.nodeIds])).sort();
    const merged: AtlasCommunity = {
      id: target.id,
      domainId: target.domainId,
      name: nameOfCommunity(nodeIds, edges, nodeById),
      nodeIds,
      size: nodeIds.length
    };
    communities.splice(communities.findIndex((community) => community.id === target.id), 1, merged);
    communities.splice(communities.findIndex((community) => community.id === smallest.id), 1);
  }
  communities.sort((left, right) => left.domainId.localeCompare(right.domainId) || right.size - left.size || left.id.localeCompare(right.id));
}

/**
 * Stable community partition. Input node and edge order never changes the
 * result; the output is sorted by Domain then group size/id.
 */
export function detectAtlasCommunities(
  nodes: readonly CommunityNode[],
  edges: readonly Pick<ArchiveEdge, "source" | "target" | "relation" | "strength">[]
): AtlasCommunity[] {
  const domainMembers = new Map<string, string[]>();
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  nodes
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((node) => {
      const domainId = node.domainId ?? UNCLASSIFIED;
      domainMembers.set(domainId, [...(domainMembers.get(domainId) ?? []), node.id]);
    });

  const communities: AtlasCommunity[] = [];
  Array.from(domainMembers.keys()).sort().forEach((domainId) => {
    const nodeIds = domainMembers.get(domainId)!.slice().sort();
    const memberSet = new Set(nodeIds);
    const internal = edges.filter((edge) => memberSet.has(edge.source) && memberSet.has(edge.target));
    const labels = detectLabelPropagation(nodeIds, internal);
    const groups = new Map<string, string[]>();
    nodeIds.forEach((id) => {
      const label = labels.get(id)!;
      groups.set(label, [...(groups.get(label) ?? []), id]);
    });
    mergeSingletons(groups, nodeIds, internal);
    mergeSmallGroups(groups, internal, nodeIds.length);
    groups.forEach((members, label) => {
      if (!members.length) return;
      const sortedMembers = members.slice().sort();
      communities.push({
        id: `${domainId}:${label}`,
        domainId,
        name: nameOfCommunity(sortedMembers, edges, nodeById),
        nodeIds: sortedMembers,
        size: sortedMembers.length
      });
    });
  });

  capTotalCommunities(communities, edges, nodeById);
  return communities;
}

export function communityByNodeId(communities: readonly AtlasCommunity[]) {
  const map = new Map<string, AtlasCommunity>();
  communities.forEach((community) => community.nodeIds.forEach((id) => map.set(id, community)));
  return map;
}
