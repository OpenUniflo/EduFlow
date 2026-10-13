import { expect, it } from 'vitest';
import { courseActionRecommendation } from './courseActionRecommendation';
import type { ActionData, ActionRun, EdgeAction } from '@/features/actions/model';
const edge = { id: 'fact', source: 'A', target: 'B', relation: 'enables' as const, strength: 1 };
const action = (id: string, minutes: number): EdgeAction => ({ id, edge_id: edge.id, type: 'practice_task', title: id, description: '', estimated_minutes: minutes, difficulty: 1, resource_requirements: [], required_capability_ids: [], expected_evidence: '', status: 'active', provenance: {} });
const data: ActionData = { actions: [action('expensive', 20), action('cheap', 10)], bindings: [], runs: [], availableActionIds: ['expensive','cheap'], availableMicroActionIds: [] };
const run: ActionRun = { id: 'run', course_id: 'course', user_id: 'user', action_id: 'cheap', binding_id: null, status: 'in_progress', edge_id: edge.id, execution_snapshot: {action: data.actions[1],binding:null,sourceId:'A',targetId:'B'}, created_at:'2026-10-04',started_at:null,completed_at:null,evidence_source_id:null,micro_path_id:null };
it('recommends Practice without Micro using the same availability and ascending cost', () => {
  expect(courseActionRecommendation('course',[edge],data,new Set(['A']))).toMatchObject({kind:'candidate',recommended:{action:{id:'cheap'}}});
  expect(courseActionRecommendation('course',[edge],data,new Set())).toEqual({kind:'empty'});
  expect(courseActionRecommendation('course',[],data,new Set(['A']))).toEqual({kind:'empty'});
});
it('retains owned execution outside the route when the server permits continuation despite absent client summaries', () => {
  expect(courseActionRecommendation('course',[],{...data,actions:[],runs:[run],continuableRunIds:[run.id]},new Set())).toMatchObject({kind:'active',run:{id:'run'},outsideRoute:true});
  expect(courseActionRecommendation('other',[],{...data,runs:[run]},new Set())).toEqual({kind:'empty'});
});
it('never automatically recommends a completed run as another execution', () => {
  const completed = {...run,status:'completed' as const};
  expect(courseActionRecommendation('course',[edge],{...data,runs:[completed]},new Set(['A']))).toMatchObject({kind:'candidate',recommended:{action:{id:'expensive'}}});
});

it('does not let a blocked historical selection suppress available alternatives', () => {
  const blocked = {...run,action_id:'archived',status:'selected' as const};
  expect(courseActionRecommendation('course',[edge],{...data,runs:[blocked],continuableRunIds:[]},new Set(['A']))).toMatchObject({kind:'candidate'});
});
it('leaves additional alternatives for an acquired target to explicit practice', () => {
  expect(courseActionRecommendation('course',[edge],data,new Set(['A','B']))).toEqual({kind:'empty'});
});
