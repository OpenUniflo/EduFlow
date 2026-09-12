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
const decision: NavigationDecision = { decisionId: 'd', decidedAt: '', policyVersion: 'course-rule-v3', courseId: runtime.course.id, path: [{ nodeId: id, title: 'Route', state: 'underway', blockedBy: [] }], skippedNodeIds: [], nextAction: { kind: 'next', resourceKind: 'micro', resourceId: 'micro', nodeId: id, reasonCode: 'begin_required_micro', reason: 'Learn' } };
const state = (statuses: Record<string, string>) => ({ assignmentStates: Object.fromEntries(Object.entries(statuses).map(([assignmentId, status]) => [assignmentId, { assignmentId, status }])) }) as UserCourseState;
const project = (options: Partial<Parameters<typeof buildCourseNavigator>[0]> = {}) => buildCourseNavigator({ graph, runtime, knowledge, decision, learningContent: [{ nodeId: id, pathId: 'micro', estimatedMinutes: 8 }], ...options });

describe('Course navigator projection', () => {
  it('keeps nextAction separate from the ordered nextPractice and retains every debt', () => {
    const result = project();
    expect(result.nextAction).toMatchObject({ action: { knowledgeId: id, pathId: 'micro' }, cta: '开始学习', estimatedMinutes: 8 });
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
  it.each(['material', 'assignment'] as const)('never promotes a legacy %s action', resourceKind => {
    const result = project({ decision: { ...decision, nextAction: { ...decision.nextAction, resourceKind, resourceId: 'first' } } });
    expect(result.nextAction).toBeNull();
    expect(result.pendingPractices).toHaveLength(4);
    expect(result.nextPractice?.assignment.id).toBe('first');
    expect(result.complete).toBe(false);
  });
  it('exposes only learner presentation and a launch identity, never raw resource metadata', () => {
    const result = project({ decision: { ...decision, nextAction: { ...decision.nextAction, reasonCode: 'resume_required_micro', reason: 'Internal Micro Review policy', kind: 'review' } } });
    expect(result.nextAction).toEqual({ title: 'Route Knowledge', reason: '继续上次未完成的学习。', estimatedMinutes: 8, cta: '开始学习', action: { knowledgeId: id, pathId: 'micro' } });
    expect(project({ learningContent: [] }).nextAction).toBeNull();
    expect(project({ learningContent: [{ nodeId: id, pathId: 'micro' }] }).nextAction?.estimatedMinutes).toBeUndefined();
  });
  it('distinguishes completed learning with practice debt from a fully complete course', () => {
    const completed: NavigationDecision = { ...decision, path: [{ ...decision.path[0], state: 'learned' }], nextAction: { kind: 'next', resourceKind: 'course', reasonCode: 'course_route_complete', reason: 'Done' } };
    const pending = project({ decision: completed });
    expect(pending.emptyState.title).toBe('当前学习内容已完成');
    expect(pending.emptyState.reason).toContain('4 项实训');
    expect(pending.courseComplete).toBe(false);
    expect(project({ decision: completed, courseState: state({ first: 'accepted', second: 'completed', third: 'accepted', fourth: 'accepted' }) }).emptyState.title).toBe('课程已完成');
    expect(project({ decision: completed, courseState: state({ first: 'submitted', second: 'accepted', third: 'accepted', fourth: 'accepted' }) }).courseComplete).toBe(false);
  });
  it('never mistakes missing assets, empty routes or contradictory completion for success', () => {
    const missing = { ...decision, nextAction: { kind: 'next' as const, resourceKind: 'course' as const, nodeId: id, reasonCode: 'learning_content_unavailable', reason: 'Missing' } };
    expect(project({ decision: missing }).emptyState.title).toBe('当前没有可继续的学习内容');
    expect(project({ decision: missing }).emptyState.reason).toContain('4 项实训仍保留在下方');
    expect(project({ decision: { ...missing, nextAction: { ...missing.nextAction, reasonCode: 'course_route_complete' } } }).complete).toBe(false);
    expect(project({ decision: { ...missing, path: [], nextAction: { ...missing.nextAction, reasonCode: 'course_route_complete' } } }).complete).toBe(false);
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
