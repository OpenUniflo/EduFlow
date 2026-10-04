import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '@/shared/api/apiClient';
import { useEvidenceWorkspace } from '@/features/evidence/EvidenceWorkspace';
import { evaluateAction, projectEdgeActions, rankActions, type ActionRun, type CourseActionBinding, type EdgeAction } from './model';
import type { ActionBranch } from '@/features/knowledge/components/actionBranches';
import './edgeActions.css';
export type ActionData = { actions: EdgeAction[]; bindings: CourseActionBinding[]; runs: ActionRun[]; availableMicroActionIds: string[]; availableActionIds: string[] };
const emptyData: ActionData = { actions: [], bindings: [], runs: [], availableMicroActionIds: [], availableActionIds: [] };
export function useEdgeActions(courseId: string, authenticated: boolean) {
  const [data, setData] = useState<ActionData>(emptyData);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const scope = useRef(courseId); scope.current = courseId;
  const keys = useRef(new Map<string, string>());
  const read = useCallback(() => apiRequest<ActionData>(`/api/edge-actions?courseId=${encodeURIComponent(courseId)}`), [courseId]);
  const reload = useCallback(async () => { const next = await read(); if (scope.current === courseId) setData(next); }, [read, courseId]);
  useEffect(() => {
    let active = true;
    setData(emptyData); setError(''); keys.current.clear();
    if (authenticated) read().then(value => { if (active) setData(value); }).catch(() => { if (active) setError('行动暂时无法加载，请刷新结果重试。'); });
    return () => { active = false; };
  }, [read, authenticated]);
  async function perform(body: unknown) {
    setBusy(true); setError('');
    try {
      const result = await apiRequest<{ run: ActionRun }>('/api/edge-actions', { method: 'POST', body: JSON.stringify(body) });
      await reload(); return result.run;
    } catch (error) { setError(error instanceof Error ? error.message : '行动操作失败'); try { await reload(); } catch { /* Preserve the action error. */ } return null; }
    finally { setBusy(false); }
  }
  return { ...data, error, busy, reload,
    select: async (actionId: string, expectedActiveRunId?: string, repeatRunId?: string) => { let key = keys.current.get(actionId); if (!key) { key = crypto.randomUUID(); keys.current.set(actionId, key); } const run = await perform({ action: 'select', courseId, actionId, selectionKey: key, expectedActiveRunId: expectedActiveRunId ?? null, repeatRunId }); if (run) keys.current.delete(actionId); return run; },
    transition: (runId: string, operation: 'start' | 'sync-micro') => perform({ action: 'transition', runId, operation }),
  };
}
export function actionAlternatives(courseId: string, edge: { id: string; source: string } | undefined, data: ActionData, acquiredIds: ReadonlySet<string>) {
  return rankActions(projectEdgeActions(new Set(edge ? [edge.id] : []), data.actions, data.bindings, courseId).map(item => ({ ...item,
    run: data.runs.find(run => run.action_id === item.action.id && run.status !== 'cancelled'),
    cost: evaluateAction(item.action, { sourceId: edge!.source, acquiredIds, binding: item.binding, microAvailable: data.availableMicroActionIds.includes(item.action.id), executionAvailable: data.availableActionIds.includes(item.action.id) }),
  })));
}
export function EdgeActionPanel({ alternatives, title, control, courseId, focusedId, onFocus, onClose }: {
  alternatives: ReturnType<typeof actionAlternatives>; title: string; control: ReturnType<typeof useEdgeActions>; courseId: string; focusedId: string | null;
  onFocus(id: string): void; onClose(): void;
}) {
  const navigate = useNavigate();
  const evidence = useEvidenceWorkspace();
  const [localError, setLocalError] = useState('');
  const [switchRequest, setSwitchRequest] = useState<{ actionId: string; activeRunId: string; activeTitle: string; repeatRunId?: string } | null>(null);
  const busy = control.busy;
  function select(action: EdgeAction, repeatRunId?: string) {
    const active = control.runs.find(run => run.edge_id === action.edge_id && ['selected', 'in_progress'].includes(run.status));
    if (active) setSwitchRequest({ actionId: action.id, activeRunId: active.id, activeTitle: active.execution_snapshot.action.title, repeatRunId });
    else void control.select(action.id, undefined, repeatRunId);
  }
  async function start(run: ActionRun) {
    const next = await control.transition(run.id, 'start');
    if (next?.micro_path_id) navigate(`/learn/micro/${encodeURIComponent(next.execution_snapshot.targetId)}?courseId=${encodeURIComponent(courseId)}&actionRunId=${encodeURIComponent(next.id)}&pathId=${encodeURIComponent(next.micro_path_id)}`);
    if (next?.assignment_id) navigate(`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(next.assignment_id)}?actionRunId=${encodeURIComponent(next.id)}`);
  }
  return <aside className="edge-action-panel glass-v2" aria-label="关系行动方案">
    <button className="atlas-panel-close" aria-label="关闭行动方案" onClick={onClose}>×</button>
    <h2>{title}</h2><p>以下行动是推进这条能力关系的替代方案。执行完成后仍需证据与正式能力判断。</p>
    <button disabled={busy} onClick={() => void control.reload().catch(() => setLocalError('刷新失败，请稍后重试。'))}>刷新执行记录</button>
    {control.error || localError ? <p role="alert">{control.error || localError}</p> : !alternatives.length ? <p>这条关系尚未配置行动。</p> : null}
    {switchRequest ? <section role="alertdialog" aria-label="确认切换行动"><h3>切换当前行动？</h3><p>“{switchRequest.activeTitle}”将停止，已有记录会保留。确认后选择新的实施方式。</p><button disabled={busy} onClick={() => setSwitchRequest(null)}>保留当前行动</button><button disabled={busy} onClick={() => { void control.select(switchRequest.actionId, switchRequest.activeRunId, switchRequest.repeatRunId).then(run => { if (run) setSwitchRequest(null); }); }}>确认切换</button></section> : null}
    {alternatives.map(({ action: currentAction, binding: currentBinding, cost, run }, index) => {
      const active = run && ['selected', 'in_progress'].includes(run.status);
      const action = active ? run.execution_snapshot.action : currentAction;
      const binding = active ? run.execution_snapshot.binding : currentBinding;
      return <section key={action.id} className={focusedId === action.id ? 'focused' : ''}>
      <button className="edge-action-heading" aria-expanded={focusedId === action.id} onClick={() => onFocus(action.id)}><strong>{index === 0 && cost.available ? '推荐 · ' : ''}{action.title}</strong><span>{action.type === 'micro_learning' ? '微学习' : '实践任务'} · {action.estimated_minutes} 分钟 · 难度 {action.difficulty}/5</span></button>
      <p>{run ? ({ selected: '已选择', in_progress: '执行中', completed: '执行完成 · 不等于能力已具备', cancelled: '已取消' } as const)[run.status] : cost.available ? '资源与能力条件已满足' : '当前不可执行'} · 综合成本 {cost.weight}</p>
      {focusedId === action.id ? <><p>{action.description}</p><ul>{cost.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reason.message}{reason.cost ? `（+${reason.cost}）` : ''}</li>)}</ul>
        {binding ? <><h3>项目执行信息</h3><p>{binding.context}</p><p>{binding.instructions}</p>{binding.contact ? <p>联系：{binding.contact}</p> : null}<ul>{binding.resources.map(resource => <li key={resource.key}>{resource.label}：{resource.reference} · {resource.available ? '可用' : '不可用'}</li>)}</ul></> : null}
        <h3>预期证据</h3><p>{action.expected_evidence}</p>
        {!run || run.status === 'completed' ? <button className="atlas-primary" disabled={busy || !cost.available} onClick={() => select(currentAction, run?.status === "completed" ? run.id : undefined)}>{run ? '再次实践' : '选择此行动'}</button> : null}
        {run?.status === 'selected' ? <><button disabled={busy || !cost.available} onClick={() => select(currentAction)}>重新核对并选择</button><button className="atlas-primary" disabled={busy || !cost.available} onClick={() => void start(run)}>开始{action.type === 'micro_learning' ? '微学习' : '实践任务'}</button></> : null}
        {run?.status === 'in_progress' && action.type === 'practice_task' ? <button className="atlas-primary" disabled={busy} onClick={() => void start(run)}>继续实训</button> : null}
        {run?.status === 'in_progress' ? <button disabled={busy || !cost.available} onClick={() => select(currentAction)}>重新核对执行内容</button> : null}
        {run?.status === 'in_progress' && action.type === 'micro_learning' ? <><button disabled={busy} onClick={() => void start(run)}>继续微学习</button><button disabled={busy} onClick={() => void control.transition(run.id, 'sync-micro')}>核对微学习完成状态</button><p>微学习沿用既有学习判定规则；此处的行动完成记录不会另行授予能力。</p></> : null}
        {run?.evidence_source_id ? <button disabled={busy} onClick={() => evidence?.open(courseId, run.evidence_source_id!)}>分析结果证据并确认能力</button> : null}
      </> : null}
    </section>; })}
  </aside>;
}
export function branchesForActions(alternatives: ReturnType<typeof actionAlternatives>): ActionBranch[] {
  return alternatives.map(({ action, cost, run }) => ({ id: action.id, edgeId: action.edge_id, title: action.title, status: run && run.status !== 'cancelled' ? run.status : !cost.available ? 'unavailable' : 'candidate' }));
}
