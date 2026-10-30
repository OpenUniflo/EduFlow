import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserCourseState } from "@/features/course/types";
import type { DomainGovernanceState } from "@/features/knowledge/domain/DomainGovernanceRepository";
import { UNCLASSIFIED_DOMAIN_COLOR } from "@/features/knowledge/domain/domainColors";
import { resolveNodeDomain } from "@/features/knowledge/domain/domainResolution";
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from "@/features/knowledge/types";
import type { AtlasCourseContext } from "@/features/knowledge/projections/atlasProjections";
import type { UserKnowledgeRecord, UserKnowledgeStatus } from "@/features/profile/types";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";

export type ArchiveNode = {
  id: string;
  title: string;
  description: string;
  scope: KnowledgeNode["scope"];
  color: string;
  /** Index into the six token domain colours; null means neutral/unclassified. */
  domainColorIndex: number | null;
  domainTitle: string;
  domainId?: string;
  visualImportance: number;
  status: UserKnowledgeStatus | "explore";
  isMine: boolean;
  /** The single in-progress knowledge highlighted with the brand ring. */
  isCurrent: boolean;
  updatedAt?: string;
  courseContexts: AtlasCourseContext[];
};

export type ArchiveEdge = Pick<KnowledgeEdge, "id" | "source" | "target" | "relation" | "strength">;

export type ArchiveCourseState = "active" | "draft" | "recommended" | "published";

export type ArchiveCourse = {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  state: ArchiveCourseState;
  progress: number;
  chapterCount: number;
  lessonCount: number;
  knowledgeCount: number;
  assignmentCount: number;
  coveredKnowledgeIds: string[];
  nextLabel: string;
  accentColor?: string;
  updatedAt?: string;
};

export type ArchiveStats = {
  totalNodes: number;
  totalEdges: number;
  mine: number;
  learned: number;
  learning: number;
  practicing: number;
  mastered: number;
  weekDays: number;
};

export type ArchiveModel = {
  nodes: ArchiveNode[];
  edges: ArchiveEdge[];
  nodeById: Map<string, ArchiveNode>;
  mineNodeIds: Set<string>;
  courses: ArchiveCourse[];
  stats: ArchiveStats;
  hasLearningHistory: boolean;
};

export type ArchiveModelInput = {
  graph: KnowledgeGraph;
  governance: DomainGovernanceState;
  runtimes: CourseRuntimeData[];
  records: readonly UserKnowledgeRecord[];
  courseStates?: ReadonlyMap<string, UserCourseState>;
};

export function archiveImportanceByNodeId(nodeIds: Iterable<string>, edges: ArchiveEdge[]) {
  const scores = new Map(Array.from(nodeIds, (id) => [id, 0]));
  edges.forEach((edge) => {
    const weight = edge.relation === "related" ? 0.45 : edge.relation === "enables" ? 0.8 : edge.strength === "hard" ? 1 : 0.75;
    scores.set(edge.source, (scores.get(edge.source) ?? 0) + weight);
    scores.set(edge.target, (scores.get(edge.target) ?? 0) + weight);
  });
  const values = [...scores.values()];
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  return new Map([...scores].map(([id, value]) => [id, max === min ? 0.5 : (value - min) / (max - min)]));
}

function courseContextsByNode(runtimes: CourseRuntimeData[]) {
  const contexts = new Map<string, AtlasCourseContext[]>();
  runtimes.forEach((runtime) => {
    const rolesByNode = new Map<string, AtlasCourseContext["coverageRoles"]>();
    runtime.curriculumCoverages.forEach((coverage) => rolesByNode.set(coverage.nodeId, [...(rolesByNode.get(coverage.nodeId) ?? []), coverage.role]));
    rolesByNode.forEach((roles, nodeId) => contexts.set(nodeId, [...(contexts.get(nodeId) ?? []), {
      courseId: runtime.course.id,
      courseTitle: runtime.course.title,
      coverageRoles: Array.from(new Set(roles))
    }]));
  });
  return contexts;
}

