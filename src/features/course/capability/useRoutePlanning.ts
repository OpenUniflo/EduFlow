import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiRequestError } from '@/shared/api/apiClient';
import type { RouteConstraints, RoutePlan } from '@/shared/learning/routePlanning';
import type { RoutePlanView, RouteVersion } from '@/shared/learning/routeVersion';
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
  const [preview, setPreview] = useState<RoutePlan | null>(null);
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
    setLoading(true); setError(''); setPreview(null); draftRevision.current++;
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
    setBaseVersionId(view.activeVersion.id); setPreview(null); setEditing(true); setHistorical(null); setError('');
  };
  const mark = (id: string, action = tool) => {
    if (!editing || busy) return;
    draftRevision.current++;
    setPreview(null);
    setDraft(previous => {
      const toggle = (ids: readonly string[]) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id].sort();
      return action === 'include'
        ? { includeNodeIds: toggle(previous.includeNodeIds), excludeNodeIds: previous.excludeNodeIds.filter(value => value !== id) }
        : { includeNodeIds: previous.includeNodeIds.filter(value => value !== id), excludeNodeIds: toggle(previous.excludeNodeIds) };
    });
  };
  const refreshHistory = async () => { setHistory((await apiRequest<{ versions: RouteVersion[] }>(`${path}&view=history`)).versions); };
  const accept = (versionId?: string) => run(async () => {
    if (versionId ? !view?.activeVersion : !baseVersionId || !preview?.valid) return;
    await post(versionId ? { action: 'restore', versionId, baseVersionId: view!.activeVersion!.id }
      : { action: 'adopt', baseVersionId, includeNodeIds: draft.includeNodeIds, excludeNodeIds: draft.excludeNodeIds });
    setEditing(false); setPreview(null); setHistorical(null);
    await load(); if (history) await refreshHistory();
  });
  return {
    view, busy, error, editing, tool, draft, preview, history, historical, begin, mark, setTool, setHistorical,
    cancel: () => { draftRevision.current++; setEditing(false); setPreview(null); setError(''); },
    clear: () => { draftRevision.current++; setDraft(empty()); setPreview(null); },
    continueEditing: () => { draftRevision.current++; setPreview(null); },
    reload: () => run(async () => { await load(); setEditing(false); setPreview(null); }),
    showHistory: () => run(refreshHistory),
    closeHistory: () => { setHistory(null); setHistorical(null); },
    replan: () => run(async () => {
      const revision = draftRevision.current;
      const result = await post<{ plan: RoutePlan; baseVersionId: string | null }>({ action: 'preview', ...draft });
      if (revision !== draftRevision.current) return;
      if (result.baseVersionId !== baseVersionId) throw new Error('路线已在其他页面更新，请重新载入当前路线后再调整。');
      setPreview(result.plan);
    }),
    adopt: () => accept(), restore: (versionId: string) => accept(versionId),
  };
}
