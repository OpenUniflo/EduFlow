import { buildCapabilityModel, type CapabilityModel } from '@/shared/learning/routePlanning';
import { satisfiesTeachingPrerequisite } from '@/shared/learning/teachingPrerequisites';
import type { KnowledgeGraph } from '@/features/knowledge/types';
import type { UserKnowledgeRecord } from '@/features/profile/types';
import type { CourseRuntimeData } from '../runtime/courseRuntime';

/** Feature adapter; the shared core knows no Course, Knowledge, or user-state types. */
export function buildProjectCapabilityModel(graph: KnowledgeGraph, runtime: CourseRuntimeData, knowledge: UserKnowledgeRecord[]) {
  const lessonOrder = new Map(runtime.lessons.map(lesson => [lesson.id, lesson.order]));
  return buildCapabilityModel({
    nodeIds: graph.nodes.filter(node => node.status === 'active').map(node => node.id),
    prerequisiteEdges: graph.edges.filter(edge => edge.relation === 'prerequisite'),
    enablesEdges: graph.edges.flatMap(edge => edge.relation === 'enables' ? [{ id: edge.id, source: edge.source, target: edge.target, relation: 'enables' as const, strength: edge.strength }] : []),
    currentNodeIds: knowledge.filter(record => satisfiesTeachingPrerequisite(record.status)).map(record => record.nodeId),
    courseOrder: runtime.curriculumCoverages.map(coverage => ({ nodeId: coverage.nodeId, lessonOrder: lessonOrder.get(coverage.lessonId) ?? Number.MAX_SAFE_INTEGER, coverageOrder: coverage.order })),
  });
}

import { resolveNodeDomain } from '@/features/knowledge/domain/domainResolution';
import type { DomainGovernanceState } from '@/features/knowledge/domain/DomainGovernanceRepository';
import type { AtlasSceneProjection } from '@/features/knowledge/projections/atlasProjections';

export function projectCapabilityAtlas(graph: KnowledgeGraph, model: CapabilityModel, governance: DomainGovernanceState, knowledge: UserKnowledgeRecord[]): AtlasSceneProjection {
  const members = new Set(model.orderedNodeIds);
  const current = new Set(model.currentKnowledgeIds);
  const course = new Set(model.courseKnowledgeIds);
  const states = new Map(knowledge.map(record => [record.nodeId, record.status]));
  const edgeIds = new Set(model.supportEdges.map(edge => edge.id));
  const edges = graph.edges.filter(edge => edgeIds.has(edge.id));
  const degree = new Map<string, number>();
  edges.forEach(edge => { for (const id of [edge.source, edge.target]) degree.set(id, (degree.get(id) ?? 0) + 1); });
  const max = Math.max(1, ...degree.values());
  return {
    nodes: graph.nodes.filter(node => members.has(node.id)).sort((a, b) => a.id.localeCompare(b.id)).map(node => {
      const { domain } = resolveNodeDomain(node.id, governance);
      return { id: node.id, title: node.title, description: node.description, knowledge: node,
        color: current.has(node.id) ? '#3b82f6' : course.has(node.id) ? '#22c55e' : '#94a3b8', domainTitle: domain?.name ?? '未分类', domainId: domain?.id,
        status: states.get(node.id) ?? 'explore', isCore: true, progress: 0, visualImportance: (degree.get(node.id) ?? 0) / max,
        courseContexts: [], featured: course.has(node.id), capabilityRoles: { current: current.has(node.id), course: course.has(node.id), bridge: !course.has(node.id) } };
    }), edges,
  };
}
