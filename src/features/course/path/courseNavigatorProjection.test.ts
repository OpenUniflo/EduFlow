import { describe, expect, it } from 'vitest';
import { buildCourseNavigator, pathX } from './courseNavigatorProjection';
import { routeOnlyRuntime, routeOnlyKnowledgeGraph } from '../runtime/courseFoundation.fixture';
import { buildCourseGraphData } from '../runtime/courseRuntime';
import type { CourseAssignment, UserCourseState } from '../types';
import type { NavigationDecision } from '@/shared/learning/navigation';
import type { UserKnowledgeRecord } from '@/features/profile/types';

const graph = buildCourseGraphData(routeOnlyRuntime, undefined, routeOnlyKnowledgeGraph, []);
const id = 'route-knowledge';
const assignment = (name: string, order: number): CourseAssignment => ({ id: name, courseId: routeOnlyRuntime.course.id, title: name, order, description: 'Task', requirements: [], expectedOutput: 'Output', acceptanceCriteria: [], mode: 'instruction' });
const runtime = { ...routeOnlyRuntime, assignments: [assignment('second', 2), assignment('first', 1), assignment('third', 3), assignment('fourth', 4)], assignmentCoverages: ['first','second','third','fourth'].map(name => ({ id: name, assignmentId: name, nodeId: id, role: 'practice' as const })) };
const knowledge = [{ nodeId: id, status: 'learned' }] as UserKnowledgeRecord[];
const decision: NavigationDecision = { decisionId: 'd', decidedAt: '', policyVersion: 'course-rule-v2', courseId: runtime.course.id, path: [{ nodeId: id, title: 'Route', state: 'underway', blockedBy: [] }], skippedNodeIds: [], nextAction: { kind: 'next', resourceKind: 'micro', resourceId: 'micro', nodeId: id, reasonCode: 'begin_required_micro', reason: 'Learn' } };
const state = (statuses: Record<string, string>) => ({ assignmentStates: Object.fromEntries(Object.entries(statuses).map(([assignmentId, status]) => [assignmentId, { assignmentId, status }])) }) as UserCourseState;
const project = (options: Partial<Parameters<typeof buildCourseNavigator>[0]> = {}) => buildCourseNavigator({ graph, runtime, knowledge, decision, ...options });

describe('Course navigator projection', () => {
  it('keeps nextAction separate from the ordered nextPractice and retains every debt', () => {
    const result = project();
    expect(result.nextAction).toMatchObject({ resourceId: 'micro', label: '微学习' });
    expect(result.nextPractice?.assignment.id).toBe('first');
    expect(result.pendingPractices.map(item => item.assignment.id)).toEqual(['first','second','third','fourth']);
    expect(result.route[0].state).toBe('current');
  });
  it('excludes accepted/completed; submitted remains visible but cannot restart', () => {
    const result = project({ courseState: state({ first: 'submitted', second: 'accepted', third: 'completed' }) });
    expect(result.pendingPractices.map(item => item.assignment.id)).toEqual(['first','fourth']);
    expect(result.nextPractice?.assignment.id).toBe('fourth');
    expect(result.pendingPractices[0].ready).toBe(false);
  });
  it('requires learned coverage and satisfied assignment dependencies', () => {
    expect(project({ knowledge: [] }).pendingPractices).toEqual([]);
    const dependent = { ...runtime, assignmentDependencies: [{ id: 'dependency', courseId: runtime.course.id, sourceAssignmentId: 'fourth', targetAssignmentId: 'first', strength: 'hard' as const }] };
    expect(project({ runtime: dependent }).nextPractice?.assignment.id).toBe('second');
    expect(project({ runtime: dependent, courseState: state({ fourth: 'accepted' }) }).nextPractice?.assignment.id).toBe('first');
  });
  it('retains started debt after route changes, without declaring it ready', () => {
    const result = project({ knowledge: [], decision: { ...decision, path: [] }, courseState: state({ first: 'started' }) });
    expect(result.pendingPractices).toHaveLength(1);
    expect(result.nextPractice).toBeNull();
  });
  it.each([['skipped','completed'], ['learned','completed'], ['eligible','available'], ['blocked','locked'], ['underway','available']] as const)('maps navigation %s to %s', (source, target) => {
    expect(project({ decision: { ...decision, path: [{ ...decision.path[0], state: source }], nextAction: { ...decision.nextAction, nodeId: undefined } } }).route[0].state).toBe(target);
  });
  it('advances from current to completed with a fresh navigation decision', () => {
    expect(project().route[0].state).toBe('current');
    const result = project({ decision: { ...decision, path: [{ ...decision.path[0], state: 'learned' }], nextAction: { kind: 'next', resourceKind: 'course', reasonCode: 'course_route_complete', reason: 'Done' } } });
    expect(result.route[0].state).toBe('completed');
    expect(result.complete).toBe(true);
    expect(result.nextAction).toBeNull();
    expect(result.pendingPractices).toHaveLength(4);
  });
  it('honors executable practice decisions without promoting Workflow simulation', () => {
    const practice = { ...decision, nextAction: { ...decision.nextAction, resourceKind: 'assignment' as const, resourceId: 'first' } };
    expect(project({ decision: practice }).nextAction?.cta).toBe('开始实训');
    expect(project({ decision: practice, courseState: state({ first: 'submitted' }) }).nextAction).toBeNull();
    expect(project({ decision: practice, runtime: { ...runtime, assignments: runtime.assignments.map(item => ({ ...item, mode: 'workflow' })) } }).nextAction).toBeNull();
  });
  it('handles no decision, empty assets and foreign course decisions', () => {
    expect(project({ runtime: routeOnlyRuntime, decision: null }).pendingPractices).toEqual([]);
    expect(project({ decision: null }).nextAction).toBeNull();
    expect(project({ decision: { ...decision, courseId: 'other' } }).nextAction).toBeNull();
  });
  it('groups chapters without changing server route order', () => {
    const second = { ...graph.knowledgeNodes[0], id: 'next', chapterId: 'chapter-2' };
    const result = project({ graph: { ...graph, knowledgeNodes: [...graph.knowledgeNodes, second], chapters: [...graph.chapters, { ...graph.chapters[0], id: 'chapter-2', title: 'Second chapter' }] }, decision: { ...decision, path: [...decision.path, { nodeId: 'next', title: 'Next', state: 'blocked', blockedBy: [] }] } });
    expect(result.sections.map(section => section.title)).toEqual(['Route','Second chapter']);
    expect(result.route.map(item => item.node.id)).toEqual([id,'next']);
  });
  it('positions identical route indices deterministically inside mobile-safe bounds', () => {
    const positions = Array.from({ length: 80 }, (_, index) => pathX(index));
    expect(positions).toEqual(Array.from({ length: 80 }, (_, index) => pathX(index)));
    expect(positions.slice(0,5)).toEqual([50,68,50,32,50]);
    expect(positions.every(x => x >= 32 && x <= 68)).toBe(true);
  });
});
