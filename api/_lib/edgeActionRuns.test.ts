import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoutePlanningInput } from '../../src/shared/learning/routePlanning';
const mocks = vi.hoisted(() => ({ route: vi.fn(), version: vi.fn(), micro: vi.fn() }));
vi.mock('./routePlanning.js', () => ({ readRouteInput: mocks.route, readActiveVersion: mocks.version }));
vi.mock('./courseMembership.js', () => ({ requirePublishedCourse: vi.fn(), requireMicroTeachingEligibility: mocks.micro }));
import { requireActionExecution } from './edgeActionRuns';
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let input: RoutePlanningInput;
const client = { from(table: string) {
  let rows = tables[table] ?? []; let single = false;
  const query = {
    select: () => query, order: () => query, range: () => query,
    eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
    in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query; },
    maybeSingle: () => { single = true; return query; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: single ? rows[0] ?? null : rows, error: null })),
  }; return query;
} } as unknown as SupabaseClient;

beforeEach(() => {
  input = { nodeIds: ['source', 'target', 'other'], currentNodeIds: ['source'], courseOrder: [{ nodeId: 'target', lessonOrder: 1, coverageOrder: 1 }], prerequisiteEdges: [{ id: 'edge', source: 'source', target: 'target', strength: 'hard' }] };
  mocks.route.mockImplementation(async () => ({ input }));
  mocks.version.mockResolvedValue({ id:'version',snapshot:{}, constraints: { includeNodeIds: [], excludeNodeIds: [] } }); mocks.micro.mockResolvedValue({});
  tables = {
    knowledge_edge_actions: [{ id: 'action', edge_id: 'edge', status: 'active', type: 'micro_learning', estimated_minutes: 5, difficulty: 1, required_capability_ids: [], resource_requirements: [], updated_at: '1' }],
    course_action_bindings: [{ id: 'binding', action_id: 'action', course_id: 'course', available: true, resources: [], micro_path_id: 'second-path', updated_at: '1' }],
    micro_learning_paths: ['first-path', 'second-path'].map(id => ({ id, course_id: 'course', knowledge_id: 'target', mode: 'learn', status: 'published' })),
  };
});
describe('explicit Action execution authority', () => {
  it('executes the bound Micro even when another path sorts first', async () => {
    expect((await requireActionExecution(client, 'learner', 'course', 'action')).microPathId).toBe('second-path');
  });
  it.each([null, 'missing-path', 'wrong-target'])('never guesses an executor when reference is %s', async pathId => {
    tables.course_action_bindings[0].micro_path_id = pathId;
    tables.micro_learning_paths.push({ id: 'wrong-target', course_id: 'course', knowledge_id: 'other', mode: 'learn', status: 'published' });
    await expect(requireActionExecution(client, 'learner', 'course', 'action')).rejects.toMatchObject({ status: 422 });
  });
  it('blocks source missing even on a non-gating enables relation', async () => {
    input.prerequisiteEdges = []; input.enablesEdges = [{ id: 'edge', source: 'source', target: 'target', relation: 'enables', strength: 1 }];
    input.currentNodeIds = [];
    await expect(requireActionExecution(client, 'learner', 'course', 'action', 'edge')).rejects.toMatchObject({ code: 'action_conditions_unmet' });
  });
  it('checks real hard prerequisites, but ignores enables as a gate', async () => {
    input.enablesEdges = [{ id: 'support', source: 'other', target: 'target', relation: 'enables', strength: 1 }];
    expect((await requireActionExecution(client, 'learner', 'course', 'action')).microPathId).toBe('second-path');
    input.prerequisiteEdges = [...input.prerequisiteEdges, { id: 'hard', source: 'other', target: 'target', strength: 'hard' }];
    await expect(requireActionExecution(client, 'learner', 'course', 'action', 'edge')).rejects.toMatchObject({ code: 'target_prerequisite_required' });
  });
  it('requires a formal valid route for new selections', async () => {
    mocks.version.mockResolvedValue(null);
    await expect(requireActionExecution(client, 'learner', 'course', 'action')).rejects.toMatchObject({ code: 'action_outside_route' });
  });
  it('requires an explicit Assignment and target coverage', async () => {
    tables.knowledge_edge_actions[0].type = 'practice_task';
    tables.course_action_bindings[0].micro_path_id = null;
    await expect(requireActionExecution(client, 'learner', 'course', 'action')).rejects.toMatchObject({ code: 'action_assignment_unavailable' });
    tables.course_action_bindings[0].assignment_id = 'task';
    tables.course_assignments = [{ id: 'task', course_id: 'course', mode: 'answer', experience: { type: 'answer' } }];
    tables.assignment_coverages = [{ course_id: 'course', assignment_id: 'task', node_id: 'other' }];
    await expect(requireActionExecution(client, 'learner', 'course', 'action')).rejects.toMatchObject({ code: 'action_assignment_unavailable' });
  });
  it('can repeat a real historical edge after acquired capability prunes the candidate model', async () => {
    input.currentNodeIds = ['source', 'target'];
    await expect(requireActionExecution(client, 'learner', 'course', 'action')).rejects.toMatchObject({ code: 'action_outside_route' });
    expect((await requireActionExecution(client, 'learner', 'course', 'action', 'edge')).microPathId).toBe('second-path');
  });
  it('starts a first bound Action on an explicitly included acquired Bridge relation', async () => {
    input.currentNodeIds = ['source', 'target'];
    mocks.version.mockResolvedValue({ id:'version',snapshot:{}, constraints: { includeNodeIds: ['source'], excludeNodeIds: [] } });
    expect((await requireActionExecution(client, 'learner', 'course', 'action')).microPathId).toBe('second-path');
  });
  it('rejects a new route Action when its source is missing, including non-gating relations', async () => {
    input.currentNodeIds = [];
    input.courseOrder = [{ nodeId: 'source', lessonOrder: 0, coverageOrder: 0 }, ...input.courseOrder];
    input.prerequisiteEdges = [];
    input.enablesEdges = [{ id: 'edge', source: 'source', target: 'target', relation: 'enables', strength: 1 }];
    await expect(requireActionExecution(client, 'learner', 'course', 'action')).rejects.toMatchObject({ code: 'action_conditions_unmet' });
  });
  it('retains target hard gates for a new formally selected relation', async () => {
    input.prerequisiteEdges = [...input.prerequisiteEdges, { id: 'other-hard', source: 'other', target: 'target', strength: 'hard' }];
    await expect(requireActionExecution(client, 'learner', 'course', 'action')).rejects.toMatchObject({ code: 'target_prerequisite_required' });
  });
  it('does not repeat a retained Practice through an explicitly excluded capability', async () => {
    tables.knowledge_edge_actions[0].type = 'practice_task';
    mocks.version.mockResolvedValue({ id:'version',snapshot:{}, constraints: { includeNodeIds: [], excludeNodeIds: ['target'] } });
    await expect(requireActionExecution(client, 'learner', 'course', 'action', 'edge')).rejects.toMatchObject({ code: 'action_excluded' });
  });
  it('does not advertise workflow execution without ActionRun result lineage', async () => {
    tables.knowledge_edge_actions[0].type = 'practice_task';
    tables.course_action_bindings[0].micro_path_id = null; tables.course_action_bindings[0].assignment_id = 'task';
    tables.course_assignments = [{ id: 'task', course_id: 'course', mode: 'workflow' }];
    await expect(requireActionExecution(client, 'learner', 'course', 'action')).rejects.toMatchObject({ code: 'action_assignment_unavailable' });
  });
  it('rejects a different Action on the same formal Edge and preserves the chosen reference',async()=>{
    mocks.version.mockResolvedValue({id:'version',constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot:{valid:true,executionSteps:[{edgeId:'edge',actionId:'other-action',sourceNodeId:'source',targetNodeId:'target',order:0}]}});
    await expect(requireActionExecution(client,'learner','course','action')).rejects.toMatchObject({code:'action_not_selected_in_route'});
    // A real retained execution remains independent of a changed future plan.
    expect((await requireActionExecution(client,'learner','course','action','edge')).microPathId).toBe('second-path');
  });
  it('keeps adopted steps executable after UKS prunes the dynamically replanned graph',async()=>{
    input.currentNodeIds=['source','target'];
    mocks.version.mockResolvedValue({id:'version',constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot:{valid:true,executionSteps:[{edgeId:'edge',actionId:'action',sourceNodeId:'source',targetNodeId:'target',order:0}]}});
    expect((await requireActionExecution(client,'learner','course','action')).routeVersionId).toBe('version');
  });

});
