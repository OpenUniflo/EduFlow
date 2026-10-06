import { useState } from 'react';
import { Link } from 'react-router-dom';
import { actionAlternatives, EdgeActionPanel, type useEdgeActions } from './EdgeActionPanel';
import type { ActionRun } from './model';
import { useEvidenceWorkspace } from '@/features/evidence/EvidenceWorkspace';

/** History is scoped by owned runs, never by today's route or active templates. */
export function ActionRunHistory({ runs, control, courseId, acquiredIds, title, visibleEdgeIds }: {
  runs: ActionRun[]; control: ReturnType<typeof useEdgeActions>; courseId: string; acquiredIds: ReadonlySet<string>;
  title(id: string): string; visibleEdgeIds: ReadonlySet<string>;
}) {
  const [focusedAction, setFocusedAction] = useState<string | null>(null);
  const evidence = useEvidenceWorkspace();
  if (!runs.length) return null;
  return <details className="atlas-drawer-section action-run-history"><summary>行动记录 · {runs.length}</summary>{runs.map(run => <article className="knowledge-action-history" key={run.id}>
    <strong>{run.execution_snapshot.action.title}</strong><p>{run.node_id?`根能力：${title(run.node_id)}`:`${title(run.execution_snapshot.sourceId!)} → ${title(run.execution_snapshot.targetId)}`}</p>
    <small>{{selected:'已选择',in_progress:'执行中',completed:'执行完成',cancelled:'已取消'}[run.status]} · {new Date(run.created_at).toLocaleString()}</small>
    {run.edge_id && !visibleEdgeIds.has(run.edge_id) ? <p>该关系不在当前视图中，记录仍保留。</p> : null}
    {['selected','in_progress'].includes(run.status) ? control.continuableRunIds?.includes(run.id) ? <button className="atlas-secondary" disabled={control.busy} onClick={() => void control.start(run)}>继续当前行动</button> : <p>当前执行条件已变化，记录保留；可刷新条件或选择其他行动。</p> : null}
    {run.status === 'completed' && run.assignment_id ? <Link to={`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(run.assignment_id)}?actionRunId=${encodeURIComponent(run.id)}`}>查看实践结果</Link> : null}
    {run.evidence_source_id ? <button className="atlas-secondary" onClick={() => evidence?.open(courseId, run.evidence_source_id!)}>查看结果证据</button> : null}
    {run.status === 'completed' ? <EdgeActionPanel embedded title="再次实践" alternatives={actionAlternatives(courseId, run.node_id?{nodeId:run.node_id}:{id:run.edge_id!,source:run.execution_snapshot.sourceId!}, {...control,runs:[run]}, acquiredIds).filter(item => item.action.id === run.action_id)} control={control} courseId={courseId} focusedId={focusedAction} onFocus={setFocusedAction}/> : null}
  </article>)}</details>;
}
