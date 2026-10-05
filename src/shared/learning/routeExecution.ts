import type { CapabilityRelation, SelectedRoute } from './routePlanning.js';
import { routeRelations } from './routePresentation.js';

export type RouteActionChoice = { edgeId: string; actionId: string };
export type RouteExecutionStep = RouteActionChoice & { sourceNodeId: string; targetNodeId: string; order: number };
/** Transient planner summaries; versions persist references, never these contents. */
export type RouteActionOption = RouteActionChoice & {
  title: string; type: 'micro_learning' | 'practice_task'; estimatedMinutes: number;
  assignmentId?: string; weight: number; planningAvailable: boolean; availableNow: boolean; reasons: string[]; requiredCapabilityIds?: string[];
};
export type RouteExecutionIssueKind = 'action_required' | 'action_unavailable' | 'source_unreachable' | 'required_capability_missing' | 'hard_edge_required' | 'target_unreachable' | 'edge_not_in_route' | 'support_edge_required';
export type RouteExecutionIssue = {
  kind: RouteExecutionIssueKind; edgeId?: string; actionId?: string; nodeId?: string;
  sourceNodeId?: string; targetNodeId?: string; requiredNodeIds?: string[]; candidateEdgeIds?: string[]; reason: string;
};
export type RouteExecutionPlan = {
  steps: RouteExecutionStep[]; options: RouteActionOption[];
  issues: RouteExecutionIssue[]; complete: boolean;
};

