import type { CapabilityRelation, SelectedRoute, RoutePrerequisite } from './routePlanning.js';
import { routeRelations } from './routePresentation.js';

export type RouteActionChoice = { edgeId: string; actionId: string };
export type RouteExecutionStep = RouteActionChoice & { sourceNodeId: string; targetNodeId: string; order: number };
/** Transient planner summaries; versions persist references, never these contents. */
export type RouteActionOption = RouteActionChoice & {
  title: string; type: 'micro_learning' | 'practice_task'; estimatedMinutes: number;
  assignmentId?: string; weight: number; planningAvailable: boolean; availableNow: boolean; reasons: string[]; requiredCapabilityIds?: string[];
};
export function compareRouteActionOptions(a: RouteActionOption, b: RouteActionOption): number {
  return a.edgeId.localeCompare(b.edgeId) || Number(b.planningAvailable)-Number(a.planningAvailable) || Number(b.availableNow)-Number(a.availableNow) || a.weight-b.weight || a.actionId.localeCompare(b.actionId);
}
export type RouteExecutionIssueKind = 'action_required' | 'action_unavailable' | 'source_unreachable' | 'required_capability_missing' | 'hard_edge_required' | 'target_unreachable' | 'edge_not_in_route' | 'support_edge_required';
export type RouteExecutionIssue = {
  kind: RouteExecutionIssueKind; edgeId?: string; actionId?: string; nodeId?: string;
  sourceNodeId?: string; targetNodeId?: string; requiredNodeIds?: string[]; candidateEdgeIds?: string[]; reason: string;
};
export type RouteExecutionPlan = {
  steps: RouteExecutionStep[]; options: RouteActionOption[];
  issues: RouteExecutionIssue[]; complete: boolean;
};

/** Step connectors are stable reading order, never KnowledgeEdge dependencies. */
export function executionRelations(route: SelectedRoute & { executionSteps?: RouteExecutionStep[] }, facts: readonly CapabilityRelation[]) {
  const relations = routeRelations(route, facts);
  return route.executionSteps === undefined ? relations : relations.filter(edge => route.executionSteps!.some(step => step.edgeId === edge.id));
}