function orderedCourseKnowledge(runtime: CourseRuntimeData) {
  const lessonOrder = new Map(runtime.lessons.map((lesson) => [lesson.id, lesson.order]));
  return [...runtime.curriculumCoverages]
    .sort((left, right) => (lessonOrder.get(left.lessonId) ?? 0) - (lessonOrder.get(right.lessonId) ?? 0) || left.order - right.order || left.nodeId.localeCompare(right.nodeId))
    .map((coverage) => coverage.nodeId);
}

function acceptedAssignmentCount(state: UserCourseState | undefined) {
  if (!state) return 0;
  return Object.values(state.assignmentStates).filter((assignment) => assignment.status === "accepted" || assignment.status === "completed").length;
}

function courseProgress(runtime: CourseRuntimeData, state: UserCourseState | undefined, recordsById: ReadonlyMap<string, UserKnowledgeRecord>, coveredKnowledgeIds: readonly string[]) {
  const knowledgeLearned = coveredKnowledgeIds.filter((id) => {
    const status = recordsById.get(id)?.status;
    return status === "learned" || status === "mastered" || status === "practicing";
  }).length;
  const knowledgeProgress = coveredKnowledgeIds.length ? Math.round(knowledgeLearned / coveredKnowledgeIds.length * 100) : 0;
  if (!runtime.assignments.length) return knowledgeProgress;
  const assignmentProgress = Math.round(acceptedAssignmentCount(state) / runtime.assignments.length * 100);
  return Math.max(assignmentProgress, knowledgeProgress);
}

function nextCourseLabel(runtime: CourseRuntimeData, recordsById: ReadonlyMap<string, UserKnowledgeRecord>, nodeTitleById: ReadonlyMap<string, string>) {
  const ordered = orderedCourseKnowledge(runtime);
  const nextId = ordered.find((id) => {
    const status = recordsById.get(id)?.status;
    return status !== "learned" && status !== "mastered";
  });
  if (!nextId) return "已完成全部知识";
  return `下一步「${nodeTitleById.get(nextId) ?? nextId}」· ${runtime.chapters.length} 章`;
}

function buildCourses(runtimes: CourseRuntimeData[], recordsById: ReadonlyMap<string, UserKnowledgeRecord>, states: ReadonlyMap<string, UserCourseState>, nodeTitleById: ReadonlyMap<string, string>): ArchiveCourse[] {
  const courses = runtimes.flatMap((runtime) => {
    const lifecycle = runtime.course.lifecycle ?? "draft";
    if (lifecycle === "archived" && !states.get(runtime.course.id)?.isActive) return [];
    const state = states.get(runtime.course.id);
    const coveredKnowledgeIds = Array.from(new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId)));
    const draft = runtime.course.courseType === "personal" && lifecycle === "draft";
    const active = !draft && Boolean(state?.isActive);
    const recommended = lifecycle === "published" && !active && !draft;
    const archiveState: ArchiveCourseState = draft ? "draft" : active ? "active" : recommended ? "recommended" : "published";
    return [{
      id: runtime.course.id,
      title: runtime.course.title,
      subtitle: runtime.course.subtitle,
      description: runtime.course.description,
      state: archiveState,
      progress: courseProgress(runtime, state, recordsById, coveredKnowledgeIds),
      chapterCount: runtime.chapters.length,
      lessonCount: runtime.lessons.length,
      knowledgeCount: coveredKnowledgeIds.length,
      assignmentCount: runtime.assignments.length,
      coveredKnowledgeIds,
      nextLabel: nextCourseLabel(runtime, recordsById, nodeTitleById),
      accentColor: runtime.course.accentColor,
      updatedAt: runtime.course.updatedAt
    } satisfies ArchiveCourse];
  });
  return courses.sort((left, right) => {
    const rank: Record<ArchiveCourseState, number> = { active: 0, draft: 1, recommended: 2, published: 3 };
    return rank[left.state] - rank[right.state] || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.title.localeCompare(right.title);
  });
}

