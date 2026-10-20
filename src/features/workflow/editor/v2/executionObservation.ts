import type { WorkflowRunV2, WorkflowThreadV2 } from '../../domain/v2/types';

export const runStatusLabels: Record<string, string> = {
  queued: '排队中', running: '运行中', waiting: '等待回应', continued: '已继续执行',
  prepared: '结果已暂存', success: '已完成', failed: '执行失败', cancelled: '已取消',
};
const ended = new Set(['success', 'failed', 'cancelled', 'continued']);

/** A lifecycle Thread being closed does not prove that its Run succeeded. */
export function executionObservation(run: WorkflowRunV2 | null | undefined, candidate: WorkflowThreadV2 | null | undefined, historyExpired = false, observedRunId?: string | null) {
  const thread = candidate && (!run || candidate.currentRunId === run.runId) ? candidate : null;
  let phase = run?.status ?? 'idle';
  if (!run || !ended.has(run.status)) {
    if (thread?.status === 'waiting') phase = 'waiting';
    else if (!run && thread?.status === 'active') phase = 'running';
    else if (!run && thread) phase = thread.status === 'expired' || thread.lastError?.code === 'WAIT_EXPIRED' ? 'expired' : thread.lastError?.code === 'RUN_CANCELLED' ? 'cancelled' : thread.lastError ? 'failed' : 'ended';
    else if (!run && historyExpired) phase = 'cleared';
    else if (!run && observedRunId) phase = 'loading';
  }
  const label = phase === 'expired' || run?.status === 'failed' && run.error?.code === 'WAIT_EXPIRED' ? '等待已到期'
    : runStatusLabels[phase] ?? ({ended: historyExpired ? '运行已结束，详细结果已清理' : '运行已结束，正在确认结果', cleared:'历史日志已清理', loading:'正在读取运行状态', idle:'就绪'}[phase] ?? '正在读取运行状态');
  const revision = run?.revision ?? thread?.revision;
  const terminal = ended.has(phase) || ['expired','ended','cleared'].includes(phase);
  return { phase, label, revision, terminal, banner: `${terminal ? `${label} · 运行记录` : label}${revision === undefined ? '' : ` · 流程版本 ${revision}`}` };
}