export function planRouteExecution(input: {
  route: SelectedRoute; facts: readonly CapabilityRelation[]; options: readonly RouteActionOption[];
  choices?: readonly RouteActionChoice[]; selectedEdgeIds?: readonly string[]; retainedEdgeIds?: readonly string[]; acquiredNodeIds?: readonly string[]; excludedNodeIds?: readonly string[];
}): RouteExecutionPlan {
  const allEdges = routeRelations(input.route, input.facts);
  const issues: RouteExecutionIssue[] = [];
  const selected = new Set(input.selectedEdgeIds ?? (input.retainedEdgeIds ?? []).filter(id => allEdges.some(edge => edge.id === id)));
  const hardEdges = allEdges.filter(edge => edge.relation === 'prerequisite' && edge.strength === 'hard');
  for (const id of selected) if (!allEdges.some(edge => edge.id === id)) issues.push({ kind:'edge_not_in_route', edgeId: id, reason: '这条关系不属于预览路线。' });
  for (const edge of hardEdges) {
    if (input.selectedEdgeIds && !selected.has(edge.id)) issues.push({ kind:'hard_edge_required', edgeId:edge.id, nodeId:edge.target, reason:'必要前置关系不能从路线中省略。' });
    selected.add(edge.id);
  }
  const edges = allEdges.filter(edge => selected.has(edge.id));
  const rank = new Map(input.route.orderedNodeIds.map((id, order) => [id, order]));
  edges.sort((a,b) => rank.get(a.target)! - rank.get(b.target)! || rank.get(a.source)! - rank.get(b.source)! || a.id.localeCompare(b.id));
  const choices = new Map<string,string[]>();
  const pairs = new Set<string>();
  for (const choice of input.choices ?? []) {
    const pair = JSON.stringify([choice.edgeId,choice.actionId]);
    if (pairs.has(pair)) { issues.push({kind:'action_required',...choice,reason:'同一关系的同一行动不能重复选择。'}); continue; }
    pairs.add(pair);
    choices.set(choice.edgeId,[...(choices.get(choice.edgeId)??[]),choice.actionId]);
  }
  const options = input.options.filter(option => allEdges.some(edge => edge.id === option.edgeId)).sort(compareRouteActionOptions);
  const pending: Array<{edge:CapabilityRelation;options:RouteActionOption[]}> = [];
  const assignments = new Set<string>();
  edges.forEach(edge => {
    const requested = choices.get(edge.id);
    const candidates = requested === undefined && input.choices === undefined
      ? options.filter(option=>option.edgeId===edge.id && option.planningAvailable).slice(0,1)
      : (requested ?? []).map(id=>options.find(option=>option.edgeId===edge.id && option.actionId===id));
    const chosen: RouteActionOption[] = [];
    if (!candidates.length) issues.push({kind:'action_required',edgeId:edge.id,reason:'这条关系尚无合法执行资源。'});
    candidates.forEach((option,index)=>{
      if (!option?.planningAvailable) { issues.push({kind:'action_unavailable',edgeId:edge.id,actionId:requested?.[index],reason:'所选行动或执行资源已不可用，请明确选择其他方案。'}); return; }
      if(option.assignmentId && assignments.has(option.assignmentId)) { issues.push({kind:'action_unavailable',edgeId:edge.id,actionId:option.actionId,reason:'同一成果任务不可重复纳入路线。'}); return; }
      if(option.assignmentId) assignments.add(option.assignmentId);
      chosen.push(option);
    });
    if(chosen.length) pending.push({edge,options:chosen});
  });
  const steps: RouteExecutionStep[] = [];
  const expected = new Set(input.acquiredNodeIds ?? input.route.currentKnowledgeIds);
  // Order the plan by real source/required-capability dependencies, including enables.
  // Planning reachability is transient and never changes formal UKS.
  while(pending.length) {
    const index=pending.findIndex(({edge,options})=>expected.has(edge.source)
      && options.every(option=>(option.requiredCapabilityIds??[]).every(id=>expected.has(id))));
    if(index<0) {
      for(const {edge,options} of pending) for(const option of options) {
        if(!expected.has(edge.source)) issues.push({kind:'source_unreachable',edgeId:edge.id,actionId:option.actionId,nodeId:edge.source,sourceNodeId:edge.source,targetNodeId:edge.target,reason:'起点尚未具备，也没有可到达的前序步骤。'});
        const missing=[...new Set([...(option.requiredCapabilityIds??[])])].filter(id=>!expected.has(id));
        if(missing.length) issues.push({kind:'required_capability_missing',edgeId:edge.id,actionId:option.actionId,nodeId:missing[0],requiredNodeIds:missing,targetNodeId:edge.target,reason:'行动所需的必要能力没有形成路径。'});
      }
      break;
    }
    const [{edge,options}]=pending.splice(index,1);
    for(const option of options) steps.push({edgeId:edge.id,actionId:option.actionId,sourceNodeId:edge.source,targetNodeId:edge.target,order:steps.length});
    for (const id of routeReachableNodes(steps, input.facts, new Set(steps.map(step=>step.edgeId)), input.acquiredNodeIds ?? input.route.currentKnowledgeIds, edges)) expected.add(id);
  }
  const missingNodes=new Set([...input.route.effectiveTargetNodeIds,...issues.filter(issue=>issue.kind==='source_unreachable').map(issue=>issue.nodeId!),...issues.flatMap(issue=>issue.requiredNodeIds??[])]);
  for(const id of missingNodes) if(!expected.has(id)) {
    const candidates=input.facts.filter(edge=>edge.target===id && !selected.has(edge.id) && !input.excludedNodeIds?.includes(edge.source) && !input.excludedNodeIds?.includes(edge.target)).sort((a,b)=>Number(expected.has(b.source))-Number(expected.has(a.source))||a.id.localeCompare(b.id));
    issues.push(candidates.length?{kind:'support_edge_required',nodeId:id,targetNodeId:id,candidateEdgeIds:candidates.map(edge=>edge.id),reason:'需要选择真实支撑路径；新增推荐前置和支撑关系不会自动加入。'}:{kind:'target_unreachable',nodeId:id,targetNodeId:id,reason:'该能力没有可执行入口。可加入真实前置、撤销排除，或明确排除此目标。'});
  }
  return { steps, options, issues, complete: issues.length === 0 && edges.every(edge=>steps.some(step=>step.edgeId===edge.id)) };
}

