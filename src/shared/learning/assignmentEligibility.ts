import { satisfiesTeachingPrerequisite } from './teachingPrerequisites.js';

/** Same instructional rule in UI and API; server-supplied facts are authoritative. */
export function assignmentEligibility(input: {
  published: boolean; coverageValid: boolean; knowledgeStatuses: Array<string | undefined>;
  hardDependencyStatuses: Array<string | undefined>; status?: string;
}) {
  const status = input.status ?? 'not_started';
  const complete = ['accepted', 'completed'].includes(status);
  const viewOnly = complete || status === 'submitted';
  const knowledgeReady = input.coverageValid && input.knowledgeStatuses.length > 0 && input.knowledgeStatuses.every(satisfiesTeachingPrerequisite);
  // Workflow completion is an execution report; only server-evaluated acceptance unlocks hard dependencies.
  const dependenciesReady = input.hardDependencyStatuses.every(value => value === 'accepted');
  const reason = !input.published ? '课程尚未发布，暂时不能开始实训。' : !knowledgeReady ? '请先完成关联知识的学习。' : !dependenciesReady ? '请先完成并通过前置实训。' : null;
  const canStart = !reason && ['not_started', 'not-started', 'started', 'in-progress', 'needs_revision'].includes(status);
  const canSubmit = !reason && ['started', 'in-progress', 'needs_revision'].includes(status);
  const cta = complete ? '查看结果' : status === 'submitted' ? '查看提交' : status === 'needs_revision' ? '继续修改' : ['started','in-progress'].includes(status) ? '继续实训' : '开始实训';
  return { knowledgeReady, dependenciesReady, canStart, canSubmit, viewOnly, cta, reason };
}
