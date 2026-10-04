import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CoursePathView} from './CoursePathView';
import {routeExecutionProjection} from './routeExecutionProjection';
import type {ActionData,ActionRun,EdgeAction} from '@/features/actions/model';
import type {RoutePlanView} from '@/shared/learning/routeVersion';
const steps=[{edgeId:'ab',actionId:'selected',sourceNodeId:'A',targetNodeId:'B',order:0},{edgeId:'cb',actionId:'practice',sourceNodeId:'C',targetNodeId:'B',order:1}];
const action=(id:string,edge_id:string,type='micro_learning')=>({id,edge_id,title:id,estimated_minutes:8,status:'active',type}) as EdgeAction;
const data:ActionData={actions:[action('cheaper','ab'),action('selected','ab'),action('practice','cb','practice_task')],runs:[],bindings:[],availableMicroActionIds:['selected'],availableActionIds:['selected','practice']};
const view={activeVersion:{id:'v1',courseId:'course',snapshot:{valid:true,executionSteps:steps}},plan:{valid:true},execution:{complete:true,issues:[],options:steps.map(step=>({...step,planningAvailable:true,availableNow:true,reasons:[]}))}} as unknown as RoutePlanView;
const run=(id:string,actionId:string,edgeId:string,status:ActionRun['status']):ActionRun=>({id,course_id:'course',action_id:actionId,edge_id:edgeId,status}) as ActionRun;
describe('Course formal sequential execution',()=>{
  it('uses exactly adopted choices even when cheaper alternatives are first',()=>{
    const model=routeExecutionProjection('course',view,data);
    expect(model.steps.map(step=>step.action?.id)).toEqual(['selected','practice']);expect(model.currentIndex).toBe(0);
  });
  it('outside-route in-progress history never displaces the formal current Step',()=>{
    const model=routeExecutionProjection('course',view,{...data,runs:[run('outside','cheaper','ab','in_progress')]});
    expect(model.steps[0].run).toBeUndefined();expect(model.currentIndex).toBe(0);
  });
  it('advances only from matching Action completion and resumes its exact Run',()=>{
    const model=routeExecutionProjection('course',view,{...data,runs:[run('done','selected','ab','completed'),run('now','practice','cb','in_progress')],continuableRunIds:['now']});
    expect(model.currentIndex).toBe(1);expect(model.steps.map(step=>step.state)).toEqual(['completed','current']);expect(model.steps[1].run?.id).toBe('now');
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
    expect(html).toContain('navigator-track');expect(html).toContain('data-execution-order="true"');expect(html).toContain('data-step-action="selected"');
    expect(html).not.toContain('react-flow');expect(html).not.toContain('cheaper');expect(html).not.toContain('data-edge-id');
    expect(steps).toEqual(before);expect(html).toContain('当前步骤');expect(html).toContain('下一步');
  });
});