/** Shared exact-restore/inspection scope check; no historical mutation. */
export function isExecutionScopeValid(route:(SelectedRoute & {valid:boolean})|undefined,nodeIds:readonly string[],facts:readonly CapabilityRelation[]):boolean {
  return Boolean(route?.valid && route.selectedNodeIds.every(id=>nodeIds.includes(id)) && route.prerequisiteEdges.every(edge=>facts.some(fact=>fact.relation==='prerequisite'&&fact.id===edge.id&&fact.source===edge.source&&fact.target===edge.target&&fact.strength===edge.strength)));
}

/** Validate immutable adopted references without ranking or substituting alternatives. */
export function inspectRouteExecution(route: SelectedRoute & { executionSteps?: RouteExecutionStep[] }, facts: readonly CapabilityRelation[], options: readonly RouteActionOption[], acquiredNodeIds: readonly string[] = route.currentKnowledgeIds): RouteExecutionPlan {
  if (route.executionSteps === undefined) return { steps: [], options: [...options], complete: false, issues: [{ kind:'action_required', reason: '历史路线尚未选择行动，请进入项目能力模型调整并采用路线。' }] };
  const issues: RouteExecutionIssue[] = [];
  const members = new Set(route.selectedNodeIds);
  const seen = new Set<string>();
  const pairs = new Set<string>();
  const expected = new Set(acquiredNodeIds);
  const assignments=new Set<string>();
  route.executionSteps.forEach((step, index) => {
    const fact = facts.find(edge => edge.id === step.edgeId && edge.source === step.sourceNodeId && edge.target === step.targetNodeId);
    const pair=JSON.stringify([step.edgeId,step.actionId]);
    const interleaved=seen.has(step.edgeId)&&route.executionSteps![index-1]?.edgeId!==step.edgeId;
    if (!fact || !members.has(step.sourceNodeId) || !members.has(step.targetNodeId) || pairs.has(pair) || interleaved || step.order !== index) issues.push({ kind:'edge_not_in_route', ...step, reason: '正式路线关系或顺序已失效，需要调整路线。' });
    seen.add(step.edgeId); pairs.add(pair);
    const option = options.find(option => option.edgeId === step.edgeId && option.actionId === step.actionId && option.planningAvailable);
    if(option?.assignmentId){if(assignments.has(option.assignmentId))issues.push({kind:'action_unavailable',...step,reason:'同一任务不得因跨关系绑定重复执行。'});assignments.add(option.assignmentId);}
    if (!option) issues.push({ kind:'action_unavailable', ...step, reason: '当前正式路线中的行动已不可用，需要调整路线。' });

  });
  for (const edge of facts) if (edge.relation==='prerequisite'&&edge.strength === 'hard' && members.has(edge.source)&&members.has(edge.target)&&!seen.has(edge.id)) issues.push({ kind:'hard_edge_required', edgeId: edge.id, reason: '正式路线缺少必要前置的行动选择。' });
  // Inspection checks hypothetical source/Action dependency reachability, independent
  // of cross-Edge display order; invalid references remain explicit, never replaced.
  const pending = [...route.executionSteps];
  const plannedEdges = new Set<string>();
  while (pending.length) {
    const index = pending.findIndex(step => expected.has(step.sourceNodeId) && (options.find(option=>option.edgeId===step.edgeId && option.actionId===step.actionId)?.requiredCapabilityIds ?? []).every(id=>expected.has(id)));
    if(index < 0) break;
    const [step] = pending.splice(index,1);
    if(!pending.some(other=>other.edgeId===step.edgeId)) plannedEdges.add(step.edgeId);
    for(const id of routeReachableNodes(route.executionSteps,facts,plannedEdges,acquiredNodeIds)) expected.add(id);
  }
  for(const step of pending) issues.push({kind:!expected.has(step.sourceNodeId)?'source_unreachable':'required_capability_missing',...step,reason:'正式路线的起点或行动所需能力没有可达路径，需要调整路线。'});
  for(const id of route.effectiveTargetNodeIds)if(!expected.has(id))issues.push({kind:'target_unreachable',nodeId:id,targetNodeId:id,reason:'历史目标在当前条件下没有形成可执行路径，请重新规划。'});
  return { steps: route.executionSteps, options: [...options], complete: !issues.length, issues };
}

