/** Pure V2 planning. Adapters supply authenticated visible identities and facts. */
export type RoutePrerequisite = { id: string; source: string; target: string; strength: 'hard' | 'soft' };
export type CapabilityEnable = { id: string; source: string; target: string; relation: 'enables'; strength: number };
export type CapabilityRelation = (RoutePrerequisite & { relation: 'prerequisite' }) | CapabilityEnable;
export type CourseKnowledgeOrder = { nodeId: string; lessonOrder: number; coverageOrder: number };
export type RoutePlanningInput = {
  nodeIds: readonly string[];
  prerequisiteEdges: readonly RoutePrerequisite[];
  enablesEdges?: readonly CapabilityEnable[];
  currentNodeIds: readonly string[];
  courseOrder: readonly CourseKnowledgeOrder[];
};
export type RouteConstraints = { includeNodeIds: readonly string[]; excludeNodeIds: readonly string[] };
export type CapabilityModel = {
  orderedNodeIds: string[]; prerequisiteEdges: RoutePrerequisite[]; supportEdges: CapabilityRelation[];
  courseKnowledgeIds: string[]; currentKnowledgeIds: string[]; bridgeKnowledgeIds: string[];
  actionableNodeIds: string[]; connectedCourseKnowledgeIds: string[]; disconnectedCourseKnowledgeIds: string[];
};
export type SelectedRoute = {
  selectedNodeIds: string[]; orderedNodeIds: string[]; prerequisiteEdges: RoutePrerequisite[];
  effectiveTargetNodeIds: string[]; currentKnowledgeIds: string[]; bridgeKnowledgeIds: string[];
};
export type RouteConflict = {
  kind: 'include_exclude' | 'include_outside_model' | 'excluded_hard_prerequisite' | 'unavailable_hard_prerequisite' | 'prerequisite_cycle';
  rootNodeId?: string; rootKind?: 'target' | 'include'; nodeId?: string;
  constraint: 'include' | 'exclude' | 'knowledge_graph';
};
export type RoutePlan = { valid: true; route: SelectedRoute; conflicts: [] } | { valid: false; route: null; conflicts: RouteConflict[] };
export class PrerequisiteCycleError extends Error {
  constructor() { super('Knowledge prerequisite graph contains a cycle'); this.name = 'PrerequisiteCycleError'; }
}
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const unique = (ids: Iterable<string>) => [...new Set(ids)].sort(compareId);
const compareOrder = (a: CourseKnowledgeOrder, b: CourseKnowledgeOrder) => a.lessonOrder - b.lessonOrder || a.coverageOrder - b.coverageOrder || compareId(a.nodeId, b.nodeId);

/** Binary ready queue keeps deterministic Kahn ordering O((V+E) log V). */
function topological(ids: Set<string>, edges: readonly RoutePrerequisite[], compare: (a: string, b: string) => number = compareId) {
  const next = new Map([...ids].map(id => [id, [] as string[]]));
  const degree = new Map([...ids].map(id => [id, 0]));
  for (const edge of edges) if (ids.has(edge.source) && ids.has(edge.target)) {
    next.get(edge.source)!.push(edge.target); degree.set(edge.target, degree.get(edge.target)! + 1);
  }
  const heap: string[] = [];
  const push = (id: string) => {
    heap.push(id); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (compare(heap[p], heap[i]) <= 0) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const first = heap[0]; const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last; let i = 0;
      while (true) {
        let child = i * 2 + 1; if (child >= heap.length) break;
        if (child + 1 < heap.length && compare(heap[child + 1], heap[child]) < 0) child++;
        if (compare(heap[i], heap[child]) <= 0) break;
        [heap[i], heap[child]] = [heap[child], heap[i]]; i = child;
      }
    }
    return first;
  };
  for (const id of ids) if (!degree.get(id)) push(id);
  const ordered: string[] = [];
  while (heap.length) {
    const id = pop(); ordered.push(id);
    for (const target of next.get(id)!) { degree.set(target, degree.get(target)! - 1); if (!degree.get(target)) push(target); }
  }
  if (ordered.length !== ids.size) throw new PrerequisiteCycleError();
  return ordered;
}

