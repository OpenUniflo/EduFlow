/** Read a captured, access-scoped API graph/runtime. Never writes facts or learner state. */
import { readFile } from 'node:fs/promises';
import { auditProjectStructure } from '../src/shared/learning/projectStructureAudit.js';
import { buildCapabilityModel } from '../src/shared/learning/routePlanning.js';
const path = process.argv[2];
if (!path) throw new Error('Usage: pnpm exec tsx scripts/audit-project-capability.ts <access-scoped-capture.json>');
const capture = JSON.parse(await readFile(path, 'utf8'));
const graph = capture.graph;
const runtime = capture.runtime;
if (!graph?.nodes || !graph?.edges || !runtime?.curriculumCoverages) throw new Error('Expected { graph, runtime, currentNodeIds }');
const nodeIds = graph.nodes.filter((node: { status: string }) => node.status === 'active').map((node: { id: string }) => node.id);
const lessons = new Map(runtime.lessons.map((lesson: { id: string; order: number }) => [lesson.id, lesson.order]));
const input = {
  nodeIds, prerequisiteEdges: graph.edges.filter((edge: { relation: string }) => edge.relation === 'prerequisite'),
  enablesEdges: graph.edges.filter((edge: { relation: string }) => edge.relation === 'enables'),
  currentNodeIds: capture.currentNodeIds ?? [],
  courseOrder: runtime.curriculumCoverages.map((coverage: { nodeId: string; lessonId: string; order: number }) => ({ nodeId: coverage.nodeId, lessonOrder: Number(lessons.get(coverage.lessonId)), coverageOrder: coverage.order })),
};
const model = buildCapabilityModel(input);
console.log(JSON.stringify({ courseId: runtime.course.id, ...auditProjectStructure(model.courseKnowledgeIds, graph.edges, model.orderedNodeIds),
  blue: model.currentKnowledgeIds.length, green: model.courseKnowledgeIds.filter(id => !model.currentKnowledgeIds.includes(id)).length,
  gray: model.bridgeKnowledgeIds.filter(id => !model.currentKnowledgeIds.includes(id)).length }, null, 2));
