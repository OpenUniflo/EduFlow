import { describe, expect, it } from 'vitest';
import { evaluateAction, projectEdgeActions, rankActions, type EdgeAction, type CourseActionBinding } from './model';
const action: EdgeAction = { id: 'practice', edge_id: 'factual-edge', type: 'practice_task', title: 'Verify', description: 'Verify a result', estimated_minutes: 45, difficulty: 3, resource_requirements: ['dataset'], required_capability_ids: ['condition'], expected_evidence: 'Work record', status: 'active', provenance: {} };
const binding: CourseActionBinding = { id: 'binding', course_id: 'course', action_id: action.id, context: 'Project context', contact: '', instructions: 'Compare measurements', resources: [{ key: 'dataset', label: 'Data', reference: 'https://example.org/data', available: true }], available: true };
describe('edge action cost and projection', () => {
  it('requires an acquired source instead of charging extra preparation cost', () => {
    const experienced = evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(['source', 'condition']), binding });
    const preparing = evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(['condition']), binding });
    expect(experienced).toMatchObject({ available: true, weight: 75 });
    expect(preparing).toMatchObject({ available: false, weight: 75 });
    expect(preparing.reasons.map(reason => reason.code)).toEqual(['time', 'difficulty', 'source_unacquired']);
  });
  it('ranks available actions first, then lower cost and stable identity without mutating input', () => {
    const row = (id: string, available: boolean, weight: number) => ({ action: { id }, cost: { available, weight, reasons: [] } });
    const input = [row('cheap-blocked', false, 1), row('z', true, 10), row('a', true, 10), row('costly', true, 20)];
    expect(rankActions(input).map(item => item.action.id)).toEqual(['a', 'z', 'costly', 'cheap-blocked']);
    expect(rankActions([...input].reverse())).toEqual(rankActions(input));
    expect(input[0].action.id).toBe('cheap-blocked');
  });
  it('requires mandatory capabilities and actual available project resources', () => {
    expect(evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(), binding }).available).toBe(false);
    expect(evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(['condition']) }).reasons.some(reason => reason.code === 'missing_resource')).toBe(true);
    expect(evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(['condition']), binding: { ...binding, resources: [{ ...binding.resources[0], reference: '' }] } }).available).toBe(false);
    expect(evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(['condition']), binding: { ...binding, action_id: 'different' } }).available).toBe(false);
  });
  it('does not advertise Micro execution before real teaching content is published', () => {
    const micro: EdgeAction = { ...action, type: 'micro_learning', resource_requirements: [], required_capability_ids: [] };
    expect(evaluateAction(micro, { sourceId: 'source', acquiredIds: new Set(['source']), microAvailable: false })).toMatchObject({ available: false, reasons: expect.arrayContaining([expect.objectContaining({ code: 'micro_unavailable' })]) });
    expect(evaluateAction(micro, { sourceId: 'source', acquiredIds: new Set(['source']), microAvailable: true }).available).toBe(true);
  });
  it('projects alternatives on only real visible edges without copying templates or cross-course bindings', () => {
    const micro: EdgeAction = { ...action, id: 'micro', type: 'micro_learning', resource_requirements: [] };
    const edges = new Set(['factual-edge']);
    const projection = projectEdgeActions(edges, [action, micro, { ...action, id: 'outside', edge_id: 'other' }, { ...action, id: 'old', status: 'archived' }], [binding], 'different-course');
    expect(projection.map(row => row.action.id)).toEqual(['micro', 'practice']);
    expect(projection.every(row => row.binding === undefined)).toBe(true);
    expect(projection[1].action).toBe(action);
    expect([...edges]).toEqual(['factual-edge']);
  });
});

it('completed Node alternatives use explicit repeat eligibility without reopening ordinary frontier',async()=>{
 const {actionAlternatives}=await import('./model');
 const node:EdgeAction={...action,id:'node',edge_id:null,node_id:'root',type:'micro_learning',required_capability_ids:[],resource_requirements:[]};
 const data={actions:[node],bindings:[],runs:[{action_id:'node',status:'completed'}],availableActionIds:[],availableMicroActionIds:[],repeatableActionIds:['node']} as unknown as Parameters<typeof actionAlternatives>[2];
 expect(actionAlternatives('course',{nodeId:'root'},data,new Set())[0].cost.available).toBe(true);
 expect(actionAlternatives('course',{nodeId:'root'},{...data,repeatableActionIds:[]},new Set())[0].cost.available).toBe(false);
});
