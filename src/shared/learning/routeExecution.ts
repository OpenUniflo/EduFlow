import type { CapabilityRelation, SelectedRoute, RoutePrerequisite } from './routePlanning.js';
import { routeRelations } from './routePresentation.js';

/** Absent scope is the immutable historical Edge encoding. */
export type CapabilityActionScope = { scope: 'node'; nodeId: string; edgeId?: never; sourceNodeId?: never; targetNodeId?: never }
  | { scope?: 'edge'; edgeId: string; nodeId?: never };
export type RouteActionChoice = CapabilityActionScope & { actionId: string };
export type RouteExecutionStep = (Extract<CapabilityActionScope, {scope:'node'}> & {actionId:string;order:number})
  | {scope?:'edge';edgeId:string;nodeId?:never;actionId:string;sourceNodeId:string;targetNodeId:string;order:number};
export const isNodeScope = (value: CapabilityActionScope): value is Extract<CapabilityActionScope,{scope:'node'}> => value.scope === 'node';
export const actionScopeKey = (value: CapabilityActionScope): string => JSON.stringify(isNodeScope(value) ? ['node',value.nodeId] : ['edge',value.edgeId]);
export const sameActionScope = (a: CapabilityActionScope,b: CapabilityActionScope): boolean => actionScopeKey(a) === actionScopeKey(b);
export const executionTarget = (step: RouteExecutionStep): string => isNodeScope(step) ? step.nodeId : step.targetNodeId;
export const executionEdgeIds = (steps: readonly CapabilityActionScope[]): string[] => [...new Set(steps.flatMap(step=>isNodeScope(step)?[]:[step.edgeId]))];
export const actionChoice = (step: RouteActionChoice): RouteActionChoice => isNodeScope(step) ? {scope:'node',nodeId:step.nodeId,actionId:step.actionId} : {scope:'edge',edgeId:step.edgeId,actionId:step.actionId};
/** Roots use active visible factual inputs, never selected-Edge absence alone. */
export const isRouteNodeRoot = (nodeId:string, route: SelectedRoute, facts:readonly CapabilityRelation[]): boolean => route.selectedNodeIds.includes(nodeId) && !facts.some(edge=>edge.target===nodeId);
export type RouteActionOption = RouteActionChoice & {
  title: string; type: 'micro_learning' | 'practice_task'; estimatedMinutes: number;
  assignmentId?: string; weight: number; planningAvailable: boolean; availableNow: boolean; reasons: string[]; requiredCapabilityIds?: string[];
};
export function compareRouteActionOptions(a: RouteActionOption,b: RouteActionOption):number {
  return actionScopeKey(a).localeCompare(actionScopeKey(b)) || Number(b.planningAvailable)-Number(a.planningAvailable) || Number(b.availableNow)-Number(a.availableNow) || a.weight-b.weight || a.actionId.localeCompare(b.actionId);
}
export type RouteExecutionIssueKind = 'action_required' | 'action_unavailable' | 'source_unreachable' | 'required_capability_missing' | 'hard_edge_required' | 'target_unreachable' | 'edge_not_in_route' | 'support_edge_required' | 'node_not_root' | 'floating_node';
export type RouteExecutionIssue = {kind:RouteExecutionIssueKind;scope?:'node'|'edge';edgeId?:string;actionId?:string;nodeId?:string;sourceNodeId?:string;targetNodeId?:string;requiredNodeIds?:string[];candidateEdgeIds?:string[];reason:string};
export type RouteExecutionPlan = {steps:RouteExecutionStep[];options:RouteActionOption[];issues:RouteExecutionIssue[];complete:boolean};
export function executionRelations(route: SelectedRoute & {executionSteps?:RouteExecutionStep[]},facts:readonly CapabilityRelation[]) {
  const relations=routeRelations(route,facts);
  return route.executionSteps===undefined ? relations : relations.filter(edge=>route.executionSteps!.some(step=>!isNodeScope(step) && step.edgeId===edge.id));
}
const findOption=(options:readonly RouteActionOption[],choice:RouteActionChoice)=>options.find(option=>sameActionScope(option,choice) && option.actionId===choice.actionId);