/** A sequential Step connector is an execution order, never a KnowledgeEdge. */
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
  const choices = new Map<string,string>();
  for (const choice of input.choices ?? []) {
    if (choices.has(choice.edgeId)) issues.push({ kind:'action_required', ...choice, reason: '每条关系只能选择一个行动。' });
    choices.set(choice.edgeId, choice.actionId);
  }
  const options = input.options.filter(option => allEdges.some(edge => edge.id === option.edgeId)).sort((a,b) =>
    a.edgeId.localeCompare(b.edgeId) || Number(b.planningAvailable)-Number(a.planningAvailable) || Number(b.availableNow)-Number(a.availableNow) || a.weight-b.weight || a.actionId.localeCompare(b.actionId));
  const pending: Array<{edge:CapabilityRelation;option:RouteActionOption}> = [];
  const assignments = new Set<string>();
  edges.forEach(edge => {
    const requested = choices.get(edge.id);
    const option = requested === undefined ? options.find(option => option.edgeId === edge.id && option.planningAvailable)
      : options.find(option => option.edgeId === edge.id && option.actionId === requested);
    if (!option?.planningAvailable) {
      issues.push({ kind:requested?'action_unavailable':'action_required', edgeId: edge.id, sourceNodeId:edge.source, targetNodeId:edge.target, actionId: requested, reason: requested ? '所选行动或执行资源已不可用，请明确选择其他方案。' : '这条关系尚无合法执行资源。' });
      return;
    }
    if(option.assignmentId && assignments.has(option.assignmentId)) { issues.push({kind:'action_unavailable',edgeId:edge.id,actionId:option.actionId,reason:'同一成果任务已在其他关系执行，请改选行动或移除可选关系。'});return; }
    if(option.assignmentId)assignments.add(option.assignmentId);
    pending.push({edge,option});
  });
  const steps: RouteExecutionStep[] = [];
  const expected = new Set(input.acquiredNodeIds ?? input.route.currentKnowledgeIds);
  // Order the plan by real source/required-capability dependencies, including enables.
  // Expected capability here is planning only; execution still requires formal UKS.
  while(pending.length) {
    const index=pending.findIndex(({edge,option})=>expected.has(edge.source)
      && (option.requiredCapabilityIds??[]).every(id=>expected.has(id))
      && (expected.has(edge.target) || input.facts.filter(fact=>fact.relation==='prerequisite' && fact.strength==='hard' && fact.target===edge.target).every(fact=>expected.has(fact.source))));
    if(index<0) {
      for(const {edge,option} of pending) {
        if(!expected.has(edge.source)) issues.push({kind:'source_unreachable',edgeId:edge.id,actionId:option.actionId,nodeId:edge.source,sourceNodeId:edge.source,targetNodeId:edge.target,reason:'起点尚未具备，也没有可到达的前序步骤。'});
        const missing=[...new Set([...(option.requiredCapabilityIds??[]),...input.facts.filter(fact=>fact.relation==='prerequisite'&&fact.strength==='hard'&&fact.target===edge.target&&!expected.has(edge.target)).map(fact=>fact.source)])].filter(id=>!expected.has(id));
        if(missing.length) issues.push({kind:'required_capability_missing',edgeId:edge.id,actionId:option.actionId,nodeId:missing[0],requiredNodeIds:missing,targetNodeId:edge.target,reason:'行动所需的必要能力没有形成路径。'});
      }
      break;
    }
    const [{edge,option}]=pending.splice(index,1);
    steps.push({edgeId:edge.id,actionId:option.actionId,sourceNodeId:edge.source,targetNodeId:edge.target,order:steps.length});
    expected.add(edge.target);
  }
  const missingNodes=new Set([...input.route.effectiveTargetNodeIds,...issues.filter(issue=>issue.kind==='source_unreachable').map(issue=>issue.nodeId!),...issues.flatMap(issue=>issue.requiredNodeIds??[])]);
  for(const id of missingNodes) if(!expected.has(id)) {
    const candidates=input.facts.filter(edge=>edge.target===id && !selected.has(edge.id) && !input.excludedNodeIds?.includes(edge.source) && !input.excludedNodeIds?.includes(edge.target)).sort((a,b)=>Number(expected.has(b.source))-Number(expected.has(a.source))||a.id.localeCompare(b.id));
    issues.push(candidates.length?{kind:'support_edge_required',nodeId:id,targetNodeId:id,candidateEdgeIds:candidates.map(edge=>edge.id),reason:'需要选择真实支撑路径；新增推荐前置和支撑关系不会自动加入。'}:{kind:'target_unreachable',nodeId:id,targetNodeId:id,reason:'该能力没有可执行入口。可加入真实前置、撤销排除，或明确排除此目标。'});
  }
  return { steps, options, issues, complete: issues.length === 0 && steps.length === edges.length };
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
  const expected = new Set(acquiredNodeIds);
  const assignments=new Set<string>();
  route.executionSteps.forEach((step, index) => {
    const fact = facts.find(edge => edge.id === step.edgeId && edge.source === step.sourceNodeId && edge.target === step.targetNodeId);
    if (!fact || !members.has(step.sourceNodeId) || !members.has(step.targetNodeId) || seen.has(step.edgeId) || step.order !== index) issues.push({ kind:'edge_not_in_route', ...step, reason: '正式路线关系或顺序已失效，需要调整路线。' });
    seen.add(step.edgeId);
    const option = options.find(option => option.edgeId === step.edgeId && option.actionId === step.actionId && option.planningAvailable);
    if(option?.assignmentId){if(assignments.has(option.assignmentId))issues.push({kind:'action_unavailable',...step,reason:'同一任务不得因跨关系绑定重复执行。'});assignments.add(option.assignmentId);}
    if (!option) issues.push({ kind:'action_unavailable', ...step, reason: '当前正式路线中的行动已不可用，需要调整路线。' });
    const reachable = expected.has(step.sourceNodeId) && (option?.requiredCapabilityIds ?? []).every(id=>expected.has(id))
      && (expected.has(step.targetNodeId) || facts.filter(edge=>edge.relation==='prerequisite' && edge.strength==='hard' && edge.target===step.targetNodeId).every(edge=>expected.has(edge.source)));
    if (!reachable) issues.push({kind:!expected.has(step.sourceNodeId)?'source_unreachable':'required_capability_missing',nodeId:!expected.has(step.sourceNodeId)?step.sourceNodeId:[...(option?.requiredCapabilityIds??[]),...facts.filter(edge=>edge.relation==='prerequisite'&&edge.strength==='hard'&&edge.target===step.targetNodeId).map(edge=>edge.source)].find(id=>!expected.has(id)),...step,reason:'当前真实关系或必要能力已变化，正式路线无法按原顺序到达，需要调整路线。'});
    else if (option && fact) expected.add(step.targetNodeId);
  });
  for (const edge of facts) if (edge.relation==='prerequisite'&&edge.strength === 'hard' && members.has(edge.source)&&members.has(edge.target)&&!seen.has(edge.id)) issues.push({ kind:'hard_edge_required', edgeId: edge.id, reason: '正式路线缺少必要前置的行动选择。' });
  for(const id of route.effectiveTargetNodeIds)if(!expected.has(id))issues.push({kind:'target_unreachable',nodeId:id,targetNodeId:id,reason:'历史目标在当前条件下没有形成可执行路径，请重新规划。'});
  return { steps: route.executionSteps, options: [...options], complete: !issues.length, issues };
}