function prepare(input: RoutePlanningInput) {
  const ids = new Set(input.nodeIds);
  // Preserve hard facts whose source is unavailable; they must not turn into roots.
  const edges = input.prerequisiteEdges.filter(edge => ids.has(edge.target)).map(edge => ({ ...edge })).sort((a, b) => compareId(a.id, b.id));
  const incoming = new Map([...ids].map(id => [id, [] as RoutePrerequisite[]]));
  const outgoing = new Map([...ids].map(id => [id, [] as RoutePrerequisite[]]));
  for (const edge of edges) { incoming.get(edge.target)!.push(edge); outgoing.get(edge.source)?.push(edge); }
  const order = topological(ids, edges);
  const course = new Map<string, CourseKnowledgeOrder>();
  for (const row of [...input.courseOrder].sort(compareOrder)) if (ids.has(row.nodeId) && !course.has(row.nodeId)) course.set(row.nodeId, { ...row });
  const current = new Set(input.currentNodeIds.filter(id => ids.has(id)));
  const anchor = new Map(course);
  for (const id of [...order].reverse()) for (const edge of outgoing.get(id)!) {
    const candidate = anchor.get(edge.target); const existing = anchor.get(id);
    if (candidate && (!existing || compareOrder(candidate, existing) < 0)) anchor.set(id, candidate);
  }
  const compare = (a: string, b: string) => {
    const left = anchor.get(a), right = anchor.get(b);
    return (left?.lessonOrder ?? Infinity) - (right?.lessonOrder ?? Infinity)
      || (left?.coverageOrder ?? Infinity) - (right?.coverageOrder ?? Infinity) || compareId(a, b);
  };
  const actionable = new Set<string>();
  for (const id of order) {
    const hard = incoming.get(id)!.filter(edge => edge.strength === 'hard');
    if (current.has(id) || hard.every(edge => current.has(edge.source))) actionable.add(id);
  }
  return { ids, edges, incoming, order, course, current, compare, actionable };
}

function capability(data: ReturnType<typeof prepare>, enables: readonly CapabilityEnable[] = []): CapabilityModel {
  const { course, edges, current, actionable, compare, ids } = data;
  const supportEdges: CapabilityRelation[] = [
    ...edges.map(edge => ({ ...edge, relation: 'prerequisite' as const })),
    ...enables.filter(edge => ids.has(edge.target)).map(edge => ({ ...edge })),
  ].sort((a, b) => compareId(a.id, b.id));
  const incoming = new Map([...ids].map(id => [id, [] as CapabilityRelation[]]));
  const outgoing = new Map([...ids].map(id => [id, [] as CapabilityRelation[]]));
  const hardRemaining = new Map([...ids].map(id => [id, 0]));
  for (const edge of supportEdges) {
    incoming.get(edge.target)!.push(edge); outgoing.get(edge.source)?.push(edge);
    if (edge.relation === 'prerequisite' && edge.strength === 'hard') hardRemaining.set(edge.target, hardRemaining.get(edge.target)! + 1);
  }
  // Least fixed point over actual acquired boundaries. Enables cycles are valid;
  // they cannot bootstrap themselves or bypass even one unsupported hard parent.
  const supported = new Set(current); const frontier = [...current];
  for (let i = 0; i < frontier.length; i++) for (const edge of outgoing.get(frontier[i])!) {
    if (edge.relation === 'prerequisite' && edge.strength === 'hard') hardRemaining.set(edge.target, hardRemaining.get(edge.target)! - 1);
    if (!supported.has(edge.target) && hardRemaining.get(edge.target) === 0) {
      supported.add(edge.target); frontier.push(edge.target);
    }
  }
  const members = new Set(course.keys());
  const visited = new Set([...course.keys()].filter(id => !current.has(id) && supported.has(id)));
  const queue = [...visited];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (current.has(id)) continue; // Do not unfold history before today's boundary.
    for (const edge of incoming.get(id)!) if (supported.has(edge.source) && !visited.has(edge.source)) {
      members.add(edge.source); visited.add(edge.source); queue.push(edge.source);
    }
  }
  // Keep real facts between admitted members; acquired color is not an edge filter.
  // Even unanchored targets retain their real target-to-target relations.
  const gapEdges = edges.filter(edge => members.has(edge.source) && members.has(edge.target));
  const retainedSupport = supportEdges.filter(edge => members.has(edge.source) && members.has(edge.target));
  const orderedNodeIds = topological(members, gapEdges, compare);
  const courseKnowledgeIds = unique(course.keys());
  return {
    orderedNodeIds, prerequisiteEdges: gapEdges, supportEdges: retainedSupport,
    courseKnowledgeIds, currentKnowledgeIds: orderedNodeIds.filter(id => current.has(id)),
    bridgeKnowledgeIds: orderedNodeIds.filter(id => !course.has(id)),
    actionableNodeIds: unique([...actionable].filter(id => members.has(id))),
    connectedCourseKnowledgeIds: courseKnowledgeIds.filter(id => supported.has(id)),
    disconnectedCourseKnowledgeIds: courseKnowledgeIds.filter(id => !supported.has(id)),
  };
}
export function buildCapabilityModel(input: RoutePlanningInput): CapabilityModel { return capability(prepare(input), input.enablesEdges); }

