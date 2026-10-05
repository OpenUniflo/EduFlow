import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiRequestError } from '@/shared/api/apiClient';
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
  const [history, setHistory] = useState<RouteVersion[] | null>(null);
  const [historical, setHistorical] = useState<RouteVersion | null>(null);
  const requestGeneration = useRef(0);
  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    const result = await apiRequest<RoutePlanView>(path);
    if (generation === requestGeneration.current) setView(result);
    return result;
  }, [path]);
  useEffect(() => {
    if (!authenticated) return;
    setLoading(true); setError(''); setPreview(null);setProposal(null); draftRevision.current++;
    let active = true;
    void load().catch(e => { if (active) setError(e instanceof Error ? e.message : '路线读取失败'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; requestGeneration.current++; };
  }, [authenticated, knowledgeKey, load]);
  const run = async (work: () => Promise<void>) => {
    setMutating(true); setError('');
    try { await work(); } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败，请重试');
      if (e instanceof ApiRequestError && e.code === 'route_constraints_conflict') {
        const details = e.details as { conflicts?: RoutePlan['conflicts'] } | undefined;
        if (details?.conflicts) setPreview({ valid: false, route: null, conflicts: details.conflicts });
      }
    } finally { setMutating(false); }
  };
  const post = <T,>(body: unknown) => apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) });
  const begin = () => {
    if (!view?.activeVersion || busy) return;
    draftRevision.current++;
    setDraft({ includeNodeIds: [...view.activeVersion.constraints.includeNodeIds], excludeNodeIds: [...view.activeVersion.constraints.excludeNodeIds] });
    setActionChoices((view.activeVersion.snapshot.executionSteps??[]).map(({edgeId,actionId})=>({edgeId,actionId})));
    setScopeMode(view.activeVersion.snapshot.executionSteps===undefined?'replan':'current');
    setSelectedEdgeIds(view.activeVersion.snapshot.executionSteps?.map(step=>step.edgeId));setProposal(null);
    setBaseVersionId(view.activeVersion.id); setPreview(null); setEditing(true); setHistorical(null); setError('');
  };
  const mark = (id: string, action = tool) => {
    if (!editing || busy) return;
    draftRevision.current++;
    setPreview(null);setSelectedEdgeIds(undefined);setScopeMode('replan');
    setDraft(previous => {
      const toggle = (ids: readonly string[]) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id].sort();
      return action === 'include'
        ? { includeNodeIds: toggle(previous.includeNodeIds), excludeNodeIds: previous.excludeNodeIds.filter(value => value !== id) }
        : { includeNodeIds: previous.includeNodeIds.filter(value => value !== id), excludeNodeIds: toggle(previous.excludeNodeIds) };
    });
  };
  const refreshHistory = async () => { setHistory((await apiRequest<{ versions: RouteVersion[] }>(`${path}&view=history`)).versions); };
  const accept = (versionId?: string) => run(async () => {
    if (versionId ? !view?.activeVersion : !baseVersionId || !preview?.valid || !preview.execution?.complete) return;
    await post(versionId ? { action: 'restore', versionId, baseVersionId: view!.activeVersion!.id }
      : { action: 'adopt', baseVersionId, ...draft,scopeMode, actionChoices:preview!.execution!.steps.map(({edgeId,actionId})=>({edgeId,actionId})),selectedEdgeIds:preview!.execution!.steps.map(step=>step.edgeId) });
    setEditing(false); setPreview(null); setHistorical(null);
    await load(); if (history) await refreshHistory();
  });
  return {
    view, busy, error, editing, tool, draft, preview, proposal, actionChoices, selectedEdgeIds, history, historical, begin, mark, setTool, setHistorical,
    chooseAction: (edgeId:string,actionId:string) => { if(busy)return; draftRevision.current++;setPreview(null);setActionChoices(previous=>[...previous.filter(choice=>choice.edgeId!==edgeId),{edgeId,actionId}]); },
    chooseEdge: (edgeId:string,selected:boolean) => { if(busy)return;draftRevision.current++;setPreview(null);setSelectedEdgeIds(previous=>{const ids=previous??[...new Set((proposal?.execution?.options??view?.execution?.options??[]).map(option=>option.edgeId))];return selected?[...new Set([...ids,edgeId])]:ids.filter(id=>id!==edgeId);}); },
    cancel: () => { draftRevision.current++; setEditing(false); setPreview(null); setError(''); },
    clear: () => { draftRevision.current++; setDraft(empty());setScopeMode('replan');setActionChoices([]);setSelectedEdgeIds(undefined);setProposal(null); setPreview(null); },
    continueEditing: () => { draftRevision.current++; setPreview(null); },
    reload: () => run(async () => { await load(); setEditing(false); setPreview(null); }),
    showHistory: () => run(refreshHistory),
    previewImpact: () => run(async () => {
      if (!view?.activeVersion || busy) return;
      const version=view.activeVersion; const constraints={includeNodeIds:[...version.constraints.includeNodeIds],excludeNodeIds:[...version.constraints.excludeNodeIds]};
      const revision=++draftRevision.current;
      setDraft(constraints);setBaseVersionId(version.id);setScopeMode('replan');setActionChoices([]);setSelectedEdgeIds(undefined);setHistorical(null);setEditing(true);
      const result=await post<{plan:ExecutionRoutePlan;baseVersionId:string|null}>({action:'preview',...constraints,scopeMode:'replan',actionChoices:[]});
      if(revision!==draftRevision.current)return;
      if(result.baseVersionId!==version.id)throw new Error('正式路线已变化，请重新载入后查看建议。');
      setPreview(result.plan);setProposal(result.plan);
      if(result.plan.execution){setActionChoices(result.plan.execution.steps.map(({edgeId,actionId})=>({edgeId,actionId})));if(result.plan.execution.complete)setSelectedEdgeIds(result.plan.execution.steps.map(step=>step.edgeId));}
    }),
    closeHistory: () => { setHistory(null); setHistorical(null); },
    replan: () => run(async () => {
      const revision = draftRevision.current;
      const result = await post<{ plan: ExecutionRoutePlan; baseVersionId: string | null }>({ action: 'preview', ...draft,scopeMode,actionChoices,selectedEdgeIds });
      if (revision !== draftRevision.current) return;
      if (result.baseVersionId !== baseVersionId) throw new Error('路线已在其他页面更新，请重新载入当前路线后再调整。');
      setPreview(result.plan);setProposal(result.plan);
      if(result.plan.valid && result.plan.execution) {
        // Suggestions are draft decisions only, never adopted by this response.
        setActionChoices(previous=>{const resolved=new Map(previous.map(choice=>[choice.edgeId,choice]));for(const step of result.plan.execution!.steps)resolved.set(step.edgeId,{edgeId:step.edgeId,actionId:step.actionId});return [...resolved.values()];});
        if(result.plan.execution.complete)setSelectedEdgeIds(result.plan.execution.steps.map(step=>step.edgeId));
      }
    }),
    adopt: () => accept(), restore: (versionId: string) => accept(versionId),
  };
}
