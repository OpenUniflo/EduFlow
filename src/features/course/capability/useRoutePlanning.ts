import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiRequestError } from '@/shared/api/apiClient';
import { actionChoice, executionEdgeIds, sameActionScope, type CapabilityActionScope, type RouteActionChoice, type RouteExecutionPlan, type RouteActionOption } from '@/shared/learning/routeExecution';
import { routeDiff } from '@/shared/learning/routeDiff';
import type { RouteConstraints, RoutePlan } from '@/shared/learning/routePlanning';
import type { ExecutionRoutePlan, RoutePlanView, RouteVersion } from '@/shared/learning/routeVersion';
import { routeModelChanges } from '@/shared/learning/routeModelReconciliation';
const empty = (): RouteConstraints => ({ includeNodeIds: [], excludeNodeIds: [] });
export function useRoutePlanning(courseId: string, authenticated: boolean, knowledgeKey: string) {
  const path = `/api/learner?resource=route-plan&courseId=${encodeURIComponent(courseId)}`;
  const [view, setView] = useState<RoutePlanView | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const busy = loading || mutating;
  const draftRevision = useRef(0);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<'include' | 'exclude'>('include');
  const [draft, setDraft] = useState<RouteConstraints>(empty);
  const [baseVersionId, setBaseVersionId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExecutionRoutePlan | null>(null);
  const [proposal,setProposal] = useState<ExecutionRoutePlan | null>(null);
  const explicitChoices=useRef(false);
  const [actionChoices,setActionChoices] = useState<RouteActionChoice[]>([]);
  const [selectedEdgeIds,setSelectedEdgeIds] = useState<string[] | undefined>();
  const [scopeMode,setScopeMode] = useState<'current'|'replan'>('replan');
  const [previewState,setPreviewState]=useState<string>();
  const [stale,setStale]=useState(false);
  const [dismissPending,setDismissPending]=useState(false);
  const dismissAction=useRef<(()=>void)|undefined>(undefined); const stayAction=useRef<(()=>void)|undefined>(undefined);
  const baseline=useRef<{draft:RouteConstraints;editableDraft:RouteConstraints;choices:RouteActionChoice[];edges?:string[]}|undefined>(undefined);
  const [catalog,setCatalog]=useState<RouteActionOption[]>([]);
  useEffect(()=>{
    if(!authenticated||!editing)return;
    let live=true;
    void apiRequest<{options:RouteActionOption[]}>(`${path}&view=catalog`).then(result=>{if(live)setCatalog(result.options);}).catch(error=>{if(live)setError(error instanceof Error?error.message:'行动读取失败');});
    return ()=>{live=false;};
  },[authenticated,editing,path,knowledgeKey]);
  const [history, setHistory] = useState<RouteVersion[] | null>(null);
  const [historyActionTitles,setHistoryActionTitles]=useState<Record<string,string>>({});
  const [historyInspection,setHistoryInspection]=useState<{versionId:string;execution:RouteExecutionPlan}|null>(null);
  const [inspectingHistory,setInspectingHistory]=useState(false);
  const [historical, setHistorical] = useState<RouteVersion | null>(null);
  useEffect(()=>{
    if(!historical||!history)return;
    let live=true;setHistoryInspection(null);setInspectingHistory(true);
    void apiRequest<{versionId:string;execution:RouteExecutionPlan}>(`${path}&view=inspect&versionId=${encodeURIComponent(historical.id)}`).then(result=>{if(live)setHistoryInspection(result);}).catch(error=>{if(live)setError(error instanceof Error?error.message:'历史路线校验失败，请重新选择版本重试。');}).finally(()=>{if(live)setInspectingHistory(false);});
    return ()=>{live=false;};
  },[historical,history,path]);
  const requestGeneration = useRef(0);
  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    const result = await apiRequest<RoutePlanView>(path);
    if (generation === requestGeneration.current) setView(result);
    return result;
  }, [path]);
  useEffect(() => {
    if (!authenticated) return;
    setLoading(true); setError(''); setPreview(null);setPreviewState(undefined);setStale(true);setProposal(null); draftRevision.current++;
    let active = true;
    void load().catch(e => { if (active) setError(e instanceof Error ? e.message : '路线读取失败'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; requestGeneration.current++; };
  }, [authenticated, knowledgeKey, load]);
  const run = async (work: () => Promise<void>) => {
    setMutating(true); setError('');
    try { await work(); } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败，请重试');
      if(e instanceof ApiRequestError && ['route_preview_stale','route_version_conflict'].includes(e.code??'')){setStale(true);setError('能力或路线状态已经变化，需要重新计算路线。');}
      if (e instanceof ApiRequestError && e.code === 'route_constraints_conflict') {
        const details = e.details as { conflicts?: RoutePlan['conflicts'] } | undefined;
        if (details?.conflicts) setPreview({ valid: false, route: null, conflicts: details.conflicts });
      }
    } finally { setMutating(false); }
  };
  const post = <T,>(body: unknown) => apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) });
  const prepareDraft = (version: RouteVersion, replan = false) => {
    const choices = (version.snapshot.executionSteps ?? []).map(actionChoice);
    const edges = version.snapshot.executionSteps ? executionEdgeIds(version.snapshot.executionSteps) : undefined;
    const changes = view?.model ? routeModelChanges(view.model, version.constraints, choices, edges, version.snapshot.selectedNodeIds) : null;
    const reconciled = Boolean(changes && (changes.nodeIds.length || changes.edgeIds.length));
    return {
      draft: reconciled ? changes!.constraints : { includeNodeIds: [...version.constraints.includeNodeIds], excludeNodeIds: [...version.constraints.excludeNodeIds] },
      choices: reconciled ? changes!.choices : choices,
      edges: reconciled && edges !== undefined ? changes!.selectedEdgeIds : edges,
      scopeMode: replan || reconciled || version.snapshot.executionSteps === undefined ? 'replan' as const : 'current' as const,
    };
  };
  const beginDraft = (version: RouteVersion, replan = false) => {
    const prepared = prepareDraft(version, replan);
    draftRevision.current++;setStale(false);setPreviewState(undefined);explicitChoices.current=version.snapshot.executionSteps!==undefined;
    // The original snapshot remains the review baseline. Only the new editable
    // draft is reconciled, so stale inherited choices cannot block adjustment.
    const active = view!.activeVersion!;
    baseline.current={draft:active.constraints,editableDraft:prepareDraft(active).draft,choices:(active.snapshot.executionSteps??[]).map(actionChoice),edges:active.snapshot.executionSteps ? executionEdgeIds(active.snapshot.executionSteps) : undefined};
    setDraft(prepared.draft);setActionChoices(prepared.choices);setScopeMode(prepared.scopeMode);setSelectedEdgeIds(prepared.edges);setProposal(null);
    setBaseVersionId(active.id);setPreview(null);setEditing(true);setHistorical(null);setError('');
    return prepared;
  };
  const begin = () => {
    if (!view?.activeVersion || busy) return;
    beginDraft(view.activeVersion);
  };
  const mark = (id: string, action = tool) => {
    if (!editing || busy) return;
    draftRevision.current++;
    setPreview(null);setScopeMode('replan');
    setDraft(previous => {
      const toggle = (ids: readonly string[]) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id].sort();
      return action === 'include'
        ? { includeNodeIds: toggle(previous.includeNodeIds), excludeNodeIds: previous.excludeNodeIds.filter(value => value !== id) }
        : { includeNodeIds: previous.includeNodeIds.filter(value => value !== id), excludeNodeIds: toggle(previous.excludeNodeIds) };
    });
  };
  const refreshHistory = async () => {const result=await apiRequest<{versions:RouteVersion[];actionTitles?:Record<string,string>}>(`${path}&view=history`);setHistory(result.versions);setHistoryActionTitles(result.actionTitles??{});setHistorical(result.versions.find(version=>version.id===view?.activeVersion?.id)??result.versions[0]??null);};
  const accept = (versionId?: string) => run(async () => {
    if (versionId ? !view?.activeVersion || versionId===view.activeVersion.id : !baseVersionId || stale || !previewState || !preview?.valid || !preview.execution?.complete) return;
    await post(versionId ? { action: 'restore', versionId, baseVersionId: view!.activeVersion!.id }
      : { action: 'adopt', baseVersionId,previewState, ...draft,scopeMode, actionChoices:preview!.execution!.steps.map(actionChoice),selectedEdgeIds:executionEdgeIds(preview!.execution!.steps) });
    setEditing(false); setPreview(null); setHistorical(null);
    await load(); if (history) await refreshHistory();
  });
  const symmetric=(a:readonly string[],b:readonly string[])=>new Set([...a.filter(id=>!b.includes(id)),...b.filter(id=>!a.includes(id))]).size;
  const changeCount=baseline.current?symmetric(draft.includeNodeIds,baseline.current.draft.includeNodeIds)+symmetric(draft.excludeNodeIds,baseline.current.draft.excludeNodeIds)
    +(()=>{const diff=routeDiff({selectedNodeIds:[],executionSteps:baseline.current!.choices},{selectedNodeIds:[],executionSteps:actionChoices});return diff.addedActions.length+diff.removedActions.length+diff.reorderedEdgeIds.length+diff.reorderedNodeIds.length;})()
    +(selectedEdgeIds?symmetric(selectedEdgeIds,baseline.current.edges??[]):0)
    +(scopeMode==='replan'&&view?.model?(view.activeVersion?.snapshot.selectedNodeIds??[]).filter(id=>!view.model!.orderedNodeIds.includes(id)).length:0):0;
  const dirty=editing&&changeCount>0;
  const modelChanges=view?.model?routeModelChanges(view.model,draft,actionChoices,selectedEdgeIds,scopeMode==='current'?view.activeVersion?.snapshot.selectedNodeIds:[]):null;
  const discard=()=>{draftRevision.current++;setEditing(false);setPreview(null);setProposal(null);setPreviewState(undefined);setError('');setStale(false);};
  const requestDismiss=(action:()=>void,onKeep?:()=>void)=>{if(!dirty){action();return;}dismissAction.current=action;stayAction.current=onKeep;setDismissPending(true);};
  return {
    view, busy, error, editing, tool,dirty,changeCount,stale,modelChanges,dismissPending,requestDismiss,leave:(action:()=>void)=>requestDismiss(()=>{discard();action();}),
    reconcileModel:()=>{if(busy||!modelChanges)return;draftRevision.current++;setPreview(null);setProposal(null);setPreviewState(undefined);setScopeMode('replan');setDraft(modelChanges.constraints);setActionChoices(modelChanges.choices);setSelectedEdgeIds(modelChanges.selectedEdgeIds);explicitChoices.current=true;},
    keepEditing:()=>{setDismissPending(false);stayAction.current?.();dismissAction.current=undefined;stayAction.current=undefined;},
    discardDraft:()=>{const action=dismissAction.current;setDismissPending(false);discard();dismissAction.current=undefined;stayAction.current=undefined;action?.();}, draft, preview, proposal, catalog, actionChoices, selectedEdgeIds, history, historical, historyInspection, inspectingHistory, historyActionTitles, begin, mark, setTool, setHistorical,
    removeNodeConstraint: (id:string) => {if(busy)return;draftRevision.current++;setPreview(null);setScopeMode('replan');setDraft(previous=>({includeNodeIds:previous.includeNodeIds.filter(value=>value!==id),excludeNodeIds:previous.excludeNodeIds.filter(value=>value!==id)}));},
    undoNode: (id:string) => { if(busy)return;draftRevision.current++;setPreview(null);setScopeMode('replan');const inModel=!view?.model||view.model.orderedNodeIds.includes(id);setDraft(previous=>({includeNodeIds:[...previous.includeNodeIds.filter(value=>value!==id),...(inModel&&baseline.current?.editableDraft.includeNodeIds.includes(id)?[id]:[])].sort(),excludeNodeIds:[...previous.excludeNodeIds.filter(value=>value!==id),...(inModel&&baseline.current?.editableDraft.excludeNodeIds.includes(id)?[id]:[])].sort()})); },
    replanHistorical: (version:RouteVersion) => { if(busy||!view?.activeVersion)return;const prepared=beginDraft(version,true);setDraft({includeNodeIds:[...new Set([...prepared.draft.includeNodeIds,...version.snapshot.selectedNodeIds.filter(id=>view.model?.orderedNodeIds.includes(id))])].filter(id=>!prepared.draft.excludeNodeIds.includes(id)),excludeNodeIds:prepared.draft.excludeNodeIds});setHistory(null);setHistorical(null); },
    chooseAction: (scope:CapabilityActionScope|string,actionId:string) => { if(busy)return;const value=typeof scope==='string'?{edgeId:scope}:scope;explicitChoices.current=true;draftRevision.current++;setPreview(null);setActionChoices(previous=>previous.some(choice=>sameActionScope(choice,value)&&choice.actionId===actionId)?previous.filter(choice=>!sameActionScope(choice,value)||choice.actionId!==actionId):[...previous,{...value,actionId}]); },
    moveAction: (scope:CapabilityActionScope|string,actionId:string,direction:-1|1) => {if(busy)return;const value=typeof scope==='string'?{edgeId:scope}:scope;draftRevision.current++;setPreview(null);setActionChoices(previous=>{const indices=previous.flatMap((choice,index)=>sameActionScope(choice,value)?[index]:[]);const local=indices.findIndex(index=>previous[index].actionId===actionId);const next=local+direction;if(local<0||next<0||next>=indices.length)return previous;const result=[...previous];[result[indices[local]],result[indices[next]]]=[result[indices[next]],result[indices[local]]];return result;});},
    chooseEdge: (edgeId:string,selected:boolean) => { if(busy)return;explicitChoices.current=true;draftRevision.current++;setPreview(null);setSelectedEdgeIds(previous=>{const ids=previous??executionEdgeIds(view?.activeVersion?.snapshot.executionSteps??[]);return selected?[...new Set([...ids,edgeId])]:ids.filter(id=>id!==edgeId);}); },
    cancel:()=>requestDismiss(discard),
    clear: () => { explicitChoices.current=false;draftRevision.current++; setDraft(empty());setScopeMode('replan');setActionChoices([]);setSelectedEdgeIds(undefined);setProposal(null);setPreview(null); },
    continueEditing: () => { draftRevision.current++; setPreview(null); },
    reload:()=>requestDismiss(()=>void run(async()=>{await load();discard();})),
    showHistory:()=>requestDismiss(()=>{discard();void run(refreshHistory);}),
    previewImpact: () => run(async () => {
      if (!view?.activeVersion || busy) return;
      const version=view.activeVersion;const prepared=beginDraft(version,true);
      const revision=draftRevision.current;
      const result=await post<{plan:ExecutionRoutePlan;baseVersionId:string|null;previewState:string}>({action:'preview',...prepared.draft,scopeMode:'replan',actionChoices:version.snapshot.executionSteps===undefined?undefined:prepared.choices,selectedEdgeIds:prepared.edges});
      if(revision!==draftRevision.current)return;
      if(result.baseVersionId!==version.id)throw new Error('正式路线已变化，请重新载入后查看建议。');
      setPreviewState(result.previewState);setStale(false);setPreview(result.plan);setProposal(result.plan);
      if(result.plan.execution){setActionChoices(result.plan.execution.steps.map(actionChoice));if(result.plan.execution.complete)setSelectedEdgeIds(executionEdgeIds(result.plan.execution.steps));}
    }),
    closeHistory: () => { setHistory(null); setHistorical(null); },
    replan: () => run(async () => {
      const revision = draftRevision.current;
      if(stale){const latest=await load();setBaseVersionId(latest.activeVersion?.id??null);}
      const result = await post<{ plan: ExecutionRoutePlan; baseVersionId: string | null;previewState:string }>({ action: 'preview', ...draft,scopeMode,actionChoices:explicitChoices.current?actionChoices:undefined,selectedEdgeIds });
      if (revision !== draftRevision.current) return;
      if (!stale && result.baseVersionId !== baseVersionId) throw new Error('路线已在其他页面更新，请重新载入当前路线后再调整。');
      setPreviewState(result.previewState);setStale(false);setPreview(result.plan);setProposal(result.plan);
      if(result.plan.valid && result.plan.execution) {
        // Suggestions are draft decisions only, never adopted by this response.
        if(!explicitChoices.current)setActionChoices(result.plan.execution.steps.map(actionChoice));
        explicitChoices.current=true;
        if(result.plan.execution.complete)setSelectedEdgeIds(executionEdgeIds(result.plan.execution.steps));
      }
    }),
    adopt: () => accept(), restore: (versionId: string) => accept(versionId),
  };
}