function weekDays(records: readonly UserKnowledgeRecord[], now = Date.now()) {
  const dayMs = 86_400_000;
  const days = new Set<number>();
  records.forEach((record) => {
    if (!record.updatedAt) return;
    const time = new Date(record.updatedAt).getTime();
    if (!Number.isFinite(time) || time > now || now - time > 7 * dayMs) return;
    days.add(Math.floor((now - time) / dayMs));
  });
  return days.size;
}

/**
 * One Archive projection over every active visible KnowledgeNode and factual
 * KnowledgeEdge. The learner's own subset is an overlay flag, never a second
 * node or edge set. No node or edge is created for presentation.
 */
export function buildArchiveModel(input: ArchiveModelInput): ArchiveModel {
  const activeNodes = input.graph.nodes.filter((node) => node.status === "active");
  const activeIds = new Set(activeNodes.map((node) => node.id));
  const edges: ArchiveEdge[] = input.graph.edges
    .filter((edge) => activeIds.has(edge.source) && activeIds.has(edge.target))
    .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, relation: edge.relation, strength: edge.strength }));
  const importance = archiveImportanceByNodeId(activeIds, edges);
  const contexts = courseContextsByNode(input.runtimes);
  const recordsById = new Map(input.records.filter((record) => activeIds.has(record.nodeId)).map((record) => [record.nodeId, record]));
  // The Archive palette is the six design-token domain colours. Domains keep a
  // deterministic slot (creation order then id) so the same domain is always
  // the same colour, independent of the current learner or camera.
  const orderedDomains = input.governance.domains
    .filter((domain) => domain.status === "active")
    .slice()
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const domainSlot = new Map(orderedDomains.map((domain, index) => [domain.id, index % 6]));
  const currentId = [...recordsById.values()]
    .filter((record) => record.status === "learning" || record.status === "practicing")
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.nodeId.localeCompare(right.nodeId))[0]?.nodeId;
  const nodes: ArchiveNode[] = activeNodes
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node) => {
      const { domain } = resolveNodeDomain(node.id, input.governance);
      const record = recordsById.get(node.id);
      const slot = domain ? domainSlot.get(domain.id) ?? null : null;
      return {
        id: node.id,
        title: node.title,
        description: node.description,
        scope: node.scope,
        color: slot === null ? UNCLASSIFIED_DOMAIN_COLOR : `var(--domain-${slot + 1})`,
        domainColorIndex: slot,
        domainTitle: domain?.name ?? "未分类",
        domainId: domain?.id,
        visualImportance: importance.get(node.id) ?? 0,
        status: record?.status ?? "explore",
        isMine: Boolean(record),
        isCurrent: Boolean(currentId && currentId === node.id && record),
        updatedAt: record?.updatedAt,
        courseContexts: contexts.get(node.id) ?? []
      };
    });
  const courses = buildCourses(input.runtimes, recordsById, input.courseStates ?? new Map(), new Map(input.graph.nodes.map((node) => [node.id, node.title])));
  const counts = { learned: 0, learning: 0, practicing: 0, mastered: 0 };
  nodes.filter((node) => node.isMine).forEach((node) => {
    if (node.status === "learned") counts.learned += 1;
    else if (node.status === "learning") counts.learning += 1;
    else if (node.status === "practicing") counts.practicing += 1;
    else if (node.status === "mastered") counts.mastered += 1;
  });
  return {
    nodes,
    edges,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    mineNodeIds: new Set(recordsById.keys()),
    courses,
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      mine: recordsById.size,
      ...counts,
      weekDays: weekDays([...recordsById.values()])
    },
    hasLearningHistory: recordsById.size > 0
  };
}

export type ArchiveSearchGroup<T> = { items: T[]; total: number };