/** Union hard closure, with acquired boundaries; selected soft edges explain order only. */
export function planCourseRoute(input: RoutePlanningInput, constraints: RouteConstraints = { includeNodeIds: [], excludeNodeIds: [] }): RoutePlan {
  let data: ReturnType<typeof prepare>;
  try { data = prepare(input); } catch (error) {
    if (error instanceof PrerequisiteCycleError) return { valid: false, route: null, conflicts: [{ kind: 'prerequisite_cycle', constraint: 'knowledge_graph' }] };
    throw error;
  }
  const model = capability(data, input.enablesEdges);
  const candidates = new Set(model.orderedNodeIds);
  const includes = unique(constraints.includeNodeIds); const excludes = new Set(constraints.excludeNodeIds);
  const conflicts: RouteConflict[] = [];
  for (const id of includes) {
    if (excludes.has(id)) conflicts.push({ kind: 'include_exclude', rootNodeId: id, rootKind: 'include', nodeId: id, constraint: 'exclude' });
    if (!candidates.has(id)) conflicts.push({ kind: 'include_outside_model', rootNodeId: id, rootKind: 'include', nodeId: id, constraint: 'include' });
  }
  const effectiveTargetNodeIds = model.courseKnowledgeIds.filter(id => !excludes.has(id));
  const roots = [...effectiveTargetNodeIds.map(id => ({ id, kind: 'target' as const })), ...includes.filter(id => candidates.has(id) && !excludes.has(id)).map(id => ({ id, kind: 'include' as const }))];
  // Memoized first hard failure per node explains every root without traversing paths per target.
  const failure = new Map<string, { kind: 'excluded_hard_prerequisite' | 'unavailable_hard_prerequisite'; nodeId: string }>();
  for (const id of data.order) {
    if (excludes.has(id)) { failure.set(id, { kind: 'excluded_hard_prerequisite', nodeId: id }); continue; }
    if (data.current.has(id)) continue;
    for (const edge of data.incoming.get(id)!) if (edge.strength === 'hard') {
      const reason = !data.ids.has(edge.source) ? { kind: 'unavailable_hard_prerequisite' as const, nodeId: edge.source } : failure.get(edge.source);
      if (reason) { failure.set(id, reason); break; }
    }
  }
  for (const root of roots) {
    const reason = failure.get(root.id);
    if (reason) conflicts.push({ ...reason, rootNodeId: root.id, rootKind: root.kind, constraint: reason.kind === 'excluded_hard_prerequisite' ? 'exclude' : 'knowledge_graph' });
  }
  if (conflicts.length) return { valid: false, route: null, conflicts };
  const members = new Set(roots.map(root => root.id)); const queue = [...members];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]; if (data.current.has(id)) continue;
    for (const edge of data.incoming.get(id)!) if (edge.strength === 'hard' && !members.has(edge.source)) { members.add(edge.source); queue.push(edge.source); }
  }
  const orderedNodeIds = topological(members, data.edges, data.compare);
  return { valid: true, conflicts: [], route: {
    orderedNodeIds, selectedNodeIds: unique(members), effectiveTargetNodeIds,
    prerequisiteEdges: data.edges.filter(edge => members.has(edge.source) && members.has(edge.target)),
    currentKnowledgeIds: orderedNodeIds.filter(id => data.current.has(id)),
    bridgeKnowledgeIds: orderedNodeIds.filter(id => !data.course.has(id)),
  } };
}

/** Canonical structure only. No acquired-state-dependent projection is hashed. */
export function routeStructure(input: RoutePlanningInput, constraints: RouteConstraints) {
  const incoming = new Map<string, (RoutePrerequisite | CapabilityEnable)[]>();
  for (const edge of [...input.prerequisiteEdges, ...(input.enablesEdges ?? [])]) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push(edge);
  }
  const members = new Set([...input.courseOrder.map(row => row.nodeId), ...constraints.includeNodeIds, ...constraints.excludeNodeIds]);
  const queue = [...members];
  for (let i = 0; i < queue.length; i++) for (const edge of incoming.get(queue[i]) ?? []) if (!members.has(edge.source)) { members.add(edge.source); queue.push(edge.source); }
  return {
    nodeIds: unique(input.nodeIds.filter(id => members.has(id))),
    prerequisiteEdges: input.prerequisiteEdges.filter(edge => members.has(edge.target)).map(edge => ({ ...edge })).sort((a, b) => compareId(a.id, b.id)),
    ...(input.enablesEdges?.length ? { enablesEdges: input.enablesEdges.filter(edge => members.has(edge.target)).map(edge => ({ ...edge })).sort((a, b) => compareId(a.id, b.id)) } : {}),
    courseOrder: [...input.courseOrder].map(row => ({ ...row })).sort(compareOrder),
  };
}

/** Existing deterministic Kahn ordering, also used by factual route presentation. */
export { topological as orderRouteNodes };
