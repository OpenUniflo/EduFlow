import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '@/shared/api/apiClient';
import { useEvidenceWorkspace } from '@/features/evidence/EvidenceWorkspace';
import { actionAlternatives, type ActionData, type ActionRun, type EdgeAction } from './model';
import type { ActionBranch } from '@/features/knowledge/components/actionBranches';
import './edgeActions.css';
export { actionAlternatives } from './model';
export type { ActionData } from './model';
const emptyData: ActionData = { actions: [], bindings: [], runs: [], availableMicroActionIds: [], availableActionIds: [] };
export function useEdgeActions(courseId: string, authenticated: boolean, executionRevision = '') {
  const navigate = useNavigate();
  const [data, setData] = useState<ActionData>(emptyData);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(authenticated);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scope = useRef(courseId); scope.current = courseId;
  const keys = useRef(new Map<string, string>());
  const read = useCallback(() => apiRequest<ActionData>(`/api/edge-actions?courseId=${encodeURIComponent(courseId)}`), [courseId]);
  const reload = useCallback(async () => { const next = await read(); if (mounted.current && scope.current === courseId) setData(next); }, [read, courseId]);
  useEffect(() => {
    let active = true;
    setData(emptyData); setError(''); setLoading(authenticated); keys.current.clear();
    if (authenticated) read().then(value => { if (active) setData(value); }).catch(() => { if (active) setError('行动暂时无法加载，请刷新结果重试。'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [read, authenticated, executionRevision]);
  async function perform(body: unknown) {
    setBusy(true); setError('');
    try {
      const result = await apiRequest<{ run: ActionRun }>('/api/edge-actions', { method: 'POST', body: JSON.stringify(body) });
      if (!mounted.current) return null;
      await reload(); return mounted.current ? result.run : null;
    } catch (error) { if (!mounted.current) return null; setError(error instanceof Error ? error.message : '行动操作失败'); try { await reload(); } catch { /* Preserve the action error. */ } return null; }
    finally { if (mounted.current) setBusy(false); }
  }
  return { ...data, error, busy, loading, reload,
    select: async (actionId: string, expectedActiveRunId?: string, repeatRunId?: string, routeVersionId?:string) => { let key = keys.current.get(actionId); if (!key) { key = crypto.randomUUID(); keys.current.set(actionId, key); } const run = await perform({ action: 'select', courseId, actionId, selectionKey: key, expectedActiveRunId: expectedActiveRunId ?? null, repeatRunId,routeVersionId }); if (run) keys.current.delete(actionId); return run; },
    start: async (run: ActionRun,routeVersionId?:string) => {
      const next = await perform({ action: 'transition', runId: run.id, operation: 'start',routeVersionId });
      if (next?.micro_path_id) navigate(`/learn/micro/${encodeURIComponent(next.execution_snapshot.targetId)}?courseId=${encodeURIComponent(courseId)}&actionRunId=${encodeURIComponent(next.id)}&pathId=${encodeURIComponent(next.micro_path_id)}`);
      else if (next?.assignment_id) navigate(`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(next.assignment_id)}?actionRunId=${encodeURIComponent(next.id)}`);
    },
    transition: (runId: string, operation: 'start' | 'sync-micro') => perform({ action: 'transition', runId, operation }),
  };
}
export function EdgeActionPanel({ alternatives, title, control, courseId, focusedId, onFocus, onClose, embedded = false,planningOnly=false,formalChoice=false,onAdjust,routeVersionId }: {
  alternatives: ReturnType<typeof actionAlternatives>; title: string; control: ReturnType<typeof useEdgeActions>; courseId: string; focusedId: string | null;
  onFocus(id: string): void; onClose?(): void; embedded?: boolean;planningOnly?:boolean;formalChoice?:boolean;onAdjust?():void;routeVersionId?:string;
}) {
  const evidence = useEvidenceWorkspace();
  const [localError, setLocalError] = useState('');
  const [switchRequest, setSwitchRequest] = useState<{ actionId: string; activeRunId: string; activeTitle: string; repeatRunId?: string;startAfterSelect?:boolean } | null>(null);
  const confirmation = useRef<HTMLElement>(null);
  const switchTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => { if (switchRequest) confirmation.current?.focus(); else switchTrigger.current?.focus(); }, [switchRequest]);
  const busy = control.busy;
  function select(action: EdgeAction, repeatRunId?: string,startAfterSelect=false) {
    const active = control.runs.find(run => run.edge_id === action.edge_id && ['selected', 'in_progress'].includes(run.status));
    if (active) { switchTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSwitchRequest({ actionId: action.id, activeRunId: active.id, activeTitle: active.execution_snapshot.action.title, repeatRunId,startAfterSelect }); }
    else void control.select(action.id, undefined, repeatRunId,routeVersionId).then(run=>{if(run && startAfterSelect)void control.start(run,routeVersionId);});
  }
  return <aside className={`edge-action-panel ${embedded ? 'edge-action-inline' : 'glass-v2'}`} aria-label="关系行动方案">
    {onClose ? <button className="atlas-panel-close" aria-label="关闭行动方案" onClick={onClose}>×</button> : null}
    <h2>{title}</h2><p>{formalChoice?"这是正式路线已采用的行动。": "以下行动是推进这条能力关系的替代方案。"}执行完成后仍需证据与正式能力判断。</p>
    <button className="atlas-secondary" disabled={busy} onClick={() => void control.reload().catch(() => setLocalError('刷新失败，请稍后重试。'))}>刷新执行记录</button>
    {control.error || localError ? <p role="alert">{control.error || localError}</p> : !alternatives.length ? <p>{formalChoice?'当前正式路线中的行动已不可用，需要调整路线。':'这条关系尚未配置行动。'}{formalChoice && onAdjust?<button className="atlas-secondary" onClick={onAdjust}>调整路线</button>:null}</p> : null}
    {switchRequest ? <section ref={confirmation} tabIndex={-1} role="alertdialog" aria-label="确认切换行动"><h3>切换当前行动？</h3><p>“{switchRequest.activeTitle}”将停止，已有记录会保留。确认后选择新的实施方式。</p><div className="action-confirm-buttons"><button className="atlas-secondary" disabled={busy} onClick={() => setSwitchRequest(null)}>保留当前行动</button><button className="atlas-primary" disabled={busy} onClick={() => { void control.select(switchRequest.actionId, switchRequest.activeRunId, switchRequest.repeatRunId,routeVersionId).then(run => { if (run) {setSwitchRequest(null);if(switchRequest.startAfterSelect)void control.start(run,routeVersionId);} }); }}>{switchRequest.startAfterSelect?'确认切换并开始':'确认切换'}</button></div></section> : null}
    {alternatives.map(({ action: currentAction, binding: currentBinding, cost, run }, index) => {
      const active = run && ['selected', 'in_progress'].includes(run.status);
      const action = active ? run.execution_snapshot.action : currentAction;
      const binding = active ? run.execution_snapshot.binding : currentBinding;
      return <section key={action.id} className={focusedId === action.id ? 'focused' : ''}>
      <button className="edge-action-heading" aria-expanded={focusedId === action.id} onClick={() => onFocus(action.id)}><strong>{!embedded ? `${index + 1} · ` : ''}{formalChoice?'已采用 · ':index === 0 && cost.available ? '推荐 · ' : ''}{action.title}</strong><span>{action.type === 'micro_learning' ? '微学习' : '实践任务'} · {action.estimated_minutes} 分钟 · 难度 {action.difficulty}/5</span></button>
      <p>{run ? ({ selected: '已选择', in_progress: '执行中', completed: '执行完成 · 不等于能力已具备', cancelled: '已取消' } as const)[run.status] : cost.available ? '资源与能力条件已满足' : '当前不可执行'} · 综合成本 {cost.weight}</p>
      {focusedId === action.id ? <><p>{action.description}</p><ul>{cost.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reason.message}{reason.cost ? `（+${reason.cost}）` : ''}</li>)}</ul>
        {binding ? <><h3>项目执行信息</h3><p>{binding.context}</p><p>{binding.instructions}</p>{binding.contact ? <p>联系：{binding.contact}</p> : null}<ul>{binding.resources.map(resource => <li key={resource.key}>{resource.label}：{resource.reference} · {resource.available ? '可用' : '不可用'}</li>)}</ul></> : null}
        <h3>预期证据</h3><p>{action.expected_evidence}</p>
        {planningOnly?<button className="atlas-secondary" disabled={busy || !onAdjust} onClick={onAdjust}>在调整路线中选择此方案</button>:<>
        {!run || run.status === 'completed' ? <button className="atlas-primary" disabled={busy || !cost.available} onClick={() => select(currentAction, run?.status === "completed" ? run.id : undefined,formalChoice)}>{run ? '再次实践' : formalChoice?'开始已选行动':'选择此行动'}</button> : null}
        {run?.status === 'selected' ? <>{!formalChoice?<button className="atlas-secondary" disabled={busy || !cost.available} onClick={() => select(currentAction)}>重新核对并选择</button>:null}<button className="atlas-primary" disabled={busy || !control.continuableRunIds?.includes(run.id)} onClick={() => void control.start(run,routeVersionId)}>开始{action.type === 'micro_learning' ? '微学习' : '实践任务'}</button></> : null}
        {run?.status === 'in_progress' && action.type === 'practice_task' ? <button className="atlas-primary" disabled={busy || !control.continuableRunIds?.includes(run.id)} onClick={() => void control.start(run,routeVersionId)}>继续实训</button> : null}
        {run?.status === 'in_progress' && !formalChoice ? <button className="atlas-secondary" disabled={busy || !cost.available} onClick={() => select(currentAction)}>重新核对执行内容</button> : null}
        {run?.status === 'in_progress' && action.type === 'micro_learning' ? <><button className="atlas-secondary" disabled={busy || !control.continuableRunIds?.includes(run.id)} onClick={() => void control.start(run,routeVersionId)}>继续微学习</button><button className="atlas-secondary" disabled={busy} onClick={() => void control.transition(run.id, 'sync-micro')}>核对微学习完成状态</button><p>微学习沿用既有学习判定规则；此处的行动完成记录不会另行授予能力。</p></> : null}
        </>}
        {run?.evidence_source_id ? <button className="atlas-secondary" disabled={busy} onClick={() => evidence?.open(courseId, run.evidence_source_id!)}>分析结果证据并确认能力</button> : null}
      </> : null}
    </section>; })}
  </aside>;
}
export function branchesForActions(alternatives: ReturnType<typeof actionAlternatives>,selectedActionId?:string): ActionBranch[] {
  return alternatives.map(({ action, cost, run }) => ({ id: action.id, edgeId: action.edge_id, title: action.title, status: run && run.status !== 'cancelled' ? run.status : action.id===selectedActionId?'selected':!cost.available ? 'unavailable' : 'candidate' }));
}