export type ArchiveKnowledgeHit = { node: ArchiveNode; hitIndex: number };
export type ArchiveCourseHit = { course: ArchiveCourse; matchedKnowledgeIds: string[] };
export type ArchivePersonHit = { person: FollowedPerson };

export type ArchiveSearchResults = {
  query: string;
  knowledge: ArchiveSearchGroup<ArchiveKnowledgeHit>;
  courses: ArchiveSearchGroup<ArchiveCourseHit>;
  people: ArchiveSearchGroup<ArchivePersonHit>;
  mapHitIds: string[];
  empty: boolean;
};

function matches(value: string | undefined, needle: string) {
  return Boolean(value && value.toLowerCase().includes(needle));
}

export function searchArchive(model: ArchiveModel, rawQuery: string, people: readonly FollowedPerson[] = []): ArchiveSearchResults | null {
  const query = rawQuery.trim();
  if (!query) return null;
  const needle = query.toLowerCase();
  const knowledgeMatches = model.nodes
    .map((node) => {
      const titleRank = matches(node.title, needle) ? 0 : matches(node.domainTitle, needle) ? 1 : matches(node.description, needle) ? 2 : -1;
      return { node, titleRank };
    })
    .filter((item) => item.titleRank >= 0)
    .sort((left, right) => left.titleRank - right.titleRank || right.node.visualImportance - left.node.visualImportance || left.node.id.localeCompare(right.node.id))
    .map(({ node }) => node);
  const knowledgeItems = knowledgeMatches.slice(0, 6).map((node, index) => ({ node, hitIndex: index }));
  const courseMatches = model.courses
    .map((course) => ({
      course,
      matchedKnowledgeIds: course.coveredKnowledgeIds.filter((id) => {
        const node = model.nodeById.get(id);
        return matches(node?.title, needle) || matches(node?.description, needle);
      })
    }))
    .filter((item) => matches(item.course.title, needle) || matches(item.course.subtitle, needle) || matches(item.course.description, needle) || item.matchedKnowledgeIds.length > 0)
    .sort((left, right) => (right.matchedKnowledgeIds.length + Number(matches(right.course.title, needle))) - (left.matchedKnowledgeIds.length + Number(matches(left.course.title, needle))) || left.course.title.localeCompare(right.course.title));
  const courseItems = courseMatches.slice(0, 5).map((course) => ({ course: course.course, matchedKnowledgeIds: course.matchedKnowledgeIds }));
  const personMatchesAll = people.filter((person) => matches(person.displayName, needle) || matches(person.handle, needle) || (person.sharedKnowledgeIds ?? []).some((id) => {
    const node = model.nodeById.get(id);
    return matches(node?.title, needle) || matches(node?.description, needle);
  }));
  const personMatches = personMatchesAll.slice(0, 4).map((person) => ({ person }));
  const mapHitIds = knowledgeMatches.slice(0, 5).map((node) => node.id);
  return {
    query,
    knowledge: { items: knowledgeItems, total: knowledgeMatches.length },
    courses: { items: courseItems, total: courseMatches.length },
    people: { items: personMatches, total: personMatchesAll.length },
    mapHitIds,
    empty: knowledgeMatches.length === 0 && courseMatches.length === 0 && personMatches.length === 0
  };
}

export function archiveCourseKnowledgeIds(model: ArchiveModel, courseId: string | null | undefined) {
  if (!courseId) return new Set<string>();
  return new Set(model.courses.find((course) => course.id === courseId)?.coveredKnowledgeIds ?? []);
}

export function archivePeopleKnowledgeIds(people: readonly FollowedPerson[]) {
  return new Map(people.map((person) => [person.id, new Set(person.sharedKnowledgeIds ?? [])]));
}

export function archiveOverlapCount(model: ArchiveModel, person: FollowedPerson) {
  return (person.sharedKnowledgeIds ?? []).filter((id) => model.mineNodeIds.has(id)).length;
}
