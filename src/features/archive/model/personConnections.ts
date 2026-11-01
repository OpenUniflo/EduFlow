/**
 * Person-centred Archive connections, derived only from factual KnowledgeEdges.
 *
 * The person's own Knowledge forms a core. Direct edges are the factual edges
 * whose two endpoints both belong to that core. A bridge node is any other node
 * that a factual one-hop edge connects to at least two distinct core Knowledge
 * nodes — it is shown hollow and never moves. Nothing here creates a node or an
 * edge: every result references an input fact.
 */

export type PersonConnectionPerson = {
  /** CSS token suffix: "me" or the person accent colour key. */
  colorKey: string;
  nodeIds: ReadonlySet<string>;
};

export type PersonConnectionEdge = {
  id: string;
  source: string;
  target: string;
};

export type PersonDirectEdge = PersonConnectionEdge & {
  /** `null` means shared / cross-person: use the neutral highlight colour. */
  colorKey: string | null;
};

export type PersonConnectionPlan = {
  /** Union of the selected people's Knowledge, sorted by input node order. */
  coreNodeIds: string[];
  directEdges: PersonDirectEdge[];
  bridgeNodeIds: string[];
  bridgeEdges: PersonConnectionEdge[];
};

/**
 * `nodeIds` is the graph's stable order. Results keep it so callers can build
 * deterministic geometries and tests.
 */
export function personConnections(input: {
  people: readonly PersonConnectionPerson[];
  edges: readonly PersonConnectionEdge[];
  nodeIds?: readonly string[];
}): PersonConnectionPlan {
  const owners = new Map<string, string[]>();
  input.people.forEach((person) => {
    person.nodeIds.forEach((id) => {
      const list = owners.get(id) ?? [];
      if (!list.includes(person.colorKey)) list.push(person.colorKey);
      owners.set(id, list);
    });
  });
  const order = input.nodeIds?.length ? [...input.nodeIds] : [...owners.keys()];
  const coreNodeIds = order.filter((id) => owners.has(id));
  const core = new Set(coreNodeIds);
  const edges = input.edges.filter((edge) => edge.source !== edge.target);
  const directEdges: PersonDirectEdge[] = [];
  const bridgeEdges: PersonConnectionEdge[] = [];
  const coreNeighbours = new Map<string, Set<string>>();
  edges.forEach((edge) => {
    const sourceCore = core.has(edge.source);
    const targetCore = core.has(edge.target);
    if (sourceCore && targetCore) {
      const sourceOwners = owners.get(edge.source) ?? [];
      const targetOwners = owners.get(edge.target) ?? [];
      // A person's colour requires both endpoints to be exclusively theirs.
      // Any shared endpoint makes the relationship shared, hence neutral.
      const exclusive = sourceOwners.length === 1 && targetOwners.length === 1
        && sourceOwners[0] === targetOwners[0];
      directEdges.push({ ...edge, colorKey: exclusive ? sourceOwners[0] : null });
      return;
    }
    if (sourceCore === targetCore) return;
    const bridge = sourceCore ? edge.target : edge.source;
    const coreNode = sourceCore ? edge.source : edge.target;
    const neighbours = coreNeighbours.get(bridge) ?? new Set<string>();
    neighbours.add(coreNode);
    coreNeighbours.set(bridge, neighbours);
    bridgeEdges.push({ ...edge });
  });
  const bridgeSet = new Set<string>();
  coreNeighbours.forEach((neighbours, id) => {
    if (!core.has(id) && neighbours.size >= 2) bridgeSet.add(id);
  });
  const bridgeNodeIds = order.filter((id) => bridgeSet.has(id));
  const litBridgeEdges = bridgeEdges.filter((edge) => bridgeSet.has(edge.source) || bridgeSet.has(edge.target));
  return {
    coreNodeIds,
    directEdges,
    bridgeNodeIds,
    bridgeEdges: litBridgeEdges
  };
}

export type PersonEdgeStyle = "selection" | "direct" | "bridge" | "dim";

/**
 * Resolve the weight a person-network edge is actually drawn with.
 *
 * An explicit selection always outranks the person network: the selection's
 * one-hop edges take the selection style, and the person's direct / bridge
 * edges stop keeping their own weight — they fall back to the same dim
 * background as every unrelated edge. Without a selection the person network
 * owns its own two weights again.
 */
export function personEdgeStyles(input: {
  selectedId?: string | null;
  /** Edges the selection rule highlights (the selected node's one-hop edges). */
  selectionEdgeIds?: ReadonlySet<string>;
  edges: readonly PersonConnectionEdge[];
  directEdges: readonly PersonConnectionEdge[];
  bridgeEdges: readonly PersonConnectionEdge[];
}): Array<{ id: string; style: PersonEdgeStyle }> {
  const direct = new Set(input.directEdges.map((edge) => edge.id));
  const bridge = new Set(input.bridgeEdges.map((edge) => edge.id));
  const selecting = Boolean(input.selectedId);
  return input.edges.map((edge) => {
    if (selecting) {
      return {
        id: edge.id,
        style: input.selectionEdgeIds?.has(edge.id) ? "selection" : "dim"
      };
    }
    if (direct.has(edge.id)) return { id: edge.id, style: "direct" };
    if (bridge.has(edge.id)) return { id: edge.id, style: "bridge" };
    return { id: edge.id, style: "dim" };
  });
}
