import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '@/shared/api/apiClient';
import { uploadEvidence } from '@/features/evidence/evidenceClient';
import { useEvidenceWorkspace } from '@/features/evidence/EvidenceWorkspace';
import { evaluateAction, projectEdgeActions, type ActionRun, type CourseActionBinding, type EdgeAction } from './model';
import type { ActionBranch } from '@/features/knowledge/components/actionBranches';
import './edgeActions.css';
type ActionData = { actions: EdgeAction[]; bindings: CourseActionBinding[]; runs: ActionRun[]; availableMicroActionIds: string[] };
const emptyData: ActionData = { actions: [], bindings: [], runs: [], availableMicroActionIds: [] };
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
    select: async (actionId: string) => { let key = keys.current.get(actionId); if (!key) { key = crypto.randomUUID(); keys.current.set(actionId, key); } const run = await perform({ action: 'select', courseId, actionId, selectionKey: key }); if (run) keys.current.delete(actionId); return run; },
    transition: (runId: string, operation: 'start' | 'submit' | 'sync-micro', sourceId?: string) => perform({ action: 'transition', runId, operation, ...(sourceId ? { sourceId } : {}) }),
  };
}
export function actionAlternatives(courseId: string, edge: { id: string; source: string } | undefined, data: ActionData, acquiredIds: ReadonlySet<string>) {
  return projectEdgeActions(new Set(edge ? [edge.id] : []), data.actions, data.bindings, courseId).map(item => ({ ...item,
    run: data.runs.find(run => run.action_id === item.action.id && run.status !== 'cancelled'),
    cost: evaluateAction(item.action, { sourceId: edge!.source, acquiredIds, binding: item.binding, microAvailable: data.availableMicroActionIds.includes(item.action.id) }),
  }));
}
export function EdgeActionPanel({ alternatives, title, control, courseId, focusedId, onFocus, onClose }: {
  alternatives: ReturnType<typeof actionAlternatives>; title: string; control: ReturnType<typeof useEdgeActions>; courseId: string; focusedId: string | null;
  onFocus(id: string): void; onClose(): void;
}) {
  const navigate = useNavigate();
  const evidence = useEvidenceWorkspace();
  const [uploading, setUploading] = useState(false), [uploadError, setUploadError] = useState('');
  const busy = uploading || control.busy;
  async function start(run: ActionRun) {
    const next = await control.transition(run.id, 'start');
    if (next?.micro_path_id) navigate(`/learn/micro/${encodeURIComponent(next.execution_snapshot.targetId)}?courseId=${encodeURIComponent(courseId)}`, { state: { microPathId: next.micro_path_id } });
  }
  async function submit(run: ActionRun, file: File) {
    setUploading(true); setUploadError('');
    try {
      const sourceId = await uploadEvidence(file);
      const next = await control.transition(run.id, 'submit', sourceId);
      if (next) evidence?.open(courseId, sourceId);
      else setUploadError('文件已保存到“我的证据”。提交响应未完成，请刷新执行记录核对结果关联。');
    } catch (error) { setUploadError(error instanceof Error ? error.message : '上传失败'); }
    finally { setUploading(false); }
  }
  return <aside className="edge-action-panel glass-v2" aria-label="关系行动方案">
    <button className="atlas-panel-close" aria-label="关闭行动方案" onClick={onClose}>×</button>
    <h2>{title}</h2><p>以下行动是推进这条能力关系的替代方案。执行完成后仍需证据与正式能力判断。</p>
    <button disabled={busy} onClick={() => void control.reload().catch(() => setUploadError('刷新失败，请稍后重试。'))}>刷新执行记录</button>
    {control.error || uploadError ? <p role="alert">{control.error || uploadError}</p> : !alternatives.length ? <p>这条关系尚未配置行动。</p> : null}
    {alternatives.map(({ action: currentAction, binding: currentBinding, cost, run }) => {
      const action = run?.execution_snapshot.action ?? currentAction;
      const binding = run ? run.execution_snapshot.binding : currentBinding;
      return <section key={action.id} className={focusedId === action.id ? 'focused' : ''}>
      <button className="edge-action-heading" aria-expanded={focusedId === action.id} onClick={() => onFocus(action.id)}><strong>{action.title}</strong><span>{action.type === 'micro_learning' ? '微学习' : '实践任务'} · {action.estimated_minutes} 分钟 · 难度 {action.difficulty}/5</span></button>
      <p>{run ? ({ selected: '已选择', in_progress: '执行中', completed: '执行完成 · 不等于能力已具备', cancelled: '已取消' } as const)[run.status] : cost.available ? '资源与能力条件已满足' : '当前不可执行'} · 综合成本 {cost.weight}</p>
      {focusedId === action.id ? <><p>{action.description}</p><ul>{cost.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reason.message}{reason.cost ? `（+${reason.cost}）` : ''}</li>)}</ul>
        {binding ? <><h3>项目执行信息</h3><p>{binding.context}</p><p>{binding.instructions}</p>{binding.contact ? <p>联系：{binding.contact}</p> : null}<ul>{binding.resources.map(resource => <li key={resource.key}>{resource.label}：{resource.reference} · {resource.available ? '可用' : '不可用'}</li>)}</ul></> : null}
        <h3>预期证据</h3><p>{action.expected_evidence}</p>
        {!run ? <button className="atlas-primary" disabled={busy || !cost.available} onClick={() => void control.select(action.id)}>选择此行动</button> : null}
        {run?.status === 'selected' ? <><button disabled={busy || !cost.available} onClick={() => void control.select(action.id)}>重新核对并选择</button><button className="atlas-primary" disabled={busy || !cost.available} onClick={() => void start(run)}>开始{action.type === 'micro_learning' ? '微学习' : '实践任务'}</button></> : null}
        {run?.status === 'in_progress' && action.type === 'practice_task' ? <label className="atlas-primary action-result-upload">{uploading ? '正在保存结果…' : '上传实践结果并提交'}<input type="file" accept=".txt,.md,.csv" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void submit(run, file); event.target.value = ''; }}/></label> : null}
        {run?.status === 'in_progress' && action.type === 'micro_learning' ? <><button disabled={busy} onClick={() => void start(run)}>继续微学习</button><button disabled={busy} onClick={() => void control.transition(run.id, 'sync-micro')}>核对微学习完成状态</button><p>微学习沿用既有学习判定规则；此处的行动完成记录不会另行授予能力。</p></> : null}
        {run?.evidence_source_id ? <button disabled={busy} onClick={() => evidence?.open(courseId, run.evidence_source_id!)}>分析结果证据并确认能力</button> : null}
      </> : null}
    </section>; })}
  </aside>;
}
export function branchesForActions(alternatives: ReturnType<typeof actionAlternatives>): ActionBranch[] {
  return alternatives.map(({ action, cost, run }) => ({ id: action.id, edgeId: action.edge_id, title: action.title, status: run && run.status !== 'cancelled' ? run.status : !cost.available ? 'unavailable' : 'candidate' }));
}
