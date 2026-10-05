import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiRequestError } from '@/shared/api/apiClient';
import type { RouteExecutionPlan } from '@/shared/learning/routeExecution';
import type { RouteConstraints, RoutePlan } from '@/shared/learning/routePlanning';
import type { ExecutionRoutePlan, RoutePlanView, RouteVersion } from '@/shared/learning/routeVersion';
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
  const [actionChoices,setActionChoices] = useState<Array<{edgeId:string;actionId:string}>>([]);
  const [selectedEdgeIds,setSelectedEdgeIds] = useState<string[] | undefined>();
  const [scopeMode,setScopeMode] = useState<'current'|'replan'>('replan');
  const [previewState,setPreviewState]=useState<string>();
  const [stale,setStale]=useState(false);
  const [dismissPending,setDismissPending]=useState(false);
  const dismissAction=useRef<(()=>void)|undefined>(undefined); const stayAction=useRef<(()=>void)|undefined>(undefined);
  const baseline=useRef<{draft:RouteConstraints;choices:Array<{edgeId:string;actionId:string}>;edges?:string[]}|undefined>(undefined);
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
  const begin = () => {
    if (!view?.activeVersion || busy) return;
    draftRevision.current++;setStale(false);setPreviewState(undefined);
    baseline.current={draft:view.activeVersion.constraints,choices:(view.activeVersion.snapshot.executionSteps??[]).map(({edgeId,actionId})=>({edgeId,actionId})),edges:view.activeVersion.snapshot.executionSteps?.map(step=>step.edgeId)};
    setDraft({ includeNodeIds: [...view.activeVersion.constraints.includeNodeIds], excludeNodeIds: [...view.activeVersion.constraints.excludeNodeIds] });
    setActionChoices((view.activeVersion.snapshot.executionSteps??[]).map(({edgeId,actionId})=>({edgeId,actionId})));
    setScopeMode(view.activeVersion.snapshot.executionSteps===undefined?'replan':'current');
    setSelectedEdgeIds(view.activeVersion.snapshot.executionSteps?.map(step=>step.edgeId));setProposal(null);
    setBaseVersionId(view.activeVersion.id); setPreview(null); setEditing(true); setHistorical(null); setError('');
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
      : { action: 'adopt', baseVersionId,previewState, ...draft,scopeMode, actionChoices:preview!.execution!.steps.map(({edgeId,actionId})=>({edgeId,actionId})),selectedEdgeIds:preview!.execution!.steps.map(step=>step.edgeId) });
    setEditing(false); setPreview(null); setHistorical(null);
    await load(); if (history) await refreshHistory();
  });
  const symmetric=(a:readonly string[],b:readonly string[])=>new Set([...a.filter(id=>!b.includes(id)),...b.filter(id=>!a.includes(id))]).size;
  const changeCount=baseline.current?symmetric(draft.includeNodeIds,baseline.current.draft.includeNodeIds)+symmetric(draft.excludeNodeIds,baseline.current.draft.excludeNodeIds)
    +actionChoices.filter(choice=>baseline.current!.choices.find(old=>old.edgeId===choice.edgeId)?.actionId!==choice.actionId).length
    +(selectedEdgeIds?symmetric(selectedEdgeIds,baseline.current.edges??[]):0):0;
  const dirty=editing&&changeCount>0;
  const discard=()=>{draftRevision.current++;setEditing(false);setPreview(null);setProposal(null);setPreviewState(undefined);setError('');setStale(false);};
  const requestDismiss=(action:()=>void,onKeep?:()=>void)=>{if(!dirty){action();return;}dismissAction.current=action;stayAction.current=onKeep;setDismissPending(true);};
  return {
    view, busy, error, editing, tool,dirty,changeCount,stale,dismissPending,requestDismiss,leave:(action:()=>void)=>requestDismiss(()=>{discard();action();}),
    keepEditing:()=>{setDismissPending(false);stayAction.current?.();dismissAction.current=undefined;stayAction.current=undefined;},
    discardDraft:()=>{const action=dismissAction.current;setDismissPending(false);discard();dismissAction.current=undefined;stayAction.current=undefined;action?.();}, draft, preview, proposal, actionChoices, selectedEdgeIds, history, historical, historyInspection, inspectingHistory, historyActionTitles, begin, mark, setTool, setHistorical,
    removeNodeConstraint: (id:string) => {if(busy)return;draftRevision.current++;setPreview(null);setScopeMode('replan');setDraft(previous=>({includeNodeIds:previous.includeNodeIds.filter(value=>value!==id),excludeNodeIds:previous.excludeNodeIds.filter(value=>value!==id)}));},
    undoNode: (id:string) => { if(busy)return;draftRevision.current++;setPreview(null);setScopeMode('replan');setDraft(previous=>({includeNodeIds:[...previous.includeNodeIds.filter(value=>value!==id),...(baseline.current?.draft.includeNodeIds.includes(id)?[id]:[])].sort(),excludeNodeIds:[...previous.excludeNodeIds.filter(value=>value!==id),...(baseline.current?.draft.excludeNodeIds.includes(id)?[id]:[])].sort()})); },
    replanHistorical: (version:RouteVersion) => { if(busy||!view?.activeVersion)return;begin();setDraft({includeNodeIds:[...new Set([...version.constraints.includeNodeIds,...version.snapshot.selectedNodeIds])].filter(id=>!version.constraints.excludeNodeIds.includes(id)),excludeNodeIds:[...version.constraints.excludeNodeIds]});setScopeMode('replan');setSelectedEdgeIds(version.snapshot.executionSteps?.map(step=>step.edgeId));setActionChoices((version.snapshot.executionSteps??[]).map(({edgeId,actionId})=>({edgeId,actionId})));setHistory(null);setHistorical(null); },
    chooseAction: (edgeId:string,actionId:string) => { if(busy)return; draftRevision.current++;setPreview(null);setActionChoices(previous=>[...previous.filter(choice=>choice.edgeId!==edgeId),{edgeId,actionId}]); },
    chooseEdge: (edgeId:string,selected:boolean) => { if(busy)return;draftRevision.current++;setPreview(null);setSelectedEdgeIds(previous=>{const ids=previous??view?.activeVersion?.snapshot.executionSteps?.map(step=>step.edgeId)??[];return selected?[...new Set([...ids,edgeId])]:ids.filter(id=>id!==edgeId);}); },
    cancel:()=>requestDismiss(discard),
    clear: () => { draftRevision.current++; setDraft(empty());setScopeMode('replan');setActionChoices([]);setSelectedEdgeIds(undefined);setProposal(null);setPreview(null); },
    continueEditing: () => { draftRevision.current++; setPreview(null); },
    reload:()=>requestDismiss(()=>void run(async()=>{await load();discard();})),
    showHistory:()=>requestDismiss(()=>{discard();void run(refreshHistory);}),
    previewImpact: () => run(async () => {
      if (!view?.activeVersion || busy) return;
      const version=view.activeVersion; const constraints={includeNodeIds:[...version.constraints.includeNodeIds],excludeNodeIds:[...version.constraints.excludeNodeIds]};
      baseline.current={draft:version.constraints,choices:(version.snapshot.executionSteps??[]).map(({edgeId,actionId})=>({edgeId,actionId})),edges:version.snapshot.executionSteps?.map(step=>step.edgeId)};
      const revision=++draftRevision.current;
      setDraft(constraints);setBaseVersionId(version.id);setScopeMode('replan');setActionChoices((version.snapshot.executionSteps??[]).map(({edgeId,actionId})=>({edgeId,actionId})));setSelectedEdgeIds(version.snapshot.executionSteps?.map(step=>step.edgeId));setHistorical(null);setEditing(true);
      const result=await post<{plan:ExecutionRoutePlan;baseVersionId:string|null;previewState:string}>({action:'preview',...constraints,scopeMode:'replan',actionChoices:version.snapshot.executionSteps?.map(({edgeId,actionId})=>({edgeId,actionId})),selectedEdgeIds:version.snapshot.executionSteps?.map(step=>step.edgeId)});
      if(revision!==draftRevision.current)return;
      if(result.baseVersionId!==version.id)throw new Error('正式路线已变化，请重新载入后查看建议。');
      setPreviewState(result.previewState);setStale(false);setPreview(result.plan);setProposal(result.plan);
      if(result.plan.execution){setActionChoices(result.plan.execution.steps.map(({edgeId,actionId})=>({edgeId,actionId})));if(result.plan.execution.complete)setSelectedEdgeIds(result.plan.execution.steps.map(step=>step.edgeId));}
    }),
    closeHistory: () => { setHistory(null); setHistorical(null); },
    replan: () => run(async () => {
      const revision = draftRevision.current;
      if(stale){const latest=await load();setBaseVersionId(latest.activeVersion?.id??null);}
      const result = await post<{ plan: ExecutionRoutePlan; baseVersionId: string | null;previewState:string }>({ action: 'preview', ...draft,scopeMode,actionChoices,selectedEdgeIds });
      if (revision !== draftRevision.current) return;
      if (!stale && result.baseVersionId !== baseVersionId) throw new Error('路线已在其他页面更新，请重新载入当前路线后再调整。');
      setPreviewState(result.previewState);setStale(false);setPreview(result.plan);setProposal(result.plan);
      if(result.plan.valid && result.plan.execution) {
        // Suggestions are draft decisions only, never adopted by this response.
        setActionChoices(previous=>{const resolved=new Map(previous.map(choice=>[choice.edgeId,choice]));for(const step of result.plan.execution!.steps)resolved.set(step.edgeId,{edgeId:step.edgeId,actionId:step.actionId});return [...resolved.values()];});
        if(result.plan.execution.complete)setSelectedEdgeIds(result.plan.execution.steps.map(step=>step.edgeId));
      }
    }),
    adopt: () => accept(), restore: (versionId: string) => accept(versionId),
  };
}
