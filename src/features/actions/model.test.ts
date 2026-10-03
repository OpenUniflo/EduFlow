import { describe, expect, it } from 'vitest';
import { evaluateAction, projectEdgeActions, type EdgeAction, type CourseActionBinding } from './model';
const action: EdgeAction = { id: 'practice', edge_id: 'factual-edge', type: 'practice_task', title: 'Verify', description: 'Verify a result', estimated_minutes: 45, difficulty: 3, resource_requirements: ['dataset'], required_capability_ids: ['condition'], expected_evidence: 'Work record', status: 'active', provenance: {} };
const binding: CourseActionBinding = { id: 'binding', course_id: 'course', action_id: action.id, context: 'Project context', contact: '', instructions: 'Compare measurements', resources: [{ key: 'dataset', label: 'Data', reference: 'https://example.org/data', available: true }], available: true };
describe('edge action cost and projection', () => {
  it('changes cost with official user state and explains the exact sum', () => {
    const experienced = evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(['source', 'condition']), binding });
    const preparing = evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(['condition']), binding });
    expect(experienced).toMatchObject({ available: true, weight: 75 });
    expect(preparing).toMatchObject({ available: true, weight: 105 });
    expect(preparing.reasons.map(reason => reason.code)).toEqual(['time', 'difficulty', 'source_unacquired']);
  });
  it('requires mandatory capabilities and actual available project resources', () => {
    expect(evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(), binding }).available).toBe(false);
    expect(evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(['condition']) }).reasons.some(reason => reason.code === 'missing_resource')).toBe(true);
    expect(evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(['condition']), binding: { ...binding, resources: [{ ...binding.resources[0], reference: '' }] } }).available).toBe(false);
    expect(evaluateAction(action, { sourceId: 'source', acquiredIds: new Set(['condition']), binding: { ...binding, action_id: 'different' } }).available).toBe(false);
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