/** Fixed point over selected factual scope groups; display order is never a gate. */
function routeReachableNodes(steps:readonly RouteExecutionStep[],facts:readonly CapabilityRelation[],performed:ReadonlySet<string>,acquired:readonly string[],selectedFacts?:readonly CapabilityRelation[],selectedPrerequisiteEdges:readonly RoutePrerequisite[]=[],selectedNodeIds?:readonly string[]) {
  const reachable=new Set(acquired);
  const groups=[...new Map(steps.map(step=>[actionScopeKey(step),step])).values()];
  const edges=groups.filter((step):step is Exclude<RouteExecutionStep,{scope:'node'}>=>!isNodeScope(step) && facts.some(edge=>edge.id===step.edgeId && edge.source===step.sourceNodeId && edge.target===step.targetNodeId));
  const members=new Set(selectedNodeIds??steps.flatMap(step=>isNodeScope(step)?[step.nodeId]:[step.sourceNodeId,step.targetNodeId]));
  const incoming=selectedFacts ?? facts.filter(edge=>members.has(edge.source)&&members.has(edge.target));
  for(const step of groups) if(isNodeScope(step) && !facts.some(edge=>edge.target===step.nodeId) && performed.has(actionScopeKey(step))) reachable.add(step.nodeId);
  let changed=true;
  while(changed) {
    changed=false;
    for(const step of edges) {
      if(reachable.has(step.targetNodeId) || !performed.has(actionScopeKey(step)) || !reachable.has(step.sourceNodeId)) continue;
      const hard=[...incoming.filter(edge=>edge.target===step.targetNodeId && edge.relation==='prerequisite' && edge.strength==='hard'),...selectedPrerequisiteEdges.filter(edge=>edge.target===step.targetNodeId && edge.strength==='hard' && steps.some(selected=>!isNodeScope(selected)&&selected.edgeId===edge.id))];
      if(hard.some(edge=>!performed.has(actionScopeKey({edgeId:edge.id})) || !reachable.has(edge.source) || !facts.some(fact=>fact.id===edge.id && fact.source===edge.source && fact.target===edge.target && fact.relation==='prerequisite' && fact.strength==='hard'))) continue;
      reachable.add(step.targetNodeId);changed=true;
    }
  }
  return [...reachable].sort();
}
function floatingIssues(route:SelectedRoute,edges:readonly CapabilityRelation[]):RouteExecutionIssue[] {
  const connected=new Set(route.effectiveTargetNodeIds),queue=[...connected];
  const incoming=new Map<string,string[]>();
  for(const edge of edges)incoming.set(edge.target,[...(incoming.get(edge.target)??[]),edge.source]);
  for(let i=0;i<queue.length;i++)for(const source of incoming.get(queue[i])??[])if(!connected.has(source)){connected.add(source);queue.push(source);}
  return route.selectedNodeIds.filter(id=>!connected.has(id)).map(nodeId=>({kind:'floating_node',nodeId,reason:'正式路线能力没有参与通向目标的已选真实路径。请选择真实关系或撤销加入。'}));
}
export function planRouteExecution(input:{route:SelectedRoute;facts:readonly CapabilityRelation[];options:readonly RouteActionOption[];choices?:readonly RouteActionChoice[];selectedEdgeIds?:readonly string[];retainedEdgeIds?:readonly string[];acquiredNodeIds?:readonly string[];excludedNodeIds?:readonly string[]}):RouteExecutionPlan {
  const allEdges=routeRelations(input.route,input.facts),issues:RouteExecutionIssue[]=[];
  const selected=new Set(input.selectedEdgeIds ?? (input.retainedEdgeIds??[]).filter(id=>allEdges.some(edge=>edge.id===id)));
  for(const id of selected)if(!allEdges.some(edge=>edge.id===id))issues.push({kind:'edge_not_in_route',edgeId:id,reason:'这条关系不属于预览路线。'});
  for(const edge of allEdges.filter(edge=>edge.relation==='prerequisite' && edge.strength==='hard')) {
    if(input.selectedEdgeIds && !selected.has(edge.id))issues.push({kind:'hard_edge_required',edgeId:edge.id,nodeId:edge.target,reason:'必要前置关系不能从路线中省略。'});
    selected.add(edge.id);
  }
  const edges=allEdges.filter(edge=>selected.has(edge.id));
  const rank=new Map(input.route.orderedNodeIds.map((id,order)=>[id,order]));
  edges.sort((a,b)=>rank.get(a.target)!-rank.get(b.target)! || rank.get(a.source)!-rank.get(b.source)! || a.id.localeCompare(b.id));
  const acquired=input.acquiredNodeIds??input.route.currentKnowledgeIds;
  const nodeScopes=input.route.orderedNodeIds.filter(id=>isRouteNodeRoot(id,input.route,input.facts) && (!acquired.includes(id) || input.choices?.some(choice=>isNodeScope(choice)&&choice.nodeId===id)));
  const scopes:CapabilityActionScope[]=[...nodeScopes.map(nodeId=>({scope:'node' as const,nodeId})),...edges.map(edge=>({scope:'edge' as const,edgeId:edge.id}))];
  const choices=new Map<string,string[]>(),pairs=new Set<string>();
  for(const choice of input.choices??[]) {
    const key=actionScopeKey(choice),pair=JSON.stringify([key,choice.actionId]);
    if(pairs.has(pair)){issues.push({kind:'action_required',...choice,reason:'同一能力或关系的同一行动不能重复选择。'});continue;}
    pairs.add(pair);choices.set(key,[...(choices.get(key)??[]),choice.actionId]);
    if(isNodeScope(choice) && !isRouteNodeRoot(choice.nodeId,input.route,input.facts))issues.push({kind:'node_not_root',...choice,reason:'节点行动只能用于真实路线根，不能绕过中间能力的前置关系。'});
    else if(!scopes.some(scope=>sameActionScope(scope,choice)))issues.push({kind:'edge_not_in_route',...choice,reason:'所选行动不属于当前正式路线结构。'});
  }
  const options=input.options.filter(option=>isNodeScope(option)?isRouteNodeRoot(option.nodeId,input.route,input.facts):allEdges.some(edge=>edge.id===option.edgeId)).sort(compareRouteActionOptions);
  const pending:Array<{scope:CapabilityActionScope;options:RouteActionOption[]}>=[],assignments=new Set<string>();
  for(const scope of scopes) {
    const requested=choices.get(actionScopeKey(scope));
    const candidates=requested===undefined && input.choices===undefined ? options.filter(option=>sameActionScope(option,scope)&&option.planningAvailable).slice(0,1) : (requested??[]).map(id=>findOption(options,{...scope,actionId:id}));
    if(!candidates.length)issues.push({kind:'action_required',...scope,reason:'这项能力或关系尚无已选合法执行资源。'});
    const chosen:RouteActionOption[]=[];
    candidates.forEach((option,index)=>{
      if(!option?.planningAvailable){issues.push({kind:'action_unavailable',...scope,actionId:requested?.[index],reason:'所选行动或执行资源已不可用，请明确选择其他方案。'});return;}
      if(option.assignmentId && assignments.has(option.assignmentId)){issues.push({kind:'action_unavailable',...scope,actionId:option.actionId,reason:'同一成果任务不可重复纳入路线。'});return;}
      if(option.assignmentId)assignments.add(option.assignmentId);chosen.push(option);
    });
    if(chosen.length)pending.push({scope,options:chosen});
  }
  issues.push(...floatingIssues(input.route,edges));
  const steps:RouteExecutionStep[]=[],expected=new Set(acquired),performed=new Set<string>();
  while(pending.length) {
    const index=pending.findIndex(({scope,options})=>(isNodeScope(scope)||expected.has(edges.find(edge=>edge.id===scope.edgeId)!.source)) && options.every(option=>(option.requiredCapabilityIds??[]).every(id=>expected.has(id))));
    if(index<0) {
      for(const {scope,options} of pending)for(const option of options) {
        const edge=isNodeScope(scope)?undefined:edges.find(edge=>edge.id===scope.edgeId)!;
        if(edge && !expected.has(edge.source))issues.push({kind:'source_unreachable',...scope,actionId:option.actionId,nodeId:edge.source,sourceNodeId:edge.source,targetNodeId:edge.target,reason:'起点尚未具备，也没有可到达的前序步骤。'});
        const missing=[...new Set(option.requiredCapabilityIds??[])].filter(id=>!expected.has(id));
        if(missing.length)issues.push({kind:'required_capability_missing',...scope,actionId:option.actionId,requiredNodeIds:missing,reason:'行动所需的必要能力没有形成路径。'});
      }
      break;
    }
    const [{scope,options:chosen}]=pending.splice(index,1);
    const edge=isNodeScope(scope)?undefined:edges.find(edge=>edge.id===scope.edgeId)!;
    for(const option of chosen)steps.push(isNodeScope(scope)?{scope:'node',nodeId:scope.nodeId,actionId:option.actionId,order:steps.length}:{scope:'edge',edgeId:edge!.id,sourceNodeId:edge!.source,targetNodeId:edge!.target,actionId:option.actionId,order:steps.length});
    performed.add(actionScopeKey(scope));
    for(const id of routeReachableNodes(steps,input.facts,performed,acquired,edges))expected.add(id);
  }
  const missingNodes=new Set([...input.route.effectiveTargetNodeIds,...issues.filter(issue=>issue.kind==='source_unreachable').map(issue=>issue.nodeId!),...issues.flatMap(issue=>issue.requiredNodeIds??[])]);
  for(const id of missingNodes)if(!expected.has(id)) {
    const candidates=input.facts.filter(edge=>edge.target===id && !selected.has(edge.id) && !input.excludedNodeIds?.includes(edge.source) && !input.excludedNodeIds?.includes(edge.target)).sort((a,b)=>Number(expected.has(b.source))-Number(expected.has(a.source))||a.id.localeCompare(b.id));
    issues.push(candidates.length?{kind:'support_edge_required',nodeId:id,targetNodeId:id,candidateEdgeIds:candidates.map(edge=>edge.id),reason:'需要选择真实支撑路径；推荐前置和支撑关系不会自动加入。'}:{kind:'target_unreachable',nodeId:id,targetNodeId:id,reason:'该能力没有可执行入口。请配置节点行动或选择真实支撑路径。'});
  }
  return {steps,options,issues,complete:issues.length===0 && scopes.every(scope=>steps.some(step=>sameActionScope(step,scope)))};
}
export function isExecutionScopeValid(route:(SelectedRoute & {valid:boolean})|undefined,nodeIds:readonly string[],facts:readonly CapabilityRelation[]):boolean {
  return Boolean(route?.valid && route.selectedNodeIds.every(id=>nodeIds.includes(id)) && route.prerequisiteEdges.every(edge=>facts.some(fact=>fact.relation==='prerequisite'&&fact.id===edge.id&&fact.source===edge.source&&fact.target===edge.target&&fact.strength===edge.strength)));
}
/** Revalidate exact references and local order, never rewrite historical snapshots. */
export function inspectRouteExecution(route:SelectedRoute & {executionSteps?:RouteExecutionStep[]},facts:readonly CapabilityRelation[],options:readonly RouteActionOption[],acquiredNodeIds:readonly string[]=route.currentKnowledgeIds):RouteExecutionPlan {
  if(route.executionSteps===undefined)return {steps:[],options:[...options],complete:false,issues:[{kind:'action_required',reason:'历史路线尚未选择行动，请进入项目能力模型调整并采用路线。'}]};
  const steps=route.executionSteps,issues:RouteExecutionIssue[]=[],members=new Set(route.selectedNodeIds),seen=new Set<string>(),pairs=new Set<string>(),assignments=new Set<string>();
  steps.forEach((step,index)=>{
    const key=actionScopeKey(step),pair=JSON.stringify([key,step.actionId]);
    const valid=isNodeScope(step)?isRouteNodeRoot(step.nodeId,route,facts):members.has(step.sourceNodeId)&&members.has(step.targetNodeId)&&facts.some(edge=>edge.id===step.edgeId&&edge.source===step.sourceNodeId&&edge.target===step.targetNodeId);
    if(!valid || pairs.has(pair) || (seen.has(key)&&index>0&&!sameActionScope(steps[index-1],step)) || step.order!==index)issues.push({kind:isNodeScope(step)?'node_not_root':'edge_not_in_route',...step,reason:'正式路线能力、关系或局部顺序已失效，需要调整路线。'});
    seen.add(key);pairs.add(pair);
    const option=findOption(options,step);
    if(!option?.planningAvailable)issues.push({kind:'action_unavailable',...step,reason:'当前正式路线中的行动已不可用，需要调整路线。'});
    if(option?.assignmentId){if(assignments.has(option.assignmentId))issues.push({kind:'action_unavailable',...step,reason:'同一任务不得跨执行范围重复选择。'});assignments.add(option.assignmentId);}
  });
  const selectedEdges=facts.filter(edge=>seen.has(actionScopeKey({edgeId:edge.id})));
  issues.push(...floatingIssues(route,selectedEdges));
  for(const edge of facts)if(edge.relation==='prerequisite'&&edge.strength==='hard'&&members.has(edge.source)&&members.has(edge.target)&&!seen.has(actionScopeKey({edgeId:edge.id})))issues.push({kind:'hard_edge_required',edgeId:edge.id,reason:'正式路线缺少必要前置的行动选择。'});
  const pending=[...steps],performed=new Set<string>(),expected=new Set(acquiredNodeIds);
  while(pending.length) {
    const index=pending.findIndex((step,i)=>!pending.slice(0,i).some(previous=>sameActionScope(previous,step)) && (isNodeScope(step)||expected.has(step.sourceNodeId)) && (findOption(options,step)?.requiredCapabilityIds??[]).every(id=>expected.has(id)));
    if(index<0)break;
    const [step]=pending.splice(index,1);
    if(!pending.some(other=>sameActionScope(other,step)))performed.add(actionScopeKey(step));
    for(const id of routeReachableNodes(steps,facts,performed,acquiredNodeIds,undefined,route.prerequisiteEdges,route.selectedNodeIds))expected.add(id);
  }
  for(const step of pending)issues.push({kind:!isNodeScope(step)&&!expected.has(step.sourceNodeId)?'source_unreachable':'required_capability_missing',...step,reason:'正式路线的起点或行动所需能力没有可达路径，需要调整路线。'});
  for(const id of route.effectiveTargetNodeIds)if(!expected.has(id))issues.push({kind:'target_unreachable',nodeId:id,reason:'历史目标在当前条件下没有形成可执行路径，请重新规划。'});
  return {steps,options:[...options],complete:issues.length===0,issues};
}
export type ExecutionRunReference={user_id:string;course_id:string;edge_id:string|null;node_id?:string|null;action_id:string;status:string;execution_version?:number};
export const runMatchesStep=(run:Pick<ExecutionRunReference,'edge_id'|'node_id'|'action_id'>,step:RouteActionChoice)=>run.action_id===step.actionId && (isNodeScope(step)?run.node_id===step.nodeId && run.edge_id==null:run.edge_id===step.edgeId && run.node_id==null);
export function routeExecutionProgress(input:{userId:string;courseId:string;steps:readonly RouteExecutionStep[];runs:readonly ExecutionRunReference[];acquiredNodeIds:readonly string[];facts:readonly CapabilityRelation[];selectedNodeIds?:readonly string[];selectedPrerequisiteEdges?:readonly RoutePrerequisite[];options?:readonly RouteActionOption[]}) {
  const owned=input.runs.filter(run=>run.user_id===input.userId&&run.course_id===input.courseId&&run.status==='completed');
  const completed=input.steps.map(step=>owned.some(run=>runMatchesStep(run,step))),acquired=new Set(input.acquiredNodeIds);
  const satisfied=input.steps.map((step,index)=>!completed[index]&&acquired.has(executionTarget(step)));
  const performed=new Set(input.steps.map(actionScopeKey).filter(key=>input.steps.every((step,index)=>actionScopeKey(step)!==key||completed[index])));
  const completedEdgeIds=[...new Set(input.steps.filter(step=>!isNodeScope(step)&&performed.has(actionScopeKey(step))).map(step=>step.edgeId!))];
  const completedNodeIds=[...new Set(input.steps.filter(step=>isNodeScope(step)&&performed.has(actionScopeKey(step))).map(step=>step.nodeId!))];
  const reachableNodeIds=routeReachableNodes(input.steps,input.facts,performed,input.acquiredNodeIds,undefined,input.selectedPrerequisiteEdges,input.selectedNodeIds),reachable=new Set(reachableNodeIds),first=new Set<string>(),availableStepIndexes:number[]=[];
  input.steps.forEach((step,index)=>{
    const key=actionScopeKey(step);if(completed[index]||first.has(key))return;first.add(key);
    const valid=isNodeScope(step)?!acquired.has(step.nodeId)&&!input.facts.some(edge=>edge.target===step.nodeId):input.facts.some(edge=>edge.id===step.edgeId&&edge.source===step.sourceNodeId&&edge.target===step.targetNodeId)&&reachable.has(step.sourceNodeId);
    const option=input.options?findOption(input.options,step):undefined;
    if(valid&&(!input.options||option?.planningAvailable&&(option.requiredCapabilityIds??[]).every(id=>reachable.has(id))))availableStepIndexes.push(index);
  });
  availableStepIndexes.sort((a,b)=>input.steps[a].order-input.steps[b].order);
  const recommendedStepIndex=availableStepIndexes.find(index=>!satisfied[index]);
  return {completed,satisfied,completedEdgeIds,completedNodeIds,reachableNodeIds,availableStepIndexes,recommendedStepIndex};
}
