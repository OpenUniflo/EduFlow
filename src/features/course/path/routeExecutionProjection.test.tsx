import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CoursePathView} from './CoursePathView';
import {routeExecutionProjection} from './routeExecutionProjection';
import type {ActionData,ActionRun,EdgeAction} from '@/features/actions/model';
import type {RoutePlanView} from '@/shared/learning/routeVersion';
const steps=[{edgeId:'ab',actionId:'selected',sourceNodeId:'A',targetNodeId:'B',order:0},{edgeId:'cb',actionId:'practice',sourceNodeId:'C',targetNodeId:'B',order:1}];
const action=(id:string,edge_id:string,type='micro_learning')=>({id,edge_id,title:id,estimated_minutes:8,status:'active',type}) as EdgeAction;
const data:ActionData={actions:[action('cheaper','ab'),action('selected','ab'),action('practice','cb','practice_task')],runs:[],bindings:[],availableMicroActionIds:['selected'],availableActionIds:['selected','practice']};
const view={activeVersion:{id:'v1',userId:'u',courseId:'course',snapshot:{valid:true,executionSteps:steps}},plan:{valid:true},execution:{complete:true,issues:[],options:steps.map(step=>({...step,planningAvailable:true,availableNow:true,reasons:[]}))}} as unknown as RoutePlanView;
const run=(id:string,actionId:string,edgeId:string,status:ActionRun['status']):ActionRun=>({id,execution_version:2,user_id:'u',course_id:'course',action_id:actionId,edge_id:edgeId,status}) as ActionRun;
describe('Course formal execution frontier',()=>{
  it('uses exactly adopted choices even when cheaper alternatives are first',()=>{
    const model=routeExecutionProjection('course',view,data);
    expect(model.steps.map(step=>step.action?.id)).toEqual(['selected','practice']);expect(model.recommendedStepIndex).toBe(0);
  });
  it('outside-route in-progress history never displaces the formal current Step',()=>{
    const model=routeExecutionProjection('course',view,{...data,runs:[run('outside','cheaper','ab','in_progress')]});
    expect(model.steps[0].run).toBeUndefined();expect(model.recommendedStepIndex).toBe(0);
  });
  it('advances only from matching Action completion and resumes its exact Run',()=>{
    const model=routeExecutionProjection('course',view,{...data,runs:[run('done','selected','ab','completed'),run('now','practice','cb','in_progress')],continuableRunIds:['now']});
    expect(model.recommendedStepIndex).toBe(1);expect(model.steps.map(step=>step.state)).toEqual(['completed','in_progress']);expect(model.steps[1].run?.id).toBe('now');
    expect(view.activeVersion!.snapshot.executionSteps).toEqual(steps);
  });
  it('unavailable selected Action stays explicit and is never replaced',()=>{
    const model=routeExecutionProjection('course',view,{...data,actions:data.actions.filter(action=>action.id!=='selected')});
    expect(model.steps[0].actionId).toBe('selected');expect(model.steps[0].unavailable).toBe(true);
  });
  it('old missing choices require adjustment while intentionally empty decisions do not',()=>{
    const legacy={...view,activeVersion:{...view.activeVersion!,snapshot:{...view.activeVersion!.snapshot,executionSteps:undefined}}};
    expect(routeExecutionProjection('course',legacy,data).needsAdjustment).toBe(true);
    const empty={...view,activeVersion:{...view.activeVersion!,snapshot:{...view.activeVersion!.snapshot,executionSteps:[]}}};
    expect(routeExecutionProjection('course',empty,data).needsAdjustment).toBe(false);
  });
  it('restores a vertical Step path without a DAG or copied alternatives, and connectors never become facts',()=>{
    const before=structuredClone(steps),model=routeExecutionProjection('course',view,data);
    const html=renderToStaticMarkup(<CoursePathView model={model} onSelect={vi.fn()} onExecute={vi.fn()}/>);
    expect(html).toContain('navigator-track');expect(html).toContain('data-reading-order="true"');expect(html).toContain('data-step-action="selected"');
    expect(html).not.toContain('react-flow');expect(html).not.toContain('cheaper');expect(html).not.toContain('data-edge-id');
    expect(steps).toEqual(before);expect(html).toContain('推荐下一步');expect(html).toContain('可执行');expect((html.match(/>开始</g)??[]).length).toBe(2);
  });
});

it('distinguishes satisfied from completed and allows every GET frontier Action even when cached option readiness is stale',()=>{
  const stale={...view,execution:{...view.execution!,options:view.execution!.options.map(option=>({...option,availableNow:false,reasons:['previous source unavailable']}))}};
  const model=routeExecutionProjection('course',stale,data,['B']);
  expect(model.steps.map(step=>step.state)).toEqual(['satisfied','satisfied']);
  expect(model.steps.every(step=>step.canExecute && !step.completed)).toBe(true);
  expect(model.progressionSatisfied).toBe(true);expect(model.actionsCompleted).toBe(false);
  expect(model.recommendedStepIndex).toBe(-1);
  const html=renderToStaticMarkup(<CoursePathView model={model} onSelect={vi.fn()} onExecute={vi.fn()}/>);
  expect(html).toContain('路线目标已满足');expect(html).toContain('能力已满足 · 可选执行');expect(html).toContain('仍有可选补做行动');
  expect(html).not.toContain('路线行动已完成');
});
