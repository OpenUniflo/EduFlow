import type { ActionData } from '@/features/actions/model';
import type { RoutePlanView } from '@/shared/learning/routeVersion';

/** Presentation over adopted references. History/state never rerank the plan. */
export function routeExecutionProjection(courseId:string,view:RoutePlanView|null,data:ActionData,acquiredNodeIds:readonly string[]=[]) {
  const version=view?.activeVersion?.courseId===courseId?view.activeVersion:null;
  const references=version?.snapshot.executionSteps;
  const acquired=new Set(acquiredNodeIds);
  const steps=(references??[]).map(step=>{
    const action=data.actions.find(action=>action.id===step.actionId && action.edge_id===step.edgeId && action.status==='active');
    const runs=data.runs.filter(run=>run.user_id===version?.userId && run.course_id===courseId && run.edge_id===step.edgeId && run.action_id===step.actionId);
    const completed=runs.some(run=>run.status==='completed');
    const run=runs.find(run=>['selected','in_progress'].includes(run.status));
    const option=view?.execution?.options.find(option=>option.edgeId===step.edgeId && option.actionId===step.actionId);
    const continuable=Boolean(run && data.continuableRunIds?.includes(run.id));
    const canExecute=continuable || data.availableActionIds.includes(step.actionId);
    const satisfied=!completed && acquired.has(step.targetNodeId);
    const state=run?.status==='in_progress' && continuable?'in_progress' as const:completed?'completed' as const:satisfied?'satisfied' as const:canExecute?'available' as const:'blocked' as const;
    return {...step,action,run,completed,satisfied,state,unavailable:!action || option?.planningAvailable===false,
      canExecute,reason:canExecute?'':option?.reasons.join('；')||'等待起点能力、同一关系的前序行动或执行条件。',title:action?.title??`已选行动 ${step.actionId}`};
  });
  const recommendedStepIndex=steps.findIndex(step=>!step.completed && !step.satisfied && step.canExecute && !step.unavailable);
  const reachable=new Set(data.routeExecutionReachableNodeIds??acquiredNodeIds);
  const goals=version?.snapshot.effectiveTargetNodeIds;
  const progressionSatisfied=goals?.length?goals.every(id=>reachable.has(id)):steps.every(step=>step.completed || step.satisfied);
  const needsAdjustment=references===undefined || !version?.snapshot.valid || view?.plan.valid===false || view?.execution?.complete===false;
  return {version,steps,recommendedStepIndex,progressionSatisfied,actionsCompleted:steps.every(step=>step.completed),needsAdjustment,
    issue:references===undefined?'历史路线尚未选择行动，请进入项目能力模型调整并采用路线。':view?.execution?.issues.map(issue=>issue.reason).join('；')??''};
}
export type CourseExecutionModel=ReturnType<typeof routeExecutionProjection>;