/** Owned execution records provide progress, independent of Result quality and UKS. */
export type ExecutionRunReference = {user_id:string;course_id:string;edge_id:string;action_id:string;status:string;execution_version?:number};
/** Fixed point over selected factual groups; order never contributes dependency. */
function routeReachableNodes(steps: readonly RouteExecutionStep[], facts: readonly CapabilityRelation[], performed: ReadonlySet<string>, acquired: readonly string[], selectedFacts?: readonly CapabilityRelation[], selectedPrerequisiteEdges: readonly RoutePrerequisite[] = []) {
  const reachable = new Set(acquired);
  const groups = [...new Map(steps.map(step=>[step.edgeId,step])).values()].filter(step=>facts.some(edge=>edge.id===step.edgeId && edge.source===step.sourceNodeId && edge.target===step.targetNodeId));
  const incoming = selectedFacts ?? groups.flatMap(step=>facts.filter(edge=>edge.id===step.edgeId));
  let changed=true;
  while(changed) {
    changed=false;
    for(const step of groups) {
      if(reachable.has(step.targetNodeId) || !performed.has(step.edgeId) || !reachable.has(step.sourceNodeId)) continue;
      const hard=[...incoming.filter(edge=>edge.target===step.targetNodeId && edge.relation==='prerequisite' && edge.strength==='hard'),...selectedPrerequisiteEdges.filter(edge=>edge.target===step.targetNodeId && edge.strength==='hard' && steps.some(selected=>selected.edgeId===edge.id))];
      if(hard.some(edge=>!performed.has(edge.id) || !reachable.has(edge.source) || !facts.some(fact=>fact.id===edge.id && fact.source===edge.source && fact.target===edge.target && fact.relation==='prerequisite' && fact.strength==='hard'))) continue;
      reachable.add(step.targetNodeId); changed=true;
    }
  }
  return [...reachable].sort();
}

export function routeExecutionProgress(input:{userId:string;courseId:string;steps:readonly RouteExecutionStep[];runs:readonly ExecutionRunReference[];acquiredNodeIds:readonly string[];facts:readonly CapabilityRelation[];selectedPrerequisiteEdges?:readonly RoutePrerequisite[];options?:readonly RouteActionOption[]}) {
  const owned=input.runs.filter(run=>run.user_id===input.userId && run.course_id===input.courseId && run.status==='completed');
  const completed=input.steps.map(step=>owned.some(run=>run.edge_id===step.edgeId && run.action_id===step.actionId));
  const acquired=new Set(input.acquiredNodeIds);
  const satisfied=input.steps.map((step,index)=>!completed[index] && acquired.has(step.targetNodeId));
  const completedEdgeIds=[...new Set(input.steps.map(step=>step.edgeId))].filter(id=>input.steps.every((step,index)=>step.edgeId!==id || completed[index]));
  const reachableNodeIds=routeReachableNodes(input.steps,input.facts,new Set(completedEdgeIds),input.acquiredNodeIds,undefined,input.selectedPrerequisiteEdges);
  const reachable=new Set(reachableNodeIds);
  const first=new Set<string>();
  const availableStepIndexes:number[]=[];
  input.steps.forEach((step,index)=>{
    if(completed[index] || first.has(step.edgeId)) return;
    first.add(step.edgeId);
    const factValid=input.facts.some(edge=>edge.id===step.edgeId && edge.source===step.sourceNodeId && edge.target===step.targetNodeId);
    const option=input.options?.find(option=>option.edgeId===step.edgeId && option.actionId===step.actionId);
    if(factValid && reachable.has(step.sourceNodeId) && (!input.options || option?.planningAvailable && (option.requiredCapabilityIds??[]).every(id=>reachable.has(id)))) availableStepIndexes.push(index);
  });
  availableStepIndexes.sort((a,b)=>input.steps[a].order-input.steps[b].order);
  const recommendedStepIndex=availableStepIndexes.find(index=>!satisfied[index]);
  return {completed,satisfied,completedEdgeIds,reachableNodeIds,availableStepIndexes,recommendedStepIndex};
}
