/** Runtime projection only. Callers supply visible active identities and factual prerequisites. */
export type RoutePrerequisite = { id: string; source: string; target: string };
export type CourseKnowledgeOrder = { nodeId: string; lessonOrder: number; coverageOrder: number };
export type PersonalCourseRouteInput = {
  nodeIds: readonly string[];
  prerequisiteEdges: readonly RoutePrerequisite[];
  currentNodeIds: readonly string[];
  courseOrder: readonly CourseKnowledgeOrder[];
};
export type PersonalCourseRoute = {
  orderedNodeIds: string[];
  prerequisiteEdges: RoutePrerequisite[];
  courseKnowledgeIds: string[];
  currentKnowledgeIds: string[];
  bridgeKnowledgeIds: string[];
  connectedCourseKnowledgeIds: string[];
  disconnectedCourseKnowledgeIds: string[];
};
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const compareOrder = (a: CourseKnowledgeOrder, b: CourseKnowledgeOrder) =>
  a.lessonOrder - b.lessonOrder || a.coverageOrder - b.coverageOrder || compareId(a.nodeId, b.nodeId);

export class PrerequisiteCycleError extends Error {
  constructor() { super('Knowledge prerequisite graph contains a cycle'); this.name = 'PrerequisiteCycleError'; }
}

/** Forward(C) ∩ Backward(T), followed by deterministic Kahn ordering; never enumerates paths. */
export function buildPersonalCourseRoute(input: PersonalCourseRouteInput): PersonalCourseRoute {
  const ids = new Set(input.nodeIds);
  const edges = input.prerequisiteEdges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const id of ids) { outgoing.set(id, new Set()); incoming.set(id, new Set()); }
  for (const edge of edges) { outgoing.get(edge.source)!.add(edge.target); incoming.get(edge.target)!.add(edge.source); }
  const topological = (members: Set<string>, compare: (a: string, b: string) => number) => {
    const degree = new Map([...members].map(id => [id, [...incoming.get(id)!].filter(source => members.has(source)).length]));
    const ready = [...members].filter(id => degree.get(id) === 0).sort(compare);
    const ordered: string[] = [];
    while (ready.length) {
      const id = ready.shift()!;
      ordered.push(id);
      for (const target of outgoing.get(id)!) {
        if (!members.has(target)) continue;
        degree.set(target, degree.get(target)! - 1);
        if (degree.get(target) === 0) { ready.push(target); ready.sort(compare); }
      }
    }
    if (ordered.length !== members.size) throw new PrerequisiteCycleError();
    return ordered;
  };
  // Validate the supplied active graph, including cycles outside the eventual projection.
  const graphOrder = topological(ids, compareId);
  const course = new Map<string, CourseKnowledgeOrder>();
  for (const order of [...input.courseOrder].sort(compareOrder)) {
    if (ids.has(order.nodeId) && !course.has(order.nodeId)) course.set(order.nodeId, order);
  }
  const reach = (seeds: Iterable<string>, adjacency: Map<string, Set<string>>) => {
    const visited = new Set([...seeds].filter(id => ids.has(id)));
    const queue = [...visited];
    for (let i = 0; i < queue.length; i++) for (const next of adjacency.get(queue[i])!) {
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
    return visited;
  };
  const forward = reach(input.currentNodeIds, outgoing);
  const backward = reach(course.keys(), incoming);
  const members = new Set([...course.keys(), ...[...forward].filter(id => backward.has(id))]);
  const anchor = new Map(course);
  for (const id of [...graphOrder].reverse()) {
    for (const target of outgoing.get(id)!) {
      const candidate = anchor.get(target);
      const existing = anchor.get(id);
      if (candidate && (!existing || compareOrder(candidate, existing) < 0)) anchor.set(id, candidate);
    }
  }
  const orderedNodeIds = topological(members, (a, b) => {
    const left = course.get(a) ?? anchor.get(a)!;
    const right = course.get(b) ?? anchor.get(b)!;
    return left.lessonOrder - right.lessonOrder || left.coverageOrder - right.coverageOrder || compareId(a, b);
  });
  const current = new Set(input.currentNodeIds);
  const courseKnowledgeIds = [...course.keys()].sort(compareId);
  return {
    orderedNodeIds,
    prerequisiteEdges: edges.filter(edge => members.has(edge.source) && members.has(edge.target)).map(edge => ({ ...edge })).sort((a, b) => compareId(a.id, b.id)),
    courseKnowledgeIds,
    currentKnowledgeIds: orderedNodeIds.filter(id => current.has(id)),
    bridgeKnowledgeIds: orderedNodeIds.filter(id => !course.has(id)),
    connectedCourseKnowledgeIds: courseKnowledgeIds.filter(id => forward.has(id)),
    disconnectedCourseKnowledgeIds: courseKnowledgeIds.filter(id => !forward.has(id)),
  };
}
