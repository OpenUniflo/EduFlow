import type { CapabilityRelation, SelectedRoute } from './routePlanning.js';
import { routeRelations } from './routePresentation.js';

export type RouteActionChoice = { edgeId: string; actionId: string };
export type RouteExecutionStep = RouteActionChoice & { sourceNodeId: string; targetNodeId: string; order: number };
/** Transient planner summaries; versions persist references, never these contents. */
export type RouteActionOption = RouteActionChoice & {
  title: string; type: 'micro_learning' | 'practice_task'; estimatedMinutes: number;
  weight: number; planningAvailable: boolean; availableNow: boolean; reasons: string[]; requiredCapabilityIds?: string[];
};
export type RouteExecutionIssue = { edgeId: string; actionId?: string; reason: string };
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
  choices?: readonly RouteActionChoice[]; selectedEdgeIds?: readonly string[]; acquiredNodeIds?: readonly string[];
}): RouteExecutionPlan {
  const allEdges = routeRelations(input.route, input.facts);
  const issues: RouteExecutionIssue[] = [];
  const selected = new Set(input.selectedEdgeIds ?? allEdges.map(edge => edge.id));
  for (const id of selected) if (!allEdges.some(edge => edge.id === id)) issues.push({ edgeId: id, reason: '这条关系不属于预览路线。' });
  for (const edge of allEdges) if (edge.relation === 'prerequisite' && edge.strength === 'hard' && !selected.has(edge.id)) issues.push({ edgeId: edge.id, reason: '必要前置关系不能从路线中省略。' });
  const edges = allEdges.filter(edge => selected.has(edge.id));
  const rank = new Map(input.route.orderedNodeIds.map((id, order) => [id, order]));
  edges.sort((a,b) => rank.get(a.target)! - rank.get(b.target)! || rank.get(a.source)! - rank.get(b.source)! || a.id.localeCompare(b.id));
  const choices = new Map<string,string>();
  for (const choice of input.choices ?? []) {
    if (choices.has(choice.edgeId)) issues.push({ ...choice, reason: '每条关系只能选择一个行动。' });
    choices.set(choice.edgeId, choice.actionId);
  }
  const options = input.options.filter(option => allEdges.some(edge => edge.id === option.edgeId)).sort((a,b) =>
    a.edgeId.localeCompare(b.edgeId) || Number(b.planningAvailable)-Number(a.planningAvailable) || Number(b.availableNow)-Number(a.availableNow) || a.weight-b.weight || a.actionId.localeCompare(b.actionId));
  const pending: Array<{edge:CapabilityRelation;option:RouteActionOption}> = [];
  edges.forEach(edge => {
    const requested = choices.get(edge.id);
    const option = requested === undefined ? options.find(option => option.edgeId === edge.id && option.planningAvailable)
      : options.find(option => option.edgeId === edge.id && option.actionId === requested);
    if (!option?.planningAvailable) {
      issues.push({ edgeId: edge.id, actionId: requested, reason: requested ? '所选行动或执行资源已不可用，请明确选择其他方案。' : '这条关系尚无合法执行资源。' });
      return;
    }
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
    if(index<0) { for(const {edge,option} of pending) issues.push({edgeId:edge.id,actionId:option.actionId,reason:'起点或必要能力没有已有状态或可到达的前序步骤，无法形成执行顺序。'});break; }
    const [{edge,option}]=pending.splice(index,1);
    steps.push({edgeId:edge.id,actionId:option.actionId,sourceNodeId:edge.source,targetNodeId:edge.target,order:steps.length});
    expected.add(edge.target);
  }
  for(const id of input.route.effectiveTargetNodeIds) if(!expected.has(id)) issues.push({edgeId:'',reason:`目标 ${id} 尚未有可执行的能力形成路线。`});
  return { steps, options, issues, complete: issues.length === 0 && steps.length === edges.length };
}

/** Validate immutable adopted references without ranking or substituting alternatives. */
export function inspectRouteExecution(route: SelectedRoute & { executionSteps?: RouteExecutionStep[] }, facts: readonly CapabilityRelation[], options: readonly RouteActionOption[], acquiredNodeIds: readonly string[] = route.currentKnowledgeIds): RouteExecutionPlan {
  if (route.executionSteps === undefined) return { steps: [], options: [...options], complete: false, issues: [{ edgeId: '', reason: '历史路线尚未选择行动，请进入项目能力模型调整并采用路线。' }] };
  const issues: RouteExecutionIssue[] = [];
  const members = new Set(route.selectedNodeIds);
  const seen = new Set<string>();
  const expected = new Set(acquiredNodeIds);
  route.executionSteps.forEach((step, index) => {
    const fact = facts.find(edge => edge.id === step.edgeId && edge.source === step.sourceNodeId && edge.target === step.targetNodeId);
    if (!fact || !members.has(step.sourceNodeId) || !members.has(step.targetNodeId) || seen.has(step.edgeId) || step.order !== index) issues.push({ ...step, reason: '正式路线关系或顺序已失效，需要调整路线。' });
    seen.add(step.edgeId);
    const option = options.find(option => option.edgeId === step.edgeId && option.actionId === step.actionId && option.planningAvailable);
    if (!option) issues.push({ ...step, reason: '当前正式路线中的行动已不可用，需要调整路线。' });
    const reachable = expected.has(step.sourceNodeId) && (option?.requiredCapabilityIds ?? []).every(id=>expected.has(id))
      && (expected.has(step.targetNodeId) || facts.filter(edge=>edge.relation==='prerequisite' && edge.strength==='hard' && edge.target===step.targetNodeId).every(edge=>expected.has(edge.source)));
    if (!reachable) issues.push({...step,reason:'当前真实关系或必要能力已变化，正式路线无法按原顺序到达，需要调整路线。'});
    else if (option && fact) expected.add(step.targetNodeId);
  });
  for (const edge of route.prerequisiteEdges) if (edge.strength === 'hard' && !seen.has(edge.id)) issues.push({ edgeId: edge.id, reason: '正式路线缺少必要前置的行动选择。' });
  return { steps: route.executionSteps, options: [...options], complete: !issues.length, issues };
}
