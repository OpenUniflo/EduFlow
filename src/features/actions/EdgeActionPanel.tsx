import { useEffect, useState } from 'react';
import { apiRequest } from '@/shared/api/apiClient';
import { evaluateAction, projectEdgeActions, type CourseActionBinding, type EdgeAction } from './model';
import type { ActionBranch } from '@/features/knowledge/components/actionBranches';
import './edgeActions.css';
export function useEdgeActions(courseId: string, authenticated: boolean) {
  const [data, setData] = useState<{ actions: EdgeAction[]; bindings: CourseActionBinding[] }>({ actions: [], bindings: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setData({ actions: [], bindings: [] }); setError('');
    if (authenticated) apiRequest<typeof data>(`/api/edge-actions?courseId=${encodeURIComponent(courseId)}`).then(value => { if (active) setData(value); }).catch(() => { if (active) setError('行动暂时无法加载，请刷新页面重试。'); });
    return () => { active = false; };
  }, [courseId, authenticated]);
  return { ...data, error };
}
export function actionAlternatives(courseId: string, edge: { id: string; source: string } | undefined, data: { actions: EdgeAction[]; bindings: CourseActionBinding[] }, acquiredIds: ReadonlySet<string>) {
  return projectEdgeActions(new Set(edge ? [edge.id] : []), data.actions, data.bindings, courseId).map(item => ({ ...item, cost: evaluateAction(item.action, { sourceId: edge!.source, acquiredIds, binding: item.binding }) }));
}
export function EdgeActionPanel({ alternatives, title, error, focusedId, selectedId, onChoose, onFocus, onClose }: {
  alternatives: ReturnType<typeof actionAlternatives>; title: string; error: string; focusedId: string | null;
  selectedId: string | null; onChoose(id: string): void; onFocus(id: string): void; onClose(): void;
}) {
  return <aside className="edge-action-panel glass-v2" aria-label="关系行动方案">
    <button className="atlas-panel-close" aria-label="关闭行动方案" onClick={onClose}>×</button>
    <h2>{title}</h2><p>以下行动是推进这条能力关系的替代方案。执行完成后仍需证据与正式能力判断。</p>
    {error ? <p role="alert">{error}</p> : !alternatives.length ? <p>这条关系尚未配置行动。</p> : null}
    {alternatives.map(({ action, binding, cost }) => <section key={action.id} className={focusedId === action.id ? 'focused' : ''}>
      <button className="edge-action-heading" aria-expanded={focusedId === action.id} onClick={() => onFocus(action.id)}><strong>{action.title}</strong><span>{action.type === 'micro_learning' ? '微学习' : '实践任务'} · {action.estimated_minutes} 分钟 · 难度 {action.difficulty}/5</span></button>
      <p>{cost.available ? '资源与能力条件已满足' : '当前不可执行'} · 综合成本 {cost.weight}</p>
      {focusedId === action.id ? <><p>{action.description}</p><ul>{cost.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reason.message}{reason.cost ? `（+${reason.cost}）` : ''}</li>)}</ul>
        {binding ? <><h3>项目执行信息</h3><p>{binding.context}</p><p>{binding.instructions}</p>{binding.contact ? <p>联系：{binding.contact}</p> : null}<ul>{binding.resources.map(resource => <li key={resource.key}>{resource.label}：{resource.reference} · {resource.available ? '可用' : '不可用'}</li>)}</ul></> : null}
        <h3>预期证据</h3><p>{action.expected_evidence}</p><button className="atlas-primary" disabled={!cost.available} aria-pressed={selectedId === action.id} onClick={() => onChoose(action.id)}>{selectedId === action.id ? '已选择此行动' : '选择此行动'}</button></> : null}
    </section>)}
  </aside>;
}
export function branchesForActions(alternatives: ReturnType<typeof actionAlternatives>, selectedId: string | null = null): ActionBranch[] {
  return alternatives.map(({ action, cost }) => ({ id: action.id, edgeId: action.edge_id, title: action.title, status: !cost.available ? 'unavailable' : action.id === selectedId ? 'selected' : 'candidate' }));
}
