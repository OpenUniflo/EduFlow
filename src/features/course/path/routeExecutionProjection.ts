import type { ActionData } from '@/features/actions/model';
import type { RoutePlanView } from '@/shared/learning/routeVersion';

/** Presentation over adopted references. History/state never rerank the plan. */
export function routeExecutionProjection(courseId:string,view:RoutePlanView|null,data:ActionData) {
  const version=view?.activeVersion?.courseId===courseId?view.activeVersion:null;
  const references=version?.snapshot.executionSteps;
  const steps=(references??[]).map(step=>{
    const action=data.actions.find(action=>action.id===step.actionId && action.edge_id===step.edgeId && action.status==='active');
    const runs=data.runs.filter(run=>run.course_id===courseId && run.edge_id===step.edgeId && run.action_id===step.actionId);
    const completed=runs.some(run=>run.status==='completed');
    const run=runs.find(run=>['selected','in_progress'].includes(run.status));
    const option=view?.execution?.options.find(option=>option.edgeId===step.edgeId && option.actionId===step.actionId);
    const continuable=Boolean(run && data.continuableRunIds?.includes(run.id));
    return {...step,action,run,completed,unavailable:!action || option?.planningAvailable===false,
      canExecute:continuable || Boolean(option?.availableNow && data.availableActionIds.includes(step.actionId)),
      reason:option?.reasons.join('；')??'',title:action?.title??`已选行动 ${step.actionId}`};
  });
  const currentIndex=steps.findIndex(step=>!step.completed);
  const needsAdjustment=references===undefined || !version?.snapshot.valid || view?.plan.valid===false || view?.execution?.complete===false;
  return {version,steps:steps.map((step,index)=>({...step,state:step.completed?'completed' as const:index===currentIndex?'current' as const:'upcoming' as const})),currentIndex,needsAdjustment,
    issue:references===undefined?'历史路线尚未选择行动，请进入项目能力模型调整并采用路线。':view?.execution?.issues.map(issue=>issue.reason).join('；')??''};
}
export type CourseExecutionModel=ReturnType<typeof routeExecutionProjection>;
